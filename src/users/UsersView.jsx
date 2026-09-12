import { useState } from 'react';
import { UserPlus, ShieldCheck } from 'lucide-react';
import { useUsers } from './useUsers';
import {
  createUser, updateUserRole, updateUserShop, setUserActive, setOwnUsername,
} from './userActions';
import { useShops } from '../shops/useShops';
import { encodeLoginQr } from '../lib/credentials';
import Modal from '../shared/Modal';
import QRCodeImage from '../barcode/QRCodeImage';

// Owner is deliberately absent here — there is exactly one Owner account,
// created once out-of-band (scripts/create-owner.js), and it must never be
// creatable or assignable from this screen. Firestore rules enforce the
// same restriction server-side; this is just the UI staying consistent
// with what the rules would refuse anyway.
const CREATABLE_ROLES = ['manager', 'cashier', 'warehouse'];
const BLANK_FORM = { username: '', fullName: '', role: 'cashier', shopId: '' };

function OwnUsernameField({ uid, current }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (current) return <span>{current}</span>;
  if (!editing) {
    return <button type="button" className="btn-link" onClick={() => setEditing(true)}>Set username…</button>;
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      await setOwnUsername(uid, value);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="users-inline-username">
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="username" autoFocus style={{ width: 120 }} />
      <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>Save</button>
      <button type="button" className="btn-secondary" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
      {error && <p className="modal-error">{error}</p>}
    </span>
  );
}

export default function UsersView({ currentUid }) {
  const users = useUsers();
  const shops = useShops();
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [createdInfo, setCreatedInfo] = useState(null);
  const [error, setError] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      const { uid, username, otp } = await createUser(form);
      setCreatedInfo({ uid, username, otp, fullName: form.fullName });
      setForm(BLANK_FORM);
      setShowAddForm(false);
    } catch (err) {
      setError(err.message);
    }
  }

  const formDirty = JSON.stringify(form) !== JSON.stringify(BLANK_FORM);

  return (
    <div className="users-view">
      <div className="section-header-row">
        <h2><ShieldCheck size={18} /> Users</h2>
        <button type="button" className="btn-primary" onClick={() => setShowAddForm(true)}><UserPlus size={16} /> Create user</button>
      </div>
      {error && !showAddForm && <p className="users-error">{error}</p>}

      {showAddForm && (
        <Modal title="Create User" onClose={() => setShowAddForm(false)} dirty={formDirty}>
          <form onSubmit={handleCreate} className="item-form users-create-form">
            <div className="item-form-grid">
              <label className="item-form-field">
                <span className="item-form-field-label">Username</span>
                <input value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })} required autoFocus
                  placeholder="letters, numbers, . _ -" />
              </label>
              <label className="item-form-field">
                <span className="item-form-field-label">Full name</span>
                <input value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
              </label>
              <label className="item-form-field">
                <span className="item-form-field-label">Role</span>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {CREATABLE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label className="item-form-field">
                <span className="item-form-field-label">Shop</span>
                <select value={form.shopId} onChange={(e) => setForm({ ...form, shopId: e.target.value })} required>
                  <option value="">Assign shop…</option>
                  {shops.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.type === 'warehouse' ? 'Warehouse' : 'Store'})</option>)}
                </select>
              </label>
            </div>
            <p className="item-form-shop-confirm">
              A one-time password and login QR code will be generated automatically — you'll see them once, right after saving.
            </p>
            {error && <p className="modal-error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary">Create user</button>
            </div>
          </form>
        </Modal>
      )}

      {createdInfo && (
        <Modal title="Account Created" onClose={() => setCreatedInfo(null)} dirty={false}>
          <div className="item-form">
            <p>
              Share these sign-in details with <strong>{createdInfo.fullName}</strong> now — the password won't be shown again.
              They'll be asked to set their own password the first time they sign in.
            </p>
            <div className="item-form-grid">
              <div className="item-form-field">
                <span className="item-form-field-label">Username</span>
                <p className="credential-value">{createdInfo.username}</p>
              </div>
              <div className="item-form-field">
                <span className="item-form-field-label">One-time password</span>
                <p className="credential-value">{createdInfo.otp}</p>
              </div>
            </div>
            <div className="credentials-qr">
              <QRCodeImage value={encodeLoginQr(createdInfo.username, createdInfo.otp)} size={160} />
              <p className="item-form-codes-hint">Scan at the login screen to sign in instantly.</p>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-primary" onClick={() => setCreatedInfo(null)}>Done</button>
            </div>
          </div>
        </Modal>
      )}

      <table className="users-table">
        <thead>
          <tr><th>Name</th><th>Username</th><th>Role</th><th>Shop</th><th>Status</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.uid}>
              <td>{u.fullName}</td>
              <td>
                {u.role === 'owner' && u.uid === currentUid
                  ? <OwnUsernameField uid={u.uid} current={u.username} />
                  : (u.username || '—')}
              </td>
              <td>
                {u.role === 'owner'
                  ? <span className="users-owner-badge">Owner</span>
                  : (
                    <select value={u.role} onChange={(e) => updateUserRole(u.uid, e.target.value)}>
                      {CREATABLE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
              </td>
              <td>
                {u.role === 'owner' ? '—' : (
                  <select value={u.shopId || ''} onChange={(e) => updateUserShop(u.uid, e.target.value)}>
                    <option value="">Unassigned</option>
                    {shops.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.type === 'warehouse' ? 'Warehouse' : 'Store'})</option>)}
                  </select>
                )}
              </td>
              <td>
                {u.role === 'owner' ? '—' : (
                  <button className={u.active ? 'btn-danger' : 'btn-secondary'} onClick={() => setUserActive(u.uid, !u.active)}>
                    {u.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
