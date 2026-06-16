// relatorio.js — monta o texto do relatório de fechamento para a impressora
// térmica (Elgin i9), no formato monoespaçado de 32 colunas (bobina 58mm).
//
// Função pura: recebe os dados já calculados e devolve uma string com o relatório
// pronto para imprimir (a apresentação fica num <pre>; ver RelatorioImpressao).
// O layout segue a referência do PROJETO.md.

import { formatarBRL, formatarData } from './formatacao';

const LARGURA = 32;
const SEP = '='.repeat(LARGURA);
const SUB = '-'.repeat(LARGURA);

// Uma linha "rótulo .... valor" com o valor alinhado à direita na largura fixa.
// `sinal`: true ou '-' => "- R$ x" (subtrai); '+' => "+ R$ x" (soma); '' => "R$ x".
function linha(rotulo, valor, sinal = false) {
  let dir;
  if (sinal === true || sinal === '-') dir = `- ${formatarBRL(valor)}`;
  else if (sinal === '+') dir = `+ ${formatarBRL(valor)}`;
  else dir = formatarBRL(valor);
  const espacos = Math.max(1, LARGURA - rotulo.length - dir.length);
  return rotulo + ' '.repeat(espacos) + dir;
}

// É sábado? (fechamento semanal de moedas)
function ehSabado(dataISO) {
  return new Date(`${dataISO}T12:00:00`).getDay() === 6;
}

