// routes/aPrazo.js — recebimento de vendas a prazo (fiado formal).
//
// A venda a prazo já é lançada no Microvix no dia (campo microvix_a_prazo),
// que fica fora de toda conferência — nada muda ali. O problema é só no
// RECEBIMENTO: quando o cliente quita depois, em dinheiro ou no cartão/pix,
// esse valor entra sem bater com nada do Microvix daquele dia. Aqui só se
// registra esse recebimento (sem rastreio de saldo por cliente); o servidor
// soma por forma_recebimento e aplica como ajuste (subtrai) na conferência do
// dia certo — ver POST /api/fechamentos.

import express from 'express';

const router = express.Router();

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function rowParaApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    data: row.data,
    valor: row.valor,
    formaRecebimento: row.forma_recebimento,
    descricao: row.descricao,
    usuarioId: row.usuario_id,
    criadoEm: row.criado_em,
  };
}

// GET /api/a-prazo — lista recebimentos.
//   ?data=AAAA-MM-DD  filtra pelo dia do recebimento (usado pela tela de fechamento)
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { data } = req.query;

  const where = [];
  const params = [];
  if (data) {
    where.push('data = ?');
    params.push(data);
  }
  const sql =
    'SELECT * FROM a_prazo_recebimentos' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY data DESC, id DESC';

  res.json(db.all(sql, params).map(rowParaApi));
});

// POST /api/a-prazo — registra um recebimento.
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const body = req.body || {};

  if (!body.data) return res.status(400).json({ erro: 'Campo "data" é obrigatório' });
  if (!num(body.valor)) return res.status(400).json({ erro: 'Informe o valor recebido.' });
  if (body.formaRecebimento !== 'dinheiro' && body.formaRecebimento !== 'cartao_pix') {
    return res.status(400).json({ erro: 'Campo "formaRecebimento" deve ser dinheiro ou cartao_pix.' });
  }

  const { lastInsertRowid } = db.run(
    `INSERT INTO a_prazo_recebimentos (data, valor, forma_recebimento, descricao, usuario_id)
     VALUES (?, ?, ?, ?, ?)`,
    [body.data, num(body.valor), body.formaRecebimento, body.descricao ?? null, body.usuarioId ?? null]
  );

  const salvo = db.get('SELECT * FROM a_prazo_recebimentos WHERE id = ?', [lastInsertRowid]);
  res.status(201).json(rowParaApi(salvo));
});

// DELETE /api/a-prazo/:id — remove um recebimento (ex.: lançado por engano).
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const atual = db.get('SELECT id FROM a_prazo_recebimentos WHERE id = ?', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Recebimento não encontrado' });

  db.run('DELETE FROM a_prazo_recebimentos WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

export default router;
