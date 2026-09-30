import React, { useEffect, useState } from 'react';

// Bolsita (retiro Mer): la plata que se saca de la caja entra como
// ingreso sola, desde Caja, al marcar el egreso "a la bolsita". Acá se
// cargan a mano los gastos que se pagan con esa plata (egresos) y, si
// hace falta, algún ingreso que no pasó por la caja. Solo para admin.
export default function Planilla({ usuarioActual }) {
  const [movimientos, setMovimientos] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [tipo, setTipo] = useState('egreso');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [error, setError] = useState('');

  const cargar = async () => {
    const lista = await window.api.planilla.listar(usuarioActual?.id ?? null);
    setMovimientos(lista);
    setCargando(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const handleGuardar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await window.api.planilla.registrarMovimiento(tipo, parseFloat(monto), concepto, usuarioActual?.id ?? null);
      setMonto('');
      setConcepto('');
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  if (cargando) return <p>Cargando...</p>;

  const totalIngresos = movimientos.filter((m) => m.tipo === 'ingreso').reduce((acc, m) => acc + Number(m.monto), 0);
  const totalEgresos = movimientos.filter((m) => m.tipo === 'egreso').reduce((acc, m) => acc + Number(m.monto), 0);
  const saldo = totalIngresos - totalEgresos;

  return (
    <div>
      <h2>Bolsita (retiro Mer)</h2>

      <div className="barra-acciones">
        <button onClick={() => window.api.export.planilla(usuarioActual?.id ?? null)}>Exportar a Excel</button>
      </div>

      <div className="tarjeta">
        <p>Ingresos: ${totalIngresos.toFixed(2)} — Egresos: ${totalEgresos.toFixed(2)}</p>
        <p className="total">Saldo: ${saldo.toFixed(2)}</p>
        <p className="nota">
          Los retiros se cargan solos desde Caja: al registrar un egreso, elegí
          "A la bolsita" en "¿A dónde va la plata?".
        </p>
      </div>

      <form className="tarjeta" onSubmit={handleGuardar}>
        <h3>Cargar movimiento a mano</h3>
        {error && <p className="error">{error}</p>}
        <div className="fila-form">
          <label>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="egreso">Egreso (gasto pagado con esta plata)</option>
              <option value="ingreso">Ingreso (plata que no salió de la caja)</option>
            </select>
          </label>
          <label>
            Monto
            <input type="number" step="0.01" required value={monto} onChange={(e) => setMonto(e.target.value)} />
          </label>
        </div>
        <label>
          Concepto (ej: "Pago a proveedor", "Depósito en el banco")
          <input required value={concepto} onChange={(e) => setConcepto(e.target.value)} />
        </label>
        <button type="submit">Registrar movimiento</button>
      </form>

      <section className="tarjeta">
        <h3>Movimientos</h3>
        {movimientos.length === 0 ? (
          <p className="nota">Todavía no hay movimientos en la bolsita.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th>Origen</th>
                <th>Ingreso</th>
                <th>Egreso</th>
                <th>Saldo</th>
                <th>Registrado por</th>
              </tr>
            </thead>
            <tbody>
              {/* El saldo de cada renglón viene calculado en orden
                  cronológico; se muestra lo más nuevo arriba. */}
              {[...movimientos].reverse().map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.creado_en).toLocaleString('es-AR', { hour12: false })}</td>
                  <td>{m.concepto}</td>
                  <td>{m.movimiento_caja_id ? 'Retiro de caja' : 'Carga manual'}</td>
                  <td>{m.tipo === 'ingreso' ? `$${Number(m.monto).toFixed(2)}` : ''}</td>
                  <td className={m.tipo === 'egreso' ? 'stock-bajo' : ''}>
                    {m.tipo === 'egreso' ? `$${Number(m.monto).toFixed(2)}` : ''}
                  </td>
                  <td>${Number(m.saldo).toFixed(2)}</td>
                  <td>{m.usuario_nombre || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
