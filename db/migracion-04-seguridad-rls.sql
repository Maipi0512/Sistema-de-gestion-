-- ============================================================
-- Migración 04 — Seguridad: activar Row-Level Security (RLS)
--
-- Supabase expone automáticamente todas las tablas del esquema
-- "public" a través de su API REST (PostgREST), sin importar si la
-- app la usa o no. Sin RLS, cualquiera con la URL del proyecto y la
-- clave pública ("anon key") puede leer/editar/borrar esas tablas
-- por afuera de la app. Supabase lo marca como vulnerabilidad crítica
-- ("rls_disabled_in_public").
--
-- Esta app se conecta directo a Postgres con el usuario "postgres"
-- (dueño de las tablas), y el dueño de una tabla siempre bypasea RLS
-- aunque esté activado y no tenga políticas. Por eso activar RLS acá,
-- SIN agregar políticas, no rompe nada de la app: solo bloquea el
-- acceso por la API REST de Supabase, que no se usa.
--
-- Correr UNA sola vez sobre la base que ya está en uso, desde el
-- SQL Editor de Supabase (o psql):
--   psql -U postgres -d almacen_costura -f db/migracion-04-seguridad-rls.sql
--
-- Es segura de volver a correr.
-- ============================================================

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
