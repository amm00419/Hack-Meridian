# AidRelease — Stellar Developer Friction Log

**Event:** HackMeridian 2026  
**Repository:** https://github.com/amm00419/Hack-Meridian  
**Environment:** Stellar Testnet (October 2026)

This log is based on the team's repository, test records, and our troubleshooting conversations. **All durations are rough retrospective estimates**, not time-tracked measurements; some work overlapped. This was a Testnet prototype, not an audited production system.

## What we built

AidRelease is a milestone-based scholarship-disbursement prototype. A donor funds a Soroban contract dedicated to one scholarship. A designated verifier approves a milestone by supplying an evidence hash, triggering the corresponding token payout to the student. If the next pending milestone expires, the donor can reclaim the unpaid portion. React provides donor, student, and verifier screens; Supabase holds scholarship metadata, submitted documents, and reviews off-chain. Test transactions used **USDCDEMO**, not real USDC.

The contract exposes `__constructor`, `fund`, `approve_milestone`, `claim_refund`, `get_scholarship`, `get_milestone`, and `get_milestones`. We recorded **69 passing Rust tests** (18 original tests and 51 additional tests from a teammate), plus actual Testnet milestone payments and refunds.

## Stellar tools we used

| Tool | How we used it |
| --- | --- |
| **Rust / Soroban SDK** | Authenticated donor and verifier operations; implemented deadline-ordered milestones, token transfers, refunds, storage, events, TTL renewal on writes, and unit tests. |
| **Stellar CLI** | Built WASM, deployed and invoked scholarship contracts, tested read/write calls, diagnosed failures, and read on-chain milestone status and token balances. |
| **Stellar Testnet / Soroban RPC / Stellar Asset Contract** | Exercised real transfers, refunds, token issuance, account trustlines, and transaction confirmation. |
| **`@stellar/stellar-sdk`** | Built, simulated, submitted, and confirmed Soroban transactions from the TypeScript frontend; decoded contract state and results. |
| **Freighter / `@stellar/freighter-api`** | Connected wallets, verified the selected Testnet account, and requested transaction signatures from the correct role. |
| **Stellar Expert** | Inspected real Testnet transactions and independently checked outcomes. |
| **Supabase (not a Stellar tool)** | Stored scholarship records, milestone descriptions, hashed document evidence, reviews, and transaction IDs outside the blockchain. |
| **Raven MCP or other Stellar MCP** | **Not verified as used.** We found no evidence in our code or recorded workflow and do not claim it. |

## Main friction points

| Problem | What happened | Rough time lost | Workaround / status |
| --- | --- | --- | --- |
| **Missing trustline; misleading error #13** | Approval to a student without a USDCDEMO trustline failed in simulation with `Error(Contract, #13)`. The error came from the **token** contract, not necessarily AidRelease's `ContractError` enum. Diagnostic details said `trustline entry is missing for account`. | **~1–2 h** | Inspected diagnostics and unchanged contract state; added a trustline precheck and safer frontend error messages. |
| **Milestones expired during testing** | Short Testnet deadlines elapsed during account setup, causing `MilestoneExpired` before the intended negative test could run. | **~30–60 min** | Deployed a fresh contract instance with later deadlines; kept payment, refund, and error tests separate. |
| **CLI simulation versus submission** | Read-only calls showed `Simulation identified as read-only. Send by rerunning with --send=yes`, and it took care to distinguish simulation from signed submission. | **~20–45 min** | Used read methods for inspection, `--send=yes` for intended writes, then verified hashes and state. |
| **Asset units, issuer, and trustline setup** | USDCDEMO uses seven decimals (`1 token = 10000000` base units); a wallet needed a trustline and sufficient balance before a real payout. | **~30–60 min** | Standardized base-unit conversions; issued demo assets from the controlled Testnet issuer and verified balances. |
| **Freighter / role / Supabase integration** | Addresses, contract IDs, milestones, and off-chain evidence had to match. The verifier inbox remained empty until the student actually submitted a presentation. | **~2–4 h**, shared integration effort | Checked connected wallet and network, joined database records to on-chain IDs, and validated milestone status against Stellar before approval. |
| **On-chain payment, off-chain write consistency** | Stellar payment can be confirmed before Supabase records the review or updates the milestone; a later database failure leaves mismatched state. | **~30–90 min** analyzing; full repair outstanding | Retained the confirmed transaction hash for recovery; identified automatic reconciliation as future work. |
| **Donor screen mock / environment configuration** | Early donor UI was in-memory only. In later `develop` code, `createDonorService()` uses a real chain service **only if** `VITE_WASM_HASH` and Supabase are configured, otherwise it falls back to mock mode. | **~1–3 h**, approximate | Added the chain-backed service selection. For demos, verify configuration and actual transaction hashes before claiming an on-chain action. |
| **Starter structure / documentation / Windows setup** | Generic `hello-world` naming, incomplete READMEs, multiple local paths, and PowerShell commands made setup and reproduction slower. | **~30–90 min** | Created project-specific notes and test plans, standardized CLI commands, and checked compiled WASM against the deployed version. Some docs remain incomplete. |

