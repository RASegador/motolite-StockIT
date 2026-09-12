import { useState } from 'react';
import { Store, Plus, Pencil, Trash2 } from 'lucide-react';
import { useShops } from './useShops';
import { createShop, renameShop, deleteShop } from './shopActions';
import { db } from '../firebase';
import Tooltip from '../shared/Tooltip';
import Modal from '../shared/Modal';

export default function ShopsView() {
  const shops = useShops();
  const [showAddForm, setShowAddForm] = useState(false);
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
      setShowAddForm(false);
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
      <div className="section-header-row">
        <h2><Store size={18} /> Shops</h2>
        <button type="button" className="btn-primary" onClick={() => setShowAddForm(true)}><Plus size={16} /> Add shop</button>
      </div>
      {error && !showAddForm && <p className="shops-error">{error}</p>}

      {showAddForm && (
        <Modal title="Add Shop" onClose={() => setShowAddForm(false)} dirty={newName.trim() !== ''}>
          <form onSubmit={handleCreate} className="shops-create-form">
            <label className="item-form-field">
              <span className="item-form-field-label">Shop name</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New shop name" autoFocus />
            </label>
            {error && <p className="modal-error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary">Add shop</button>
            </div>
          </form>
        </Modal>
      )}

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
