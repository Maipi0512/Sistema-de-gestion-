-- ============================================================
-- Almacén de Costura — Sistema de Gestión de Ventas y Stock
-- Base de datos: PostgreSQL (servidor local en red)
-- Incluye: productos, stock, ventas, historial y control de caja
-- ============================================================

-- ------------------------------------------------------------
-- USUARIOS (vendedores / administradores)
-- Cada uno tiene su propio login. El rol 'admin' puede crear
-- otros usuarios; 'vendedor' solo vende y consulta.
-- ------------------------------------------------------------
CREATE TABLE usuarios (
    id             SERIAL PRIMARY KEY,
    nombre         VARCHAR(150) NOT NULL,
    usuario        VARCHAR(50) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    rol            VARCHAR(20) NOT NULL DEFAULT 'vendedor' CHECK (rol IN ('admin', 'vendedor')),
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    puede_editar_productos BOOLEAN NOT NULL DEFAULT FALSE, -- si un vendedor puede crear/editar productos y stock
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- PRODUCTOS
-- stock_actual se actualiza SIEMPRE a través de movimientos_stock
-- (ventas o ajustes), nunca se edita directo.
-- ------------------------------------------------------------
CREATE TABLE productos (
    id                     SERIAL PRIMARY KEY,
    codigo                 VARCHAR(50) UNIQUE,
    nombre                 VARCHAR(200) NOT NULL,
    descripcion            TEXT,
    categoria              VARCHAR(50),
    precio_costo           NUMERIC(12,2) NOT NULL DEFAULT 0,
    precio_venta           NUMERIC(12,2) NOT NULL,
    precio_variable        BOOLEAN NOT NULL DEFAULT FALSE,      -- si TRUE, el precio se carga al vender (ej. arreglos, talleres)
    precio_paquete         NUMERIC(12,2),                       -- precio si se vende por paquete (opcional)
    unidades_por_paquete   NUMERIC(12,2),                       -- cuántas unidades trae ese paquete
    unidad_medida          VARCHAR(20) NOT NULL DEFAULT 'unidad', -- 'unidad', 'metro', 'rollo', 'paquete'
    stock_actual           NUMERIC(12,2) NOT NULL DEFAULT 0,
    stock_minimo           NUMERIC(12,2) NOT NULL DEFAULT 0,      -- dispara alerta de stock bajo
    activo                 BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_productos_nombre ON productos USING gin (to_tsvector('spanish', nombre));

-- ------------------------------------------------------------
-- COLORES POR PRODUCTO
-- Lista informativa de colores disponibles para un producto
-- (ej. cierres). El stock es único y compartido por producto,
-- no se lleva stock separado por color.
-- ------------------------------------------------------------
CREATE TABLE producto_colores (
    id           SERIAL PRIMARY KEY,
    producto_id  INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    color        VARCHAR(50) NOT NULL,
    stock        NUMERIC(12,2) NOT NULL DEFAULT 0,
    UNIQUE (producto_id, color)
);

-- ------------------------------------------------------------
-- CAJA — control de apertura/cierre de caja por turno o por día
-- ------------------------------------------------------------
CREATE TABLE caja_sesiones (
    id                 SERIAL PRIMARY KEY,
    fecha_apertura     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    monto_apertura     NUMERIC(12,2) NOT NULL DEFAULT 0,   -- efectivo con el que se abre la caja
    fecha_cierre       TIMESTAMPTZ,
    monto_contado      NUMERIC(12,2),                      -- efectivo contado físicamente al cerrar
    monto_esperado     NUMERIC(12,2),                       -- apertura + ventas en efectivo (calculado al cerrar)
    diferencia         NUMERIC(12,2),                       -- monto_contado - monto_esperado
    estado             VARCHAR(10) NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
    notas              TEXT,
    creado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Solo puede haber una caja abierta a la vez
CREATE UNIQUE INDEX idx_una_caja_abierta ON caja_sesiones (estado) WHERE estado = 'abierta';

-- ------------------------------------------------------------
-- MOVIMIENTOS DE CAJA (no son ventas)
-- Retiros de efectivo, pagos de servicios, ingresos extra, etc.
-- Se usan junto con las ventas en efectivo para calcular el
-- efectivo esperado al cerrar la caja.
-- ------------------------------------------------------------
CREATE TABLE movimientos_caja (
    id             SERIAL PRIMARY KEY,
    caja_sesion_id INTEGER NOT NULL REFERENCES caja_sesiones(id),
    tipo           VARCHAR(10) NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
    monto          NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    concepto       VARCHAR(200) NOT NULL,  -- ej: "Retiro", "Pago de luz", "Pago a proveedor"
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_movimientos_caja_sesion ON movimientos_caja(caja_sesion_id);

-- ------------------------------------------------------------
-- MOVIMIENTOS DE STOCK
-- Fuente de verdad de toda entrada/salida: ventas, ajustes
-- manuales (rotura, pérdida, conteo físico, reposición).
-- ------------------------------------------------------------
CREATE TABLE movimientos_stock (
    id               SERIAL PRIMARY KEY,
    producto_id      INTEGER NOT NULL REFERENCES productos(id),
    tipo             VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada', 'salida')),
    motivo           VARCHAR(30) NOT NULL CHECK (motivo IN ('venta', 'ajuste_manual', 'devolucion')),
    cantidad         NUMERIC(12,2) NOT NULL,
    stock_resultante NUMERIC(12,2) NOT NULL,
    color            VARCHAR(50),          -- si el movimiento es de un color puntual del producto
    venta_id         INTEGER,
    notas            TEXT,
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_movimientos_producto ON movimientos_stock(producto_id);
CREATE INDEX idx_movimientos_fecha ON movimientos_stock(creado_en);

-- ------------------------------------------------------------
-- CLIENTES
-- Registro básico para poder llevarles cuenta corriente (fiado).
-- ------------------------------------------------------------
CREATE TABLE clientes (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(150) NOT NULL,
    telefono    VARCHAR(50),
    notas       TEXT,
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clientes_nombre ON clientes USING gin (to_tsvector('spanish', nombre));

-- ------------------------------------------------------------
-- VENTAS (cabecera) — historial completo de ventas realizadas
-- ------------------------------------------------------------
CREATE TABLE ventas (
    id             SERIAL PRIMARY KEY,
    fecha          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total          NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Resumen del/de los pago(s): el método único si se pagó con uno solo,
    -- o 'mixto' si se dividió entre varios. El detalle real de cuánto se
    -- pagó con cada método vive en venta_pagos.
    metodo_pago    VARCHAR(30) NOT NULL DEFAULT 'efectivo' CHECK (metodo_pago IN ('efectivo', 'debito', 'credito', 'transferencia', 'mercado_pago', 'mixto', 'cuenta_corriente')),
    caja_sesion_id INTEGER REFERENCES caja_sesiones(id),  -- a qué turno de caja pertenece (si había una abierta)
    usuario_id     INTEGER REFERENCES usuarios(id),        -- qué vendedor hizo la venta
    cliente_id     INTEGER REFERENCES clientes(id),        -- a qué cliente pertenece, si se vendió a cuenta corriente
    anulada        BOOLEAN NOT NULL DEFAULT FALSE,
    notas          TEXT,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ventas_fecha ON ventas(fecha);
CREATE INDEX idx_ventas_caja ON ventas(caja_sesion_id);

-- ------------------------------------------------------------
-- PAGOS DE VENTA
-- Una venta puede pagarse con más de un método a la vez (ej. una
-- parte en efectivo y otra por transferencia). La suma de montos
-- de una venta siempre debe ser igual a ventas.total.
-- ------------------------------------------------------------
CREATE TABLE venta_pagos (
    id          SERIAL PRIMARY KEY,
    venta_id    INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    metodo_pago VARCHAR(30) NOT NULL CHECK (metodo_pago IN ('efectivo', 'debito', 'credito', 'transferencia', 'mercado_pago', 'cuenta_corriente')),
    monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0)
);

CREATE INDEX idx_venta_pagos_venta ON venta_pagos(venta_id);

-- ------------------------------------------------------------
-- CUENTA CORRIENTE DE CLIENTES
-- Cada fila es UN cargo (venta a cuenta) o UN pago (abono). El saldo
-- de un cliente es la suma de sus cargos menos la suma de sus pagos;
-- no se guarda como columna aparte para no tener que mantenerlo
-- sincronizado a mano.
-- ------------------------------------------------------------
CREATE TABLE cuenta_corriente_movimientos (
    id          SERIAL PRIMARY KEY,
    cliente_id  INTEGER NOT NULL REFERENCES clientes(id),
    tipo        VARCHAR(10) NOT NULL CHECK (tipo IN ('cargo', 'pago')),
    monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    -- Con qué se cobró el abono (solo aplica a tipo = 'pago'). Si fue en
    -- efectivo y había una caja abierta, ese abono también se refleja
    -- como ingreso en movimientos_caja para que cuadre el cajón.
    metodo_pago VARCHAR(30) CHECK (metodo_pago IN ('efectivo', 'debito', 'credito', 'transferencia', 'mercado_pago')),
    venta_id    INTEGER REFERENCES ventas(id),   -- si el cargo vino de una venta hecha a cuenta
    usuario_id  INTEGER REFERENCES usuarios(id), -- quién registró el movimiento
    notas       TEXT,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cc_movimientos_cliente ON cuenta_corriente_movimientos(cliente_id);

-- Saldo actual por cliente, para el listado de Clientes sin tener que
-- sumar los movimientos a mano desde el renderer.
CREATE VIEW vista_saldo_clientes AS
SELECT c.id, c.nombre, c.telefono, c.notas, c.activo,
       COALESCE(SUM(CASE WHEN m.tipo = 'cargo' THEN m.monto WHEN m.tipo = 'pago' THEN -m.monto ELSE 0 END), 0) AS saldo
FROM clientes c
LEFT JOIN cuenta_corriente_movimientos m ON m.cliente_id = c.id
GROUP BY c.id, c.nombre, c.telefono, c.notas, c.activo;

-- ------------------------------------------------------------
-- DETALLE DE VENTA
-- ------------------------------------------------------------
CREATE TABLE venta_detalle (
    id                    SERIAL PRIMARY KEY,
    venta_id              INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id           INTEGER NOT NULL REFERENCES productos(id),
    cantidad              NUMERIC(12,2) NOT NULL,
    precio_unitario       NUMERIC(12,2) NOT NULL,
    subtotal              NUMERIC(12,2) NOT NULL,
    color                 VARCHAR(50),          -- color elegido, si el producto tiene colores
    unidades_por_paquete  NUMERIC(12,2),        -- si se vendió por paquete, cuántas unidades traía
    descripcion           TEXT                  -- de quién es el arreglo / a nombre de quién es el pago del taller
);

CREATE INDEX idx_venta_detalle_venta ON venta_detalle(venta_id);
CREATE INDEX idx_venta_detalle_producto ON venta_detalle(producto_id);

ALTER TABLE movimientos_stock
    ADD CONSTRAINT fk_movimiento_venta FOREIGN KEY (venta_id) REFERENCES ventas(id);

-- ------------------------------------------------------------
-- VISTA: productos con stock bajo (para el dashboard)
-- ------------------------------------------------------------
CREATE VIEW vista_stock_bajo AS
SELECT id, codigo, nombre, stock_actual, stock_minimo, unidad_medida
FROM productos
WHERE activo = TRUE AND stock_actual <= stock_minimo;

-- ------------------------------------------------------------
-- Mantener actualizado_en al día en productos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_productos_actualizado
BEFORE UPDATE ON productos
FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

-- ------------------------------------------------------------
-- SEGURIDAD: Row-Level Security
-- Si esta base vive en Supabase (u otro proveedor que exponga una
-- API REST automática sobre el esquema "public"), hay que activar
-- RLS en cada tabla para que no quede accesible desde afuera de la
-- app. No se agregan políticas: esta app se conecta como el usuario
-- dueño de las tablas (ver config.json), que siempre bypasea RLS, así
-- que esto no le cambia nada a la app — solo bloquea el acceso por
-- la API REST, que no se usa.
-- ------------------------------------------------------------
ALTER TABLE usuarios                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto_colores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE caja_sesiones                ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja             ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_stock            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_pagos                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_detalle                ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuenta_corriente_movimientos ENABLE ROW LEVEL SECURITY;
