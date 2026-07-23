# Projeto — Alface & Melancia · Fechamento de Caixa

Sistema local de fechamento de caixa para uma mercearia. O objetivo é cruzar o que o PDV (Microvix) registrou com o que realmente entrou (maquininhas, pix, dinheiro) e identificar onde está faltando ou sobrando dinheiro.

## Stack já configurada

- Frontend: React + Vite (já instalado)
- Backend: servidor Express local
- Banco: sql.js (SQLite em WebAssembly, JS puro — escolhido porque o Smart App Control do Windows bloqueia binários nativos como better-sqlite3)
- Dependências já instaladas: `express`, `cors`, `sql.js`, `react`, `react-dom`, `vite`

Importante: NÃO usar `better-sqlite3` nem `electron` — ambos são bloqueados pelo Smart App Control do Windows nesta máquina. Todo o banco roda via `sql.js`.

## Como deve rodar

O servidor Express serve a API e cuida do arquivo `.db` automaticamente (salva em disco a cada operação que altera dados — o operador nunca salva manualmente). Um atalho inicia o servidor e abre o navegador. O sistema roda 100% local, sem internet, num único computador.

O banco fica num arquivo `.db` em disco. Ao iniciar, o servidor carrega o arquivo (ou cria se não existir); a cada escrita, exporta o banco do sql.js e grava o arquivo. Fazer backup é só copiar esse arquivo.

---

## Contexto do negócio

A mercearia usa o PDV Microvix. No fechamento do PDV, o Microvix dá um relatório com os valores recebidos por forma de pagamento: dinheiro, crédito, débito, voucher, pix, a prazo e iFood.

O problema: o que o Microvix registra nem sempre bate com o que entrou de fato. As causas conhecidas são:

1. Erro de classificação de pagamento — o operador lança uma venda como pix quando foi no cartão, etc. (este é o ÚNICO tipo de erro humano a tratar — não há erro de valor digitado, venda esquecida ou duplicada).
2. Troco em moeda — moedas dadas de troco não são contadas no dia a dia e somem da conta.
3. Pendências — cliente compra, a venda entra no Microvix, mas não passa na maquininha (ex: esqueceu o cartão, paga depois).

### Maquininhas

São 4 maquininhas físicas. Cada uma recebe cartão (débito/crédito/voucher juntos) e pix. Os nomes são configuráveis — exemplos reais: "Stone", "Voucher" (recebe voucher diferente), "Entrega", e uma sem identificação. No relatório do Microvix os tipos de cartão vêm somados (não separa por máquina).

### Pix

No Microvix, o pix vem todo junto num valor só. Mas na realidade o pix pode ter entrado de duas formas: na maquininha (sai no relatório de cada máquina) ou direto na chave pix (cai na conta). Então:
`Pix Microvix = soma do pix das 4 maquininhas + pix chave direta`

### Dinheiro

- 2 caixas físicos. Cada um começa o dia com um fundo fixo (padrão R$ 150, configurável por caixa).
- No fim do dia conta-se só as CÉDULAS de cada caixa (moeda não é contada no dia a dia).
- O que exceder o fundo fixo vira sangria, levada ao pessoal de compras (que compra no Ceasa em espécie).
- A diferença do dinheiro quase sempre é troco em moeda.

Cálculo do dinheiro:
```
Dinheiro esperado = fundo fixo total + dinheiro registrado no Microvix
                  = (fundo caixa 1 + fundo caixa 2) + dinheiro Microvix
Dinheiro contado  = cédulas caixa 1 + cédulas caixa 2
Diferença dinheiro = contado - esperado   (negativo = faltou, positivo = sobrou)
Sangria caixa N = cédulas caixa N - fundo fixo caixa N
```

A diferença do dinheiro é tratada SEPARADAMENTE da conferência de cartão/pix, porque a causa dela é específica (moeda). Se a diferença for pequena (abaixo de um limite configurável, ex: R$ 50), o sistema indica "provável troco em moeda".

### Moedas (fechamento de sábado)

