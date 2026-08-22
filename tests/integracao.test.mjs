// Teste de integração — sobe um servidor com banco temporário, popula ~470
// lançamentos (215 dias de fechamento, pendências, a prazo, despesas e
// repasses do iFood) e confere tudo que o sistema calcula e grava.
//
//   npm run test:integracao
//
// ORÁCULO INDEPENDENTE: toda a matemática esperada é reimplementada aqui do
// zero, a partir da especificação, SEM importar calculos.js — assim um bug que
// exista lá não consegue se esconder num teste que usa a mesma fórmula.
//
// Tudo em CENTAVOS (inteiros) no gerador, pra não ter erro de ponto flutuante
// na referência. Comparações com tolerância de 1 centavo.
//
// Os dados são gerados por um PRNG de seed fixa: mesma rodada, mesmos números,
// então uma falha é sempre reproduzível.

import { spawn } from 'node:child_process';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = process.env.PORTA || 4099;
const BASE = process.env.BASE || `http://localhost:${PORTA}`;

// Sobe o servidor num banco descartável (a menos que BASE aponte pra fora).
let servidor = null;
let dirTemp = null;
if (!process.env.BASE) {
  dirTemp = mkdtempSync(path.join(tmpdir(), 'fechamento-teste-'));
  servidor = spawn(process.execPath, ['server/index.js'], {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(PORTA), DB_PATH: path.join(dirTemp, 'teste.db'), ABRIR_NAVEGADOR: '0' },
    stdio: 'ignore',
  });
  // espera o /api/health responder
  const limite = Date.now() + 30000;
  for (;;) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) break;
    } catch { /* ainda subindo */ }
    if (Date.now() > limite) { console.error('servidor não subiu em 30s'); process.exit(1); }
    await new Promise((r) => setTimeout(r, 250));
  }
}
function encerrar(codigo) {
  if (servidor) servidor.kill();
  if (dirTemp) { try { rmSync(dirTemp, { recursive: true, force: true }); } catch { /* ignora */ } }
  process.exit(codigo);
}

// ---------- infra ----------
let FALHAS = 0, PASSOU = 0;
const falhas = [];
function check(cond, msg) {
  if (cond) { PASSOU++; }
  else { FALHAS++; falhas.push(msg); if (falhas.length <= 30) console.log(`  FALHA: ${msg}`); }
}
function aprox(a, b, msg) {
  check(Math.abs(a - b) < 0.011, `${msg} — esperado ${b}, veio ${a}`);
}
async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* respostas sem corpo */ }
  return { status: res.status, json };
}

// PRNG determinístico (mulberry32) — mesma seed = mesmos dados sempre.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260822);
const ri = (min, max) => Math.floor(rnd() * (max - min + 1)) + min; // int inclusive
const chance = (p) => rnd() < p;
const R$ = (cent) => cent / 100; // centavos -> reais pro payload

// datas
function addDias(iso, d) {
  const x = new Date(`${iso}T12:00:00`);
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
}
const ehDomingo = (iso) => new Date(`${iso}T12:00:00`).getDay() === 0;

// ---------- geração dos dias ----------
const DIAS = [];
{
  let d = '2026-01-05';
  while (DIAS.length < 215) {
    if (!ehDomingo(d)) DIAS.push(d);
    d = addDias(d, 1);
  }
}
const PRIMEIRO_DIA = DIAS[0];
const ULTIMO_DIA = DIAS[DIAS.length - 1];

const ABERTURA1 = 20000, ABERTURA2 = 10000;   // 200,00 / 100,00 (fundo de troco)
const DESEJADO1 = 20000, DESEJADO2 = 10000;
const LIMITE_MOEDA = 1000;                     // R$ 10,00

