import { useState, useEffect } from 'react';
import { TextInput } from 'react-native';

/** Interpret a raw digit string as euro cents and render "1234" -> "12,34". */
export function formatDigitsAsAmount(digits: string): string {
  const clean = digits.replace(/\D/g, '');
  if (clean === '') return '';
  const padded = clean.padStart(3, '0');
  const euros = String(Number(padded.slice(0, -2))); // strips leading zeros
  const cents = padded.slice(-2);
  return `${euros},${cents}`;
}

function centsToDigits(cents: number): string {
  return cents > 0 ? String(cents) : '';
}

interface AmountInputProps {
  valueCents: number;
  onChangeCents: (cents: number) => void;
  placeholder?: string;
}

export function AmountInput({ valueCents, onChangeCents, placeholder = '0,00' }: AmountInputProps) {
  const [digits, setDigits] = useState(centsToDigits(valueCents));

  // Re-sync if the parent resets the value (e.g. category switch).
  useEffect(() => {
    setDigits(centsToDigits(valueCents));
  }, [valueCents]);

  const handleChange = (text: string) => {
    const next = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    setDigits(next);
    onChangeCents(next === '' ? 0 : Number(next));
  };

  return (
    <TextInput
      value={formatDigitsAsAmount(digits)}
      onChangeText={handleChange}
      keyboardType="number-pad"
      placeholder={placeholder}
      placeholderTextColor="#8e909a"
      style={{ color: '#e3e2e6', fontSize: 16 }}
    />
  );
}
