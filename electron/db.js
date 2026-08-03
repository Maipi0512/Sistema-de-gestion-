const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { app } = require('electron');

// ------------------------------------------------------------
// CONFIGURACIÓN DE CONEXIÓN
// Se guarda en un config.json en la carpeta de datos de usuario,
// así cada PC puede apuntar a una IP distinta sin tocar código:
//  - La PC "servidor" usa host: "localhost"
//  - La PC "cliente" usa host: "192.168.1.X" (la IP del servidor)
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

const pool = new Pool(cargarConfig());

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
    `SELECT id, nombre, usuario, rol, activo FROM usuarios ORDER BY nombre`
  );
  return rows;
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

async function listarProductos(filtro = '') {
  const { rows } = await pool.query(
    `SELECT p.*, COALESCE(array_agg(pc.color) FILTER (WHERE pc.color IS NOT NULL), '{}') AS colores
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
    codigo, nombre, descripcion, categoria, precio_costo, precio_venta,
    precio_paquete, unidades_por_paquete, unidad_medida, stock_inicial, stock_minimo,
  } = producto;
  const { rows } = await pool.query(
    `INSERT INTO productos (codigo, nombre, descripcion, categoria, precio_costo, precio_venta, precio_paquete, unidades_por_paquete, unidad_medida, stock_actual, stock_minimo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      codigo || null, nombre, descripcion || null, categoria || null,
      precio_costo || 0, precio_venta, precio_paquete || null, unidades_por_paquete || null,
      unidad_medida || 'unidad', stock_inicial || 0, stock_minimo || 0,
    ]
  );
  return rows[0];
}

// ------------------------------------------------------------
// COLORES DE PRODUCTO
// Lista informativa por producto (el stock es único y compartido,
// no se lleva stock separado por color).
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
async function resumenCaja(sesionId) {
  const { rows: ventasRows } = await pool.query(
    `SELECT metodo_pago, COALESCE(SUM(total), 0) AS total, COUNT(*) AS cantidad
     FROM ventas
     WHERE caja_sesion_id = $1 AND anulada = FALSE
     GROUP BY metodo_pago`,
    [sesionId]
  );
  const porMetodo = {};
  let totalGeneral = 0;
  for (const row of ventasRows) {
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

async function crearVenta(items, metodoPago = 'efectivo', usuarioId = null) {
  if (!items || items.length === 0) throw new Error('La venta no tiene items');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cajaRows = await client.query(`SELECT id FROM caja_sesiones WHERE estado = 'abierta' LIMIT 1`);
    const cajaSesionId = cajaRows.rows[0] ? cajaRows.rows[0].id : null;

    const total = items.reduce((acc, it) => acc + it.cantidad * it.precio_unitario, 0);

    const { rows: ventaRows } = await client.query(
      `INSERT INTO ventas (total, metodo_pago, caja_sesion_id, usuario_id) VALUES ($1, $2, $3, $4) RETURNING id, fecha`,
      [total, metodoPago, cajaSesionId, usuarioId]
    );
    const ventaId = ventaRows[0].id;

    for (const item of items) {
      const { producto_id, cantidad, precio_unitario, color, unidades_por_paquete } = item;
      const cantidadStock = cantidad * (unidades_por_paquete || 1);

      const { rows: prodRows } = await client.query(
        'SELECT stock_actual FROM productos WHERE id = $1 FOR UPDATE',
        [producto_id]
      );
      if (prodRows.length === 0) throw new Error(`Producto ${producto_id} no encontrado`);

      const stockActual = Number(prodRows[0].stock_actual);
      if (stockActual < cantidadStock) {
        throw new Error(`Stock insuficiente para el producto ${producto_id}`);
      }
      const nuevoStock = stockActual - cantidadStock;

      await client.query('UPDATE productos SET stock_actual = $1 WHERE id = $2', [nuevoStock, producto_id]);

      await client.query(
        `INSERT INTO venta_detalle (venta_id, producto_id, cantidad, precio_unitario, subtotal, color, unidades_por_paquete)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [ventaId, producto_id, cantidad, precio_unitario, cantidad * precio_unitario, color || null, unidades_por_paquete || null]
      );

      await client.query(
        `INSERT INTO movimientos_stock (producto_id, tipo, motivo, cantidad, stock_resultante, venta_id)
         VALUES ($1, 'salida', 'venta', $2, $3, $4)`,
        [producto_id, cantidadStock, nuevoStock, ventaId]
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
async function listarVentas(filtro = {}) {
  const { desde, hasta } = filtro;
  const { rows } = await pool.query(
    `SELECT v.*, u.nombre AS vendedor_nombre
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

// Detalle completo de una venta puntual, con nombre de producto.
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
  return { ...venta[0], items };
}

async function stockBajo() {
  const { rows } = await pool.query('SELECT * FROM vista_stock_bajo ORDER BY nombre');
  return rows;
}

module.exports = {
  crearUsuario,
  listarUsuarios,
  verificarLogin,
  listarProductos,
  crearProducto,
  actualizarProducto,
  ajustarStock,
  agregarColorProducto,
  eliminarColorProducto,
  listarColoresDistintos,
  crearVenta,
  listarVentas,
  obtenerDetalleVenta,
  stockBajo,
  cajaActual,
  abrirCaja,
  cerrarCaja,
  resumenCaja,
  listarSesionesCaja,
  registrarMovimientoCaja,
  listarMovimientosCaja,
};
