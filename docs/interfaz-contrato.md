# Interfaz del contrato AidRelease

Versión: borrador basado en la especificación de la persona 1. El código final puede ajustar nombres.
Red: Stellar testnet. SDK: `soroban-sdk 28`.
Token de pruebas: USDCDEMO, contrato `CDFEDKZ6LWUS5JSHOFM5XVKCD6ALYGVDMREZYTYAZNOAFGQ6FJMLRA7Y`.

## 1. Idea general

Cada beca es **un contrato propio**. El donante lo despliega indicando quién es el estudiante, quién verifica y qué token se usa, y después lo financia. El verificador aprueba los hitos **en orden** y el dinero llega al estudiante en la misma transacción. Si un hito vence sin aprobarse, el donante recupera **todo el dinero pendiente** y la beca se cierra.

## 2. Roles y quién firma qué

| Rol | Qué hace | Funciones que firma |
|---|---|---|
| Donante | Despliega, financia y reembolsa | constructor, `fund`, `claim_refund` |
| Verificador | Aprueba hitos | `approve_milestone` |
| Beneficiario (estudiante) | Recibe los pagos | Ninguna (solo consulta) |
| Cualquiera | Consulta el estado | `get_scholarship`, `get_milestone`, `get_milestones` |

## 3. Unidades y formatos

- **Importes:** enteros `i128` en unidades mínimas del token. USDCDEMO usa 7 decimales: **1 USDCDEMO = 10.000.000 unidades**. Para mostrar, divide entre `10_000_000`.
- **Fechas:** timestamps Unix en **segundos** (`u64`).
- **Evidencia:** `BytesN<32>` (un hash SHA-256, 32 bytes). Se calcula **fuera de la cadena**. Nunca se guardan documentos ni datos personales en la cadena.
- **Direcciones:** `G...` para cuentas y `C...` para contratos.

## 4. Estados

**ScholarshipStatus** (beca):

| Valor | Significado |
|---|---|
| `Unfunded` | Creada, el donante aún no ha depositado el dinero |
| `Active` | Financiada, hay hitos pendientes |
| `Completed` | Todos los hitos pagados |
| `Refunded` | El donante recuperó el dinero pendiente. Estado final |

**MilestoneStatus** (hito):

| Valor | Significado |
|---|---|
| `Pending` | Esperando aprobación |
| `Paid` | Pagado al estudiante. Definitivo |
| `Expired` | Venció y se reembolsó (es el siguiente hito que no se cumplió) |
| `Cancelled` | Anulado porque un hito anterior venció |

> **Importante para el frontend:** los estados `Expired` y `Cancelled` solo se escriben cuando el donante ejecuta `claim_refund`. Un hito puede estar `Pending` y ya vencido sin que nadie haya reembolsado todavía. La interfaz debe comparar la fecha límite con la hora actual para mostrar "vencido" en ese caso.

## 5. Funciones

| Función | Parámetros | Devuelve | Firma | Puede fallar con |
|---|---|---|---|---|
| `__constructor` | `donor`, `beneficiary`, `verifier`, `token` (`Address`), `milestones: Vec<MilestoneInput>` | nada | Donante | 1, 2, 3, 4, 13 (aborta) |
| `fund` | ninguno | `Result<(), ContractError>` | Donante | 5 |
| `approve_milestone` | `milestone_id: u32`, `evidence_hash: BytesN<32>` | `Result<(), ContractError>` | Verificador | 6, 7, 8, 9, 10, 11 |
| `claim_refund` | ninguno | `Result<i128, ContractError>` (importe devuelto) | Donante | 6, 11, 12 |
| `get_scholarship` | ninguno | `Scholarship` | Nadie | — |
| `get_milestone` | `milestone_id: u32` | `Result<Milestone, ContractError>` | Nadie | 7 |
| `get_milestones` | ninguno | `Vec<Milestone>` | Nadie | — |

`MilestoneInput` (al crear la beca): `amount: i128` y la fecha límite `deadline_timestamp: u64` **(nombres por confirmar)**.

`Scholarship` (lo que devuelve `get_scholarship`): estado general, importes acumulados (total, pagado, reembolsado) y el id del siguiente hito. Nombres exactos **por confirmar**.

`Milestone`: importe, fecha límite, estado y hash de evidencia. Nombres exactos **por confirmar**.

## 6. Reglas de negocio