// planos por dia (tudo em centavos)
const plano = new Map(); // data -> objeto do dia
for (const data of DIAS) {
  plano.set(data, {
    data,
    mvCredito: ri(150000, 900000) + ri(0, 99),
    mvDebito: ri(80000, 500000) + ri(0, 99),
    mvVoucher: chance(0.3) ? ri(5000, 60000) + ri(0, 99) : 0,
    mvPix: ri(100000, 700000) + ri(0, 99),
    mvDinheiro: ri(300000, 1200000) + ri(0, 99),
    mvAPrazo: chance(0.15) ? ri(5000, 80000) + ri(0, 99) : 0,
    mvIfood: chance(0.8) ? ri(20000, 150000) + ri(0, 99) : 0,
    numeroVendas: ri(40, 220),
    suprimento1: chance(0.15) ? ri(5000, 30000) : 0,
    sangrias: [],            // [{caixa, valor, descricao}]
    ajusteCartaoSigned: 0,   // manual, com sinal
    ajusteDinheiroSigned: 0, // manual, com sinal
    abertasHoje: 0,          // pendências abertas neste dia (soma)
    recCartaoHoje: 0,        // pendências recebidas hoje em cartão
    recDinheiroHoje: 0,      // pendências recebidas hoje em dinheiro
    aPrazoCartaoHoje: 0,     // a prazo recebido hoje em cartão
    aPrazoDinheiroHoje: 0,   // a prazo recebido hoje em dinheiro
    discrepCartao: 0,        // furo real injetado (esperado na diferença)
    discrepDinheiro: 0,
  });
}

// sangrias e ajustes manuais
for (const p of plano.values()) {
  if (chance(0.25)) p.sangrias.push({ caixa: 1, valor: ri(3000, 40000), descricao: 'pagamento entregador' });
  if (chance(0.10)) p.sangrias.push({ caixa: 2, valor: ri(2000, 15000), descricao: 'compra emergencial' });
  if (chance(0.08)) p.ajusteCartaoSigned = -(ri(5000, 40000));  // convênio pagou fiado via cartão (subtrai)
  if (chance(0.04)) p.ajusteCartaoSigned += ri(2000, 10000);    // evento que soma
  if (chance(0.06)) p.ajusteDinheiroSigned = -(ri(2000, 20000));
  // furos reais (o que o sistema existe pra apontar)
  if (chance(0.15)) p.discrepCartao = (chance(0.5) ? 1 : -1) * ri(500, 15000);
  if (chance(0.20)) p.discrepDinheiro = (chance(0.5) ? 1 : -1) * ri(100, 8000); // às vezes < limite (provável moeda)
}

// pendências: abertas ao longo do período, parte recebida depois
const pendencias = []; // {descricao, valorCent, dataAbertura, receber?: {data, forma}}
for (let i = 0; i < DIAS.length; i++) {
  if (!chance(0.35)) continue;
  const dataAbertura = DIAS[i];
  const valor = ri(2000, 60000);
  const pend = { descricao: `Pend ${i}-${pendencias.length}`, valorCent: valor, dataAbertura };
  if (chance(0.75)) {
    // recebe 0 (mesmo dia) a 12 dias úteis depois — mas só dentro do período
    const offset = chance(0.1) ? 0 : ri(1, 12);
    const idxRec = Math.min(i + offset, DIAS.length - 1);
    pend.receber = { data: DIAS[idxRec], forma: chance(0.6) ? 'cartao_pix' : 'dinheiro' };
  }
  pendencias.push(pend);
  plano.get(dataAbertura).abertasHoje += valor;
  if (pend.receber) {
    const alvo = plano.get(pend.receber.data);
    if (pend.receber.forma === 'cartao_pix') alvo.recCartaoHoje += valor;
    else alvo.recDinheiroHoje += valor;
  }
}

// a prazo recebimentos
const aPrazoRecs = [];
for (let i = 0; i < DIAS.length; i++) {
  if (!chance(0.18)) continue;
  const data = DIAS[i];
  const valor = ri(3000, 50000);
  const forma = chance(0.5) ? 'cartao_pix' : 'dinheiro';
  aPrazoRecs.push({ data, valorCent: valor, forma, descricao: `Cliente AP-${i}` });
  const alvo = plano.get(data);
  if (forma === 'cartao_pix') alvo.aPrazoCartaoHoje += valor;
  else alvo.aPrazoDinheiroHoje += valor;
}

