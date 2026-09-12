import { useState } from 'react';

// Shown instead of the app shell whenever the signed-in profile has
// mustChangePassword: true — a brand-new Manager/Cashier account, or
// anyone whose Owner re-issued them a one-time password. There is no way
// out of this screen except setting a real password (or signing out);
// App.jsx enforces that by rendering this in place of everything else.
export default function ChangePasswordScreen({ onSubmit, onLogout }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSubmitting(true);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <img src="/branding/motolite-logo.png" alt="Motolite" className="login-logo" />
      <h1>Set a new password</h1>
      <p className="login-info">This is your first sign-in with a one-time password. Choose a personal password to continue — your one-time password stops working as soon as you do.</p>
      <form onSubmit={handleSubmit} className="item-form">
        <div className="item-form-grid">
          <label className="item-form-field">
            <span className="item-form-field-label">New password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          </label>
          <label className="item-form-field">
            <span className="item-form-field-label">Confirm password</span>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
        </div>
        {error && <p className="login-error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Set password & continue'}</button>
        <button type="button" className="login-link" onClick={onLogout}>Sign out</button>
      </form>
    </div>
  );
}
