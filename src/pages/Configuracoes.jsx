// Configuracoes — edita os nomes das máquinas e o limite de diferença de moeda.
// É a linha única de configuração (estado atual). A gestão de operadores também
// fica aqui.

import { useEffect, useState } from 'react';
import './Configuracoes.css';

const CAMPOS_TEXTO = [
  ['nomeMaquina1', 'Nome da máquina 1'],
  ['nomeMaquina2', 'Nome da máquina 2'],
  ['nomeMaquina3', 'Nome da máquina 3'],
  ['nomeMaquina4', 'Nome da máquina 4'],
];

const CAMPOS_NUM = [
  ['limiteDiferencaMoeda', 'Limite de diferença de moeda (R$)'],
];

export default function Configuracoes() {
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  // Usuários (operadores).
  const [usuarios, setUsuarios] = useState([]);
  const [novoUsuario, setNovoUsuario] = useState({ nome: '', senha: '' });
  const [msgUsuario, setMsgUsuario] = useState('');

  useEffect(() => {
    fetch('/api/configuracoes')
      .then((r) => r.json())
      .then(setForm)
      .catch(() => setMensagem('Não foi possível carregar as configurações.'));
    carregarUsuarios();
  }, []);

  function carregarUsuarios() {
    fetch('/api/usuarios')
      .then((r) => r.json())
      .then(setUsuarios)
      .catch(() => setUsuarios([]));
  }

  async function adicionarUsuario(e) {
    e.preventDefault();
    setMsgUsuario('');
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novoUsuario),
      });
      if (!res.ok) throw new Error((await res.json()).erro || 'Erro ao adicionar.');
      setNovoUsuario({ nome: '', senha: '' });
      setMsgUsuario('Operador adicionado.');
      carregarUsuarios();
    } catch (err) {
      setMsgUsuario(err.message);
    }
  }

  async function removerUsuario(id) {
    setMsgUsuario('');
    try {
      const res = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao remover.');
      carregarUsuarios();
    } catch (err) {
      setMsgUsuario(err.message);
    }
  }

  function setCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setMensagem('');
    try {
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      const salvo = await res.json();
      setForm(salvo);
      setMensagem('Configurações salvas.');
    } catch {
      setMensagem('Erro ao salvar as configurações.');
    } finally {
      setSalvando(false);
    }
  }

  if (!form) {
    return (
      <div className="configuracoes">
        <h1>Configurações</h1>
        <p>{mensagem || 'Carregando…'}</p>
      </div>
    );
  }

  return (
    <div className="configuracoes">
      <h1>Configurações</h1>

      {mensagem && <p className="configuracoes__mensagem">{mensagem}</p>}

      <form onSubmit={salvar}>
        <section className="secao">
          <h2>Nomes das máquinas</h2>
          {CAMPOS_TEXTO.map(([campo, rotulo]) => (
            <label className="config-campo" key={campo}>
              <span>{rotulo}</span>
              <input
                type="text"
                value={form[campo] ?? ''}
                onChange={(e) => setCampo(campo, e.target.value)}
              />
            </label>
          ))}
        </section>

        <section className="secao">
          <h2>Valores</h2>
          {CAMPOS_NUM.map(([campo, rotulo]) => (
            <label className="config-campo" key={campo}>
              <span>{rotulo}</span>
              <input
                type="number"
                step="0.01"
                value={form[campo] ?? 0}
                onChange={(e) => setCampo(campo, e.target.value)}
              />
            </label>
          ))}
          <p className="config-aviso">
            Diferenças de dinheiro abaixo desse limite são tratadas como provável troco
            em moeda.
          </p>
        </section>

        <button type="submit" className="config-salvar" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar configurações'}
        </button>
      </form>

      <section className="secao">
        <h2>Operadores</h2>

        {usuarios.length === 0 ? (
          <p className="config-aviso">Nenhum operador cadastrado.</p>
        ) : (
          <ul className="usuarios-lista">
            {usuarios.map((u) => (
              <li key={u.id}>
                <span>{u.nome}</span>
                <button
                  type="button"
                  onClick={() => removerUsuario(u.id)}
                  disabled={usuarios.length === 1}
                  title={usuarios.length === 1 ? 'Não é possível remover o único operador' : 'Remover'}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}

        <form className="usuario-form" onSubmit={adicionarUsuario}>
          <input
            type="text"
            placeholder="Nome do operador"
            value={novoUsuario.nome}
            onChange={(e) => setNovoUsuario((u) => ({ ...u, nome: e.target.value }))}
          />
          <input
            type="password"
            placeholder="Senha"
            value={novoUsuario.senha}
            onChange={(e) => setNovoUsuario((u) => ({ ...u, senha: e.target.value }))}
          />
          <button type="submit">+ Adicionar</button>
        </form>

        {msgUsuario && <p className="config-aviso">{msgUsuario}</p>}
      </section>
    </div>
  );
}
