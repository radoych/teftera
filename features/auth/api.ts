// features/auth/api.ts
import { supabase } from '@/services/supabase';
import { mapAuthError } from './errors';

export interface AuthResult {
  error: string | null;
}

export async function signUpWithPassword(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResult> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  return { error: error ? mapAuthError(error) : null };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error ? mapAuthError(error) : null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