// deriva os valores físicos de cada dia (maquininhas e fechamento contado)
for (const p of plano.values()) {
  p.mvCartaoTotal = p.mvCredito + p.mvDebito + p.mvVoucher + p.mvPix;
  // máquina = microvix − abertas + recebidasCartao + aPrazoCartao − ajusteManual + furo
  p.maqTotal = p.mvCartaoTotal - p.abertasHoje + p.recCartaoHoje + p.aPrazoCartaoHoje
    - p.ajusteCartaoSigned + p.discrepCartao;
  // reparte em 4 máquinas + pix direto (soma tem que bater exata)
  const partes = [0.34, 0.27, 0.18, 0.13];
  let resto = p.maqTotal;
  p.maq = [];
  for (const f of partes) {
    const cartao = Math.floor(p.maqTotal * f * 0.7);
    const pix = Math.floor(p.maqTotal * f * 0.3);
    p.maq.push({ cartao, pix });
    resto -= cartao + pix;
  }
  p.pixChaveDireta = resto; // o que sobrou fecha a soma exata
  // dinheiro
  p.sangriaTotal = p.sangrias.reduce((s, x) => s + x.valor, 0);
  p.sangria1 = p.sangrias.filter((s) => s.caixa === 1).reduce((s, x) => s + x.valor, 0);
  p.sangria2 = p.sangrias.filter((s) => s.caixa === 2).reduce((s, x) => s + x.valor, 0);
  const fechTotal = ABERTURA1 + ABERTURA2 + p.suprimento1 - p.sangriaTotal + p.mvDinheiro
    + p.recDinheiroHoje + p.aPrazoDinheiroHoje - p.ajusteDinheiroSigned + p.discrepDinheiro;
  // reparte nos 2 caixas (caixa 2 fica com uma fatia fixa pequena)
  p.fech2 = Math.min(ABERTURA2 + 50000, Math.max(0, Math.floor(fechTotal * 0.2)));
  p.fech1 = fechTotal - p.fech2;
  // ORÁCULO
  p.espDifCartao = p.discrepCartao;
  p.espDifDinheiro = p.discrepDinheiro;
  p.espEsperado = ABERTURA1 + ABERTURA2 + p.suprimento1 - p.sangriaTotal + p.mvDinheiro;
  p.espContadoAjust = p.espEsperado + p.discrepDinheiro;
  p.espReceita = p.maqTotal + (fechTotal - ABERTURA1 - ABERTURA2 - p.suprimento1 + p.sangriaTotal);
  p.espFaturamento = p.mvCartaoTotal + p.mvDinheiro + p.mvAPrazo + p.mvIfood;
  p.espRetirar1 = p.fech1 - DESEJADO1;
  p.espRetirar2 = p.fech2 - DESEJADO2;
}

// despesas (5 categorias, 4 fornecedores, ~120 lançamentos)
const CATS = [
  { nome: 'Fornecedores', ehFornecedor: true },
  { nome: 'Aluguel', ehFornecedor: false },
  { nome: 'Energia e água', ehFornecedor: false },
  { nome: 'Salários', ehFornecedor: false },
  { nome: 'Manutenção', ehFornecedor: false },
];
const FORNS = ['Distribuidora ABC', 'Hortifruti São José', 'Laticínios Boa Vista', 'Bebidas Central'];
const despesasPlan = [];
for (let i = 0; i < DIAS.length; i++) {
  if (!chance(0.55)) continue;
  const catIdx = ri(0, CATS.length - 1);
  despesasPlan.push({
    data: DIAS[i],
    catIdx,
    fornIdx: CATS[catIdx].ehFornecedor ? ri(0, FORNS.length - 1) : null,
    valorCent: ri(5000, 500000) + ri(0, 99),
    descricao: `Despesa ${i}`,
  });
}

// repasses iFood: períodos de ~12 dias úteis, repasse 2 dias depois do fim,
// líquido = 88% do bruto vendido. Último período fica sem repasse (pendente).
const repassesPlan = [];
{
  const chunk = 12;
  for (let i = 0; i + chunk < DIAS.length - chunk; i += chunk) {
    const ini = DIAS[i], fim = DIAS[i + chunk - 1];
    const bruto = DIAS.slice(i, i + chunk).reduce((s, d) => s + plano.get(d).mvIfood, 0);
    if (!bruto) continue;
    const dataRepasse = addDias(fim, 2);
    if (dataRepasse > ULTIMO_DIA) break;
    repassesPlan.push({
      dataRepasse, periodoInicio: ini, periodoFim: fim,
      valorCent: Math.round(bruto * 0.88), brutoCent: bruto,
    });
  }
}

