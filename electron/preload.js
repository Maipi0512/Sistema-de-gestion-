const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  auth: {
    login: (usuario, password) => ipcRenderer.invoke('auth:login', usuario, password),
  },
  usuarios: {
    crear: (datos) => ipcRenderer.invoke('usuarios:crear', datos),
    listar: () => ipcRenderer.invoke('usuarios:listar'),
    actualizarPermisoProducto: (usuarioId, puedeEditar) =>
      ipcRenderer.invoke('usuarios:actualizarPermisoProducto', usuarioId, puedeEditar),
  },
  productos: {
    listar: (filtro) => ipcRenderer.invoke('productos:listar', filtro),
    crear: (producto) => ipcRenderer.invoke('productos:crear', producto),
    actualizar: (id, cambios) => ipcRenderer.invoke('productos:actualizar', id, cambios),
    ajustarStock: (id, cantidad, motivo, notas) =>
      ipcRenderer.invoke('productos:ajustarStock', id, cantidad, motivo, notas),
    agregarColor: (productoId, color) => ipcRenderer.invoke('productos:agregarColor', productoId, color),
    eliminarColor: (productoId, color) => ipcRenderer.invoke('productos:eliminarColor', productoId, color),
    sumarStockColor: (productoId, color, cantidad) => ipcRenderer.invoke('productos:sumarStockColor', productoId, color, cantidad),
    coloresDistintos: () => ipcRenderer.invoke('productos:coloresDistintos'),
  },
  ventas: {
    crear: (items, pagos, usuarioId) => ipcRenderer.invoke('ventas:crear', items, pagos, usuarioId),
    listar: (filtro) => ipcRenderer.invoke('ventas:listar', filtro),
    detalle: (ventaId) => ipcRenderer.invoke('ventas:detalle', ventaId),
    actualizarDescripciones: (ventaId, descripciones) =>
      ipcRenderer.invoke('ventas:actualizarDescripciones', ventaId, descripciones),
  },
  caja: {
    actual: () => ipcRenderer.invoke('caja:actual'),
    abrir: (montoApertura, notas) => ipcRenderer.invoke('caja:abrir', montoApertura, notas),
    cerrar: (sesionId, montoContado, notas) => ipcRenderer.invoke('caja:cerrar', sesionId, montoContado, notas),
    resumen: (sesionId) => ipcRenderer.invoke('caja:resumen', sesionId),
    listarSesiones: () => ipcRenderer.invoke('caja:listarSesiones'),
    registrarMovimiento: (sesionId, tipo, monto, concepto) =>
      ipcRenderer.invoke('caja:registrarMovimiento', sesionId, tipo, monto, concepto),
    listarMovimientos: (sesionId) => ipcRenderer.invoke('caja:listarMovimientos', sesionId),
  },
  dashboard: {
    stockBajo: () => ipcRenderer.invoke('dashboard:stockBajo'),
  },
  export: {
    ventas: (filtro) => ipcRenderer.invoke('export:ventas', filtro),
    productos: () => ipcRenderer.invoke('export:productos'),
  },
});
