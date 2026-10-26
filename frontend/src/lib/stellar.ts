
// Conexión con Stellar Testnet: Freighter + Soroban RPC.
// Cada beca tiene su propio contrato.
// Lecturas: simulación sin firma.
// Escrituras: preparar -> firmar -> enviar -> confirmar.

import {
  getAddress as freighterGetAddress,
  getNetwork as freighterGetNetwork,
  isConnected as freighterIsConnected,
  requestAccess as freighterRequestAccess,
  signTransaction as freighterSignTransaction,
} from '@stellar/freighter-api';

import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

import { Buffer } from 'buffer';
import { config } from '../config';

import type {
  Milestone,
  MilestoneInput,
  MilestoneStatus,
  Scholarship,
  ScholarshipStatus,
} from '../domain/aidrelease';

import { toHex } from './evidence';

// ---------------------------------------------------------------------------
// Estados de una transacción
// ---------------------------------------------------------------------------

export type TxPhase =
  | 'idle'
  | 'signing'
  | 'sending'
  | 'confirmed'
  | 'error';

export interface TxState {
  phase: TxPhase;
  txHash?: string;
  message?: string;
}

export type OnTxPhase = (state: TxState) => void;

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

// Estos códigos pertenecen EXCLUSIVAMENTE al contrato AidRelease.
// No deben aplicarse automáticamente a errores de otros contratos,
// como el token USDCDEMO.

export const CONTRACT_ERRORS: Record<
  number,
  { name: string; message: string }
> = {
  1: {
    name: 'InvalidRoles',
    message:
      'Donante, estudiante y verificador deben ser tres direcciones distintas.',
  },
  2: {
    name: 'InvalidMilestones',
    message: 'La beca necesita entre 1 y 10 hitos.',
  },
  3: {
    name: 'InvalidAmount',
    message: 'Todos los importes deben ser mayores que 0.',
  },
  4: {
    name: 'InvalidDeadline',
    message: 'Las fechas deben ser crecientes y estar en el futuro.',
  },
  5: {
    name: 'AlreadyFunded',
    message: 'La beca ya estaba financiada.',
  },
  6: {
    name: 'NotFunded',
    message:
      'La beca todavía no está financiada: el donante debe financiarla antes.',
  },
  7: {
    name: 'InvalidMilestoneId',
    message: 'El hito no existe en el contrato.',
  },
  8: {
    name: 'WrongMilestoneOrder',
    message:
      'Los hitos se aprueban en orden: hay uno anterior pendiente.',
  },
  9: {
    name: 'MilestoneNotPending',
    message:
      'El hito ya no está pendiente (ya se pagó o se canceló).',
  },
  10: {
    name: 'MilestoneExpired',
    message:
      'El plazo del hito ya venció: no se puede aprobar.',
  },
  11: {
    name: 'ScholarshipClosed',
    message:
      'La beca ya está cerrada (completada o reembolsada).',
  },
  12: {
    name: 'RefundNotAvailable',
    message:
      'Todavía no se puede reembolsar: el siguiente hito no ha vencido.',
  },
  13: {
    name: 'ArithmeticOverflow',
    message:
      'La suma de los importes es demasiado grande.',
  },
  14: {
    name: 'InvalidToken',
    message: 'El token no es válido.',
  },
};

export class StellarError extends Error {
  code?: number;
  txHash?: string;

  constructor(
    message: string,
    code?: number,
    txHash?: string
  ) {
    super(message);
    this.name = 'StellarError';
    this.code = code;
    this.txHash = txHash;
  }
}

function errorText(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error
  ) {
    return String(error.message);
  }

  return JSON.stringify(error);
}

/**
 * Traduce errores de Stellar, Freighter y Soroban.
 *
 * Importante:
 * Error(Contract, #N) puede proceder de AidRelease
 * o de un contrato invocado, como USDCDEMO.
 */
