import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy, doc, getDoc } from 'firebase/firestore';
import { ClipboardCheck } from 'lucide-react';
import { useItems } from '../inventory/useItems';
import { startCycleCount, recordCountedQty, applyCycleCount, cancelCycleCount } from './cycleCountActions';
import { db } from '../firebase';

function useCycleCounts(shopId) {
  const [counts, setCounts] = useState([]);
  useEffect(() => {
    if (!shopId) return;
    const q = query(collection(db, 'cycleCounts'), where('shopId', '==', shopId), orderBy('startedAt', 'desc'));
    return onSnapshot(q, (snap) => setCounts(snap.docs.map((d) => d.data())));
  }, [shopId]);
  return counts;
}

export default function CycleCountView({ role, shopId, userId }) {
  const items = useItems({ role, shopId });
  const counts = useCycleCounts(shopId);
  const [activeId, setActiveId] = useState(null);
  const [active, setActive] = useState(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const openCount = counts.find((c) => c.status === 'open');

  useEffect(() => {
    const id = openCount?.id || null;
    setActiveId(id);
  }, [openCount?.id]);

  useEffect(() => {
    if (!activeId) { setActive(null); return; }
    return onSnapshot(doc(db, 'cycleCounts', activeId), (snap) => setActive(snap.exists() ? snap.data() : null));
  }, [activeId]);

  async function handleStart() {
    setError('');
    setBusy(true);
    try {
      const id = await startCycleCount(db, { shopId, items, startedBy: userId, label });
      setActiveId(id);
      setLabel('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCount(itemId, value) {
    if (!active) return;
    try {
      await recordCountedQty(db, active, itemId, value);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleApply() {
    if (!active) return;
    setError('');
    setBusy(true);
    try {
      await applyCycleCount(db, active, { appliedBy: userId });
      setActiveId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!active) return;
    if (!window.confirm('Cancel this count? Nothing counted so far will be applied.')) return;
    await cancelCycleCount(db, active.id);
    setActiveId(null);
  }

  const varianceCount = active ? active.items.filter((l) => l.countedQty != null && l.countedQty !== l.systemQty).length : 0;

  return (
    <div className="cycle-count-view">
      <h2><ClipboardCheck size={18} /> Physical Stock Count</h2>

      {!active ? (
        <div className="cycle-count-start">
          <p>Starts a count covering every item currently in this shop's inventory ({items.length} items).</p>
          <input placeholder="Label (optional — e.g. 'September count')" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn-primary" onClick={handleStart} disabled={busy || items.length === 0}>
            {busy ? 'Starting…' : 'Start count'}
          </button>
        </div>
      ) : (
        <>
          <p className="cycle-count-hint">
            {active.label && <strong>{active.label} — </strong>}
            Enter what's actually on the shelf for each item. Leave blank to skip an item (its stock won't change).
          </p>
          <table className="dashboard-shop-table">
            <thead><tr><th>SKU</th><th>Name</th><th>System qty</th><th>Counted qty</th><th>Variance</th></tr></thead>
            <tbody>
              {active.items.map((line) => {
                const variance = line.countedQty != null ? line.countedQty - line.systemQty : null;
                return (
                  <tr key={line.itemId}>
                    <td>{line.sku}</td><td>{line.name}</td><td>{line.systemQty}</td>
                    <td>
                      <input type="number" defaultValue={line.countedQty ?? ''} placeholder="—"
                        onBlur={(e) => handleCount(line.itemId, e.target.value)} />
                    </td>
                    <td className={variance < 0 ? 'cash-reconciliation-short' : variance > 0 ? 'cash-reconciliation-over' : ''}>
                      {variance == null ? '—' : variance}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {error && <p className="pos-error">{error}</p>}
          <div className="form-actions">
            <button className="btn-secondary" onClick={handleCancel} disabled={busy}>Cancel count</button>
            <button className="btn-primary" onClick={handleApply} disabled={busy}>
              {busy ? 'Applying…' : `Apply ${varianceCount} adjustment${varianceCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}

      {counts.filter((c) => c.status !== 'open').length > 0 && (
        <>
          <h3>Past counts</h3>
          <table className="dashboard-shop-table">
            <thead><tr><th>Label</th><th>Started</th><th>Status</th></tr></thead>
            <tbody>
              {counts.filter((c) => c.status !== 'open').map((c) => (
                <tr key={c.id}>
                  <td>{c.label || '—'}</td><td>{new Date(c.startedAt).toLocaleDateString()}</td><td>{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
