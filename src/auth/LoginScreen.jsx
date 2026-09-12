import { useRef, useState } from 'react';
import { decodeLoginQr } from '../lib/credentials';

export default function LoginScreen({ onLogin, onResetPassword }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const formRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onLogin(identifier, password);
    } catch {
      setError('Incorrect username/email or password.');
    } finally {
      setSubmitting(false);
    }
  }

  // A QR/barcode scanner acts as a keyboard, typing the code's text into
  // whatever field is focused. A login QR encodes "username:password" (see
  // encodeLoginQr) — recognizing that shape here means scanning it (with
  // the shop's existing barcode-scanner hardware, or a phone camera app
  // that types the result) fills both fields and signs in immediately, no
  // camera integration needed in this app. The actual password check still
  // runs exactly as if it had been typed by hand.
  function handleIdentifierChange(e) {
    const raw = e.target.value;
    const decoded = decodeLoginQr(raw);
    if (decoded) {
      setIdentifier(decoded.username);
      setPassword(decoded.password);
      setError('');
      // Let the two setState calls above land before reading the form.
      setTimeout(() => formRef.current?.requestSubmit(), 0);
      return;
    }
    setIdentifier(raw);
  }

  const looksLikeEmail = identifier.includes('@');

  async function handleReset() {
    if (!looksLikeEmail) {
      setError('Password reset by email only works for an email-based account. Ask your Owner/Admin about your username-based account.');
      return;
    }
    await onResetPassword(identifier);
    setResetSent(true);
  }

  return (
    <div className="login-screen">
      <img src="/branding/motolite-logo.png" alt="Motolite" className="login-logo" />
      <h1>Motolite IMS</h1>
      <form onSubmit={handleSubmit} ref={formRef} className="item-form">
        <div className="item-form-grid">
          <label className="item-form-field">
            <span className="item-form-field-label">Username or email</span>
            <input value={identifier} onChange={handleIdentifierChange} autoFocus required
              placeholder="Username, email, or scan your login QR code" />
          </label>
          <label className="item-form-field">
            <span className="item-form-field-label">Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
        </div>
        {error && <p className="login-error">{error}</p>}
        {resetSent && <p className="login-info">Password reset email sent.</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
        {looksLikeEmail && (
          <button type="button" className="login-link" onClick={handleReset}>Forgot password?</button>
        )}
      </form>
    </div>
  );
}
