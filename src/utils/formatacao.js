// formatacao.js — formatação de moeda e datas (camada de apresentação).
// ESM, usado só no frontend. A lógica financeira fica em calculos.js.

// Formata um número como moeda brasileira: 1234.5 -> "R$ 1.234,50".
export function formatarBRL(valor) {
  const v = Number(valor) || 0;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Formata a data ISO (AAAA-MM-DD) para o padrão brasileiro (DD/MM/AAAA).
export function formatarData(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

// Data de hoje em ISO local (AAAA-MM-DD), sem deslocamento de fuso.
export function hojeISO() {
  return new Date().toLocaleDateString('en-CA'); // en-CA usa o formato AAAA-MM-DD
}
