---
name: Alface & Melancia — Fechamento de Caixa
description: Ferramenta interna de fechamento de caixa para PDV — conferência clara acima de tudo.
colors:
  verde-melancia: "#43a83a"
  verde-melancia-escuro: "#2f7d32"
  verde-melancia-bg: "#eaf6e7"
  lima-and: "#9fc23a"
  vermelho-polpa: "#d8362b"
  ouro-estrela: "#c9a227"
  vermelho-bg: "#fdecea"
  ambar-atencao: "#b7791f"
  ambar-bg: "#fdf6e3"
  azul-bg: "#eaf2fd"
  azul-borda: "#cfe1fb"
  texto: "#1f2733"
  texto-suave: "#5b6672"
  texto-fraco: "#8a929c"
  borda: "#e4e8ed"
  borda-forte: "#d4dae1"
  bg: "#f3f5f8"
  superficie: "#ffffff"
  superficie-2: "#f8fafc"
typography:
  h1:
    fontFamily: "'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
  h2:
    fontFamily: "'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 650
  h3:
    fontFamily: "'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 600
  body:
    fontFamily: "'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 500
  numero:
    fontFamily: "'Cascadia Code', Consolas, ui-monospace, monospace"
    fontVariantNumeric: "tabular-nums"
  kpi-valor:
    fontFamily: "'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
  kpi-valor-principal:
    fontFamily: "'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "2.1rem"
    fontWeight: 700
rounded:
  sm: "7px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  xs: "0.3rem"
  sm: "0.5rem"
  md: "0.85rem"
  lg: "1.25rem"
  xl: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.verde-melancia}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0.7rem"
  button-primary-hover:
    backgroundColor: "{colors.verde-melancia-escuro}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0.7rem"
  button-secondary:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.texto}"
    rounded: "{rounded.sm}"
    padding: "0.7rem"
  input-text:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.texto}"
    rounded: "{rounded.sm}"
    padding: "0.55rem 0.7rem"
  card:
    backgroundColor: "{colors.superficie}"
    rounded: "{rounded.md}"
    padding: "1.1rem 1.25rem"
---

# Design System: Alface & Melancia — Fechamento de Caixa

## Overview

**Creative North Star: "O Balcão Confiável"**

Ferramenta de PDV usada uma vez por dia, no fim do expediente, por quem já está cansado depois de um dia de trabalho na mercearia. O design existe pra tirar atrito do único momento que importa: ver se o dinheiro bate. Nada de personalidade visual gritante — a marca aparece com moderação (faixa de logo no topo, verde nos botões de ação, dourado nos alertas), o resto é neutro e funcional como uma planilha bem organizada.

A cor nunca é decorativa aqui: verde é ação positiva/confirmação, vermelho é falta, dourado é sobra/atenção, azul é informação neutra. Tudo em cartões brancos flutuando sobre um fundo cinza-claro, com números sempre alinhados à direita em fonte tabular pra leitura rápida de coluna.

**Key Characteristics:**
- Tema claro fixo, sem modo escuro (uso diário em ambiente de balcão iluminado).
- Cartões brancos com borda sutil + sombra mínima sobre fundo cinza-claro.
- Números financeiros sempre em `tabular-nums`, alinhados à direita.
- Cor como sinal de estado (positivo/negativo/neutro), nunca decoração.
- Densidade média-alta: muitos campos por tela, mas agrupados em seções claras.

## Colors

Paleta de marca (verde/dourado/vermelho da logo) reduzida a papéis funcionais de estado; o resto é neutro cinza-azulado.

