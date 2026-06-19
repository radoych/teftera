/** Map a Supabase auth/RPC error to a Bulgarian, user-facing message. */
export function mapAuthError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const m = raw.toLowerCase();

  if (m.includes('invalid login credentials')) return 'Грешен имейл или парола.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Вече има акаунт с този имейл.';
  if (m.includes('password should be at least')) return 'Паролата трябва да е поне 6 символа.';
  if (m.includes('invalid email') || m.includes('unable to validate email'))
    return 'Невалиден имейл адрес.';
  if (m.includes('invite') || m.includes('invalid invite code')) return 'Невалиден код за покана.';
  if (m.includes('network') || m.includes('failed to fetch'))
    return 'Няма връзка. Провери интернета си.';
  return 'Нещо се обърка. Опитай пак.';
}
