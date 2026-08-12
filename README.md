# Almacén de Costura — Sistema de Gestión de Ventas y Stock

App de escritorio (Electron + React) con base de datos PostgreSQL
en red local. Pensada para correr en la PC del local, sin depender
de internet.

## Estructura

```
almacen-costura-sistema/
├── db/
│   ├── schema.sql          # Esquema de la base de datos
│   └── migracion-01-*.sql  # Cambios a aplicar sobre una base ya creada
├── electron/
│   ├── main.js              # Proceso principal (ventana + IPC)
│   ├── preload.js           # Puente seguro hacia React
│   └── db.js                # Conexión a Postgres y lógica de negocio
├── src/
│   ├── pantallas/
│   │   ├── Dashboard.jsx    # Alertas de stock bajo
│   │   ├── Productos.jsx    # Alta y listado de productos
│   │   ├── Clientes.jsx     # Clientes y cuenta corriente (fiado/abonos)
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

**Si la base ya estaba creada de antes**, no hay que volver a correr
`schema.sql` (borraría todo). En su lugar, correr las migraciones que
falten, una sola vez cada una:

```sql
\c almacen_costura
\i 'C:/ruta/completa/al/proyecto/db/migracion-01-descripcion-venta.sql'
\i 'C:/ruta/completa/al/proyecto/db/migracion-02-multipago.sql'
\i 'C:/ruta/completa/al/proyecto/db/migracion-03-cuenta-corriente.sql'
\i 'C:/ruta/completa/al/proyecto/db/migracion-04-seguridad-rls.sql'
```

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

El instalador queda en la carpeta `release/`. Este comando arma el
`.exe` **local**, sin publicarlo a ningún lado — sirve para probar.
Para la instalación real en el local, mejor usar el flujo de
auto-actualización de abajo.

## Auto-actualización (instalar una vez, actualizar sin reinstalar)

La app usa `electron-updater` (ver [electron/main.js](electron/main.js)):
cada vez que arranca, revisa si hay una versión más nueva publicada
como Release en GitHub, la descarga sola en segundo plano (sin avisar,
sin interrumpir una venta) y la instala la próxima vez que alguien
cierra el programa normalmente. Por eso el instalador se pone **una
sola vez** en cada PC del local — de ahí en más se actualizan solas.

Requiere internet para chequear/bajar la actualización; si no hay
internet, falla en silencio y la app sigue funcionando con la versión
que ya tenía instalada.

### `git commit`/`push` vs. `electron:publish` — cuál usar

Son dos cosas distintas y hay que hacer las dos, en este orden, cada
vez que se cambia código de la app:

| Comando | Qué hace | Actualiza las PCs del local? |
|---|---|---|
| `git commit` / `git push` | Guarda el cambio en el historial del repositorio (backup, referencia) | No |
| `npm run electron:publish` | Compila, arma el `.exe` y sube un Release nuevo a GitHub | Sí — es lo único que `electron-updater` chequea |

Flujo completo para un cambio en `electron/` o `src/`:

1. Hacer el cambio en el código.
2. `git add .` → `git commit -m "..."` → `git push` (queda guardado
   en el repositorio).
3. Subir el número de versión en [package.json](package.json)
   (ej. `1.0.1` → `1.0.2`), a mano o con `npm version patch`
   (ver detalle en "Publicar un cambio nuevo" más abajo).
4. `npm run electron:publish` (esto sí llega a las PCs del local).

Si el cambio es solo en documentación (como este README), alcanza
con el paso 2 — no hace falta tocar la versión ni publicar.

### Primera vez: generar el token de GitHub

Hace falta un token para poder publicar releases desde la terminal:

1. Ir a https://github.com/settings/tokens?type=beta →
   **Generate new token**.
2. **Repository access** → **Only select repositories** →
   `Sistema-de-gestion-`.
3. **Permissions** → **Repository permissions** → **Contents** →
   **Read and write**.
4. **Generate token** y copiarlo (empieza con `github_pat_...`).
   GitHub lo muestra **una sola vez**.

**Nunca pegues el token en un chat, commit, ni archivo del repo** —
quien lo tenga puede publicar código a tu nombre. Si en algún momento
se expone, revocalo en la misma pantalla (`Delete`) y generá uno
nuevo.

### Publicar un cambio nuevo

Cada vez que modifiques el código y quieras que llegue a las PCs del
local, en PowerShell:

```powershell
cd almacen-costura-sistema
$env:GH_TOKEN = "tu_token"
npm run electron:publish
```

Antes de correrlo, **subí el número de versión** en
[package.json](package.json) (ej. `1.0.1` → `1.0.2`) — sin eso,
`electron-updater` no detecta que hay algo nuevo, porque compara
versiones. Se puede editar el archivo a mano, o con un comando:

```powershell
npm version patch
```

Sube el último número (`1.0.2` → `1.0.3`). Ojo: este comando además
**hace un commit y un tag de git automáticamente** con ese cambio,
así que conviene no tener otros cambios sin commitear antes de
correrlo (si los hay, va a fallar).

Esto compila, arma el instalador y lo sube como Release nuevo a
GitHub (`https://github.com/Maipi0512/Sistema-de-gestion-/releases`),
junto con el `latest.yml` que usan las apps ya instaladas para
comparar versiones.

