# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma

Sempre responda em português.

Responder sempre em português (pt-BR). O domínio do projeto, os comentários do código e os nomes de variáveis são em português.

## Restrições da máquina (críticas)

O Smart App Control do Windows **bloqueia binários nativos** nesta máquina. **Nunca** introduzir `better-sqlite3` nem `electron` — ambos são bloqueados. Todo o banco roda via `sql.js` (SQLite em WebAssembly, JS puro). Não adicionar dependências com addons nativos (`node-gyp`).

## Comandos

```
npm run dev      # frontend React (Vite), HMR — dev usa Vite (5173/5174) com proxy /api -> 3001
npm run build    # build de produção do frontend (Vite) -> pasta dist/
npm run server   # API Express local em http://localhost:3001 (node server/index.js)
npm run iniciar  # produção: build + sobe o servidor (Express serve dist/ + API na MESMA porta)
npm test         # testes das funções de cálculo (node src/utils/calculos.test.js)
npx eslint .     # lint (config em eslint.config.js; sem script dedicado no package.json)
```

Em **produção local** (uso real), o operador roda `iniciar.bat` (duplo clique): instala deps na 1ª vez, builda o frontend e sobe o servidor, que serve a interface buildada (`dist/`) **e** a API na mesma porta 3001 — abrindo o navegador automaticamente (via `ABRIR_NAVEGADOR=1`). Em **desenvolvimento**, usar `npm run dev` (Vite com HMR) + `npm run server`. Tudo 100% local, sem internet, num único computador.

Variáveis de ambiente do servidor: `PORT` (padrão 3001) e `DB_PATH` (padrão `server/data/fechamento.db`).

O projeto é **ESM em todo lugar** (`"type": "module"` no package.json): servidor e frontend usam `import`/`export`. Isso permite que `src/utils/calculos.js` seja a fonte única da lógica, importada tanto pelo Express quanto pelo React. Em arquivos do servidor, `__dirname` não existe — derive de `import.meta.url` com `fileURLToPath`. Imports relativos locais precisam da extensão `.js`.

## Arquitetura

Sistema de fechamento de caixa de uma mercearia (PDV Microvix). O objetivo central é **cruzar o que o Microvix registrou com o que entrou de fato** (maquininhas, pix, dinheiro) e isolar onde falta/sobra dinheiro. A especificação completa do negócio está em **`docs/PROJETO.md`** — ler antes de implementar qualquer regra financeira.

### Backend (`server/`)
- `index.js` — servidor Express; injeta o banco em `app.locals.db` para as rotas usarem.
- `db.js` — abre/salva o banco via `sql.js`. **Padrão central: o banco vive em memória e é exportado para o arquivo `.db` a cada escrita** (`run()` chama `persist()` automaticamente, com write-atômico via `.tmp` + rename). O operador nunca salva manualmente; backup é copiar o `.db`. A wasm do sql.js é localizada em `node_modules/sql.js/dist` via `locateFile` (sem fetch).
- `schema.sql` — DDL das 5 tabelas, aplicado de forma idempotente no boot (`CREATE TABLE IF NOT EXISTS`); semeia a linha única de `configuracoes` (id=1).
- `routes/` — `fechamentos`, `pendencias`, `usuarios`, `configuracoes` (a implementar; placeholders comentados em `index.js`).

### Frontend (`src/`)
Atualmente ainda é o scaffold padrão do Vite (`App.jsx` é a tela de exemplo). A estrutura-alvo (5 telas: Login, Fechamento, Histórico, Pendências, Configurações) e os componentes estão descritos em `docs/PROJETO.md`.

## Regras de domínio que moldam o código

Estas decisões não são óbvias pelo código e mudam como tudo é estruturado:

- **Histórico imutável.** Os valores calculados (totais, diferenças, sangria) são **gravados** em `fechamentos`, não recalculados na leitura. O fundo fixo usado no dia também é salvo como snapshot (`fundo_fixo_caixa_*_usado`). Se a configuração mudar depois, fechamentos antigos mantêm os números originais.

- **Toda a lógica financeira fica em um único lugar** (`src/utils/calculos.js`, a criar) para ser testável e compartilhável com o servidor. Não espalhar cálculos pelas telas/rotas.

- **Duas conferências separadas.** (1) Dinheiro: `esperado = fundo fixo total + dinheiro Microvix`; `contado = cédulas`; diferença pequena (abaixo de `limite_diferenca_moeda`) é "provável troco em moeda". (2) Cartão+pix: compara-se o **total geral**, nunca categoria por categoria (por causa de erro de classificação de pagamento). Pendências (abertas e recebidas no dia) **subtraem** do cálculo.

- **A prazo e iFood não entram em nenhuma conferência** — só registro.

- **Pendências** têm dois momentos (abertura e recebimento), podendo ocorrer no mesmo dia; ligam-se aos fechamentos por `fechamento_abertura_id` / `fechamento_recebimento_id`.

- **Fechamento de sábado** (seg–sáb; domingo é folga) acumula a diferença de dinheiro da semana e conta as moedas para fechar a conta semanal.

- **Edições de fechamentos passados são permitidas, mas registradas** em `log_edicoes`.

## Ordem de implementação

`docs/PROJETO.md` define a ordem sugerida (passos 1–11). Passo 1 (servidor + db.js + schema) está feito. Seguir a ordem ao continuar.
