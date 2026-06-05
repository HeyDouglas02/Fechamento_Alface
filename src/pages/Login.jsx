// Login — entrada do operador. Registra quem fez o fechamento. No primeiro uso
// (nenhum usuário cadastrado), oferece criar o primeiro operador.

import { useEffect, useState } from 'react';
import logo from '../assets/logo.jpg';
import './Login.css';

export default function Login({ onEntrar }) {
  const [primeiroUso, setPrimeiroUso] = useState(null); // null = ainda carregando
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // Descobre se já existe algum usuário (define login x criar primeiro).
  useEffect(() => {
    fetch('/api/usuarios')
      .then((r) => r.json())
      .then((lista) => setPrimeiroUso(lista.length === 0))
      .catch(() => setErro('Não foi possível conectar ao servidor.'));
  }, []);

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    if (!nome.trim() || !senha) {
      setErro('Preencha usuário e senha.');
      return;
    }
    setOcupado(true);
    try {
      if (primeiroUso) {
        // Cria o primeiro operador e já entra.
        const res = await fetch('/api/usuarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome, senha }),
        });
        if (!res.ok) throw new Error((await res.json()).erro || 'Erro ao criar usuário.');
        onEntrar(await res.json());
      } else {
        const res = await fetch('/api/usuarios/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome, senha }),
        });
        if (!res.ok) throw new Error((await res.json()).erro || 'Falha no login.');
        onEntrar(await res.json());
      }
    } catch (err) {
      setErro(err.message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="login">
      <form className="login__caixa" onSubmit={enviar}>
        <img className="login__logo" src={logo} alt="Alface Melancia & Cia." />
        <h1>Fechamento de Caixa</h1>
        <p className="login__sub">
          {primeiroUso ? 'Crie o primeiro operador para começar.' : 'Entre com seu usuário.'}
        </p>

        <label className="login__campo">
          <span>Usuário</span>
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        </label>
        <label className="login__campo">
          <span>Senha</span>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </label>

        {erro && <p className="login__erro">{erro}</p>}

        <button type="submit" disabled={ocupado || primeiroUso === null}>
          {primeiroUso ? 'Criar e entrar' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
