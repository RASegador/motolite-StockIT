import { useState } from 'react';
import { Store, Warehouse, Plus, Pencil, Trash2 } from 'lucide-react';
import { useShops } from './useShops';
import { createShop, renameShop, deleteShop, setShopType } from './shopActions';
import { db } from '../firebase';
import Tooltip from '../shared/Tooltip';
import Modal from '../shared/Modal';

export default function ShopsView() {
  const shops = useShops();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('store');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await createShop(db, newName, newType);
      setNewName('');
      setNewType('store');
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
        <h2><Store size={18} /> Shops &amp; Warehouses</h2>
        <button type="button" className="btn-primary" onClick={() => setShowAddForm(true)}><Plus size={16} /> Add location</button>
      </div>
      {error && !showAddForm && <p className="shops-error">{error}</p>}

      {showAddForm && (
        <Modal title="Add Location" onClose={() => setShowAddForm(false)} dirty={newName.trim() !== ''}>
          <form onSubmit={handleCreate} className="item-form shops-create-form">
            <div className="item-form-grid">
              <label className="item-form-field">
                <span className="item-form-field-label">Location name</span>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New location name" autoFocus />
              </label>
              <label className="item-form-field">
                <span className="item-form-field-label">Type</span>
                <select value={newType} onChange={(e) => setNewType(e.target.value)}>
                  <option value="store">Store</option>
                  <option value="warehouse">Warehouse</option>
                </select>
              </label>
            </div>
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
                <span className="shops-list-name">
                  {shop.type === 'warehouse' ? <Warehouse size={14} /> : <Store size={14} />}
                  {shop.name}
                  <span className={`shop-type-badge shop-type-${shop.type === 'warehouse' ? 'warehouse' : 'store'}`}>
                    {shop.type === 'warehouse' ? 'Warehouse' : 'Store'}
                  </span>
                </span>
                <div className="list-row-actions">
                  <Tooltip label={shop.type === 'warehouse' ? 'Change to Store' : 'Change to Warehouse'}>
                    <button className="btn-secondary" onClick={() => setShopType(db, shop.id, shop.type === 'warehouse' ? 'store' : 'warehouse')}>
                      Make {shop.type === 'warehouse' ? 'Store' : 'Warehouse'}
                    </button>
                  </Tooltip>
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
