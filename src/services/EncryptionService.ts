/**
 * EncryptionService – SHA-256 + AES-GCM 256 bits (Web Crypto API).
 *
 * Version PWA : utilise exclusivement crypto.subtle (disponible dans tous
 * les navigateurs modernes supportant getUserMedia).
 * La clé AES est stockée en hex dans localStorage.
 */

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONSENT_VERSION = '1.0';
export { CONSENT_VERSION };

const KEY_STORAGE_ID = 'painface_aes_key';

// ─── Singleton ────────────────────────────────────────────────────────────────

let _cryptoKey: CryptoKey | null = null;

// ─── Helpers binaires ─────────────────────────────────────────────────────────

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuf(hex: string): Uint8Array {
  const pairs = hex.match(/.{2}/g) ?? [];
  return new Uint8Array(pairs.map((h) => parseInt(h, 16)));
}

// ─── Gestion de la clé AES ────────────────────────────────────────────────────

async function getCryptoKey(): Promise<CryptoKey> {
  if (_cryptoKey) return _cryptoKey;

  const stored = localStorage.getItem(KEY_STORAGE_ID);
  let rawKey: Uint8Array;

  if (stored) {
    rawKey = hexToBuf(stored);
  } else {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const exported = await crypto.subtle.exportKey('raw', key);
    rawKey = new Uint8Array(exported);
    localStorage.setItem(KEY_STORAGE_ID, bufToHex(exported));
  }

  _cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return _cryptoKey;
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Calcule le SHA-256 d'une chaîne (retour hex).
 */
export async function sha256(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return bufToHex(digest);
}

/**
 * Chiffre un texte avec AES-GCM 256 bits.
 * Format de sortie : "<iv_hex>:<cipher_hex>"
 */
export async function encryptText(plain: string): Promise<string> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plain);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );
  return `${bufToHex(iv.buffer as ArrayBuffer)}:${bufToHex(cipherBuf)}`;
}

/**
 * Déchiffre un texte produit par encryptText.
 * Format attendu : "<iv_hex>:<cipher_hex>"
 */
export async function decryptText(cipher: string): Promise<string> {
  const [ivHex, cipherHex] = cipher.split(':');
  if (!ivHex || !cipherHex)
    throw new Error('[EncryptionService] Format cipher invalide');
  const key = await getCryptoKey();
  const ivBuf = hexToBuf(ivHex);
  const cipherBuf = hexToBuf(cipherHex);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuf.buffer as ArrayBuffer },
    key,
    cipherBuf.buffer as ArrayBuffer,
  );
  return new TextDecoder().decode(plain);
}

/** Retourne la clé AES brute en hex (usage debug uniquement). */
export function getKeyHex(): string {
  return localStorage.getItem(KEY_STORAGE_ID) ?? '';
}