A mercearia trabalha de segunda a sábado (domingo é folga, sem fechamento). As moedas não são contadas no dia a dia, mas no sábado sim, para fechar a conta da semana.

- Durante seg-sex, o sistema acumula a diferença de dinheiro de cada dia.
- No sábado, além do fechamento normal, aparece um campo extra para contar as moedas dos 2 caixas.
- **As moedas NÃO são retiradas do caixa** — o estoque de moedas cresce semana após semana. Por isso o operador conta o **total de moedas no caixa**, e o que explica a falta da semana é o **crescimento** desde o sábado anterior (o total de moedas de cada sábado fica gravado naquele fechamento):
```
Diferença acumulada da semana (seg a sáb)
Total de moedas no caixa (contado no sábado)
Moedas da semana = total no caixa - total no sábado anterior
Saldo não explicado = acumulado + moedas da semana
```
- Se o saldo não explicado for pequeno, está tudo certo (era moeda). Se for grande, há furo real para investigar.
- Cada semana é independente: o acumulado de diferenças zera (só olha seg–sáb daquela semana) e as moedas usam o delta desde o último sábado. No primeiro sábado, o "sábado anterior" vale 0.

### Pendências

Uma pendência é quando a venda entra no Microvix mas o dinheiro não entra na maquininha no mesmo dia. Tem dois momentos:

1. ABERTURA (dia que a venda aconteceu mas não pagou): a venda está no Microvix, não na maquininha. Isso explica uma diferença a MENOS na maquininha. A pendência fica com status "aberta".

2. RECEBIMENTO (dia que o cliente pagou): o cliente passa o cartão. Agora a maquininha tem um valor a MAIS que o Microvix daquele dia (porque a venda original foi em outro dia). O operador, no fechamento do dia do recebimento, marca a pendência como recebida.

No mesmo dia pode haver abertura de novas pendências E recebimento de pendências antigas.

Campos da pendência: descrição, valor, forma de pagamento, data de abertura, fechamento de abertura, previsão de pagamento, data de recebimento, fechamento de recebimento, status (aberta/recebida).

---

## Lógica da conferência (a parte mais importante)

Há DUAS conferências separadas:

### Conferência do dinheiro
Conforme a fórmula da seção "Dinheiro" acima. Resultado com sinal (− faltou, + sobrou) e indicação de provável moeda se abaixo do limite.

### Conferência de cartão e pix (geral, sem separar categorias)
Por causa do erro de classificação, NÃO se compara categoria por categoria (não compara pix do Microvix com pix real separadamente). Compara-se o total geral:

```
Total Microvix cartão+pix = crédito + débito + voucher + pix (do Microvix)
Total real maquininhas    = soma de (cartão + pix) das 4 máquinas + pix chave direta

Diferença bruta = total real - total Microvix

Ajuste de pendências (sinais OPOSTOS — cada uma explica um lado da diferença):
  - Pendência ABERTA (Maria deve): está no Microvix, não na maquininha → a máquina ficou a MENOS → SOMA de volta (+)
  - Pendência RECEBIDA (João pagou hoje compra de outro dia): está na maquininha, não no Microvix de hoje → a máquina ficou a MAIS → SUBTRAI (−)

Real ajustado  = total real maquininhas + abertas − recebidas
Diferença real = real ajustado - total Microvix     (− faltou, + sobrou)
```

Resultado mostrado com sinal (mesma convenção intuitiva da conferência de dinheiro):
- `−` faltou (entrou menos do que o Microvix registrou)
- `+` sobrou (entrou mais do que o Microvix registrou)

Exemplo: Maria (aberta 80) sozinha, com máquina 80 a menos que o Microvix → real ajustado soma 80 → diferença **0** (a pendência explica a falta). Quando casam, João (recebida) + Maria (aberta) zeram a diferença.

A prazo e iFood NÃO entram em nenhuma conferência — são apenas registrados para controle (a prazo é venda fiada que não gera entrada de dinheiro hoje; iFood é repasse futuro, usa-se o valor que aparece no Microvix mesmo).

---

## Banco de dados (SQLite via sql.js)

