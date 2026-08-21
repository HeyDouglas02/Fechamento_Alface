# Alface & Melancia — Fechamento de Caixa

Sistema local de fechamento de caixa para uma mercearia. Cruza o que o PDV Microvix registrou (crédito, débito, voucher, pix, dinheiro, a prazo, iFood) com o que realmente entrou — nas maquininhas, no pix direto na chave e nas cédulas dos caixas — e mostra na hora onde está faltando ou sobrando dinheiro.

100% local, sem internet no dia a dia, num único computador. Sem nuvem, sem SaaS, sem dependência externa em produção — a única conexão externa é opcional, pra atualização remota e backup automático (ver abaixo).

## Por que existe

O relatório do Microvix nem sempre bate com o que entrou de fato. As causas conhecidas:

1. **Erro de classificação de pagamento** — venda lançada como pix quando foi cartão, etc.
2. **Troco em moeda** — moedas dadas de troco não são contadas no dia a dia e "somem" da conta.
3. **Pendências** — venda entra no Microvix, mas o cliente só paga em outro dia.

O sistema separa essas causas em vez de misturar tudo numa única diferença.

## Como funciona a conferência

Duas conferências independentes, nunca misturadas:

### Dinheiro
```
Esperado = abertura + suprimento - sangrias + dinheiro Microvix - ajustes
Contado  = cédulas contadas no fechamento
Diferença = contado - esperado   (− faltou · + sobrou)
```
Diferença pequena (abaixo de um limite configurável) é sinalizada como **provável troco em moeda**.

### Cartão + Pix
Comparado sempre pelo **total geral**, nunca categoria por categoria — porque a causa mais comum de diferença é erro de classificação de pagamento, e comparar por categoria esconderia o cancelamento entre elas.

```
Total real maquininhas = soma (cartão + pix) das máquinas + pix chave direta
Diferença bruta = total real - total Microvix (cartão+pix)

Pendência aberta hoje    → soma de volta (a venda não passou na maquininha)
Pendência recebida hoje  → subtrai ou soma, conforme a forma de recebimento
A prazo recebido hoje    → subtrai ou soma, conforme a forma de recebimento

Diferença real = diferença ajustada por pendências e recebimentos "a prazo" do dia
```

**A prazo (venda) e iFood nunca entram na conferência de venda do dia** — são só registrados; o que entra na conferência é o *recebimento* de contas antigas, não a venda original.

## Telas

| Tela | O que faz |
|---|---|
| **Login** | Identifica o operador que está fazendo o fechamento. |
| **Fechamento do dia** | Tela principal — Microvix, maquininhas, dinheiro, ajustes de cartão/dinheiro, pendências, recebimento "a prazo". Mostra as duas conferências em tempo real enquanto digita. Fecha e imprime, ou salva rascunho. |
| **Contas** | Lançamento de despesas por categoria/fornecedor, com edição e exclusão. |
| **Painel** | Três sub-abas: **Receitas** (faturamento, ticket médio, diferença de caixa, composição de pagamentos), **Despesas** (por categoria, maiores gastos, fornecedores mais pagos) e **DRE** (Receita × Despesa × Resultado, regime de caixa). |
| **Histórico** | Lista de fechamentos por data com status. Abre o detalhe; edição de dias passados é permitida, mas fica registrada em log. |
| **Configurações** | Atualização do sistema, status de backup, categorias/fornecedores de despesa, limite de diferença de moeda, cadastro de operadores. |

## Impressão

Ao fechar o dia, o sistema gera um relatório imprimível (impressora térmica) com Microvix, valores reais por maquininha, dinheiro, sangria, ajustes, as duas conferências e pendências/recebimentos do dia.

## Stack

