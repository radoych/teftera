import { formatDigitsAsAmount } from './AmountInput';

describe('formatDigitsAsAmount', () => {
  it('returns empty string for no digits', () => {
    expect(formatDigitsAsAmount('')).toBe('');
  });
  it('pads to cents: "5" -> "0,05"', () => {
    expect(formatDigitsAsAmount('5')).toBe('0,05');
  });
  it('"50" -> "0,50"', () => {
    expect(formatDigitsAsAmount('50')).toBe('0,50');
  });
  it('"1234" -> "12,34"', () => {
    expect(formatDigitsAsAmount('1234')).toBe('12,34');
  });
  it('strips leading zeros on the euro part: "0200" -> "2,00"', () => {
    expect(formatDigitsAsAmount('0200')).toBe('2,00');
  });
  it('handles large values: "100000" -> "1000,00"', () => {
    expect(formatDigitsAsAmount('100000')).toBe('1000,00');
  });
});

// The screens pipe raw TextInput text through formatDigitsAsAmount on every
// keystroke; these pin the live-typing contract (digits shift through cents).
describe('formatDigitsAsAmount as a live text formatter', () => {
  it('is idempotent on its own output: "12,34" -> "12,34"', () => {
    expect(formatDigitsAsAmount('12,34')).toBe('12,34');
  });
  it('normalizes dot input: "12.34" -> "12,34"', () => {
    expect(formatDigitsAsAmount('12.34')).toBe('12,34');
  });
  it('appending a digit shifts cents left: "12,345" -> "123,45"', () => {
    expect(formatDigitsAsAmount('12,345')).toBe('123,45');
  });
  it('backspacing the last digit shifts right: "12,3" -> "1,23"', () => {
    expect(formatDigitsAsAmount('12,3')).toBe('1,23');
  });
});
