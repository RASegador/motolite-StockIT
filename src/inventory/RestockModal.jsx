import { useState } from 'react';
import { useSuppliers } from '../catalog/useCatalog';
import { getItemUnits } from '../lib/units';
import { createRestock } from './inventoryActions';
import { db } from '../firebase';
import Modal from '../shared/Modal';

export default function RestockModal({ item, onClose }) {
  const suppliers = useSuppliers();
  const units = getItemUnits(item);
  const [unitName, setUnitName] = useState(units[0]?.name);
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState(item.unitCost || 0);
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const dirty = quantity != 1 || unitCost != (item.unitCost || 0) || supplierId !== '' || notes !== '';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await createRestock(db, {
        itemId: item.id, quantity: Number(quantity), unitName, unitCost: Number(unitCost), supplierId, notes,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title={`${item.sku} — Restock`} onClose={onClose} dirty={dirty}>
      <form onSubmit={handleSubmit} className="item-form">
        <div className="item-form-grid">
          <label className="item-form-field">
            <span className="item-form-field-label">Unit</span>
            <select value={unitName} onChange={(e) => setUnitName(e.target.value)} autoFocus>
              {units.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
            </select>
          </label>
          <label className="item-form-field">
            <span className="item-form-field-label">Quantity</span>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label className="item-form-field">
            <span className="item-form-field-label">Unit cost</span>
            <input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </label>
          <label className="item-form-field">
            <span className="item-form-field-label">Supplier</span>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Supplier (optional)</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="item-form-field">
            <span className="item-form-field-label">Notes</span>
            <input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        {error && <p className="modal-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Confirm restock</button>
        </div>
      </form>
    </Modal>
  );
}
