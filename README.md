# Almacén de Costura — Sistema de Gestión de Ventas y Stock

App de escritorio (Electron + React) con base de datos PostgreSQL
en red local. Pensada para correr en la PC del local, sin depender
de internet.

## Estructura

```
almacen-costura-sistema/
├── db/
│   └── schema.sql          # Esquema de la base de datos
├── electron/
│   ├── main.js              # Proceso principal (ventana + IPC)
│   ├── preload.js           # Puente seguro hacia React
│   └── db.js                # Conexión a Postgres y lógica de negocio
├── src/
│   ├── pantallas/
│   │   ├── Dashboard.jsx    # Alertas de stock bajo
│   │   ├── Productos.jsx    # Alta y listado de productos
│   │   └── Vender.jsx       # Punto de venta
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── index.html
├── package.json
└── vite.config.js
```

## Instalación

### 1. Instalar PostgreSQL

Descargar e instalar desde https://www.postgresql.org/download/windows/
(elegí la versión para Windows si el local usa Windows).

Durante la instalación te va a pedir una contraseña para el usuario
`postgres` — anotala, la vas a necesitar en el paso 3.

### 2. Crear la base de datos

Abrí "SQL Shell (psql)" (se instala junto con Postgres) y ejecutá:

```sql
CREATE DATABASE almacen_costura;
\c almacen_costura
\i 'C:/ruta/completa/al/proyecto/db/schema.sql'
```

(Ajustá la ruta del `\i` a donde hayas guardado el proyecto)

### 3. Instalar dependencias del proyecto

Con Node.js instalado (https://nodejs.org, versión LTS):

```bash
cd almacen-costura-sistema
npm install
```

### 4. Configurar la conexión

La primera vez que corras la app, se crea automáticamente un archivo
de configuración en:

`%APPDATA%/almacen-costura-sistema/config.json` (Windows)

Abrilo y poné la contraseña que elegiste en el paso 1:

```json
{
  "host": "localhost",
  "port": 5432,
  "user": "postgres",
  "password": "TU_CONTRASEÑA_ACA",
  "database": "almacen_costura"
}
```

**Si vas a conectar una segunda PC** (para consultar stock sin
vender, por ejemplo): en esa segunda PC cambiá `"host": "localhost"`
por la IP de la PC que tiene Postgres instalado (ej: `"192.168.1.10"`),
y asegurate de que Postgres acepte conexiones externas (ver nota
abajo).

### 5. Crear el primer usuario administrador

La app pide login, así que antes de abrirla por primera vez hay que
crear un admin desde la terminal:

```bash
node scripts/crear-admin.js
```

Te va a pedir los datos de conexión (Enter para usar los valores
por defecto si coinciden con el `config.json`) y los datos del
administrador. Una vez logueada como admin, desde la pantalla
**Vendedores** podés crear el resto de los usuarios (tu mamá, otros
vendedores, etc.) sin volver a tocar la terminal.

### 6. Correr la app en modo desarrollo

```bash
npm run electron:dev
```

### 7. Generar el instalador (.exe)

Cuando esté lista para usar en el local:

```bash
npm run electron:build
```

El instalador queda en la carpeta `release/`.

## Funcionalidades

- **Login por vendedor**: cada persona que vende tiene su propio
  usuario y contraseña. Las ventas quedan asociadas a quién las hizo.
- **Productos**: alta, listado, búsqueda, alerta de stock bajo.
- **Vender**: punto de venta, descuenta stock automáticamente.
- **Historial de ventas**: todas las ventas con fecha, vendedor,
  total y detalle de productos vendidos.
- **Caja**: apertura con monto inicial, resumen de ventas por
  método de pago durante el turno, cierre con conteo físico y
  cálculo automático de diferencia (sobrante/faltante).
- **Exportar a Excel**: tanto el listado de productos como el
  historial de ventas (respetando el filtro de fechas que hayas
  aplicado) se pueden exportar a un `.xlsx` con un botón.
- **Vendedores** (solo admin): alta de nuevos usuarios.

## Nota sobre acceso desde una segunda PC

Por defecto, Postgres solo acepta conexiones desde la misma PC.
Para permitir que otra PC de la red se conecte, hay que:

1. Editar `postgresql.conf` → `listen_addresses = '*'`
2. Editar `pg_hba.conf` → agregar una línea permitiendo la IP de
   la red local (ej: `192.168.1.0/24`)
3. Reiniciar el servicio de Postgres

Si en algún momento necesitás ayuda con este paso, avisame y lo
armamos juntos con la IP real de las PCs del local.
