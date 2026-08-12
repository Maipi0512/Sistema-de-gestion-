const ExcelJS = require('exceljs');
const { dialog } = require('electron');
const db = require('./db');

const ETIQUETA_METODO = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
  mercado_pago: 'Mercado Pago',
  mixto: 'Mixto',
  cuenta_corriente: 'Cuenta corriente',
};

// "Efectivo $500 + Transferencia $200" si la venta se dividió entre
// varios métodos; si no, la etiqueta simple del método único.
function formatearPagos(venta) {
  if (!venta.pagos || venta.pagos.length <= 1) {
    return ETIQUETA_METODO[venta.metodo_pago] || venta.metodo_pago;
  }
  return venta.pagos
    .map((p) => `${ETIQUETA_METODO[p.metodo_pago] || p.metodo_pago} $${Number(p.monto).toFixed(2)}`)
    .join(' + ');
}

// "Tela roja (Rojo) x2 = $500.00" — una línea por producto vendido.
function formatearItem(it) {
  const color = it.color ? ` (${it.color})` : '';
  const cantidad = it.unidades_por_paquete
    ? `${Number(it.cantidad)} paquete(s) x ${Number(it.unidades_por_paquete)}`
    : `x${Number(it.cantidad)}`;
  return `${it.producto_nombre}${color} ${cantidad} = $${Number(it.subtotal).toFixed(2)}`;
}

// Agrupa el detalle en un texto por venta (una celda), un producto por
// renglón dentro de esa misma celda:
//   Tela roja x2 = $500.00
//   Hilo blanco x1 = $100.00
function agruparDetallePorVenta(itemsVendidos) {
  const porVenta = {};
  itemsVendidos.forEach((it) => {
    if (!porVenta[it.venta_id]) porVenta[it.venta_id] = [];
    porVenta[it.venta_id].push(formatearItem(it));
  });
  const resultado = {};
  Object.entries(porVenta).forEach(([ventaId, items]) => {
    resultado[ventaId] = items.join('\n');
  });
  return resultado;
}

async function exportarVentasExcel(filtro = {}) {
  const [ventas, itemsVendidos] = await Promise.all([
    db.listarVentas(filtro),
    db.listarDetalleVentas(filtro),
  ]);

  const detallePorVenta = agruparDetallePorVenta(itemsVendidos);

  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet('Ventas');

  hoja.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Fecha', key: 'fecha', width: 20 },
    { header: 'Vendedor', key: 'vendedor', width: 20 },
    { header: 'Cliente', key: 'cliente', width: 20 },
    { header: 'Detalle (productos vendidos)', key: 'detalleProductos', width: 55 },
    { header: 'Descripción', key: 'descripciones', width: 35 },
    { header: 'Total', key: 'total', width: 14 },
    { header: 'Método de pago', key: 'metodo_pago', width: 30 },
  ];
  hoja.getRow(1).font = { bold: true };
  // Wrap para que se vea un producto por renglón dentro de la misma celda,
  // en vez de una sola línea larga.
  hoja.getColumn('detalleProductos').alignment = { wrapText: true, vertical: 'top' };

  ventas.forEach((v) => {
    const detalle = detallePorVenta[v.id] || '';
    const fila = hoja.addRow({
      id: v.id,
      fecha: new Date(v.fecha).toLocaleString('es-AR'),
      vendedor: v.vendedor_nombre || '-',
      cliente: v.cliente_nombre || '-',
      detalleProductos: detalle,
      descripciones: v.descripciones || '',
      total: Number(v.total),
      metodo_pago: formatearPagos(v),
    });
    // Alto de fila proporcional a la cantidad de productos, así se ven
    // todos los renglones sin tener que agrandarla a mano.
    const cantidadLineas = detalle ? detalle.split('\n').length : 1;
    fila.height = Math.max(15, cantidadLineas * 14);
  });

  const totalGeneral = ventas.reduce((acc, v) => acc + Number(v.total), 0);
  hoja.addRow({});
  const filaTotal = hoja.addRow({ vendedor: 'TOTAL', total: totalGeneral });
  filaTotal.font = { bold: true };

  // Segunda hoja: un renglón por producto vendido (no por venta), para ver
  // el detalle de qué se vendió y no solo el total de cada venta.
  const hojaDetalle = workbook.addWorksheet('Detalle de ventas');
  hojaDetalle.columns = [
    { header: 'Venta #', key: 'venta_id', width: 10 },
    { header: 'Fecha', key: 'fecha', width: 20 },
    { header: 'Vendedor', key: 'vendedor', width: 20 },
    { header: 'Cliente', key: 'cliente', width: 20 },
    { header: 'Producto', key: 'producto', width: 30 },
    { header: 'Color', key: 'color', width: 14 },
    { header: 'Cantidad', key: 'cantidad', width: 12 },
    { header: 'Precio unit.', key: 'precio_unitario', width: 14 },
    { header: 'Subtotal', key: 'subtotal', width: 14 },
    { header: 'Descripción', key: 'descripcion', width: 30 },
  ];
  hojaDetalle.getRow(1).font = { bold: true };

  itemsVendidos.forEach((it) => {
    hojaDetalle.addRow({
      venta_id: it.venta_id,
      fecha: new Date(it.fecha).toLocaleString('es-AR'),
      vendedor: it.vendedor_nombre || '-',
      cliente: it.cliente_nombre || '-',
      producto: it.producto_nombre,
      color: it.color || '-',
      cantidad: it.unidades_por_paquete
        ? `${Number(it.cantidad)} paquete(s) x ${Number(it.unidades_por_paquete)}`
        : Number(it.cantidad),
      precio_unitario: Number(it.precio_unitario),
      subtotal: Number(it.subtotal),
      descripcion: it.descripcion || '',
    });
  });

  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Guardar informe de ventas',
    defaultPath: `ventas_${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });
  if (canceled || !filePath) return { guardado: false };

  await workbook.xlsx.writeFile(filePath);
  return { guardado: true, filePath };
}

async function exportarProductosExcel() {
  const productos = await db.listarProductos('');

  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet('Productos');

  hoja.columns = [
    { header: 'Código', key: 'codigo', width: 15 },
    { header: 'Nombre', key: 'nombre', width: 30 },
    { header: 'Precio costo', key: 'precio_costo', width: 14 },
    { header: 'Precio venta', key: 'precio_venta', width: 14 },
    { header: 'Stock actual', key: 'stock_actual', width: 14 },
    { header: 'Stock mínimo', key: 'stock_minimo', width: 14 },
    { header: 'Unidad', key: 'unidad_medida', width: 12 },
  ];
  hoja.getRow(1).font = { bold: true };

  productos.forEach((p) => {
    hoja.addRow({
      codigo: p.codigo || '-',
      nombre: p.nombre,
      precio_costo: Number(p.precio_costo),
      precio_venta: Number(p.precio_venta),
      stock_actual: Number(p.stock_actual),
      stock_minimo: Number(p.stock_minimo),
      unidad_medida: p.unidad_medida,
    });
  });

  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Guardar informe de productos',
    defaultPath: `productos_${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });
  if (canceled || !filePath) return { guardado: false };

  await workbook.xlsx.writeFile(filePath);
  return { guardado: true, filePath };
}

module.exports = { exportarVentasExcel, exportarProductosExcel };
