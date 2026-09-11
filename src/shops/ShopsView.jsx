import { useState } from 'react';
import { Store, Plus, Pencil, Trash2 } from 'lucide-react';
import { useShops } from './useShops';
import { createShop, renameShop, deleteShop } from './shopActions';
import { db } from '../firebase';

export default function ShopsView() {
  const shops = useShops();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await createShop(db, newName);
      setNewName('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRename(shopId) {
    try {
      await renameShop(db, shopId, editingName);
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="shops-view">
      <h2><Store size={18} /> Shops</h2>
      <form onSubmit={handleCreate} className="shops-create-form">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New shop name" />
        <button type="submit"><Plus size={16} /> Add shop</button>
      </form>
      {error && <p className="shops-error">{error}</p>}
      <ul className="shops-list">
        {shops.map((shop) => (
          <li key={shop.id}>
            {editingId === shop.id ? (
              <>
                <input value={editingName} onChange={(e) => setEditingName(e.target.value)} />
                <button onClick={() => handleRename(shop.id)}>Save</button>
                <button onClick={() => setEditingId(null)}>Cancel</button>
              </>
            ) : (
              <>
                <span>{shop.name}</span>
                <button onClick={() => { setEditingId(shop.id); setEditingName(shop.name); }}>
                  <Pencil size={14} />
                </button>
                <button onClick={() => deleteShop(db, shop.id)}>
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