### usuarios
- id (PK)
- nome
- senha (hash)
- criado_em

### configuracoes
- id (PK)
- nome_maquina_1, nome_maquina_2, nome_maquina_3, nome_maquina_4
- fundo_fixo_caixa_1, fundo_fixo_caixa_2
- limite_diferenca_moeda (ex: 50.00)

Guarda só o valor atual (sem histórico de alterações).

### fechamentos
- id (PK)
- data, dia_semana
- usuario_id (FK)
- Microvix: microvix_credito, microvix_debito, microvix_voucher, microvix_pix, microvix_dinheiro, microvix_a_prazo, microvix_ifood
- Maquininhas: maq1_cartao, maq1_pix, maq2_cartao, maq2_pix, maq3_cartao, maq3_pix, maq4_cartao, maq4_pix, pix_chave_direta
- Dinheiro: cedulas_caixa_1, cedulas_caixa_2
- Sábado: moedas_caixa_1, moedas_caixa_2
- Fundo fixo USADO no dia (snapshot, para histórico imutável): fundo_fixo_caixa_1_usado, fundo_fixo_caixa_2_usado
- Calculados e SALVOS (para o histórico ser imutável): total_maquininhas, total_maquininhas_microvix, dinheiro_esperado, dinheiro_real, sangria_caixa_1, sangria_caixa_2, diferenca_dinheiro, diferenca_cartao_pix
- Controle: observacoes, criado_em, editado_em, editado_por

Importante: os valores calculados são SALVOS no banco (não recalculados na hora). Em sistema financeiro o histórico é imutável — se a configuração mudar depois, os fechamentos antigos continuam com os números originais. Por isso o fundo fixo usado também é gravado em cada fechamento.

### pendencias
- id (PK)
- descricao, valor, forma_pagamento
- data_abertura, fechamento_abertura_id (FK)
- previsao_pagamento
- data_recebimento, fechamento_recebimento_id (FK)
- status (aberta / recebida)
- usuario_id (FK)
- criado_em

### log_edicoes
- id (PK)
- fechamento_id (FK)
- usuario_id (FK)
- campo_alterado, valor_anterior, valor_novo
- alterado_em

Registra qualquer edição de fechamento anterior (edição de dia passado é permitida, com log).

---

## Telas (5)

1. **Login** — usuário e senha simples. Registra qual operador fez o fechamento.
2. **Fechamento do dia** (tela inicial) — formulário com as seções: Microvix, Maquininhas (cartão + pix por máquina + pix chave direta), Dinheiro (cédulas dos 2 caixas), Pendências (com botão "+ adicionar pendência" para múltiplas, e seção para receber pendências abertas), campo de moedas que só aparece no sábado, observações. Mostra as duas conferências em tempo real. Botões: fechar dia e imprimir, salvar rascunho.
3. **Histórico** — lista de fechamentos por data, com status (fechado / com diferença). Clica e abre o detalhe.
4. **Pendências** — lista e gerencia pendências (abertas / recebidas, com datas).
5. **Configurações** — nomes das maquininhas, fundo fixo por caixa, limite de diferença de moeda, usuários.

---

## Impressão

Impressora térmica Elgin i9. Ao fechar o dia, gera um relatório imprimível. Layout do relatório (referência — valores de exemplo):