### Problemas comunes al publicar (Windows)

**"la ejecución de scripts está deshabilitada en este sistema"**
al correr `npm install` o `npm run ...`: es una política de
PowerShell. Se soluciona una sola vez, por usuario:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**"Cannot create symbolic link"** al correr `electron:publish`
(falla bajando `winCodeSign`): Windows no deja crear symlinks sin
permisos de administrador. Activar el **Modo de desarrollador** una
sola vez: `Configuración → Privacidad y seguridad → Para
desarrolladores → Modo de desarrollador → activar`. Después, cerrar y
volver a abrir PowerShell.

### Instalar por primera vez en una PC del local

Bajar el `.exe` del último Release en GitHub (o usar el que queda en
`release/` al publicar) y correrlo una vez en cada PC. De ahí en más,
esa PC se actualiza sola cada vez que se publique una versión nueva —
no hace falta volver a instalar a mano.

## Funcionalidades

- **Login por vendedor**: cada persona que vende tiene su propio
  usuario y contraseña. Las ventas quedan asociadas a quién las hizo.
- **Productos**: alta, listado, búsqueda, alerta de stock bajo.
- **Vender**: punto de venta, descuenta stock automáticamente. Cada
  producto de la venta puede llevar una **descripción** para anotar de
  quién es (ej. "arreglo de Marta", "taller de tejido — Ana"). En los
  arreglos y pagos de taller (productos con precio variable) la
  descripción es obligatoria, para que no quede ninguno sin dueño.
  Una venta se puede **pagar con más de un método a la vez** (ej. una
  parte en efectivo y otra por transferencia); la pantalla no deja
  confirmar si lo cargado en las formas de pago no cubre exactamente
  el total.
- **Historial de ventas**: todas las ventas con fecha, vendedor, cliente
  (si se vendió a cuenta corriente), descripción, total y detalle de
  productos vendidos. Desde el detalle se pueden **editar las
  descripciones** de una venta ya registrada, por si en el momento se
  olvidaron de anotar de quién era. Editar la descripción no toca
  montos, stock ni método de pago.
- **Clientes / Cuenta corriente**: alta de clientes (nombre, teléfono,
  notas). En **Vender**, "Cuenta corriente" es una forma de pago más
  (se puede combinar con otras, ej. una parte en efectivo y el resto
  fiado): al confirmar la venta, esa parte queda como deuda del
  cliente elegido. Desde **Clientes** se ve el saldo de cada uno, el
  historial completo de cargos y pagos, y se registran **abonos**
  (parciales o totales) indicando con qué se cobraron. Un abono en
  efectivo se suma automáticamente como ingreso en la caja abierta, si
  hay una. Si se **anula** una venta que tenía una parte a cuenta
  corriente, esa deuda se revierte sola. Requiere haber corrido
  `migracion-03-cuenta-corriente.sql` sobre una base ya existente.
- **Caja**: apertura con monto inicial, cierre con conteo físico y
  cálculo automático de diferencia (sobrante/faltante). La caja muestra
  **solo lo cobrado en efectivo**, porque es lo único que queda
  físicamente en el cajón; transferencias, débito, crédito y Mercado
  Pago se consultan en el Historial de ventas. Lo vendido a cuenta
  corriente en el turno se muestra aparte, a modo informativo (tampoco
  es plata física hasta que el cliente pague).
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
