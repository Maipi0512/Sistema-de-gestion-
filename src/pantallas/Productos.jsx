import React, { useEffect, useState } from 'react';

const CATEGORIAS_CONOCIDAS = ['Mercería', 'Bijou', 'Indumentaria', 'Extras', 'Lanas', 'Repuestos Singer'];

const PRODUCTO_VACIO = {
  codigo: '',
  nombre: '',
  descripcion: '',
  categoria: '',
  precio_costo: '',
  precio_venta: '',
  precio_paquete: '',
  unidades_por_paquete: '',
  unidad_medida: 'unidad',
  stock_inicial: '',
  stock_minimo: '',
};

export default function Productos({ usuarioActual }) {
  const puedeEditar = usuarioActual?.rol === 'admin' || !!usuarioActual?.puede_editar_productos;
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState(PRODUCTO_VACIO);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [coloresForm, setColoresForm] = useState([]);
  const [colorInput, setColorInput] = useState('');
  const [coloresSugeridos, setColoresSugeridos] = useState([]);
  const [sumaStock, setSumaStock] = useState({});

  const cargarProductos = (filtro = '') => {
    window.api.productos.listar(filtro).then(setProductos);
  };

  const cargarColoresSugeridos = () => {
    window.api.productos.coloresDistintos().then(setColoresSugeridos);
  };

  useEffect(() => {
    cargarProductos();
    cargarColoresSugeridos();
  }, []);

  const handleBuscar = (e) => {
    const valor = e.target.value;
    setBusqueda(valor);
    cargarProductos(valor);
  };

  const handleCambio = (campo) => (e) => {
    setForm({ ...form, [campo]: e.target.value });
  };

  const cancelarForm = () => {
    setForm(PRODUCTO_VACIO);
    setColoresForm([]);
    setColorInput('');
    setEditandoId(null);
    setMostrarForm(false);
    setError('');
  };

  const handleNuevoProducto = () => {
    if (mostrarForm) {
      cancelarForm();
    } else {
      setMostrarForm(true);
    }
  };

  const handleEditar = (producto) => {
    setEditandoId(producto.id);
    setForm({
      codigo: producto.codigo || '',
      nombre: producto.nombre || '',
      descripcion: producto.descripcion || '',
      categoria: producto.categoria || '',
      precio_costo: producto.precio_costo ?? '',
      precio_venta: producto.precio_venta ?? '',
      precio_paquete: producto.precio_paquete ?? '',
      unidades_por_paquete: producto.unidades_por_paquete ?? '',
      unidad_medida: producto.unidad_medida || 'unidad',
      stock_inicial: '',
      stock_minimo: producto.stock_minimo ?? '',
    });
    setColoresForm(producto.colores || []);
    setError('');
    setMostrarForm(true);
  };

  const handleAgregarColor = async () => {
    const color = colorInput.trim();
    if (!color || coloresForm.some((c) => c.color === color)) {
      setColorInput('');
      return;
    }
    if (editandoId) {
      await window.api.productos.agregarColor(editandoId, color);
    }
    setColoresForm([...coloresForm, { color, stock: 0 }]);
    setColorInput('');
  };

  const handleQuitarColor = async (color) => {
    if (editandoId) {
      await window.api.productos.eliminarColor(editandoId, color);
    }
    setColoresForm(coloresForm.filter((c) => c.color !== color));
  };

  const handleSumarStockColorForm = async (color) => {
    const clave = `form-${color}`;
    const cantidad = parseFloat(sumaStock[clave]);
    if (!cantidad || !editandoId) return;
    await window.api.productos.sumarStockColor(editandoId, color, cantidad);
    setColoresForm(coloresForm.map((c) => (c.color === color ? { ...c, stock: Number(c.stock) + cantidad } : c)));
    setSumaStock({ ...sumaStock, [clave]: '' });
  };

  const handleCambioSumaStock = (id) => (e) => {
    setSumaStock({ ...sumaStock, [id]: e.target.value });
  };

  const handleSumarStock = async (id) => {
    const cantidad = parseFloat(sumaStock[id]);
    if (!cantidad) return;
    await window.api.productos.ajustarStock(id, cantidad, 'ajuste_manual', 'Carga de stock');
    setSumaStock({ ...sumaStock, [id]: '' });
    cargarProductos(busqueda);
  };

  const handleSumarStockColor = async (id, color) => {
    const clave = `${id}-${color}`;
    const cantidad = parseFloat(sumaStock[clave]);
    if (!cantidad) return;
    await window.api.productos.sumarStockColor(id, color, cantidad);
    setSumaStock({ ...sumaStock, [clave]: '' });
    cargarProductos(busqueda);
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const cambiosComunes = {
        codigo: form.codigo || null,
        nombre: form.nombre,
        descripcion: form.descripcion || null,
        categoria: form.categoria || null,
        precio_costo: parseFloat(form.precio_costo) || 0,
        precio_venta: parseFloat(form.precio_venta),
        precio_paquete: form.precio_paquete ? parseFloat(form.precio_paquete) : null,
        unidades_por_paquete: form.unidades_por_paquete ? parseFloat(form.unidades_por_paquete) : null,
        unidad_medida: form.unidad_medida,
        stock_minimo: parseFloat(form.stock_minimo) || 0,
      };

      if (editandoId) {
        await window.api.productos.actualizar(editandoId, cambiosComunes);
      } else {
        const nuevo = await window.api.productos.crear({
          ...cambiosComunes,
          stock_inicial: parseFloat(form.stock_inicial) || 0,
        });
        for (const c of coloresForm) {
          await window.api.productos.agregarColor(nuevo.id, c.color);
        }
      }

      cancelarForm();
      cargarProductos(busqueda);
      cargarColoresSugeridos();
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
        {puedeEditar && (
          <button onClick={handleNuevoProducto}>
            {mostrarForm ? 'Cancelar' : '+ Nuevo producto'}
          </button>
        )}
        <button onClick={() => window.api.export.productos()}>Exportar a Excel</button>
      </div>

      {!puedeEditar && (
        <p className="tarjeta">No tenés permiso para crear o editar productos. Pedile a un administrador que te lo habilite desde Vendedores.</p>
      )}

      {puedeEditar && mostrarForm && (
        <form className="tarjeta" onSubmit={handleGuardar}>
          {error && <p className="error">{error}</p>}
          <h3>{editandoId ? 'Editar producto' : 'Nuevo producto'}</h3>
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
              Categoría
              <input list="categorias-conocidas" value={form.categoria} onChange={handleCambio('categoria')} />
              <datalist id="categorias-conocidas">
                {CATEGORIAS_CONOCIDAS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="fila-form">
            <label>
              Precio costo
              <input type="number" step="0.01" value={form.precio_costo} onChange={handleCambio('precio_costo')} />
            </label>
            <label>
              Precio venta (por unidad) *
              <input required type="number" step="0.01" value={form.precio_venta} onChange={handleCambio('precio_venta')} />
            </label>
          </div>
          <div className="fila-form">
            <label>
              Precio por paquete (opcional)
              <input type="number" step="0.01" value={form.precio_paquete} onChange={handleCambio('precio_paquete')} />
            </label>
            <label>
              Unidades por paquete
              <input type="number" step="0.01" value={form.unidades_por_paquete} onChange={handleCambio('unidades_por_paquete')} />
            </label>
          </div>
          {!editandoId && (
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
          )}
          {editandoId && (
            <label>
              Stock mínimo (alerta)
              <input type="number" step="0.01" value={form.stock_minimo} onChange={handleCambio('stock_minimo')} />
            </label>
          )}
          <label>
            Unidad de medida
            <select value={form.unidad_medida} onChange={handleCambio('unidad_medida')}>
              <option value="unidad">Unidad</option>
              <option value="metro">Metro</option>
              <option value="rollo">Rollo</option>
              <option value="paquete">Paquete</option>
            </select>
          </label>
          <label>
            Descripción
            <input value={form.descripcion} onChange={handleCambio('descripcion')} />
          </label>

          <label>Colores (opcional)</label>
          <div className="fila-form">
            <input
              list="colores-sugeridos"
              placeholder="Ej: Rojo, Celeste..."
              value={colorInput}
              onChange={(e) => setColorInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAgregarColor();
                }
              }}
            />
            <datalist id="colores-sugeridos">
              {coloresSugeridos.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <button type="button" onClick={handleAgregarColor}>Agregar color</button>
          </div>
          {coloresForm.length > 0 && (
            <div className="chips">
              {coloresForm.map((c) => (
                <span key={c.color} className="chip">
                  {c.color} ({c.stock}){' '}
                  {editandoId && (
                    <>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="sumar"
                        style={{ width: 55 }}
                        value={sumaStock[`form-${c.color}`] || ''}
                        onChange={handleCambioSumaStock(`form-${c.color}`)}
                      />
                      <button type="button" onClick={() => handleSumarStockColorForm(c.color)}>+</button>
                    </>
                  )}
                  <button type="button" onClick={() => handleQuitarColor(c.color)}>×</button>
                </span>
              ))}
            </div>
          )}

          <button type="submit">{editandoId ? 'Guardar cambios' : 'Guardar producto'}</button>
        </form>
      )}

      <table className="tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Código</th>
            <th>Categoría</th>
            <th>Colores</th>
            <th>Precio venta</th>
            <th>Stock</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <tr key={p.id}>
              <td>{p.nombre}</td>
              <td>{p.codigo || '-'}</td>
              <td>{p.categoria || '-'}</td>
              <td>
                {p.colores && p.colores.length > 0
                  ? p.colores.map((c) => `${c.color} (${c.stock})`).join(', ')
                  : '-'}
              </td>
              <td>${Number(p.precio_venta).toFixed(2)}</td>
              <td className={Number(p.stock_minimo) > 0 && Number(p.stock_actual) <= Number(p.stock_minimo) ? 'stock-bajo' : ''}>
                {p.colores && p.colores.length > 0 ? (
                  <>
                    <div>{p.stock_actual} {p.unidad_medida} en total</div>
                    {puedeEditar && p.colores.map((c) => {
                      const clave = `${p.id}-${c.color}`;
                      return (
                        <div key={c.color} className="fila-form" style={{ marginTop: 4, marginBottom: 0, alignItems: 'center' }}>
                          <span style={{ fontSize: 12, width: 70 }}>{c.color} ({c.stock})</span>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="sumar"
                            style={{ width: 60 }}
                            value={sumaStock[clave] || ''}
                            onChange={handleCambioSumaStock(clave)}
                          />
                          <button type="button" onClick={() => handleSumarStockColor(p.id, c.color)}>+</button>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <>
                    <div>{p.stock_actual} {p.unidad_medida}</div>
                    {puedeEditar && (
                      <div className="fila-form" style={{ marginTop: 4, marginBottom: 0 }}>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="sumar"
                          style={{ width: 70 }}
                          value={sumaStock[p.id] || ''}
                          onChange={handleCambioSumaStock(p.id)}
                        />
                        <button type="button" onClick={() => handleSumarStock(p.id)}>+ Stock</button>
                      </div>
                    )}
                  </>
                )}
              </td>
              <td>
                {puedeEditar && <button onClick={() => handleEditar(p)}>Editar</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
