# HackMeridian — Configuración Stellar Testnet

## Objetivo

Plataforma de becas basada en Stellar y Soroban, con pagos en tokens de prueba condicionados al cumplimiento de hitos académicos.

## Tecnologías

- Rust y Soroban SDK
- Stellar CLI 28.1.0
- Stellar Testnet
- React y TypeScript (frontend previsto)

## Instalación del entorno

Instalar Rust desde https://rustup.rs/.

Comprobar la instalación:

```powershell
rustc --version
cargo --version
```

Preparar WebAssembly:

```powershell
rustup target add wasm32v1-none
```

Instalar Stellar CLI y comprobar la versión:

```powershell
winget install --id Stellar.StellarCLI -e
stellar --version
```

Configurar la red:

```powershell
stellar network use testnet
```

## Crear cuentas de prueba

Cada desarrollador debe generar sus propias identidades locales:

```powershell
stellar keys generate donor --network testnet --fund
stellar keys generate student --network testnet --fund
stellar keys generate verifier --network testnet --fund
stellar keys generate issuer --network testnet --fund
```

Consultar los saldos:

```powershell
stellar token balance --id native --account donor --network testnet
stellar token balance --id native --account student --network testnet
stellar token balance --id native --account verifier --network testnet
stellar token balance --id native --account issuer --network testnet
```

## Activo de prueba USDCDEMO

Nombre del activo: `USDCDEMO`

Red: Stellar Testnet

Emisor del entorno inicial:

```text
GDENGNSPL5H255PAT65O47UXKV4YLV7UY4JMAWA6APGXSKOVIYVERBLJ
```

ID calculado del Stellar Asset Contract:

```text
CDFEDKZ6LWUS5JSHOFM5XVKCD6ALYGVDMREZYTYAZNOAFGQ6FJMLRA7Y
```

Para obtener el ID:

```powershell
stellar contract id asset --asset USDCDEMO:issuer --network testnet
```

**Nota:** `issuer` debe existir como identidad local y corresponder a la dirección del emisor indicada anteriormente. Cada miembro puede tener otras identidades de prueba, pero el ID del contrato depende del emisor concreto.

## Estado del desarrollo

- [x] Rust y Stellar CLI instalados en el primer entorno Windows.
- [x] Cuatro cuentas financiadas con XLM de prueba.
- [x] Identificador de USDCDEMO calculado.
- [ ] Despliegue del Stellar Asset Contract confirmado.
- [ ] Emisión de tokens de prueba.
- [ ] Transferencia de prueba verificada.
- [ ] Contrato escrow por hitos implementado.

## Seguridad

- Nunca subir claves privadas ni frases de recuperación.
- No subir archivos `.env` que contengan secretos.
- No utilizar cuentas reales ni fondos de mainnet.
- No almacenar documentación personal de estudiantes en blockchain.

Proyecto en desarrollo para HackMeridian.
