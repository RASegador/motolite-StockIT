import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

// A once-a-day, dismissible summary banner shown at the top of a
// dashboard — the low-stock alerts table elsewhere (Restock section, the
// Admin dashboard's own table further down the page) only helps someone
// who's already looking for it. This puts the same fact somewhere it's
// seen without going looking, which is what was missing (see the
// "low-stock notification beyond the in-app alert table" recommendation).
//
// This is a client-side-only, in-app notification, not a push/email/SMS
// one — a real one needs a backend (a Cloud Function watching for
// threshold crossings + an email/SMS provider), which this project has
// neither of. Treat this as the first step, not a replacement for that.
//
// Dismissal is per-day AND per-exact-alert-set (a signature over sorted
// item ids), stored in localStorage: dismissing today's alerts hides the
// banner for the rest of today, but if a NEW item drops below its reorder
// point later today, the signature changes and the banner reappears — it
// never permanently silences an alert just because a similar-looking one
// was dismissed before.
function dismissKey(scopeKey, alerts) {
  const signature = alerts.map((a) => a.itemId).sort().join(',');
  const day = new Date().toISOString().slice(0, 10);
  return `motolite-lowstock-dismissed:${scopeKey}:${day}:${signature}`;
}

function readDismissed(key) {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    // Private window, storage disabled, etc. — the banner just can't
    // remember a dismissal across reloads; it still works within the page.
    return false;
  }
}

export default function LowStockDigest({ alerts, scopeKey }) {
  // Forces a re-check of localStorage after a dismiss click — the
  // dismissed/not-dismissed state genuinely lives in storage, not React
  // state, so this only needs to trigger a re-render, not hold the value.
  const [, forceRerender] = useState(0);

  if (!alerts || alerts.length === 0) return null;
  const key = dismissKey(scopeKey, alerts);
  if (readDismissed(key)) return null;

  const preview = alerts.slice(0, 3);
  const extra = alerts.length - preview.length;

  function handleDismiss() {
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      // Nothing to do — see readDismissed's comment.
    }
    forceRerender((n) => n + 1);
  }

  return (
    <div className="low-stock-digest" role="status">
      <AlertTriangle size={16} />
      <span className="low-stock-digest-text">
        {alerts.length} item{alerts.length === 1 ? '' : 's'} at or below reorder point
        {preview.length > 0 && (
          `: ${preview.map((a) => a.name || a.sku).join(', ')}${extra > 0 ? `, +${extra} more` : ''}`
        )}. See Restock for details.
      </span>
      <button type="button" className="low-stock-digest-dismiss" onClick={handleDismiss} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}
