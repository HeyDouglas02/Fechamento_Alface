// Fechamento — tela principal. Formulário do fechamento do dia com as seções
// Microvix, Maquininhas, Dinheiro, Pendências e Observações, mostrando as duas
// conferências (dinheiro e cartão/pix) em tempo real a partir de calculos.js.
//
// No SÁBADO aparece também a seção de moedas e o fechamento semanal: a diferença
// de dinheiro de seg–sáb é acumulada e as moedas contadas explicam a falta.

import { useEffect, useMemo, useState } from 'react';
import CampoValor from '../components/CampoValor';
import Conferencia from '../components/Conferencia';
import RelatorioImpressao from '../components/RelatorioImpressao';
import { conferenciaDinheiro, conferenciaCartaoPix, acumuladoSemanal } from '../utils/calculos';
import { montarRelatorio } from '../utils/relatorio';
import { formatarData, formatarBRL, hojeISO } from '../utils/formatacao';
import './Fechamento.css';

// É sábado? (fechamento semanal de moedas)
function ehSabado(dataISO) {
  return new Date(`${dataISO}T12:00:00`).getDay() === 6;
}

// Segunda e sábado (ISO) da semana que contém a data informada.
function semanaDe(dataISO) {
  const d = new Date(`${dataISO}T12:00:00`);
  const dow = d.getDay(); // 0=dom .. 6=sáb
  const offsetSegunda = dow === 0 ? -6 : 1 - dow;
  const segunda = new Date(d);
  segunda.setDate(d.getDate() + offsetSegunda);
  const sabado = new Date(segunda);
  sabado.setDate(segunda.getDate() + 5);
  const iso = (x) => x.toLocaleDateString('en-CA');
  return { segunda: iso(segunda), sabado: iso(sabado) };
}

// Formulário em branco para abrir uma nova pendência.
const PENDENCIA_VAZIA = { descricao: '', valor: 0, formaPagamento: '', previsaoPagamento: '' };

// Estado inicial do formulário (todos os valores zerados).
function estadoInicial(data) {
  return {
    data,
    observacoes: '',
    numeroVendas: 0,
    microvixCredito: 0, microvixDebito: 0, microvixVoucher: 0, microvixPix: 0,
    microvixDinheiro: 0, microvixAPrazo: 0, microvixIfood: 0,
    maq1Cartao: 0, maq1Pix: 0, maq2Cartao: 0, maq2Pix: 0,
    maq3Cartao: 0, maq3Pix: 0, maq4Cartao: 0, maq4Pix: 0,
    pixChaveDireta: 0,
    cedulasCaixa1: 0, cedulasCaixa2: 0,
    moedasCaixa1: 0, moedasCaixa2: 0,
    fundoFixoCaixa1Usado: 0, fundoFixoCaixa2Usado: 0,
  };
}

// Campos que vêm da API (camelCase) e preenchem o formulário ao carregar um dia.
const CAMPOS_FORM = [
  'observacoes',
  'numeroVendas',
  'microvixCredito', 'microvixDebito', 'microvixVoucher', 'microvixPix',
  'microvixDinheiro', 'microvixAPrazo', 'microvixIfood',
  'maq1Cartao', 'maq1Pix', 'maq2Cartao', 'maq2Pix',
  'maq3Cartao', 'maq3Pix', 'maq4Cartao', 'maq4Pix',
  'pixChaveDireta', 'cedulasCaixa1', 'cedulasCaixa2',
  'moedasCaixa1', 'moedasCaixa2',
  'fundoFixoCaixa1Usado', 'fundoFixoCaixa2Usado',
];

