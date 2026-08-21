-- Schema do sistema de fechamento de caixa — Alface & Melancia
-- Banco SQLite executado via sql.js (WebAssembly, sem binários nativos).
-- Todos os valores monetários são guardados como REAL (reais, com centavos).

-- ---------------------------------------------------------------------------
-- usuarios: operadores que fazem o fechamento
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT NOT NULL UNIQUE,
  senha     TEXT NOT NULL,            -- hash da senha
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------------
-- configuracoes: guarda só o estado atual (sem histórico).
-- Espera-se uma única linha (id = 1).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracoes (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  -- nome_maquina_1..4: coluna morta, não lida/gravada mais (rótulo virou fixo "Máquina N").
  nome_maquina_1         TEXT    NOT NULL DEFAULT 'Maquina 1',
  nome_maquina_2         TEXT    NOT NULL DEFAULT 'Maquina 2',
  nome_maquina_3         TEXT    NOT NULL DEFAULT 'Maquina 3',
  nome_maquina_4         TEXT    NOT NULL DEFAULT 'Maquina 4',
  limite_diferenca_moeda REAL    NOT NULL DEFAULT 50.0
);

-- ---------------------------------------------------------------------------
-- fechamentos: um registro por dia trabalhado.
-- Os valores calculados são SALVOS (histórico imutável). O dinheiro segue o
-- fluxo por caixa: abertura, suprimento, sangrias, fechamento e desejado.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fechamentos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  data        TEXT    NOT NULL UNIQUE,   -- AAAA-MM-DD
  dia_semana  TEXT    NOT NULL,          -- segunda..sabado
  usuario_id  INTEGER REFERENCES usuarios(id),

  -- Nº de vendas do dia (opcional; alimenta o ticket médio no painel)
  numero_vendas INTEGER NOT NULL DEFAULT 0,

  -- Microvix (relatório do PDV)
  microvix_credito  REAL NOT NULL DEFAULT 0,
  microvix_debito   REAL NOT NULL DEFAULT 0,
  microvix_voucher  REAL NOT NULL DEFAULT 0,
  microvix_pix      REAL NOT NULL DEFAULT 0,
  microvix_dinheiro REAL NOT NULL DEFAULT 0,
  microvix_a_prazo  REAL NOT NULL DEFAULT 0,
  microvix_ifood    REAL NOT NULL DEFAULT 0,

  -- Maquininhas (real recebido). Cada máquina: cartão + pix.
  maq1_cartao      REAL NOT NULL DEFAULT 0,
  maq1_pix         REAL NOT NULL DEFAULT 0,
  maq2_cartao      REAL NOT NULL DEFAULT 0,
  maq2_pix         REAL NOT NULL DEFAULT 0,
  maq3_cartao      REAL NOT NULL DEFAULT 0,
  maq3_pix         REAL NOT NULL DEFAULT 0,
  maq4_cartao      REAL NOT NULL DEFAULT 0,
  maq4_pix         REAL NOT NULL DEFAULT 0,
  pix_chave_direta REAL NOT NULL DEFAULT 0,

  -- Dinheiro (fluxo por caixa) — sem fundo fixo
  abertura_caixa_1   REAL NOT NULL DEFAULT 0,   -- quanto o caixa tinha ao abrir
  abertura_caixa_2   REAL NOT NULL DEFAULT 0,
  suprimento_caixa_1 REAL NOT NULL DEFAULT 0,   -- dinheiro acrescentado no dia
  suprimento_caixa_2 REAL NOT NULL DEFAULT 0,
  fechamento_caixa_1 REAL NOT NULL DEFAULT 0,   -- total contado no fim (cédulas)
  fechamento_caixa_2 REAL NOT NULL DEFAULT 0,
  desejado_caixa_1   REAL NOT NULL DEFAULT 0,   -- quanto deixar p/ o próximo dia
  desejado_caixa_2   REAL NOT NULL DEFAULT 0,
  sangrias           TEXT,                      -- JSON: [{caixa,descricao,valor}]
  ajustes_cartao     TEXT,                      -- JSON: [{tipo,descricao,valor}] soma/subtrai
  ajustes_dinheiro   TEXT,                      -- JSON: [{tipo,descricao,valor}] soma/subtrai

  -- Sábado (moedas, contadas só no fechamento semanal)
  moedas_caixa_1 REAL NOT NULL DEFAULT 0,
  moedas_caixa_2 REAL NOT NULL DEFAULT 0,

  -- Calculados e SALVOS
  total_maquininhas         REAL NOT NULL DEFAULT 0,
  total_maquininhas_microvix REAL NOT NULL DEFAULT 0,
  dinheiro_esperado         REAL NOT NULL DEFAULT 0,
  dinheiro_contado_ajustado REAL NOT NULL DEFAULT 0,   -- contado + ajustes_dinheiro
  sangria_caixa_1           REAL NOT NULL DEFAULT 0,   -- soma das sangrias do caixa
  sangria_caixa_2           REAL NOT NULL DEFAULT 0,
  retirar_caixa_1           REAL NOT NULL DEFAULT 0,   -- fechamento − desejado
  retirar_caixa_2           REAL NOT NULL DEFAULT 0,
  diferenca_dinheiro        REAL NOT NULL DEFAULT 0,
  diferenca_cartao_pix      REAL NOT NULL DEFAULT 0,

  -- Controle
  status      TEXT NOT NULL DEFAULT 'rascunho',  -- rascunho / fechado
  observacoes TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  editado_em  TEXT,
  editado_por INTEGER REFERENCES usuarios(id)
);

