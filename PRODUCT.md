# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Responsável fixo pelo fechamento de caixa da mercearia Alface & Melancia (dono ou gerente), sempre a mesma pessoa, ao final de cada dia de expediente (seg-sáb). Usa desktop de balcão/escritório com teclado e mouse. Tabela `usuarios` existe no schema (múltiplos logins possíveis), mas o uso real hoje é de um único operador fixo.

## Product Purpose

Cruzar o que o PDV Microvix registrou (por forma de pagamento) com o que realmente entrou em caixa (4 maquininhas, pix direto, dinheiro em cédulas), para isolar rapidamente onde falta ou sobra dinheiro no fechamento diário. Sucesso = fechamento correto e conferido em poucos minutos, com toda diferença explicada (erro de classificação de pagamento, troco em moeda, ou pendência) ou sinalizada como furo real a investigar.

## Positioning

Ferramenta interna de uso único (não é produto de mercado). Sua diferença é o modelo de conferência: duas conferências separadas (dinheiro vs. cartão+pix), comparação de cartão+pix por TOTAL geral (nunca categoria por categoria, por causa de erro de classificação), e o mecanismo de pendências com sinais opostos (aberta soma, recebida subtrai) que reconcilia vendas cujo dinheiro chega em dia diferente do registro no Microvix.

## Operating Context

100% local, sem internet, num único computador (Windows, com Smart App Control bloqueando binários nativos — por isso sql.js em vez de better-sqlite3). Fluxo diário: no fim do expediente, o operador digita os valores do relatório Microvix, os valores de cada uma das 4 maquininhas (cartão + pix) e do pix direto na chave, conta as cédulas dos 2 caixas físicos (fundo fixo padrão R$150 cada, configurável), registra pendências abertas/recebidas do dia, fecha e imprime (impressora térmica Elgin i9). Aos sábados, conta também as moedas dos 2 caixas para fechar a diferença acumulada da semana (seg-sáb; domingo é folga). Histórico de fechamentos fica salvo e é consultável; edições de fechamentos passados são permitidas mas logadas.

## Capabilities and Constraints

- Backend Express local + sql.js (SQLite em WASM) — nunca `better-sqlite3` nem `electron` (bloqueados pelo Smart App Control nesta máquina).
- Toda lógica de cálculo centralizada em `src/utils/calculos.js`, compartilhada entre frontend e servidor.
- Histórico imutável: valores calculados são salvos no banco no momento do fechamento, não recalculados depois; mudança de configuração não altera fechamentos antigos.
- Único erro humano tratado: classificação errada de forma de pagamento (não há tratamento de valor digitado errado, venda esquecida ou duplicada).
- A prazo e iFood são só registrados, nunca entram em nenhuma conferência.
- 5 telas: Login, Fechamento do dia (principal), Histórico, Pendências, Configurações.
- Impressão térmica com layout de texto monoespaçado já especificado (ver docs/PROJETO.md).

## Brand Commitments

Nome do negócio: "Alface & Melancia" (mercearia). Nenhuma identidade visual, logo ou paleta definida ainda.

## Evidence on Hand

Nenhum dado real, teste ou caso de uso gravado ainda além da especificação funcional em `docs/PROJETO.md` (valores de exemplo ali são ilustrativos, não dados reais). Não inventar dados de clientes, valores ou nomes de maquininhas além dos exemplos já citados na spec ("Stone", "Voucher", "Entrega").

## Product Principles

1. Conferência clara acima de tudo — o operador precisa ver, em segundos, se e onde há diferença.
2. Nunca recalcular histórico — o que foi fechado fica gravado como estava naquele dia.
3. Separar causas de diferença (moeda, classificação, pendência) em vez de misturar numa conta só.
4. Ferramenta de uso interno único, local e offline — sem dependência de internet ou serviços externos.
5. Editar o passado é permitido, mas nunca silenciosamente — toda edição fica logada.

## Accessibility & Inclusion

Sem requisito específico além de boas práticas padrão de acessibilidade web (contraste adequado, navegação por teclado funcional).
