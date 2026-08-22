// Fechamento — tela principal. Formulário do fechamento do dia com as seções
// Microvix, Maquininhas, Dinheiro, Pendências e Observações, mostrando as duas
// conferências (dinheiro e cartão/pix) em tempo real a partir de calculos.js.

import { useEffect, useMemo, useState } from 'react';
import CampoValor from '../components/CampoValor';
import Conferencia from '../components/Conferencia';
import RelatorioImpressao from '../components/RelatorioImpressao';
import { conferenciaDinheiro, conferenciaCartaoPix } from '../utils/calculos';
import { montarRelatorio } from '../utils/relatorio';
import { formatarData, formatarBRL, hojeISO } from '../utils/formatacao';
import './Fechamento.css';

// Formulário em branco para abrir uma nova pendência.
const PENDENCIA_VAZIA = { descricao: '', valor: 0, formaPagamento: '', previsaoPagamento: '' };

// Lançamento de sangria em branco (retirada de dinheiro do caixa para pagamento).
const SANGRIA_VAZIA = { caixa: 1, descricao: '', valor: 0 };

// Ajuste de cartão/pix em branco (soma ou subtrai do real da maquininha).
const AJUSTE_VAZIO = { tipo: 'subtrai', descricao: '', valor: 0 };

// Recebimento de a prazo em branco (cliente com conta formal quitando fiado).
const A_PRAZO_VAZIO = { descricao: '', valor: 0, formaRecebimento: 'cartao_pix' };

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
    ajustesDinheiro: [],
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
  // Forma de recebimento escolhida por pendência, antes de confirmar "Receber".
  const [formasRecebimento, setFormasRecebimento] = useState({});

  // Recebimentos de a prazo do dia (cliente com conta formal quitando fiado).
  const [aPrazoDia, setAPrazoDia] = useState([]);
  const [novoAPrazo, setNovoAPrazo] = useState(A_PRAZO_VAZIO);

  // Lançamento de sangria em edição (antes de adicionar à lista do dia).
  const [novaSangria, setNovaSangria] = useState(SANGRIA_VAZIA);

  // Ajuste de cartão/pix em edição (soma ou subtrai do real da maquininha).
  const [novoAjuste, setNovoAjuste] = useState(AJUSTE_VAZIO);

  // Ajuste de dinheiro em edição (soma ou subtrai do contado do caixa).
  const [novoAjusteDinheiro, setNovoAjusteDinheiro] = useState(AJUSTE_VAZIO);

  // Texto do relatório para impressão (null = sem pré-visualização aberta).
  const [relatorio, setRelatorio] = useState(null);

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
          carregado.ajustesDinheiro = Array.isArray(fech.ajustesDinheiro) ? fech.ajustesDinheiro : [];
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

  // Carrega os recebimentos de a prazo do dia.
  function carregarAPrazo() {
    fetch(`/api/a-prazo?data=${form.data}`)
      .then((r) => r.json())
      .then(setAPrazoDia)
      .catch(() => setAPrazoDia([]));
  }

  useEffect(() => {
    carregarAPrazo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.data]);

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

  // Ajustes de dinheiro — mesma mecânica, do lado do caixa.
  function adicionarAjusteDinheiro(e) {
    e.preventDefault();
    if (!novoAjusteDinheiro.descricao.trim()) {
      setMensagem('Informe a descrição do ajuste.');
      return;
    }
    setForm((f) => ({
      ...f,
      ajustesDinheiro: [...(f.ajustesDinheiro || []), {
        tipo: novoAjusteDinheiro.tipo === 'soma' ? 'soma' : 'subtrai',
        descricao: novoAjusteDinheiro.descricao.trim(),
        valor: Number(novoAjusteDinheiro.valor) || 0,
      }],
    }));
    setNovoAjusteDinheiro(AJUSTE_VAZIO);
  }

  function removerAjusteDinheiro(indice) {
    setForm((f) => ({ ...f, ajustesDinheiro: (f.ajustesDinheiro || []).filter((_, i) => i !== indice) }));
  }

  const somaAjustesDinheiro = useMemo(
    () => (form.ajustesDinheiro || []).reduce(
      (a, x) => a + (x.tipo === 'soma' ? (Number(x.valor) || 0) : -(Number(x.valor) || 0)), 0
    ),
    [form.ajustesDinheiro]
  );

  // Soma das pendências abertas hoje (soma de volta no cartão/pix — a venda já
  // está no Microvix, só não passou na maquininha ainda).
  const somaAbertasHoje = useMemo(
    () => pendenciasDia
      .filter((p) => p.dataAbertura === form.data)
      .reduce((acc, p) => acc + (Number(p.valor) || 0), 0),
    [pendenciasDia, form.data]
  );

  // Recebidas hoje, separadas por forma (cada uma subtrai do lado que recebeu).
  const somaRecebidasCartaoHoje = useMemo(
    () => pendenciasDia
      .filter((p) => p.dataRecebimento === form.data && p.formaRecebimento !== 'dinheiro')
      .reduce((acc, p) => acc + (Number(p.valor) || 0), 0),
    [pendenciasDia, form.data]
  );
  const somaRecebidasDinheiroHoje = useMemo(
    () => pendenciasDia
      .filter((p) => p.dataRecebimento === form.data && p.formaRecebimento === 'dinheiro')
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

  // Marca uma pendência aberta como recebida no dia do fechamento, na forma
  // escolhida (cartão/pix ou dinheiro — decide em qual conferência ela entra).
  async function receberPendencia(id) {
    const formaRecebimento = formasRecebimento[id] || 'cartao_pix';
    try {
      const res = await fetch(`/api/pendencias/${id}/receber`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataRecebimento: form.data, formaRecebimento }),
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
  async function excluirPendencia(id, descricao) {
    if (!window.confirm(`Excluir a pendência "${descricao}"? Essa ação não pode ser desfeita.`)) return;
    try {
      const res = await fetch(`/api/pendencias/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setMensagem('Pendência excluída.');
      carregarPendencias();
    } catch {
      setMensagem('Erro ao excluir a pendência.');
    }
  }

  // Registra um recebimento de a prazo (cliente quitou o fiado hoje).
  async function adicionarAPrazo(e) {
    e.preventDefault();
    if (!novoAPrazo.valor || Number(novoAPrazo.valor) <= 0) {
      setMensagem('Informe o valor recebido.');
      return;
    }
    try {
      const res = await fetch('/api/a-prazo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...novoAPrazo, data: form.data, usuarioId: usuario?.id ?? null }),
      });
      if (!res.ok) throw new Error();
      setNovoAPrazo(A_PRAZO_VAZIO);
      setMensagem('Recebimento de a prazo registrado.');
      carregarAPrazo();
    } catch {
      setMensagem('Erro ao registrar o recebimento de a prazo.');
    }
  }

  // Exclui um recebimento de a prazo (lançado por engano).
  async function excluirAPrazo(id, descricao) {
    if (!window.confirm(`Excluir o recebimento "${descricao || 'a prazo'}"? Essa ação não pode ser desfeita.`)) return;
    try {
      const res = await fetch(`/api/a-prazo/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setMensagem('Recebimento de a prazo excluído.');
      carregarAPrazo();
    } catch {
      setMensagem('Erro ao excluir o recebimento de a prazo.');
    }
  }

  // Somas dos recebimentos de a prazo do dia, por forma (entram como ajuste,
  // sempre subtraindo do lado que recebeu).
  const somaAPrazoDinheiroHoje = useMemo(
    () => aPrazoDia.filter((r) => r.formaRecebimento === 'dinheiro').reduce((a, r) => a + (Number(r.valor) || 0), 0),
    [aPrazoDia]
  );
  const somaAPrazoCartaoHoje = useMemo(
    () => aPrazoDia.filter((r) => r.formaRecebimento === 'cartao_pix').reduce((a, r) => a + (Number(r.valor) || 0), 0),
    [aPrazoDia]
  );

  // Conferência do dinheiro em tempo real (fluxo por caixa).
  const confDinheiro = useMemo(
    () => conferenciaDinheiro({
      aberturaCaixa1: form.aberturaCaixa1, aberturaCaixa2: form.aberturaCaixa2,
      suprimentoCaixa1: form.suprimentoCaixa1, suprimentoCaixa2: form.suprimentoCaixa2,
      fechamentoCaixa1: form.fechamentoCaixa1, fechamentoCaixa2: form.fechamentoCaixa2,
      desejadoCaixa1: form.desejadoCaixa1, desejadoCaixa2: form.desejadoCaixa2,
      sangriaCaixa1: somaSangria1, sangriaCaixa2: somaSangria2,
      microvixDinheiro: form.microvixDinheiro,
      ajustesDinheiro: somaAjustesDinheiro - somaAPrazoDinheiroHoje - somaRecebidasDinheiroHoje,
      limiteDiferencaMoeda: config?.limiteDiferencaMoeda ?? 0,
    }),
    [form, config, somaSangria1, somaSangria2, somaAjustesDinheiro, somaAPrazoDinheiroHoje, somaRecebidasDinheiroHoje]
  );

  // Conferência de cartão/pix em tempo real.
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
      pendenciasRecebidas: somaRecebidasCartaoHoje,
      ajustesCartao: somaAjustes - somaAPrazoCartaoHoje,
    }),
    [form, somaAbertasHoje, somaRecebidasCartaoHoje, somaAjustes, somaAPrazoCartaoHoje]
  );

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
        aPrazoDia,
        operador: usuario?.nome || '',
      })
    );
  }

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
                <CampoValor id={`maq${i}-cartao`} label={`Máquina ${i} cartão`} value={form[`maq${i}Cartao`]} onChange={(v) => setCampo(`maq${i}Cartao`, v)} />
                <CampoValor id={`maq${i}-pix`} label={`Máquina ${i} pix`} value={form[`maq${i}Pix`]} onChange={(v) => setCampo(`maq${i}Pix`, v)} />
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

            {/* Ajustes de dinheiro — dinheiro que entrou/saiu do caixa mas não é
                venda de hoje (ex.: recebimento de a prazo/pendência em espécie). */}
            <h3 className="sangria-titulo">Ajustes (dinheiro que não é venda de hoje)</h3>
            <form className="sangria-form" onSubmit={adicionarAjusteDinheiro}>
              <select
                value={novoAjusteDinheiro.tipo}
                onChange={(e) => setNovoAjusteDinheiro((a) => ({ ...a, tipo: e.target.value }))}
              >
                <option value="subtrai">Subtrai (−)</option>
                <option value="soma">Soma (+)</option>
              </select>
              <input
                type="text"
                placeholder="Descrição (ex.: recebimento a prazo em dinheiro)"
                value={novoAjusteDinheiro.descricao}
                onChange={(e) => setNovoAjusteDinheiro((a) => ({ ...a, descricao: e.target.value }))}
              />
              <input
                type="number"
                step="0.01"
                placeholder="Valor"
                value={novoAjusteDinheiro.valor || ''}
                onChange={(e) => setNovoAjusteDinheiro((a) => ({ ...a, valor: e.target.value }))}
              />
              <button type="submit">+ Adicionar</button>
            </form>

            {(form.ajustesDinheiro || []).length > 0 && (
              <div className="pendencia-lista">
                {form.ajustesDinheiro.map((a, i) => (
                  <div className="pendencia-item" key={i}>
                    <span>{a.tipo === 'soma' ? '(+)' : '(−)'} {a.descricao}</span>
                    <strong>{formatarBRL(a.valor)}</strong>
                    <button type="button" onClick={() => removerAjusteDinheiro(i)} title="Excluir">✕</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="secao">
            <h2><span aria-hidden="true">🧾</span> A prazo — recebimento</h2>
            <p className="secao__ajuda">
              Cliente com conta formal (fiado) quitando compra antiga. A venda já está em
              "A prazo" no Microvix desde o dia dela — aqui só se registra o <strong>recebimento</strong>,
              que entra sem bater com nada do Microvix de hoje.
            </p>
            <form className="pendencia-form" onSubmit={adicionarAPrazo}>
              <input
                type="text"
                placeholder="Descrição (ex.: Maria — quitou conta)"
                value={novoAPrazo.descricao}
                onChange={(e) => setNovoAPrazo((p) => ({ ...p, descricao: e.target.value }))}
              />
              <input
                type="number"
                step="0.01"
                placeholder="Valor"
                value={novoAPrazo.valor || ''}
                onChange={(e) => setNovoAPrazo((p) => ({ ...p, valor: e.target.value }))}
              />
              <select
                value={novoAPrazo.formaRecebimento}
                onChange={(e) => setNovoAPrazo((p) => ({ ...p, formaRecebimento: e.target.value }))}
              >
                <option value="cartao_pix">Cartão/pix</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
              <button type="submit">+ Registrar</button>
            </form>

            {aPrazoDia.length > 0 && (
              <div className="pendencia-lista">
                {aPrazoDia.map((r) => (
                  <div className="pendencia-item" key={r.id}>
                    <span>
                      {r.descricao || 'A prazo'} · {r.formaRecebimento === 'dinheiro' ? 'dinheiro' : 'cartão/pix'}
                    </span>
                    <strong>{formatarBRL(r.valor)}</strong>
                    <button type="button" onClick={() => excluirAPrazo(r.id, r.descricao)} title="Excluir">✕</button>
                  </div>
                ))}
              </div>
            )}
          </section>

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
                        <button type="button" onClick={() => excluirPendencia(p.id, p.descricao)} title="Excluir">✕</button>
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
                    <select
                      value={formasRecebimento[p.id] || 'cartao_pix'}
                      onChange={(e) => setFormasRecebimento((f) => ({ ...f, [p.id]: e.target.value }))}
                    >
                      <option value="cartao_pix">Cartão/pix</option>
                      <option value="dinheiro">Dinheiro</option>
                    </select>
                    <button type="button" onClick={() => receberPendencia(p.id)}>Receber</button>
                    <button type="button" onClick={() => excluirPendencia(p.id, p.descricao)} title="Excluir">✕</button>
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
                      <span>
                        {p.descricao} · aberta em {formatarData(p.dataAbertura)} ·{' '}
                        {p.formaRecebimento === 'dinheiro' ? 'dinheiro' : 'cartão/pix'}
                      </span>
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
              ...(confDinheiro.ajustesDinheiro
                ? [
                    { label: 'Ajustes', valor: confDinheiro.ajustesDinheiro },
                    { label: 'Contado ajustado', valor: confDinheiro.dinheiroContadoAjustado },
                  ]
                : []),
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
