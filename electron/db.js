const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { app } = require('electron');

// ------------------------------------------------------------
// CONFIGURACIÓN DE CONEXIÓN
// Se guarda en un config.json en la carpeta de datos de usuario,
// así cada PC puede apuntar a la misma base sin tocar código:
//  - Base local en red: host "localhost" (PC servidor) o la IP de
//    esa PC (192.168.1.X) desde la PC cliente.
//  - Base cloud (Supabase, Render, Neon, etc.): host es el que te
//    da el proveedor (ej. "db.xxxx.supabase.co"). Estas requieren
//    SSL, que se activa solo automáticamente más abajo cuando el
//    host no es local.
// ------------------------------------------------------------
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

function cargarConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  }
  const config = {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'cambiar_esta_clave',
    database: 'almacen_costura',
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  return config;
}

function esHostLocal(host) {
  return host === 'localhost' || host === '127.0.0.1';
}

const config = cargarConfig();
const pool = new Pool({
  ...config,
  // Supabase y la mayoría de los proveedores cloud exigen SSL.
  // rejectUnauthorized: false porque son certificados intermedios
  // que Node no siempre valida bien; la conexión sigue yendo cifrada.
  ssl: esHostLocal(config.host) ? false : { rejectUnauthorized: false },
});

// ------------------------------------------------------------
// USUARIOS / LOGIN
// Cada vendedor tiene su usuario y contraseña propios. Las
// contraseñas nunca se guardan en texto plano, solo el hash.
// ------------------------------------------------------------

async function crearUsuario({ nombre, usuario, password, rol }) {
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nombre, usuario, password_hash, rol)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nombre, usuario, rol, activo`,
    [nombre, usuario, hash, rol || 'vendedor']
  );
  return rows[0];
}

async function listarUsuarios() {
  const { rows } = await pool.query(
    `SELECT id, nombre, usuario, rol, activo, puede_editar_productos FROM usuarios ORDER BY nombre`
  );
  return rows;
}

async function actualizarPermisoProducto(usuarioId, puedeEditar) {
  const { rows } = await pool.query(
    `UPDATE usuarios SET puede_editar_productos = $1 WHERE id = $2
     RETURNING id, nombre, usuario, rol, activo, puede_editar_productos`,
    [puedeEditar, usuarioId]
  );
  return rows[0];
}

// Verifica usuario + contraseña. Lanza error si no coincide,
// nunca devuelve el hash de la contraseña al renderer.
async function verificarLogin(usuario, password) {
  const { rows } = await pool.query(
    `SELECT * FROM usuarios WHERE usuario = $1 AND activo = TRUE`,
    [usuario]
  );
  if (rows.length === 0) throw new Error('Usuario o contraseña incorrectos');

  const coincide = await bcrypt.compare(password, rows[0].password_hash);
  if (!coincide) throw new Error('Usuario o contraseña incorrectos');

  const { password_hash, ...usuarioSinPassword } = rows[0];
  return usuarioSinPassword;
}

// ------------------------------------------------------------
// PRODUCTOS
// ------------------------------------------------------------

// Si el producto tiene colores cargados, el stock que se muestra es la
// suma del stock de cada color (el stock_actual de la fila de productos
// deja de usarse para esos casos, cada color lleva su propia cantidad).
async function listarProductos(filtro = '') {
  const { rows } = await pool.query(
    `SELECT p.*,
       COALESCE(
         json_agg(json_build_object('color', pc.color, 'stock', pc.stock) ORDER BY pc.color)
           FILTER (WHERE pc.color IS NOT NULL),
         '[]'
       ) AS colores,
       CASE WHEN COUNT(pc.id) > 0 THEN COALESCE(SUM(pc.stock), 0) ELSE p.stock_actual END AS stock_actual
     FROM productos p
     LEFT JOIN producto_colores pc ON pc.producto_id = p.id
     WHERE p.activo = TRUE
       AND ($1 = '' OR p.nombre ILIKE '%' || $1 || '%' OR p.codigo ILIKE '%' || $1 || '%')
     GROUP BY p.id
     ORDER BY p.nombre ASC`,
    [filtro]
  );
  return rows;
}

async function crearProducto(producto) {
  const {
    codigo, nombre, descripcion, categoria, precio_costo, precio_venta, precio_variable,
    precio_paquete, unidades_por_paquete, unidad_medida, stock_inicial, stock_minimo,
  } = producto;
  const { rows } = await pool.query(
    `INSERT INTO productos (codigo, nombre, descripcion, categoria, precio_costo, precio_venta, precio_variable, precio_paquete, unidades_por_paquete, unidad_medida, stock_actual, stock_minimo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      codigo || null, nombre, descripcion || null, categoria || null,
      precio_costo || 0, precio_venta || 0, !!precio_variable, precio_paquete || null, unidades_por_paquete || null,
      unidad_medida || 'unidad', stock_inicial || 0, stock_minimo || 0,
    ]
  );
  return rows[0];
}