export default function Fechamento({ alvoData = null, alvoToken = 0, usuario = null }) {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState(() => estadoInicial(alvoData || hojeISO()));
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  // Pendências: as do dia (abertas neste dia ou recebidas neste dia) e todas as
  // abertas (de qualquer dia) que podem ser recebidas hoje.
  const [pendenciasDia, setPendenciasDia] = useState([]);
  const [pendenciasAbertas, setPendenciasAbertas] = useState([]);
  const [novaPendencia, setNovaPendencia] = useState(PENDENCIA_VAZIA);

  // Texto do relatório para impressão (null = sem pré-visualização aberta).
  const [relatorio, setRelatorio] = useState(null);

  // Fechamentos da semana (seg–sáb) — usados no acumulado de moedas do sábado.
  const [fechamentosSemana, setFechamentosSemana] = useState([]);
  // Total de moedas no caixa registrado no sábado anterior (as moedas não são
  // retiradas; o que conta é o crescimento do estoque desde então).
  const [moedasSemanaAnterior, setMoedasSemanaAnterior] = useState(0);

  const sabado = ehSabado(form.data);

  // Carrega as configurações uma vez (nomes das máquinas, fundo fixo, limite).
  useEffect(() => {
    fetch('/api/configuracoes')
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setMensagem('Não foi possível carregar as configurações.'));
  }, []);

  // Sempre que muda a data (ou as configurações chegam), carrega o fechamento
  // daquele dia, se existir; senão, reseta com o fundo fixo atual da config.
  useEffect(() => {
    if (!config) return;
    let cancelado = false;
    fetch(`/api/fechamentos/${form.data}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((fech) => {
        if (cancelado) return;
        if (fech) {
          const carregado = { data: fech.data };
          for (const k of CAMPOS_FORM) carregado[k] = fech[k] ?? 0;
          carregado.observacoes = fech.observacoes ?? '';
          setForm(carregado);
          setMensagem(`Fechamento de ${formatarData(fech.data)} carregado (${fech.status}).`);
        } else {
          setForm((f) => ({
            ...estadoInicial(f.data),
            fundoFixoCaixa1Usado: config.fundoFixoCaixa1,
            fundoFixoCaixa2Usado: config.fundoFixoCaixa2,
          }));
          setMensagem('');
        }
      });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.data, config]);

  // Carrega as pendências do dia e a lista de abertas (recarregada após cada
  // abertura/recebimento para refletir na conferência em tempo real).
  function carregarPendencias() {
    fetch(`/api/pendencias?data=${form.data}`)
      .then((r) => r.json())
      .then(setPendenciasDia)
      .catch(() => setPendenciasDia([]));
    fetch('/api/pendencias/abertas')
      .then((r) => r.json())
      .then(setPendenciasAbertas)
      .catch(() => setPendenciasAbertas([]));
  }

  useEffect(() => {
    carregarPendencias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.data]);

  // No sábado, busca os fechamentos da semana (seg–sex) para acumular a
  // diferença de dinheiro, e o total de moedas do sábado anterior (o estoque de
  // moedas não é zerado entre semanas). O sábado atual entra ao vivo.
  useEffect(() => {
    if (!sabado) { setFechamentosSemana([]); setMoedasSemanaAnterior(0); return; }
    const { segunda, sabado: sab } = semanaDe(form.data);
    fetch('/api/fechamentos')
      .then((r) => r.json())
      .then((lista) => {
        setFechamentosSemana(
          lista.filter((f) => f.data >= segunda && f.data <= sab && f.data !== form.data)
        );
        // Sábado anterior = fechamento de sábado mais recente antes deste dia.
        const sabadosAnteriores = lista
          .filter((f) => f.diaSemana === 'sabado' && f.data < form.data)
          .sort((a, b) => (a.data < b.data ? 1 : -1));
        const ant = sabadosAnteriores[0];
        setMoedasSemanaAnterior(
          ant ? (Number(ant.moedasCaixa1) || 0) + (Number(ant.moedasCaixa2) || 0) : 0
        );
      })
      .catch(() => { setFechamentosSemana([]); setMoedasSemanaAnterior(0); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.data, sabado]);

  // Quando o Histórico pede para abrir um dia (alvoToken muda), carrega essa data.
  useEffect(() => {
    if (alvoData) setForm((f) => ({ ...f, data: alvoData }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvoToken]);

  function setCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  // Somas das pendências do dia que entram na conferência (ambas subtraem).
  const somaAbertasHoje = useMemo(
    () => pendenciasDia
      .filter((p) => p.dataAbertura === form.data)
      .reduce((acc, p) => acc + (Number(p.valor) || 0), 0),
    [pendenciasDia, form.data]
  );
  const somaRecebidasHoje = useMemo(
    () => pendenciasDia
      .filter((p) => p.dataRecebimento === form.data)
      .reduce((acc, p) => acc + (Number(p.valor) || 0), 0),
    [pendenciasDia, form.data]
  );

  // Abre uma nova pendência (data de abertura = o dia do fechamento).
  async function abrirPendencia(e) {
    e.preventDefault();
    if (!novaPendencia.descricao.trim()) {
      setMensagem('Informe a descrição da pendência.');
      return;
    }
    try {
      const res = await fetch('/api/pendencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...novaPendencia, dataAbertura: form.data, usuarioId: usuario?.id ?? null }),
      });
      if (!res.ok) throw new Error();
      setNovaPendencia(PENDENCIA_VAZIA);
      setMensagem('Pendência aberta.');
      carregarPendencias();
    } catch {
      setMensagem('Erro ao abrir a pendência.');
    }
  }

  // Marca uma pendência aberta como recebida no dia do fechamento.
  async function receberPendencia(id) {
    try {
      const res = await fetch(`/api/pendencias/${id}/receber`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataRecebimento: form.data }),
      });
      if (!res.ok) throw new Error();
      setMensagem('Pendência recebida.');
      carregarPendencias();
    } catch {
      setMensagem('Erro ao receber a pendência.');
    }
  }

  // Desfaz o recebimento de uma pendência (volta a aberta).
  async function estornarPendencia(id) {
    try {
      const res = await fetch(`/api/pendencias/${id}/estornar`, { method: 'POST' });
      if (!res.ok) throw new Error();
      setMensagem('Recebimento estornado.');
      carregarPendencias();
    } catch {
      setMensagem('Erro ao estornar a pendência.');
    }
  }

  // Exclui uma pendência (lançada por engano).
  async function excluirPendencia(id) {
    try {
      const res = await fetch(`/api/pendencias/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setMensagem('Pendência excluída.');
      carregarPendencias();
    } catch {
      setMensagem('Erro ao excluir a pendência.');
    }
  }

  // Conferência do dinheiro em tempo real.
  const confDinheiro = useMemo(
    () => conferenciaDinheiro({
      fundoFixoCaixa1: form.fundoFixoCaixa1Usado,
      fundoFixoCaixa2: form.fundoFixoCaixa2Usado,
      microvixDinheiro: form.microvixDinheiro,
      cedulasCaixa1: form.cedulasCaixa1,
      cedulasCaixa2: form.cedulasCaixa2,
      limiteDiferencaMoeda: config?.limiteDiferencaMoeda ?? 0,
    }),
    [form, config]
  );

  // Conferência de cartão/pix em tempo real (pendências entram nos próximos passos).
  const confCartao = useMemo(
    () => conferenciaCartaoPix({
      microvixCredito: form.microvixCredito,
      microvixDebito: form.microvixDebito,
      microvixVoucher: form.microvixVoucher,
      microvixPix: form.microvixPix,
      maq1Cartao: form.maq1Cartao, maq1Pix: form.maq1Pix,
      maq2Cartao: form.maq2Cartao, maq2Pix: form.maq2Pix,
      maq3Cartao: form.maq3Cartao, maq3Pix: form.maq3Pix,
      maq4Cartao: form.maq4Cartao, maq4Pix: form.maq4Pix,
      pixChaveDireta: form.pixChaveDireta,
      pendenciasAbertas: somaAbertasHoje,
      pendenciasRecebidas: somaRecebidasHoje,
    }),
    [form, somaAbertasHoje, somaRecebidasHoje]
  );

  // Acumulado semanal de moedas (só no sábado): soma as diferenças de dinheiro
  // de seg–sex (fechamentos salvos) + a do próprio sábado (ao vivo).
  const acumulado = useMemo(() => {
    if (!sabado) return null;
    const difsSemana = fechamentosSemana.map((f) => Number(f.diferencaDinheiro) || 0);
    return acumuladoSemanal({
      diferencasDinheiro: [...difsSemana, confDinheiro.diferencaDinheiro],
      moedasCaixa1: form.moedasCaixa1,
      moedasCaixa2: form.moedasCaixa2,
      moedasSemanaAnterior,
      limiteDiferencaMoeda: config?.limiteDiferencaMoeda ?? 0,
    });
  }, [sabado, fechamentosSemana, confDinheiro.diferencaDinheiro, form.moedasCaixa1, form.moedasCaixa2, moedasSemanaAnterior, config]);

  async function salvar(status) {
    setSalvando(true);
    setMensagem('');
    try {
      const res = await fetch('/api/fechamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, status, usuarioId: usuario?.id ?? null }),
      });
      if (!res.ok) throw new Error('Falha ao salvar');
      const salvo = await res.json();
      setMensagem(
        status === 'fechado'
          ? `Dia ${formatarData(salvo.data)} fechado com sucesso.`
          : `Rascunho de ${formatarData(salvo.data)} salvo.`
      );
      // Ao fechar o dia, abre o relatório para impressão.
      if (status === 'fechado') gerarRelatorio();
    } catch {
      setMensagem('Erro ao salvar o fechamento.');
    } finally {
      setSalvando(false);
    }
  }

  // Monta o texto do relatório com os dados atuais e abre a pré-visualização.
  function gerarRelatorio() {
    setRelatorio(
      montarRelatorio({
        data: form.data,
        form,
        config,
        confDinheiro,
        confCartao,
        pendenciasDia,
        acumulado,
        operador: usuario?.nome || '',
      })
    );
  }

  const nome = (i, padrao) => config?.[`nomeMaquina${i}`] || padrao;

  return (
    <div className="fechamento">
      <header className="fechamento__cabecalho">
        <h1>Fechamento do dia</h1>
        <label className="fechamento__data">
          Data
          <input
            type="date"
            value={form.data}
            onChange={(e) => setCampo('data', e.target.value)}
          />
        </label>
      </header>

      {mensagem && <p className="fechamento__mensagem">{mensagem}</p>}

      <div className="fechamento__grade">
        <div className="fechamento__formulario">
          <section className="secao">
            <h2><span aria-hidden="true">🧾</span> Microvix</h2>
            <label className="campo-valor" htmlFor="mv-nvendas">
              <span className="campo-valor__label">Nº de vendas (opcional)</span>
              <input
                id="mv-nvendas"
                className="campo-valor__input"
                type="number"
                min="0"
                value={form.numeroVendas || ''}
                onChange={(e) => setCampo('numeroVendas', parseInt(e.target.value, 10) || 0)}
              />
            </label>
            <CampoValor id="mv-credito" label="Crédito" value={form.microvixCredito} onChange={(v) => setCampo('microvixCredito', v)} />
            <CampoValor id="mv-debito" label="Débito" value={form.microvixDebito} onChange={(v) => setCampo('microvixDebito', v)} />
            <CampoValor id="mv-voucher" label="Voucher" value={form.microvixVoucher} onChange={(v) => setCampo('microvixVoucher', v)} />
            <CampoValor id="mv-pix" label="Pix" value={form.microvixPix} onChange={(v) => setCampo('microvixPix', v)} />
            <CampoValor id="mv-dinheiro" label="Dinheiro" value={form.microvixDinheiro} onChange={(v) => setCampo('microvixDinheiro', v)} />
            <CampoValor id="mv-prazo" label="A prazo (só registro)" value={form.microvixAPrazo} onChange={(v) => setCampo('microvixAPrazo', v)} />
            <CampoValor id="mv-ifood" label="iFood (só registro)" value={form.microvixIfood} onChange={(v) => setCampo('microvixIfood', v)} />
          </section>

          <section className="secao">
            <h2><span aria-hidden="true">💳</span> Maquininhas</h2>
            {[1, 2, 3, 4].map((i) => (
              <div className="secao__par" key={i}>
                <CampoValor id={`maq${i}-cartao`} label={`${nome(i, `Máquina ${i}`)} cartão`} value={form[`maq${i}Cartao`]} onChange={(v) => setCampo(`maq${i}Cartao`, v)} />
                <CampoValor id={`maq${i}-pix`} label={`${nome(i, `Máquina ${i}`)} pix`} value={form[`maq${i}Pix`]} onChange={(v) => setCampo(`maq${i}Pix`, v)} />
              </div>
            ))}
            <CampoValor id="pix-direta" label="Pix chave direta" value={form.pixChaveDireta} onChange={(v) => setCampo('pixChaveDireta', v)} />
          </section>

          <section className="secao">
            <h2><span aria-hidden="true">💵</span> Dinheiro</h2>
            <CampoValor id="ced-1" label="Cédulas caixa 1" value={form.cedulasCaixa1} onChange={(v) => setCampo('cedulasCaixa1', v)} />
            <CampoValor id="ced-2" label="Cédulas caixa 2" value={form.cedulasCaixa2} onChange={(v) => setCampo('cedulasCaixa2', v)} />
            <div className="secao__par">
              <CampoValor id="fundo-1" label="Fundo fixo caixa 1" value={form.fundoFixoCaixa1Usado} onChange={(v) => setCampo('fundoFixoCaixa1Usado', v)} />
              <CampoValor id="fundo-2" label="Fundo fixo caixa 2" value={form.fundoFixoCaixa2Usado} onChange={(v) => setCampo('fundoFixoCaixa2Usado', v)} />
            </div>
          </section>

          {sabado && (
            <section className="secao">
              <h2><span aria-hidden="true">🪙</span> Moedas — fechamento semanal (sábado)</h2>
              <p className="secao__ajuda">
                Conte <strong>todas</strong> as moedas no caixa (o sistema usa o crescimento
                desde o sábado anterior).
              </p>
              <div className="secao__par">
                <CampoValor id="moedas-1" label="Moedas caixa 1 (total no caixa)" value={form.moedasCaixa1} onChange={(v) => setCampo('moedasCaixa1', v)} />
                <CampoValor id="moedas-2" label="Moedas caixa 2 (total no caixa)" value={form.moedasCaixa2} onChange={(v) => setCampo('moedasCaixa2', v)} />
              </div>
            </section>
          )}

          <section className="secao">
            <h2><span aria-hidden="true">📌</span> Pendências</h2>

            {/* Abrir nova pendência (venda no Microvix que não passou na maquininha hoje). */}
            <form className="pendencia-form" onSubmit={abrirPendencia}>
              <input
                type="text"
                placeholder="Descrição (ex.: Maria — esqueceu o cartão)"
                value={novaPendencia.descricao}
                onChange={(e) => setNovaPendencia((p) => ({ ...p, descricao: e.target.value }))}
              />
              <input
                type="number"
                step="0.01"
                placeholder="Valor"
                value={novaPendencia.valor || ''}
                onChange={(e) => setNovaPendencia((p) => ({ ...p, valor: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Forma (crédito/pix...)"
                value={novaPendencia.formaPagamento}
                onChange={(e) => setNovaPendencia((p) => ({ ...p, formaPagamento: e.target.value }))}
              />
              <button type="submit">+ Abrir</button>
            </form>

            {/* Pendências abertas neste dia. */}
            {pendenciasDia.filter((p) => p.dataAbertura === form.data).length > 0 && (
              <div className="pendencia-lista">
                <h3>Abertas hoje (subtraem da conferência)</h3>
                {pendenciasDia
                  .filter((p) => p.dataAbertura === form.data)
                  .map((p) => (
                    <div className="pendencia-item" key={p.id}>
                      <span>{p.descricao}{p.formaPagamento ? ` · ${p.formaPagamento}` : ''}</span>
                      <strong>{formatarBRL(p.valor)}</strong>
                      {p.status === 'aberta' && (
                        <button type="button" onClick={() => excluirPendencia(p.id)} title="Excluir">✕</button>
                      )}
                    </div>
                  ))}
              </div>
            )}

            {/* Receber pendências abertas (de qualquer dia). */}
            {pendenciasAbertas.length > 0 && (
              <div className="pendencia-lista">
                <h3>Receber pendências abertas</h3>
                {pendenciasAbertas.map((p) => (
                  <div className="pendencia-item" key={p.id}>
                    <span>{p.descricao} · {formatarData(p.dataAbertura)}</span>
                    <strong>{formatarBRL(p.valor)}</strong>
                    <button type="button" onClick={() => receberPendencia(p.id)}>Receber</button>
                  </div>
                ))}
              </div>
            )}

            {/* Pendências recebidas neste dia (subtraem da conferência). */}
            {pendenciasDia.filter((p) => p.dataRecebimento === form.data).length > 0 && (
              <div className="pendencia-lista">
                <h3>Recebidas hoje (subtraem da conferência)</h3>
                {pendenciasDia
                  .filter((p) => p.dataRecebimento === form.data)
                  .map((p) => (
                    <div className="pendencia-item" key={p.id}>
                      <span>{p.descricao} · aberta em {formatarData(p.dataAbertura)}</span>
                      <strong>{formatarBRL(p.valor)}</strong>
                      <button type="button" onClick={() => estornarPendencia(p.id)}>Estornar</button>
                    </div>
                  ))}
              </div>
            )}
          </section>

          <section className="secao">
            <h2><span aria-hidden="true">📝</span> Observações</h2>
            <textarea
              className="secao__observacoes"
              rows={3}
              value={form.observacoes}
              onChange={(e) => setCampo('observacoes', e.target.value)}
              placeholder="Sem observações."
            />
          </section>
        </div>

        <aside className="fechamento__conferencias">
          <Conferencia
            titulo="Conferência — Dinheiro"
            linhas={[
              { label: 'Esperado', valor: confDinheiro.dinheiroEsperado },
              { label: 'Contado (cédulas)', valor: confDinheiro.dinheiroContado },
              { label: 'Sangria caixa 1', valor: confDinheiro.sangriaCaixa1 },
              { label: 'Sangria caixa 2', valor: confDinheiro.sangriaCaixa2 },
            ]}
            resultado={{ label: 'Diferença', valor: confDinheiro.diferencaDinheiro }}
            alerta={confDinheiro.provavelMoeda ? 'Provável troco em moeda' : ''}
          />
          <Conferencia
            titulo="Conferência — Cartão e Pix"
            linhas={[
              { label: 'Microvix', valor: confCartao.totalMicrovixCartaoPix },
              { label: 'Real maquininhas', valor: confCartao.totalRealMaquininhas },
              { label: '(−) Pendências abertas', valor: confCartao.pendenciasAbertas },
              { label: '(−) Pendências recebidas', valor: confCartao.pendenciasRecebidas },
              { label: 'Real ajustado', valor: confCartao.realAjustado },
            ]}
            resultado={{ label: 'Diferença', valor: confCartao.diferencaCartaoPix }}
            alerta={confCartao.diferencaCartaoPix !== 0 ? 'Atenção: diferença a investigar' : ''}
          />
          {sabado && acumulado && (
            <Conferencia
              titulo="Fechamento semanal — Moedas"
              linhas={[
                { label: 'Dif. acumulada (semana)', valor: acumulado.acumulado },
                { label: 'Moedas no caixa (total)', valor: acumulado.totalMoedas },
                { label: 'Sábado anterior', valor: acumulado.moedasSemanaAnterior },
                { label: 'Moedas desta semana', valor: acumulado.moedasDaSemana },
              ]}
              resultado={{ label: 'Saldo não explicado', valor: acumulado.saldoNaoExplicado }}
              alerta={acumulado.dentroLimite ? 'Dentro do limite (explicado por moeda)' : 'Saldo a investigar'}
            />
          )}

          <div className="fechamento__acoes">
            <button type="button" onClick={() => salvar('rascunho')} disabled={salvando}>
              Salvar rascunho
            </button>
            <button type="button" className="primario" onClick={() => salvar('fechado')} disabled={salvando}>
              Fechar dia
            </button>
          </div>
          <button type="button" className="fechamento__imprimir" onClick={gerarRelatorio}>
            Imprimir relatório
          </button>
        </aside>
      </div>

      <RelatorioImpressao texto={relatorio} onFechar={() => setRelatorio(null)} />
    </div>
  );
}
