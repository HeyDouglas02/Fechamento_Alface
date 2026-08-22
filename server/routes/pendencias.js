// routes/pendencias.js — abertura e recebimento de pendências.
//
// Pendência = venda que entrou no Microvix mas não passou na maquininha no mesmo
// dia (cliente paga depois). Tem dois momentos, que podem cair em dias
// diferentes (ou no mesmo dia):
//   ABERTURA   — dia da venda; explica uma falta na maquininha (subtrai).
//   RECEBIMENTO— dia em que o cliente paga; a maquininha fica com um valor a
//                mais que o Microvix daquele dia (subtrai também).
//
// O vínculo com o fechamento é feito pela DATA (data_abertura / data_recebimento),
// não pelo id do fechamento — o fechamento do dia pode nem existir ainda quando a
// pendência é aberta. Os campos fechamento_*_id ficam para referência futura.

import express from 'express';

const router = express.Router();

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Converte linha do banco (snake_case) para o formato da API (camelCase).
function rowParaApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    descricao: row.descricao,
    valor: row.valor,
    formaPagamento: row.forma_pagamento,
    dataAbertura: row.data_abertura,
    fechamentoAberturaId: row.fechamento_abertura_id,
    previsaoPagamento: row.previsao_pagamento,
    dataRecebimento: row.data_recebimento,
    fechamentoRecebimentoId: row.fechamento_recebimento_id,
    formaRecebimento: row.forma_recebimento,
    status: row.status,
    usuarioId: row.usuario_id,
    criadoEm: row.criado_em,
  };
}

// GET /api/pendencias — lista pendências.
//   ?status=aberta|recebida  filtra por status
//   ?data=AAAA-MM-DD         pendências ligadas àquele dia (aberta nele OU
//                            recebida nele) — usado pela tela de fechamento.
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { status, data } = req.query;

  const where = [];
  const params = [];
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (data) {
    where.push('(data_abertura = ? OR data_recebimento = ?)');
    params.push(data, data);
  }
  const sql =
    'SELECT * FROM pendencias' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY data_abertura DESC, id DESC';

  res.json(db.all(sql, params).map(rowParaApi));
});

// GET /api/pendencias/abertas — só as abertas (para receber em qualquer dia).
router.get('/abertas', (req, res) => {
  const db = req.app.locals.db;
  const rows = db.all(
    "SELECT * FROM pendencias WHERE status = 'aberta' ORDER BY data_abertura ASC, id ASC"
  );
  res.json(rows.map(rowParaApi));
});

// POST /api/pendencias — abre uma pendência.
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const body = req.body || {};

  if (!body.descricao) return res.status(400).json({ erro: 'Campo "descricao" é obrigatório' });
  if (!body.dataAbertura) return res.status(400).json({ erro: 'Campo "dataAbertura" é obrigatório' });

  const { lastInsertRowid } = db.run(
    `INSERT INTO pendencias
       (descricao, valor, forma_pagamento, data_abertura,
        fechamento_abertura_id, previsao_pagamento, status, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, 'aberta', ?)`,
    [
      body.descricao,
      num(body.valor),
      body.formaPagamento ?? null,
      body.dataAbertura,
      body.fechamentoAberturaId ?? null,
      body.previsaoPagamento ?? null,
      body.usuarioId ?? null,
    ]
  );

  const salvo = db.get('SELECT * FROM pendencias WHERE id = ?', [lastInsertRowid]);
  res.status(201).json(rowParaApi(salvo));
});

// POST /api/pendencias/:id/receber — marca como recebida num dia.
//   body: { dataRecebimento, formaRecebimento (dinheiro|cartao_pix), fechamentoRecebimentoId? }
// A forma decide em qual conferência o recebimento entra como ajuste (subtrai)
// no dia — não dá pra saber de antemão como o cliente vai pagar.
router.post('/:id/receber', (req, res) => {
  const db = req.app.locals.db;
  const body = req.body || {};

  if (!body.dataRecebimento) {
    return res.status(400).json({ erro: 'Campo "dataRecebimento" é obrigatório' });
  }
  if (body.formaRecebimento !== 'dinheiro' && body.formaRecebimento !== 'cartao_pix') {
    return res.status(400).json({ erro: 'Campo "formaRecebimento" deve ser dinheiro ou cartao_pix.' });
  }

  const atual = db.get('SELECT * FROM pendencias WHERE id = ?', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Pendência não encontrada' });
  if (atual.status === 'recebida') {
    return res.status(409).json({ erro: 'Pendência já foi recebida' });
  }

  db.run(
    `UPDATE pendencias
       SET status = 'recebida', data_recebimento = ?, forma_recebimento = ?, fechamento_recebimento_id = ?
     WHERE id = ?`,
    [body.dataRecebimento, body.formaRecebimento, body.fechamentoRecebimentoId ?? null, req.params.id]
  );

  const salvo = db.get('SELECT * FROM pendencias WHERE id = ?', [req.params.id]);
  res.json(rowParaApi(salvo));
});

// POST /api/pendencias/:id/estornar — desfaz o recebimento (volta a aberta).
router.post('/:id/estornar', (req, res) => {
  const db = req.app.locals.db;
  const atual = db.get('SELECT * FROM pendencias WHERE id = ?', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Pendência não encontrada' });

  db.run(
    `UPDATE pendencias
       SET status = 'aberta', data_recebimento = NULL, forma_recebimento = NULL, fechamento_recebimento_id = NULL
     WHERE id = ?`,
    [req.params.id]
  );

  const salvo = db.get('SELECT * FROM pendencias WHERE id = ?', [req.params.id]);
  res.json(rowParaApi(salvo));
});

// DELETE /api/pendencias/:id — remove uma pendência (ex.: lançada por engano).
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const atual = db.get('SELECT * FROM pendencias WHERE id = ?', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Pendência não encontrada' });

  db.run('DELETE FROM pendencias WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

export default router;
