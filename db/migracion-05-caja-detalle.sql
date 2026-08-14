-- ============================================================
-- Migración 05 — Detalle de caja: quién abrió/cerró y quién hizo
-- cada movimiento manual
--
-- Agrega:
--   - caja_sesiones.usuario_apertura_id: quién abrió esa caja
--   - caja_sesiones.usuario_cierre_id: quién la cerró
--   - movimientos_caja.usuario_id: quién registró ese retiro/ingreso
--
-- Correr UNA sola vez sobre la base que ya está en uso:
--   psql -U postgres -d almacen_costura -f db/migracion-05-caja-detalle.sql
--
-- (o desde el SQL Editor de Supabase, pegando el contenido)
--
-- Es segura de volver a correr: usa IF NOT EXISTS.
-- ============================================================

ALTER TABLE caja_sesiones ADD COLUMN IF NOT EXISTS usuario_apertura_id INTEGER REFERENCES usuarios(id);
ALTER TABLE caja_sesiones ADD COLUMN IF NOT EXISTS usuario_cierre_id INTEGER REFERENCES usuarios(id);
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id);
