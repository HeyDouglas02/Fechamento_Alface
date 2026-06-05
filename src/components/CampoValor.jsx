// CampoValor — input de dinheiro formatado em R$.
//
// Mantém o valor numérico (em reais) no estado do pai e exibe formatado. A
// digitação é tratada como centavos: o usuário digita "1234" e vê "R$ 12,34",
// evitando problemas de cursor e de separadores.

import { formatarBRL } from '../utils/formatacao';

export default function CampoValor({ id, label, value, onChange, disabled }) {
  function handleChange(e) {
    const digitos = e.target.value.replace(/\D/g, '');
    const numero = digitos ? parseInt(digitos, 10) / 100 : 0;
    onChange(numero);
  }

  return (
    <label className="campo-valor" htmlFor={id}>
      <span className="campo-valor__label">{label}</span>
      <input
        id={id}
        className="campo-valor__input"
        inputMode="numeric"
        value={formatarBRL(value || 0)}
        onChange={handleChange}
        disabled={disabled}
      />
    </label>
  );
}
