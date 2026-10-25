# Plan de pruebas del contrato AidRelease

Red: testnet. Los tests unitarios se ejecutan en local con cargo test.
Token de referencia: USDCDEMO (7 decimales). 1 USDCDEMO = 10000000 unidades mínimas.
SDK: soroban-sdk = "28".

## Casos de prueba

| Nº | Caso | Quién llama | Resultado esperado | Hecho |
|----|---|---|---|---|
| 1  | Crear beca válida con 1 hito | Donante | Beca creada, estado sin financiar | No |
| 2  | Crear beca válida con 10 hitos | Donante | Beca creada | No |
| 3  | Dos roles iguales (donante, estudiante o verificador repetidos) | Donante | InvalidRoles (1) | No |
| 4  | Beca con 0 hitos | Donante | InvalidMilestones (2) | No |
| 5  | Beca con 11 hitos | Donante | InvalidMilestones (2) | No |
| 6  | Hito con importe 0 o negativo | Donante | InvalidAmount (3) | No |
| 7  | Fechas no crecientes, o en el pasado | Donante | InvalidDeadline (4) | No |
| 8  | Importes que desbordan al sumarse | Donante | ArithmeticOverflow (13) | No |
| 9  | Dirección de token inválida | Donante | InvalidToken (14) | No |
| 10 | Financiar la beca | Donante | El contrato recibe la suma de importes, evento de financiación | No |
| 11 | Financiar dos veces | Donante | AlreadyFunded (5) | No |
| 12 | Financiar sin ser el donante | Otro | Falla por autorización | No |
| 13 | Financiar sin saldo suficiente | Donante | Falla (error del token) | No |
| 14 | Aprobar el primer hito, a tiempo | Verificador | El estudiante cobra, hito Pagado, evidencia guardada, evento | No |
| 15 | Aprobar sin financiar | Verificador | NotFunded (6) | No |
| 16 | Aprobar sin ser el verificador | Otro | Falla por autorización | No |
| 17 | Aprobar un hito que no existe | Verificador | InvalidMilestoneId (7) | No |
| 18 | Aprobar saltándose el orden | Verificador | WrongMilestoneOrder (8) | No |
| 19 | Aprobar dos veces el mismo hito (beca Active) | Verificador | MilestoneNotPending (9) | No |
| 20 | Aprobar un hito vencido | Verificador | MilestoneExpired (10) | No |
| 21 | Aprobar justo en el instante del plazo | Verificador | Según la regla definida (pregunta 1 de dudas de diseño) | No |
| 22 | Aprobar todos los hitos en orden | Verificador | El contrato queda a 0 y la beca cerrada | No |
| 23 | Aprobar después de un reembolso | Verificador | ScholarshipClosed
| 24 | Aprobar un hito inexistente en una beca Unfunded | Verificador | NotFunded (6), antes que InvalidMilestoneId | No |
| 25 | Aprobar cualquier hito en una beca Completed o Refunded | Verificador | ScholarshipClosed (11), antes que MilestoneNotPending | No |
| 26 | Aprobar un hito ya pagado, fuera de orden y vencido | Verificador | MilestoneNotPending (9), antes que WrongMilestoneOrder | No |
| 27 | Aprobar un hito futuro (fuera de orden) cuyo plazo ya venció | Verificador | WrongMilestoneOrder (8), antes que MilestoneExpired | No |
| 28 | Si falla el reembolso (token falso que falla), los estados no cambian | Donante | La transacción se revierte: hitos y estado general sin cambios | No |
