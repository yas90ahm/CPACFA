/**
 * Ed25519 signing for certification artifacts.
 * Private key: CERT_SIGNING_PRIVATE_KEY (base64 of PEM or DER).
 * Public key: CERT_SIGNING_PUBLIC_KEY (base64 of PEM or DER).
 * MODE=prod/demo: keys required; fail fast at startup if missing.
 * MODE=dev: keys optional; signing disabled when missing.
 */

import { createPrivateKey, createPublicKey, sign, verify } from 'crypto';
import type { KeyObject } from 'crypto';
import { getMode } from './runtime_mode.js';

const ALG = 'ed25519';

let _privateKey: KeyObject | null = null;
let _publicKey: KeyObject | null = null;
let _publicKeyB64: string = '';
let _keysLoaded = false;

/** Reset cached keys (for tests). */
export function resetSigningKeysCache(): void {
  _keysLoaded = false;
  _privateKey = null;
  _publicKey = null;
  _publicKeyB64 = '';
}

function loadKeys(): void {
  if (_keysLoaded) return;
  _keysLoaded = true;
  const privB64 = process.env.CERT_SIGNING_PRIVATE_KEY?.trim();
  const pubB64 = process.env.CERT_SIGNING_PUBLIC_KEY?.trim();
  if (privB64 && pubB64) {
    try {
      const privBuf = Buffer.from(privB64, 'base64');
      const pubBuf = Buffer.from(pubB64, 'base64');
      const privStr = privBuf.toString('utf8');
      const pubStr = pubBuf.toString('utf8');
      _privateKey = privStr.startsWith('-----')
        ? createPrivateKey(privStr)
        : createPrivateKey({ key: privBuf, format: 'der', type: 'pkcs8' });
      _publicKey = pubStr.startsWith('-----')
        ? createPublicKey(pubStr)
        : createPublicKey({ key: pubBuf, format: 'der', type: 'spki' });
      _publicKeyB64 = pubB64;
    } catch {
      _privateKey = null;
      _publicKey = null;
      _publicKeyB64 = '';
    }
  }
}

export function isSigningConfigured(): boolean {
  loadKeys();
  return _privateKey != null && _publicKey != null;
}

export function getPublicKeyB64(): string {
  loadKeys();
  return _publicKeyB64;
}

export function assertSigningKeysInStrictMode(): void {
  loadKeys();
  const mode = getMode();
  if (mode === 'dev') return;
  if (!_privateKey || !_publicKey) {
    throw new Error(
      '[FATAL] MODE=' + mode + ': CERT_SIGNING_PRIVATE_KEY and CERT_SIGNING_PUBLIC_KEY must be set (base64). Refusing to start.'
    );
  }
}

export interface SignResult {
  signatureB64: string;
  publicKeyB64: string;
  alg: string;
  signed: boolean;
}

/** Sign artifact hash (hex). Returns signed=false when keys not configured (dev). */
export function signArtifactHash(hashHex: string): SignResult {
  loadKeys();
  if (!_privateKey || !_publicKey) {
    return {
      signatureB64: '',
      publicKeyB64: '',
      alg: ALG,
      signed: false,
    };
  }
  const hashBuf = Buffer.from(hashHex, 'hex');
  const sig = sign(null, hashBuf, _privateKey);
  return {
    signatureB64: sig.toString('base64'),
    publicKeyB64: _publicKeyB64,
    alg: ALG,
    signed: true,
  };
}

/** Verify signature over artifact hash. Returns false when signature invalid. */
export function verifyArtifactHash(
  hashHex: string,
  signatureB64: string,
  publicKeyB64: string
): boolean {
  if (!signatureB64 || !publicKeyB64) return false;
  try {
    const hashBuf = Buffer.from(hashHex, 'hex');
    const sigBuf = Buffer.from(signatureB64, 'base64');
    const pubBuf = Buffer.from(publicKeyB64, 'base64');
    const pubStr = pubBuf.toString('utf8');
    const pubKey = pubStr.startsWith('-----')
      ? createPublicKey(pubStr)
      : createPublicKey({ key: pubBuf, format: 'der', type: 'spki' });
    return verify(null, hashBuf, pubKey, sigBuf);
  } catch {
    return false;
  }
}
