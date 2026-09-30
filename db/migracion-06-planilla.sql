-- ============================================================
-- Migración 06 — Bolsita (retiro Mer), solo para administradores
--
-- Agrega:
--   - planilla_movimientos: ingresos y egresos de la plata que se saca
--     de la caja (retiro Mer, bolsita). El saldo es la suma de ingresos
--     menos la suma de egresos; no se guarda como columna aparte.
--
-- Cuando en Caja se registra un egreso marcado "a la bolsita",
-- se guarda en movimientos_caja (sale del cajón) y además acá como
-- ingreso, apuntando a ese movimiento con movimiento_caja_id.
--
-- Correr UNA sola vez sobre la base que ya está en uso:
--   psql -U postgres -d almacen_costura -f db/migracion-06-planilla.sql
--
-- (o desde el SQL Editor de Supabase, pegando el contenido)
--
-- Es segura de volver a correr: usa IF NOT EXISTS.
-- ============================================================

CREATE TABLE IF NOT EXISTS planilla_movimientos (
    id                 SERIAL PRIMARY KEY,
    tipo               VARCHAR(10) NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
    monto              NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    concepto           VARCHAR(200) NOT NULL,  -- ej: "Retiro Mer", "Bolsita", "Pago a proveedor"
    movimiento_caja_id INTEGER UNIQUE REFERENCES movimientos_caja(id), -- si vino de un retiro de caja
    usuario_id         INTEGER REFERENCES usuarios(id), -- quién registró el movimiento
    creado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planilla_movimientos_fecha ON planilla_movimientos(creado_en);

-- Igual que el resto de las tablas (ver migración 04).
ALTER TABLE planilla_movimientos ENABLE ROW LEVEL SECURITY;