// ---------- seed ----------
console.log('SEED');
console.log(`  ${DIAS.length} fechamentos, ${pendencias.length} pendências, ${aPrazoRecs.length} a prazo,`);
console.log(`  ${despesasPlan.length} despesas, ${repassesPlan.length} repasses iFood`);
console.log(`  total de lançamentos: ${DIAS.length + pendencias.length + aPrazoRecs.length + despesasPlan.length + repassesPlan.length}`);

await api('POST', '/api/usuarios', { nome: 'Teste', senha: '123456' });
await api('PUT', '/api/configuracoes', { limiteDiferencaMoeda: R$(LIMITE_MOEDA) });

// categorias e fornecedores
const catIds = [], fornIds = [];
for (const c of CATS) {
  const r = await api('POST', '/api/despesas/categorias', c);
  catIds.push(r.json.id);
}
for (const f of FORNS) {
  const r = await api('POST', '/api/despesas/fornecedores', { nome: f });
  fornIds.push(r.json.id);
}

// pendências (abrir + receber) — antes dos fechamentos, pro cálculo gravado ver tudo
for (const p of pendencias) {
  const r = await api('POST', '/api/pendencias', {
    descricao: p.descricao, valor: R$(p.valorCent), dataAbertura: p.dataAbertura,
  });
  check(r.status === 201, `abrir pendência ${p.descricao}: status ${r.status}`);
  p.id = r.json.id;
  if (p.receber) {
    const r2 = await api('POST', `/api/pendencias/${p.id}/receber`, {
      dataRecebimento: p.receber.data, formaRecebimento: p.receber.forma,
    });
    check(r2.status === 200, `receber pendência ${p.descricao}: status ${r2.status}`);
  }
}

// a prazo
for (const a of aPrazoRecs) {
  const r = await api('POST', '/api/a-prazo', {
    data: a.data, valor: R$(a.valorCent), formaRecebimento: a.forma, descricao: a.descricao,
  });
  check(r.status === 201, `a prazo ${a.descricao}: status ${r.status}`);
}

// fechamentos
function payloadFechamento(p) {
  return {
    data: p.data, usuario: 'Teste', numeroVendas: p.numeroVendas,
    microvixCredito: R$(p.mvCredito), microvixDebito: R$(p.mvDebito),
    microvixVoucher: R$(p.mvVoucher), microvixPix: R$(p.mvPix),
    microvixDinheiro: R$(p.mvDinheiro), microvixAPrazo: R$(p.mvAPrazo), microvixIfood: R$(p.mvIfood),
    maq1Cartao: R$(p.maq[0].cartao), maq1Pix: R$(p.maq[0].pix),
    maq2Cartao: R$(p.maq[1].cartao), maq2Pix: R$(p.maq[1].pix),
    maq3Cartao: R$(p.maq[2].cartao), maq3Pix: R$(p.maq[2].pix),
    maq4Cartao: R$(p.maq[3].cartao), maq4Pix: R$(p.maq[3].pix),
    pixChaveDireta: R$(p.pixChaveDireta),
    aberturaCaixa1: R$(ABERTURA1), aberturaCaixa2: R$(ABERTURA2),
    suprimentoCaixa1: R$(p.suprimento1), suprimentoCaixa2: 0,
    fechamentoCaixa1: R$(p.fech1), fechamentoCaixa2: R$(p.fech2),
    desejadoCaixa1: R$(DESEJADO1), desejadoCaixa2: R$(DESEJADO2),
    sangrias: p.sangrias.map((s) => ({ caixa: s.caixa, descricao: s.descricao, valor: R$(s.valor) })),
    ajustesCartao: p.ajusteCartaoSigned === 0 ? [] : [{
      tipo: p.ajusteCartaoSigned > 0 ? 'soma' : 'subtrai',
      descricao: 'ajuste teste', valor: R$(Math.abs(p.ajusteCartaoSigned)),
    }],
    ajustesDinheiro: p.ajusteDinheiroSigned === 0 ? [] : [{
      tipo: p.ajusteDinheiroSigned > 0 ? 'soma' : 'subtrai',
      descricao: 'ajuste teste', valor: R$(Math.abs(p.ajusteDinheiroSigned)),
    }],
    status: 'fechado',
  };
}
let salvos = 0;
for (const data of DIAS) {
  const r = await api('POST', '/api/fechamentos', payloadFechamento(plano.get(data)));
  check(r.status === 200, `salvar fechamento ${data}: status ${r.status}`);
  if (r.status === 200) salvos++;
}
console.log(`  fechamentos salvos: ${salvos}/${DIAS.length}`);

