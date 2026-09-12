import { useState } from 'react';
import { recordMovement } from './inventoryActions';
import { db } from '../firebase';
import Modal from '../shared/Modal';

export default function MoveStockModal({ item, userId, onClose }) {
  const [type, setType] = useState('in');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const dirty = type !== 'in' || qty != 1 || reason !== '';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await recordMovement(db, item.id, type, Number(qty), reason, { actorId: userId });
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title={`${item.sku} — Receive / Issue stock`} onClose={onClose} dirty={dirty}>
      <form onSubmit={handleSubmit} className="item-form">
        <div className="item-form-grid">
          <div className="item-form-field">
            <span className="item-form-field-label">Movement type</span>
            <div className="item-form-radio-row">
              <label className="item-form-radio">
                <input type="radio" checked={type === 'in'} onChange={() => setType('in')} /> Receive
              </label>
              <label className="item-form-radio">
                <input type="radio" checked={type === 'out'} onChange={() => setType('out')} /> Issue
              </label>
            </div>
          </div>
          <label className="item-form-field">
            <span className="item-form-field-label">Quantity</span>
            <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </label>
          <label className="item-form-field">
            <span className="item-form-field-label">Reason</span>
            <input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
        {error && <p className="modal-error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Confirm</button>
        </div>
      </form>
    </Modal>
  );
}
