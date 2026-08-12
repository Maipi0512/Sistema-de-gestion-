import React, { useEffect, useState } from 'react';

export default function Caja() {
  const [caja, setCaja] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [montoApertura, setMontoApertura] = useState('');
  const [montoContado, setMontoContado] = useState('');
  const [resumen, setResumen] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [mensaje, setMensaje] = useState('');
  const [historialSesiones, setHistorialSesiones] = useState([]);

  // Formulario de nuevo movimiento (retiro, pago de servicio, ingreso)
  const [tipoMov, setTipoMov] = useState('egreso');
  const [montoMov, setMontoMov] = useState('');
  const [conceptoMov, setConceptoMov] = useState('');
  const [errorMov, setErrorMov] = useState('');

  const cargarTodo = async () => {
    const actual = await window.api.caja.actual();
    setCaja(actual);
    if (actual) {
      const [r, movs] = await Promise.all([
        window.api.caja.resumen(actual.id),
        window.api.caja.listarMovimientos(actual.id),
      ]);
      setResumen(r);
      setMovimientos(movs);
    }
    const sesiones = await window.api.caja.listarSesiones();
    setHistorialSesiones(sesiones);
    setCargando(false);
  };

  useEffect(() => {
    cargarTodo();
  }, []);

  const handleAbrir = async (e) => {
    e.preventDefault();
    setMensaje('');
    try {
      await window.api.caja.abrir(parseFloat(montoApertura) || 0);
      setMontoApertura('');
      cargarTodo();
    } catch (err) {
      setMensaje(`Error: ${err.message}`);
    }
  };

  const handleCerrar = async (e) => {
    e.preventDefault();
    setMensaje('');
    try {
      const cerrada = await window.api.caja.cerrar(caja.id, parseFloat(montoContado) || 0);
      const dif = Number(cerrada.diferencia);
      setMensaje(
        dif === 0
          ? 'Caja cerrada. Cuadró perfecto 🎉'
          : dif > 0
          ? `Caja cerrada. Sobraron $${dif.toFixed(2)} respecto a lo esperado.`
          : `Caja cerrada. Faltaron $${Math.abs(dif).toFixed(2)} respecto a lo esperado.`
      );
      setMontoContado('');
      cargarTodo();
    } catch (err) {
      setMensaje(`Error: ${err.message}`);
    }
  };

  const handleMovimiento = async (e) => {
    e.preventDefault();
    setErrorMov('');
    try {
      await window.api.caja.registrarMovimiento(caja.id, tipoMov, parseFloat(montoMov), conceptoMov);
      setMontoMov('');
      setConceptoMov('');
      cargarTodo();
    } catch (err) {
      setErrorMov(err.message);
    }
  };

  if (cargando) return <p>Cargando...</p>;

  return (
    <div>
      <h2>Control de caja</h2>

      {!caja && (
        <form className="tarjeta" onSubmit={handleAbrir}>
          <h3>Abrir caja</h3>
          <label>
            Monto inicial en efectivo
            <input type="number" step="0.01" required value={montoApertura} onChange={(e) => setMontoApertura(e.target.value)} />
          </label>
          <button type="submit">Abrir caja</button>
        </form>
      )}

      {caja && (
        <>
          <div className="tarjeta">
            <h3>Caja abierta desde {new Date(caja.fecha_apertura).toLocaleString('es-AR', { hour12: false })}</h3>
            <p>Monto de apertura: ${Number(caja.monto_apertura).toFixed(2)}</p>

            {resumen && (
              <>
                {/* La caja es plata física: acá solo entra lo cobrado en efectivo.
                    Transferencias, débito, crédito y Mercado Pago no pasan por
                    el cajón, así que se ven en el Historial de ventas, no acá. */}
                <p>
                  Ventas en efectivo: ${resumen.totalEfectivo.toFixed(2)}
                  {' '}({resumen.porMetodo.efectivo ? resumen.porMetodo.efectivo.cantidad : 0} ventas)
                </p>
                <p>Ingresos manuales: ${resumen.totalIngresos.toFixed(2)} — Egresos manuales (retiros, pagos): ${resumen.totalEgresos.toFixed(2)}</p>
                <p>
                  <strong>
                    Efectivo esperado en caja: $
                    {(Number(caja.monto_apertura) + resumen.totalEfectivo + resumen.totalIngresos - resumen.totalEgresos).toFixed(2)}
                  </strong>
                  {' '}(apertura + ventas en efectivo + ingresos − egresos)
                </p>
                <p className="nota">
                  Lo cobrado por transferencia, débito, crédito o Mercado Pago no se
                  cuenta acá porque no queda plata en el cajón. Está en el Historial de ventas.
                </p>
                {resumen.porMetodo.cuenta_corriente && (
                  <p>
                    Vendido a cuenta corriente (fiado) en este turno: $
                    {resumen.porMetodo.cuenta_corriente.total.toFixed(2)}
                    {' '}({resumen.porMetodo.cuenta_corriente.cantidad} ventas)
                    <br />
                    <span className="nota">
                      Informativo: tampoco es plata en el cajón. Cuando el cliente pague la
                      deuda, ese cobro se registra desde Clientes.
                    </span>
                  </p>
                )}
              </>
            )}
          </div>

          <div className="tarjeta">
            <h3>Registrar movimiento (retiro, pago de servicio, ingreso extra)</h3>
            <form onSubmit={handleMovimiento}>
              {errorMov && <p className="error">{errorMov}</p>}
              <div className="fila-form">
                <label>
                  Tipo
                  <select value={tipoMov} onChange={(e) => setTipoMov(e.target.value)}>
                    <option value="egreso">Egreso (retiro / pago de servicio)</option>
                    <option value="ingreso">Ingreso extra</option>
                  </select>
                </label>
                <label>
                  Monto
                  <input type="number" step="0.01" required value={montoMov} onChange={(e) => setMontoMov(e.target.value)} />
                </label>
              </div>
              <label>
                Concepto (ej: "Pago de luz", "Retiro para el banco")
                <input required value={conceptoMov} onChange={(e) => setConceptoMov(e.target.value)} />
              </label>
              <button type="submit">Registrar movimiento</button>
            </form>

            {movimientos.length > 0 && (
              <table className="tabla" style={{ marginTop: 12 }}>
                <thead><tr><th>Hora</th><th>Tipo</th><th>Concepto</th><th>Monto</th></tr></thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.creado_en).toLocaleTimeString('es-AR', { hour12: false })}</td>
                      <td>{m.tipo === 'egreso' ? 'Egreso' : 'Ingreso'}</td>
                      <td>{m.concepto}</td>
                      <td className={m.tipo === 'egreso' ? 'stock-bajo' : ''}>${Number(m.monto).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <form className="tarjeta" onSubmit={handleCerrar}>
            <h3>Cerrar caja</h3>
            <label>
              Efectivo contado físicamente
              <input type="number" step="0.01" required value={montoContado} onChange={(e) => setMontoContado(e.target.value)} />
            </label>
            <button type="submit">Cerrar caja</button>
          </form>
        </>
      )}

      {mensaje && <p className="tarjeta">{mensaje}</p>}

      <section className="tarjeta">
        <h3>Historial de cajas</h3>
        <table className="tabla">
          <thead>
            <tr><th>Apertura</th><th>Cierre</th><th>Monto apertura</th><th>Esperado</th><th>Contado</th><th>Diferencia</th></tr>
          </thead>
          <tbody>
            {historialSesiones.map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.fecha_apertura).toLocaleString('es-AR', { hour12: false })}</td>
                <td>{s.fecha_cierre ? new Date(s.fecha_cierre).toLocaleString('es-AR', { hour12: false }) : '—'}</td>
                <td>${Number(s.monto_apertura).toFixed(2)}</td>
                <td>{s.monto_esperado != null ? `$${Number(s.monto_esperado).toFixed(2)}` : '—'}</td>
                <td>{s.monto_contado != null ? `$${Number(s.monto_contado).toFixed(2)}` : '—'}</td>
                <td className={s.diferencia && s.diferencia !== 0 ? 'stock-bajo' : ''}>
                  {s.diferencia != null ? `$${Number(s.diferencia).toFixed(2)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
