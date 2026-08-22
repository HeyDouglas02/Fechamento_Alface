// iFood — repasses. Dinheiro não passa pelo caixa/maquininha: o iFood retém
// taxa e deposita o líquido periodicamente. Aqui registra o RECEBIMENTO
// (data + valor líquido — é o que entra na Receita do DRE); o período
// coberto só cruza com o "iFood (só registro)" dos fechamentos daquele
// intervalo pra mostrar a taxa retida, sem afetar o valor reconhecido.

import { useEffect, useMemo, useState } from 'react';
import CampoValor from '../components/CampoValor';
import { formatarBRL, formatarData, hojeISO } from '../utils/formatacao';
import './IFood.css';

const n = (x) => Number(x) || 0;

const REPASSE_VAZIO = { dataRepasse: hojeISO(), periodoInicio: '', periodoFim: '', valorRecebido: 0, observacoes: '' };

export default function IFood() {
  const [repasses, setRepasses] = useState([]);
  const [fechamentos, setFechamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState('');

  const [form, setForm] = useState(REPASSE_VAZIO);
  const [editando, setEditando] = useState(null);

  function carregarTudo() {
    setCarregando(true);
    Promise.all([
      fetch('/api/ifood').then((r) => r.json()),
      fetch('/api/fechamentos').then((r) => r.json()),
    ])
      .then(([reps, fechs]) => {
        setRepasses(Array.isArray(reps) ? reps : []);
        setFechamentos(Array.isArray(fechs) ? fechs : []);
      })
      .catch(() => setMensagem('Não foi possível carregar os repasses.'))
      .finally(() => setCarregando(false));
  }

  useEffect(() => { carregarTudo(); }, []);

  // Vendido bruto (Microvix iFood) no período coberto por cada repasse — só
  // pra mostrar a taxa retida, não afeta a Receita reconhecida.
  function vendidoBrutoNoPeriodo(inicio, fim) {
    return fechamentos
      .filter((f) => f.data >= inicio && f.data <= fim)
      .reduce((s, f) => s + n(f.microvixIfood), 0);
  }

  async function registrarRepasse(e) {
    e.preventDefault();
    setMensagem('');
    if (!form.periodoInicio || !form.periodoFim) { setMensagem('Informe o período coberto.'); return; }
    if (form.periodoInicio > form.periodoFim) { setMensagem('O início do período não pode ser depois do fim.'); return; }
    if (!Number(form.valorRecebido) || Number(form.valorRecebido) <= 0) { setMensagem('Informe o valor recebido.'); return; }
    try {
      const res = await fetch('/api/ifood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).erro || 'Erro ao registrar o repasse.');
      setForm(REPASSE_VAZIO);
      setMensagem('Repasse registrado.');
      carregarTudo();
    } catch (err) {
      setMensagem(err.message);
    }
  }

  function iniciarEdicao(r) {
    setEditando({
      id: r.id,
      dataRepasse: r.dataRepasse,
      periodoInicio: r.periodoInicio,
      periodoFim: r.periodoFim,
      valorRecebido: r.valorRecebido,
      observacoes: r.observacoes ?? '',
    });
  }

  async function salvarEdicao(e) {
    e.preventDefault();
    setMensagem('');
    if (editando.periodoInicio > editando.periodoFim) { setMensagem('O início do período não pode ser depois do fim.'); return; }
    if (!Number(editando.valorRecebido) || Number(editando.valorRecebido) <= 0) { setMensagem('Informe o valor recebido.'); return; }
    try {
      const res = await fetch(`/api/ifood/${editando.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editando),
      });
      if (!res.ok) throw new Error((await res.json()).erro || 'Erro ao salvar o repasse.');
      setEditando(null);
      carregarTudo();
    } catch (err) {
      setMensagem(err.message);
    }
  }

  async function excluirRepasse(id, rotulo) {
    if (!window.confirm(`Excluir o repasse "${rotulo}"? Essa ação não pode ser desfeita.`)) return;
    try {
      const res = await fetch(`/api/ifood/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      carregarTudo();
    } catch {
      setMensagem('Erro ao excluir o repasse.');
    }
  }

  const totalRecebido = useMemo(() => repasses.reduce((s, r) => s + n(r.valorRecebido), 0), [repasses]);

  if (carregando) {
    return <div className="ifood"><h1>iFood</h1><p>Carregando…</p></div>;
  }

  return (
    <div className="ifood">
      <h1>iFood</h1>
      {mensagem && <p className="ifood__mensagem">{mensagem}</p>}

      <section className="secao">
        <h2>Registrar repasse</h2>
        <p className="config-aviso" style={{ marginTop: 0 }}>
          A venda já está em "iFood (só registro)" no Microvix, no dia dela. Aqui só se registra o
          <strong> recebimento</strong> — quando o valor líquido cai na conta.
        </p>
        <form className="ifood__form" onSubmit={registrarRepasse}>
          <label className="config-campo">
            <span>Data do repasse (recebimento)</span>
            <input
              type="date"
              value={form.dataRepasse}
              onChange={(e) => setForm((f) => ({ ...f, dataRepasse: e.target.value }))}
            />
          </label>

          <div className="ifood__periodo">
            <label className="config-campo">
              <span>Período coberto — de</span>
              <input
                type="date"
                value={form.periodoInicio}
                onChange={(e) => setForm((f) => ({ ...f, periodoInicio: e.target.value }))}
              />
            </label>
            <label className="config-campo">
              <span>até</span>
              <input
                type="date"
                value={form.periodoFim}
                onChange={(e) => setForm((f) => ({ ...f, periodoFim: e.target.value }))}
              />
            </label>
          </div>

          <CampoValor
            id="ifood-valor"
            label="Valor recebido (líquido)"
            value={form.valorRecebido}
            onChange={(v) => setForm((f) => ({ ...f, valorRecebido: v }))}
          />

          <label className="config-campo">
            <span>Observações (opcional)</span>
            <input
              type="text"
              value={form.observacoes}
              onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
            />
          </label>

          <button type="submit" className="config-salvar">Registrar repasse</button>
        </form>
      </section>

      <section className="secao">
        <div className="ifood__lista-cabecalho">
          <h2>Repasses recebidos</h2>
          <strong>{formatarBRL(totalRecebido)}</strong>
        </div>

        {repasses.length === 0 ? (
          <p className="config-aviso">Nenhum repasse registrado ainda.</p>
        ) : (
          <table className="ifood__tabela">
            <thead>
              <tr>
                <th>Recebido em</th>
                <th>Período coberto</th>
                <th>Vendido bruto (Microvix)</th>
                <th>Recebido (líquido)</th>
                <th>Taxa retida</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {repasses.map((r) => {
                if (editando?.id === r.id) {
                  return (
                    <tr key={r.id}>
                      <td colSpan={6}>
                        <form className="ifood__edicao" onSubmit={salvarEdicao}>
                          <input
                            type="date"
                            value={editando.dataRepasse}
                            onChange={(e) => setEditando((ed) => ({ ...ed, dataRepasse: e.target.value }))}
                          />
                          <input
                            type="date"
                            value={editando.periodoInicio}
                            onChange={(e) => setEditando((ed) => ({ ...ed, periodoInicio: e.target.value }))}
                          />
                          <input
                            type="date"
                            value={editando.periodoFim}
                            onChange={(e) => setEditando((ed) => ({ ...ed, periodoFim: e.target.value }))}
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Valor"
                            value={editando.valorRecebido}
                            onChange={(e) => setEditando((ed) => ({ ...ed, valorRecebido: e.target.value }))}
                          />
                          <input
                            type="text"
                            placeholder="Observações"
                            value={editando.observacoes}
                            onChange={(e) => setEditando((ed) => ({ ...ed, observacoes: e.target.value }))}
                          />
                          <button type="submit">Salvar</button>
                          <button type="button" onClick={() => setEditando(null)}>Cancelar</button>
                        </form>
                      </td>
                    </tr>
                  );
                }

                const bruto = vendidoBrutoNoPeriodo(r.periodoInicio, r.periodoFim);
                const taxa = bruto > 0 ? ((bruto - n(r.valorRecebido)) / bruto) * 100 : null;

                return (
                  <tr key={r.id}>
                    <td>{formatarData(r.dataRepasse)}</td>
                    <td>{formatarData(r.periodoInicio)} a {formatarData(r.periodoFim)}</td>
                    <td className="num">{formatarBRL(bruto)}</td>
                    <td className="num">{formatarBRL(r.valorRecebido)}</td>
                    <td className="num">{taxa === null ? '—' : `${taxa.toFixed(1)}%`}</td>
                    <td>
                      <button type="button" onClick={() => iniciarEdicao(r)} title="Editar">✎</button>
                      <button
                        type="button"
                        onClick={() => excluirRepasse(r.id, formatarData(r.dataRepasse))}
                        title="Excluir"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
