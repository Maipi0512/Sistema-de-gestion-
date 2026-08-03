// Script para crear el primer usuario administrador.
// Se corre una sola vez, desde la terminal, ANTES de usar la app
// por primera vez (porque para crear vendedores desde la app hay
// que estar logueado como admin, y todavía no existe ninguno).
//
// Uso:
//   node scripts/crear-admin.js
//
// Te va a pedir los datos de conexión a la base y los datos del
// usuario administrador a crear.

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const preguntar = (texto) => new Promise((resolve) => rl.question(texto, resolve));

async function main() {
  console.log('=== Crear usuario administrador — Almacén de Costura ===\n');

  console.log('Datos de conexión a la base de datos (Enter para usar el valor por defecto):');
  const host = (await preguntar('Host [localhost]: ')) || 'localhost';
  const port = (await preguntar('Puerto [5432]: ')) || '5432';
  const database = (await preguntar('Base de datos [almacen_costura]: ')) || 'almacen_costura';
  const user = (await preguntar('Usuario de postgres [postgres]: ')) || 'postgres';
  const password = await preguntar('Contraseña de postgres: ');

  const pool = new Pool({ host, port: Number(port), database, user, password });

  console.log('\nDatos del administrador a crear:');
  const nombre = await preguntar('Nombre completo: ');
  const usuario = await preguntar('Usuario (para iniciar sesión): ');
  const passwordAdmin = await preguntar('Contraseña: ');

  try {
    const hash = await bcrypt.hash(passwordAdmin, 10);
    await pool.query(
      `INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES ($1, $2, $3, 'admin')`,
      [nombre, usuario, hash]
    );
    console.log(`\n✅ Usuario administrador "${usuario}" creado correctamente.`);
  } catch (err) {
    console.error('\n❌ Error al crear el usuario:', err.message);
  } finally {
    await pool.end();
    rl.close();
  }
}

main();