export function toStellarError(
  error: unknown
): StellarError {
  if (error instanceof StellarError) {
    return error;
  }

  const text = errorText(error);

  // Primero: errores explícitos de trustline.
  if (
    /trustline|trust line|no trustline|not authorized|not authorised/i.test(
      text
    )
  ) {
    return new StellarError(
      'El destinatario no tiene una trustline autorizada para el activo. Comprueba USDCDEMO en Freighter.'
    );
  }

  // Segundo: problemas explícitos de saldo.
  if (
    /insufficient balance|insufficient funds|underfunded|balance too low/i.test(
      text
    )
  ) {
    return new StellarError(
      'Saldo insuficiente para completar la operación.'
    );
  }

  // Errores de autorización.
  if (
    /Error\(Auth|authorization failed|unauthorized/i.test(
      text
    )
  ) {
    return new StellarError(
      'La cuenta conectada no tiene permiso para esta operación.'
    );
  }

  // Operación cancelada en Freighter.
  if (/declined|rejected|denied/i.test(text)) {
    return new StellarError(
      'Has cancelado la operación en Freighter.'
    );
  }

  // Cuenta inexistente.
  if (/Account not found/i.test(text)) {
    return new StellarError(
      'La cuenta no existe en Testnet. Puedes financiarla con Friendbot: https://friendbot.stellar.org/'
    );
  }

  // Un código de contrato sin identificar su emisor
  // NO se puede interpretar con la tabla AidRelease.
  const contract = /Error\(Contract, #(\d+)\)/i.exec(
    text
  );

  if (contract) {
    const code = Number(contract[1]);

    if (code === 13) {
      return new StellarError(
        'Error de contrato #13. Puede proceder del token USDCDEMO; comprueba la trustline del destinatario, el saldo y los diagnósticos de la transacción.',
        code
      );
    }

    return new StellarError(
      `Error de contrato #${code}. Comprueba qué contrato lo emitió antes de interpretar su código.`,
      code
    );
  }

  return new StellarError(
    text || 'Error desconocido al hablar con Stellar.'
  );
}

export function describeStellarError(
  error: unknown
): string {
  return toStellarError(error).message;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

let rpcServer: rpc.Server | null = null;

function server(): rpc.Server {
  rpcServer ??= new rpc.Server(config.rpcUrl, {
    allowHttp: config.rpcUrl.startsWith('http://'),
  });

  return rpcServer;
}

// Cuenta ficticia para simulaciones de solo lectura.
const READ_ONLY_SOURCE =
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

export function explorerTxUrl(
  txHash: string
): string {
  return `${config.explorerUrl}/tx/${txHash}`;
}

export function explorerContractUrl(
  contractId: string
): string {
  return `${config.explorerUrl}/contract/${contractId}`;
}

export function explorerAccountUrl(
  address: string
): string {
  return `${config.explorerUrl}/account/${address}`;
}

const addressArg = (
  address: string
): xdr.ScVal =>
  Address.fromString(address).toScVal();

function bytes32Arg(hex: string): xdr.ScVal {
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new StellarError(
      'El hash de evidencia debe tener 32 bytes (64 caracteres hex).'
    );
  }

  return xdr.ScVal.scvBytes(
    Buffer.from(hex, 'hex')
  );
}

function milestoneInputArg(
  milestone: MilestoneInput
): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('amount'),
      val: nativeToScVal(milestone.amount, {
        type: 'i128',
      }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol(
        'deadline_timestamp'
      ),
      val: nativeToScVal(
        BigInt(milestone.deadline),
        { type: 'u64' }
      ),
    }),
  ]);
}

function enumName(value: unknown): string {
  return Array.isArray(value)
    ? String(value[0])
    : String(value);
}

// ---------------------------------------------------------------------------
// Freighter
// ---------------------------------------------------------------------------

export async function isFreighterInstalled(): Promise<boolean> {
  try {
    const result = await freighterIsConnected();

    return (
      !result.error &&
      result.isConnected
    );
  } catch {
    return false;
  }
}

export async function connect(): Promise<string> {
  if (!(await isFreighterInstalled())) {
    throw new StellarError(
      'No se encuentra Freighter. Instala la extensión desde freighter.app y recarga la página.'
    );
  }

  const result =
    await freighterRequestAccess();

  if (result.error || !result.address) {
    throw toStellarError(
      result.error ??
        'Freighter no devolvió ninguna cuenta.'
    );
  }

  return result.address;
}

