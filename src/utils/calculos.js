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
// esperado = (fundo fixo caixa 1 + fundo fixo caixa 2) + dinheiro Microvix
// contado  = cédulas caixa 1 + cédulas caixa 2   (moeda não entra no dia a dia)
// diferenca = contado − esperado   (− faltou, + sobrou)
// sangria caixa N = cédulas caixa N − fundo fixo caixa N
// provavelMoeda = |diferenca| abaixo do limite configurável
function conferenciaDinheiro(d = {}) {
  const fundoFixoCaixa1 = n(d.fundoFixoCaixa1);
  const fundoFixoCaixa2 = n(d.fundoFixoCaixa2);
  const fundoFixoTotal = fundoFixoCaixa1 + fundoFixoCaixa2;

  const dinheiroEsperado = arredondar(fundoFixoTotal + n(d.microvixDinheiro));
  const dinheiroContado = arredondar(n(d.cedulasCaixa1) + n(d.cedulasCaixa2));
  const dinheiroReal = arredondar(dinheiroContado - fundoFixoTotal);

  const diferencaDinheiro = arredondar(dinheiroContado - dinheiroEsperado);

  const sangriaCaixa1 = arredondar(n(d.cedulasCaixa1) - fundoFixoCaixa1);
  const sangriaCaixa2 = arredondar(n(d.cedulasCaixa2) - fundoFixoCaixa2);
  const totalSangria = arredondar(sangriaCaixa1 + sangriaCaixa2);

  const limite = n(d.limiteDiferencaMoeda);
  const provavelMoeda = diferencaDinheiro !== 0 && Math.abs(diferencaDinheiro) < limite;

  return {
    fundoFixoTotal: arredondar(fundoFixoTotal),
    dinheiroEsperado,
    dinheiroContado,
    dinheiroReal,
    diferencaDinheiro,
    sangriaCaixa1,
    sangriaCaixa2,
    totalSangria,
    provavelMoeda,
  };
}

// ---------------------------------------------------------------------------
// Conferência de CARTÃO e PIX (total geral — não compara categoria por categoria)
// ---------------------------------------------------------------------------
// total Microvix = crédito + débito + voucher + pix (do Microvix)
// total real     = soma (cartão + pix) das 4 máquinas + pix chave direta
// ambas as pendências (abertas e recebidas no dia) SUBTRAEM do real:
//   real_ajustado = total real − pendencias_abertas − pendencias_recebidas
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

  // Diferença bruta antes das pendências (real − Microvix), só informativa.
  const diferencaBruta = arredondar(totalRealMaquininhas - totalMicrovixCartaoPix);

  const realAjustado = arredondar(totalRealMaquininhas - totalPendencias);
  const diferencaCartaoPix = arredondar(realAjustado - totalMicrovixCartaoPix);

  return {
    totalMicrovixCartaoPix,
    totalRealMaquininhas,
    pendenciasAbertas: arredondar(pendenciasAbertas),
    pendenciasRecebidas: arredondar(pendenciasRecebidas),
    totalPendencias,
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