// ------------------------------------------------------------
// COLORES DE PRODUCTO
// Cada color tiene su propio stock (ej. cierres, hilos) sin
// necesidad de crear un producto aparte por cada color.
// ------------------------------------------------------------

async function agregarColorProducto(productoId, color) {
  const { rows } = await pool.query(
    `INSERT INTO producto_colores (producto_id, color) VALUES ($1, $2)
     ON CONFLICT (producto_id, color) DO NOTHING
     RETURNING *`,
    [productoId, color]
  );
  return rows[0] || null;
}

async function eliminarColorProducto(productoId, color) {
  await pool.query(`DELETE FROM producto_colores WHERE producto_id = $1 AND color = $2`, [productoId, color]);
  return { productoId, color };
}

async function sumarStockColor(productoId, color, cantidad) {
  const { rows } = await pool.query(
    `UPDATE producto_colores SET stock = stock + $1 WHERE producto_id = $2 AND color = $3 RETURNING *`,
    [cantidad, productoId, color]
  );
  if (rows.length === 0) throw new Error('Color no encontrado para ese producto');
  return rows[0];
}

async function listarColoresDistintos() {
  const { rows } = await pool.query(`SELECT DISTINCT color FROM producto_colores ORDER BY color`);
  return rows.map((r) => r.color);
}

async function actualizarProducto(id, cambios) {
  const campos = Object.keys(cambios);
  const valores = Object.values(cambios);
  const set = campos.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const { rows } = await pool.query(
    `UPDATE productos SET ${set} WHERE id = $1 RETURNING *`,
    [id, ...valores]
  );
  return rows[0];
}

