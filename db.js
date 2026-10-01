const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS licencas (
      id           SERIAL PRIMARY KEY,
      chave        VARCHAR(30)  UNIQUE NOT NULL,
      cliente      VARCHAR(150) NOT NULL,
      email        VARCHAR(150),
      machine_id   VARCHAR(200),
      criado_em    TIMESTAMPTZ  DEFAULT NOW(),
      expira_em    TIMESTAMPTZ  NOT NULL,
      ativo        BOOLEAN      DEFAULT TRUE,
      ultimo_acesso TIMESTAMPTZ,
      observacao   TEXT
    )
  `);
}

module.exports = { pool, initDb };