// despesas
for (const d of despesasPlan) {
  const r = await api('POST', '/api/despesas', {
    data: d.data, categoriaId: catIds[d.catIdx],
    fornecedorId: d.fornIdx === null ? null : fornIds[d.fornIdx],
    descricao: d.descricao, valor: R$(d.valorCent),
  });
  check(r.status === 201, `despesa ${d.descricao}: status ${r.status}`);
}

// repasses
for (const rp of repassesPlan) {
  const r = await api('POST', '/api/ifood', {
    dataRepasse: rp.dataRepasse, periodoInicio: rp.periodoInicio, periodoFim: rp.periodoFim,
    valorRecebido: R$(rp.valorCent), observacoes: 'repasse gerado',
  });
  check(r.status === 201, `repasse ${rp.dataRepasse}: status ${r.status}`);
}

// ---------- VERIFICAÇÃO 1: cada dia gravado vs oráculo ----------
console.log('\nVERIFICAÇÃO 1 — valores gravados de cada dia vs oráculo independente');
const lista = (await api('GET', '/api/fechamentos')).json;
check(lista.length === DIAS.length, `quantidade de fechamentos: ${lista.length} != ${DIAS.length}`);
const porData = new Map(lista.map((f) => [f.data, f]));
for (const data of DIAS) {
  const f = porData.get(data);
  const p = plano.get(data);
  if (!f) { check(false, `fechamento ${data} sumiu da lista`); continue; }
  aprox(f.totalMicrovixCartaoPix, R$(p.mvCartaoTotal), `${data} totalMicrovixCartaoPix`);
  aprox(f.totalRealMaquininhas, R$(p.maqTotal), `${data} totalRealMaquininhas`);
  aprox(f.dinheiroEsperado, R$(p.espEsperado), `${data} dinheiroEsperado`);
  aprox(f.dinheiroContadoAjustado, R$(p.espContadoAjust), `${data} dinheiroContadoAjustado`);
  aprox(f.diferencaCartaoPix, R$(p.espDifCartao), `${data} diferencaCartaoPix`);
  aprox(f.diferencaDinheiro, R$(p.espDifDinheiro), `${data} diferencaDinheiro`);
  aprox(f.retirarCaixa1, R$(p.espRetirar1), `${data} retirarCaixa1`);
  aprox(f.retirarCaixa2, R$(p.espRetirar2), `${data} retirarCaixa2`);
  aprox(f.sangriaCaixa1, R$(p.sangria1), `${data} sangriaCaixa1`);
  aprox(f.sangriaCaixa2, R$(p.sangria2), `${data} sangriaCaixa2`);
}

// GET por data = mesmo conteúdo da lista (amostra de 10 dias)
for (let i = 0; i < 10; i++) {
  const data = DIAS[ri(0, DIAS.length - 1)];
  const r = await api('GET', `/api/fechamentos/${data}`);
  check(r.status === 200, `GET /:data ${data}: status ${r.status}`);
  const daLista = porData.get(data);
  check(JSON.stringify(r.json) === JSON.stringify(daLista), `GET /:data ${data} difere da lista`);
}

// ---------- VERIFICAÇÃO 2: idempotência (re-salvar tudo, nada muda) ----------
console.log('VERIFICAÇÃO 2 — re-salvar os 215 dias (upsert) não muda nenhum valor');
for (const data of DIAS) {
  await api('POST', '/api/fechamentos', payloadFechamento(plano.get(data)));
}
const lista2 = (await api('GET', '/api/fechamentos')).json;
check(lista2.length === DIAS.length, `re-save duplicou linhas: ${lista2.length}`);
for (const f2 of lista2) {
  const p = plano.get(f2.data);
  aprox(f2.diferencaCartaoPix, R$(p.espDifCartao), `re-save ${f2.data} diferencaCartaoPix mudou`);
  aprox(f2.diferencaDinheiro, R$(p.espDifDinheiro), `re-save ${f2.data} diferencaDinheiro mudou`);
}

