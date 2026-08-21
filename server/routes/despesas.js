// routes/despesas.js — módulo Contas: categorias, fornecedores e despesas.
//
// Só para fins de despesa/lucro (compõe o DRE) — sem vencimento, sem
// recorrência, sem lembrete. Categoria e fornecedor são cadastros prévios
// (dropdown no lançamento) pra evitar nome duplicado/digitado diferente.
// Quando a categoria tem eh_fornecedor = 1, o lançamento pede um fornecedor
// específico (pra ranking "fornecedores mais pagos" no DRE).

import express from 'express';

const router = express.Router();

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function categoriaParaApi(row) {
  if (!row) return null;
  return { id: row.id, nome: row.nome, ehFornecedor: !!row.eh_fornecedor };
}

function fornecedorParaApi(row) {
  if (!row) return null;
  return { id: row.id, nome: row.nome, criadoEm: row.criado_em };
}

function despesaParaApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    data: row.data,
    categoriaId: row.categoria_id,
    categoriaNome: row.categoria_nome,
    ehFornecedor: !!row.eh_fornecedor,
    fornecedorId: row.fornecedor_id,
    fornecedorNome: row.fornecedor_nome,
    descricao: row.descricao,
    valor: row.valor,
    criadoEm: row.criado_em,
  };
}

// --- Categorias -------------------------------------------------------------

// GET /api/despesas/categorias — lista categorias cadastradas.
router.get('/categorias', (req, res) => {
  const db = req.app.locals.db;
  const rows = db.all('SELECT * FROM categorias_despesa ORDER BY nome');
  res.json(rows.map(categoriaParaApi));
});

// POST /api/despesas/categorias — cadastra uma categoria nova.
router.post('/categorias', (req, res) => {
  const db = req.app.locals.db;
  const { nome, ehFornecedor } = req.body || {};

  if (!nome || !String(nome).trim()) return res.status(400).json({ erro: 'Informe o nome da categoria.' });

  const existe = db.get('SELECT id FROM categorias_despesa WHERE nome = ?', [String(nome).trim()]);
  if (existe) return res.status(409).json({ erro: 'Já existe uma categoria com esse nome.' });

  const { lastInsertRowid } = db.run(
    'INSERT INTO categorias_despesa (nome, eh_fornecedor) VALUES (?, ?)',
    [String(nome).trim(), ehFornecedor ? 1 : 0]
  );
  const nova = db.get('SELECT * FROM categorias_despesa WHERE id = ?', [lastInsertRowid]);
  res.status(201).json(categoriaParaApi(nova));
});

