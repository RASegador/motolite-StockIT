// A high-entropy, unguessable token for anything a stranger might present
// back to the system (a scanned transaction QR code, in particular) — unlike
// `newId()` in format.js, which is fine for internal document IDs but is not
// meant to resist someone trying to enumerate or guess other people's IDs.
//
// 16 random bytes (128 bits) hex-encoded. Uses the Web Crypto API, which is
// available in every modern browser and in Node's test environment (jsdom
// polyfills `crypto` via Node's own webcrypto in recent Node versions).
export function generateSecureToken(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Extremely defensive fallback for an environment with no Web Crypto at
    // all — not expected to ever run in a browser or in tests.
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
