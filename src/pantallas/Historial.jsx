import React, { useEffect, useState } from 'react';

const ETIQUETA_METODO = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
  mercado_pago: 'Mercado Pago',
  mixto: 'Mixto',
};

// Arma un texto tipo "Efectivo $500 + Transferencia $200" a partir del
// desglose de venta_pagos. Si la venta se pagó con un solo método, alcanza
// con mostrar la etiqueta simple.
const formatearPagos = (venta) => {
  if (!venta.pagos || venta.pagos.length <= 1) {
    return ETIQUETA_METODO[venta.metodo_pago] || venta.metodo_pago;
  }
  return venta.pagos
    .map((p) => `${ETIQUETA_METODO[p.metodo_pago] || p.metodo_pago} $${Number(p.monto).toFixed(2)}`)
    .join(' + ');
};

export default function Historial() {
  const [ventas, setVentas] = useState([]);
  const [detalleAbierto, setDetalleAbierto] = useState(null); // venta con items, o null
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  // Edición de las descripciones de la venta abierta.
  // `borrador` guarda { [id del item]: texto } mientras se edita, así se
  // puede cancelar sin haber tocado nada de lo que está guardado.
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState('');

  // Anulación de venta: devuelve el stock vendido y la saca del historial.
  // `confirmandoAnulacion` guarda el id de la venta que se está por anular
  // mientras se pide el motivo, para mostrar el panel de confirmación propio
  // en vez de window.confirm/prompt (Electron no implementa window.prompt).
  const [confirmandoAnulacion, setConfirmandoAnulacion] = useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [errorAnulacion, setErrorAnulacion] = useState('');

  const cargar = () => {
    window.api.ventas.listar({ desde: desde || null, hasta: hasta || null }).then(setVentas);
  };

  useEffect(() => {
    cargar();
  }, []);

  const salirDeEdicion = () => {
    setEditando(false);
    setBorrador({});
    setErrorEdicion('');
  };

  const salirDeAnulacion = () => {
    setConfirmandoAnulacion(false);
    setMotivoAnulacion('');
    setErrorAnulacion('');
  };

  // Devuelve el stock que había descontado la venta y la marca como anulada.
  const confirmarAnulacion = async (venta) => {
    setErrorAnulacion('');
    setAnulando(true);
    try {
      await window.api.ventas.anular(venta.id, motivoAnulacion);
      setDetalleAbierto(null);
      salirDeEdicion();
      salirDeAnulacion();
      cargar();
    } catch (err) {
      setErrorAnulacion(err.message);
    } finally {
      setAnulando(false);
    }
  };

  const verDetalle = async (venta) => {
    salirDeEdicion();
    salirDeAnulacion();
    if (detalleAbierto?.id === venta.id) {
      setDetalleAbierto(null);
      return;
    }
    const detalle = await window.api.ventas.detalle(venta.id);
    setDetalleAbierto(detalle);
  };

  const empezarEdicion = () => {
    const inicial = {};
    detalleAbierto.items.forEach((it) => {
      inicial[it.id] = it.descripcion || '';
    });
    setBorrador(inicial);
    setErrorEdicion('');
    setEditando(true);
  };

  const cambiarBorrador = (itemId, texto) => {
    setBorrador((prev) => ({ ...prev, [itemId]: texto }));
  };

  const guardarDescripciones = async () => {
    setErrorEdicion('');
    setGuardando(true);
    try {
      const descripciones = detalleAbierto.items.map((it) => ({
        id: it.id,
        descripcion: borrador[it.id] ?? '',
      }));
      const actualizada = await window.api.ventas.actualizarDescripciones(detalleAbierto.id, descripciones);
      setDetalleAbierto(actualizada);
      salirDeEdicion();
      cargar(); // refresca la columna Descripción de la lista
    } catch (err) {
      setErrorEdicion(err.message);
    } finally {
      setGuardando(false);
    }
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
            <th>Descripción</th>
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
                <td>{new Date(v.fecha).toLocaleString('es-AR', { hour12: false })}</td>
                <td>{v.vendedor_nombre || '-'}</td>
                <td>{v.descripciones || '-'}</td>
                <td>${Number(v.total).toFixed(2)}</td>
                <td>{formatearPagos(v)}</td>
                <td>
                  <button onClick={() => verDetalle(v)}>
                    {detalleAbierto?.id === v.id ? 'Ocultar' : 'Ver detalle'}
                  </button>
                </td>
              </tr>
              {detalleAbierto?.id === v.id && (
                <tr>
                  <td colSpan={7}>
                    <div className="barra-acciones">
                      {editando ? (
                        <>
                          <button onClick={guardarDescripciones} disabled={guardando}>
                            {guardando ? 'Guardando...' : 'Guardar descripciones'}
                          </button>
                          <button onClick={salirDeEdicion} disabled={guardando}>Cancelar</button>
                        </>
                      ) : (
                        <button onClick={empezarEdicion}>Editar descripciones</button>
                      )}
                      {!confirmandoAnulacion && (
                        <button onClick={() => setConfirmandoAnulacion(true)}>Anular venta</button>
                      )}
                    </div>
                    {errorEdicion && <p className="error">Error: {errorEdicion}</p>}

                    {confirmandoAnulacion && (
                      <div className="barra-acciones">
                        <p>
                          ¿Anular la venta #{detalleAbierto.id} por ${Number(detalleAbierto.total).toFixed(2)}?
                          Se devuelve el stock vendido.
                        </p>
                        <label>
                          Motivo (opcional)
                          <input
                            type="text"
                            style={{ width: 260 }}
                            value={motivoAnulacion}
                            onChange={(e) => setMotivoAnulacion(e.target.value)}
                          />
                        </label>
                        <button onClick={() => confirmarAnulacion(detalleAbierto)} disabled={anulando}>
                          {anulando ? 'Anulando...' : 'Confirmar anulación'}
                        </button>
                        <button onClick={salirDeAnulacion} disabled={anulando}>Cancelar</button>
                        {errorAnulacion && <p className="error">Error: {errorAnulacion}</p>}
                      </div>
                    )}

                    <p><strong>Forma de pago:</strong> {formatearPagos(detalleAbierto)}</p>
                    {(() => {
                      // La venta se guarda por lo cobrado; si se redondeó o se
                      // hizo un descuento no coincide con la suma de los items.
                      const lista = detalleAbierto.items.reduce((acc, it) => acc + Number(it.subtotal), 0);
                      const dif = Math.round((lista - Number(detalleAbierto.total)) * 100) / 100;
                      if (dif === 0) return null;
                      return (
                        <p>
                          <strong>Precio de lista:</strong> ${lista.toFixed(2)} —{' '}
                          {dif > 0 ? `descuento de $${dif.toFixed(2)}` : `recargo de $${Math.abs(dif).toFixed(2)}`}
                        </p>
                      );
                    })()}

                    <table className="tabla">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Descripción</th>
                          <th>Color</th>
                          <th>Cantidad</th>
                          <th>Precio unit.</th>
                          <th>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalleAbierto.items.map((it) => (
                          <tr key={it.id}>
                            <td>{it.producto_nombre}</td>
                            <td>
                              {editando ? (
                                <input
                                  type="text"
                                  style={{ width: 200 }}
                                  placeholder="¿De quién es?"
                                  value={borrador[it.id] ?? ''}
                                  onChange={(e) => cambiarBorrador(it.id, e.target.value)}
                                />
                              ) : (
                                it.descripcion || '-'
                              )}
                            </td>
                            <td>{it.color || '-'}</td>
                            <td>
                              {it.cantidad}
                              {it.unidades_por_paquete ? ` paquete(s) x ${it.unidades_por_paquete}` : ''}
                            </td>
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
