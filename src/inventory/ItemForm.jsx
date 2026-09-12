import { useState } from 'react';
import { useCategories, useLocations, useSuppliers } from '../catalog/useCatalog';
import { computeSellingPrice } from '../lib/pricing';
import { saveItem } from './inventoryActions';
import { db } from '../firebase';
import BarcodeImage from '../barcode/BarcodeImage';

const VEHICLE_TYPE_SUGGESTIONS = ['Motorcycle', 'Car', 'SUV', 'Truck', 'Van'];

// A saved item document is shaped for storage — `unitStock: {UnitName: count}`
// and `units: [{name,factor,cost,price}]` with no per-unit `stock` field —
// not for this form's inputs (`baseUnitStock`, and each unit row carrying
// its own `stock`). Seeding `draft` straight from the item document (as a
// prior version of this form did) meant `saveItem` read `draft.baseUnitStock`
// / `draft.units[].stock`, found them `undefined`, and silently recomputed
// the item's real stock down to zero on every edit. This adapts the
// document shape into the form's input shape instead.
function draftFromItem(item) {
  const baseUnitName = item.baseUnitName || 'Piece';
  const baseUnitStock = item.unitStock?.[baseUnitName] ?? item.quantity ?? 0;
  const units = (item.units || []).map((u) => ({
    ...u,
    stock: item.unitStock?.[u.name] ?? 0,
  }));
  return { ...item, baseUnitName, baseUnitStock, units };
}

function blankDraft() {
  return {
    sku: '', name: '', category: '', location: '', supplierIds: [],
    baseUnitName: 'Piece', baseUnitStock: 0, units: [],
    unitCost: 0, markupType: 'percent', markupValue: 0,
    batteryModel: '', voltage: 12, capacity: '', warrantyMonths: 12, vehicleType: '',
    reorderPoint: 0, reorderUnit: 'Piece', barcode: '',
  };
}

export default function ItemForm({ item, shopId, onDone }) {
  const categories = useCategories();
  const locations = useLocations();
  const suppliers = useSuppliers();
  const [draft, setDraft] = useState(item ? draftFromItem(item) : blankDraft());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const previewPrice = computeSellingPrice(draft.unitCost, draft.markupType, draft.markupValue);

  function set(field) {
    return (e) => setDraft({ ...draft, [field]: e.target.value });
  }

  function addUnitRow() {
    setDraft({ ...draft, units: [...(draft.units || []), { name: '', factor: 1, cost: 0, price: 0, stock: 0 }] });
  }

  function removeUnitRow(idx) {
    setDraft({ ...draft, units: draft.units.filter((_, i) => i !== idx) });
  }

  function setUnitRow(idx, field) {
    return (e) => {
      const units = draft.units.map((u, i) => (i === idx ? { ...u, [field]: e.target.value } : u));
      setDraft({ ...draft, units });
    };
  }

  const reorderUnitOptions = [draft.baseUnitName || 'Piece', ...(draft.units || []).map((u) => u.name).filter(Boolean)];

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await saveItem(db, draft, { shopId });
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="item-form">
      <input placeholder="SKU" value={draft.sku} onChange={set('sku')} required />
      <input placeholder="Name" value={draft.name} onChange={set('name')} required />

      <select value={draft.category} onChange={set('category')}>
        <option value="">Category…</option>
        {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
      </select>
      <select value={draft.location} onChange={set('location')}>
        <option value="">Location…</option>
        {locations.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
      </select>

      <fieldset>
        <legend>Battery details</legend>
        <input placeholder="Battery model (e.g. N50)" value={draft.batteryModel} onChange={set('batteryModel')} />
        <input type="number" placeholder="Voltage" value={draft.voltage} onChange={set('voltage')} />
        <input placeholder="Capacity (e.g. 35Ah/320CCA)" value={draft.capacity} onChange={set('capacity')} />
        <input type="number" placeholder="Warranty (months)" value={draft.warrantyMonths} onChange={set('warrantyMonths')} />
        <input placeholder="Vehicle type" value={draft.vehicleType} onChange={set('vehicleType')} list="vehicle-type-suggestions" />
        <datalist id="vehicle-type-suggestions">
          {VEHICLE_TYPE_SUGGESTIONS.map((v) => <option key={v} value={v} />)}
        </datalist>
      </fieldset>

      <fieldset>
        <legend>Stock &amp; pricing</legend>
        <input type="number" placeholder="Starting stock (Pieces)" value={draft.baseUnitStock} onChange={set('baseUnitStock')} />
        <input type="number" placeholder="Base cost" value={draft.unitCost} onChange={set('unitCost')} />
        <select value={draft.markupType} onChange={set('markupType')}>
          <option value="percent">Markup %</option>
          <option value="fixed">Markup ₱</option>
        </select>
        <input type="number" placeholder="Markup value" value={draft.markupValue} onChange={set('markupValue')} />
        <p>Selling price preview: ₱{previewPrice.toFixed(2)}</p>
      </fieldset>

      <fieldset>
        <legend>Extra units (Pack/Box/Case…)</legend>
        {(draft.units || []).map((u, idx) => (
          <div className="item-form-unit-row" key={idx}>
            <input placeholder="Unit name (e.g. Pack)" value={u.name} onChange={setUnitRow(idx, 'name')} />
            <input type="number" placeholder="Factor (base units per unit)" value={u.factor} onChange={setUnitRow(idx, 'factor')} />
            <input type="number" placeholder="Cost" value={u.cost} onChange={setUnitRow(idx, 'cost')} />
            <input type="number" placeholder="Price" value={u.price} onChange={setUnitRow(idx, 'price')} />
            <input type="number" placeholder="Stock" value={u.stock} onChange={setUnitRow(idx, 'stock')} />
            <button type="button" className="btn-danger" onClick={() => removeUnitRow(idx)}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={addUnitRow}>+ Add unit</button>
      </fieldset>

      <fieldset>
        <legend>Reorder point</legend>
        <input type="number" placeholder="Reorder point" value={draft.reorderPoint ?? 0} onChange={set('reorderPoint')} />
        <select value={draft.reorderUnit || draft.baseUnitName || 'Piece'} onChange={set('reorderUnit')}>
          {reorderUnitOptions.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </fieldset>

      <fieldset>
        <legend>Barcode</legend>
        <input placeholder="Barcode" value={draft.barcode || ''} onChange={set('barcode')} />
        {draft.barcode && <BarcodeImage value={draft.barcode} />}
      </fieldset>

      {error && <p className="item-form-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={() => onDone?.()} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save item'}</button>
      </div>
    </form>
  );
}
