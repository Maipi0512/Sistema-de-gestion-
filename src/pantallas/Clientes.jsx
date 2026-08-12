import React, { useEffect, useState } from 'react';

const CLIENTE_VACIO = { nombre: '', telefono: '', notas: '' };

const ETIQUETA_METODO_PAGO = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
  mercado_pago: 'Mercado Pago',
};

export default function Clientes({ usuarioActual }) {
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState(CLIENTE_VACIO);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [error, setError] = useState('');

  // Cuenta corriente del cliente que está expandido en la tabla.
  const [cuentaAbierta, setCuentaAbierta] = useState(null); // { ...cliente, movimientos: [] }
  const [montoAbono, setMontoAbono] = useState('');
  const [metodoAbono, setMetodoAbono] = useState('efectivo');
  const [notasAbono, setNotasAbono] = useState('');
  const [errorAbono, setErrorAbono] = useState('');
  const [guardandoAbono, setGuardandoAbono] = useState(false);

  const cargarClientes = (filtro = '') => {
    window.api.clientes.listar(filtro).then(setClientes);
  };

  useEffect(() => {
    cargarClientes();
  }, []);

  const handleBuscar = (e) => {
    const valor = e.target.value;
    setBusqueda(valor);
    cargarClientes(valor);
  };

  const cancelarForm = () => {
    setForm(CLIENTE_VACIO);
    setEditandoId(null);
    setMostrarForm(false);
    setError('');
  };

  const handleNuevoCliente = () => {
    if (mostrarForm) {
      cancelarForm();
    } else {
      setMostrarForm(true);
    }
  };

  const handleEditar = (cliente) => {
    setEditandoId(cliente.id);
    setForm({
      nombre: cliente.nombre || '',
      telefono: cliente.telefono || '',
      notas: cliente.notas || '',
    });
    setError('');
    setMostrarForm(true);
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const datos = {
        nombre: form.nombre,
        telefono: form.telefono || null,
        notas: form.notas || null,
      };
      if (editandoId) {
        await window.api.clientes.actualizar(editandoId, datos);
      } else {
        await window.api.clientes.crear(datos);
      }
      cancelarForm();
      cargarClientes(busqueda);
    } catch (err) {
      setError(err.message);
    }
  };

  const salirDeCuenta = () => {
    setCuentaAbierta(null);
    setMontoAbono('');
    setNotasAbono('');
    setErrorAbono('');
  };

  const verCuenta = async (cliente) => {
    if (cuentaAbierta?.id === cliente.id) {
      salirDeCuenta();
      return;
    }
    setErrorAbono('');
    const movimientos = await window.api.clientes.listarMovimientos(cliente.id);
    setCuentaAbierta({ ...cliente, movimientos });
  };

  const recargarCuenta = async (clienteId) => {
    const [cliente, movimientos] = await Promise.all([
      window.api.clientes.obtener(clienteId),
      window.api.clientes.listarMovimientos(clienteId),
    ]);
    setCuentaAbierta({ ...cliente, movimientos });
    cargarClientes(busqueda);
  };

  const handleRegistrarAbono = async (e) => {
    e.preventDefault();
    setErrorAbono('');
    setGuardandoAbono(true);
    try {
      await window.api.clientes.registrarPago(
        cuentaAbierta.id,
        parseFloat(montoAbono),
        metodoAbono,
        notasAbono,
        usuarioActual?.id ?? null
      );
      setMontoAbono('');
      setNotasAbono('');
      await recargarCuenta(cuentaAbierta.id);
    } catch (err) {
      setErrorAbono(err.message);
    } finally {
      setGuardandoAbono(false);
    }
  };

  return (
    <div>
      <h2>Clientes — Cuenta corriente</h2>

      <div className="barra-acciones">
        <input
          type="text"
          placeholder="Buscar por nombre o teléfono..."
          value={busqueda}
          onChange={handleBuscar}
        />
        <button onClick={handleNuevoCliente}>
          {mostrarForm ? 'Cancelar' : '+ Nuevo cliente'}
        </button>
      </div>

      {mostrarForm && (
        <form className="tarjeta" onSubmit={handleGuardar}>
          {error && <p className="error">{error}</p>}
          <h3>{editandoId ? 'Editar cliente' : 'Nuevo cliente'}</h3>
          <div className="fila-form">
            <label>
              Nombre *
              <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </label>
            <label>
              Teléfono
              <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </label>
          </div>
          <label>
            Notas
            <input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </label>
          <button type="submit">{editandoId ? 'Guardar cambios' : 'Guardar cliente'}</button>
        </form>
      )}

      <table className="tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Teléfono</th>
            <th>Saldo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {clientes.map((c) => (
            <React.Fragment key={c.id}>
              <tr>
                <td>{c.nombre}</td>
                <td>{c.telefono || '-'}</td>
                <td className={Number(c.saldo) > 0 ? 'stock-bajo' : ''}>
                  ${Number(c.saldo).toFixed(2)}
                </td>
                <td>
                  <button onClick={() => verCuenta(c)}>
                    {cuentaAbierta?.id === c.id ? 'Ocultar' : 'Ver cuenta'}
                  </button>{' '}
                  <button onClick={() => handleEditar(c)}>Editar</button>
                </td>
              </tr>
              {cuentaAbierta?.id === c.id && (
                <tr>
                  <td colSpan={4}>
                    <p>
                      Saldo actual: <strong className={Number(cuentaAbierta.saldo) > 0 ? 'stock-bajo' : ''}>
                        ${Number(cuentaAbierta.saldo).toFixed(2)}
                      </strong>
                      {Number(cuentaAbierta.saldo) <= 0 && ' — sin deuda'}
                    </p>

                    <form className="fila-form" onSubmit={handleRegistrarAbono} style={{ alignItems: 'flex-end' }}>
                      <label>
                        Registrar abono
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                          style={{ width: 120 }}
                          value={montoAbono}
                          onChange={(e) => setMontoAbono(e.target.value)}
                        />
                      </label>
                      <label>
                        Cobrado con
                        <select value={metodoAbono} onChange={(e) => setMetodoAbono(e.target.value)}>
                          {Object.entries(ETIQUETA_METODO_PAGO).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Notas (opcional)
                        <input
                          style={{ width: 200 }}
                          value={notasAbono}
                          onChange={(e) => setNotasAbono(e.target.value)}
                        />
                      </label>
                      <button type="submit" disabled={guardandoAbono}>
                        {guardandoAbono ? 'Guardando...' : 'Registrar abono'}
                      </button>
                    </form>
                    {errorAbono && <p className="error">Error: {errorAbono}</p>}
                    <p className="nota">
                      Un abono en efectivo se suma como ingreso en la caja abierta, si hay una.
                    </p>

                    <table className="tabla">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Tipo</th>
                          <th>Monto</th>
                          <th>Con qué</th>
                          <th>Notas</th>
                          <th>Registrado por</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cuentaAbierta.movimientos.length === 0 && (
                          <tr><td colSpan={6}>Todavía no hay movimientos.</td></tr>
                        )}
                        {cuentaAbierta.movimientos.map((m) => (
                          <tr key={m.id}>
                            <td>{new Date(m.creado_en).toLocaleString('es-AR', { hour12: false })}</td>
                            <td>{m.tipo === 'cargo' ? 'Cargo (venta a cuenta)' : 'Pago (abono)'}</td>
                            <td className={m.tipo === 'cargo' ? 'stock-bajo' : ''}>
                              {m.tipo === 'cargo' ? '+' : '−'}${Number(m.monto).toFixed(2)}
                            </td>
                            <td>{m.metodo_pago ? ETIQUETA_METODO_PAGO[m.metodo_pago] || m.metodo_pago : '-'}</td>
                            <td>{m.notas || '-'}</td>
                            <td>{m.usuario_nombre || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
