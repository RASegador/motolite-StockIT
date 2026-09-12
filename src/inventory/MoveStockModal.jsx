import { useState } from 'react';
import { recordMovement } from './inventoryActions';
import { db } from '../firebase';

export default function MoveStockModal({ item, onClose }) {
  const [type, setType] = useState('in');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await recordMovement(db, item.id, type, Number(qty), reason);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="modal">
      <form onSubmit={handleSubmit}>
        <h3>{item.sku} — Receive / Issue stock</h3>
        <label>
          <input type="radio" checked={type === 'in'} onChange={() => setType('in')} /> Receive
        </label>
        <label>
          <input type="radio" checked={type === 'out'} onChange={() => setType('out')} /> Issue
        </label>
        <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        <input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <p className="modal-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Confirm</button>
        </div>
      </form>
    </div>
  );
}
