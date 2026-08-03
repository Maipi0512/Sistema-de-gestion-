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
    creado_en      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- PRODUCTOS
-- stock_actual se actualiza SIEMPRE a través de movimientos_stock
-- (ventas o ajustes), nunca se edita directo.
-- ------------------------------------------------------------
CREATE TABLE productos (
    id              SERIAL PRIMARY KEY,
    codigo          VARCHAR(50) UNIQUE,
    nombre          VARCHAR(200) NOT NULL,
    descripcion     TEXT,
    precio_costo    NUMERIC(12,2) NOT NULL DEFAULT 0,
    precio_venta    NUMERIC(12,2) NOT NULL,
    unidad_medida   VARCHAR(20) NOT NULL DEFAULT 'unidad', -- 'unidad', 'metro', 'rollo', 'paquete'
    stock_actual    NUMERIC(12,2) NOT NULL DEFAULT 0,
    stock_minimo    NUMERIC(12,2) NOT NULL DEFAULT 0,      -- dispara alerta de stock bajo
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMP NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_productos_nombre ON productos USING gin (to_tsvector('spanish', nombre));

-- ------------------------------------------------------------
-- CAJA — control de apertura/cierre de caja por turno o por día
-- ------------------------------------------------------------
CREATE TABLE caja_sesiones (
    id                 SERIAL PRIMARY KEY,
    fecha_apertura     TIMESTAMP NOT NULL DEFAULT NOW(),
    monto_apertura     NUMERIC(12,2) NOT NULL DEFAULT 0,   -- efectivo con el que se abre la caja
    fecha_cierre       TIMESTAMP,
    monto_contado      NUMERIC(12,2),                      -- efectivo contado físicamente al cerrar
    monto_esperado     NUMERIC(12,2),                       -- apertura + ventas en efectivo (calculado al cerrar)
    diferencia         NUMERIC(12,2),                       -- monto_contado - monto_esperado
    estado             VARCHAR(10) NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
    notas              TEXT,
    creado_en          TIMESTAMP NOT NULL DEFAULT NOW()
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
    creado_en      TIMESTAMP NOT NULL DEFAULT NOW()
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
    venta_id         INTEGER,
    notas            TEXT,
    creado_en        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_movimientos_producto ON movimientos_stock(producto_id);
CREATE INDEX idx_movimientos_fecha ON movimientos_stock(creado_en);

-- ------------------------------------------------------------
-- VENTAS (cabecera) — historial completo de ventas realizadas
-- ------------------------------------------------------------
CREATE TABLE ventas (
    id             SERIAL PRIMARY KEY,
    fecha          TIMESTAMP NOT NULL DEFAULT NOW(),
    total          NUMERIC(12,2) NOT NULL DEFAULT 0,
    metodo_pago    VARCHAR(30) NOT NULL DEFAULT 'efectivo' CHECK (metodo_pago IN ('efectivo', 'debito', 'credito', 'transferencia', 'mercado_pago')),
    caja_sesion_id INTEGER REFERENCES caja_sesiones(id),  -- a qué turno de caja pertenece (si había una abierta)
    usuario_id     INTEGER REFERENCES usuarios(id),        -- qué vendedor hizo la venta
    anulada        BOOLEAN NOT NULL DEFAULT FALSE,
    notas          TEXT,
    creado_en      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ventas_fecha ON ventas(fecha);
CREATE INDEX idx_ventas_caja ON ventas(caja_sesion_id);

-- ------------------------------------------------------------
-- DETALLE DE VENTA
-- ------------------------------------------------------------
CREATE TABLE venta_detalle (
    id              SERIAL PRIMARY KEY,
    venta_id        INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id     INTEGER NOT NULL REFERENCES productos(id),
    cantidad        NUMERIC(12,2) NOT NULL,
    precio_unitario NUMERIC(12,2) NOT NULL,
    subtotal        NUMERIC(12,2) NOT NULL
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
