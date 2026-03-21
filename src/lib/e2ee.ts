/**
 * End-to-End Encryption (E2EE) utilities using Web Crypto API
 * Uses ECDH P-256 for key exchange + AES-256-GCM for message encryption
 */

const DB_NAME = 'vybe_e2ee';
const STORE_NAME = 'keys';
const KEY_ID = 'main_keypair';

// ── IndexedDB helpers ─────────────────────────────────────
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Key Generation ────────────────────────────────────────
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // extractable (needed for export)
    ['deriveKey', 'deriveBits']
  );
}

export async function exportPublicKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

async function exportPrivateKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

// ── Local Key Storage (IndexedDB) ─────────────────────────
export async function getOrCreateLocalKeyPair(): Promise<{
  publicKey: JsonWebKey;
  privateKey: CryptoKey;
}> {
  const stored = await idbGet<{ publicJwk: JsonWebKey; privateJwk: JsonWebKey }>(KEY_ID);

  if (stored) {
    const privateKey = await importPrivateKey(stored.privateJwk);
    return { publicKey: stored.publicJwk, privateKey };
  }

  // Generate new pair
  const keyPair = await generateKeyPair();
  const publicJwk = await exportPublicKey(keyPair.publicKey);
  const privateJwk = await exportPrivateKey(keyPair.privateKey);

  await idbSet(KEY_ID, { publicJwk, privateJwk });

  return { publicKey: publicJwk, privateKey: keyPair.privateKey };
}

export async function hasLocalKeys(): Promise<boolean> {
  const stored = await idbGet(KEY_ID);
  return !!stored;
}

// ── Shared Secret Derivation ──────────────────────────────
async function deriveAESKey(
  privateKey: CryptoKey,
  otherPublicJwk: JsonWebKey
): Promise<CryptoKey> {
  const otherPublicKey = await importPublicKey(otherPublicJwk);

  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: otherPublicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Encrypt / Decrypt ─────────────────────────────────────
export async function encryptMessage(
  plaintext: string,
  myPrivateKey: CryptoKey,
  recipientPublicJwk: JsonWebKey
): Promise<string> {
  const aesKey = await deriveAESKey(myPrivateKey, recipientPublicJwk);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  );

  // Pack iv + ciphertext into a single base64 string
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return `e2ee:${btoa(String.fromCharCode(...combined))}`;
}

export async function decryptMessage(
  encrypted: string,
  myPrivateKey: CryptoKey,
  senderPublicJwk: JsonWebKey
): Promise<string> {
  if (!encrypted.startsWith('e2ee:')) return encrypted; // not encrypted

  const payload = encrypted.slice(5);
  const raw = Uint8Array.from(atob(payload), c => c.charCodeAt(0));

  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12);

  const aesKey = await deriveAESKey(myPrivateKey, senderPublicJwk);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

export function isEncrypted(content: string | null): boolean {
  return !!content && content.startsWith('e2ee:');
}
