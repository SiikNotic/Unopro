// The player's consent at sign-up: 18 or older, and acceptance of the Terms, the Privacy Policy and the
// Virtual Currency Rules. The server records it (accept_terms) and checks it wherever coins move; the
// app only asks for it and remembers, across the sign-up redirect, that the boxes were ticked.
import { storage } from '@/storage';
import { LEGAL_CONFIG } from './config';

/** The version of the texts (their date). Must match public.terms_version() in the database. */
export const TERMS_VERSION = LEGAL_CONFIG.updated;

const PENDING_KEY = 'legal.pendingConsent';
const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Ticked before creating an account (email, Google or Discord): accepted on the server once signed in. */
export function rememberConsent(now = Date.now()): void {
  storage.set(PENDING_KEY, { version: TERMS_VERSION, at: now });
}

/** True (once) if this device ticked the boxes for the current texts recently. */
export function takePendingConsent(now = Date.now()): boolean {
  const p = storage.get<{ version?: unknown; at?: unknown }>(PENDING_KEY);
  storage.remove(PENDING_KEY);
  return !!p && p.version === TERMS_VERSION && typeof p.at === 'number' && now - p.at >= 0 && now - p.at < PENDING_TTL_MS;
}

export interface Consent {
  adult: boolean;
  terms: boolean;
}
/** Both boxes ticked: 18 or older, and the legal texts accepted. */
export const consentGiven = (c: Consent) => c.adult && c.terms;
