/**
 * Supabase client — single source of truth. Import `supabase` everywhere;
 * never call createClient elsewhere.
 *
 * Auth session is persisted in AsyncStorage so login survives app restarts.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** True only when both env vars are present — screens can gate live calls on this. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured && __DEV__) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / ANON_KEY are not set. ' +
      'Auth and data calls will fail until you fill in .env.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
