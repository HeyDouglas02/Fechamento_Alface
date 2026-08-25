// Contas — lançamento de despesas (só para compor o DRE, sem vencimento/
// lembrete). Categoria e fornecedor são cadastros prévios (dropdown com
// opção de cadastrar na hora), pra não duplicar nome digitado diferente.
// Gestão completa de categorias/fornecedores (editar/excluir) fica em
// Configurações — aqui é só lançamento e consulta.

import { useEffect, useMemo, useState } from 'react';
import CampoValor from '../components/CampoValor';
import { formatarBRL, formatarData, hojeISO } from '../utils/formatacao';
import './Contas.css';

const DESPESA_VAZIA = { data: hojeISO(), categoriaId: '', fornecedorId: '', descricao: '', valor: 0 };

// Agrupa despesas por data (mais recente primeiro — API já vem ordenada assim).
function agruparPorDia(despesas) {
  const grupos = new Map();
  for (const d of despesas) {
    if (!grupos.has(d.data)) grupos.set(d.data, []);
    grupos.get(d.data).push(d);
  }
  return Array.from(grupos.entries());
}

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

export default function Contas() {
  const [categorias, setCategorias] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState('');

  const [form, setForm] = useState(DESPESA_VAZIA);
  const [novaCategoria, setNovaCategoria] = useState({ nome: '', ehFornecedor: false });
  const [novoFornecedor, setNovoFornecedor] = useState('');
  const [mostrarNovaCategoria, setMostrarNovaCategoria] = useState(false);
  const [mostrarNovoFornecedor, setMostrarNovoFornecedor] = useState(false);

  // Edição inline de uma despesa já lançada: { id, data, categoriaId, fornecedorId, descricao, valor }.
  const [editandoDespesa, setEditandoDespesa] = useState(null);

  // Filtro de período da lista (padrão: mês atual). Evita rolar tudo desde sempre.
  const hoje = hojeISO();
  const [inicio, setInicio] = useState(primeiroDiaMes(hoje));
  const [fim, setFim] = useState(ultimoDiaMes(hoje));

  function carregarDespesas() {
    fetch(`/api/despesas?inicio=${inicio}&fim=${fim}`)
      .then((r) => r.json())
      .then((desp) => setDespesas(Array.isArray(desp) ? desp : []))
      .catch(() => setMensagem('Não foi possível carregar as despesas.'));
  }

  function carregarTudo() {
    setCarregando(true);
    Promise.all([
      fetch('/api/despesas/categorias').then((r) => r.json()),
      fetch('/api/despesas/fornecedores').then((r) => r.json()),
      fetch(`/api/despesas?inicio=${inicio}&fim=${fim}`).then((r) => r.json()),
    ])
      .then(([cats, forns, desp]) => {
        setCategorias(Array.isArray(cats) ? cats : []);
        setFornecedores(Array.isArray(forns) ? forns : []);
        setDespesas(Array.isArray(desp) ? desp : []);
      })
      .catch(() => setMensagem('Não foi possível carregar os dados.'))
      .finally(() => setCarregando(false));
  }

  // Carga inicial, uma vez só.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregarTudo(); }, []);
  // Recarrega a lista quando o período muda (a carga inicial já traz tudo).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!carregando) carregarDespesas(); }, [inicio, fim]);

  const categoriaAtual = categorias.find((c) => String(c.id) === String(form.categoriaId));

  async function adicionarCategoria(e) {
    e.preventDefault();
    if (!novaCategoria.nome.trim()) return;
    try {
      const res = await fetch('/api/despesas/categorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novaCategoria.nome.trim(), ehFornecedor: novaCategoria.ehFornecedor }),
      });
      if (!res.ok) throw new Error((await res.json()).erro || 'Erro ao cadastrar categoria.');
      const criada = await res.json();
      setCategorias((c) => [...c, criada].sort((a, b) => a.nome.localeCompare(b.nome)));
      setForm((f) => ({ ...f, categoriaId: criada.id }));
      setNovaCategoria({ nome: '', ehFornecedor: false });
      setMostrarNovaCategoria(false);
    } catch (err) {
      setMensagem(err.message);
    }
  }

  async function adicionarFornecedor(e) {
    e.preventDefault();
    if (!novoFornecedor.trim()) return;
    try {
      const res = await fetch('/api/despesas/fornecedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoFornecedor.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).erro || 'Erro ao cadastrar fornecedor.');
      const criado = await res.json();
      setFornecedores((f) => [...f, criado].sort((a, b) => a.nome.localeCompare(b.nome)));
      setForm((f) => ({ ...f, fornecedorId: criado.id }));
      setNovoFornecedor('');
      setMostrarNovoFornecedor(false);
    } catch (err) {
      setMensagem(err.message);
    }
  }

  async function lancarDespesa(e) {
    e.preventDefault();
    setMensagem('');
    if (!form.categoriaId) { setMensagem('Selecione a categoria.'); return; }
    if (categoriaAtual?.ehFornecedor && !form.fornecedorId) {
      setMensagem('Essa categoria exige um fornecedor.');
      return;
    }
    if (!Number(form.valor) || Number(form.valor) <= 0) { setMensagem('Informe o valor.'); return; }
    try {
      const res = await fetch('/api/despesas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, fornecedorId: categoriaAtual?.ehFornecedor ? form.fornecedorId : null }),
      });
      if (!res.ok) throw new Error((await res.json()).erro || 'Erro ao lançar despesa.');
      setForm({ ...DESPESA_VAZIA, categoriaId: form.categoriaId });
      setMensagem('Despesa lançada.');
      carregarDespesas();
    } catch (err) {
      setMensagem(err.message);
    }
  }

  function iniciarEdicaoDespesa(d) {
    setEditandoDespesa({
      id: d.id,
      data: d.data,
      categoriaId: d.categoriaId,
      fornecedorId: d.fornecedorId ?? '',
      descricao: d.descricao ?? '',
      valor: d.valor,
    });
  }

  async function salvarEdicaoDespesa(e) {
    e.preventDefault();
    setMensagem('');
    const categoria = categorias.find((c) => String(c.id) === String(editandoDespesa.categoriaId));
    if (!editandoDespesa.categoriaId) { setMensagem('Selecione a categoria.'); return; }
    if (categoria?.ehFornecedor && !editandoDespesa.fornecedorId) {
      setMensagem('Essa categoria exige um fornecedor.');
      return;
    }
    if (!Number(editandoDespesa.valor) || Number(editandoDespesa.valor) <= 0) { setMensagem('Informe o valor.'); return; }
    try {
      const res = await fetch(`/api/despesas/${editandoDespesa.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editandoDespesa,
          fornecedorId: categoria?.ehFornecedor ? editandoDespesa.fornecedorId : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).erro || 'Erro ao salvar a despesa.');
      setEditandoDespesa(null);
      carregarDespesas();
    } catch (err) {
      setMensagem(err.message);
    }
  }

  async function excluirDespesa(id, rotulo) {
    if (!window.confirm(`Excluir a despesa "${rotulo}"? Essa ação não pode ser desfeita.`)) return;
    try {
      const res = await fetch(`/api/despesas/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      carregarDespesas();
    } catch {
      setMensagem('Erro ao excluir a despesa.');
    }
  }

  const despesasPorDia = useMemo(() => agruparPorDia(despesas), [despesas]);

  if (carregando) {
    return <div className="contas"><h1>Contas</h1><p>Carregando…</p></div>;
  }

  return (
    <div className="contas">
      <h1>Contas</h1>
      {mensagem && <p className="contas__mensagem">{mensagem}</p>}

      <section className="secao">
        <h2>Lançar despesa</h2>
        <form className="contas__form" onSubmit={lancarDespesa}>
          <label className="config-campo">
            <span>Data</span>
            <input
              type="date"
              value={form.data}
              onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
            />
          </label>

          <label className="config-campo">
            <span>Categoria</span>
            <select
              value={form.categoriaId}
              onChange={(e) => setForm((f) => ({ ...f, categoriaId: e.target.value, fornecedorId: '' }))}
            >
              <option value="">Selecione…</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            {!mostrarNovaCategoria && (
              <button type="button" className="contas__link" onClick={() => setMostrarNovaCategoria(true)}>
                + nova categoria
              </button>
            )}
          </label>

          {mostrarNovaCategoria && (
            <div className="contas__inline-form">
              <input
                type="text"
                placeholder="Nome da categoria"
                value={novaCategoria.nome}
                onChange={(e) => setNovaCategoria((c) => ({ ...c, nome: e.target.value }))}
              />
              <label className="contas__checkbox">
                <input
                  type="checkbox"
                  checked={novaCategoria.ehFornecedor}
                  onChange={(e) => setNovaCategoria((c) => ({ ...c, ehFornecedor: e.target.checked }))}
                />
                Exige fornecedor
              </label>
              <button type="button" onClick={adicionarCategoria}>Cadastrar</button>
              <button type="button" onClick={() => setMostrarNovaCategoria(false)}>Cancelar</button>
            </div>
          )}

          {categoriaAtual?.ehFornecedor && (
            <label className="config-campo">
              <span>Fornecedor</span>
              <select
                value={form.fornecedorId}
                onChange={(e) => setForm((f) => ({ ...f, fornecedorId: e.target.value }))}
              >
                <option value="">Selecione…</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
              {!mostrarNovoFornecedor && (
                <button type="button" className="contas__link" onClick={() => setMostrarNovoFornecedor(true)}>
                  + novo fornecedor
                </button>
              )}
            </label>
          )}

          {mostrarNovoFornecedor && (
            <div className="contas__inline-form">
              <input
                type="text"
                placeholder="Nome do fornecedor"
                value={novoFornecedor}
                onChange={(e) => setNovoFornecedor(e.target.value)}
              />
              <button type="button" onClick={adicionarFornecedor}>Cadastrar</button>
              <button type="button" onClick={() => setMostrarNovoFornecedor(false)}>Cancelar</button>
            </div>
          )}

          <label className="config-campo">
            <span>Descrição (opcional)</span>
            <input
              type="text"
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            />
          </label>

          <CampoValor
            id="despesa-valor"
            label="Valor"
            value={form.valor}
            onChange={(v) => setForm((f) => ({ ...f, valor: v }))}
          />

          <button type="submit" className="config-salvar">Lançar despesa</button>
        </form>
      </section>

      <section className="secao">
        <div className="contas__lista-cabecalho">
          <h2>Despesas lançadas</h2>
          <div className="contas__filtro">
            <button type="button" onClick={() => { setInicio(primeiroDiaMes(hoje)); setFim(ultimoDiaMes(hoje)); }}>
              Mês atual
            </button>
            <button type="button" onClick={() => { const p = mesAnteriorDe(hoje); setInicio(p); setFim(ultimoDiaMes(p)); }}>
              Mês anterior
            </button>
            <label>De <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
            <label>Até <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></label>
          </div>
        </div>
        {despesasPorDia.length === 0 ? (
          <p className="config-aviso">Nenhuma despesa lançada nesse período.</p>
        ) : (
          despesasPorDia.map(([data, doDia]) => {
            const totalDia = doDia.reduce((s, d) => s + (Number(d.valor) || 0), 0);
            return (
              <div className="contas__dia" key={data}>
                <div className="contas__dia-cabecalho">
                  <h3>{formatarData(data)}</h3>
                  <strong>{formatarBRL(totalDia)}</strong>
                </div>
                <table className="contas__tabela">
                  <thead>
                    <tr>
                      <th>Categoria</th>
                      <th>Fornecedor</th>
                      <th>Descrição</th>
                      <th>Valor</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {doDia.map((d) => {
                      if (editandoDespesa?.id === d.id) {
                        const categoriaDaEdicao = categorias.find((c) => String(c.id) === String(editandoDespesa.categoriaId));
                        return (
                          <tr key={d.id}>
                            <td colSpan={5}>
                              <form className="contas__edicao" onSubmit={salvarEdicaoDespesa}>
                                <input
                                  type="date"
                                  value={editandoDespesa.data}
                                  onChange={(e) => setEditandoDespesa((ed) => ({ ...ed, data: e.target.value }))}
                                />
                                <select
                                  value={editandoDespesa.categoriaId}
                                  onChange={(e) => setEditandoDespesa((ed) => ({ ...ed, categoriaId: e.target.value, fornecedorId: '' }))}
                                >
                                  {categorias.map((c) => (
                                    <option key={c.id} value={c.id}>{c.nome}</option>
                                  ))}
                                </select>
                                {categoriaDaEdicao?.ehFornecedor && (
                                  <select
                                    value={editandoDespesa.fornecedorId}
                                    onChange={(e) => setEditandoDespesa((ed) => ({ ...ed, fornecedorId: e.target.value }))}
                                  >
                                    <option value="">Fornecedor…</option>
                                    {fornecedores.map((f) => (
                                      <option key={f.id} value={f.id}>{f.nome}</option>
                                    ))}
                                  </select>
                                )}
                                <input
                                  type="text"
                                  placeholder="Descrição"
                                  value={editandoDespesa.descricao}
                                  onChange={(e) => setEditandoDespesa((ed) => ({ ...ed, descricao: e.target.value }))}
                                />
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="Valor"
                                  value={editandoDespesa.valor}
                                  onChange={(e) => setEditandoDespesa((ed) => ({ ...ed, valor: e.target.value }))}
                                />
                                <button type="submit">Salvar</button>
                                <button type="button" onClick={() => setEditandoDespesa(null)}>Cancelar</button>
                              </form>
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={d.id}>
                          <td>{d.categoriaNome}</td>
                          <td>{d.fornecedorNome || '—'}</td>
                          <td>{d.descricao || '—'}</td>
                          <td className="num">{formatarBRL(d.valor)}</td>
                          <td>
                            <button type="button" onClick={() => iniciarEdicaoDespesa(d)} title="Editar">✎</button>
                            <button
                              type="button"
                              onClick={() => excluirDespesa(d.id, d.descricao || d.categoriaNome)}
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
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
