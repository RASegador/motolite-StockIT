// Real (email) low-stock notifications — the missing piece behind the
// in-app LowStockDigest banner (src/reports/LowStockDigest.jsx), which can
// only ever notify someone already looking at the app. This runs on a
// schedule independent of anyone having the app open at all.
//
// NOT deployable as-is without the project owner's own setup — this needs:
//   1. The Firebase project upgraded to the Blaze (pay-as-you-go) plan —
//      required for any Cloud Function, scheduled or not.
//   2. An email-sending account with a provider (this uses Resend —
//      https://resend.com — because its API is a single authenticated
//      fetch with no SDK to install, but swap buildAndSendEmail() for
//      whatever provider is preferred).
//   3. That provider's API key set as a function secret:
//        firebase functions:secrets:set RESEND_API_KEY
//   4. Recipient emails added to Firestore at settings/notifications,
//      e.g. { emails: ["owner@example.com", "manager@example.com"] }.
//   5. Deploy: `cd functions && npm install && firebase deploy --only functions`
//
// See functions/README.md for the full walkthrough.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

// Mirrors src/lib/units.js's reorderThresholdInBase() — duplicated rather
// than imported because Cloud Functions is a separate Node package from
// the frontend build; keep the two in sync if the threshold logic ever
// changes on either side.
function reorderThresholdInBase(item) {
  const base = { name: item.baseUnitName || 'Piece', factor: 1 };
  const units = [base, ...(item.units || [])];
  const unit = units.find((u) => u.name === item.reorderUnit) || units[0];
  return (Number(item.reorderPoint) || 0) * (unit?.factor || 1);
}

async function findLowStockItems() {
  const [itemsSnap, shopsSnap] = await Promise.all([db.collection('items').get(), db.collection('shops').get()]);
  const shopById = new Map(shopsSnap.docs.map((d) => [d.id, d.data()]));
  return itemsSnap.docs
    .map((d) => d.data())
    .filter((item) => (item.quantity || 0) <= reorderThresholdInBase(item))
    .map((item) => ({ ...item, shopName: shopById.get(item.shopId)?.name || item.shopId || '—' }));
}

async function buildAndSendEmail(apiKey, recipients, lowStockItems) {
  const rows = lowStockItems
    .map((it) => `<tr><td>${it.shopName}</td><td>${it.sku || ''}</td><td>${it.name || ''}</td><td>${it.quantity || 0}</td></tr>`)
    .join('');
  const html = `
    <h2>Motolite IMS — Low Stock Alert</h2>
    <p>${lowStockItems.length} item${lowStockItems.length === 1 ? '' : 's'} at or below reorder point.</p>
    <table border="1" cellpadding="6" style="border-collapse:collapse">
      <tr><th>Shop</th><th>SKU</th><th>Item</th><th>Stock</th></tr>
      ${rows}
    </table>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Motolite IMS <alerts@yourdomain.example>', // must be a domain verified with Resend
      to: recipients,
      subject: `Low stock: ${lowStockItems.length} item(s) need attention`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Email send failed: ${res.status} ${await res.text()}`);
}

// Runs every 6 hours. Sends at most once per calendar day (UTC) — checked
// against settings/notifications.lastSentDate — so a shop with the same
// three items sitting low all day doesn't get paged six times before
// anyone's had a chance to act on the first email.
exports.lowStockDigestEmail = onSchedule(
  { schedule: 'every 6 hours', secrets: [RESEND_API_KEY] },
  async () => {
    const settingsRef = db.doc('settings/notifications');
    const settingsSnap = await settingsRef.get();
    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    const recipients = settings.emails || [];
    if (recipients.length === 0) {
      console.log('No recipient emails configured at settings/notifications.emails — skipping.');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (settings.lastSentDate === today) {
      console.log('Already sent today — skipping.');
      return;
    }

    const lowStockItems = await findLowStockItems();
    if (lowStockItems.length === 0) {
      console.log('Nothing below reorder point — nothing to send.');
      return;
    }

    await buildAndSendEmail(RESEND_API_KEY.value(), recipients, lowStockItems);
    await settingsRef.set({ lastSentDate: today }, { merge: true });
    console.log(`Sent low-stock digest for ${lowStockItems.length} item(s) to ${recipients.length} recipient(s).`);
  }
);
