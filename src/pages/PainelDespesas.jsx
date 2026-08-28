// Painel — Despesas: visão gerencial das despesas lançadas em Contas. Por
// categoria, maiores gastos e fornecedores mais pagos. Sub-aba de Painel —
// CSS compartilhado em Painel.css, importado pela casca (Painel.jsx).

import { useEffect, useMemo, useState } from 'react';
import { formatarBRL, formatarData, hojeISO } from '../utils/formatacao';

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

const PALETA = ['#2f7d32', '#43a83a', '#9fc23a', '#2f9e9e', '#c9a227', '#b7791f', '#d8362b', '#5b6672'];

export default function PainelDespesas() {
  const hoje = hojeISO();
  // Carrega TODAS as despesas uma vez e filtra o período no cliente — mesmo
  // padrão das outras sub-abas. Filtrar na API deixava o "Tudo" preso: ele só
  // enxergava as despesas já carregadas, então nunca expandia o período.
  const [todas, setTodas] = useState([]);
  const [inicio, setInicio] = useState(primeiroDiaMes(hoje));
  const [fim, setFim] = useState(ultimoDiaMes(hoje));
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch('/api/despesas')
      .then((r) => r.json())
      .then((d) => setTodas(Array.isArray(d) ? d : []))
      .catch(() => setTodas([]))
      .finally(() => setCarregando(false));
  }, []);

  const despesas = useMemo(
    () => todas.filter((d) => d.data >= inicio && d.data <= fim),
    [todas, inicio, fim]
  );

  function presetHoje() { setInicio(hoje); setFim(hoje); }
  function presetMesAtual() { setInicio(primeiroDiaMes(hoje)); setFim(ultimoDiaMes(hoje)); }
  function presetMesAnterior() { const p = mesAnteriorDe(hoje); setInicio(p); setFim(ultimoDiaMes(p)); }
  function presetUltimos7() { setInicio(addDias(hoje, -6)); setFim(hoje); }
  function presetTudo() {
    if (!todas.length) return;
    const datas = todas.map((d) => d.data);
    setInicio(datas.reduce((a, d) => (d < a ? d : a)));
    setFim(datas.reduce((a, d) => (d > a ? d : a)));
  }

  const resumo = useMemo(() => {
    const total = despesas.reduce((s, d) => s + n(d.valor), 0);

    const porCategoria = new Map();
    for (const d of despesas) {
      const chave = d.categoriaNome || 'Sem categoria';
      porCategoria.set(chave, (porCategoria.get(chave) || 0) + n(d.valor));
    }
    const categorias = Array.from(porCategoria.entries())
      .map(([nome, valor], i) => ({ nome, valor, cor: PALETA[i % PALETA.length] }))
      .sort((a, b) => b.valor - a.valor);

    const porFornecedor = new Map();
    for (const d of despesas) {
      if (!d.fornecedorNome) continue;
      porFornecedor.set(d.fornecedorNome, (porFornecedor.get(d.fornecedorNome) || 0) + n(d.valor));
    }
    const fornecedores = Array.from(porFornecedor.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);

    const maioresGastos = [...despesas].sort((a, b) => n(b.valor) - n(a.valor)).slice(0, 8);

    return { total, categorias, fornecedores, maioresGastos };
  }, [despesas]);

  const categoriaTotal = resumo.categorias.reduce((s, c) => s + c.valor, 0);
  const categoriaTopo = resumo.categorias[0];

  if (carregando) {
    return <p className="painel__vazio">Carregando…</p>;
  }

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

      <p className="painel__periodo">
        Período: <strong>{formatarData(inicio)}</strong> a <strong>{formatarData(fim)}</strong>
        {` · ${despesas.length} lançamento(s)`}
      </p>

      <div className="kpis kpis--dre">
        <Kpi titulo="Total de despesas" valor={formatarBRL(resumo.total)} rodape={`${despesas.length} lançamento(s)`} principal />
        <Kpi titulo="Maior categoria" valor={categoriaTopo?.nome || '—'} rodape={categoriaTopo ? formatarBRL(categoriaTopo.valor) : 'sem despesas'} />
        <Kpi titulo="Fornecedores pagos" valor={String(resumo.fornecedores.length)} rodape="no período" />
      </div>

      <section className="cartao">
        <h2>Despesas por categoria</h2>
        {resumo.categorias.length ? (
          <div className="composicao">
            <div className="composicao__barra">
              {resumo.categorias.map((c) => (
                <span key={c.nome} title={`${c.nome} — ${formatarBRL(c.valor)}`}
                  style={{ width: `${(c.valor / categoriaTotal) * 100}%`, background: c.cor }} />
              ))}
            </div>
            <ul className="legenda">
              {resumo.categorias.map((c) => (
                <li key={c.nome}>
                  <span className="legenda__cor" style={{ background: c.cor }} />
                  <span className="legenda__lbl">{c.nome}</span>
                  <span className="legenda__val">
                    {formatarBRL(c.valor)} · {Math.round((c.valor / categoriaTotal) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : <p className="painel__vazio">Nenhuma despesa lançada nesse período.</p>}
      </section>

      <div className="painel__colunas">
        <section className="cartao">
          <h2>Maiores gastos</h2>
          {resumo.maioresGastos.length ? (
            <ul className="dre-lista">
              {resumo.maioresGastos.map((d) => (
                <li key={d.id}>
                  <span>{d.descricao || d.categoriaNome}</span>
                  <em>{formatarData(d.data)} · {d.categoriaNome}</em>
                  <strong>{formatarBRL(d.valor)}</strong>
                </li>
              ))}
            </ul>
          ) : <p className="painel__vazio">Sem despesas no período.</p>}
        </section>

        <section className="cartao">
          <h2>Fornecedores mais pagos</h2>
          {resumo.fornecedores.length ? (
            <ul className="dre-lista">
              {resumo.fornecedores.map((f) => (
                <li key={f.nome}>
                  <span>{f.nome}</span>
                  <strong>{formatarBRL(f.valor)}</strong>
                </li>
              ))}
            </ul>
          ) : <p className="painel__vazio">Nenhuma despesa com fornecedor nesse período.</p>}
        </section>
      </div>
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