- **Frontend:** React + Vite.
- **Backend:** Express local, servindo API e (em produção) o build do frontend na mesma porta.
- **Banco:** [sql.js](https://sql.js.org) — SQLite compilado pra WebAssembly, JS puro. Escolhido porque o **Smart App Control do Windows bloqueia binários nativos** nesta máquina (`better-sqlite3`, `electron` — nunca usar). O banco vive em memória e é exportado pro arquivo `.db` a cada escrita, com gravação atômica (`.tmp` + rename).
- Projeto **ESM em todo lugar** — `src/utils/calculos.js` é a fonte única da lógica financeira, importada tanto pelo Express quanto pelo React, pra garantir que servidor e tela nunca calculem diferente.

## Rodando

### Desenvolvimento

```bash
npm install
npm run dev      # frontend Vite com HMR — http://localhost:5173 (proxy /api -> 3001)
npm run server   # API Express — http://localhost:3001
```

Rode os dois em paralelo. `npm run dev` faz proxy de `/api` pro Express.

### Produção local

```bash
npm install
npm run build    # build de produção do frontend -> dist/
npm run iniciar  # build + sobe servidor (mesma porta pra tudo)
```

Ou, depois do build inicial, duplo clique em **`iniciar.vbs`** — sobe o servidor sem abrir janela de terminal.

### Outros comandos

```bash
npm test         # testes das funções de cálculo (src/utils/calculos.test.js)
npx eslint .      # lint
```

### Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste:

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | `3001` | Porta do servidor Express. |
| `DB_PATH` | `server/data/fechamento.db` | Caminho do arquivo do banco. |
| `ABRIR_NAVEGADOR` | — | Se `1`, abre o navegador automaticamente ao subir. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Credenciais OAuth pra backup automático no Google Drive (opcional — ver abaixo). |

## Arquitetura

```
server/
├── index.js          servidor Express — injeta o banco em app.locals.db, agenda backup semanal
├── db.js             abre/salva o banco via sql.js (memória -> arquivo .db)
├── backup.js          upload do banco pro Google Drive via OAuth
├── schema.sql         DDL das tabelas, aplicado de forma idempotente no boot
└── routes/
    ├── fechamentos.js
    ├── pendencias.js
    ├── aPrazo.js
    ├── despesas.js
    ├── usuarios.js
    ├── configuracoes.js
    └── sistema.js      atualização remota + status/OAuth do backup

src/
├── App.jsx            roteamento entre telas
├── pages/              Login, Fechamento, Painel (+ PainelReceitas/PainelDespesas/PainelDRE), Contas, Historico, Configuracoes
├── components/         CampoValor, Conferencia, RelatorioImpressao
└── utils/
    ├── calculos.js     TODA a lógica financeira — fonte única, compartilhada com o servidor
    ├── formatacao.js   formatação de R$ e datas
    └── relatorio.js    montagem do relatório de impressão
```

### Banco de dados

`usuarios` · `configuracoes` (limite de diferença de moeda — só o valor atual) · `fechamentos` (todos os valores digitados **e** os calculados, gravados no momento do fechamento) · `pendencias` (abertura e recebimento, com forma de recebimento) · `a_prazo_recebimentos` (recebimento de conta formal/fiado) · `categorias_despesa` · `fornecedores` · `despesas` · `log_edicoes` (toda edição de fechamento passado).

**Histórico é imutável por design.** Os totais e diferenças de um fechamento são salvos no banco na hora, não recalculados depois. Se a configuração mudar no futuro, fechamentos antigos continuam com os números originais de quando foram fechados.

## Atualização remota

Em **Configurações → Sistema**, o botão "Atualizar agora" roda `git pull` + `npm install` (se necessário) + `npm run build` e reinicia o servidor sozinho — sem precisar acesso físico ao computador. Pré-requisito: o computador precisa rodar a partir de um `git clone` real, com acesso à internet no momento da atualização.

## Backup automático

Com as credenciais do Google Drive configuradas (`.env`) e a conexão feita uma vez em Configurações → Sistema, o sistema faz backup semanal automático do banco (`server/data/fechamento.db`) numa pasta no Google Drive. Se o computador estiver desligado no horário programado, o backup roda na próxima inicialização. Também é possível disparar um backup manual a qualquer momento pela mesma tela.