// PUT /api/despesas/categorias/:id — renomeia/ajusta uma categoria.
router.put('/categorias/:id', (req, res) => {
  const db = req.app.locals.db;
  const atual = db.get('SELECT * FROM categorias_despesa WHERE id = ?', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Categoria não encontrada.' });

  const { nome, ehFornecedor } = req.body || {};
  const novoNome = nome !== undefined ? String(nome).trim() : atual.nome;
  if (!novoNome) return res.status(400).json({ erro: 'Informe o nome da categoria.' });

  const duplicada = db.get('SELECT id FROM categorias_despesa WHERE nome = ? AND id != ?', [novoNome, req.params.id]);
  if (duplicada) return res.status(409).json({ erro: 'Já existe uma categoria com esse nome.' });

  db.run('UPDATE categorias_despesa SET nome = ?, eh_fornecedor = ? WHERE id = ?', [
    novoNome,
    ehFornecedor !== undefined ? (ehFornecedor ? 1 : 0) : atual.eh_fornecedor,
    req.params.id,
  ]);
  const salva = db.get('SELECT * FROM categorias_despesa WHERE id = ?', [req.params.id]);
  res.json(categoriaParaApi(salva));
});

// DELETE /api/despesas/categorias/:id — remove, só se nenhuma despesa usar.
router.delete('/categorias/:id', (req, res) => {
  const db = req.app.locals.db;
  const atual = db.get('SELECT id FROM categorias_despesa WHERE id = ?', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Categoria não encontrada.' });

  const emUso = db.get('SELECT id FROM despesas WHERE categoria_id = ? LIMIT 1', [req.params.id]);
  if (emUso) return res.status(409).json({ erro: 'Categoria em uso por alguma despesa, não pode ser removida.' });

  db.run('DELETE FROM categorias_despesa WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// --- Fornecedores -------------------------------------------------------------

// GET /api/despesas/fornecedores — lista fornecedores cadastrados.
router.get('/fornecedores', (req, res) => {
  const db = req.app.locals.db;
  const rows = db.all('SELECT * FROM fornecedores ORDER BY nome');
  res.json(rows.map(fornecedorParaApi));
});

// POST /api/despesas/fornecedores — cadastra um fornecedor novo.
router.post('/fornecedores', (req, res) => {
  const db = req.app.locals.db;
  const { nome } = req.body || {};

  if (!nome || !String(nome).trim()) return res.status(400).json({ erro: 'Informe o nome do fornecedor.' });

  const existe = db.get('SELECT id FROM fornecedores WHERE nome = ?', [String(nome).trim()]);
  if (existe) return res.status(409).json({ erro: 'Já existe um fornecedor com esse nome.' });

  const { lastInsertRowid } = db.run('INSERT INTO fornecedores (nome) VALUES (?)', [String(nome).trim()]);
  const novo = db.get('SELECT * FROM fornecedores WHERE id = ?', [lastInsertRowid]);
  res.status(201).json(fornecedorParaApi(novo));
});

// PUT /api/despesas/fornecedores/:id — renomeia um fornecedor.
router.put('/fornecedores/:id', (req, res) => {
  const db = req.app.locals.db;
  const atual = db.get('SELECT * FROM fornecedores WHERE id = ?', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Fornecedor não encontrado.' });

  const nome = String(req.body?.nome ?? '').trim();
  if (!nome) return res.status(400).json({ erro: 'Informe o nome do fornecedor.' });

  const duplicado = db.get('SELECT id FROM fornecedores WHERE nome = ? AND id != ?', [nome, req.params.id]);
  if (duplicado) return res.status(409).json({ erro: 'Já existe um fornecedor com esse nome.' });

  db.run('UPDATE fornecedores SET nome = ? WHERE id = ?', [nome, req.params.id]);
  const salvo = db.get('SELECT * FROM fornecedores WHERE id = ?', [req.params.id]);
  res.json(fornecedorParaApi(salvo));
});

// DELETE /api/despesas/fornecedores/:id — remove, só se nenhuma despesa usar.
router.delete('/fornecedores/:id', (req, res) => {
  const db = req.app.locals.db;
  const atual = db.get('SELECT id FROM fornecedores WHERE id = ?', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Fornecedor não encontrado.' });

  const emUso = db.get('SELECT id FROM despesas WHERE fornecedor_id = ? LIMIT 1', [req.params.id]);
  if (emUso) return res.status(409).json({ erro: 'Fornecedor em uso por alguma despesa, não pode ser removido.' });

  db.run('DELETE FROM fornecedores WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// --- Despesas -------------------------------------------------------------

const SELECT_DESPESA = `
  SELECT despesas.*, categorias_despesa.nome AS categoria_nome, categorias_despesa.eh_fornecedor AS eh_fornecedor,
         fornecedores.nome AS fornecedor_nome
    FROM despesas
    JOIN categorias_despesa ON categorias_despesa.id = despesas.categoria_id
    LEFT JOIN fornecedores ON fornecedores.id = despesas.fornecedor_id
`;

// GET /api/despesas — lista despesas.
//   ?inicio=AAAA-MM-DD&fim=AAAA-MM-DD  filtra por período (usado pelo DRE)
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { inicio, fim } = req.query;

  const where = [];
  const params = [];
  if (inicio) { where.push('despesas.data >= ?'); params.push(inicio); }
  if (fim) { where.push('despesas.data <= ?'); params.push(fim); }

  const sql = SELECT_DESPESA + (where.length ? ` WHERE ${where.join(' AND ')}` : '') + ' ORDER BY despesas.data DESC, despesas.id DESC';
  res.json(db.all(sql, params).map(despesaParaApi));
});

// POST /api/despesas — lança uma despesa.
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const body = req.body || {};

  if (!body.data) return res.status(400).json({ erro: 'Campo "data" é obrigatório' });
  if (!body.categoriaId) return res.status(400).json({ erro: 'Selecione a categoria.' });
  if (!num(body.valor)) return res.status(400).json({ erro: 'Informe o valor.' });

  const categoria = db.get('SELECT * FROM categorias_despesa WHERE id = ?', [body.categoriaId]);
  if (!categoria) return res.status(400).json({ erro: 'Categoria inválida.' });
  if (categoria.eh_fornecedor && !body.fornecedorId) {
    return res.status(400).json({ erro: 'Essa categoria exige um fornecedor.' });
  }

  const { lastInsertRowid } = db.run(
    `INSERT INTO despesas (data, categoria_id, fornecedor_id, descricao, valor)
     VALUES (?, ?, ?, ?, ?)`,
    [body.data, body.categoriaId, categoria.eh_fornecedor ? body.fornecedorId : null, body.descricao ?? null, num(body.valor)]
  );

  const salva = db.get(`${SELECT_DESPESA} WHERE despesas.id = ?`, [lastInsertRowid]);
  res.status(201).json(despesaParaApi(salva));
});

// PUT /api/despesas/:id — edita uma despesa já lançada.
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const atual = db.get('SELECT * FROM despesas WHERE id = ?', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Despesa não encontrada' });

  const body = req.body || {};
  const data = body.data ?? atual.data;
  const categoriaId = body.categoriaId ?? atual.categoria_id;
  const valor = body.valor !== undefined ? num(body.valor) : atual.valor;

  if (!data) return res.status(400).json({ erro: 'Campo "data" é obrigatório' });
  if (!valor) return res.status(400).json({ erro: 'Informe o valor.' });

  const categoria = db.get('SELECT * FROM categorias_despesa WHERE id = ?', [categoriaId]);
  if (!categoria) return res.status(400).json({ erro: 'Categoria inválida.' });

  const fornecedorId = categoria.eh_fornecedor ? (body.fornecedorId ?? atual.fornecedor_id) : null;
  if (categoria.eh_fornecedor && !fornecedorId) {
    return res.status(400).json({ erro: 'Essa categoria exige um fornecedor.' });
  }

  db.run(
    `UPDATE despesas SET data = ?, categoria_id = ?, fornecedor_id = ?, descricao = ?, valor = ? WHERE id = ?`,
    [data, categoriaId, fornecedorId, body.descricao !== undefined ? body.descricao : atual.descricao, valor, req.params.id]
  );

  const salva = db.get(`${SELECT_DESPESA} WHERE despesas.id = ?`, [req.params.id]);
  res.json(despesaParaApi(salva));
});

// DELETE /api/despesas/:id — remove uma despesa (ex.: lançada por engano).
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const atual = db.get('SELECT id FROM despesas WHERE id = ?', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Despesa não encontrada' });

  db.run('DELETE FROM despesas WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

export default router;