// ---------- VERIFICAÇÃO 3: agregados (o que Painel e DRE calculam) ----------
console.log('VERIFICAÇÃO 3 — agregados do período inteiro');
const espFatTotal = DIAS.reduce((s, d) => s + plano.get(d).espFaturamento, 0);
const espReceitaCaixa = DIAS.reduce((s, d) => s + plano.get(d).espReceita, 0);
const espIfoodRecebido = repassesPlan
  .filter((r) => r.dataRepasse >= PRIMEIRO_DIA && r.dataRepasse <= ULTIMO_DIA)
  .reduce((s, r) => s + r.valorCent, 0);
const espDespesas = despesasPlan.reduce((s, d) => s + d.valorCent, 0);
const espDifCaixaTotal = DIAS.reduce((s, d) => s + plano.get(d).espDifCartao + plano.get(d).espDifDinheiro, 0);

const desp = (await api('GET', `/api/despesas?inicio=${PRIMEIRO_DIA}&fim=${ULTIMO_DIA}`)).json;
aprox(desp.reduce((s, d) => s + d.valor, 0), R$(espDespesas), 'soma das despesas via API');
check(desp.length === despesasPlan.length, `qtde despesas: ${desp.length} != ${despesasPlan.length}`);

const reps = (await api('GET', `/api/ifood?inicio=${PRIMEIRO_DIA}&fim=${ULTIMO_DIA}`)).json;
aprox(reps.reduce((s, r) => s + r.valorRecebido, 0), R$(espIfoodRecebido), 'soma dos repasses via API');

console.log(`  Faturamento esperado : R$ ${R$(espFatTotal).toFixed(2)}`);
console.log(`  Receita esperada     : R$ ${R$(espReceitaCaixa + espIfoodRecebido).toFixed(2)}  (caixa ${R$(espReceitaCaixa).toFixed(2)} + iFood ${R$(espIfoodRecebido).toFixed(2)})`);
console.log(`  Despesas esperadas   : R$ ${R$(espDespesas).toFixed(2)}`);
console.log(`  Resultado esperado   : R$ ${R$(espReceitaCaixa + espIfoodRecebido - espDespesas).toFixed(2)}`);
console.log(`  Dif. caixa esperada  : R$ ${R$(espDifCaixaTotal).toFixed(2)}`);

console.log(`  (confira no Painel/DRE com o filtro "Tudo", período ${PRIMEIRO_DIA} a ${ULTIMO_DIA})`);

