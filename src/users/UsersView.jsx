import { useState } from 'react';
import { UserPlus, ShieldCheck } from 'lucide-react';
import { useUsers } from './useUsers';
import { createUser, updateUserRole, updateUserShop, setUserActive } from './userActions';
import { useShops } from '../shops/useShops';

const ROLES = ['owner', 'manager', 'cashier'];

export default function UsersView() {
  const users = useUsers();
  const shops = useShops();
  const [form, setForm] = useState({ email: '', fullName: '', role: 'cashier', shopId: '' });
  const [createdInfo, setCreatedInfo] = useState(null);
  const [error, setError] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setCreatedInfo(null);
    try {
      const { email, tempPassword } = { email: form.email, ...(await createUser(form)) };
      setCreatedInfo(`Created ${email}. Temporary password: ${tempPassword}`);
      setForm({ email: '', fullName: '', role: 'cashier', shopId: '' });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="users-view">
      <h2><ShieldCheck size={18} /> Users</h2>
      <form onSubmit={handleCreate} className="users-create-form">
        <input placeholder="Email" type="email" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input placeholder="Full name" value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {form.role !== 'owner' && (
          <select value={form.shopId} onChange={(e) => setForm({ ...form, shopId: e.target.value })} required>
            <option value="">Assign shop…</option>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <button type="submit"><UserPlus size={16} /> Create user</button>
      </form>
      {createdInfo && <p className="users-created-info">{createdInfo}</p>}
      {error && <p className="users-error">{error}</p>}

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
                <button onClick={() => setUserActive(u.uid, !u.active)}>
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
