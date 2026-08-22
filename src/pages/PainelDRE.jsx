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
import { formatarBRL, formatarData } from '../utils/formatacao';
import { receitaDoDia } from '../utils/calculos';

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

export default function PainelDRE() {
  const [fechamentos, setFechamentos] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [repasses, setRepasses] = useState([]);
  const [aPrazoRecebimentos, setAPrazoRecebimentos] = useState([]);
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
    fetch('/api/a-prazo')
      .then((r) => r.json())
      .then((r) => setAPrazoRecebimentos(Array.isArray(r) ? r : []))
      .catch(() => setAPrazoRecebimentos([]));
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
    const receitaCaixa = fechDoPeriodo.reduce((s, f) => s + receitaDoDia(f), 0);
    // Repasse do iFood não passa pelo caixa/maquininha — reconhecido como
    // receita no dia que o valor líquido efetivamente caiu na conta.
    const receitaIfood = repasses.reduce((s, r) => s + n(r.valorRecebido), 0);
    const receita = receitaCaixa + receitaIfood;
    const despesaTotal = despesas.reduce((s, d) => s + n(d.valor), 0);
    // Só pra mostrar de onde veio — a prazo recebido já está DENTRO de
    // receitaCaixa (o dinheiro foi contado no caixa ou passou na maquininha).
    const receitaAPrazo = aPrazoRecebimentos
      .filter((r) => r.data >= inicio && r.data <= fim)
      .reduce((s, r) => s + n(r.valor), 0);
    return {
      dias: fechDoPeriodo.length, receita, receitaCaixa, receitaIfood, receitaAPrazo,
      despesaTotal, resultado: receita - despesaTotal,
    };
  }, [fechamentos, despesas, repasses, aPrazoRecebimentos, inicio, fim]);

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
        <Kpi titulo="Receita" valor={formatarBRL(resumo?.receita || 0)} rodape="regime de caixa" principal />
        <Kpi titulo="Despesas" valor={formatarBRL(resumo?.despesaTotal || 0)} rodape={`${despesas.length} lançamento(s)`} />
        <Kpi
          titulo="Resultado"
          valor={formatarBRL(resumo?.resultado || 0)}
          rodape={resumo?.resultado < 0 ? 'prejuízo no período' : resumo?.resultado > 0 ? 'lucro no período' : 'zerado'}
          cor={resumo?.resultado < 0 ? 'neg' : 'zero'}
        />
      </div>

      <section className="cartao">
        <h2>De onde veio a Receita</h2>
        <dl className="lista-stats">
          <div><dt>Maquininhas + dinheiro</dt><dd>{formatarBRL(resumo?.receitaCaixa || 0)}</dd></div>
          <div><dt>iFood recebido</dt><dd>{formatarBRL(resumo?.receitaIfood || 0)}</dd></div>
        </dl>
        <p className="painel__nota">
          A prazo recebido no período ({formatarBRL(resumo?.receitaAPrazo || 0)}) já está incluso em
          "Maquininhas + dinheiro" — o valor foi contado no caixa ou passou na maquininha no dia do recebimento.
        </p>
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
