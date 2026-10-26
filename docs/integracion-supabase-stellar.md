# Integración Supabase + Stellar/Freighter

Qué se ha añadido y cómo ponerlo en marcha. Sigue la respuesta del equipo (tablas, bucket, salt, `stellar.ts`, capa `src/api/`) y `docs/interfaz-contrato.md` (rama `test`): **un contrato por beca**.

## Qué va en cada sitio

| Dónde | Qué |
|---|---|
| Contrato Soroban (Stellar Testnet) | Dinero, estado de pago de cada hito y hash de evidencia (`BytesN<32>`) |
| Supabase Postgres | Becas, hitos (títulos, criterios, documentos), presentaciones, evidencias y revisiones |
| Supabase Storage (bucket privado `evidencias`) | Los documentos: `becas/{becaId}/hitos/{indice}/{sha256}` |
| Freighter | Identidad (dirección `G...`) y firma de transacciones |

## Archivos nuevos o modificados

**Contrato (Rust)** — `contracts/`
- `Cargo.toml` (workspace) y `contracts/aidrelease/Cargo.toml` (soroban-sdk 28).
- `src/lib.rs`: constructor, `fund`, `approve_milestone`, `claim_refund`, `get_scholarship`, `get_milestone`, `get_milestones`, errores 1–14 y eventos.
- `src/test.rs`: casos del plan de pruebas (1–8, 10–12, 14–23) y reembolso.

**Supabase** — `backend/supabase/`
- `migrations/20261025000000_init.sql`: tablas `becas`, `hitos`, `presentaciones`, `evidencias`, `revisiones`; vista `solicitudes_verificacion`; RLS de demo; bucket privado y sus políticas.
- `seed.sql`: las cuatro becas de `mockScholarships.ts`.

**Frontend** — `frontend/`
- `.env.example`, `src/config.ts`, `src/vite-env.d.ts`, `src/polyfills.ts`, `vite.config.ts`, `package.json` (nuevas dependencias).
- `src/lib/stellar.ts`: Freighter (`connect`, `getAddress`, `checkNetwork`) y contrato (`deployScholarship`, `fundScholarship`, `approveMilestone`, `claimRefund`, `getScholarship`, `getBalance`, `getTransactionStatus`).
- `src/lib/supabase.ts`, `src/lib/evidence.ts` (SHA-256 con salt de 16 bytes por archivo y hash del conjunto).
- `src/context/WalletProvider.tsx` y `walletContext.ts`: sustituyen al usuario fijo de la Navbar.
- `src/api/`: `types.ts`, `mockApi.ts` (modo demo), `supabaseApi.ts` (modo real), `donorLive.ts`, `mappers.ts`, `index.ts`.
- `src/components/TxStatus.tsx`: firmando / enviando / confirmada / error con enlace a stellar.expert.
- Pantallas conectadas a la capa `src/api/`: Navbar, BeneficiaryPage, ScholarshipDetailPage, EvidenceUpload, VerifierPage, VerificationDetailPage, DonorPage y CreateScholarshipForm.

Sin Supabase en `.env`, la app arranca en **modo demo** con los mocks de siempre (no se ha borrado ninguno).

## Puesta en marcha

### 1. Contrato

```bash
cd contracts
cargo test                       # tests unitarios
stellar contract build           # genera target/wasm32v1-none/release/aidrelease.wasm
stellar keys generate donante --network testnet --fund
stellar contract upload --wasm target/wasm32v1-none/release/aidrelease.wasm \
  --source donante --network testnet          # imprime el WASM HASH
```

soroban-sdk 28 exige el target `wasm32v1-none` y stellar-cli 25.2 o posterior.

### 2. Supabase

1. Crea un proyecto en supabase.com.
2. En **SQL Editor**, ejecuta `backend/supabase/migrations/20261025000000_init.sql` y después `backend/supabase/seed.sql` (opcional). Cambia antes las direcciones del seed por las de vuestras cuentas de Freighter.
3. En **Project Settings > API**, copia la URL y la clave `anon` (o *publishable*).

### 3. Frontend

```bash
cd frontend
cp .env.example .env     # rellena VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y VITE_WASM_HASH
npm install
npm run dev
```

### 4. Cuentas de la demo

- Tres cuentas en Freighter (donante, estudiante y verificador), en **Testnet** y con fondos de Friendbot.
- El donante necesita saldo de USDCDEMO.
- **El estudiante necesita una trustline a USDCDEMO**, o el pago fallará y el hito seguirá pendiente.

## Flujo de la demo

1. **Donante** (`/donor`): *Crear beca* despliega un contrato nuevo (firma en Freighter) y guarda los datos en Supabase. Después pulsa *Financiar beca* (segunda firma).
2. **Estudiante** (`/beneficiary`): conecta Freighter, abre la beca y sube los documentos. Se guardan en el bucket privado y el hito pasa a `submitted`. No firma nada.
3. **Verificador** (`/verifier`): ve la solicitud, abre los documentos con URL firmada (5 min) y puede *Comprobar huella*.
   - *Solicitar correcciones*: solo base de datos. El hito pasa a `correction_requested` y el estudiante puede volver a enviar.
   - *Aprobar hito*: Freighter firma `approve_milestone(índice, hash_conjunto)`. El contrato paga al estudiante, se guarda la revisión con su `tx_hash` y el hito pasa a `paid`. Se desbloquea el siguiente.
4. El estudiante ve el hito pagado, el enlace a la transacción y su saldo de USDCDEMO.

## Decisiones tomadas

- **Índices:** el contrato y la BD empiezan en 0 (`hitos.indice`). En la interfaz y en las URL se muestra `indice + 1`.
- **Importes:** `bigint` en unidades mínimas (1 USDCDEMO = 10.000.000) en BD y contrato. Solo se convierten para mostrarlos.
- **Salt:** uno aleatorio de 16 bytes por archivo; `sha256(salt || archivo)`; el salt queda en `evidencias.salt`.
- **Hash del conjunto:** `sha256(JSON.stringify(hashesOrdenados))`, enviado como 32 bytes (no como texto hex).
- **Estado:** cuando la beca tiene contrato, la app lee `get_scholarship`/`get_milestones` y lo que diga el contrato manda sobre la BD en lo que toca al dinero.
- **Nombres del `MilestoneInput`:** `amount` y `deadline_timestamp`, tal como los propone la interfaz. Si Carlos los cambia, solo hay que tocar `milestoneInputArg` en `src/lib/stellar.ts`.

## Limitaciones de la versión de demo

- **Datos fuera de la cadena:** la clave `anon` puede leer y escribir (sin `DELETE`). El frontend filtra por la dirección conectada, pero los datos fuera de la cadena **no están protegidos**. El dinero sí lo está, por el `require_auth` del contrato. Para producción: firma de reto con `signMessage` validada en una Edge Function, y RLS por dirección.
- **Bucket:** es privado, pero la política de lectura de la demo permite generar URLs firmadas a cualquiera que tenga la clave `anon`.