These time bands are estimates from our experience, not measured timings, and **should not be added into an exact total**. We did not establish that any particular Stellar documentation page was broken.

## What worked well

- **Soroban transaction atomicity:** failed token transfers reverted milestone state and did not create partial payouts.
- **Stellar CLI and Testnet:** quick build/deploy/invoke loops with inspectable on-chain outcomes.
- **Freighter:** made donor and verifier roles easy to demonstrate once account/network configuration was correct.
- **Stellar SDK and RPC:** supported preapproval checks against real chain state instead of relying on a mutable database record.
- **Testing:** 69 passing Rust tests plus confirmed Testnet payout and refund transactions gave confidence in the core contract logic.
- **Off-chain document design:** student files stayed in Supabase Storage, while evidence hashes went on-chain. The demo's permissive Supabase access policies still need hardening before real use.

## What would have made Stellar development easier

1. A maintained **end-to-end Soroban + React + Freighter example** with funding, signed approval, payout, refund, and off-chain evidence storage.
2. Error diagnostics that clearly identify **which invoked contract** emitted `Error(Contract, #N)`, with a missing-trustline example.
3. A compact Testnet setup guide for **token issuer, trustline, decimals, balance, simulation versus submission, and Freighter network**.
4. Clear examples of **storage/code TTL management** for long-lived escrow contracts with few transactions.
5. Updated **Stellar CLI and TypeScript SDK examples for Windows/PowerShell**.
6. Reference patterns for **reconciling confirmed on-chain payments with failed off-chain database writes**.

## Evidence in this repository

- [Soroban contract](contracts/contracts/hello-world/src/lib.rs)
- [Original contract tests](contracts/contracts/hello-world/src/test.rs) and [additional test suite](contracts/contracts/hello-world/src/test_plan.rs)
- [Test plan and recorded results](docs/plan-de-pruebas.md)
- [Stellar SDK / Freighter integration](frontend/src/lib/stellar.ts)
- [Donor service mode selection](frontend/src/services/createDonorService.ts)
- [Verifier payment integration](frontend/src/pages/verifier/VerificationDetailPage.tsx)
- [Supabase schema and demonstration access policies](backend/supabase/migrations/20261025000000_init.sql)
- [Successful Testnet payout](https://stellar.expert/explorer/testnet/tx/7956a09fad90b66e1b7af9003227e45456078ccc441eee07e3eaa438cc2b73ce)
- [Successful Testnet refund](https://stellar.expert/explorer/testnet/tx/9f12fde67fa6fc75e8c9365781348fdab83772255c203820e41cf341e64a1646)

No private keys, seed phrases, passwords, or personal student documents are included.
