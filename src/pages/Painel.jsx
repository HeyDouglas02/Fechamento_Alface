// Painel — visão gerencial (dashboard) a partir dos fechamentos já registrados.
// Tudo é agregado no cliente a partir de /api/fechamentos e /api/pendencias —
// nenhum dado novo é necessário. O "nº de vendas" (quando preenchido) destrava o
// ticket médio. Gráficos são SVG/CSS próprios (sem biblioteca), nas cores da marca.

import { useEffect, useMemo, useState } from 'react';
import { formatarBRL, formatarData } from '../utils/formatacao';
import './Painel.css';

const n = (x) => Number(x) || 0;
const faturamento = (f) =>
  n(f.microvixCredito) + n(f.microvixDebito) + n(f.microvixVoucher) +
  n(f.microvixPix) + n(f.microvixDinheiro) + n(f.microvixAPrazo) + n(f.microvixIfood);

// Valor compacto para rótulos (1.234 -> "1,2k").
function compacto(v) {
  const a = Math.abs(v);
  if (a >= 1000) {
    const s = (v / 1000).toFixed(1).replace('.0', '').replace('.', ',');
    return `${s}k`;
  }
  return String(Math.round(v));
}

// Datas (ISO local, sem fuso).
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

const CORES_PAG = {
  credito: '#2f7d32', debito: '#43a83a', voucher: '#9fc23a', pix: '#2f9e9e', dinheiro: '#c9a227',
};

