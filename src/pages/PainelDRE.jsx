// Painel — DRE: Receita × Despesa × Resultado do período. Regime de caixa:
// receita é o que realmente entrou (totalRealMaquininhas + dinheiro contado
// dos fechamentos), não o que o Microvix registrou — por isso a
// prazo/pendência recebidos já contam automaticamente no dia que o dinheiro
// chegou, sem precisar somar nada à parte. Detalhe de despesa por categoria/
// fornecedor fica na sub-aba Despesas. Sub-aba de Painel — CSS compartilhado
// em Painel.css, importado pela casca (Painel.jsx).

import { useEffect, useMemo, useState } from 'react';
import { formatarBRL, formatarData } from '../utils/formatacao';

const n = (x) => Number(x) || 0;

const addDias = (iso, d) => {
  const x = new Date(`${iso}T12:00:00`);
  x.setDate(x.getDate() + d);
  return x.toLocaleDateString('en-CA');
};
const primeiroDiaMes = (iso) => `${iso.slice(0, 7)}-01`;
const ultimoDiaMes = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  return `${iso.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};
const mesAnteriorDe = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

// Receita do dia (regime de caixa): tudo que fisicamente entrou, bruto — não
// afetado por ajustes/pendências (esses só explicam a diferença, não mudam
// quanto entrou de fato).
const receitaDoDia = (f) => n(f.totalRealMaquininhas) + n(f.fechamentoCaixa1) + n(f.fechamentoCaixa2);

export default function PainelDRE() {
  const [fechamentos, setFechamentos] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch('/api/fechamentos')
      .then((r) => r.json())
      .then((fs) => {
        const lista = Array.isArray(fs) ? fs : [];
        setFechamentos(lista);
        if (lista.length) {
          const ultima = lista.reduce((a, f) => (f.data > a ? f.data : a), lista[0].data);
          setInicio(primeiroDiaMes(ultima));
          setFim(ultimoDiaMes(ultima));
        }
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    if (!inicio || !fim) return;
    fetch(`/api/despesas?inicio=${inicio}&fim=${fim}`)
      .then((r) => r.json())
      .then((d) => setDespesas(Array.isArray(d) ? d : []))
      .catch(() => setDespesas([]));
  }, [inicio, fim]);

  const ultimaData = useMemo(
    () => (fechamentos.length ? fechamentos.reduce((a, f) => (f.data > a ? f.data : a), fechamentos[0].data) : null),
    [fechamentos]
  );

  function presetMesAtual() { if (ultimaData) { setInicio(primeiroDiaMes(ultimaData)); setFim(ultimoDiaMes(ultimaData)); } }
  function presetMesAnterior() { if (ultimaData) { const p = mesAnteriorDe(ultimaData); setInicio(p); setFim(ultimoDiaMes(p)); } }
  function presetUltimos7() { if (ultimaData) { setInicio(addDias(ultimaData, -6)); setFim(ultimaData); } }
  function presetTudo() {
    if (!fechamentos.length) return;
    const datas = fechamentos.map((f) => f.data);
    setInicio(datas.reduce((a, d) => (d < a ? d : a)));
    setFim(datas.reduce((a, d) => (d > a ? d : a)));
  }

  const resumo = useMemo(() => {
    if (!inicio || !fim) return null;
    const fechDoPeriodo = fechamentos.filter((f) => f.data >= inicio && f.data <= fim);
    const receita = fechDoPeriodo.reduce((s, f) => s + receitaDoDia(f), 0);
    const despesaTotal = despesas.reduce((s, d) => s + n(d.valor), 0);
    return { dias: fechDoPeriodo.length, receita, despesaTotal, resultado: receita - despesaTotal };
  }, [fechamentos, despesas, inicio, fim]);

  if (carregando) {
    return <p className="painel__vazio">Carregando…</p>;
  }
  if (!fechamentos.length) {
    return (
      <p className="painel__vazio">
        Ainda não há fechamentos registrados. Assim que houver fechamentos e despesas
        lançadas, o balanço aparece aqui.
      </p>
    );
  }

  return (
    <div className="painel__sub">
      <div className="painel__topo">
        <div className="filtro">
          <div className="filtro__presets">
            <button type="button" onClick={presetMesAtual}>Mês atual</button>
            <button type="button" onClick={presetMesAnterior}>Mês anterior</button>
            <button type="button" onClick={presetUltimos7}>Últimos 7 dias</button>
            <button type="button" onClick={presetTudo}>Tudo</button>
          </div>
          <div className="filtro__datas">
            <label>De <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
            <label>Até <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></label>
          </div>
        </div>
      </div>

      {inicio && fim && (
        <p className="painel__periodo">
          Período: <strong>{formatarData(inicio)}</strong> a <strong>{formatarData(fim)}</strong>
          {resumo ? ` · ${resumo.dias} dia(s) com fechamento` : ''}
        </p>
      )}

      <div className="kpis kpis--dre">
        <Kpi titulo="Receita" valor={formatarBRL(resumo?.receita || 0)} rodape="maquininhas + dinheiro, regime de caixa" principal />
        <Kpi titulo="Despesas" valor={formatarBRL(resumo?.despesaTotal || 0)} rodape={`${despesas.length} lançamento(s)`} />
        <Kpi
          titulo="Resultado"
          valor={formatarBRL(resumo?.resultado || 0)}
          rodape={resumo?.resultado < 0 ? 'prejuízo no período' : resumo?.resultado > 0 ? 'lucro no período' : 'zerado'}
          cor={resumo?.resultado < 0 ? 'neg' : 'zero'}
        />
      </div>

      <p className="painel__nota">
        Detalhe de despesa por categoria e fornecedor: aba <strong>Despesas</strong>.
      </p>
    </div>
  );
}

function Kpi({ titulo, valor, rodape, cor, principal }) {
  return (
    <div className={`kpi${principal ? ' kpi--principal' : ''}`}>
      <span className="kpi__titulo">{titulo}</span>
      <strong className={`kpi__valor${cor ? ` kpi__valor--${cor}` : ''}`}>{valor}</strong>
      <span className="kpi__rodape">{rodape}</span>
    </div>
  );
}
