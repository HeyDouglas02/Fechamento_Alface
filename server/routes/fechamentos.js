// routes/fechamentos.js — salvar e carregar fechamentos.
//
// Os valores calculados são gravados no banco (histórico imutável): o servidor
// recalcula com calculos.js no momento de salvar e persiste o resultado. O
// fundo fixo usado vai como snapshot enviado pela tela.

import express from 'express';
import { calcularFechamento } from '../../src/utils/calculos.js';

const router = express.Router();

// Mapa coluna_no_banco <-> chave camelCase usada na API/tela. Explícito de
// propósito: a conversão automática quebraria nas colunas com número
// (ex.: fundo_fixo_caixa_1_usado).
const COLS_VALOR = [
  ['numero_vendas', 'numeroVendas'],
  ['microvix_credito', 'microvixCredito'],
  ['microvix_debito', 'microvixDebito'],
  ['microvix_voucher', 'microvixVoucher'],
  ['microvix_pix', 'microvixPix'],
  ['microvix_dinheiro', 'microvixDinheiro'],
  ['microvix_a_prazo', 'microvixAPrazo'],
  ['microvix_ifood', 'microvixIfood'],
  ['maq1_cartao', 'maq1Cartao'], ['maq1_pix', 'maq1Pix'],
  ['maq2_cartao', 'maq2Cartao'], ['maq2_pix', 'maq2Pix'],
  ['maq3_cartao', 'maq3Cartao'], ['maq3_pix', 'maq3Pix'],
  ['maq4_cartao', 'maq4Cartao'], ['maq4_pix', 'maq4Pix'],
  ['pix_chave_direta', 'pixChaveDireta'],
  ['cedulas_caixa_1', 'cedulasCaixa1'], ['cedulas_caixa_2', 'cedulasCaixa2'],
  ['moedas_caixa_1', 'moedasCaixa1'], ['moedas_caixa_2', 'moedasCaixa2'],
  ['fundo_fixo_caixa_1_usado', 'fundoFixoCaixa1Usado'],
  ['fundo_fixo_caixa_2_usado', 'fundoFixoCaixa2Usado'],
];

const COLS_CALC = [
  ['total_maquininhas', 'totalRealMaquininhas'],
  ['total_maquininhas_microvix', 'totalMicrovixCartaoPix'],
  ['dinheiro_esperado', 'dinheiroEsperado'],
  ['dinheiro_real', 'dinheiroReal'],
  ['sangria_caixa_1', 'sangriaCaixa1'],
  ['sangria_caixa_2', 'sangriaCaixa2'],
  ['diferenca_dinheiro', 'diferencaDinheiro'],
  ['diferenca_cartao_pix', 'diferencaCartaoPix'],
];

// Rótulos legíveis dos campos editáveis, para o log de edições.
const LABELS = {
  status: 'Status',
  observacoes: 'Observações',
  numero_vendas: 'Nº de vendas',
  microvix_credito: 'Microvix crédito', microvix_debito: 'Microvix débito',
  microvix_voucher: 'Microvix voucher', microvix_pix: 'Microvix pix',
  microvix_dinheiro: 'Microvix dinheiro', microvix_a_prazo: 'Microvix a prazo',
  microvix_ifood: 'Microvix iFood',
  maq1_cartao: 'Máq. 1 cartão', maq1_pix: 'Máq. 1 pix',
  maq2_cartao: 'Máq. 2 cartão', maq2_pix: 'Máq. 2 pix',
  maq3_cartao: 'Máq. 3 cartão', maq3_pix: 'Máq. 3 pix',
  maq4_cartao: 'Máq. 4 cartão', maq4_pix: 'Máq. 4 pix',
  pix_chave_direta: 'Pix chave direta',
  cedulas_caixa_1: 'Cédulas caixa 1', cedulas_caixa_2: 'Cédulas caixa 2',
  moedas_caixa_1: 'Moedas caixa 1', moedas_caixa_2: 'Moedas caixa 2',
  fundo_fixo_caixa_1_usado: 'Fundo fixo caixa 1', fundo_fixo_caixa_2_usado: 'Fundo fixo caixa 2',
};

// Compara o estado anterior com o novo e grava uma linha em log_edicoes por
// campo alterado. Campos de valor comparam-se como número (tolerância de centavo).
function registrarEdicoes(db, antes, depois, fechamentoId, usuarioId) {
  const mudou = (col) => {
    const colsNum = COLS_VALOR.map(([c]) => c);
    if (colsNum.includes(col)) return Math.abs(num(antes[col]) - num(depois[col])) > 0.001;
    return (antes[col] ?? '') !== (depois[col] ?? '');
  };

  const campos = [...COLS_VALOR.map(([c]) => c), 'status', 'observacoes'];
  for (const col of campos) {
    if (!mudou(col)) continue;
    db.run(
      `INSERT INTO log_edicoes
         (fechamento_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
       VALUES (?, ?, ?, ?, ?)`,
      [
        fechamentoId,
        usuarioId,
        LABELS[col] || col,
        antes[col] == null ? null : String(antes[col]),
        depois[col] == null ? null : String(depois[col]),
      ]
    );
  }
}

const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

