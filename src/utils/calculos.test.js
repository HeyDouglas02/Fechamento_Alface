// Testes simples das funções de cálculo. Sem framework: roda com `node`.
//   node src/utils/calculos.test.js
//
// Foco do PROJETO.md: garantir que os sinais + e − das duas conferências
// estão corretos, usando o exemplo João (recebeu R$ 50) e Maria (deve R$ 80).

import assert from 'node:assert/strict';
import {
  conferenciaDinheiro,
  conferenciaCartaoPix,
  acumuladoSemanal,
  totalMaquininhas,
} from './calculos.js';

let passou = 0;
function teste(nome, fn) {
  fn();
  passou += 1;
  console.log(`  ok  ${nome}`);
}

// Dados de maquininhas do exemplo da impressão do PROJETO.md (total = 2850).
const maquininhasExemplo = {
  maq1Cartao: 550, maq1Pix: 150,   // Stone
  maq2Cartao: 700, maq2Pix: 200,   // Voucher
  maq3Cartao: 600, maq3Pix: 100,   // Entrega
  maq4Cartao: 350, maq4Pix: 100,   // Máquina 4
  pixChaveDireta: 100,
};

// Microvix cartão+pix do exemplo (total = 2750).
const microvixExemplo = {
  microvixCredito: 1200,
  microvixDebito: 800,
  microvixVoucher: 150,
  microvixPix: 600,
};

console.log('Conferência de cartão/pix:');

teste('totais batem com a impressão (2750 Microvix, 2850 real)', () => {
  const r = conferenciaCartaoPix({ ...microvixExemplo, ...maquininhasExemplo });
  assert.equal(r.totalMicrovixCartaoPix, 2750);
  assert.equal(r.totalRealMaquininhas, 2850);
  assert.equal(totalMaquininhas(maquininhasExemplo), 2850);
});

teste('pendência ABERTA sozinha explica a falta na máquina (zera o furo)', () => {
  // Maria comprou 80 e NÃO passou o cartão: o Microvix tem +80 que não entrou na
  // maquininha -> a máquina fica a MENOS. A pendência aberta SOMA de volta.
  const r = conferenciaCartaoPix({
    microvixCredito: 1080, // Microvix = 1080 (inclui os 80 da Maria)
    maq1Cartao: 1000,      // real = 1000 (sem os 80 da Maria)
    pendenciasAbertas: 80,
  });
  assert.equal(r.diferencaBruta, -80);        // 1000 − 1080 (informativo, sem ajuste)
  assert.equal(r.realAjustado, 1080);         // 1000 + 80 (aberta SOMA)
  assert.equal(r.diferencaCartaoPix, 0);      // explicado -> furo ZERA
});

teste('João (recebida 50) + Maria (aberta 80) juntos => explicado (diferença 0)', () => {
  // Vendas casadas X=2700; João passou hoje (real +50), Maria está no Microvix (+80).
  const r = conferenciaCartaoPix({
    microvixCredito: 2780, // 2700 casadas + 80 (Maria, aberta)
    maq1Cartao: 2750,      // 2700 casadas + 50 (João, recebida)
    pendenciasRecebidas: 50,
    pendenciasAbertas: 80,
  });
  assert.equal(r.totalPendencias, 130);
  assert.equal(r.realAjustado, 2780);         // 2750 + 80 − 50
  assert.equal(r.diferencaCartaoPix, 0);      // tudo explicado
});

teste('sem pendências: diferença = real − Microvix (sinal +, sobrou/entrou mais)', () => {
  const r = conferenciaCartaoPix({ ...microvixExemplo, ...maquininhasExemplo });
  // Real (2850) acima do Microvix (2750): convenção intuitiva => positivo
  // (entrou mais do que o Microvix registrou).
  assert.equal(r.diferencaCartaoPix, 100);
});

teste('só pendência recebida (João 50) reduz o real em 50', () => {
  const r = conferenciaCartaoPix({
    ...microvixExemplo,
    ...maquininhasExemplo,
    pendenciasRecebidas: 50,
  });
  assert.equal(r.realAjustado, 2800);         // 2850 − 50
  assert.equal(r.diferencaCartaoPix, 50);     // 2800 − 2750
});

teste('ajuste de cartão subtrai do real (convênio pagou fiado via cartão)', () => {
  const r = conferenciaCartaoPix({
    microvixCredito: 2439,   // Microvix = 2439
    maq1Cartao: 2850,        // real = 2850 (R$ 411 a mais na máquina)
    ajustesCartao: -411,     // ajuste: convênio pagou fiado -> subtrai
  });
  assert.equal(r.totalRealMaquininhas, 2850);
  assert.equal(r.realAjustado, 2439);         // 2850 − 411
  assert.equal(r.diferencaCartaoPix, 0);      // 2439 − 2439 => bate
});

