    -- ============================================================================
    -- CodeArena 3D — Esquema de Base de Datos (PostgreSQL / Supabase)
    -- Ejecutar en el SQL Editor de Supabase
    -- ============================================================================

    -- 1. Extensión para UUIDs (habilitada por defecto en Supabase)
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    -- 2. Tabla de Salas
    CREATE TABLE IF NOT EXISTS salas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        codigo VARCHAR(10) UNIQUE NOT NULL,                       -- R1: Código único de sala
        tema VARCHAR(60) NOT NULL,                                -- Tema tecnológico
        estado VARCHAR(20) NOT NULL DEFAULT 'WAITING'             -- WAITING -> PLAYING -> FINISHED
            CHECK (estado IN ('WAITING', 'PLAYING', 'FINISHED')),
        capacidad_maxima INT NOT NULL DEFAULT 4                   -- R2: Máximo 4 jugadores
            CHECK (capacidad_maxima = 4),
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Índice para búsqueda ultra rápida por código de sala
    CREATE INDEX IF NOT EXISTS idx_salas_codigo ON salas (codigo);

    -- 3. Tabla de Jugadores
    CREATE TABLE IF NOT EXISTS jugadores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sala_id UUID NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
        nickname VARCHAR(50) NOT NULL,
        estado_conexion VARCHAR(20) NOT NULL DEFAULT 'conectado'
            CHECK (estado_conexion IN ('conectado', 'desconectado')),
        puntaje INT NOT NULL DEFAULT 0,
        vida INT NOT NULL DEFAULT 100 
            CHECK (vida >= 0 AND vida <= 100),                    -- 0 - 100 (Barra verde)
        mana INT NOT NULL DEFAULT 100 
            CHECK (mana >= 0 AND mana <= 100),                    -- 0 - 100 (Barra celeste)
        poder_especial INT NOT NULL DEFAULT 0 
            CHECK (poder_especial >= 0 AND poder_especial <= 100),-- 0 - 100 (Barra roja, R10)
        racha_correctas INT NOT NULL DEFAULT 0,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Índice para consultar jugadores por sala rápidamente
    CREATE INDEX IF NOT EXISTS idx_jugadores_sala_id ON jugadores (sala_id);