export async function getAddress(): Promise<
  string | null
> {
  try {
    const result =
      await freighterGetAddress();

    return result.error || !result.address
      ? null
      : result.address;
  } catch {
    return null;
  }
}

export async function checkNetwork(): Promise<{
  ok: boolean;
  network: string;
}> {
  try {
    const result =
      await freighterGetNetwork();

    if (result.error) {
      return {
        ok: false,
        network: '',
      };
    }

    return {
      ok:
        result.networkPassphrase ===
        config.networkPassphrase,
      network: result.network,
    };
  } catch {
    return {
      ok: false,
      network: '',
    };
  }
}

async function sign(
  txXdr: string,
  address: string
): Promise<string> {
  const result =
    await freighterSignTransaction(txXdr, {
      networkPassphrase:
        config.networkPassphrase,
      address,
    });

  if (result.error) {
    throw toStellarError(result.error);
  }

  return result.signedTxXdr;
}

// ---------------------------------------------------------------------------
// Lectura y escritura genéricas
// ---------------------------------------------------------------------------

async function read(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = []
): Promise<unknown> {
  const tx = new TransactionBuilder(
    new Account(READ_ONLY_SOURCE, '0'),
    {
      fee: BASE_FEE,
      networkPassphrase:
        config.networkPassphrase,
    }
  )
    .addOperation(
      new Contract(contractId).call(
        method,
        ...args
      )
    )
    .setTimeout(30)
    .build();

  const simulation =
    await server().simulateTransaction(tx);

  if (
    !rpc.Api.isSimulationSuccess(
      simulation
    ) ||
    !simulation.result
  ) {
    throw toStellarError(
      rpc.Api.isSimulationError(
        simulation
      )
        ? simulation.error
        : 'La simulación no devolvió resultado.'
    );
  }

  return scValToNative(
    simulation.result.retval
  );
}

interface SubmitResult {
  txHash: string;
  returnValue?: xdr.ScVal;
}

/**
 * Prepara, firma con Freighter, envía
 * y espera confirmación.
 */
async function submit(
  operation: xdr.Operation,
  source: string,
  onPhase?: OnTxPhase
): Promise<SubmitResult> {
  try {
    // NUEVO: comprobar Testnet antes de firmar.
    const network = await checkNetwork();

    if (!network.ok) {
      throw new StellarError(
        `Freighter debe estar en Stellar Testnet antes de firmar. Red actual: ${
          network.network || 'desconocida'
        }.`
      );
    }

    const account =
      await server().getAccount(source);

    const tx = new TransactionBuilder(
      account,
      {
        fee: BASE_FEE,
        networkPassphrase:
          config.networkPassphrase,
      }
    )
      .addOperation(operation)
      .setTimeout(180)
      .build();

    // Simular y calcular recursos antes de firmar.
    const prepared =
      await server().prepareTransaction(tx);

    onPhase?.({
      phase: 'signing',
    });

    const signedXdr = await sign(
      prepared.toXDR(),
      source
    );

    const signed =
      TransactionBuilder.fromXDR(
        signedXdr,
        config.networkPassphrase
      );

    onPhase?.({
      phase: 'sending',
    });

    const sent =
      await server().sendTransaction(
        signed
      );

    if (
      sent.status === 'ERROR' ||
      sent.status === 'TRY_AGAIN_LATER'
    ) {
      throw new StellarError(
        `La red rechazó la transacción (${sent.status}).`,
        undefined,
        sent.hash
      );
    }

    const result =
      await server().pollTransaction(
        sent.hash,
        { attempts: 30 }
      );

    if (
      result.status !==
      rpc.Api.GetTransactionStatus.SUCCESS
    ) {
      throw new StellarError(
        result.status ===
          rpc.Api.GetTransactionStatus.NOT_FOUND
          ? 'La transacción no se confirmó a tiempo. Revisa su estado en stellar.expert.'
          : 'La transacción falló en la red.',
        undefined,
        sent.hash
      );
    }

    return {
      txHash: sent.hash,
      returnValue: result.returnValue,
    };
  } catch (error) {
    const stellarError =
      toStellarError(error);

    onPhase?.({
      phase: 'error',
      message: stellarError.message,
      txHash: stellarError.txHash,
    });

    throw stellarError;
  }
}