export default function Painel() {
  const [fechamentos, setFechamentos] = useState([]);
  const [pendencias, setPendencias] = useState([]);
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/fechamentos').then((r) => r.json()),
      fetch('/api/pendencias?status=aberta').then((r) => r.json()),
    ])
      .then(([fs, ps]) => {
        const lista = Array.isArray(fs) ? fs : [];
        setFechamentos(lista);
        setPendencias(Array.isArray(ps) ? ps : []);
        // Período padrão = mês do fechamento mais recente.
        if (lista.length) {
          const ultima = lista.reduce((a, f) => (f.data > a ? f.data : a), lista[0].data);
          setInicio(primeiroDiaMes(ultima));
          setFim(ultimoDiaMes(ultima));
        }
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  // Data mais recente nos dados (base para os atalhos).
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

  // Soma o faturamento de um intervalo [a, b].
  const fatNoPeriodo = (a, b) =>
    fechamentos.filter((f) => f.data >= a && f.data <= b).reduce((s, f) => s + faturamento(f), 0);

  const resumo = useMemo(() => {
    if (!inicio || !fim) return null;
    const lista = fechamentos
      .filter((f) => f.data >= inicio && f.data <= fim)
      .sort((a, b) => (a.data < b.data ? -1 : 1));

    const fatTotal = lista.reduce((s, f) => s + faturamento(f), 0);
    const totalVendas = lista.reduce((s, f) => s + n(f.numeroVendas), 0);
    const difCaixa = lista.reduce((s, f) => s + n(f.diferencaDinheiro) + n(f.diferencaCartaoPix), 0);
    const recebido = lista.reduce((s, f) => s + n(f.totalRealMaquininhas) + n(f.microvixDinheiro), 0);

    const comp = { credito: 0, debito: 0, voucher: 0, pix: 0, dinheiro: 0 };
    let aPrazo = 0, ifood = 0;
    for (const f of lista) {
      comp.credito += n(f.microvixCredito); comp.debito += n(f.microvixDebito);
      comp.voucher += n(f.microvixVoucher); comp.pix += n(f.microvixPix);
      comp.dinheiro += n(f.microvixDinheiro);
      aPrazo += n(f.microvixAPrazo); ifood += n(f.microvixIfood);
    }

    // Comparativo: período anterior de mesma duração, imediatamente antes.
    const durDias = Math.round((new Date(fim) - new Date(inicio)) / 86400000) + 1;
    const prevFim = addDias(inicio, -1);
    const prevIni = addDias(prevFim, -(durDias - 1));
    const fatAnt = fatNoPeriodo(prevIni, prevFim);
    const variacao = fatAnt > 0 ? ((fatTotal - fatAnt) / fatAnt) * 100 : null;

    return {
      lista, fatTotal, totalVendas,
      ticketMedio: totalVendas > 0 ? fatTotal / totalVendas : null,
      mediaDiaria: lista.length ? fatTotal / lista.length : 0,
      dias: lista.length, difCaixa, recebido, comp, aPrazo, ifood, variacao,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechamentos, inicio, fim]);

  const pendTotal = pendencias.reduce((s, p) => s + n(p.valor), 0);

  if (carregando) {
    return <div className="painel"><h1>Painel</h1><p className="painel__vazio">Carregando…</p></div>;
  }
  if (!fechamentos.length) {
    return (
      <div className="painel">
        <h1>Painel</h1>
        <p className="painel__vazio">
          Ainda não há fechamentos registrados. Assim que você fechar alguns dias,
          os indicadores e gráficos aparecem aqui.
        </p>
      </div>
    );
  }

  const compDados = [
    { label: 'Crédito', valor: resumo?.comp.credito || 0, cor: CORES_PAG.credito },
    { label: 'Débito', valor: resumo?.comp.debito || 0, cor: CORES_PAG.debito },
    { label: 'Voucher', valor: resumo?.comp.voucher || 0, cor: CORES_PAG.voucher },
    { label: 'Pix', valor: resumo?.comp.pix || 0, cor: CORES_PAG.pix },
    { label: 'Dinheiro', valor: resumo?.comp.dinheiro || 0, cor: CORES_PAG.dinheiro },
  ].filter((d) => d.valor > 0);
  const compTotal = compDados.reduce((s, d) => s + d.valor, 0);

  return (
    <div className="painel">
      <div className="painel__topo">
        <h1>Painel</h1>
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

      {/* Cartões de indicadores */}
      <div className="kpis">
        <Kpi titulo="Faturamento" valor={formatarBRL(resumo?.fatTotal || 0)}
          rodape={`média ${formatarBRL(resumo?.mediaDiaria || 0)}/dia${resumo?.variacao != null ? ` · ${resumo.variacao >= 0 ? '+' : ''}${resumo.variacao.toFixed(1)}% vs período anterior` : ''}`}
          principal />
        <Kpi titulo="Ticket médio"
          valor={resumo?.ticketMedio != null ? formatarBRL(resumo.ticketMedio) : '—'}
          rodape={resumo?.ticketMedio != null ? `${resumo.totalVendas} venda(s)` : 'Preencha o nº de vendas no fechamento'} />
        <Kpi titulo="Diferença de caixa" valor={formatarBRL(resumo?.difCaixa || 0)}
          rodape={resumo?.difCaixa < 0 ? 'faltou no período' : resumo?.difCaixa > 0 ? 'sobrou no período' : 'tudo certo'}
          cor={resumo?.difCaixa < 0 ? 'neg' : resumo?.difCaixa > 0 ? 'pos' : 'zero'} />
        <Kpi titulo="Pendências em aberto" valor={formatarBRL(pendTotal)}
          rodape={`${pendencias.length} pendência(s) a receber`} />
      </div>

      {/* Faturamento por dia */}
      <section className="cartao">
        <h2>Faturamento por dia</h2>
        {resumo?.lista.length ? (
          <Barras dados={resumo.lista.map((f) => ({
            label: f.data.slice(8, 10), valor: faturamento(f),
            titulo: `${formatarData(f.data)} — ${formatarBRL(faturamento(f))}`,
          }))} />
        ) : <p className="painel__vazio">Sem fechamentos neste período.</p>}
      </section>

      <div className="painel__colunas">
        {/* Composição de pagamentos */}
        <section className="cartao">
          <h2>Composição de pagamentos</h2>
          {compDados.length ? (
            <div className="composicao">
              <div className="composicao__barra">
                {compDados.map((d) => (
                  <span key={d.label} title={`${d.label} — ${formatarBRL(d.valor)}`}
                    style={{ width: `${(d.valor / compTotal) * 100}%`, background: d.cor }} />
                ))}
              </div>
              <ul className="legenda">
                {compDados.map((d) => (
                  <li key={d.label}>
                    <span className="legenda__cor" style={{ background: d.cor }} />
                    <span className="legenda__lbl">{d.label}</span>
                    <span className="legenda__val">
                      {formatarBRL(d.valor)} · {Math.round((d.valor / compTotal) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="painel__vazio">Sem valores no período.</p>}
        </section>

        {/* Diferença de caixa por dia */}
        <section className="cartao">
          <h2>Diferença de caixa por dia</h2>
          {resumo?.lista.length ? (
            <Divergentes dados={resumo.lista.map((f) => ({
              label: f.data.slice(8, 10), valor: n(f.diferencaDinheiro) + n(f.diferencaCartaoPix),
              titulo: `${formatarData(f.data)} — ${formatarBRL(n(f.diferencaDinheiro) + n(f.diferencaCartaoPix))}`,
            }))} />
          ) : <p className="painel__vazio">Sem fechamentos neste período.</p>}
          <p className="painel__legenda-mini">
            <span className="ponto pos" /> sobrou &nbsp; <span className="ponto neg" /> faltou
          </p>
        </section>
      </div>

      {/* Registros e pendências */}
      <div className="painel__colunas">
        <section className="cartao">
          <h2>Registros do período</h2>
          <dl className="lista-stats">
            <div><dt>Recebido (maquininhas + dinheiro)</dt><dd>{formatarBRL(resumo?.recebido || 0)}</dd></div>
            <div><dt>A prazo (a receber)</dt><dd>{formatarBRL(resumo?.aPrazo || 0)}</dd></div>
            <div><dt>iFood (repasse futuro)</dt><dd>{formatarBRL(resumo?.ifood || 0)}</dd></div>
            <div><dt>Nº de vendas</dt><dd>{resumo?.totalVendas || '—'}</dd></div>
          </dl>
        </section>

        <section className="cartao">
          <h2>Pendências em aberto</h2>
          {pendencias.length ? (
            <ul className="pend-lista">
              {pendencias.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <span>{p.descricao}</span>
                  <em>aberta {formatarData(p.dataAbertura)}</em>
                  <strong>{formatarBRL(p.valor)}</strong>
                </li>
              ))}
            </ul>
          ) : <p className="painel__vazio">Nenhuma pendência em aberto.</p>}
        </section>
      </div>
    </div>
  );
}

/* ---------- Componentes visuais ---------- */

function Kpi({ titulo, valor, rodape, cor, principal }) {
  return (
    <div className={`kpi${principal ? ' kpi--principal' : ''}`}>
      <span className="kpi__titulo">{titulo}</span>
      <strong className={`kpi__valor${cor ? ` kpi__valor--${cor}` : ''}`}>{valor}</strong>
      <span className="kpi__rodape">{rodape}</span>
    </div>
  );
}

function Barras({ dados }) {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  return (
    <div className="barras">
      {dados.map((d, i) => (
        <div className="barras__col" key={i} title={d.titulo}>
          <span className="barras__valor">{d.valor > 0 ? compacto(d.valor) : ''}</span>
          <div className="barras__zona">
            <div className="barras__barra" style={{ height: `${(d.valor / max) * 100}%` }} />
          </div>
          <span className="barras__lbl">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function Divergentes({ dados }) {
  const max = Math.max(...dados.map((d) => Math.abs(d.valor)), 1);
  return (
    <div className="diverg">
      {dados.map((d, i) => {
        const h = (Math.abs(d.valor) / max) * 50;
        const pos = d.valor >= 0;
        return (
          <div className="diverg__col" key={i} title={d.titulo}>
            <span className={`diverg__valor ${pos ? 'pos' : 'neg'}`}>
              {d.valor !== 0 ? compacto(d.valor) : ''}
            </span>
            <div className="diverg__zona">
              <div className={`diverg__barra ${pos ? 'pos' : 'neg'}`}
                style={pos ? { bottom: '50%', height: `${h}%` } : { top: '50%', height: `${h}%` }} />
              <div className="diverg__base" />
            </div>
            <span className="diverg__lbl">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}
