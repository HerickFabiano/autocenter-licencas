const express = require('express');
const path    = require('path');
const { pool, initDb } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Autenticação admin ────────────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function adminAuth(req, res, next) {
  const pwd = req.headers['x-admin-password'];
  if (pwd !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Não autorizado' });
  next();
}

// ── Gerar chave ───────────────────────────────────────────────────────────────
function gerarChave() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `AC-${seg()}-${seg()}-${seg()}`;
}

// ── Validar licença (chamado pelo AutoCenter) ─────────────────────────────────
app.post('/api/licenca/validar', async (req, res) => {
  try {
    const { chave, machineId } = req.body;
    if (!chave) return res.json({ valido: false, motivo: 'Chave não informada' });

    const r = await pool.query('SELECT * FROM licencas WHERE chave = $1', [chave.trim().toUpperCase()]);
    if (!r.rows.length) return res.json({ valido: false, motivo: 'Chave inválida' });

    const lic = r.rows[0];

    if (!lic.ativo)
      return res.json({ valido: false, motivo: 'Licença revogada' });

    if (new Date(lic.expira_em) < new Date())
      return res.json({ valido: false, motivo: 'Licença vencida', expirouEm: lic.expira_em });

    // Vincula machine_id na primeira utilização
    if (machineId && !lic.machine_id) {
      await pool.query('UPDATE licencas SET machine_id = $1 WHERE id = $2', [machineId, lic.id]);
    } else if (machineId && lic.machine_id && lic.machine_id !== machineId) {
      return res.json({ valido: false, motivo: 'Licença vinculada a outra máquina' });
    }

    await pool.query('UPDATE licencas SET ultimo_acesso = NOW() WHERE id = $1', [lic.id]);

    const diasRestantes = Math.max(0, Math.ceil((new Date(lic.expira_em) - new Date()) / 86400000));

    res.json({
      valido: true,
      cliente: lic.cliente,
      expiraEm: lic.expira_em,
      diasRestantes,
    });
  } catch (e) {
    res.status(500).json({ valido: false, motivo: 'Erro interno', erro: e.message });
  }
});

// ── Criar licença ─────────────────────────────────────────────────────────────
app.post('/api/licenca/criar', adminAuth, async (req, res) => {
  try {
    const { cliente, email, dias, observacao } = req.body;
    if (!cliente || !dias) return res.status(400).json({ error: 'cliente e dias são obrigatórios' });

    const chave    = gerarChave();
    const expiraEm = new Date(Date.now() + Number(dias) * 86400000);

    await pool.query(
      'INSERT INTO licencas (chave, cliente, email, expira_em, observacao) VALUES ($1,$2,$3,$4,$5)',
      [chave, cliente.trim(), email?.trim() || null, expiraEm, observacao?.trim() || null]
    );

    res.json({ chave, expiraEm, diasRestantes: Number(dias) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Listar licenças ───────────────────────────────────────────────────────────
app.get('/api/licenca/listar', adminAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM licencas ORDER BY criado_em DESC');
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Renovar licença ───────────────────────────────────────────────────────────
app.put('/api/licenca/renovar', adminAuth, async (req, res) => {
  try {
    const { id, dias } = req.body;
    const r = await pool.query(
      `UPDATE licencas
       SET expira_em = GREATEST(expira_em, NOW()) + ($1 || ' days')::interval,
           ativo = TRUE
       WHERE id = $2 RETURNING *`,
      [Number(dias), id]
    );
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Revogar licença ───────────────────────────────────────────────────────────
app.delete('/api/licenca/revogar/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('UPDATE licencas SET ativo = FALSE WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Reativar licença ──────────────────────────────────────────────────────────
app.put('/api/licenca/reativar/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('UPDATE licencas SET ativo = TRUE WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Desvincular máquina ───────────────────────────────────────────────────────
app.put('/api/licenca/desvincular/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('UPDATE licencas SET machine_id = NULL WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Verificar senha admin ─────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) res.json({ ok: true });
  else res.status(401).json({ error: 'Senha incorreta' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3010;
initDb()
  .then(() => app.listen(PORT, () => console.log(`Licenças API rodando na porta ${PORT}`)))
  .catch(e => { console.error('Erro ao iniciar:', e); process.exit(1); });
