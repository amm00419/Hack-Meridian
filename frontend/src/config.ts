import { Networks } from '@stellar/stellar-sdk';

export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',

  rpcUrl:
    import.meta.env.VITE_STELLAR_RPC_URL ??
    'https://soroban-testnet.stellar.org',

  networkPassphrase: Networks.TESTNET,

  explorerUrl: 'https://stellar.expert/explorer/testnet',

  contractId: import.meta.env.VITE_AIDRELEASE_CONTRACT_ID ?? '',

  tokenId:
    import.meta.env.VITE_STELLAR_TOKEN_ID ??
    'CDFEDKZ6LWUS5JSHOFM5XVKCD6ALYGVDMREZYTYAZNOAFGQ6FJMLRA7Y',

  wasmHash: import.meta.env.VITE_WASM_HASH ?? '',
};

export const isSupabaseConfigured = Boolean(
  config.supabaseUrl && config.supabaseAnonKey
);