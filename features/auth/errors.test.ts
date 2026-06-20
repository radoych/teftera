import { mapAuthError } from './errors';

describe('mapAuthError', () => {
  it('maps invalid credentials', () => {
    expect(mapAuthError(new Error('Invalid login credentials'))).toBe('Грешен имейл или парола.');
  });
  it('maps already-registered', () => {
    expect(mapAuthError(new Error('User already registered'))).toBe('Вече има акаунт с този имейл.');
  });
  it('maps invalid invite code', () => {
    expect(mapAuthError(new Error('invalid invite code'))).toBe('Невалиден код за покана.');
  });
  it('falls back to a generic message', () => {
    expect(mapAuthError(new Error('some unknown thing'))).toBe('Нещо се обърка. Опитай пак.');
    expect(mapAuthError(null)).toBe('Нещо се обърка. Опитай пак.');
  });
});