// ---------- VERIFICAÇÃO 4: contratos da API (erros e ciclos) ----------
console.log('VERIFICAÇÃO 4 — contratos da API (validações, 404, 409, ciclos)');
{
  let r = await api('POST', '/api/fechamentos', { usuario: 'Teste' });
  check(r.status === 400, `fechamento sem data deveria dar 400, deu ${r.status}`);

  r = await api('POST', '/api/pendencias', { valor: 10, dataAbertura: '2027-01-05' });
  check(r.status === 400, `pendência sem descrição deveria dar 400, deu ${r.status}`);
  r = await api('POST', '/api/pendencias', { descricao: 'x', valor: 10 });
  check(r.status === 400, `pendência sem dataAbertura deveria dar 400, deu ${r.status}`);

  // ciclo completo: abrir -> receber (forma inválida 400) -> receber -> receber de novo 409 -> estornar -> receber -> excluir
  r = await api('POST', '/api/pendencias', { descricao: 'ciclo', valor: 50, dataAbertura: '2027-01-05' });
  const pid = r.json.id;
  r = await api('POST', `/api/pendencias/${pid}/receber`, { dataRecebimento: '2027-01-06', formaRecebimento: 'cheque' });
  check(r.status === 400, `forma inválida deveria dar 400, deu ${r.status}`);
  r = await api('POST', `/api/pendencias/${pid}/receber`, { dataRecebimento: '2027-01-06', formaRecebimento: 'dinheiro' });
  check(r.status === 200 && r.json.status === 'recebida' && r.json.formaRecebimento === 'dinheiro', 'receber pendência ciclo');
  r = await api('POST', `/api/pendencias/${pid}/receber`, { dataRecebimento: '2027-01-07', formaRecebimento: 'cartao_pix' });
  check(r.status === 409, `receber 2x deveria dar 409, deu ${r.status}`);
  r = await api('POST', `/api/pendencias/${pid}/estornar`);
  check(r.status === 200 && r.json.status === 'aberta' && r.json.formaRecebimento === null && r.json.dataRecebimento === null,
    'estornar limpa recebimento');
  r = await api('DELETE', `/api/pendencias/${pid}`);
  check(r.status === 200, 'excluir pendência ciclo');
  r = await api('DELETE', `/api/pendencias/${pid}`);
  check(r.status === 404, `excluir 2x deveria dar 404, deu ${r.status}`);
  r = await api('POST', '/api/pendencias/999999/receber', { dataRecebimento: '2027-01-06', formaRecebimento: 'dinheiro' });
  check(r.status === 404, `receber inexistente deveria dar 404, deu ${r.status}`);

  // a prazo: validações
  r = await api('POST', '/api/a-prazo', { valor: 10, formaRecebimento: 'dinheiro' });
  check(r.status === 400, `a prazo sem data deveria dar 400, deu ${r.status}`);
  r = await api('POST', '/api/a-prazo', { data: '2027-01-05', valor: 10, formaRecebimento: 'cheque' });
  check(r.status === 400, `a prazo forma inválida deveria dar 400, deu ${r.status}`);
  r = await api('POST', '/api/a-prazo', { data: '2027-01-05', formaRecebimento: 'dinheiro' });
  check(r.status === 400, `a prazo sem valor deveria dar 400, deu ${r.status}`);
  r = await api('DELETE', '/api/a-prazo/999999');
  check(r.status === 404, `a prazo delete inexistente deveria dar 404, deu ${r.status}`);

  // despesas: categoria duplicada, em uso, fornecedor exigido
  r = await api('POST', '/api/despesas/categorias', { nome: 'Aluguel' });
  check(r.status === 409, `categoria duplicada deveria dar 409, deu ${r.status}`);
  r = await api('DELETE', `/api/despesas/categorias/${catIds[0]}`);
  check(r.status === 409, `excluir categoria em uso deveria dar 409, deu ${r.status}`);
  r = await api('DELETE', `/api/despesas/fornecedores/${fornIds[0]}`);
  check(r.status === 409, `excluir fornecedor em uso deveria dar 409, deu ${r.status}`);
  r = await api('POST', '/api/despesas', { data: '2027-01-05', categoriaId: catIds[0], valor: 10 });
  check(r.status === 400, `despesa em categoria com fornecedor exigido, sem fornecedor: 400, deu ${r.status}`);
  r = await api('POST', '/api/despesas', { data: '2027-01-05', categoriaId: 999999, valor: 10 });
  check(r.status === 400, `despesa com categoria inexistente deveria dar 400, deu ${r.status}`);

  // despesa: criar -> editar -> excluir
  r = await api('POST', '/api/despesas', { data: '2027-01-05', categoriaId: catIds[1], valor: 123.45, descricao: 'tmp' });
  const did = r.json.id;
  check(r.status === 201 && Math.abs(r.json.valor - 123.45) < 0.001, 'despesa com centavos preserva valor');
  r = await api('PUT', `/api/despesas/${did}`, { valor: 200.10 });
  check(r.status === 200 && Math.abs(r.json.valor - 200.10) < 0.001, 'editar só o valor mantém o resto');
  check(r.json.data === '2027-01-05' && r.json.categoriaId === catIds[1], 'PUT parcial não apaga campos');
  r = await api('DELETE', `/api/despesas/${did}`);
  check(r.status === 200, 'excluir despesa tmp');

  // ifood: validações + ciclo
  r = await api('POST', '/api/ifood', { dataRepasse: '2027-01-05', periodoInicio: '2027-01-10', periodoFim: '2027-01-05', valorRecebido: 10 });
  check(r.status === 400, `período invertido deveria dar 400, deu ${r.status}`);
  r = await api('POST', '/api/ifood', { dataRepasse: '2027-01-05', periodoInicio: '2027-01-01', periodoFim: '2027-01-04' });
  check(r.status === 400, `repasse sem valor deveria dar 400, deu ${r.status}`);
  r = await api('POST', '/api/ifood', { dataRepasse: '2027-01-05', periodoInicio: '2027-01-01', periodoFim: '2027-01-04', valorRecebido: 99.99 });
  const rid = r.json.id;
  check(r.status === 201, 'criar repasse tmp');
  r = await api('PUT', `/api/ifood/${rid}`, { dataRepasse: '2027-01-06', periodoInicio: '2027-01-01', periodoFim: '2027-01-04', valorRecebido: 88.88 });
  check(r.status === 200 && Math.abs(r.json.valorRecebido - 88.88) < 0.001, 'editar repasse');
  r = await api('DELETE', `/api/ifood/${rid}`);
  check(r.status === 200, 'excluir repasse tmp');
  r = await api('DELETE', `/api/ifood/${rid}`);
  check(r.status === 404, `excluir repasse 2x deveria dar 404, deu ${r.status}`);

  // filtro de período das despesas: só o intervalo pedido
  const soJan = (await api('GET', '/api/despesas?inicio=2026-01-01&fim=2026-01-31')).json;
  check(soJan.every((d) => d.data >= '2026-01-01' && d.data <= '2026-01-31'), 'filtro de período das despesas vaza datas');
  const espJan = despesasPlan.filter((d) => d.data <= '2026-01-31');
  check(soJan.length === espJan.length, `despesas de janeiro: ${soJan.length} != ${espJan.length}`);
  aprox(soJan.reduce((s, d) => s + d.valor, 0), R$(espJan.reduce((s, d) => s + d.valorCent, 0)), 'soma despesas janeiro');

  // filtro de período do ifood
  const repJan = (await api('GET', '/api/ifood?inicio=2026-01-01&fim=2026-01-31')).json;
  check(repJan.every((x) => x.dataRepasse >= '2026-01-01' && x.dataRepasse <= '2026-01-31'), 'filtro ifood vaza datas');

  // fechamento inexistente
  r = await api('GET', '/api/fechamentos/1999-01-01');
  check(r.status === 404, `fechamento inexistente deveria dar 404, deu ${r.status}`);
}