function diaSemana(dataISO) {
  // Meio-dia evita que o fuso jogue a data para o dia anterior.
  return DIAS[new Date(`${dataISO}T12:00:00`).getDay()];
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Converte uma linha do banco (snake_case) para o formato da API (camelCase).
function rowParaApi(row) {
  if (!row) return null;
  const api = {
    id: row.id,
    data: row.data,
    diaSemana: row.dia_semana,
    usuarioId: row.usuario_id,
    status: row.status,
    observacoes: row.observacoes,
    criadoEm: row.criado_em,
    editadoEm: row.editado_em,
  };
  for (const [col, key] of [...COLS_VALOR, ...COLS_CALC]) api[key] = row[col];
  return api;
}

// GET /api/fechamentos — lista todos os fechamentos (mais recentes primeiro).
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const rows = db.all('SELECT * FROM fechamentos ORDER BY data DESC');
  res.json(rows.map(rowParaApi));
});

// GET /api/fechamentos/:data/log — histórico de edições daquele dia.
router.get('/:data/log', (req, res) => {
  const db = req.app.locals.db;
  const fech = db.get('SELECT id FROM fechamentos WHERE data = ?', [req.params.data]);
  if (!fech) return res.json([]);
  const rows = db.all(
    'SELECT * FROM log_edicoes WHERE fechamento_id = ? ORDER BY id DESC',
    [fech.id]
  );
  res.json(rows.map((r) => ({
    id: r.id,
    campo: r.campo_alterado,
    valorAnterior: r.valor_anterior,
    valorNovo: r.valor_novo,
    alteradoEm: r.alterado_em,
    usuarioId: r.usuario_id,
  })));
});

// GET /api/fechamentos/:data — carrega o fechamento de um dia (AAAA-MM-DD).
router.get('/:data', (req, res) => {
  const db = req.app.locals.db;
  const row = db.get('SELECT * FROM fechamentos WHERE data = ?', [req.params.data]);
  if (!row) return res.status(404).json({ erro: 'Fechamento não encontrado' });
  res.json(rowParaApi(row));
});

// POST /api/fechamentos — cria ou atualiza (upsert por data) o fechamento.
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const body = req.body || {};

  if (!body.data) return res.status(400).json({ erro: 'Campo "data" é obrigatório' });

  // Estado anterior (se já existir) — usado para registrar as edições de um dia
  // já FECHADO no log_edicoes.
  const existente = db.get('SELECT * FROM fechamentos WHERE data = ?', [body.data]);

  const config = db.get('SELECT * FROM configuracoes WHERE id = 1') || {};

  // Valores brutos enviados pela tela (camelCase -> número saneado).
  const valores = {};
  for (const [, key] of COLS_VALOR) valores[key] = num(body[key]);

  // Pendências do dia (vínculo por data): abertas neste dia e recebidas neste
  // dia ambas SUBTRAEM da conferência de cartão/pix. Lidas do banco para o
  // cálculo gravado refletir o estado real, não o que a tela enviou.
  const pAbertas = db.get(
    "SELECT COALESCE(SUM(valor), 0) AS s FROM pendencias WHERE data_abertura = ?",
    [body.data]
  );
  const pRecebidas = db.get(
    "SELECT COALESCE(SUM(valor), 0) AS s FROM pendencias WHERE data_recebimento = ?",
    [body.data]
  );

  // Recalcula os derivados, já com as pendências do dia.
  const calc = calcularFechamento({
    ...valores,
    fundoFixoCaixa1: valores.fundoFixoCaixa1Usado,
    fundoFixoCaixa2: valores.fundoFixoCaixa2Usado,
    limiteDiferencaMoeda: num(config.limite_diferenca_moeda),
    pendenciasAbertas: num(pAbertas?.s),
    pendenciasRecebidas: num(pRecebidas?.s),
  });

  // Monta o conjunto completo de colunas a gravar.
  const colunas = {
    data: body.data,
    dia_semana: diaSemana(body.data),
    usuario_id: body.usuarioId ?? null,
    status: body.status === 'fechado' ? 'fechado' : 'rascunho',
    observacoes: body.observacoes ?? null,
  };
  for (const [col, key] of COLS_VALOR) colunas[col] = valores[key];
  for (const [col, key] of COLS_CALC) colunas[col] = num(calc[key]);

  const nomes = Object.keys(colunas);
  const placeholders = nomes.map(() => '?');
  const updates = nomes
    .filter((c) => c !== 'data')
    .map((c) => `${c} = excluded.${c}`);

  const sql =
    `INSERT INTO fechamentos (${nomes.join(', ')}) VALUES (${placeholders.join(', ')}) ` +
    `ON CONFLICT(data) DO UPDATE SET ${updates.join(', ')}, ` +
    `editado_em = datetime('now', 'localtime')`;

  db.run(sql, Object.values(colunas));

  const salvo = db.get('SELECT * FROM fechamentos WHERE data = ?', [body.data]);

  // Log de edições: só quando um dia JÁ FECHADO é alterado (edição de
  // fechamento passado). Rascunho em andamento não gera log.
  if (existente && existente.status === 'fechado') {
    registrarEdicoes(db, existente, colunas, salvo.id, body.usuarioId ?? null);
  }
  res.json(rowParaApi(salvo));
});

export default router;
