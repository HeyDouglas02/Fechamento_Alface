// Historico — lista os fechamentos por data com status e diferenças. Clicando
// numa linha, abre o detalhe (valores salvos + log de edições). Dá para abrir o
// dia na tela de Fechamento para editar (a edição de um dia fechado é registrada
// no log_edicoes pelo backend).

import { useEffect, useState } from 'react';
import { formatarData, formatarBRL } from '../utils/formatacao';
import './Historico.css';

// Linhas de valor mostradas no detalhe (rótulo + chave da API).
const LINHAS_DETALHE = [
  ['Microvix cartão/pix', 'totalMicrovixCartaoPix'],
  ['Real maquininhas', 'totalRealMaquininhas'],
  ['Diferença cartão/pix', 'diferencaCartaoPix'],
  ['Dinheiro esperado', 'dinheiroEsperado'],
  ['Diferença dinheiro', 'diferencaDinheiro'],
  ['Sangria caixa 1', 'sangriaCaixa1'],
  ['Sangria caixa 2', 'sangriaCaixa2'],
  ['Retirar caixa 1', 'retirarCaixa1'],
  ['Retirar caixa 2', 'retirarCaixa2'],
];

export default function Historico({ onAbrir }) {
  const [lista, setLista] = useState([]);
  const [detalhe, setDetalhe] = useState(null);
  const [log, setLog] = useState([]);

  useEffect(() => {
    fetch('/api/fechamentos')
      .then((r) => r.json())
      .then(setLista)
      .catch(() => setLista([]));
  }, []);

  function abrirDetalhe(f) {
    setDetalhe(f);
    fetch(`/api/fechamentos/${f.data}/log`)
      .then((r) => r.json())
      .then(setLog)
      .catch(() => setLog([]));
  }

  // Marca visual do status/diferença de cada fechamento.
  function rotuloStatus(f) {
    if (f.status === 'rascunho') return { texto: 'rascunho', cor: 'cinza' };
    const semDiferenca = Number(f.diferencaDinheiro) === 0 && Number(f.diferencaCartaoPix) === 0;
    return semDiferenca
      ? { texto: 'fechado', cor: 'verde' }
      : { texto: 'com diferença', cor: 'vermelho' };
  }

  return (
    <div className="historico">
      <h1>Histórico</h1>

      {lista.length === 0 && <p>Nenhum fechamento registrado ainda.</p>}

      <table className="historico__tabela">
        <thead>
          <tr>
            <th>Data</th>
            <th>Dia</th>
            <th>Dif. dinheiro</th>
            <th>Dif. cartão/pix</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((f) => {
            const s = rotuloStatus(f);
            return (
              <tr
                key={f.data}
                className={detalhe?.data === f.data ? 'selecionada' : ''}
                onClick={() => abrirDetalhe(f)}
              >
                <td>{formatarData(f.data)}</td>
                <td>{f.diaSemana}</td>
                <td className="num">{formatarBRL(f.diferencaDinheiro)}</td>
                <td className="num">{formatarBRL(f.diferencaCartaoPix)}</td>
                <td><span className={`tag tag--${s.cor}`}>{s.texto}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {detalhe && (
        <div className="detalhe">
          <div className="detalhe__cabecalho">
            <h2>{formatarData(detalhe.data)} — {detalhe.diaSemana}</h2>
            <div className="detalhe__acoes">
              <button type="button" onClick={() => onAbrir(detalhe.data)}>Editar este dia</button>
              <button type="button" onClick={() => setDetalhe(null)}>Fechar</button>
            </div>
          </div>

          <table className="detalhe__valores">
            <tbody>
              {LINHAS_DETALHE.map(([rotulo, chave]) => (
                <tr key={chave}>
                  <td>{rotulo}</td>
                  <td className="num">{formatarBRL(detalhe[chave])}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {detalhe.observacoes && (
            <p className="detalhe__obs"><strong>Observações:</strong> {detalhe.observacoes}</p>
          )}

          <h3>Edições registradas</h3>
          {log.length === 0 ? (
            <p className="detalhe__sem-log">Nenhuma edição após o fechamento.</p>
          ) : (
            <table className="detalhe__log">
              <thead>
                <tr><th>Quando</th><th>Campo</th><th>De</th><th>Para</th></tr>
              </thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id}>
                    <td>{l.alteradoEm}</td>
                    <td>{l.campo}</td>
                    <td className="num">{l.valorAnterior}</td>
                    <td className="num">{l.valorNovo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
