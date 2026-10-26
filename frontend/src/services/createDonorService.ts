import { config, isSupabaseConfigured } from '../config';
import * as stellar from '../lib/stellar';
import { db } from '../lib/supabase';
import { createChainDonorService } from './chainDonorService';
import { createMockDonorService, type DonorService } from './donorService';
import { createSupabaseStore } from './scholarshipStore';

/**
 * Hay contrato real si están configurados el hash del WASM (VITE_WASM_HASH) y
 * Supabase. Si falta algo, la pantalla del donante sigue con datos simulados.
 */
export function isChainConfigured(): boolean {
  return /^[0-9a-f]{64}$/.test(config.wasmHash) && isSupabaseConfigured;
}

export type DonorServiceMode = 'chain' | 'mock';

export function donorServiceMode(): DonorServiceMode {
  return isChainConfigured() ? 'chain' : 'mock';
}

export function createDonorService(): DonorService {
  if (!isChainConfigured()) return createMockDonorService();
  return createChainDonorService({
    chain: stellar,
    store: createSupabaseStore(db()),
    // El contrato no valida el token: mientras no haya lista blanca on-chain, solo USDCDEMO.
    allowedTokens: [config.tokenId],
  });
}