-- ---------------------------------------------------------------------------
-- pendencias: venda no Microvix sem entrada na maquininha no mesmo dia.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pendencias (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao      TEXT NOT NULL,
  valor          REAL NOT NULL DEFAULT 0,
  forma_pagamento TEXT,                  -- credito/debito/voucher/pix...

  data_abertura          TEXT NOT NULL,  -- AAAA-MM-DD
  fechamento_abertura_id INTEGER REFERENCES fechamentos(id),
  previsao_pagamento     TEXT,

  data_recebimento          TEXT,
  fechamento_recebimento_id INTEGER REFERENCES fechamentos(id),
  forma_recebimento         TEXT,     -- dinheiro / cartao_pix (só no recebimento)

  status     TEXT NOT NULL DEFAULT 'aberta',  -- aberta / recebida
  usuario_id INTEGER REFERENCES usuarios(id),
  criado_em  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------------
-- a_prazo_recebimentos: cliente com conta (fiado) formal, já lançado em
-- microvix_a_prazo no dia da venda (fora de qualquer conferência). Aqui só se
-- registra o RECEBIMENTO — quando o cliente quita depois, em dinheiro ou no
-- cartão/pix, sem bater com nada do Microvix daquele dia. Sem rastreio de
-- saldo por cliente, só log de recebimentos avulsos.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS a_prazo_recebimentos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  data              TEXT NOT NULL,   -- AAAA-MM-DD, dia do recebimento
  valor             REAL NOT NULL DEFAULT 0,
  forma_recebimento TEXT NOT NULL,   -- dinheiro / cartao_pix
  descricao         TEXT,            -- opcional, ex.: nome do cliente
  usuario_id        INTEGER REFERENCES usuarios(id),
  criado_em         TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------------
-- categorias_despesa: tipos de despesa (aluguel, salário, fornecedores...).
-- Cadastro prévio para evitar categoria duplicada/digitada diferente.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias_despesa (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT NOT NULL UNIQUE,
  eh_fornecedor INTEGER NOT NULL DEFAULT 0   -- 1 = categoria pede fornecedor específico
);

-- ---------------------------------------------------------------------------
-- fornecedores: cadastro dos fornecedores, pra ranking "mais pagos" no DRE
-- sem depender de texto livre digitado diferente a cada lançamento.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fornecedores (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT NOT NULL UNIQUE,
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------------
-- despesas: lançamento de despesa pontual (só para compor o DRE — sem
-- vencimento, sem recorrência, sem lembrete).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS despesas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  data          TEXT NOT NULL,   -- AAAA-MM-DD
  categoria_id  INTEGER NOT NULL REFERENCES categorias_despesa(id),
  fornecedor_id INTEGER REFERENCES fornecedores(id),   -- só quando a categoria pede fornecedor
  descricao     TEXT,
  valor         REAL NOT NULL DEFAULT 0,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------------
-- log_edicoes: registra qualquer edição de fechamento anterior.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS log_edicoes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  fechamento_id  INTEGER NOT NULL REFERENCES fechamentos(id),
  usuario_id     INTEGER REFERENCES usuarios(id),
  campo_alterado TEXT NOT NULL,
  valor_anterior TEXT,
  valor_novo     TEXT,
  alterado_em    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
