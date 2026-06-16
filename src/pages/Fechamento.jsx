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

// Lançamento de sangria em branco (retirada de dinheiro do caixa para pagamento).
const SANGRIA_VAZIA = { caixa: 1, descricao: '', valor: 0 };

// Ajuste de cartão/pix em branco (soma ou subtrai do real da maquininha).
const AJUSTE_VAZIO = { tipo: 'subtrai', descricao: '', valor: 0 };

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
    // Dinheiro (fluxo por caixa)
    aberturaCaixa1: 0, aberturaCaixa2: 0,
    suprimentoCaixa1: 0, suprimentoCaixa2: 0,
    fechamentoCaixa1: 0, fechamentoCaixa2: 0,
    desejadoCaixa1: 0, desejadoCaixa2: 0,
    sangrias: [],
    ajustesCartao: [],
    // Sábado
    moedasCaixa1: 0, moedasCaixa2: 0,
  };
}

// Campos numéricos que vêm da API (camelCase) e preenchem o formulário ao carregar.
const CAMPOS_FORM = [
  'numeroVendas',
  'microvixCredito', 'microvixDebito', 'microvixVoucher', 'microvixPix',
  'microvixDinheiro', 'microvixAPrazo', 'microvixIfood',
  'maq1Cartao', 'maq1Pix', 'maq2Cartao', 'maq2Pix',
  'maq3Cartao', 'maq3Pix', 'maq4Cartao', 'maq4Pix',
  'pixChaveDireta',
  'aberturaCaixa1', 'aberturaCaixa2',
  'suprimentoCaixa1', 'suprimentoCaixa2',
  'fechamentoCaixa1', 'fechamentoCaixa2',
  'desejadoCaixa1', 'desejadoCaixa2',
  'moedasCaixa1', 'moedasCaixa2',
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

  // Lançamento de sangria em edição (antes de adicionar à lista do dia).
  const [novaSangria, setNovaSangria] = useState(SANGRIA_VAZIA);

  // Ajuste de cartão/pix em edição (soma ou subtrai do real da maquininha).
  const [novoAjuste, setNovoAjuste] = useState(AJUSTE_VAZIO);

  // Texto do relatório para impressão (null = sem pré-visualização aberta).
  const [relatorio, setRelatorio] = useState(null);

  // Fechamentos da semana (seg–sáb) — usados no acumulado de moedas do sábado.
  const [fechamentosSemana, setFechamentosSemana] = useState([]);
  // Total de moedas no caixa registrado no sábado anterior (as moedas não são
  // retiradas; o que conta é o crescimento do estoque desde então).
  const [moedasSemanaAnterior, setMoedasSemanaAnterior] = useState(0);
  // É o PRIMEIRO sábado contado (não há sábado anterior no sistema)? Nesse caso o
  // operador informa quanto de moeda já havia no caixa (a base), para as moedas
  // pré-existentes não virarem uma "sobra" falsa.
  const [primeiroSabado, setPrimeiroSabado] = useState(false);

  const sabado = ehSabado(form.data);

  // Carrega as configurações uma vez (nomes das máquinas, fundo fixo, limite).
  useEffect(() => {
    fetch('/api/configuracoes')
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setMensagem('Não foi possível carregar as configurações.'));
  }, []);

  // Sempre que muda a data (ou as configurações chegam), carrega o fechamento
  // daquele dia, se existir; senão, abre em branco com a ABERTURA preenchida a
  // partir do "desejado" do último fechamento anterior.
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
          carregado.sangrias = Array.isArray(fech.sangrias) ? fech.sangrias : [];
          carregado.ajustesCartao = Array.isArray(fech.ajustesCartao) ? fech.ajustesCartao : [];
          setForm(carregado);
          setMensagem(`Fechamento de ${formatarData(fech.data)} carregado (${fech.status}).`);
        } else {
          // Dia novo: puxa a abertura do "desejado" do fechamento anterior.
          fetch('/api/fechamentos')
            .then((r) => r.json())
            .then((lista) => {
              if (cancelado) return;
              const ant = (Array.isArray(lista) ? lista : [])
                .filter((f) => f.data < form.data)
                .sort((a, b) => (a.data < b.data ? 1 : -1))[0];
              setForm({
                ...estadoInicial(form.data),
                aberturaCaixa1: ant ? Number(ant.desejadoCaixa1) || 0 : 0,
                aberturaCaixa2: ant ? Number(ant.desejadoCaixa2) || 0 : 0,
              });
              setMensagem(
                ant
                  ? 'Abertura preenchida com o saldo desejado do dia anterior (edite se contou diferente).'
                  : ''
              );
            })
            .catch(() => { if (!cancelado) setForm(estadoInicial(form.data)); });
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
    if (!sabado) { setFechamentosSemana([]); setMoedasSemanaAnterior(0); setPrimeiroSabado(false); return; }
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
        if (ant) {
          setPrimeiroSabado(false);
          setMoedasSemanaAnterior((Number(ant.moedasCaixa1) || 0) + (Number(ant.moedasCaixa2) || 0));
        } else {
          // Primeiro sábado: o operador informa a base (campo editável).
          setPrimeiroSabado(true);
          setMoedasSemanaAnterior(0);
        }
      })
      .catch(() => { setFechamentosSemana([]); setMoedasSemanaAnterior(0); setPrimeiroSabado(false); });
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

  // Sangrias (retiradas do caixa para pagamentos) — lista do dia, por caixa.
  function adicionarSangria(e) {
    e.preventDefault();
    if (!novaSangria.descricao.trim()) {
      setMensagem('Informe a descrição da sangria.');
      return;
    }
    setForm((f) => ({
      ...f,
      sangrias: [...(f.sangrias || []), {
        caixa: Number(novaSangria.caixa) === 2 ? 2 : 1,
        descricao: novaSangria.descricao.trim(),
        valor: Number(novaSangria.valor) || 0,
      }],
    }));
    setNovaSangria(SANGRIA_VAZIA);
  }

  function removerSangria(indice) {
    setForm((f) => ({ ...f, sangrias: (f.sangrias || []).filter((_, i) => i !== indice) }));
  }

  // Somas das sangrias do dia por caixa (entram na conferência do dinheiro).
  const somaSangria1 = useMemo(
    () => (form.sangrias || []).filter((s) => Number(s.caixa) === 1).reduce((a, s) => a + (Number(s.valor) || 0), 0),
    [form.sangrias]
  );
  const somaSangria2 = useMemo(
    () => (form.sangrias || []).filter((s) => Number(s.caixa) === 2).reduce((a, s) => a + (Number(s.valor) || 0), 0),
    [form.sangrias]
  );

  // Ajustes de cartão/pix — total com sinal (soma + / subtrai −).
  function adicionarAjuste(e) {
    e.preventDefault();
    if (!novoAjuste.descricao.trim()) {
      setMensagem('Informe a descrição do ajuste.');
      return;
    }
    setForm((f) => ({
      ...f,
      ajustesCartao: [...(f.ajustesCartao || []), {
        tipo: novoAjuste.tipo === 'soma' ? 'soma' : 'subtrai',
        descricao: novoAjuste.descricao.trim(),
        valor: Number(novoAjuste.valor) || 0,
      }],
    }));
    setNovoAjuste(AJUSTE_VAZIO);
  }

  function removerAjuste(indice) {
    setForm((f) => ({ ...f, ajustesCartao: (f.ajustesCartao || []).filter((_, i) => i !== indice) }));
  }

  const somaAjustes = useMemo(
    () => (form.ajustesCartao || []).reduce(
      (a, x) => a + (x.tipo === 'soma' ? (Number(x.valor) || 0) : -(Number(x.valor) || 0)), 0
    ),
    [form.ajustesCartao]
  );

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

  // Conferência do dinheiro em tempo real (fluxo por caixa).
  const confDinheiro = useMemo(
    () => conferenciaDinheiro({
      aberturaCaixa1: form.aberturaCaixa1, aberturaCaixa2: form.aberturaCaixa2,
      suprimentoCaixa1: form.suprimentoCaixa1, suprimentoCaixa2: form.suprimentoCaixa2,
      fechamentoCaixa1: form.fechamentoCaixa1, fechamentoCaixa2: form.fechamentoCaixa2,
      desejadoCaixa1: form.desejadoCaixa1, desejadoCaixa2: form.desejadoCaixa2,
      sangriaCaixa1: somaSangria1, sangriaCaixa2: somaSangria2,
      microvixDinheiro: form.microvixDinheiro,
      limiteDiferencaMoeda: config?.limiteDiferencaMoeda ?? 0,
    }),
    [form, config, somaSangria1, somaSangria2]
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
      ajustesCartao: somaAjustes,
    }),
    [form, somaAbertasHoje, somaRecebidasHoje, somaAjustes]
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
        primeiroSabado,
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
            <h2><span aria-hidden="true">🧮</span> Ajustes de cartão/pix</h2>
            <p className="secao__ajuda">
              Para o que entra/sai da maquininha mas <strong>não é venda de hoje</strong>
              (ex.: convênio pagando fiado via cartão). Soma ou subtrai do real.
            </p>
            <form className="sangria-form" onSubmit={adicionarAjuste}>
              <select
                value={novoAjuste.tipo}
                onChange={(e) => setNovoAjuste((a) => ({ ...a, tipo: e.target.value }))}
              >
                <option value="subtrai">Subtrai (−)</option>
                <option value="soma">Soma (+)</option>
              </select>
              <input
                type="text"
                placeholder="Descrição (ex.: convênio pagou fiado)"
                value={novoAjuste.descricao}
                onChange={(e) => setNovoAjuste((a) => ({ ...a, descricao: e.target.value }))}
              />
              <input
                type="number"
                step="0.01"
                placeholder="Valor"
                value={novoAjuste.valor || ''}
                onChange={(e) => setNovoAjuste((a) => ({ ...a, valor: e.target.value }))}
              />
              <button type="submit">+ Adicionar</button>
            </form>

            {(form.ajustesCartao || []).length > 0 && (
              <div className="pendencia-lista">
                {form.ajustesCartao.map((a, i) => (
                  <div className="pendencia-item" key={i}>
                    <span>{a.tipo === 'soma' ? '(+)' : '(−)'} {a.descricao}</span>
                    <strong>{formatarBRL(a.valor)}</strong>
                    <button type="button" onClick={() => removerAjuste(i)} title="Excluir">✕</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="secao">
            <h2><span aria-hidden="true">💵</span> Dinheiro</h2>
            <p className="secao__ajuda">
              Por caixa: quanto abriu, quanto fechou (cédulas contadas), suprimentos,
              sangrias e quanto quer deixar para o próximo dia.
            </p>

            <div className="secao__par">
              {[1, 2].map((c) => (
                <div className="caixa-bloco" key={c}>
                  <h3>Caixa {c}</h3>
                  <CampoValor id={`abertura-${c}`} label="Abertura (início do dia)" value={form[`aberturaCaixa${c}`]} onChange={(v) => setCampo(`aberturaCaixa${c}`, v)} />
                  <CampoValor id={`suprimento-${c}`} label="Suprimento (opcional)" value={form[`suprimentoCaixa${c}`]} onChange={(v) => setCampo(`suprimentoCaixa${c}`, v)} />
                  <CampoValor id={`fechamento-${c}`} label="Fechamento (contado)" value={form[`fechamentoCaixa${c}`]} onChange={(v) => setCampo(`fechamentoCaixa${c}`, v)} />
                  <CampoValor id={`desejado-${c}`} label="Deixar p/ próximo dia" value={form[`desejadoCaixa${c}`]} onChange={(v) => setCampo(`desejadoCaixa${c}`, v)} />
                </div>
              ))}
            </div>

            {/* Sangrias — retiradas de dinheiro do caixa para pagamentos */}
            <h3 className="sangria-titulo">Sangrias (retiradas para pagamento)</h3>
            <form className="sangria-form" onSubmit={adicionarSangria}>
              <select
                value={novaSangria.caixa}
                onChange={(e) => setNovaSangria((s) => ({ ...s, caixa: Number(e.target.value) }))}
              >
                <option value={1}>Caixa 1</option>
                <option value={2}>Caixa 2</option>
              </select>
              <input
                type="text"
                placeholder="Descrição (ex.: pagamento entregador)"
                value={novaSangria.descricao}
                onChange={(e) => setNovaSangria((s) => ({ ...s, descricao: e.target.value }))}
              />
              <input
                type="number"
                step="0.01"
                placeholder="Valor"
                value={novaSangria.valor || ''}
                onChange={(e) => setNovaSangria((s) => ({ ...s, valor: e.target.value }))}
              />
              <button type="submit">+ Adicionar</button>
            </form>

            {(form.sangrias || []).length > 0 && (
              <div className="pendencia-lista">
                {form.sangrias.map((s, i) => (
                  <div className="pendencia-item" key={i}>
                    <span>Caixa {s.caixa} · {s.descricao}</span>
                    <strong>{formatarBRL(s.valor)}</strong>
                    <button type="button" onClick={() => removerSangria(i)} title="Excluir">✕</button>
                  </div>
                ))}
              </div>
            )}
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

              {primeiroSabado && (
                <>
                  <p className="secao__ajuda" style={{ marginTop: '0.8rem' }}>
                    <strong>Primeiro sábado:</strong> informe quanto de moeda <strong>já havia</strong> no
                    caixa antes de começar a usar o sistema, para essas moedas antigas não virarem
                    uma sobra falsa. (Depois disso, fica automático.)
                  </p>
                  <CampoValor
                    id="moedas-base"
                    label="Moedas que já havia (base, caixa 1 + 2)"
                    value={moedasSemanaAnterior}
                    onChange={(v) => setMoedasSemanaAnterior(v)}
                  />
                </>
              )}
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
                    <button type="button" onClick={() => excluirPendencia(p.id)} title="Excluir">✕</button>
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
              { label: 'Abertura (total)', valor: confDinheiro.totalAbertura },
              { label: '(+) Suprimento', valor: confDinheiro.totalSuprimento },
              { label: '(−) Sangrias', valor: confDinheiro.totalSangria },
              { label: 'Esperado (c/ Microvix)', valor: confDinheiro.dinheiroEsperado },
              { label: 'Contado (fechamento)', valor: confDinheiro.dinheiroContado },
            ]}
            resultado={{ label: 'Diferença', valor: confDinheiro.diferencaDinheiro }}
            alerta={confDinheiro.provavelMoeda ? 'Provável troco em moeda' : ''}
          />
          <Conferencia
            titulo="Retirada do fim do dia"
            linhas={[
              { label: 'Retirar do caixa 1', valor: confDinheiro.retirarCaixa1 },
              { label: 'Retirar do caixa 2', valor: confDinheiro.retirarCaixa2 },
            ]}
            resultado={{ label: 'Total a retirar', valor: confDinheiro.totalRetirar }}
            alerta="Retire isso para deixar o desejado em cada caixa"
          />
          <Conferencia
            titulo="Conferência — Cartão e Pix"
            linhas={[
              { label: 'Microvix', valor: confCartao.totalMicrovixCartaoPix },
              { label: 'Real maquininhas', valor: confCartao.totalRealMaquininhas },
              ...(confCartao.pendenciasAbertas || confCartao.pendenciasRecebidas || confCartao.ajustesCartao
                ? [
                    ...(confCartao.pendenciasAbertas ? [{ label: '(+) Pendências abertas', valor: confCartao.pendenciasAbertas }] : []),
                    ...(confCartao.pendenciasRecebidas ? [{ label: '(−) Pendências recebidas', valor: confCartao.pendenciasRecebidas }] : []),
                    ...(confCartao.ajustesCartao ? [{ label: 'Ajustes', valor: confCartao.ajustesCartao }] : []),
                    { label: 'Real ajustado', valor: confCartao.realAjustado },
                  ]
                : []),
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
                { label: primeiroSabado ? 'Base inicial' : 'Sábado anterior', valor: acumulado.moedasSemanaAnterior },
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
