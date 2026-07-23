# Alface & Melancia — Fechamento de Caixa

Sistema local de fechamento de caixa para a mercearia **Alface & Melancia**. Cruza o que o PDV Microvix registrou (crédito, débito, voucher, pix, dinheiro, a prazo, iFood) com o que realmente entrou — nas 4 maquininhas, no pix direto na chave e nas cédulas dos 2 caixas — e mostra na hora onde está faltando ou sobrando dinheiro.

100% local, sem internet, num único computador. Sem nuvem, sem SaaS, sem dependência externa em produção.

## Por que existe

O relatório do Microvix nem sempre bate com o que entrou de fato. As causas conhecidas:

1. **Erro de classificação de pagamento** — venda lançada como pix quando foi cartão, etc.
2. **Troco em moeda** — moedas dadas de troco não são contadas no dia a dia e "somem" da conta.
3. **Pendências** — venda entra no Microvix, mas o cliente só passa o cartão em outro dia.

O sistema separa essas causas em vez de misturar tudo numa única diferença.

## Como funciona a conferência

Duas conferências independentes, nunca misturadas:

### Dinheiro
```
Esperado = fundo fixo total + dinheiro Microvix
Contado  = cédulas dos 2 caixas
Diferença = contado - esperado   (− faltou · + sobrou)
```
Diferença pequena (abaixo de um limite configurável) é sinalizada como **provável troco em moeda**.

### Cartão + Pix
Comparado sempre pelo **total geral**, nunca categoria por categoria — porque a causa mais comum de diferença é erro de classificação de pagamento, e comparar por categoria esconderia o cancelamento entre elas.

```
Total real maquininhas = soma (cartão + pix) das 4 máquinas + pix chave direta
Diferença bruta = total real - total Microvix (cartão+pix)

Pendência aberta hoje    → soma de volta (a venda não passou na maquininha)
Pendência recebida hoje  → subtrai (o cliente pagou aqui algo vendido em outro dia)

Diferença real = diferença ajustada pelas pendências do dia
```

**A prazo e iFood nunca entram em nenhuma conferência** — são só registrados.

### Fechamento de sábado (moedas)
A mercearia trabalha de segunda a sábado (domingo é folga). Moedas não são contadas dia a dia — só no sábado, pra fechar a semana. Elas **não são retiradas do caixa**, então o que explica a diferença da semana é o *crescimento* do estoque de moedas desde o sábado anterior, não o total contado.

Detalhes completos das fórmulas, casos de borda e exemplos numéricos: [`docs/PROJETO.md`](./docs/PROJETO.md).

## Telas

| Tela | O que faz |
|---|---|
| **Login** | Identifica o operador que está fazendo o fechamento. |
| **Fechamento do dia** | Tela principal — Microvix, maquininhas, dinheiro, pendências (abertura e recebimento), moedas (só sábado). Mostra as duas conferências em tempo real enquanto digita. Fecha e imprime, ou salva rascunho. |
| **Painel** | Visão gerencial: faturamento do período, ticket médio, diferença de caixa acumulada, pendências em aberto, gráfico de faturamento por dia, composição por forma de pagamento, diferença de caixa dia a dia. |
| **Histórico** | Lista de fechamentos por data com status. Abre o detalhe; edição de dias passados é permitida, mas fica registrada em log. |
| **Pendências** | Gerencia pendências abertas e recebidas, com datas de abertura/previsão/recebimento. |
| **Configurações** | Nomes das 4 maquininhas, fundo fixo por caixa, limite de diferença de moeda, cadastro de operadores. |

## Impressão

