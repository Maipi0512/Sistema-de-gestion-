import React, { useEffect, useState } from 'react';

const PRODUCTO_VACIO = {
  codigo: '',
  nombre: '',
  descripcion: '',
  precio_costo: '',
  precio_venta: '',
  unidad_medida: 'unidad',
  stock_inicial: '',
  stock_minimo: '',
};

export default function Productos() {
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState(PRODUCTO_VACIO);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState('');

  const cargarProductos = (filtro = '') => {
    window.api.productos.listar(filtro).then(setProductos);
  };

  useEffect(() => {
    cargarProductos();
  }, []);

  const handleBuscar = (e) => {
    const valor = e.target.value;
    setBusqueda(valor);
    cargarProductos(valor);
  };

  const handleCambio = (campo) => (e) => {
    setForm({ ...form, [campo]: e.target.value });
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await window.api.productos.crear({
        ...form,
        precio_costo: parseFloat(form.precio_costo) || 0,
        precio_venta: parseFloat(form.precio_venta),
        stock_inicial: parseFloat(form.stock_inicial) || 0,
        stock_minimo: parseFloat(form.stock_minimo) || 0,
      });
      setForm(PRODUCTO_VACIO);
      setMostrarForm(false);
      cargarProductos(busqueda);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h2>Productos</h2>

      <div className="barra-acciones">
        <input
          type="text"
          placeholder="Buscar por nombre o código..."
          value={busqueda}
          onChange={handleBuscar}
        />
        <button onClick={() => setMostrarForm(!mostrarForm)}>
          {mostrarForm ? 'Cancelar' : '+ Nuevo producto'}
        </button>
        <button onClick={() => window.api.export.productos()}>Exportar a Excel</button>
      </div>

      {mostrarForm && (
        <form className="tarjeta" onSubmit={handleGuardar}>
          {error && <p className="error">{error}</p>}
          <div className="fila-form">
            <label>
              Nombre *
              <input required value={form.nombre} onChange={handleCambio('nombre')} />
            </label>
            <label>
              Código
              <input value={form.codigo} onChange={handleCambio('codigo')} />
            </label>
          </div>
          <div className="fila-form">
            <label>
              Precio costo
              <input type="number" step="0.01" value={form.precio_costo} onChange={handleCambio('precio_costo')} />
            </label>
            <label>
              Precio venta *
              <input required type="number" step="0.01" value={form.precio_venta} onChange={handleCambio('precio_venta')} />
            </label>
          </div>
          <div className="fila-form">
            <label>
              Stock inicial
              <input type="number" step="0.01" value={form.stock_inicial} onChange={handleCambio('stock_inicial')} />
            </label>
            <label>
              Stock mínimo (alerta)
              <input type="number" step="0.01" value={form.stock_minimo} onChange={handleCambio('stock_minimo')} />
            </label>
          </div>
          <label>
            Unidad de medida
            <select value={form.unidad_medida} onChange={handleCambio('unidad_medida')}>
              <option value="unidad">Unidad</option>
              <option value="metro">Metro</option>
              <option value="rollo">Rollo</option>
              <option value="paquete">Paquete</option>
            </select>
          </label>
          <button type="submit">Guardar producto</button>
        </form>
      )}

      <table className="tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Código</th>
            <th>Precio venta</th>
            <th>Stock</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <tr key={p.id}>
              <td>{p.nombre}</td>
              <td>{p.codigo || '-'}</td>
              <td>${Number(p.precio_venta).toFixed(2)}</td>
              <td className={Number(p.stock_actual) <= Number(p.stock_minimo) ? 'stock-bajo' : ''}>
                {p.stock_actual} {p.unidad_medida}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
