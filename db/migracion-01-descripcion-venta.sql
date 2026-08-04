-- ============================================================
-- Migración 01 — Descripción en el detalle de venta
--
-- Agrega el campo donde se anota de quién es el arreglo o a
-- nombre de quién es el pago del taller.
--
-- Correr UNA sola vez sobre la base que ya está en uso:
--   psql -U postgres -d almacen_costura -f db/migracion-01-descripcion-venta.sql
--
-- (o desde SQL Shell:  \i 'C:/ruta/al/proyecto/db/migracion-01-descripcion-venta.sql')
--
-- Es segura de volver a correr: si la columna ya existe, no hace nada.
-- ============================================================

ALTER TABLE venta_detalle ADD COLUMN IF NOT EXISTS descripcion TEXT;
