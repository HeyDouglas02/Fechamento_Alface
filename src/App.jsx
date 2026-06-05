// App — autenticação + navegação entre telas. O operador logado fica no estado
// e é persistido em localStorage (para não exigir login a cada recarregamento da
// página). As telas: Fechamento, Histórico e Configurações; Login aparece quando
// não há operador logado.

import { useState } from 'react'
import Login from './pages/Login'
import Painel from './pages/Painel'
import Fechamento from './pages/Fechamento'
import Historico from './pages/Historico'
import Configuracoes from './pages/Configuracoes'
import logo from './assets/logo.jpg'
import './App.css'

const CHAVE_USUARIO = 'fechamento.usuario'

function App() {
  // Recupera o operador logado do localStorage (se houver).
  const [usuario, setUsuario] = useState(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_USUARIO)
      return salvo ? JSON.parse(salvo) : null
    } catch {
      return null
    }
  })
  const [tela, setTela] = useState('fechamento')
  // Dia que o Histórico pediu para abrir no Fechamento. O token força o
  // Fechamento a recarregar mesmo se a data pedida for a mesma de antes.
  const [alvo, setAlvo] = useState({ data: null, token: 0 })

  function entrar(u) {
    setUsuario(u)
    try { localStorage.setItem(CHAVE_USUARIO, JSON.stringify(u)) } catch { /* ignora */ }
  }

  function sair() {
    setUsuario(null)
    try { localStorage.removeItem(CHAVE_USUARIO) } catch { /* ignora */ }
    setTela('fechamento')
  }

  function abrirFechamento(data) {
    setAlvo((a) => ({ data, token: a.token + 1 }))
    setTela('fechamento')
  }

  if (!usuario) return <Login onEntrar={entrar} />

  const abas = [
    { id: 'painel', rotulo: 'Painel' },
    { id: 'fechamento', rotulo: 'Fechamento' },
    { id: 'historico', rotulo: 'Histórico' },
    { id: 'configuracoes', rotulo: 'Configurações' },
  ]

  return (
    <div className="app">
      <header className="topo">
        <div className="topo__marca">
          <img className="topo__logo-img" src={logo} alt="Alface Melancia & Cia." />
          <span className="topo__nome">Alface Melancia &amp; Cia.</span>
        </div>
        <nav className="topo__abas">
          {abas.map((a) => (
            <button
              key={a.id}
              className={tela === a.id ? 'ativo' : ''}
              onClick={() => setTela(a.id)}
            >
              {a.rotulo}
            </button>
          ))}
        </nav>
        <div className="topo__usuario">
          <span className="topo__avatar" aria-hidden="true">
            {usuario.nome.slice(0, 1).toUpperCase()}
          </span>
          <span className="topo__usuario-nome">{usuario.nome}</span>
          <button className="topo__sair" onClick={sair}>Sair</button>
        </div>
      </header>

      <main className="conteudo">
        {tela === 'painel' && <Painel />}
        {tela === 'fechamento' && (
          <Fechamento alvoData={alvo.data} alvoToken={alvo.token} usuario={usuario} />
        )}
        {tela === 'historico' && <Historico onAbrir={abrirFechamento} />}
        {tela === 'configuracoes' && <Configuracoes />}
      </main>
    </div>
  )
}

export default App
