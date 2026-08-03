const ExcelJS = require('exceljs');
const { dialog } = require('electron');
const db = require('./db');

async function exportarVentasExcel(filtro = {}) {
  const ventas = await db.listarVentas(filtro);

  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet('Ventas');

  hoja.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Fecha', key: 'fecha', width: 20 },
    { header: 'Vendedor', key: 'vendedor', width: 20 },
    { header: 'Total', key: 'total', width: 14 },
    { header: 'Método de pago', key: 'metodo_pago', width: 18 },
  ];
  hoja.getRow(1).font = { bold: true };

  ventas.forEach((v) => {
    hoja.addRow({
      id: v.id,
      fecha: new Date(v.fecha).toLocaleString('es-AR'),
      vendedor: v.vendedor_nombre || '-',
      total: Number(v.total),
      metodo_pago: v.metodo_pago,
    });
  });

  const totalGeneral = ventas.reduce((acc, v) => acc + Number(v.total), 0);
  hoja.addRow({});
  const filaTotal = hoja.addRow({ vendedor: 'TOTAL', total: totalGeneral });
  filaTotal.font = { bold: true };

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
