// RelatorioImpressao — mostra o relatório do fechamento numa pré-visualização e
// permite imprimir na térmica (Elgin i9) via window.print(). O CSS de impressão
// (em RelatorioImpressao.css) esconde o resto da página e imprime só o <pre>.

import { createPortal } from 'react-dom';
import './RelatorioImpressao.css';

export default function RelatorioImpressao({ texto, onFechar }) {
  if (!texto) return null;

  // Renderiza no <body> (fora do #root) para que, na impressão, dê para esconder
  // todo o app (#root) e sair APENAS o relatório — sem páginas em branco.
  return createPortal(
    <div className="relatorio-overlay" onClick={onFechar}>
      <div className="relatorio-modal" onClick={(e) => e.stopPropagation()}>
        <div className="relatorio-acoes no-print">
          <button type="button" className="primario" onClick={() => window.print()}>
            Imprimir
          </button>
          <button type="button" onClick={onFechar}>Fechar</button>
        </div>
        <pre className="relatorio-print">{texto}</pre>
      </div>
    </div>,
    document.body
  );
}
