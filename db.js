const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id        SERIAL PRIMARY KEY,
      nome      VARCHAR(150) NOT NULL,
      cnpj      VARCHAR(20)  UNIQUE NOT NULL,
      celular   VARCHAR(20),
      email     VARCHAR(150),
      criado_em TIMESTAMPTZ  DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS licencas (
      id            SERIAL PRIMARY KEY,
      chave         VARCHAR(30)  UNIQUE NOT NULL,
      cliente       VARCHAR(150) NOT NULL,
      email         VARCHAR(150),
      cnpj          VARCHAR(20),
      criado_em     TIMESTAMPTZ  DEFAULT NOW(),
      expira_em     TIMESTAMPTZ  NOT NULL,
      ativo         BOOLEAN      DEFAULT TRUE,
      ultimo_acesso TIMESTAMPTZ,
      observacao    TEXT
    )
  `);
  // Migração: adiciona coluna cnpj se não existir (backward compat)
  await pool.query(`
    ALTER TABLE licencas ADD COLUMN IF NOT EXISTS cnpj VARCHAR(20)
  `).catch(() => {});
  // Remove coluna machine_id se ainda existir
  await pool.query(`
    ALTER TABLE licencas DROP COLUMN IF EXISTS machine_id
  `).catch(() => {});
}

module.exports = { pool, initDb };
