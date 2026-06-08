import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}


export const isIframe = window.self !== window.top;

/**
 * Cryptographically secure random identifier.
 * Uses crypto.randomUUID() where available, falling back to
 * crypto.getRandomValues(). Never uses Math.random().
 */
export function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Build an idempotency key whose uniqueness is guaranteed by a
 * cryptographically secure random suffix rather than a timestamp.
 * Passing a stable `token` (e.g. a ticket or redemption id) preserves
 * real idempotency for retries of the same logical operation; omitting
 * it generates a fresh unique key per call.
 */
export function makeIdempotencyKey(prefix, token) {
  return `${prefix}_${token ?? randomId()}`;
}
