// calculos.js — TODA a lógica financeira do fechamento de caixa fica aqui.
//
// Módulo ESM: fonte única da lógica, importada tanto pelo frontend (React/Vite)
// quanto pelo servidor Express, conforme sugere o PROJETO.md. Funções puras,
// sem efeitos colaterais — fáceis de testar (ver calculos.test.js).
//
// Convenção de sinais (IMPORTANTE):
//
// 1) Conferência do DINHEIRO — segue a legenda do PROJETO.md:
//      diferenca_dinheiro = contado − esperado
//      negativo = faltou   |   positivo = sobrou
//
// 2) Conferência de CARTÃO/PIX — usa a MESMA convenção intuitiva do dinheiro
//    (real menos esperado), para o operador não precisar inverter o sinal de
//    cabeça:
//      real_ajustado        = total real maquininhas − pendências (abertas + recebidas)
//      diferenca_cartao_pix = real_ajustado − total Microvix
//    NEGATIVO = faltou (entrou menos que o Microvix registrou — recebimento a
//    investigar); POSITIVO = sobrou (entrou mais que o Microvix). Com isso o
//    exemplo João/Maria dá −30 (o líquido do dia ficou abaixo do Microvix).

// Converte para número saneado (campos vazios/indefinidos viram 0).
function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

// Arredonda para 2 casas (centavos), evitando ruído de ponto flutuante.
function arredondar(v) {
  return Math.round((n(v) + Number.EPSILON) * 100) / 100;
}

// Soma uma lista de valores numéricos.
function somar(lista) {
  return (lista || []).reduce((acc, v) => acc + n(v), 0);
}

// Soma o campo `valor` de uma lista de pendências, opcionalmente filtrando por
// status ('aberta' | 'recebida'). Útil para o servidor montar os totais.
function somaPendencias(pendencias, status) {
  return (pendencias || [])
    .filter((p) => !status || p.status === status)
    .reduce((acc, p) => acc + n(p.valor), 0);
}

// Total real recebido nas maquininhas: cartão + pix das 4 máquinas + pix da
// chave direta.
function totalMaquininhas(d = {}) {
  return arredondar(
    n(d.maq1Cartao) + n(d.maq1Pix) +
    n(d.maq2Cartao) + n(d.maq2Pix) +
    n(d.maq3Cartao) + n(d.maq3Pix) +
    n(d.maq4Cartao) + n(d.maq4Pix) +
    n(d.pixChaveDireta)
  );
}

// ---------------------------------------------------------------------------
// Conferência do DINHEIRO
// ---------------------------------------------------------------------------
// Fluxo por caixa (1 e 2) — sem "fundo fixo":
//   abertura     = quanto o caixa tinha ao abrir o dia
//   suprimento   = dinheiro acrescentado ao caixa durante o dia
//   sangria      = soma das retiradas do caixa no dia (pagamentos)
//   fechamento   = total contado no caixa no fim do dia (só cédulas)
//   desejado     = quanto se quer DEIXAR no caixa para o próximo dia
//
// A conferência é COMBINADA (Microvix dá o dinheiro num total só):
//   esperado  = Σ(abertura + suprimento − sangria) + dinheiro Microvix
//   contado   = Σ fechamento
//   diferenca = contado − esperado     (− faltou, + sobrou)
// Diferença pequena (abaixo do limite) = provável troco em moeda.
//
// Além disso, por caixa, quanto retirar no fim para sobrar o desejado:
//   retirar = fechamento − desejado    (+ retira o excedente / − precisa repor)
function conferenciaDinheiro(d = {}) {
  const abertura1 = n(d.aberturaCaixa1);
  const abertura2 = n(d.aberturaCaixa2);
  const suprimento1 = n(d.suprimentoCaixa1);
  const suprimento2 = n(d.suprimentoCaixa2);
  const sangria1 = n(d.sangriaCaixa1);
  const sangria2 = n(d.sangriaCaixa2);
  const fechamento1 = n(d.fechamentoCaixa1);
  const fechamento2 = n(d.fechamentoCaixa2);
  const desejado1 = n(d.desejadoCaixa1);
  const desejado2 = n(d.desejadoCaixa2);

  const dinheiroContado = arredondar(fechamento1 + fechamento2);
  const totalAbertura = arredondar(abertura1 + abertura2);
  const totalSuprimento = arredondar(suprimento1 + suprimento2);
  const totalSangria = arredondar(sangria1 + sangria2);

  const dinheiroEsperado = arredondar(
    totalAbertura + totalSuprimento - totalSangria + n(d.microvixDinheiro)
  );
  const diferencaDinheiro = arredondar(dinheiroContado - dinheiroEsperado);

  // Quanto retirar de cada caixa para sobrar o desejado no próximo dia.
  const retirarCaixa1 = arredondar(fechamento1 - desejado1);
  const retirarCaixa2 = arredondar(fechamento2 - desejado2);
  const totalRetirar = arredondar(retirarCaixa1 + retirarCaixa2);

  const limite = n(d.limiteDiferencaMoeda);
  const provavelMoeda = diferencaDinheiro !== 0 && Math.abs(diferencaDinheiro) < limite;

  return {
    totalAbertura,
    totalSuprimento,
    sangriaCaixa1: arredondar(sangria1),
    sangriaCaixa2: arredondar(sangria2),
    totalSangria,
    dinheiroEsperado,
    dinheiroContado,
    diferencaDinheiro,
    retirarCaixa1,
    retirarCaixa2,
    totalRetirar,
    provavelMoeda,
  };
}

