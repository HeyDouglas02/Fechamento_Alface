// Configuracoes — edita o limite de diferença de moeda. É a linha única de
// configuração (estado atual). Gestão de operadores e de categorias/
// fornecedores de despesa também fica aqui.

import { useEffect, useState } from 'react';
import './Configuracoes.css';

const CAMPOS_NUM = [
  ['limiteDiferencaMoeda', 'Limite de diferença de moeda (R$)'],
];

export default function Configuracoes() {
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  // Sistema (atualização + backup).
  const [versao, setVersao] = useState(null);
  const [carregandoVersao, setCarregandoVersao] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [logAtualizacao, setLogAtualizacao] = useState([]);
  const [statusBackup, setStatusBackup] = useState(null);
  const [carregandoBackup, setCarregandoBackup] = useState(true);

  // Usuários (operadores).
  const [usuarios, setUsuarios] = useState([]);
  const [novoUsuario, setNovoUsuario] = useState({ nome: '', senha: '' });
  const [msgUsuario, setMsgUsuario] = useState('');

  // Categorias e fornecedores de despesa (módulo Contas).
  const [categorias, setCategorias] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [novaCategoria, setNovaCategoria] = useState({ nome: '', ehFornecedor: false });
  const [novoFornecedor, setNovoFornecedor] = useState('');
  const [editandoCategoria, setEditandoCategoria] = useState(null);
  const [editandoFornecedor, setEditandoFornecedor] = useState(null);
  const [msgDespesas, setMsgDespesas] = useState('');

  useEffect(() => {
    fetch('/api/configuracoes')
      .then((r) => r.json())
      .then(setForm)
      .catch(() => setMensagem('Não foi possível carregar as configurações.'));
    carregarUsuarios();
    carregarCategoriasFornecedores();
    carregarVersao();
    carregarStatusBackup();
  }, []);

  function carregarVersao() {
    setCarregandoVersao(true);
    fetch('/api/sistema/versao')
      .then((r) => r.json())
      .then(setVersao)
      .catch(() => setVersao(null))
      .finally(() => setCarregandoVersao(false));
  }

  function carregarStatusBackup() {
    setCarregandoBackup(true);
    fetch('/api/sistema/google/status')
      .then((r) => r.json())
      .then(setStatusBackup)
      .catch(() => setStatusBackup(null))
      .finally(() => setCarregandoBackup(false));
  }

  async function atualizarSistema() {
    if (!window.confirm('Isso vai baixar a versão mais recente e reiniciar o sistema. Continuar?')) return;
    setAtualizando(true);
    setLogAtualizacao([]);

    try {
      const res = await fetch('/api/sistema/atualizar', { method: 'POST' });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sucesso = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const texto = decoder.decode(value, { stream: true });
        const linhas = texto.split('\n').filter(Boolean);
        for (const linha of linhas) {
          if (linha === 'SUCCESS') {
            sucesso = true;
            continue;
          }
          setLogAtualizacao((log) => [...log, linha]);
        }
      }

      if (sucesso) {
        aguardarReinicio();
      } else {
        setAtualizando(false);
      }
    } catch {
      // Conexão caiu — provavelmente o servidor já reiniciou.
      aguardarReinicio();
    }
  }

  function aguardarReinicio() {
    setLogAtualizacao((log) => [...log, 'Aguardando servidor voltar…']);
    const intervalo = setInterval(async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          clearInterval(intervalo);
          window.location.reload();
        }
      } catch {
        // Servidor ainda reiniciando — tenta de novo.
      }
    }, 1000);
  }

  async function conectarGoogleDrive() {
    try {
      const res = await fetch('/api/sistema/google/auth-url');
      const { authUrl } = await res.json();
      window.open(authUrl, '_blank');
    } catch {
      setStatusBackup((s) => ({ ...s, erro: 'Não foi possível gerar o link de conexão.' }));
    }
  }

  async function fazerBackupAgora() {
    setCarregandoBackup(true);
    try {
      const res = await fetch('/api/sistema/google/backup-agora', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).erro || 'Erro ao fazer backup.');
      carregarStatusBackup();
    } catch (err) {
      setCarregandoBackup(false);
      alert(err.message);
    }
  }

  function carregarUsuarios() {
    fetch('/api/usuarios')
      .then((r) => r.json())
      .then(setUsuarios)
      .catch(() => setUsuarios([]));
  }

  function carregarCategoriasFornecedores() {
    fetch('/api/despesas/categorias')
      .then((r) => r.json())
      .then((c) => setCategorias(Array.isArray(c) ? c : []))
      .catch(() => setCategorias([]));
    fetch('/api/despesas/fornecedores')
      .then((r) => r.json())
      .then((f) => setFornecedores(Array.isArray(f) ? f : []))
      .catch(() => setFornecedores([]));
  }

  async function adicionarCategoria(e) {
    e.preventDefault();
    setMsgDespesas('');
    if (!novaCategoria.nome.trim()) return;
    try {
      const res = await fetch('/api/despesas/categorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novaCategoria.nome.trim(), ehFornecedor: novaCategoria.ehFornecedor }),
      });
      if (!res.ok) throw new Error((await res.json()).erro || 'Erro ao cadastrar categoria.');
      setNovaCategoria({ nome: '', ehFornecedor: false });
      carregarCategoriasFornecedores();
    } catch (err) {
      setMsgDespesas(err.message);
    }
  }

  async function salvarCategoria() {
    if (!editandoCategoria?.nome.trim()) return;
    try {
      const res = await fetch(`/api/despesas/categorias/${editandoCategoria.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: editandoCategoria.nome.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).erro || 'Erro ao renomear categoria.');
      setEditandoCategoria(null);
      carregarCategoriasFornecedores();
    } catch (err) {
      setMsgDespesas(err.message);
    }
  }

  async function excluirCategoria(id, nome) {
    if (!window.confirm(`Excluir a categoria "${nome}"? Essa ação não pode ser desfeita.`)) return;
    setMsgDespesas('');
    try {
      const res = await fetch(`/api/despesas/categorias/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).erro || 'Erro ao excluir categoria.');
      carregarCategoriasFornecedores();
    } catch (err) {
      setMsgDespesas(err.message);
    }
  }

  async function adicionarFornecedor(e) {
    e.preventDefault();
    setMsgDespesas('');
    if (!novoFornecedor.trim()) return;
    try {
      const res = await fetch('/api/despesas/fornecedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoFornecedor.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).erro || 'Erro ao cadastrar fornecedor.');
      setNovoFornecedor('');
      carregarCategoriasFornecedores();
    } catch (err) {
      setMsgDespesas(err.message);
    }
  }

  async function salvarFornecedor() {
    if (!editandoFornecedor?.nome.trim()) return;
    try {
      const res = await fetch(`/api/despesas/fornecedores/${editandoFornecedor.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: editandoFornecedor.nome.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).erro || 'Erro ao renomear fornecedor.');
      setEditandoFornecedor(null);
      carregarCategoriasFornecedores();
    } catch (err) {
      setMsgDespesas(err.message);
    }
  }

  async function excluirFornecedor(id, nome) {
    if (!window.confirm(`Excluir o fornecedor "${nome}"? Essa ação não pode ser desfeita.`)) return;
    setMsgDespesas('');
    try {
      const res = await fetch(`/api/despesas/fornecedores/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).erro || 'Erro ao excluir fornecedor.');
      carregarCategoriasFornecedores();
    } catch (err) {
      setMsgDespesas(err.message);
    }
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

  async function removerUsuario(id, nome) {
    if (!window.confirm(`Remover o operador "${nome}"? Essa ação não pode ser desfeita.`)) return;
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

      <section className="secao">
        <h2>Sistema</h2>

        <div className="config-sistema-linha">
          <div>
            <h3 className="config-subtitulo">Atualização</h3>
            {carregandoVersao ? (
              <p className="config-aviso">Verificando versão…</p>
            ) : versao ? (
              <p className="config-aviso">
                Versão atual: <strong>{versao.commit}</strong> ({versao.data})
                {versao.temAtualizacao && <span className="config-badge">Atualização disponível</span>}
              </p>
            ) : (
              <p className="config-aviso">Não foi possível verificar a versão.</p>
            )}
            <button type="button" onClick={atualizarSistema} disabled={atualizando}>
              {atualizando ? 'Atualizando…' : 'Atualizar agora'}
            </button>

            {logAtualizacao.length > 0 && (
              <pre className="config-log">{logAtualizacao.join('\n')}</pre>
            )}
          </div>

          <div>
            <h3 className="config-subtitulo">Backup (Google Drive)</h3>
            {carregandoBackup ? (
              <p className="config-aviso">Verificando status…</p>
            ) : statusBackup?.conectado ? (
              <p className="config-aviso">
                Conectado. Último backup:{' '}
                <strong>{statusBackup.ultimoBackup || 'ainda não houve'}</strong>
              </p>
            ) : (
              <p className="config-aviso">Google Drive não conectado.</p>
            )}

            {statusBackup?.conectado ? (
              <button type="button" onClick={fazerBackupAgora} disabled={carregandoBackup}>
                Fazer backup agora
              </button>
            ) : (
              <button type="button" onClick={conectarGoogleDrive}>
                Conectar Google Drive
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="secao">
        <h2>Categorias e fornecedores de despesa</h2>
        <p className="config-aviso" style={{ marginTop: 0, marginBottom: '0.9rem' }}>
          Usados no lançamento de despesas, em Contas. Categoria "exige fornecedor" pede
          um fornecedor específico na hora do lançamento (pra ranking no DRE).
        </p>

        <div className="config-colunas">
          <div>
            <h3 className="config-subtitulo">Fornecedores</h3>
            {fornecedores.length === 0 ? (
              <p className="config-aviso">Nenhum fornecedor cadastrado.</p>
            ) : (
              <ul className="usuarios-lista">
                {fornecedores.map((f) => (
                  <li key={f.id}>
                    {editandoFornecedor?.id === f.id ? (
                      <>
                        <input
                          type="text"
                          value={editandoFornecedor.nome}
                          onChange={(e) => setEditandoFornecedor((ed) => ({ ...ed, nome: e.target.value }))}
                        />
                        <button type="button" onClick={salvarFornecedor}>Salvar</button>
                        <button type="button" onClick={() => setEditandoFornecedor(null)}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <span>{f.nome}</span>
                        <button type="button" onClick={() => setEditandoFornecedor({ id: f.id, nome: f.nome })} title="Editar">✎</button>
                        <button type="button" onClick={() => excluirFornecedor(f.id, f.nome)} title="Excluir">✕</button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <form className="usuario-form" onSubmit={adicionarFornecedor}>
              <input
                type="text"
                placeholder="Novo fornecedor"
                value={novoFornecedor}
                onChange={(e) => setNovoFornecedor(e.target.value)}
              />
              <button type="submit">+ Adicionar</button>
            </form>
          </div>

          <div>
            <h3 className="config-subtitulo">Categorias</h3>
            {categorias.length === 0 ? (
              <p className="config-aviso">Nenhuma categoria cadastrada.</p>
            ) : (
              <ul className="usuarios-lista">
                {categorias.map((c) => (
                  <li key={c.id}>
                    {editandoCategoria?.id === c.id ? (
                      <>
                        <input
                          type="text"
                          value={editandoCategoria.nome}
                          onChange={(e) => setEditandoCategoria((ed) => ({ ...ed, nome: e.target.value }))}
                        />
                        <button type="button" onClick={salvarCategoria}>Salvar</button>
                        <button type="button" onClick={() => setEditandoCategoria(null)}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <span>{c.nome}{c.ehFornecedor ? ' (exige fornecedor)' : ''}</span>
                        <button type="button" onClick={() => setEditandoCategoria({ id: c.id, nome: c.nome })} title="Editar">✎</button>
                        <button type="button" onClick={() => excluirCategoria(c.id, c.nome)} title="Excluir">✕</button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <form className="usuario-form" onSubmit={adicionarCategoria}>
              <input
                type="text"
                placeholder="Nova categoria"
                value={novaCategoria.nome}
                onChange={(e) => setNovaCategoria((c) => ({ ...c, nome: e.target.value }))}
              />
              <label className="config-checkbox">
                <input
                  type="checkbox"
                  checked={novaCategoria.ehFornecedor}
                  onChange={(e) => setNovaCategoria((c) => ({ ...c, ehFornecedor: e.target.checked }))}
                />
                Exige fornecedor
              </label>
              <button type="submit">+ Adicionar</button>
            </form>
          </div>
        </div>

        {msgDespesas && <p className="config-aviso">{msgDespesas}</p>}
      </section>

      <form onSubmit={salvar}>
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
                  onClick={() => removerUsuario(u.id, u.nome)}
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
