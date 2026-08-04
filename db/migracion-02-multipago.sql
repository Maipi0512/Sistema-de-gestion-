-- ============================================================
-- Migración 02 — Multipago
--
-- Permite dividir una venta entre varias formas de pago (ej. una
-- parte en efectivo y otra por transferencia), guardando cuánto
-- se pagó con cada método en la tabla nueva venta_pagos.
--
-- Correr UNA sola vez sobre la base que ya está en uso:
--   psql -U postgres -d almacen_costura -f db/migracion-02-multipago.sql
--
-- (o desde SQL Shell:  \i 'C:/ruta/al/proyecto/db/migracion-02-multipago.sql')
--
-- Es segura de volver a correr: usa IF NOT EXISTS y no duplica el
-- backfill de ventas ya migradas.
-- ============================================================

CREATE TABLE IF NOT EXISTS venta_pagos (
    id          SERIAL PRIMARY KEY,
    venta_id    INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    metodo_pago VARCHAR(30) NOT NULL CHECK (metodo_pago IN ('efectivo', 'debito', 'credito', 'transferencia', 'mercado_pago')),
    monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0)
);

CREATE INDEX IF NOT EXISTS idx_venta_pagos_venta ON venta_pagos(venta_id);

-- 'metodo_pago' en ventas ahora es un resumen (puede valer 'mixto' si la
-- venta se dividió entre varios métodos). Hay que permitir ese valor.
ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_metodo_pago_check;
ALTER TABLE ventas ADD CONSTRAINT ventas_metodo_pago_check
    CHECK (metodo_pago IN ('efectivo', 'debito', 'credito', 'transferencia', 'mercado_pago', 'mixto'));

-- Backfill: toda venta ya registrada tenía un único método de pago
-- (todavía no existía 'mixto'), así que se traslada tal cual a la
-- tabla nueva. No toca ventas que ya tengan pagos cargados.
INSERT INTO venta_pagos (venta_id, metodo_pago, monto)
SELECT v.id, v.metodo_pago, v.total
FROM ventas v
WHERE NOT EXISTS (SELECT 1 FROM venta_pagos vp WHERE vp.venta_id = v.id)
  AND v.total > 0;
