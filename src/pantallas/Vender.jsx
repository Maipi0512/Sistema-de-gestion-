import React, { useEffect, useRef, useState } from 'react';

const METODOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'mercado_pago', label: 'Mercado Pago' },
  { value: 'cuenta_corriente', label: 'Cuenta corriente (fiado)' },
];

export default function Vender({ usuarioActual }) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [carrito, setCarrito] = useState([]);
  // Una venta puede pagarse con más de un método (ej. una parte en
  // efectivo y otra por transferencia). Cada renglón es {id, metodo, monto}.
  const [pagos, setPagos] = useState([{ id: 1, metodo: 'efectivo', monto: '' }]);
  const [mensaje, setMensaje] = useState('');

  // Solo hace falta elegir cliente cuando alguna forma de pago es "cuenta
  // corriente": ese monto queda como deuda de ese cliente.
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [resultadosClientes, setResultadosClientes] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);

  // Cada renglón del carrito lleva su propio número de línea. No alcanza
  // con el producto_id: dos arreglos del mismo tipo pueden ser de personas
  // distintas y cada uno necesita su precio y su descripción aparte.
  const proximaLinea = useRef(1);
  const proximoPago = useRef(2);

  useEffect(() => {
    if (busqueda.trim() === '') {
      setResultados([]);
      return;
    }
    window.api.productos.listar(busqueda).then(setResultados);
  }, [busqueda]);

  useEffect(() => {
    if (busquedaCliente.trim() === '') {
      setResultadosClientes([]);
      return;
    }
    window.api.clientes.listar(busquedaCliente).then(setResultadosClientes);
  }, [busquedaCliente]);

  const elegirCliente = (cliente) => {
    setClienteSeleccionado(cliente);
    setBusquedaCliente('');
    setResultadosClientes([]);
  };

  const agregarAlCarrito = (producto) => {
    const nuevaLinea = proximaLinea.current++;
    setCarrito((prev) => {
      // Los productos comunes se agrupan sumando cantidad, como siempre.
      // Los arreglos y talleres (precio variable) no: van uno por renglón.
      if (!producto.precio_variable) {
        const existente = prev.find((it) => it.producto_id === producto.id);
        if (existente) {
          return prev.map((it) =>
            it.linea === existente.linea ? { ...it, cantidad: it.cantidad + 1 } : it
          );
        }
      }
      const colores = producto.colores || [];
      return [
        ...prev,
        {
          linea: nuevaLinea,
          producto_id: producto.id,
          nombre: producto.nombre,
          cantidad: 1,
          colores,
          color: colores[0]?.color || '',
          precioVariable: !!producto.precio_variable,
          descripcion: '',
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

  const actualizarItem = (linea, cambios) => {
    setCarrito((prev) =>
      prev.map((it) => (it.linea === linea ? { ...it, ...cambios } : it))
    );
  };

  const cambiarCantidad = (linea, cantidad) => {
    actualizarItem(linea, { cantidad: Number(cantidad) });
  };

  const cambiarModo = (linea, modo) => {
    actualizarItem(linea, { modo });
  };

  const cambiarColor = (linea, color) => {
    actualizarItem(linea, { color });
  };

  const cambiarPrecioUnidad = (linea, precioUnidad) => {
    actualizarItem(linea, { precioUnidad: precioUnidad === '' ? '' : Number(precioUnidad) });
  };

  const cambiarDescripcion = (linea, descripcion) => {
    actualizarItem(linea, { descripcion });
  };

  const quitarDelCarrito = (linea) => {
    setCarrito((prev) => prev.filter((it) => it.linea !== linea));
  };

  const precioEfectivo = (it) => (it.modo === 'paquete' ? it.precioPaquete : Number(it.precioUnidad) || 0);

  const total = carrito.reduce((acc, it) => acc + it.cantidad * precioEfectivo(it), 0);

  const agregarPago = () => {
    setPagos((prev) => [...prev, { id: proximoPago.current++, metodo: 'efectivo', monto: '' }]);
  };

  const quitarPago = (id) => {
    setPagos((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev));
  };

  const cambiarMetodoPago = (id, metodo) => {
    setPagos((prev) => prev.map((p) => (p.id === id ? { ...p, metodo } : p)));
  };

  const cambiarMontoPago = (id, monto) => {
    setPagos((prev) => prev.map((p) => (p.id === id ? { ...p, monto } : p)));
  };

  // Lo que se cobra es lo que se carga en las formas de pago, no el precio de
  // lista: se redondea (1530 → 1500) o se le hace un descuento a una alumna
  // del taller. La venta se registra por el monto cobrado.
  const totalPagos = pagos.reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
  const diferenciaPagos = Math.round((total - totalPagos) * 100) / 100;
  const necesitaCliente = pagos.some((p) => p.metodo === 'cuenta_corriente');

  // Completa este renglón con lo que todavía falta cubrir del total,
  // para no tener que sacar la cuenta a mano cuando se reparte el pago.
  const completarConRestante = (id) => {
    const otros = pagos.filter((p) => p.id !== id).reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
    const restante = Math.max(0, Math.round((total - otros) * 100) / 100);
    cambiarMontoPago(id, restante);
  };

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

    // Los arreglos y los pagos de taller (precio variable) tienen que quedar
    // siempre a nombre de alguien, si no después no se sabe de quién eran.
    const sinDescripcion = carrito.find((it) => it.precioVariable && !it.descripcion.trim());
    if (sinDescripcion) {
      setMensaje(`Error: escribí de quién es "${sinDescripcion.nombre}" en la columna Descripción`);
      return;
    }

    const pagoSinMonto = pagos.find((p) => !(Number(p.monto) > 0));
    if (pagoSinMonto) {
      setMensaje('Error: cargá un monto mayor a cero en cada forma de pago');
      return;
    }

    if (necesitaCliente && !clienteSeleccionado) {
      setMensaje('Error: elegí a qué cliente cargarle la cuenta corriente');
      return;
    }

    // A propósito no se exige que los pagos den justo el precio de lista: la
    // venta se registra por lo que se cobró.

    try {
      const items = carrito.map((it) => ({
        producto_id: it.producto_id,
        cantidad: it.cantidad,
        precio_unitario: precioEfectivo(it),
        color: it.colores.length > 0 ? it.color : null,
        unidades_por_paquete: it.modo === 'paquete' ? it.unidadesPorPaquete : null,
        descripcion: it.descripcion,
      }));
      const pagosPayload = pagos.map((p) => ({ metodo_pago: p.metodo, monto: Number(p.monto) }));
      const venta = await window.api.ventas.crear(
        items,
        pagosPayload,
        usuarioActual?.id ?? null,
        necesitaCliente ? clienteSeleccionado.id : null
      );
      const aviso = diferenciaPagos > 0
        ? ` (descuento de $${diferenciaPagos.toFixed(2)} sobre $${total.toFixed(2)})`
        : '';
      setMensaje(`Venta #${venta.id} registrada — Cobrado: $${venta.total.toFixed(2)}${aviso}`);
      setCarrito([]);
      setPagos([{ id: proximoPago.current++, metodo: 'efectivo', monto: '' }]);
      setClienteSeleccionado(null);
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
            <th>Descripción</th>
            <th>Subtotal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {carrito.map((it) => (
            <tr key={it.linea}>
              <td>{it.nombre}</td>
              <td>
                {it.colores.length > 0 ? (
                  <select value={it.color} onChange={(e) => cambiarColor(it.linea, e.target.value)}>
                    <option value="">Elegir color...</option>
                    {it.colores.map((c) => (
                      <option key={c.color} value={c.color}>{c.color} (stock: {c.stock})</option>
                    ))}
                  </select>
                ) : '-'}
              </td>
              <td>
                {it.precioPaquete ? (
                  <select value={it.modo} onChange={(e) => cambiarModo(it.linea, e.target.value)}>
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
                  onChange={(e) => cambiarCantidad(it.linea, e.target.value)}
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
                    onChange={(e) => cambiarPrecioUnidad(it.linea, e.target.value)}
                  />
                ) : (
                  `$${precioEfectivo(it).toFixed(2)}`
                )}
              </td>
              <td>
                <input
                  type="text"
                  style={{ width: 180 }}
                  placeholder={it.precioVariable ? '¿De quién es?' : 'Opcional'}
                  value={it.descripcion}
                  onChange={(e) => cambiarDescripcion(it.linea, e.target.value)}
                />
              </td>
              <td>${(it.cantidad * precioEfectivo(it)).toFixed(2)}</td>
              <td>
                <button onClick={() => quitarDelCarrito(it.linea)}>Quitar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="tarjeta">
        <p className="total">Total: ${total.toFixed(2)}</p>

        <h3>Forma de pago</h3>
        {pagos.map((p) => (
          <div className="fila-form" key={p.id}>
            <label>
              Método
              <select value={p.metodo} onChange={(e) => cambiarMetodoPago(p.id, e.target.value)}>
                {METODOS_PAGO.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
            <label>
              Monto
              <input
                type="number"
                min="0.01"
                step="0.01"
                style={{ width: 120 }}
                value={p.monto}
                onChange={(e) => cambiarMontoPago(p.id, e.target.value)}
              />
            </label>
            <button type="button" onClick={() => completarConRestante(p.id)}>Completar con el resto</button>
            {pagos.length > 1 && (
              <button type="button" onClick={() => quitarPago(p.id)}>Quitar</button>
            )}
          </div>
        ))}
        <button type="button" onClick={agregarPago}>+ Agregar otra forma de pago</button>

        {necesitaCliente && (
          <div style={{ marginTop: 8 }}>
            <label>
              Cliente (para la cuenta corriente)
              <input
                type="text"
                placeholder="Buscar cliente por nombre..."
                value={clienteSeleccionado ? clienteSeleccionado.nombre : busquedaCliente}
                onChange={(e) => {
                  setClienteSeleccionado(null);
                  setBusquedaCliente(e.target.value);
                }}
              />
            </label>
            {resultadosClientes.length > 0 && !clienteSeleccionado && (
              <ul className="lista-resultados">
                {resultadosClientes.map((c) => (
                  <li key={c.id} onClick={() => elegirCliente(c)}>
                    {c.nombre} {c.telefono ? `(${c.telefono})` : ''} — saldo actual: ${Number(c.saldo).toFixed(2)}
                  </li>
                ))}
              </ul>
            )}
            {clienteSeleccionado && (
              <p className="nota">
                Cliente elegido: {clienteSeleccionado.nombre} (saldo actual: ${Number(clienteSeleccionado.saldo).toFixed(2)}).{' '}
                <button type="button" onClick={() => setClienteSeleccionado(null)}>Cambiar</button>
              </p>
            )}
          </div>
        )}

        <p>
          Se cobra: ${totalPagos.toFixed(2)}
          {diferenciaPagos > 0 && ` — Descuento sobre el total: $${diferenciaPagos.toFixed(2)}`}
          {diferenciaPagos < 0 && ` — Se cobra $${Math.abs(diferenciaPagos).toFixed(2)} más que el total`}
          {diferenciaPagos === 0 && ' — Igual al total ✓'}
        </p>

        <button disabled={carrito.length === 0} onClick={confirmarVenta}>
          Confirmar venta
        </button>
        {mensaje && <p>{mensaje}</p>}
      </div>
    </div>
  );
}
