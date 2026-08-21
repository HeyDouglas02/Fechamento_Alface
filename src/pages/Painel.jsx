// Painel — casca com 3 sub-abas: Receitas (faturamento, gráficos de venda),
// Despesas (por categoria, maiores gastos, fornecedores) e DRE (Receita ×
// Despesa × Resultado). Cada sub-aba busca seus próprios dados e mantém seu
// próprio filtro de período — são visões independentes, só compartilham o
// espaço de navegação e o CSS (Painel.css).

import { useState } from 'react';
import PainelReceitas from './PainelReceitas';
import PainelDespesas from './PainelDespesas';
import PainelDRE from './PainelDRE';
import './Painel.css';

const SUBABAS = [
  { id: 'receitas', rotulo: 'Receitas' },
  { id: 'despesas', rotulo: 'Despesas' },
  { id: 'dre', rotulo: 'DRE' },
];

export default function Painel() {
  const [sub, setSub] = useState('receitas');

  return (
    <div className="painel">
      <div className="painel__cabecalho">
        <h1>Painel</h1>
        <nav className="painel__subabas">
          {SUBABAS.map((s) => (
            <button
              key={s.id}
              className={sub === s.id ? 'ativo' : ''}
              onClick={() => setSub(s.id)}
            >
              {s.rotulo}
            </button>
          ))}
        </nav>
      </div>

      {sub === 'receitas' && <PainelReceitas />}
      {sub === 'despesas' && <PainelDespesas />}
      {sub === 'dre' && <PainelDRE />}
    </div>
  );
}
