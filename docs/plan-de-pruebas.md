# Plan de pruebas del contrato de becas por hitos

Red: testnet. Los tests unitarios se ejecutan en local con cargo test.

## Casos de prueba

| Nº | Caso | Quién llama | Resultado esperado | Hecho |
|---|---|---|---|---|
| 1 | Crear beca válida | Donante | Beca guardada, dinero en el contrato | No |
| 2 | Crear beca con importe 0 o negativo | Donante | Falla | No |
| 3 | Crear beca con plazo en el pasado | Donante | Falla | No |
| 4 | Crear beca con verificador igual al estudiante | Donante | Falla | No |
| 5 | Aprobar hito siendo el verificador, a tiempo | Verificador | Estudiante recibe el importe, hito Pagado | No |
| 6 | Aprobar hito sin ser el verificador | Otro | Falla | No |
| 7 | Aprobar hito dos veces | Verificador | La segunda vez falla | No |
| 8 | Aprobar hito vencido | Verificador | Falla | No |
| 9 | Reembolsar hito vencido y pendiente | Donante | Donante recupera el importe | No |
| 10 | Reembolsar hito antes del plazo | Donante | Falla | No |
| 11 | Reembolsar hito sin ser el donante | Otro | Falla | No |
| 12 | Reembolsar hito ya pagado | Donante | Falla | No |
| 13 | Pagar hito ya reembolsado | Verificador | Falla | No |
| 14 | Registrar evidencia sin ser el estudiante | Otro | Falla | No |
| 15 | Beca con varios hitos: pagar uno y reembolsar otro | Varios | Saldos correctos | No |
| 16 | Crear beca con un token distinto de USDCDEMO | Donante | Funciona igual (el contrato no depende de un token concreto) | No |

## Propiedades que siempre deben cumplirse

1. Conservación del dinero: lo depositado es igual a lo pagado, más lo reembolsado, más lo que sigue en el contrato.
2. Un hito solo cambia de estado una vez: de Pendiente a Pagado o a Reembolsado, y nunca más.
3. Solo el verificador puede pagar y solo el donante puede reembolsar.
4. Nadie puede cobrar más que el importe del hito.
5. Un hito vencido nunca se paga.

## Notas

- Importes: el token usa 7 decimales. 1 USDCDEMO = 10000000 unidades en el contrato.
- Los tests unitarios usan un token simulado creado en el propio test, no el token real de testnet.