Ao fechar o dia, o sistema gera um relatório imprimível (impressora térmica Elgin i9) com Microvix, valores reais por maquininha, dinheiro, sangria, as duas conferências, pendências do dia e — aos sábados — o fechamento semanal de moedas. Layout completo em [`docs/PROJETO.md`](./docs/PROJETO.md#impressão).

## Stack

- **Frontend:** React + Vite.
- **Backend:** Express local, servindo API e (em produção) o build do frontend na mesma porta.
- **Banco:** [sql.js](https://sql.js.org) — SQLite compilado pra WebAssembly, JS puro. Escolhido porque o **Smart App Control do Windows bloqueia binários nativos** nesta máquina (`better-sqlite3`, `electron` — nunca usar). O banco vive em memória e é exportado pro arquivo `.db` a cada escrita, com gravação atômica (`.tmp` + rename).
- Projeto **ESM em todo lugar** — `src/utils/calculos.js` é a fonte única da lógica financeira, importada tanto pelo Express quanto pelo React, pra garantir que servidor e tela nunca calculem diferente.

## Rodando

### Uso normal (operador da mercearia)

Dê duplo clique em **`iniciar.bat`**. Na primeira vez instala as dependências e gera a interface; depois disso só sobe o servidor e abre o navegador automaticamente. Pra encerrar, feche a janela do terminal.

Depois de puxar uma atualização do sistema, rode **`rebuildar.bat`** pra atualizar a interface sem perder os fechamentos já salvos (o build só mexe em `dist/`, o banco fica intocado em `server/data/fechamento.db`). Dá F5 no navegador depois.

`criar-atalho.bat` cria um atalho de `iniciar.bat` na área de trabalho.

### Desenvolvimento

```bash
npm run dev      # frontend Vite com HMR — http://localhost:5173 (proxy /api -> 3001)
npm run server   # API Express — http://localhost:3001
```

Rode os dois em paralelo. `npm run dev` faz proxy de `/api` pro Express.

### Outros comandos

```bash
npm run build    # build de produção do frontend -> dist/
npm run iniciar  # build + sobe servidor (produção local, mesma porta pra tudo)
npm test         # testes das funções de cálculo (src/utils/calculos.test.js)
npx eslint .     # lint
```

### Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | `3001` | Porta do servidor Express. |
| `DB_PATH` | `server/data/fechamento.db` | Caminho do arquivo do banco. |
| `ABRIR_NAVEGADOR` | — | Se `1`, abre o navegador automaticamente ao subir (usado pelo `iniciar.bat`). |

## Arquitetura

```
server/
├── index.js          servidor Express — injeta o banco em app.locals.db
├── db.js             abre/salva o banco via sql.js (memória -> arquivo .db)
├── schema.sql         DDL das 5 tabelas, aplicado de forma idempotente no boot
└── routes/
    ├── fechamentos.js
    ├── pendencias.js
    ├── usuarios.js
    └── configuracoes.js

src/
├── App.jsx            roteamento entre telas
├── pages/              Login, Fechamento, Painel, Historico, Configuracoes
├── components/         CampoValor, Conferencia, RelatorioImpressao
└── utils/
    ├── calculos.js     TODA a lógica financeira — fonte única, compartilhada com o servidor
    ├── formatacao.js   formatação de R$ e datas
    └── relatorio.js    montagem do relatório de impressão
```

### Banco de dados (5 tabelas)

`usuarios` · `configuracoes` (nomes das maquininhas, fundo fixo, limite de moeda — só o valor atual) · `fechamentos` (todos os valores digitados **e** os calculados, gravados no momento do fechamento) · `pendencias` (abertura e recebimento) · `log_edicoes` (toda edição de fechamento passado).

**Histórico é imutável por design.** Os totais, diferenças e sangria de um fechamento são salvos no banco na hora, não recalculados depois — inclusive o fundo fixo usado naquele dia é gravado como snapshot. Se a configuração mudar no futuro, fechamentos antigos continuam com os números originais de quando foram fechados.

Regras de domínio completas, casos de borda e o schema SQL inteiro: **[`docs/PROJETO.md`](./docs/PROJETO.md)**.

## Sistema de design

O visual do sistema está documentado em **[`DESIGN.md`](./DESIGN.md)** (tokens de cor, tipografia, componentes e regras de uso) — North Star "O Balcão Confiável": tema claro fixo, cartões planos, cor só como sinal de estado (verde bateu, dourado sobrou, vermelho faltou), números sempre alinhados e em fonte tabular. Contexto de produto (usuário, propósito, restrições) está em **[`PRODUCT.md`](./PRODUCT.md)**.

## Backup

Fazer backup é copiar o arquivo `server/data/fechamento.db`. Não tem processo especial — o operador nunca salva manualmente, o servidor grava a cada alteração.