// ---------------------------------------------------------------------------
// Conferência de CARTÃO e PIX (total geral — não compara categoria por categoria)
// ---------------------------------------------------------------------------
// total Microvix = crédito + débito + voucher + pix (do Microvix)
// total real     = soma (cartão + pix) das 4 máquinas + pix chave direta
//
// As pendências entram com sinais OPOSTOS (cada uma explica um lado da diferença):
//   - ABERTA (cliente comprou e ainda NÃO passou o cartão): a venda está no
//     Microvix mas não na maquininha -> a máquina ficou a MENOS. Para explicar,
//     SOMA-se de volta no real. (+)
//   - RECEBIDA (cliente pagou hoje uma compra de outro dia): entrou na maquininha
//     mas não no Microvix de hoje -> a máquina ficou a MAIS. SUBTRAI-se do real. (−)
// Há ainda os AJUSTES de cartão/pix (lista com sinal): eventos de uma vez só que
// somam ou subtraem (ex.: convênio pagou fiado via cartão -> subtrai).
//   real_ajustado = total real + abertas − recebidas + ajustes(com sinal)
//   diferenca     = real_ajustado − total Microvix   (− faltou, + sobrou)
// (a prazo e iFood NÃO entram aqui — são só registro)
function conferenciaCartaoPix(d = {}) {
  const totalMicrovixCartaoPix = arredondar(
    n(d.microvixCredito) + n(d.microvixDebito) + n(d.microvixVoucher) + n(d.microvixPix)
  );
  const totalRealMaquininhas = totalMaquininhas(d);

  const pendenciasAbertas = n(d.pendenciasAbertas);
  const pendenciasRecebidas = n(d.pendenciasRecebidas);
  const totalPendencias = arredondar(pendenciasAbertas + pendenciasRecebidas);
  const ajustesCartao = arredondar(n(d.ajustesCartao)); // soma (+) ou subtrai (−)

  // Diferença bruta antes dos ajustes (real − Microvix), só informativa.
  const diferencaBruta = arredondar(totalRealMaquininhas - totalMicrovixCartaoPix);

  // Abertas SOMAM (explicam a falta na máquina); recebidas SUBTRAEM (sobra na máquina).
  const realAjustado = arredondar(
    totalRealMaquininhas + pendenciasAbertas - pendenciasRecebidas + ajustesCartao
  );
  const diferencaCartaoPix = arredondar(realAjustado - totalMicrovixCartaoPix);

  return {
    totalMicrovixCartaoPix,
    totalRealMaquininhas,
    pendenciasAbertas: arredondar(pendenciasAbertas),
    pendenciasRecebidas: arredondar(pendenciasRecebidas),
    totalPendencias,
    ajustesCartao,
    diferencaBruta,
    realAjustado,
    diferencaCartaoPix,
  };
}

// ---------------------------------------------------------------------------
// Acumulado semanal de MOEDAS (fechamento de sábado)
// ---------------------------------------------------------------------------
// Durante seg–sáb a diferença de dinheiro (com sinal) é acumulada. No sábado
// contam-se as moedas dos 2 caixas para explicar a falta da semana.
//
// As moedas NÃO são retiradas do caixa: o estoque de moedas cresce semana após
// semana. Por isso o operador conta o TOTAL de moedas no caixa, e o que explica
// a falta DESTA semana é o CRESCIMENTO do estoque desde o sábado anterior:
//   acumulado            = soma das diferenças de dinheiro da semana (com sinal)
//   total_moedas         = moedas caixa 1 + caixa 2 (total no caixa agora)
//   moedas_da_semana     = total_moedas − total_moedas_sábado_anterior
//   saldo_nao_explicado  = acumulado + moedas_da_semana
// Como faltas entram negativas no acumulado, o crescimento das moedas (positivo)
// reduz a falta. Saldo perto de zero = explicado por moeda; longe = furo.
// (No primeiro sábado, total_moedas_sábado_anterior = 0.)
function acumuladoSemanal(d = {}) {
  const acumulado = arredondar(somar(d.diferencasDinheiro));
  const totalMoedas = arredondar(n(d.moedasCaixa1) + n(d.moedasCaixa2));
  const moedasSemanaAnterior = arredondar(n(d.moedasSemanaAnterior));
  const moedasDaSemana = arredondar(totalMoedas - moedasSemanaAnterior);
  const saldoNaoExplicado = arredondar(acumulado + moedasDaSemana);

  const limite = n(d.limiteDiferencaMoeda);
  const dentroLimite = Math.abs(saldoNaoExplicado) < limite;

  return {
    acumulado,
    totalMoedas,
    moedasSemanaAnterior,
    moedasDaSemana,
    saldoNaoExplicado,
    dentroLimite,
  };
}

// ---------------------------------------------------------------------------
// Agregador: calcula TODOS os valores derivados de um fechamento de uma vez.
// O servidor usa isto para gravar os campos calculados (histórico imutável).
// ---------------------------------------------------------------------------
function calcularFechamento(d = {}) {
  const dinheiro = conferenciaDinheiro(d);
  const cartaoPix = conferenciaCartaoPix(d);
  return { ...dinheiro, ...cartaoPix };
}

export {
  n,
  arredondar,
  somar,
  somaPendencias,
  totalMaquininhas,
  conferenciaDinheiro,
  conferenciaCartaoPix,
  acumuladoSemanal,
  calcularFechamento,
};
