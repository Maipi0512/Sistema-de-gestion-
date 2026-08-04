const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const db = require('./db');
const exportExcel = require('./export');

const isDev = !app.isPackaged;

// ------------------------------------------------------------
// AUTO-ACTUALIZACIÓN
// La app se baja sola las versiones nuevas publicadas como release en
// GitHub, en segundo plano y sin avisar. Se instala recién cuando alguien
// cierra el programa normalmente (no interrumpe una venta a mitad de
// camino) y la próxima vez que se abre ya está la versión nueva.
// No corre en modo desarrollo: ahí no hay nada empaquetado para comparar.
// ------------------------------------------------------------
if (!isDev) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Silencioso a propósito: sin diálogos ni notificaciones. Si falla la
  // consulta (sin internet, por ejemplo) no debe interrumpir el trabajo.
  autoUpdater.on('error', () => {});
}

function crearVentana() {
  const ventana = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    ventana.loadURL('http://localhost:5173');
    ventana.webContents.openDevTools();
  } else {
    ventana.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  crearVentana();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });

  if (!isDev) {
    autoUpdater.checkForUpdates().catch(() => {});
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ------------------------------------------------------------
// IPC: handlers que el renderer (React) invoca vía preload.js
// ------------------------------------------------------------

ipcMain.handle('auth:login', async (_e, usuario, password) => db.verificarLogin(usuario, password));

ipcMain.handle('usuarios:crear', async (_e, datos) => db.crearUsuario(datos));
ipcMain.handle('usuarios:listar', async () => db.listarUsuarios());
ipcMain.handle('usuarios:actualizarPermisoProducto', async (_e, usuarioId, puedeEditar) => db.actualizarPermisoProducto(usuarioId, puedeEditar));

ipcMain.handle('productos:listar', async (_e, filtro) => db.listarProductos(filtro));
ipcMain.handle('productos:crear', async (_e, producto) => db.crearProducto(producto));
ipcMain.handle('productos:actualizar', async (_e, id, cambios) => db.actualizarProducto(id, cambios));
ipcMain.handle('productos:ajustarStock', async (_e, id, cantidad, motivo, notas) => db.ajustarStock(id, cantidad, motivo, notas));
ipcMain.handle('productos:agregarColor', async (_e, productoId, color) => db.agregarColorProducto(productoId, color));
ipcMain.handle('productos:eliminarColor', async (_e, productoId, color) => db.eliminarColorProducto(productoId, color));
ipcMain.handle('productos:sumarStockColor', async (_e, productoId, color, cantidad) => db.sumarStockColor(productoId, color, cantidad));
ipcMain.handle('productos:coloresDistintos', async () => db.listarColoresDistintos());

ipcMain.handle('ventas:crear', async (_e, items, pagos, usuarioId) => db.crearVenta(items, pagos, usuarioId));
ipcMain.handle('ventas:listar', async (_e, filtro) => db.listarVentas(filtro));
ipcMain.handle('ventas:detalle', async (_e, ventaId) => db.obtenerDetalleVenta(ventaId));
ipcMain.handle('ventas:actualizarDescripciones', async (_e, ventaId, descripciones) => db.actualizarDescripcionesVenta(ventaId, descripciones));
ipcMain.handle('ventas:anular', async (_e, ventaId, motivo) => db.anularVenta(ventaId, motivo));

ipcMain.handle('caja:actual', async () => db.cajaActual());
ipcMain.handle('caja:abrir', async (_e, montoApertura, notas) => db.abrirCaja(montoApertura, notas));
ipcMain.handle('caja:cerrar', async (_e, sesionId, montoContado, notas) => db.cerrarCaja(sesionId, montoContado, notas));
ipcMain.handle('caja:resumen', async (_e, sesionId) => db.resumenCaja(sesionId));
ipcMain.handle('caja:listarSesiones', async () => db.listarSesionesCaja());
ipcMain.handle('caja:registrarMovimiento', async (_e, sesionId, tipo, monto, concepto) => db.registrarMovimientoCaja(sesionId, tipo, monto, concepto));
ipcMain.handle('caja:listarMovimientos', async (_e, sesionId) => db.listarMovimientosCaja(sesionId));

ipcMain.handle('dashboard:stockBajo', async () => db.stockBajo());

ipcMain.handle('export:ventas', async (_e, filtro) => exportExcel.exportarVentasExcel(filtro));
ipcMain.handle('export:productos', async () => exportExcel.exportarProductosExcel());
