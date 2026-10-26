# Revisión de seguridad de AidRelease (`lib.rs`, rama `feature/aidrelease-contract`)

Revisión manual hecha leyendo el código, **sin haber ejecutado aún `cargo test`**. No es una auditoría: el contrato solo es válido para la red de pruebas.

## 1. Resultado general

No he encontrado fallos que permitan robar fondos, pagar dos veces ni saltarse al verificador. Hay un cambio recomendable (TTL), una decisión pendiente (el token) y varios riesgos que conviene documentar.

## 2. Autorizaciones

| Función | Firma exigida | Correcto |
|---|---|---|
| `__constructor` | donante | Sí. Nadie puede crear una beca a nombre de otro donante |
| `fund` | donante | Sí |
| `approve_milestone` | verificador | Sí. `require_auth()` cubre también los argumentos, así que la firma queda ligada a `milestone_id` y `evidence_hash` |
| `claim_refund` | donante | Sí |
| `get_*` | ninguna | Sí, son de solo lectura |

El estudiante nunca firma nada y el contrato no tiene administrador ni función de actualización: nadie puede cambiar las reglas después de crearlo.

## 3. Códigos de error y orden de comprobación

Los 14 códigos coinciden con `docs/interfaz-contrato.md`. `approve_milestone` sigue el orden pactado: firma, estado general, existencia, estado del hito, orden, plazo. En `claim_refund` el orden es firma, `NotFunded`, `ScholarshipClosed`, `RefundNotAvailable`, y queda confirmado.

Diferencias con lo pactado:

- `fund` devuelve `MilestoneExpired` si ya pasó el plazo del primer hito. **No estaba en la especificación.** Es una buena protección, pero hay que documentarla y el frontend debe ocultar "Financiar" en ese caso (ver hallazgo 5).
- `InvalidToken` (14) no se usa en ningún sitio.

## 4. Plazos

| Operación | Regla en el código | Correcto |
|---|---|---|
| Aprobar | falla si `now > deadline` (se puede en el segundo exacto) | Sí |
| Reembolsar | falla si `now <= deadline` (solo después) | Sí |
| Financiar | falla si `now > deadline` del primer hito | Sí |
| Constructor | plazos estrictamente crecientes y posteriores a `now` | Sí |

No hay solapamiento: en el segundo exacto solo se puede aprobar, y un segundo después solo se puede reembolsar.

## 5. Hallazgos

| # | Gravedad | Dónde | Problema | Arreglo propuesto |
|---|---|---|---|---|
| 1 | Media | `renew_ttl` | El TTL solo se renueva cuando alguien escribe. Una beca financiada con plazos largos y sin actividad podría archivarse. Los fondos no se pierden (se restauran), pero las operaciones fallan hasta restaurar | Añadir una función pública `extend_ttl()` sin firma que solo renueve, y que el backend la llame periódicamente. Revisar el TTL máximo de la red y si extender la instancia también extiende el código |
| 2 | Media | `fund`, `approve_milestone`, `claim_refund` (token) | El token es cualquier dirección. Un token falso puede simular pagos sin mover valor real, y un token con control del emisor (congelación, revocación) puede bloquear el pago o el reembolso | Para testnet vale. Para mainnet: lista blanca de tokens en el constructor y usar `InvalidToken`. Opcional ahora: llamar a `decimals()` en el constructor para detectar direcciones que no son un token |
| 3 | Media | Diseño | Fondos bloqueados en tres casos: el donante pierde su clave (nadie más puede reembolsar), el estudiante no tiene trustline (el pago revierte siempre y al final se reembolsa), y tokens enviados por error al contrato (la contabilidad interna los ignora) | No es un fallo, es una decisión aceptada. Documentarlo y avisar en el frontend de que el estudiante necesita trustline antes de que el verificador apruebe |
| 4 | Baja | `approve_milestone` | `evidence_hash` no se valida (se acepta un hash de ceros) y no está ligado al contenido | Aceptable. El backend debe guardar a qué documento corresponde cada hash, con sal (RGPD) |
| 5 | Baja | `fund` | Una beca sin financiar tras el primer plazo queda inutilizable (no hay fondos atrapados, pero hay que crear otra) | Documentarlo y que el frontend lo muestre. Añadidos tests 46 a 48 |
| 6 | Baja | `claim_refund` | Hay ramas inalcanzables: `InvalidMilestoneId`, `MilestoneNotPending` y la comprobación `new_paid > total` en `approve_milestone`. No hacen daño | Dejar un comentario, o sustituirlas por `unreachable!` |
| 7 | Baja | Diseño | Un solo verificador sin cambio posible. Si pierde su clave o no responde, el estudiante no cobra y el donante recupera tras el plazo | Documentarlo. Para mainnet valorar un verificador multifirma |
| 8 | Info | Frontend | La hora del contrato es la del cierre del ledger. Una aprobación enviada justo antes del plazo puede incluirse después y fallar con `MilestoneExpired` | Aviso en el panel del verificador: aprobar con margen |
| 9 | Info | Eventos | No se emite evento al crear la beca | Opcional |

## 6. Cosas bien hechas

- Estado actualizado **antes** de la llamada al token, y si la transferencia falla se revierte todo. Además Soroban no permite reentrada por defecto.
- Contabilidad interna (`total - pagado - reembolsado`) en lugar del saldo real del token, de modo que nadie puede alterar un reembolso enviando tokens.
- Aritmética con `checked_*` y roles distintos validados.
- Pago doble imposible: el hito debe estar `Pending` y ser el siguiente.
- Reembolso único: la beca pasa a `Refunded`.
- Sin función de actualización ni administrador.

## 7. Cobertura de pruebas

Los 18 tests de la persona 1 cubren el camino feliz y los errores de las operaciones. Mi plan (`test_plan.rs`, 51 tests) añade:

- Errores del constructor.
- Firmante equivocado (no solo "sin firma").
- Pruebas de prioridad entre errores.
- Conservación del saldo.
- Fallo del token en el reembolso.
- Dos becas independientes.
- Casos 46 a 48 del nuevo control en `fund`.

Pendientes: eventos (caso 40) y TTL (caso 39), que dependen de la versión del SDK.

## 8. Antes de mainnet

Auditoría externa, lista blanca de tokens, límites de importe, verificador multifirma, estrategia de renovación del TTL, política de claves del donante y verificador, y revisión RGPD del backend.