```
FECHAMENTO DO DIA - 02/06/2025
================================
MICROVIX
Crédito:          R$ 1.200,00
Débito:           R$   800,00
Voucher:          R$   150,00
Pix:              R$   600,00
Dinheiro:         R$   500,00
A prazo:          R$   200,00 *
iFood:            R$   300,00 *
  * excluídos da conferência
================================
REAL RECEBIDO - MAQUININHAS
Stone cartão:     R$   550,00
Stone pix:        R$   150,00
Voucher cartão:   R$   700,00
Voucher pix:      R$   200,00
Entrega cartão:   R$   600,00
Entrega pix:      R$   100,00
Máquina 4 cartão: R$   350,00
Máquina 4 pix:    R$   100,00
Pix chave direta: R$   100,00
--------------------------------
Total maquininhas:R$ 2.850,00
================================
REAL RECEBIDO - DINHEIRO
Caixa 1 cédulas:  R$   320,00
Caixa 2 cédulas:  R$   290,00
--------------------------------
Total cédulas:    R$   610,00
Fundo fixo:     - R$   300,00
Dinheiro real:    R$   310,00
Sangria caixa 1:  R$   170,00
Sangria caixa 2:  R$   140,00
Total sangria:    R$   310,00
================================
REGISTROS - SEM CONFERÊNCIA
A prazo:          R$   200,00 (a receber)
iFood:            R$   300,00 (repasse futuro)
================================
CONFERÊNCIA - DINHEIRO
Esperado:         R$   650,00
  (R$150 fundo + R$500 Microvix)
Contado:          R$   610,00
Diferença:        R$   -40,00
  -> Provável troco em moeda
================================
CONFERÊNCIA - CARTÃO E PIX
Microvix:         R$ 2.750,00
Real maquininhas: R$ 2.850,00
Pend. recebida: - R$    50,00
  (João - aberta 30/05)
Nova pendência: - R$    80,00
  (Maria - previsão 05/06)
Diferença:        R$   +30,00 (atencao)
================================
PENDÊNCIAS RECEBIDAS HOJE
- João R$ 50,00 crédito
  Aberta: 30/05 · Recebida: 02/06

PENDÊNCIAS EM ABERTO
- Maria R$ 80,00 crédito
  Aberta: 02/06 · Previsão: 05/06
================================
OBSERVAÇÕES
Sem observações.
--------------------------------
Operador: Fulano
Fechamento: 02/06/2025 18:45
================================
```

No sábado, adicionar a seção de moedas e o fechamento semanal:
```
FECHAMENTO SEMANAL - MOEDAS
Moedas caixa 1:   R$ 70,00
Moedas caixa 2:   R$ 63,00
Total no caixa:   R$ 133,00
Sábado anterior:- R$  63,00
Moedas da semana: R$  70,00
Dif. acumulada:  -R$  70,00
Saldo não explic.:R$   0,00
```

---

## Arquitetura de arquivos sugerida

```
fechamento-alface/
├── package.json
├── server/
│   ├── index.js          <- servidor Express
│   ├── db.js             <- carrega/salva o arquivo .db via sql.js
│   ├── schema.sql        <- criação das tabelas
│   └── routes/
│       ├── fechamentos.js
│       ├── pendencias.js
│       ├── usuarios.js
│       └── configuracoes.js
├── src/
│   ├── App.jsx           <- roteamento entre telas
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Fechamento.jsx
│   │   ├── Historico.jsx
│   │   ├── Pendencias.jsx
│   │   └── Configuracoes.jsx
│   ├── components/
│   │   ├── CampoValor.jsx    <- input de dinheiro formatado em R$
│   │   ├── Conferencia.jsx   <- bloco de conferência
│   │   ├── Pendencia.jsx     <- card de pendência
│   │   └── Impressao.jsx     <- layout de impressão térmica
│   └── utils/
│       ├── calculos.js       <- TODA a lógica financeira fica aqui
│       └── formatacao.js     <- formatar R$, datas
```

Manter TODA a lógica financeira em `src/utils/calculos.js` (ou compartilhada com o servidor) num único lugar, para ser fácil de testar e corrigir.

---

## Ordem sugerida de implementação

1. Servidor Express + db.js (sql.js carregando/salvando arquivo) + schema das tabelas
2. Funções de cálculo (calculos.js) — conferências de dinheiro e cartão/pix, sangria, pendências, acumulado semanal
3. Tela de Fechamento (a principal) com as conferências em tempo real
4. Persistência (salvar/carregar fechamento via API)
5. Pendências (abertura, recebimento, múltiplas)
6. Histórico + detalhe + edição com log
7. Configurações
8. Login
9. Impressão térmica
10. Fechamento de sábado (moedas + acumulado semanal)
11. Script de inicialização (sobe servidor + abre navegador) e atalho

Começar pelo servidor e pela função de cálculo, porque são a base de tudo.
