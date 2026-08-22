// routes/configuracoes.js — leitura e gravação das configurações.
//
// A configuração é uma linha única (id = 1) com o estado ATUAL (sem histórico):
// limite de diferença de moeda.

import express from 'express';

const router = express.Router();

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Colunas editáveis: coluna no banco <-> chave camelCase da API.
const COLS_NUM = [
  ['limite_diferenca_moeda', 'limiteDiferencaMoeda'],
];

function rowParaApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    limiteDiferencaMoeda: row.limite_diferenca_moeda,
  };
}

// GET /api/configuracoes — devolve a configuração atual (linha única id = 1).
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const row = db.get('SELECT * FROM configuracoes WHERE id = 1');
  res.json(rowParaApi(row));
});

// PUT /api/configuracoes — atualiza a configuração (linha única id = 1).
// Só grava os campos enviados; o que não vier mantém o valor atual.
router.put('/', (req, res) => {
  const db = req.app.locals.db;
  const body = req.body || {};
  const atual = db.get('SELECT * FROM configuracoes WHERE id = 1');
  if (!atual) return res.status(404).json({ erro: 'Configuração não encontrada' });

  const colunas = {};
  for (const [col, key] of COLS_NUM) {
    if (body[key] !== undefined) colunas[col] = num(body[key]);
  }

  const nomes = Object.keys(colunas);
  if (nomes.length) {
    const sets = nomes.map((c) => `${c} = ?`).join(', ');
    db.run(`UPDATE configuracoes SET ${sets} WHERE id = 1`, Object.values(colunas));
  }

  const salvo = db.get('SELECT * FROM configuracoes WHERE id = 1');
  res.json(rowParaApi(salvo));
});

export default router;
