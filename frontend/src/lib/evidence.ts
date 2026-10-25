// Huellas SHA-256 de las evidencias, calculadas en el navegador.
//
// - Cada archivo lleva un salt aleatorio de 16 bytes (docs/rgpd.md): sha256(salt || archivo).
//   Así el hash no permite adivinar documentos predecibles. El salt se guarda en
//   Supabase (evidencias.salt) para poder recomprobar el archivo después.
// - El hash del conjunto es sha256(JSON.stringify(hashesOrdenados)): 32 bytes que se
//   pasan tal cual como BytesN<32> a approve_milestone. En la base de datos va en hex.

export const SALT_BYTES = 16;

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^([0-9a-f]{2})*$/i.test(hex)) throw new Error('Texto hexadecimal no válido.');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function sha256Hex(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

export function randomSaltHex(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/** sha256(salt || bytes del archivo), en hex. */
export async function saltedHash(blob: Blob, saltHex: string): Promise<string> {
  const salt = fromHex(saltHex);
  const content = new Uint8Array(await blob.arrayBuffer());
  const data = new Uint8Array(salt.length + content.length);
  data.set(salt, 0);
  data.set(content, salt.length);
  return sha256Hex(data);
}

export async function hashEvidenceFile(file: File): Promise<{ sha256: string; salt: string }> {
  const salt = randomSaltHex();
  return { sha256: await saltedHash(file, salt), salt };
}

/** Hash del conjunto: no depende del orden en que se eligieron los archivos. */
export async function combinedEvidenceHash(fileHashes: string[]): Promise<string> {
  const sorted = [...fileHashes].sort();
  return sha256Hex(new TextEncoder().encode(JSON.stringify(sorted)));
}

/** Comprueba que un archivo descargado coincide con la huella guardada. */
export async function verifyEvidence(blob: Blob, saltHex: string, expectedSha256: string): Promise<boolean> {
  return (await saltedHash(blob, saltHex)) === expectedSha256.toLowerCase();
}