function invoke(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  source: string,
  onPhase?: OnTxPhase
) {
  return submit(
    new Contract(contractId).call(
      method,
      ...args
    ),
    source,
    onPhase
  );
}

// ---------------------------------------------------------------------------
// Operaciones AidRelease
// ---------------------------------------------------------------------------

export interface DeployInput {
  beneficiary: string;
  verifier: string;
  token: string;
  milestones: MilestoneInput[];
}

export async function deployScholarship(
  donor: string,
  input: DeployInput,
  onPhase?: OnTxPhase
): Promise<{
  contractId: string;
  txHash: string;
}> {
  if (
    !/^[0-9a-f]{64}$/.test(
      config.wasmHash
    )
  ) {
    const error = new StellarError(
      'Falta VITE_WASM_HASH en .env: sube el WASM del contrato a Testnet y copia su hash.'
    );

    onPhase?.({
      phase: 'error',
      message: error.message,
    });

    throw error;
  }

  const operation =
    Operation.createCustomContract({
      address: Address.fromString(
        donor
      ),
      wasmHash: Buffer.from(
        config.wasmHash,
        'hex'
      ),
      salt: Buffer.from(
        crypto.getRandomValues(
          new Uint8Array(32)
        )
      ),
      constructorArgs: [
        addressArg(donor),
        addressArg(input.beneficiary),
        addressArg(input.verifier),
        addressArg(input.token),
        xdr.ScVal.scvVec(
          input.milestones.map(
            milestoneInputArg
          )
        ),
      ],
    });

  const {
    txHash,
    returnValue,
  } = await submit(
    operation,
    donor,
    onPhase
  );

  if (!returnValue) {
    throw new StellarError(
      'El despliegue no devolvió la dirección del contrato.',
      undefined,
      txHash
    );
  }

  const contractId =
    Address.fromScVal(
      returnValue
    ).toString();

  onPhase?.({
    phase: 'confirmed',
    txHash,
  });

  return {
    contractId,
    txHash,
  };
}

export async function fundScholarship(
  contractId: string,
  donor: string,
  onPhase?: OnTxPhase
): Promise<string> {
  const { txHash } = await invoke(
    contractId,
    'fund',
    [],
    donor,
    onPhase
  );

  onPhase?.({
    phase: 'confirmed',
    txHash,
  });

  return txHash;
}

/**
 * Aprueba un hito y paga al estudiante.
 * milestoneIndex empieza en 0.
 */
export async function approveMilestone(
  contractId: string,
  verifier: string,
  milestoneIndex: number,
  evidenceHashHex: string,
  onPhase?: OnTxPhase
): Promise<string> {
  const args = [
    nativeToScVal(
      milestoneIndex,
      { type: 'u32' }
    ),
    bytes32Arg(
      evidenceHashHex
    ),
  ];

  const { txHash } = await invoke(
    contractId,
    'approve_milestone',
    args,
    verifier,
    onPhase
  );

  return txHash;
}

export async function claimRefund(
  contractId: string,
  donor: string,
  onPhase?: OnTxPhase
): Promise<{
  txHash: string;
  refunded: bigint;
}> {
  const {
    txHash,
    returnValue,
  } = await invoke(
    contractId,
    'claim_refund',
    [],
    donor,
    onPhase
  );

  const refunded = returnValue
    ? BigInt(
        scValToNative(
          returnValue
        ) as bigint
      )
    : 0n;

  onPhase?.({
    phase: 'confirmed',
    txHash,
  });

  return {
    txHash,
    refunded,
  };
}

// ---------------------------------------------------------------------------
// Lectura de becas
// ---------------------------------------------------------------------------

