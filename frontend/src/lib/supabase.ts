import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config, isSupabaseConfigured } from '../config';

/** Bucket privado de Storage donde se guardan los documentos (ver backend/supabase). */
export const EVIDENCE_BUCKET = 'evidencias';

/** Segundos de validez de las URLs firmadas que abre el verificador. */
export const SIGNED_URL_SECONDS = 300;

// La identidad es la cuenta de Freighter: no usamos el login de Supabase.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export function db(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase no está configurado: revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.');
  }
  return supabase;
}

/** Lanza el error de Supabase con un mensaje legible. */
export function check<T>(result: { data: T; error: { message: string } | null }, action: string): T {
  if (result.error) throw new Error(`${action}: ${result.error.message}`);
  return result.data;
}
