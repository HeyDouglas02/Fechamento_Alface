// Painel — DRE: Receita × Despesa × Resultado do período. Regime de caixa:
// receita é o que realmente entrou (totalRealMaquininhas + dinheiro contado
// dos fechamentos), não o que o Microvix registrou — por isso a
// prazo/pendência recebidos já contam automaticamente no dia que o dinheiro
// chegou, sem precisar somar nada à parte. iFood é diferente: o dinheiro não
// passa pelo caixa/maquininha, então o repasse (valor líquido) entra somado
// à parte, no dia do recebimento. Detalhe de despesa por categoria/
// fornecedor fica na sub-aba Despesas. Sub-aba de Painel — CSS compartilhado
// em Painel.css, importado pela casca (Painel.jsx).

import { useEffect, useMemo, useState } from 'react';
import { formatarBRL, formatarData, hojeISO } from '../utils/formatacao';
import { receitaDoDia, totalMaquininhas, entradaDinheiro } from '../utils/calculos';

const n = (x) => Number(x) || 0;

const CORES_ORIGEM = { maquininhas: '#2f7d32', dinheiro: '#c9a227', ifood: '#d8362b' };

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

export default function PainelDRE() {
  const [fechamentos, setFechamentos] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [repasses, setRepasses] = useState([]);
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
    fetch(`/api/ifood?inicio=${inicio}&fim=${fim}`)
      .then((r) => r.json())
      .then((r) => setRepasses(Array.isArray(r) ? r : []))
      .catch(() => setRepasses([]));
  }, [inicio, fim]);

  const ultimaData = useMemo(
    () => (fechamentos.length ? fechamentos.reduce((a, f) => (f.data > a ? f.data : a), fechamentos[0].data) : null),
    [fechamentos]
  );

  // Data real, não a do último fechamento (ver PainelReceitas).
  function presetHoje() { const h = hojeISO(); setInicio(h); setFim(h); }
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
    const receitaCaixa = fechDoPeriodo.reduce((s, f) => s + receitaDoDia(f), 0);
    // Repasse do iFood não passa pelo caixa/maquininha — reconhecido como
    // receita no dia que o valor líquido efetivamente caiu na conta.
    const receitaIfood = repasses.reduce((s, r) => s + n(r.valorRecebido), 0);
    const receita = receitaCaixa + receitaIfood;
    const despesaTotal = despesas.reduce((s, d) => s + n(d.valor), 0);
    // Separado por canal, pra montar a barra de origem do dinheiro.
    const receitaMaquininhas = fechDoPeriodo.reduce((s, f) => s + totalMaquininhas(f), 0);
    const receitaDinheiro = fechDoPeriodo.reduce((s, f) => s + entradaDinheiro(f), 0);
    return {
      dias: fechDoPeriodo.length, receita, receitaCaixa, receitaIfood,
      receitaMaquininhas, receitaDinheiro,
      despesaTotal, resultado: receita - despesaTotal,
    };
  }, [fechamentos, despesas, repasses, inicio, fim]);

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

  const origemDados = [
    { label: 'Maquininhas', valor: resumo?.receitaMaquininhas || 0, cor: CORES_ORIGEM.maquininhas },
    { label: 'Dinheiro no caixa', valor: resumo?.receitaDinheiro || 0, cor: CORES_ORIGEM.dinheiro },
    { label: 'Repasse do iFood', valor: resumo?.receitaIfood || 0, cor: CORES_ORIGEM.ifood },
  ].filter((d) => d.valor > 0);
  const origemTotal = origemDados.reduce((s, d) => s + d.valor, 0);

  return (
    <div className="painel__sub">
      <div className="painel__topo">
        <div className="filtro">
          <div className="filtro__presets">
            <button type="button" onClick={presetHoje}>Hoje</button>
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
        <Kpi titulo="Receita" valor={formatarBRL(resumo?.receita || 0)} rodape="dinheiro que entrou no período" principal />
        <Kpi titulo="Despesas" valor={formatarBRL(resumo?.despesaTotal || 0)} rodape={`${despesas.length} lançamento(s)`} />
        <Kpi
          titulo="Resultado"
          valor={formatarBRL(resumo?.resultado || 0)}
          rodape={resumo?.resultado < 0 ? 'prejuízo no período' : resumo?.resultado > 0 ? 'lucro no período' : 'zerado'}
          cor={resumo?.resultado < 0 ? 'neg' : 'zero'}
        />
      </div>

      <section className="cartao">
        <h2>De onde veio o dinheiro</h2>
        {origemDados.length ? (
          <div className="composicao">
            <div className="composicao__barra">
              {origemDados.map((d) => (
                <span key={d.label} title={`${d.label} — ${formatarBRL(d.valor)}`}
                  style={{ width: `${(d.valor / origemTotal) * 100}%`, background: d.cor }} />
              ))}
            </div>
            <ul className="legenda">
              {origemDados.map((d) => (
                <li key={d.label}>
                  <span className="legenda__cor" style={{ background: d.cor }} />
                  <span className="legenda__lbl">{d.label}</span>
                  <span className="legenda__val">
                    {formatarBRL(d.valor)} · {Math.round((d.valor / origemTotal) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : <p className="painel__vazio">Nada recebido no período.</p>}
      </section>

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
