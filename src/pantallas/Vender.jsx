import React, { useEffect, useState } from 'react';

export default function Vender({ usuarioActual }) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    if (busqueda.trim() === '') {
      setResultados([]);
      return;
    }
    window.api.productos.listar(busqueda).then(setResultados);
  }, [busqueda]);

  const agregarAlCarrito = (producto) => {
    setCarrito((prev) => {
      const existente = prev.find((it) => it.producto_id === producto.id);
      if (existente) {
        return prev.map((it) =>
          it.producto_id === producto.id ? { ...it, cantidad: it.cantidad + 1 } : it
        );
      }
      const colores = producto.colores || [];
      return [
        ...prev,
        {
          producto_id: producto.id,
          nombre: producto.nombre,
          cantidad: 1,
          colores,
          color: colores[0]?.color || '',
          precioVariable: !!producto.precio_variable,
          precioUnidad: producto.precio_variable ? '' : Number(producto.precio_venta),
          precioPaquete: producto.precio_paquete != null ? Number(producto.precio_paquete) : null,
          unidadesPorPaquete: producto.unidades_por_paquete != null ? Number(producto.unidades_por_paquete) : null,
          modo: 'unidad',
          stock_disponible: Number(producto.stock_actual),
        },
      ];
    });
    setBusqueda('');
    setResultados([]);
  };

  const actualizarItem = (producto_id, cambios) => {
    setCarrito((prev) =>
      prev.map((it) => (it.producto_id === producto_id ? { ...it, ...cambios } : it))
    );
  };

  const cambiarCantidad = (producto_id, cantidad) => {
    actualizarItem(producto_id, { cantidad: Number(cantidad) });
  };

  const cambiarModo = (producto_id, modo) => {
    actualizarItem(producto_id, { modo });
  };

  const cambiarColor = (producto_id, color) => {
    actualizarItem(producto_id, { color });
  };

  const cambiarPrecioUnidad = (producto_id, precioUnidad) => {
    actualizarItem(producto_id, { precioUnidad: precioUnidad === '' ? '' : Number(precioUnidad) });
  };

  const quitarDelCarrito = (producto_id) => {
    setCarrito((prev) => prev.filter((it) => it.producto_id !== producto_id));
  };

  const precioEfectivo = (it) => (it.modo === 'paquete' ? it.precioPaquete : Number(it.precioUnidad) || 0);

  const total = carrito.reduce((acc, it) => acc + it.cantidad * precioEfectivo(it), 0);

  const confirmarVenta = async () => {
    setMensaje('');

    const sinColor = carrito.find((it) => it.colores.length > 0 && !it.color);
    if (sinColor) {
      setMensaje(`Error: elegí un color para "${sinColor.nombre}"`);
      return;
    }

    const sinPrecio = carrito.find((it) => it.precioVariable && !(Number(it.precioUnidad) > 0));
    if (sinPrecio) {
      setMensaje(`Error: cargá el precio de "${sinPrecio.nombre}"`);
      return;
    }

    try {
      const items = carrito.map((it) => ({
        producto_id: it.producto_id,
        cantidad: it.cantidad,
        precio_unitario: precioEfectivo(it),
        color: it.colores.length > 0 ? it.color : null,
        unidades_por_paquete: it.modo === 'paquete' ? it.unidadesPorPaquete : null,
      }));
      const venta = await window.api.ventas.crear(items, metodoPago, usuarioActual?.id ?? null);
      setMensaje(`Venta #${venta.id} registrada — Total: $${venta.total.toFixed(2)}`);
      setCarrito([]);
    } catch (err) {
      setMensaje(`Error: ${err.message}`);
    }
  };

  return (
    <div>
      <h2>Vender</h2>

      <input
        type="text"
        placeholder="Buscar producto por nombre o código..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      {resultados.length > 0 && (
        <ul className="lista-resultados">
          {resultados.map((p) => (
            <li key={p.id} onClick={() => agregarAlCarrito(p)}>
              {p.nombre} — {p.precio_variable ? 'precio a cargar' : `$${Number(p.precio_venta).toFixed(2)}`}
              {!p.precio_variable && ` (stock: ${p.stock_actual})`}
            </li>
          ))}
        </ul>
      )}

      <table className="tabla">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Color</th>
            <th>Unidad/Paquete</th>
            <th>Cantidad</th>
            <th>Precio unit.</th>
            <th>Subtotal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {carrito.map((it) => (
            <tr key={it.producto_id}>
              <td>{it.nombre}</td>
              <td>
                {it.colores.length > 0 ? (
                  <select value={it.color} onChange={(e) => cambiarColor(it.producto_id, e.target.value)}>
                    <option value="">Elegir color...</option>
                    {it.colores.map((c) => (
                      <option key={c.color} value={c.color}>{c.color} (stock: {c.stock})</option>
                    ))}
                  </select>
                ) : '-'}
              </td>
              <td>
                {it.precioPaquete ? (
                  <select value={it.modo} onChange={(e) => cambiarModo(it.producto_id, e.target.value)}>
                    <option value="unidad">Unidad</option>
                    <option value="paquete">Paquete (x{it.unidadesPorPaquete})</option>
                  </select>
                ) : '-'}
              </td>
              <td>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={it.cantidad}
                  onChange={(e) => cambiarCantidad(it.producto_id, e.target.value)}
                />
              </td>
              <td>
                {it.precioVariable && it.modo !== 'paquete' ? (
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Cargar precio"
                    style={{ width: 100 }}
                    value={it.precioUnidad}
                    onChange={(e) => cambiarPrecioUnidad(it.producto_id, e.target.value)}
                  />
                ) : (
                  `$${precioEfectivo(it).toFixed(2)}`
                )}
              </td>
              <td>${(it.cantidad * precioEfectivo(it)).toFixed(2)}</td>
              <td>
                <button onClick={() => quitarDelCarrito(it.producto_id)}>Quitar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="tarjeta">
        <p className="total">Total: ${total.toFixed(2)}</p>
        <label>
          Método de pago
          <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
            <option value="efectivo">Efectivo</option>
            <option value="debito">Débito</option>
            <option value="credito">Crédito</option>
            <option value="transferencia">Transferencia</option>
            <option value="mercado_pago">Mercado Pago</option>
          </select>
        </label>
        <button disabled={carrito.length === 0} onClick={confirmarVenta}>
          Confirmar venta
        </button>
        {mensaje && <p>{mensaje}</p>}
      </div>
    </div>
  );
}
