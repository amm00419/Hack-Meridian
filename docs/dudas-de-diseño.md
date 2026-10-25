# Dudas de diseño

| Nº | Pregunta | Respuesta | Estado |
|---|---|---|---|
| 1 | ¿El token se pasa como parámetro al crear la beca o está fijo en el código? | | Abierta |
| 2 | ¿Qué pasa si el verificador pierde su clave? ¿Queda dinero bloqueado? | | Abierta |
| 3 | ¿Qué pasa si el estudiante pierde su clave o cambia de billetera? | | Abierta |
| 4 | El plazo vence en el instante X: ¿se aprueba con "menor que" o "menor o igual"? | | Abierta |
| 5 | ¿Cada beca guarda su dinero separado o todo va en un fondo común? | | Abierta |
| 6 | ¿Cómo se renueva la caducidad (TTL) de los datos de una beca? | | Abierta |
| 7 | ¿Los errores son códigos propios (por ejemplo "HitoYaPagado") o fallos genéricos? | | Abierta |
| 8 | ¿Se guardan eventos en la cadena (pagos y reembolsos) para que el frontend los muestre? | | Abierta |
| 9 | Aprobar dos veces el mismo hito: ¿MilestoneNotPending o WrongMilestoneOrder? | MilestoneNotPending (9), porque el estado del hito se comprueba antes que el orden | Resuelta |
| 10 | ¿Cuándo pasan los hitos a Expired y Cancelled? | Dentro de claim_refund: los pagados siguen Paid, el siguiente vencido pasa a Expired, los posteriores a Cancelled, todo en una transacción atómica | Resuelta |

## Orden de comprobaciones en approve_milestone

1. Autorización del verificador
2. Estado general de la beca (NotFunded o ScholarshipClosed)
3. Existencia del hito (InvalidMilestoneId)
4. Estado del hito (MilestoneNotPending)
5. Orden secuencial (WrongMilestoneOrder)
6. Fecha límite (MilestoneExpired)