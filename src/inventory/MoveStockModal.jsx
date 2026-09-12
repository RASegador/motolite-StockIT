import { useState } from 'react';
import { recordMovement } from './inventoryActions';
import { db } from '../firebase';
import Modal from '../shared/Modal';

export default function MoveStockModal({ item, onClose }) {
  const [type, setType] = useState('in');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const dirty = type !== 'in' || qty != 1 || reason !== '';

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
    <Modal title={`${item.sku} — Receive / Issue stock`} onClose={onClose} dirty={dirty}>
      <form onSubmit={handleSubmit}>
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
    </Modal>
  );
}
