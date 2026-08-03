// Script para cargar el catálogo inicial de productos desde
// data/productos_iniciales.json. Se puede correr más de una vez:
// si un producto con el mismo nombre ya existe, se lo salta.
//
// Uso:
//   node scripts/importar-productos.js

const path = require('path');
const { Pool } = require('pg');
const readline = require('readline');

const productos = require('../data/productos_iniciales.json');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const preguntar = (texto) => new Promise((resolve) => rl.question(texto, resolve));

async function main() {
  console.log('=== Importar catálogo inicial de productos — Almacén de Costura ===\n');
  console.log(`Se van a procesar ${productos.length} productos desde data/productos_iniciales.json\n`);

  console.log('Datos de conexión a la base de datos (Enter para usar el valor por defecto):');
  const host = (await preguntar('Host [localhost]: ')) || 'localhost';
  const port = (await preguntar('Puerto [5432]: ')) || '5432';
  const database = (await preguntar('Base de datos [almacen_costura]: ')) || 'almacen_costura';
  const user = (await preguntar('Usuario de postgres [postgres]: ')) || 'postgres';
  const password = await preguntar('Contraseña de postgres: ');
  const usarSsl = (await preguntar('¿Requiere SSL? (s/N) [N]: ')) || 'n';

  const pool = new Pool({
    host,
    port: Number(port),
    database,
    user,
    password,
    ssl: usarSsl.toLowerCase() === 's' ? { rejectUnauthorized: false } : undefined,
  });

  let creados = 0;
  let saltados = 0;

  try {
    for (const p of productos) {
      const existe = await pool.query('SELECT id FROM productos WHERE nombre = $1', [p.nombre]);
      if (existe.rows.length > 0) {
        saltados++;
        continue;
      }
      await pool.query(
        `INSERT INTO productos (nombre, categoria, descripcion, precio_venta, unidad_medida, stock_actual, stock_minimo)
         VALUES ($1, $2, $3, $4, 'unidad', 0, 0)`,
        [p.nombre, p.categoria || null, p.descripcion || null, p.precio_venta]
      );
      creados++;
    }
    console.log(`\n✅ Listo. Productos creados: ${creados}. Ya existían (saltados): ${saltados}.`);
  } catch (err) {
    console.error('\n❌ Error al importar:', err.message);
  } finally {
    await pool.end();
    rl.close();
  }
}

main();