console.log('Conferência do dinheiro:');

teste('diferença pequena negativa => faltou + provável moeda', () => {
  const r = conferenciaDinheiro({
    aberturaCaixa1: 150, aberturaCaixa2: 150,    // abertura 300
    microvixDinheiro: 500,
    fechamentoCaixa1: 400, fechamentoCaixa2: 360, // contado 760
    desejadoCaixa1: 150, desejadoCaixa2: 150,
    limiteDiferencaMoeda: 50,
  });
  assert.equal(r.dinheiroEsperado, 800);      // 300 abertura + 500 Microvix
  assert.equal(r.dinheiroContado, 760);
  assert.equal(r.diferencaDinheiro, -40);     // 760 − 800  => sinal −
  assert.equal(r.retirarCaixa1, 250);         // 400 − 150 desejado
  assert.equal(r.retirarCaixa2, 210);         // 360 − 150
  assert.equal(r.totalRetirar, 460);
  assert.equal(r.provavelMoeda, true);        // |−40| < 50
});

teste('suprimento e sangria entram no esperado (diferença zero)', () => {
  const r = conferenciaDinheiro({
    aberturaCaixa1: 200, aberturaCaixa2: 200,     // 400
    suprimentoCaixa1: 100, suprimentoCaixa2: 0,   // +100
    sangriaCaixa1: 50, sangriaCaixa2: 30,         // −80
    microvixDinheiro: 1000,
    fechamentoCaixa1: 700, fechamentoCaixa2: 720, // contado 1420
    desejadoCaixa1: 200, desejadoCaixa2: 200,
    limiteDiferencaMoeda: 50,
  });
  assert.equal(r.totalSuprimento, 100);
  assert.equal(r.totalSangria, 80);
  assert.equal(r.dinheiroEsperado, 1420);     // 400 + 100 − 80 + 1000
  assert.equal(r.dinheiroContado, 1420);
  assert.equal(r.diferencaDinheiro, 0);
  assert.equal(r.retirarCaixa1, 500);         // 700 − 200
  assert.equal(r.retirarCaixa2, 520);         // 720 − 200
  assert.equal(r.provavelMoeda, false);       // diff 0
});

teste('sobra grande => sinal + e não é provável moeda', () => {
  const r = conferenciaDinheiro({
    aberturaCaixa1: 150, aberturaCaixa2: 150,
    microvixDinheiro: 500,
    fechamentoCaixa1: 500, fechamentoCaixa2: 400, // contado 900
    limiteDiferencaMoeda: 50,
  });
  assert.equal(r.diferencaDinheiro, 100);     // 900 − 800  => sinal +
  assert.equal(r.provavelMoeda, false);       // |100| não é < 50
});

console.log('Acumulado semanal de moedas (sábado):');

teste('falta acumulada explicada pelas moedas => saldo pequeno', () => {
  const r = acumuladoSemanal({
    diferencasDinheiro: [-20, -15, -18, -10, -10], // soma −73 (seg a sex)
    moedasCaixa1: 35,
    moedasCaixa2: 28,   // total moedas 63
    limiteDiferencaMoeda: 50,
  });
  assert.equal(r.acumulado, -73);
  assert.equal(r.totalMoedas, 63);
  assert.equal(r.saldoNaoExplicado, -10);     // −73 + 63
  assert.equal(r.dentroLimite, true);         // |−10| < 50 => era moeda
});

teste('furo real: moedas não explicam a falta => saldo grande', () => {
  const r = acumuladoSemanal({
    diferencasDinheiro: [-50, -40, -30],       // soma −120
    moedasCaixa1: 10,
    moedasCaixa2: 10,   // total 20
    limiteDiferencaMoeda: 50,
  });
  assert.equal(r.saldoNaoExplicado, -100);    // −120 + 20 (sem sábado anterior)
  assert.equal(r.dentroLimite, false);        // furo a investigar
});

teste('moedas NÃO retiradas: usa o crescimento desde o sábado anterior', () => {
  // Semana 2: falta −70. O caixa tem 133 em moedas (63 da semana passada + 70
  // novas). O sábado anterior fechou com 63. O crescimento (70) explica a falta.
  const r = acumuladoSemanal({
    diferencasDinheiro: [-20, -15, -20, -10, -5], // soma −70
    moedasCaixa1: 70,
    moedasCaixa2: 63,   // total no caixa = 133
    moedasSemanaAnterior: 63,
    limiteDiferencaMoeda: 50,
  });
  assert.equal(r.totalMoedas, 133);           // total no caixa
  assert.equal(r.moedasDaSemana, 70);         // 133 − 63
  assert.equal(r.saldoNaoExplicado, 0);       // −70 + 70 => explicado
  assert.equal(r.dentroLimite, true);
});

console.log(`\n${passou} testes passaram.`);
