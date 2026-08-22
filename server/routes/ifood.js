// routes/ifood.js — repasses do iFood. Dinheiro não passa pelo caixa/
// maquininha: o iFood retém taxa e deposita o líquido periodicamente. Aqui
// registra o RECEBIMENTO (data + valor líquido); período é só informativo,
// pra cruzar com o "iFood (só registro)" do Microvix e mostrar a taxa retida
// — não afeta o valor reconhecido, que é sempre o valor_recebido puro.

import express from 'express';

const router = express.Router();

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function rowParaApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    dataRepasse: row.data_repasse,
    periodoInicio: row.periodo_inicio,
    periodoFim: row.periodo_fim,
    valorRecebido: row.valor_recebido,
    observacoes: row.observacoes,
    criadoEm: row.criado_em,
  };
}

function validar(body) {
  if (!body.dataRepasse) return 'Campo "dataRepasse" é obrigatório.';
  if (!body.periodoInicio || !body.periodoFim) return 'Informe o início e o fim do período coberto.';
  if (body.periodoInicio > body.periodoFim) return 'O início do período não pode ser depois do fim.';
  if (!num(body.valorRecebido)) return 'Informe o valor recebido.';
  return null;
}

// GET /api/ifood — lista repasses.
//   ?inicio=&fim=  filtra pela data do repasse (dataRepasse), não pelo período coberto
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { inicio, fim } = req.query;

  const where = [];
  const params = [];
  if (inicio) {
    where.push('data_repasse >= ?');
    params.push(inicio);
  }
  if (fim) {
    where.push('data_repasse <= ?');
    params.push(fim);
  }
  const sql =
    'SELECT * FROM ifood_repasses' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY data_repasse DESC, id DESC';

  res.json(db.all(sql, params).map(rowParaApi));
});

// POST /api/ifood — registra um repasse.
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const body = req.body || {};

  const erro = validar(body);
  if (erro) return res.status(400).json({ erro });

  const { lastInsertRowid } = db.run(
    `INSERT INTO ifood_repasses (data_repasse, periodo_inicio, periodo_fim, valor_recebido, observacoes)
     VALUES (?, ?, ?, ?, ?)`,
    [body.dataRepasse, body.periodoInicio, body.periodoFim, num(body.valorRecebido), body.observacoes ?? null]
  );

  const salvo = db.get('SELECT * FROM ifood_repasses WHERE id = ?', [lastInsertRowid]);
  res.status(201).json(rowParaApi(salvo));
});

// PUT /api/ifood/:id — edita um repasse.
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const atual = db.get('SELECT id FROM ifood_repasses WHERE id = ?', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Repasse não encontrado' });

  const body = req.body || {};
  const erro = validar(body);
  if (erro) return res.status(400).json({ erro });

  db.run(
    `UPDATE ifood_repasses
        SET data_repasse = ?, periodo_inicio = ?, periodo_fim = ?, valor_recebido = ?, observacoes = ?
      WHERE id = ?`,
    [body.dataRepasse, body.periodoInicio, body.periodoFim, num(body.valorRecebido), body.observacoes ?? null, req.params.id]
  );

  const salvo = db.get('SELECT * FROM ifood_repasses WHERE id = ?', [req.params.id]);
  res.json(rowParaApi(salvo));
});

// DELETE /api/ifood/:id — remove um repasse (ex.: lançado por engano).
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const atual = db.get('SELECT id FROM ifood_repasses WHERE id = ?', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Repasse não encontrado' });

  db.run('DELETE FROM ifood_repasses WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

export default router;
