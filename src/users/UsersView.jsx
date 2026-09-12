import { useState } from 'react';
import { UserPlus, ShieldCheck } from 'lucide-react';
import { useUsers } from './useUsers';
import { createUser, updateUserRole, updateUserShop, setUserActive } from './userActions';
import { useShops } from '../shops/useShops';
import Modal from '../shared/Modal';

const ROLES = ['owner', 'manager', 'cashier'];
const BLANK_FORM = { email: '', fullName: '', role: 'cashier', shopId: '' };

export default function UsersView() {
  const users = useUsers();
  const shops = useShops();
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [createdInfo, setCreatedInfo] = useState(null);
  const [error, setError] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setCreatedInfo(null);
    try {
      const { email, tempPassword } = { email: form.email, ...(await createUser(form)) };
      setCreatedInfo(`Created ${email}. Temporary password: ${tempPassword}`);
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
      {createdInfo && <p className="users-created-info">{createdInfo}</p>}
      {error && !showAddForm && <p className="users-error">{error}</p>}

      {showAddForm && (
        <Modal title="Create User" onClose={() => setShowAddForm(false)} dirty={formDirty}>
          <form onSubmit={handleCreate} className="users-create-form">
            <label className="item-form-field">
              <span className="item-form-field-label">Email</span>
              <input type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} required autoFocus />
            </label>
            <label className="item-form-field">
              <span className="item-form-field-label">Full name</span>
              <input value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            </label>
            <label className="item-form-field">
              <span className="item-form-field-label">Role</span>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            {form.role !== 'owner' && (
              <label className="item-form-field">
                <span className="item-form-field-label">Shop</span>
                <select value={form.shopId} onChange={(e) => setForm({ ...form, shopId: e.target.value })} required>
                  <option value="">Assign shop…</option>
                  {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
            {error && <p className="modal-error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary">Create user</button>
            </div>
          </form>
        </Modal>
      )}

      <table className="users-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Shop</th><th>Status</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.uid}>
              <td>{u.fullName}</td>
              <td>{u.email}</td>
              <td>
                <select value={u.role} onChange={(e) => updateUserRole(u.uid, e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </td>
              <td>
                {u.role === 'owner' ? '—' : (
                  <select value={u.shopId || ''} onChange={(e) => updateUserShop(u.uid, e.target.value)}>
                    <option value="">Unassigned</option>
                    {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </td>
              <td>
                <button className={u.active ? 'btn-danger' : 'btn-secondary'} onClick={() => setUserActive(u.uid, !u.active)}>
                  {u.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
