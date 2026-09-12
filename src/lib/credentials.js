// Username-based login lives entirely on the client-only Firebase SDK this
// app already uses (no Cloud Functions) — Firebase Auth always signs in
// with an "email" string, so a Username is turned into a deterministic,
// never-stored, never-looked-up synthetic email (`<username>@<domain>`)
// instead of a real mailbox. Nothing about this touches Firebase Auth's own
// password hashing/verification — only what string we hand it as the
// "email" field.
const SYNTHETIC_EMAIL_DOMAIN = 'users.motolite-ims.internal';
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,24}$/;

export function isValidUsername(username) {
  return USERNAME_PATTERN.test((username || '').trim());
}

export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

// The login screen's single "Username or email" field: a real email (kept
// as a working login path for the original Owner account, created with a
// real email before this feature existed) is used as-is; anything else is
// treated as a Username and turned into its synthetic email.
export function resolveLoginEmail(identifier) {
  const trimmed = (identifier || '').trim();
  if (trimmed.includes('@')) return trimmed;
  return usernameToEmail(trimmed);
}

// Excludes visually ambiguous characters (0/O, 1/I/l) since this is meant
// to be read off a screen and typed, or relayed verbally, by someone on
// their first sign-in.
const OTP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generateOtp(length = 8) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += OTP_ALPHABET[Math.floor(Math.random() * OTP_ALPHABET.length)];
  }
  return out;
}

// A QR/barcode-scanner "keyboard wedge" (the same kind of hardware this
// shop already uses for product barcodes) just types whatever the code
// encodes into the focused field. Encoding "username:password" as plain
// text means the login screen can recognize a scan (see decodeLoginQr)
// with no camera or new scanning library required — the actual
// authentication still runs the normal password check, so this is exactly
// as secure as typing the credentials in by hand, just faster.
export function encodeLoginQr(username, password) {
  return `${username}:${password}`;
}

export function decodeLoginQr(text) {
  const raw = text || '';
  const idx = raw.indexOf(':');
  if (idx <= 0 || idx === raw.length - 1) return null;
  return { username: raw.slice(0, idx), password: raw.slice(idx + 1) };
}
