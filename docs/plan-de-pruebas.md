# Plan de pruebas del contrato AidRelease

- **Contrato:** `contracts/contracts/hello-world/src/lib.rs` (rama `feature/aidrelease-contract`)
- **Tests:** `test.rs` (persona 1, 18 tests) y `test_plan.rs` (persona 2, 51 tests)
- **Resultado de `cargo test`:** 69 pasados, 0 fallidos
- **Instancia 1 (flujo completo hasta `Completed`):** `CDPKMQ74TZV2WI4URYT2UTKPQGMQYQSPGJPHG5AMZPKP73UI5VVWHUTM`
  - Segundo pago: https://stellar.expert/explorer/testnet/tx/7956a09fad90b66e1b7af9003227e45456078ccc441eee07e3eaa438cc2b73ce
- **Instancia 2 (reembolso por vencimiento):** `CBDL4G3HXVDQZOONBM44SOYYGXRXUVX2JI7OHRMBVJI5572PGVRQLBSK`
  - Reembolso: https://stellar.expert/explorer/testnet/tx/9f12fde67fa6fc75e8c9365781348fdab83772255c203820e41cf341e64a1646
  - Estado comprobado con `get_scholarship` y `get_milestones`: `Refunded`, reembolsado 30000000, pagado 0, hito 0 `Expired`, hito 1 `Cancelled`.
  - En esta instancia el plazo venció antes de intentar la aprobación, así que **no validó el caso 25**.

Unidades: 1 USDCDEMO = 10.000.000 unidades mínimas. Las fechas son segundos Unix.

## 1. Tabla de casos