### Primary
- **Verde Melancia** (#43a83a): ação principal — botões primários (salvar, fechar dia, confirmar), aba ativa, avatar do usuário, resultado "zero" (conferência bateu).
- **Verde Melancia Escuro** (#2f7d32): hover/estado ativo do verde principal.
- **Verde Melancia Fundo** (#eaf6e7): fundo suave para estado positivo/neutro (linha selecionada em tabela, resultado zerado).

### Secondary
- **Ouro Estrela** (#c9a227): resultado "sobrou" nas conferências (diferença positiva) e KPIs em alerta de sobra — nunca usado em botão de ação.
- **Vermelho Polpa** (#d8362b): resultado "faltou" (diferença negativa), erros de formulário, ação destrutiva (excluir).

### Neutral
- **Texto** (#1f2733): texto principal, títulos.
- **Texto Suave** (#5b6672): rótulos de campo, texto secundário.
- **Texto Fraco** (#8a929c): metadados, texto terciário (rodapés de KPI, placeholders).
- **Borda** (#e4e8ed) / **Borda Forte** (#d4dae1): divisórias de cartão / contorno de input.
- **Fundo** (#f3f5f8): fundo da página.
- **Superfície** (#ffffff) / **Superfície 2** (#f8fafc): cartão / bloco levemente destacado dentro de cartão (ex: bloco de caixa dentro da seção Dinheiro).

### Named Rules
**The State-Only Color Rule.** Verde, dourado e vermelho só aparecem para comunicar um estado real (positivo/atenção/negativo) ou para a ação principal de uma tela. Nunca usar essas cores para decoração ou hierarquia visual sem significado de estado por trás.

## Typography

**Body/UI Font:** 'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif
**Numeric Font:** 'Cascadia Code', Consolas, ui-monospace, monospace (só para valores em R$, sempre com `tabular-nums`)

**Character:** Fonte de sistema, sem personalidade própria — a legibilidade em telas densas de números importa mais que expressão tipográfica. O monoespaçado entra só nos valores, nunca em rótulos ou texto corrido.

### Hierarchy
- **H1** (700, 1.6rem, letter-spacing -0.01em): título de tela (ex: "Fechamento do dia").
- **H2** (650, 1.05rem): título de seção/cartão.
- **H3** (600, 0.9rem, cor texto-suave): subtítulo dentro de seção (ex: "Caixa 1").
- **Body** (400, 1rem, line-height 1.5): texto corrido, valores em tabela.
- **Label** (500, 0.82rem, cor texto-suave): rótulo de campo de formulário.
- **Overline** (600, 0.8rem, uppercase, letter-spacing 0.03em, cor texto-fraco): cabeçalho de tabela, categorias de lista (ex: "PENDÊNCIAS EM ABERTO").
- **KPI Valor** (700, 1.5rem / 2.1rem para o KPI principal, tabular-nums): valor numérico em destaque nos cartões do Painel; o KPI principal (faturamento do período) usa o passo maior pra liderar a hierarquia entre cartões do mesmo tamanho.

### Named Rules
**The Tabular Numbers Rule.** Todo valor monetário usa `font-variant-numeric: tabular-nums` e alinhamento à direita — colunas de número precisam alinhar visualmente para conferência rápida.

## Layout

Container centralizado com `max-width` por tela (680px em Configurações, 1000px em Histórico, 1100–1180px em Painel/Fechamento), padding lateral 1.5rem. Fechamento usa grade de 2 colunas (formulário 1fr + conferências fixas em 380px) que colapsa para 1 coluna abaixo de 900px. A coluna de conferências é `position: sticky` para ficar visível durante o preenchimento do formulário. Painel usa grid de KPIs (4 colunas, 2 em telas ≤820px) e grid de 2 colunas para gráficos lado a lado. Espaçamento entre seções em múltiplos de 0.25rem (0.3rem a 1.5rem), sem sistema de grid rígido de 8pt — os valores seguem o que já está em uso.

## Elevation & Depth

Sistema quase totalmente plano. Profundidade vem só de uma sombra mínima (`--sombra-sm: 0 1px 2px rgba(16,24,40,.06)`) separando cartões brancos do fundo cinza — não há camadas de elevação por importância. A única sombra mais forte (`--sombra-lg: 0 12px 32px rgba(16,24,40,.16)`) é reservada para o cartão de login, que precisa se destacar sozinho contra um fundo em gradiente.

### Shadow Vocabulary
- **sombra-sm** (`0 1px 2px rgba(16, 24, 40, 0.06)`): padrão para todo cartão/seção/tabela — a sombra de repouso do sistema.
- **sombra** (`0 2px 8px rgba(16, 24, 40, 0.08)`): elementos flutuantes pequenos (avatar/logo com destaque).
- **sombra-lg** (`0 12px 32px rgba(16, 24, 40, 0.16)`): reservada para o cartão de login isolado.

### Named Rules
**The Flat-Card Rule.** Cartões usam borda de 1px (`--borda`) + sombra mínima, nunca sombra + borda + gradiente juntos. Profundidade extra é exceção rara (login), não regra.

## Shapes

Cantos levemente arredondados em toda parte, nunca retos nem muito arredondados: `--raio-sm: 7px` para inputs/botões/blocos pequenos, `--raio: 10px` para cartões/seções, `--raio-lg: 14px` só para o cartão de login. Elementos circulares (`border-radius: 50%`) para avatar e logo. Tags e chips de filtro usam `border-radius: 999px` (pill).

## Components

### Buttons
- **Shape:** cantos 7px (`--raio-sm`).
- **Primary:** fundo verde melancia cheio (#43a83a), texto branco, sombra sutil; hover escurece para #2f7d32. Usado para a ação principal da tela (salvar, fechar, adicionar).
- **Secondary/Ghost:** fundo branco, borda `--borda-forte`, texto `--texto`; hover troca fundo para `--superficie-2`. Usado para ações secundárias (rascunho, cancelar, editar).
- **Destructive (hover-only):** botão neutro que vira vermelho (`--vermelho-bg` fundo, borda e texto `--vermelho`) só no hover — usado em "excluir"/"sair", nunca vermelho sólido em repouso.
- **Focus:** anel de foco verde translúcido (`outline: 3px solid rgba(47,158,84,.35)`), sem mudança de cor de fundo.

### Cards / Seções (`.secao`, `.cartao`, `.conferencia`, `.kpi`)
- **Corner Style:** 10px.
- **Background:** branco (`--superficie`) sobre fundo cinza (`--bg`).
- **Shadow Strategy:** sombra-sm de repouso, sem elevação em hover.
- **Border:** 1px `--borda`.
- **Internal Padding:** 1.1rem 1.25rem (padrão de seção/cartão).
- **Título de seção:** H2 com `border-bottom` de 1px separando do conteúdo.

### Inputs / Fields
- **Style:** borda 1px `--borda-forte`, fundo branco, cantos 7px, padding 0.55rem 0.7rem.
- **Focus:** borda vira verde + anel translúcido verde (`outline: 3px solid rgba(47,158,84,.25)`).
- **Valores monetários (`.campo-valor__input`):** texto alinhado à direita, `tabular-nums`.

### Navigation (barra superior `.topo`)
- **Style:** barra branca fixa (sticky) no topo, 64px de altura, com faixa inferior em gradiente de marca (vermelho → dourado → verde) substituindo a borda.
- **Abas:** texto `--texto-suave`, aba ativa ganha `border-bottom` verde de 3px + peso 650 + cor `--verde-escuro`.
- **Hover:** fundo `--superficie-2`.

### Conferência (componente-assinatura)
Bloco de resultado de conferência (`Conferencia.jsx`) — mostra linhas de valores e um resultado final com cor de estado: fundo `--verde-bg`/texto `--verde-escuro` quando bate (zero), fundo `--vermelho-bg`/texto `--vermelho` quando falta (negativo), fundo `--ambar-bg`/texto `--ambar` quando sobra (positivo). É o componente que mais carrega a "personalidade" do sistema — todo o resto é neutro para não competir com ele.

### Tags / Status
- **Style:** pill (999px), fundo suave + texto na cor correspondente (`tag--verde`, `tag--vermelho`, `tag--cinza`).
- **Uso:** status de fechamento no Histórico (fechado / com diferença).

## Do's and Don'ts

### Do:
- **Do** usar verde só para ação principal e estado positivo/zerado — é a única cor "de marca" que aparece em botão sólido.
- **Do** manter números monetários em `tabular-nums`, alinhados à direita, em qualquer tabela ou lista nova.
- **Do** usar sombra mínima (`--sombra-sm`) como padrão de cartão; reservar `--sombra-lg` só para elementos isolados tipo o cartão de login.
- **Do** seguir a convenção de sinal nas conferências: vermelho = faltou, dourado/âmbar = sobrou, verde = bateu.

### Don't:
- **Don't** introduzir sombras fortes ou gradientes decorativos fora do que já existe (faixa do topo, fundo do login, KPI em destaque).
- **Don't** usar vermelho sólido em repouso para botões — vermelho é só hover de ação destrutiva ou estado de erro/falta.
- **Don't** comparar categoria por categoria na UI de conferência de cartão/pix — a interface reflete a regra de negócio de comparar só o total geral.
- **Don't** adicionar modo escuro ou tema alternativo sem pedido explícito — o sistema assume tema claro fixo.
