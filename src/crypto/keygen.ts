/**
 * Ed25519 key generation utility.
 * Run: npx tsx src/crypto/keygen.ts
 * Prints keys to stdout with instructions for .env.
 */

import { generateKeyPairSync } from 'crypto';

export interface Ed25519KeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Generate Ed25519 key pair. Returns hex-encoded raw keys.
 * For .env, use base64 of PEM; see printKeygenInstructions().
 */
export function generateEd25519KeyPair(): Ed25519KeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { format: 'der', type: 'pkcs8' },
    publicKeyEncoding: { format: 'der', type: 'spki' },
  });
  return {
    publicKey: (publicKey as Buffer).toString('hex'),
    privateKey: (privateKey as Buffer).toString('hex'),
  };
}

/**
 * Generate keys and return base64-encoded (for .env).
 */
export function generateEd25519KeyPairBase64(): { publicKeyB64: string; privateKeyB64: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { format: 'der', type: 'pkcs8' },
    publicKeyEncoding: { format: 'der', type: 'spki' },
  });
  return {
    publicKeyB64: (publicKey as Buffer).toString('base64'),
    privateKeyB64: (privateKey as Buffer).toString('base64'),
  };
}

function printKeygenInstructions(): void {
  const { publicKeyB64, privateKeyB64 } = generateEd25519KeyPairBase64();
  const hex = generateEd25519KeyPair();
  console.log(`
Ed25519 certification signing keys generated.
Add these to your .env for production:

CERT_SIGNING_PRIVATE_KEY=${privateKeyB64}
CERT_SIGNING_PUBLIC_KEY=${publicKeyB64}

In development, keys are auto-generated when not set.
In production (NODE_ENV=production), these are REQUIRED.
Run: npx tsx src/crypto/keygen.ts to regenerate.
`);
  console.log('Hex (for reference):');
  console.log('privateKey (hex):', hex.privateKey);
  console.log('publicKey (hex):', hex.publicKey);
}

const isMain = process.argv[1]?.includes('keygen');
if (isMain) {
  printKeygenInstructions();
}