| Nº | Caso | Resultado esperado | Estado | Probado en testnet |
|----|------|--------------------|--------|--------------------|
| 1 | Crear beca válida con 1 hito | Beca `Unfunded`, total correcto | Hecho | No |
| 2 | Crear beca válida con 10 hitos | Se crea; `get_milestones` devuelve 10 | Hecho | No |
| 3a | Donante igual a estudiante | `InvalidRoles` | Hecho | No |
| 3b | Donante igual a verificador | `InvalidRoles` | Hecho | No |
| 3c | Estudiante igual a verificador | `InvalidRoles` | Hecho | No |
| 4 | Cero hitos | `InvalidMilestones` | Hecho | No |
| 5 | Once hitos | `InvalidMilestones` | Hecho | No |
| 6a | Importe cero | `InvalidAmount` | Hecho | No |
| 6b | Importe negativo | `InvalidAmount` | Hecho | No |
| 7a | Fechas no crecientes | `InvalidDeadline` | Hecho | No |
| 7b | Fechas iguales | `InvalidDeadline` | Hecho | No |
| 7c | Primera fecha en el pasado | `InvalidDeadline` | Hecho | No |
| 8 | Importes que desbordan i128 | `ArithmeticOverflow` | Hecho | No |
| 9 | El constructor exige la firma del donante | Sin su firma, falla | Hecho | No |
| 10 | Financiar la beca | `Active`; el contrato recibe el total | Hecho | Sí |
| 11 | Financiar dos veces | `AlreadyFunded`; no se cobra dos veces | Hecho | No |
| 12 | `fund` solo requiere la firma del donante | Solo firma el donante | Hecho | No |
| 13 | Financiar sin saldo suficiente | Falla; sigue `Unfunded` | Hecho | No |
| 14 | Aprobar el primer hito a tiempo | Hito `Paid`; el estudiante cobra | Hecho | Sí |
| 15 | Aprobar sin financiar | `NotFunded` | Hecho | No |
| 16a | `approve_milestone` solo requiere la firma del verificador | Solo firma el verificador | Hecho | No |
| 16b | Aprobar con la firma de otra persona | Falla; no se paga | Hecho | No |
| 17 | Aprobar un hito inexistente | `InvalidMilestoneId` | Hecho | No |
| 18 | Aprobar saltándose el orden | `WrongMilestoneOrder` | Hecho | No |
| 19 | Aprobar dos veces el mismo hito | `MilestoneNotPending` | Hecho | No |
| 20 | Aprobar un hito vencido | `MilestoneExpired` | Hecho | No |
| 21 | Aprobar justo en el límite (`now == deadline`) | Se puede aprobar | Hecho | No |
| 22 | Aprobar todos los hitos en orden | Estado `Completed`; saldo del contrato 0 | Hecho | Sí |
| 23 | Aprobar después de un reembolso | `ScholarshipClosed` | Hecho | No |
| 24 | Fallo en la transferencia al aprobar | Se revierte todo el estado | Hecho | No |
| 25 | Estudiante sin trustline | La aprobación revierte; fondos intactos; el donante puede reembolsar | Hecho (falta el reembolso final en testnet) | Sí (instancia 3: simulación falla con el error del token trustline entry is missing) |
| 26 | Reembolso tras vencer el siguiente hito | Se devuelve lo pendiente; hitos `Expired` y `Cancelled` | Hecho | Sí (instancia 2) |
| 27 | Reembolso justo en el límite (`now == deadline`) | `RefundNotAvailable` | Hecho | No |
| 28 | Reembolso antes del vencimiento | `RefundNotAvailable` | Hecho | No | Sí (instancia 3, simulación rechazada con el código 12)
| 29 | `claim_refund` solo requiere la firma del donante | Solo firma el donante | Hecho | Sí (firma real del donante, instancia 2) |
| 30 | Reembolso sin financiar | `NotFunded` | Hecho | No |
| 31 | Reembolso con hitos ya pagados | Solo se devuelve lo pendiente | Hecho | No |
| 32 | Reembolso dos veces | `ScholarshipClosed` | Hecho | No |
| 33 | Reembolso con todos los hitos pagados | `ScholarshipClosed` | Hecho | No |
| 34 | Tokens enviados por error al contrato | No se reembolsan (contabilidad interna) | Hecho | No |
| 35 | `get_milestone` de un hito inexistente | `InvalidMilestoneId` | Hecho | No |
| 36 | Las consultas reflejan el estado real | Valores coherentes tras cada operación | Hecho | Sí (parcial) |
| 37 | Dos becas con tokens distintos | Son independientes | Hecho | No |
| 38 | Secuencia mixta | El dinero se conserva en cada paso | Hecho | No |
| 39 | TTL | La instancia se mantiene viva | **Pendiente** (sin test automático) | No |
| 40 | Eventos | Se emiten `funded`, `milestone_paid` y `refunded` con los datos correctos | **Pendiente** (sin test automático) | No |
| 41 | Prioridad: estado general antes que existencia | Beca sin financiar + hito inexistente da `NotFunded` | Hecho | No |
| 42 | Prioridad: beca cerrada antes que estado del hito | `ScholarshipClosed` | Hecho | No |
| 43 | Prioridad: estado del hito antes que orden | `MilestoneNotPending` | Hecho | No |
| 44 | Prioridad: orden antes que fecha límite | `WrongMilestoneOrder` | Hecho | No |
| 45 | Fallo en el reembolso | Se revierte todo el estado | Hecho | No |
| 46 | Financiar después del primer plazo | `MilestoneExpired`; `Unfunded`; sin cobro | Hecho | No |
| 47 | Financiar justo en el primer plazo | Se puede financiar | Hecho | No |
| 48 | Beca sin financiar y vencida | No hay fondos atrapados; `NotFunded` | Hecho | No |

Los casos 25, 39 y 40 no se cuentan en los 69 tests.

## 2. Propiedades que deben cumplirse siempre

1. **Conservación:** el saldo del contrato es igual a `total - pagado - reembolsado`.
2. **Sin pago doble:** un hito solo se paga una vez.
3. **Orden:** los hitos se aprueban en secuencia.
4. **Firmas:** el donante firma `fund` y `claim_refund`; el verificador firma `approve_milestone`.
5. **Plazos:** se aprueba si `now <= deadline`; se reembolsa si `now > deadline`.
6. **Atomicidad:** si falla la transferencia, no cambia ningún estado.
7. **Reembolso único:** tras un reembolso la beca queda `Refunded`.
8. **Estados finales:** `Completed` y `Refunded` no admiten más operaciones.
9. **Sin administrador:** nadie puede cambiar las reglas después de crear la beca.
10. **Datos personales:** en la cadena solo hay direcciones y hashes.

## 3. Notas

- Los tests usan firmas simuladas (`mock_all_auths`); el caso 16b y el caso 9 usan `MockAuth` para firmantes concretos. La prueba con firmas reales se hace en testnet con Freighter.
- La prueba de `claim_refund` en testnet está hecha (instancia 2). Falta la del estudiante sin trustline (caso 25), en una instancia nueva con el primer plazo de 30 minutos o más.
- Detalle de los hallazgos de seguridad: `docs/revision-de-seguridad.md`.
