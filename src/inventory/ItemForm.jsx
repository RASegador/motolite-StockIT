import { useState } from 'react';
import { useCategories, useLocations, useSuppliers } from '../catalog/useCatalog';
import { computeSellingPrice } from '../lib/pricing';
import { saveItem } from './inventoryActions';
import { db } from '../firebase';

const VEHICLE_TYPE_SUGGESTIONS = ['Motorcycle', 'Car', 'SUV', 'Truck', 'Van'];

export default function ItemForm({ item, shopId, onDone }) {
  const categories = useCategories();
  const locations = useLocations();
  const suppliers = useSuppliers();
  const [draft, setDraft] = useState(item || {
    sku: '', name: '', category: '', location: '', supplierIds: [],
    baseUnitName: 'Piece', baseUnitStock: 0, units: [],
    unitCost: 0, markupType: 'percent', markupValue: 0,
    batteryModel: '', voltage: 12, capacity: '', warrantyMonths: 12, vehicleType: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const previewPrice = computeSellingPrice(draft.unitCost, draft.markupType, draft.markupValue);

  function set(field) {
    return (e) => setDraft({ ...draft, [field]: e.target.value });
  }

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

      {error && <p className="item-form-error">{error}</p>}
      <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save item'}</button>
    </form>
  );
}
