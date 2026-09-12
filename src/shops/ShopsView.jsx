import { useState } from 'react';
import { Store, Plus, Pencil, Trash2 } from 'lucide-react';
import { useShops } from './useShops';
import { createShop, renameShop, deleteShop } from './shopActions';
import { db } from '../firebase';
import Tooltip from '../shared/Tooltip';

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
        <button type="submit" className="btn-primary"><Plus size={16} /> Add shop</button>
      </form>
      {error && <p className="shops-error">{error}</p>}
      <ul className="shops-list">
        {shops.map((shop) => (
          <li key={shop.id} className="list-row">
            {editingId === shop.id ? (
              <>
                <input value={editingName} onChange={(e) => setEditingName(e.target.value)} />
                <div className="list-row-actions">
                  <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                  <button className="btn-primary" onClick={() => handleRename(shop.id)}>Save</button>
                </div>
              </>
            ) : (
              <>
                <span>{shop.name}</span>
                <div className="list-row-actions">
                  <Tooltip label="Edit shop name">
                    <button className="icon-button" aria-label="Edit" onClick={() => { setEditingId(shop.id); setEditingName(shop.name); }}>
                      <Pencil size={14} />
                    </button>
                  </Tooltip>
                  <Tooltip label="Delete this shop">
                    <button className="icon-button icon-button-danger" aria-label="Delete" onClick={() => deleteShop(db, shop.id)}>
                      <Trash2 size={14} />
                    </button>
                  </Tooltip>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