export type OnChainScholarship =
  Omit<
    Scholarship,
    'id' | 'contractId'
  >;

interface RawScholarship {
  donor: string;
  beneficiary: string;
  verifier: string;
  token: string;
  status: unknown;
  total_amount: bigint;
  paid_amount: bigint;
  refunded_amount: bigint;
  next_milestone_id: number;
}

interface RawMilestone {
  id: number;
  amount: bigint;
  deadline_timestamp:
    | bigint
    | number;
  status: unknown;
  evidence_hash?:
    | Uint8Array
    | null;
}

export async function getScholarship(
  contractId: string
): Promise<OnChainScholarship> {
  const [
    rawScholarship,
    rawMilestones,
  ] = await Promise.all([
    read(
      contractId,
      'get_scholarship'
    ) as Promise<RawScholarship>,
    read(
      contractId,
      'get_milestones'
    ) as Promise<RawMilestone[]>,
  ]);

  const milestones: Milestone[] =
    rawMilestones.map((m) => ({
      id: Number(m.id),
      amount: BigInt(m.amount),
      deadline: Number(
        m.deadline_timestamp
      ),
      status: enumName(
        m.status
      ) as MilestoneStatus,
      evidenceHash:
        m.evidence_hash
          ? toHex(
              new Uint8Array(
                m.evidence_hash
              )
            )
          : null,
    }));

  return {
    donor:
      rawScholarship.donor,
    beneficiary:
      rawScholarship.beneficiary,
    verifier:
      rawScholarship.verifier,
    token:
      rawScholarship.token,
    status: enumName(
      rawScholarship.status
    ) as ScholarshipStatus,
    totalAmount: BigInt(
      rawScholarship.total_amount
    ),
    paidAmount: BigInt(
      rawScholarship.paid_amount
    ),
    refundedAmount: BigInt(
      rawScholarship.refunded_amount
    ),
    nextMilestoneId: Number(
      rawScholarship.next_milestone_id
    ),
    milestones,
  };
}

// ---------------------------------------------------------------------------
// Balance y trustline USDCDEMO
// ---------------------------------------------------------------------------

/**
 * Consulta saldo del token en unidades mínimas.
 * Un saldo de 0 NO demuestra que exista una trustline.
 */
export async function getBalance(
  address: string,
  tokenId: string =
    config.tokenId
): Promise<bigint | null> {
  try {
    return BigInt(
      (await read(
        tokenId,
        'balance',
        [addressArg(address)]
      )) as bigint
    );
  } catch {
    return null;
  }
}

const USDCDEMO_ISSUER =
  'GDENGNSPL5H255PAT65O47UXKV4YLV7UY4JMAWA6APGXSKOVIYVERBLJ';

/**
 * Comprueba la trustline USDCDEMO en Horizon Testnet.
 * Si Horizon falla, lanza un error en lugar de asumir
 * que la trustline no existe.
 */
export async function hasUsdcDemoTrustline(
  studentAddress: string
): Promise<boolean> {
  const response = await fetch(
    `https://horizon-testnet.stellar.org/accounts/${encodeURIComponent(
      studentAddress
    )}`
  );

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    throw new Error(
      'No se pudo consultar la cuenta del estudiante en Stellar Testnet.'
    );
  }

  const account = await response.json();

  return account.balances.some(
    (balance: {
      asset_type: string;
      asset_code?: string;
      asset_issuer?: string;
      is_authorized?: boolean;
    }) =>
      balance.asset_type ===
        'credit_alphanum12' &&
      balance.asset_code ===
        'USDCDEMO' &&
      balance.asset_issuer ===
        USDCDEMO_ISSUER &&
      balance.is_authorized !==
        false
  );
}

// ---------------------------------------------------------------------------
// Estado de transacciones
// ---------------------------------------------------------------------------

export type TransactionStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'NOT_FOUND';

export async function getTransactionStatus(
  txHash: string
): Promise<TransactionStatus> {
  const result =
    await server().getTransaction(
      txHash
    );

  return result.status as TransactionStatus;
}
