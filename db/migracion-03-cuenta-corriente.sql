-- ============================================================
-- Migración 03 — Cuenta corriente de clientes
--
-- Agrega:
--   - clientes: registro básico de clientes (nombre, teléfono, notas)
--   - cuenta_corriente_movimientos: cargos (ventas "a cuenta") y pagos
--     (abonos) de cada cliente, base para calcular el saldo
--   - ventas.cliente_id: a qué cliente pertenece una venta hecha a
--     cuenta corriente (queda NULL en el resto de las ventas)
--   - 'cuenta_corriente' como forma de pago válida en ventas/venta_pagos
--
-- Correr UNA sola vez sobre la base que ya está en uso:
--   psql -U postgres -d almacen_costura -f db/migracion-03-cuenta-corriente.sql
--
-- (o desde SQL Shell:  \i 'C:/ruta/al/proyecto/db/migracion-03-cuenta-corriente.sql')
--
-- Es segura de volver a correr: usa IF NOT EXISTS y CREATE OR REPLACE.
-- ============================================================

CREATE TABLE IF NOT EXISTS clientes (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(150) NOT NULL,
    telefono    VARCHAR(50),
    notas       TEXT,
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes USING gin (to_tsvector('spanish', nombre));

-- Cada fila es UN cargo (venta a cuenta) o UN pago (abono). El saldo de
-- un cliente es la suma de sus cargos menos la suma de sus pagos; no se
-- guarda como columna aparte para no tener que mantenerlo sincronizado.
CREATE TABLE IF NOT EXISTS cuenta_corriente_movimientos (
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

CREATE INDEX IF NOT EXISTS idx_cc_movimientos_cliente ON cuenta_corriente_movimientos(cliente_id);

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id);

-- 'cuenta_corriente' pasa a ser una forma de pago válida, tanto en el
-- resumen de la venta como en el detalle por método (venta_pagos).
ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_metodo_pago_check;
ALTER TABLE ventas ADD CONSTRAINT ventas_metodo_pago_check
    CHECK (metodo_pago IN ('efectivo', 'debito', 'credito', 'transferencia', 'mercado_pago', 'mixto', 'cuenta_corriente'));

ALTER TABLE venta_pagos DROP CONSTRAINT IF EXISTS venta_pagos_metodo_pago_check;
ALTER TABLE venta_pagos ADD CONSTRAINT venta_pagos_metodo_pago_check
    CHECK (metodo_pago IN ('efectivo', 'debito', 'credito', 'transferencia', 'mercado_pago', 'cuenta_corriente'));

-- Saldo actual por cliente, para el listado de Clientes sin tener que
-- sumar los movimientos a mano desde el renderer.
CREATE OR REPLACE VIEW vista_saldo_clientes AS
SELECT c.id, c.nombre, c.telefono, c.notas, c.activo,
       COALESCE(SUM(CASE WHEN m.tipo = 'cargo' THEN m.monto WHEN m.tipo = 'pago' THEN -m.monto ELSE 0 END), 0) AS saldo
FROM clientes c
LEFT JOIN cuenta_corriente_movimientos m ON m.cliente_id = c.id
GROUP BY c.id, c.nombre, c.telefono, c.notas, c.activo;
