import React, { useEffect, useState } from 'react';

export default function Vender({ usuarioActual }) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [carrito, setCarrito] = useState([]); // [{ producto_id, nombre, cantidad, precio_unitario, stock_disponible }]
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
      return [
        ...prev,
        {
          producto_id: producto.id,
          nombre: producto.nombre,
          cantidad: 1,
          precio_unitario: Number(producto.precio_venta),
          stock_disponible: Number(producto.stock_actual),
        },
      ];
    });
    setBusqueda('');
    setResultados([]);
  };

  const cambiarCantidad = (producto_id, cantidad) => {
    setCarrito((prev) =>
      prev.map((it) => (it.producto_id === producto_id ? { ...it, cantidad: Number(cantidad) } : it))
    );
  };

  const quitarDelCarrito = (producto_id) => {
    setCarrito((prev) => prev.filter((it) => it.producto_id !== producto_id));
  };

  const total = carrito.reduce((acc, it) => acc + it.cantidad * it.precio_unitario, 0);

  const confirmarVenta = async () => {
    setMensaje('');
    try {
      const items = carrito.map(({ producto_id, cantidad, precio_unitario }) => ({
        producto_id,
        cantidad,
        precio_unitario,
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
              {p.nombre} — ${Number(p.precio_venta).toFixed(2)} (stock: {p.stock_actual})
            </li>
          ))}
        </ul>
      )}

      <table className="tabla">
        <thead>
          <tr>
            <th>Producto</th>
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
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={it.stock_disponible}
                  value={it.cantidad}
                  onChange={(e) => cambiarCantidad(it.producto_id, e.target.value)}
                />
              </td>
              <td>${it.precio_unitario.toFixed(2)}</td>
              <td>${(it.cantidad * it.precio_unitario).toFixed(2)}</td>
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