export function montarRelatorio({
  data,
  form,
  config,
  confDinheiro,
  confCartao,
  pendenciasDia = [],
  acumulado = null,
  primeiroSabado = false,
  operador = '',
}) {
  const nomeMaq = (i) => config?.[`nomeMaquina${i}`] || `Máquina ${i}`;
  const L = []; // linhas

  L.push(`FECHAMENTO DO DIA - ${formatarData(data)}`);
  L.push(SEP);

  // --- Microvix ---
  L.push('MICROVIX');
  L.push(linha('Crédito:', form.microvixCredito));
  L.push(linha('Débito:', form.microvixDebito));
  L.push(linha('Voucher:', form.microvixVoucher));
  L.push(linha('Pix:', form.microvixPix));
  L.push(linha('Dinheiro:', form.microvixDinheiro));
  L.push(`${linha('A prazo:', form.microvixAPrazo)} *`);
  L.push(`${linha('iFood:', form.microvixIfood)} *`);
  L.push('  * excluídos da conferência');
  L.push(SEP);

  // --- Maquininhas ---
  L.push('REAL RECEBIDO - MAQUININHAS');
  L.push(linha(`${nomeMaq(1)} cartão:`, form.maq1Cartao));
  L.push(linha(`${nomeMaq(1)} pix:`, form.maq1Pix));
  L.push(linha(`${nomeMaq(2)} cartão:`, form.maq2Cartao));
  L.push(linha(`${nomeMaq(2)} pix:`, form.maq2Pix));
  L.push(linha(`${nomeMaq(3)} cartão:`, form.maq3Cartao));
  L.push(linha(`${nomeMaq(3)} pix:`, form.maq3Pix));
  L.push(linha(`${nomeMaq(4)} cartão:`, form.maq4Cartao));
  L.push(linha(`${nomeMaq(4)} pix:`, form.maq4Pix));
  L.push(linha('Pix chave direta:', form.pixChaveDireta));
  L.push(SUB);
  L.push(linha('Total maquininhas:', confCartao.totalRealMaquininhas));
  L.push(SEP);

  // --- Conferência cartão/pix (sem a diferença; vai para o resumo final) ---
  L.push('CONFERÊNCIA - CARTÃO E PIX');
  L.push(linha('Microvix:', confCartao.totalMicrovixCartaoPix));
  L.push(linha('Real maquininhas:', confCartao.totalRealMaquininhas));
  // "Real ajustado" só aparece quando há pendências ou ajustes (senão = real).
  const temAjuste = (confCartao.ajustesCartao || 0) !== 0;
  const temPendencias = confCartao.pendenciasRecebidas || confCartao.pendenciasAbertas;
  if (confCartao.pendenciasAbertas) {
    L.push(linha('Pend. abertas:', confCartao.pendenciasAbertas, '+'));
  }
  if (confCartao.pendenciasRecebidas) {
    L.push(linha('Pend. recebidas:', confCartao.pendenciasRecebidas, true));
  }
  if (temAjuste) L.push(linha('Ajustes:', confCartao.ajustesCartao));
  if (temPendencias || temAjuste) L.push(linha('Real ajustado:', confCartao.realAjustado));
  L.push(SEP);

  // --- Dinheiro (fluxo por caixa) ---
  L.push('DINHEIRO - CAIXA 1');
  L.push(linha('Abertura:', form.aberturaCaixa1));
  L.push(linha('Fechamento:', form.fechamentoCaixa1));
  L.push('DINHEIRO - CAIXA 2');
  L.push(linha('Abertura:', form.aberturaCaixa2));
  L.push(linha('Fechamento:', form.fechamentoCaixa2));
  L.push(SUB);
  L.push(linha('Total suprimento:', confDinheiro.totalSuprimento));
  L.push(linha('Total sangria:', confDinheiro.totalSangria));
  L.push(SUB);
  L.push('RETIRADO NO FIM DO DIA');
  L.push(linha('Caixa 1:', confDinheiro.retirarCaixa1));
  L.push(linha('Caixa 2:', confDinheiro.retirarCaixa2));
  L.push(linha('Total retirado:', confDinheiro.totalRetirar));
  L.push(SUB);
  L.push('FICOU NO CAIXA (próximo dia)');
  L.push(linha('Caixa 1:', form.desejadoCaixa1));
  L.push(linha('Caixa 2:', form.desejadoCaixa2));
  L.push(SEP);

  // --- Conferência dinheiro (sem a diferença; vai para o resumo final) ---
  L.push('CONFERÊNCIA - DINHEIRO');
  L.push(linha('Esperado:', confDinheiro.dinheiroEsperado));
  L.push(linha('Contado:', confDinheiro.dinheiroContado));
  L.push(SEP);

  // --- Diferenças (resumo final) ---
  const difMaquina = confCartao.diferencaCartaoPix;
  const difDinheiro = confDinheiro.diferencaDinheiro;
  const difTotal = Math.round((difMaquina + difDinheiro) * 100) / 100;
  L.push('DIFERENÇAS');
  L.push(`${linha('Diferença máquina:', difMaquina)}${difMaquina !== 0 ? ' (atencao)' : ''}`);
  L.push(`${linha('Diferença dinheiro:', difDinheiro)}${difDinheiro !== 0 ? ' (atencao)' : ''}`);
  if (confDinheiro.provavelMoeda) L.push('  -> Provável troco em moeda');
  L.push(SUB);
  L.push(`${linha('DIFERENÇA TOTAL:', difTotal)}${difTotal !== 0 ? ' (atencao)' : ''}`);
  L.push(SEP);

  // --- Pendências recebidas hoje ---
  const recebidasHoje = pendenciasDia.filter((p) => p.dataRecebimento === data);
  if (recebidasHoje.length) {
    L.push('PENDÊNCIAS RECEBIDAS HOJE');
    for (const p of recebidasHoje) {
      L.push(`- ${p.descricao} ${formatarBRL(p.valor)}${p.formaPagamento ? ` ${p.formaPagamento}` : ''}`);
      L.push(`  Aberta: ${formatarData(p.dataAbertura)} · Recebida: ${formatarData(p.dataRecebimento)}`);
    }
    L.push('');
  }

  // --- Pendências abertas hoje ---
  const abertasHoje = pendenciasDia.filter((p) => p.dataAbertura === data && p.status === 'aberta');
  if (abertasHoje.length) {
    L.push('PENDÊNCIAS EM ABERTO');
    for (const p of abertasHoje) {
      L.push(`- ${p.descricao} ${formatarBRL(p.valor)}${p.formaPagamento ? ` ${p.formaPagamento}` : ''}`);
      const prev = p.previsaoPagamento ? ` · Previsão: ${formatarData(p.previsaoPagamento)}` : '';
      L.push(`  Aberta: ${formatarData(p.dataAbertura)}${prev}`);
    }
    L.push(SEP);
  } else if (recebidasHoje.length) {
    L.push(SEP);
  }

  // --- Sábado: fechamento semanal de moedas ---
  if (ehSabado(data) && acumulado) {
    L.push('FECHAMENTO SEMANAL - MOEDAS');
    L.push(linha('Moedas caixa 1:', form.moedasCaixa1));
    L.push(linha('Moedas caixa 2:', form.moedasCaixa2));
    L.push(linha('Total no caixa:', acumulado.totalMoedas));
    // No primeiro sábado o valor anterior é a base que já havia (não um sábado real).
    L.push(linha(primeiroSabado ? 'Base inicial:' : 'Sábado anterior:', acumulado.moedasSemanaAnterior, true));
    L.push(linha('Moedas da semana:', acumulado.moedasDaSemana));
    L.push(linha('Dif. acumulada:', acumulado.acumulado));
    const saldo = acumulado.saldoNaoExplicado;
    L.push(`${linha('Saldo não explic.:', saldo)}${acumulado.dentroLimite ? '' : ' (atencao)'}`);
    L.push(SEP);
  }

  // --- Observações + rodapé ---
  L.push('OBSERVAÇÕES');
  L.push(form.observacoes?.trim() || 'Sem observações.');
  L.push(SUB);
  if (operador) L.push(`Operador: ${operador}`);
  L.push(`Fechamento: ${formatarData(data)} ${horaAgora()}`);
  L.push(SEP);

  return L.join('\n');
}

function horaAgora() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