async function ajustarStock(id, cantidad, motivo = 'ajuste_manual', notas = '') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: prodRows } = await client.query('SELECT stock_actual FROM productos WHERE id = $1 FOR UPDATE', [id]);
    if (prodRows.length === 0) throw new Error('Producto no encontrado');

    const nuevoStock = Number(prodRows[0].stock_actual) + Number(cantidad);
    if (nuevoStock < 0) throw new Error('El ajuste dejaría stock negativo');

    await client.query('UPDATE productos SET stock_actual = $1 WHERE id = $2', [nuevoStock, id]);

    await client.query(
      `INSERT INTO movimientos_stock (producto_id, tipo, motivo, cantidad, stock_resultante, notas)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, cantidad >= 0 ? 'entrada' : 'salida', motivo, Math.abs(cantidad), nuevoStock, notas]
    );

    await client.query('COMMIT');
    return { id, stock_actual: nuevoStock };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------
// CAJA
// Una sola caja puede estar "abierta" a la vez (lo garantiza el
// índice único en la base). Todas las ventas que se hacen
// mientras hay una caja abierta quedan asociadas a esa sesión.
// ------------------------------------------------------------

async function cajaActual() {
  const { rows } = await pool.query(
    `SELECT * FROM caja_sesiones WHERE estado = 'abierta' LIMIT 1`
  );
  return rows[0] || null;
}

async function abrirCaja(montoApertura, notas = '') {
  const actual = await cajaActual();
  if (actual) throw new Error('Ya hay una caja abierta');

  const { rows } = await pool.query(
    `INSERT INTO caja_sesiones (monto_apertura, notas) VALUES ($1, $2) RETURNING *`,
    [montoApertura, notas]
  );
  return rows[0];
}

// Devuelve el total vendido por método de pago, más los movimientos
// manuales (retiros, pagos de servicios, ingresos extra) de la sesión.
// Se suma desde venta_pagos (no desde ventas.metodo_pago) para que una
// venta dividida entre efectivo y transferencia cuente cada parte en
// el método que corresponde, en vez de caer entera en uno solo.
async function resumenCaja(sesionId) {
  const { rows: pagosRows } = await pool.query(
    `SELECT vp.metodo_pago, COALESCE(SUM(vp.monto), 0) AS total, COUNT(DISTINCT vp.venta_id) AS cantidad
     FROM venta_pagos vp
     JOIN ventas v ON v.id = vp.venta_id
     WHERE v.caja_sesion_id = $1 AND v.anulada = FALSE
     GROUP BY vp.metodo_pago`,
    [sesionId]
  );
  const porMetodo = {};
  let totalGeneral = 0;
  for (const row of pagosRows) {
    porMetodo[row.metodo_pago] = { total: Number(row.total), cantidad: Number(row.cantidad) };
    totalGeneral += Number(row.total);
  }
  const totalEfectivo = porMetodo.efectivo ? porMetodo.efectivo.total : 0;

  const { rows: movRows } = await pool.query(
    `SELECT tipo, COALESCE(SUM(monto), 0) AS total
     FROM movimientos_caja
     WHERE caja_sesion_id = $1
     GROUP BY tipo`,
    [sesionId]
  );
  let totalIngresos = 0;
  let totalEgresos = 0;
  for (const row of movRows) {
    if (row.tipo === 'ingreso') totalIngresos = Number(row.total);
    if (row.tipo === 'egreso') totalEgresos = Number(row.total);
  }

  return { porMetodo, totalGeneral, totalEfectivo, totalIngresos, totalEgresos };
}

// Registra un retiro, pago de servicio, o ingreso extra de efectivo
// que no es una venta (ej: "Pago de luz", "Retiro para el banco").
async function registrarMovimientoCaja(sesionId, tipo, monto, concepto) {
  if (!['ingreso', 'egreso'].includes(tipo)) throw new Error('Tipo de movimiento inválido');
  if (!concepto || !concepto.trim()) throw new Error('El movimiento necesita un concepto');
  if (!monto || monto <= 0) throw new Error('El monto debe ser mayor a cero');

  const { rows } = await pool.query(
    `INSERT INTO movimientos_caja (caja_sesion_id, tipo, monto, concepto)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [sesionId, tipo, monto, concepto.trim()]
  );
  return rows[0];
}

async function listarMovimientosCaja(sesionId) {
  const { rows } = await pool.query(
    `SELECT * FROM movimientos_caja WHERE caja_sesion_id = $1 ORDER BY creado_en DESC`,
    [sesionId]
  );
  return rows;
}

async function cerrarCaja(sesionId, montoContado, notas = '') {
  const sesion = await pool.query('SELECT * FROM caja_sesiones WHERE id = $1', [sesionId]);
  if (sesion.rows.length === 0) throw new Error('Sesión de caja no encontrada');
  if (sesion.rows[0].estado === 'cerrada') throw new Error('Esa caja ya está cerrada');

  const { totalEfectivo, totalIngresos, totalEgresos } = await resumenCaja(sesionId);
  const montoApertura = Number(sesion.rows[0].monto_apertura);
  const montoEsperado = montoApertura + totalEfectivo + totalIngresos - totalEgresos;
  const diferencia = Number(montoContado) - montoEsperado;

  const { rows } = await pool.query(
    `UPDATE caja_sesiones
     SET estado = 'cerrada', fecha_cierre = NOW(), monto_contado = $1,
         monto_esperado = $2, diferencia = $3, notas = COALESCE(NULLIF($4, ''), notas)
     WHERE id = $5
     RETURNING *`,
    [montoContado, montoEsperado, diferencia, notas, sesionId]
  );
  return rows[0];
}