- Entre **1 y 10 hitos**. Importes positivos y fechas **estrictamente crecientes** y posteriores al momento de crear la beca.
- Donante, beneficiario y verificador deben ser **tres direcciones distintas**.
- La beca se financia **una sola vez y por el total** (suma de los importes).
- Los hitos se aprueban **en orden**, solo el verificador.
- Se puede aprobar un hito si `ahora <= fecha_límite`. Se puede reembolsar si `ahora > fecha_límite` del siguiente hito pendiente. No hay periodo de gracia.
- Al reembolsar, el donante recupera `total - pagado - reembolsado`. Los pagos anteriores son definitivos.
- El reembolso solo se hace una vez y cierra la beca.
- Si falla una transferencia (por ejemplo, estudiante sin trustline), **toda la transacción se revierte** y el hito sigue `Pending`.

## 7. Códigos de error

| Código | Nombre | Cuándo ocurre |
|---|---|---|
| 1 | `InvalidRoles` | Dos roles son la misma dirección |
| 2 | `InvalidMilestones` | Menos de 1 o más de 10 hitos |
| 3 | `InvalidAmount` | Importe cero o negativo |
| 4 | `InvalidDeadline` | Fechas no crecientes o en el pasado |
| 5 | `AlreadyFunded` | Se intenta financiar otra vez |
| 6 | `NotFunded` | La beca aún no está financiada |
| 7 | `InvalidMilestoneId` | El hito no existe |
| 8 | `WrongMilestoneOrder` | Se aprueba un hito fuera de orden |
| 9 | `MilestoneNotPending` | El hito ya no está pendiente |
| 10 | `MilestoneExpired` | Pasó la fecha límite |
| 11 | `ScholarshipClosed` | La beca ya está `Completed` o `Refunded` |
| 12 | `RefundNotAvailable` | Aún no ha vencido el siguiente hito |
| 13 | `ArithmeticOverflow` | Desbordamiento al sumar importes |
| 14 | `InvalidToken` | Reservado, no se usa todavía |

Los errores de firma (autorización) y los del contrato de token (por ejemplo, saldo insuficiente) **no** vienen en esta lista y llegan como errores distintos.

## 8. Orden en que se comprueban los errores de `approve_milestone`

1. Firma del verificador
2. Estado general de la beca (`NotFunded`, `ScholarshipClosed`)
3. Existencia del hito (`InvalidMilestoneId`)
4. Estado del hito (`MilestoneNotPending`)
5. Orden secuencial (`WrongMilestoneOrder`)
6. Fecha límite (`MilestoneExpired`)

Orden de `claim_refund` **(por confirmar)**: firma del donante, estado general (`NotFunded`, `ScholarshipClosed`) y plazo (`RefundNotAvailable`).

## 9. Eventos

El contrato emite eventos de financiación, pago y reembolso. Los nombres y los campos exactos están **por confirmar**.

## 10. Notas para el frontend

- **Desplegar una beca** es desplegar un contrato nuevo (no llamar a una función de un contrato general). La billetera del donante debe firmar el despliegue, porque el constructor exige su firma.
- **El estudiante necesita trustline** del token antes de poder cobrar. Si no la tiene, el pago falla y el hito queda pendiente. La interfaz debería avisarle.
- **Mostrar siempre la dirección del token** antes de financiar o aprobar. El contrato no valida el token, así que un token falso podría simular pagos.
- **Hash de evidencia:** se calcula en el navegador con SHA-256, añadiendo un valor aleatorio ("salt") si el documento es predecible. Nunca se sube el documento a la cadena.
- Para mostrar un hito como "vencido sin reembolsar": estado `Pending` y `ahora > fecha_límite`.

## 11. Datos de ejemplo para trabajar sin contrato

```json
{
  "scholarship": {
    "status": "Active",
    "total_amount": "6000000000",
    "paid_amount": "1000000000",
    "refunded_amount": "0",
    "next_milestone_id": 1
  },
  "milestones": [
    { "id": 0, "amount": "1000000000", "deadline": 1793000000, "status": "Paid" },
    { "id": 1, "amount": "2000000000", "deadline": 1795600000, "status": "Pending" },
    { "id": 2, "amount": "3000000000", "deadline": 1798200000, "status": "Pending" }
  ]
}
```

(Los importes van como texto porque `i128` no cabe en un número de JavaScript sin perder precisión. Usad `BigInt`.)