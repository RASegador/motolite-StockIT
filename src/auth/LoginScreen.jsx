import { useState } from 'react';

export default function LoginScreen({ onLogin, onResetPassword }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onLogin(email, password);
    } catch {
      setError('Incorrect email or password.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset() {
    if (!email) { setError('Enter your email above first, then click "Forgot password".'); return; }
    await onResetPassword(email);
    setResetSent(true);
  }

  return (
    <div className="login-screen">
      <img src="/branding/motolite-logo.png" alt="Motolite" className="login-logo" />
      <h1>Motolite IMS</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="login-error">{error}</p>}
        {resetSent && <p className="login-info">Password reset email sent.</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="login-link" onClick={handleReset}>Forgot password?</button>
      </form>
    </div>
  );
}