async function listarSesionesCaja() {
  const { rows } = await pool.query(
    `SELECT * FROM caja_sesiones ORDER BY fecha_apertura DESC LIMIT 50`
  );
  return rows;
}

// ------------------------------------------------------------
// VENTAS
// items: [{ producto_id, cantidad, precio_unitario }, ...]
// Se asocian automáticamente a la caja abierta, si hay una.
// ------------------------------------------------------------

// pagos: [{ metodo_pago, monto }, ...]. Una venta puede pagarse dividida
// entre varios métodos (ej. una parte en efectivo y otra por
// transferencia).
//
// El total de la venta es lo que realmente se cobró (la suma de los pagos),
// no la suma de los precios de lista: se redondea el vuelto (1530 → 1500) o
// se le hace un descuento a una alumna del taller y la caja tiene que cuadrar
// con la plata que entró. Los precios de lista quedan igual en venta_detalle,
// así se puede ver la diferencia al abrir el detalle.
async function crearVenta(items, pagos, usuarioId = null) {
  if (!items || items.length === 0) throw new Error('La venta no tiene items');
  if (!pagos || pagos.length === 0) throw new Error('La venta no tiene forma de pago');

  const totalPagos = pagos.reduce((acc, p) => acc + Number(p.monto || 0), 0);
  if (pagos.some((p) => !(Number(p.monto) > 0))) {
    throw new Error('Cada forma de pago tiene que tener un monto mayor a cero');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cajaRows = await client.query(`SELECT id FROM caja_sesiones WHERE estado = 'abierta' LIMIT 1`);
    const cajaSesionId = cajaRows.rows[0] ? cajaRows.rows[0].id : null;

    const total = Math.round(totalPagos * 100) / 100;

    const metodoPagoResumen = pagos.length === 1 ? pagos[0].metodo_pago : 'mixto';

    const { rows: ventaRows } = await client.query(
      `INSERT INTO ventas (total, metodo_pago, caja_sesion_id, usuario_id) VALUES ($1, $2, $3, $4) RETURNING id, fecha`,
      [total, metodoPagoResumen, cajaSesionId, usuarioId]
    );
    const ventaId = ventaRows[0].id;

    for (const pago of pagos) {
      await client.query(
        `INSERT INTO venta_pagos (venta_id, metodo_pago, monto) VALUES ($1, $2, $3)`,
        [ventaId, pago.metodo_pago, Number(pago.monto)]
      );
    }

    for (const item of items) {
      const { producto_id, cantidad, precio_unitario, color, unidades_por_paquete, descripcion } = item;
      const cantidadStock = cantidad * (unidades_por_paquete || 1);
      let nuevoStock;

      if (color) {
        const { rows: colorRows } = await client.query(
          'SELECT stock FROM producto_colores WHERE producto_id = $1 AND color = $2 FOR UPDATE',
          [producto_id, color]
        );
        if (colorRows.length === 0) throw new Error(`Color "${color}" no encontrado para el producto ${producto_id}`);
        nuevoStock = Number(colorRows[0].stock) - cantidadStock;
        await client.query('UPDATE producto_colores SET stock = $1 WHERE producto_id = $2 AND color = $3', [nuevoStock, producto_id, color]);
      } else {
        const { rows: prodRows } = await client.query(
          'SELECT stock_actual FROM productos WHERE id = $1 FOR UPDATE',
          [producto_id]
        );
        if (prodRows.length === 0) throw new Error(`Producto ${producto_id} no encontrado`);
        nuevoStock = Number(prodRows[0].stock_actual) - cantidadStock;
        await client.query('UPDATE productos SET stock_actual = $1 WHERE id = $2', [nuevoStock, producto_id]);
      }

      const descripcionLimpia = descripcion && descripcion.trim() ? descripcion.trim() : null;

      await client.query(
        `INSERT INTO venta_detalle (venta_id, producto_id, cantidad, precio_unitario, subtotal, color, unidades_por_paquete, descripcion)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [ventaId, producto_id, cantidad, precio_unitario, cantidad * precio_unitario, color || null, unidades_por_paquete || null, descripcionLimpia]
      );

      await client.query(
        `INSERT INTO movimientos_stock (producto_id, tipo, motivo, cantidad, stock_resultante, venta_id, color)
         VALUES ($1, 'salida', 'venta', $2, $3, $4, $5)`,
        [producto_id, cantidadStock, nuevoStock, ventaId, color || null]
      );
    }

    await client.query('COMMIT');
    return { id: ventaId, total, caja_sesion_id: cajaSesionId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Historial de ventas, con filtro opcional de fechas.
// `descripciones` junta en un solo texto las anotaciones de los items
// (de quién es el arreglo, a nombre de quién es el taller) para poder
// mostrarlas en la lista sin abrir el detalle de cada venta.
// `pagos` trae el desglose por método (útil cuando metodo_pago = 'mixto').
async function listarVentas(filtro = {}) {
  const { desde, hasta } = filtro;
  const { rows } = await pool.query(
    `SELECT v.*, u.nombre AS vendedor_nombre,
       (SELECT string_agg(vd.descripcion, ' | ' ORDER BY vd.id)
          FROM venta_detalle vd
         WHERE vd.venta_id = v.id AND NULLIF(TRIM(vd.descripcion), '') IS NOT NULL
       ) AS descripciones,
       (SELECT json_agg(json_build_object('metodo_pago', vp.metodo_pago, 'monto', vp.monto) ORDER BY vp.id)
          FROM venta_pagos vp
         WHERE vp.venta_id = v.id
       ) AS pagos
     FROM ventas v
     LEFT JOIN usuarios u ON u.id = v.usuario_id
     WHERE v.anulada = FALSE
       AND ($1::timestamp IS NULL OR v.fecha >= $1)
       AND ($2::timestamp IS NULL OR v.fecha <= $2)
     ORDER BY v.fecha DESC
     LIMIT 200`,
    [desde || null, hasta || null]
  );
  return rows;
}

// Detalle completo de una venta puntual, con nombre de producto y el
// desglose de pagos (uno o varios métodos, según cómo se haya cobrado).
async function obtenerDetalleVenta(ventaId) {
  const { rows: venta } = await pool.query('SELECT * FROM ventas WHERE id = $1', [ventaId]);
  if (venta.length === 0) throw new Error('Venta no encontrada');

  const { rows: items } = await pool.query(
    `SELECT vd.*, p.nombre AS producto_nombre
     FROM venta_detalle vd
     JOIN productos p ON p.id = vd.producto_id
     WHERE vd.venta_id = $1`,
    [ventaId]
  );

  const { rows: pagos } = await pool.query(
    `SELECT id, metodo_pago, monto FROM venta_pagos WHERE venta_id = $1 ORDER BY id`,
    [ventaId]
  );

  return { ...venta[0], items, pagos };
}

// Corrige las descripciones de una venta ya registrada, para cuando se
// olvidaron de anotar de quién era el arreglo o el pago del taller.
// Solo toca el texto: no cambia montos, ni stock, ni método de pago.
async function actualizarDescripcionesVenta(ventaId, descripciones) {
  if (!Array.isArray(descripciones) || descripciones.length === 0) {
    throw new Error('No hay descripciones para actualizar');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { id, descripcion } of descripciones) {
      const limpia = descripcion && descripcion.trim() ? descripcion.trim() : null;
      // El filtro por venta_id evita editar el detalle de otra venta.
      await client.query(
        `UPDATE venta_detalle SET descripcion = $1 WHERE id = $2 AND venta_id = $3`,
        [limpia, id, ventaId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return obtenerDetalleVenta(ventaId);
}

// Anula una venta: devuelve el stock que había descontado (uno por uno,
// respetando color si corresponde) y la marca como anulada, para que deje
// de contar en el historial y en la caja pero sin perder el registro.
// No se puede anular dos veces, ni una que ya esté anulada.
async function anularVenta(ventaId, motivo) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: ventaRows } = await client.query(
      'SELECT id, anulada FROM ventas WHERE id = $1 FOR UPDATE',
      [ventaId]
    );
    if (ventaRows.length === 0) throw new Error('Venta no encontrada');
    if (ventaRows[0].anulada) throw new Error('Esa venta ya está anulada');

    const { rows: salidas } = await client.query(
      `SELECT producto_id, cantidad, color
         FROM movimientos_stock
        WHERE venta_id = $1 AND tipo = 'salida' AND motivo = 'venta'
        ORDER BY id`,
      [ventaId]
    );

    for (const mov of salidas) {
      let nuevoStock;
      if (mov.color) {
        const { rows } = await client.query(
          'SELECT stock FROM producto_colores WHERE producto_id = $1 AND color = $2 FOR UPDATE',
          [mov.producto_id, mov.color]
        );
        if (rows.length === 0) throw new Error(`Color "${mov.color}" no encontrado para el producto ${mov.producto_id}`);
        nuevoStock = Number(rows[0].stock) + Number(mov.cantidad);
        await client.query(
          'UPDATE producto_colores SET stock = $1 WHERE producto_id = $2 AND color = $3',
          [nuevoStock, mov.producto_id, mov.color]
        );
      } else {
        const { rows } = await client.query(
          'SELECT stock_actual FROM productos WHERE id = $1 FOR UPDATE',
          [mov.producto_id]
        );
        if (rows.length === 0) throw new Error(`Producto ${mov.producto_id} no encontrado`);
        nuevoStock = Number(rows[0].stock_actual) + Number(mov.cantidad);
        await client.query('UPDATE productos SET stock_actual = $1 WHERE id = $2', [nuevoStock, mov.producto_id]);
      }

      await client.query(
        `INSERT INTO movimientos_stock (producto_id, tipo, motivo, cantidad, stock_resultante, venta_id, color, notas)
         VALUES ($1, 'entrada', 'devolucion', $2, $3, $4, $5, $6)`,
        [mov.producto_id, mov.cantidad, nuevoStock, ventaId, mov.color, 'Reverso automático por anulación de venta']
      );
    }

    const notaLimpia = motivo && motivo.trim() ? motivo.trim() : null;
    await client.query(
      `UPDATE ventas
          SET anulada = TRUE,
              notas = COALESCE(notas || ' | ', '') || COALESCE($2, 'Venta anulada')
        WHERE id = $1`,
      [ventaId, notaLimpia]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return obtenerDetalleVenta(ventaId);
}

async function stockBajo() {
  const { rows } = await pool.query('SELECT * FROM vista_stock_bajo ORDER BY nombre');
  return rows;
}

module.exports = {
  crearUsuario,
  listarUsuarios,
  actualizarPermisoProducto,
  verificarLogin,
  listarProductos,
  crearProducto,
  actualizarProducto,
  ajustarStock,
  agregarColorProducto,
  eliminarColorProducto,
  sumarStockColor,
  listarColoresDistintos,
  crearVenta,
  listarVentas,
  obtenerDetalleVenta,
  actualizarDescripcionesVenta,
  anularVenta,
  stockBajo,
  cajaActual,
  abrirCaja,
  cerrarCaja,
  resumenCaja,
  listarSesionesCaja,
  registrarMovimientoCaja,
  listarMovimientosCaja,
};
