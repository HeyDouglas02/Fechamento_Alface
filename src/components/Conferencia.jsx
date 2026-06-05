// Conferencia — bloco que mostra o resultado de uma conferência em tempo real.
//
// Recebe linhas (rótulo + valor), um resultado em destaque (com sinal colorido)
// e um alerta opcional. Não calcula nada: só apresenta o que calculos.js retorna.

import { formatarBRL } from '../utils/formatacao';

export default function Conferencia({ titulo, linhas = [], resultado, alerta }) {
  const valor = Number(resultado?.valor) || 0;
  const sinal = valor < 0 ? 'neg' : valor > 0 ? 'pos' : 'zero';

  return (
    <div className="conferencia">
      <h3 className="conferencia__titulo">{titulo}</h3>
      <table className="conferencia__tabela">
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              <td>{l.label}</td>
              <td className="conferencia__valor">{formatarBRL(l.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {resultado && (
        <div className={`conferencia__resultado conferencia__resultado--${sinal}`}>
          <span>{resultado.label}</span>
          <strong>{formatarBRL(valor)}</strong>
        </div>
      )}
      {alerta && <p className="conferencia__alerta">{alerta}</p>}
    </div>
  );
}
