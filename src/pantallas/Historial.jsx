import React, { useEffect, useState } from 'react';

export default function Historial() {
  const [ventas, setVentas] = useState([]);
  const [detalleAbierto, setDetalleAbierto] = useState(null); // venta con items, o null
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const cargar = () => {
    window.api.ventas.listar({ desde: desde || null, hasta: hasta || null }).then(setVentas);
  };

  useEffect(() => {
    cargar();
  }, []);

  const verDetalle = async (venta) => {
    if (detalleAbierto?.id === venta.id) {
      setDetalleAbierto(null);
      return;
    }
    const detalle = await window.api.ventas.detalle(venta.id);
    setDetalleAbierto(detalle);
  };

  return (
    <div>
      <h2>Historial de ventas</h2>

      <div className="barra-acciones">
        <label>
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <button onClick={cargar}>Filtrar</button>
        <button onClick={() => window.api.export.ventas({ desde: desde || null, hasta: hasta || null })}>
          Exportar a Excel
        </button>
      </div>

      <table className="tabla">
        <thead>
          <tr>
            <th>#</th>
            <th>Fecha</th>
            <th>Vendedor</th>
            <th>Total</th>
            <th>Método de pago</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {ventas.map((v) => (
            <React.Fragment key={v.id}>
              <tr>
                <td>{v.id}</td>
                <td>{new Date(v.fecha).toLocaleString('es-AR')}</td>
                <td>{v.vendedor_nombre || '-'}</td>
                <td>${Number(v.total).toFixed(2)}</td>
                <td>{v.metodo_pago}</td>
                <td>
                  <button onClick={() => verDetalle(v)}>
                    {detalleAbierto?.id === v.id ? 'Ocultar' : 'Ver detalle'}
                  </button>
                </td>
              </tr>
              {detalleAbierto?.id === v.id && (
                <tr>
                  <td colSpan={6}>
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Cantidad</th>
                          <th>Precio unit.</th>
                          <th>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalleAbierto.items.map((it) => (
                          <tr key={it.id}>
                            <td>{it.producto_nombre}</td>
                            <td>{it.cantidad}</td>
                            <td>${Number(it.precio_unitario).toFixed(2)}</td>
                            <td>${Number(it.subtotal).toFixed(2)}</td>
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