// ---------- VERIFICAÇÃO 5: log de edições em dia fechado ----------
console.log('VERIFICAÇÃO 5 — editar dia FECHADO gera log; recálculo reflete pendência nova');
{
  const dia = DIAS[50];
  const p = plano.get(dia);
  // edita um valor num dia já fechado
  const payload = payloadFechamento(p);
  payload.microvixCredito = R$(p.mvCredito + 10000); // +R$100
  let r = await api('POST', '/api/fechamentos', payload);
  check(r.status === 200, 'editar dia fechado');
  const log = (await api('GET', `/api/fechamentos/${dia}/log`)).json;
  check(log.length >= 1 && log.some((l) => l.campo === 'Microvix crédito'), 'log registrou a edição do crédito');
  // a diferença de cartão tem que ter caído R$100 (microvix subiu, máquina não)
  const f = (await api('GET', `/api/fechamentos/${dia}`)).json;
  aprox(f.diferencaCartaoPix, R$(p.espDifCartao - 10000), 'recálculo após edição (dif caiu R$100)');
  // desfaz pra não sujar os agregados
  r = await api('POST', '/api/fechamentos', payloadFechamento(p));
  check(r.status === 200, 'desfazer edição');
  const f2 = (await api('GET', `/api/fechamentos/${dia}`)).json;
  aprox(f2.diferencaCartaoPix, R$(p.espDifCartao), 'valores voltaram ao original');

  // pendência criada DEPOIS do fechamento salvo: re-salvar precisa recalcular
  const dia2 = DIAS[60];
  const p2 = plano.get(dia2);
  r = await api('POST', '/api/pendencias', { descricao: 'pós-save', valor: 77, dataAbertura: dia2 });
  const pid = r.json.id;
  await api('POST', '/api/fechamentos', payloadFechamento(p2)); // re-salva
  const f3 = (await api('GET', `/api/fechamentos/${dia2}`)).json;
  aprox(f3.diferencaCartaoPix, R$(p2.espDifCartao) + 77, 'pendência nova entra no recálculo (soma no real)');
  await api('DELETE', `/api/pendencias/${pid}`);
  await api('POST', '/api/fechamentos', payloadFechamento(p2)); // restaura
  const f4 = (await api('GET', `/api/fechamentos/${dia2}`)).json;
  aprox(f4.diferencaCartaoPix, R$(p2.espDifCartao), 'restaurado após excluir pendência');
}

// ---------- resultado ----------
console.log('\n' + '='.repeat(70));
console.log(`RESULTADO: ${PASSOU} checagens OK, ${FALHAS} falhas`);
if (FALHAS) {
  console.log('Primeiras falhas:');
  for (const f of falhas.slice(0, 30)) console.log(`  - ${f}`);
  encerrar(1);
}
console.log('TUDO PASSOU');
encerrar(0);
