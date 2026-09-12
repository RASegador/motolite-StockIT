import { useRef, useState } from 'react';
import { useCategories, useLocations, useSuppliers } from '../catalog/useCatalog';
import { useShops } from '../shops/useShops';
import { computeSellingPrice } from '../lib/pricing';
import { saveItem } from './inventoryActions';
import { db } from '../firebase';
import { newId } from '../lib/format';
import { generateBarcode } from '../lib/barcode';
import ProductCodes from '../barcode/ProductCodes';
import Modal from '../shared/Modal';

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
  // The id (and therefore the barcode/QR, both derived from it) is
  // generated up front — before the item is ever saved — so the Add Item
  // form can display real, final codes immediately rather than a
  // placeholder that would change after the first save.
  const id = newId('i');
  return {
    id, barcode: generateBarcode(id),
    sku: '', name: '', category: '', location: '', supplierIds: [],
    baseUnitName: 'Piece', baseUnitStock: 0, units: [],
    unitCost: 0, markupType: 'percent', markupValue: 0,
    batteryModel: '', voltage: 12, capacity: '', warrantyMonths: 12, vehicleType: '',
    reorderPoint: 0, reorderUnit: 'Piece',
  };
}

// Plain label+control pair, no bordered box around it — the "boxy" look
// came from every group being a browser-default <fieldset>, not from the
// individual inputs, so this just gives each field a real <label> (there
// weren't any before — placeholder text was standing in for one) stacked
// above the control.
function Field({ label, children, className = '' }) {
  return (
    <label className={`item-form-field ${className}`.trim()}>
      <span className="item-form-field-label">{label}</span>
      {children}
    </label>
  );
}

// A section is spacing + a small heading, not a bordered container — the
// grouping reads from whitespace and typography instead of a box.
function Section({ title, children }) {
  return (
    <div className="item-form-section">
      <h4 className="item-form-section-title">{title}</h4>
      <div className="item-form-grid">{children}</div>
    </div>
  );
}

export default function ItemForm({ item, shopId, role, onDone }) {
  const categories = useCategories();
  const locations = useLocations();
  const suppliers = useSuppliers();
  const shops = useShops();
  // New item, Owner/Admin: the Owner isn't tied to one shop, so they must
  // explicitly choose which shop this item belongs to — the dropdown below.
  // Editing an existing item, or a Manager/Cashier creating one, keeps the
  // shop fixed (their own shop, or the item's existing one) rather than
  // editable, to avoid overlapping with the dedicated Transfers feature.
  const isNewItem = !item;
  const canPickShop = isNewItem && role === 'owner';
  const [draft, setDraft] = useState(
    item ? draftFromItem(item) : { ...blankDraft(), shopId: shopId || '' }
  );
  // Captured once, at mount, so the "unsaved changes" check (used to guard
  // an accidental backdrop-click/Escape close) has a stable baseline to
  // diff the live draft against.
  const initialDraftRef = useRef(draft);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const previewPrice = computeSellingPrice(draft.unitCost, draft.markupType, draft.markupValue);
  const selectedShopName = shops.find((s) => s.id === draft.shopId)?.name;

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
    if (!draft.shopId) {
      setError('Please select a shop before saving this item.');
      return;
    }
    setSaving(true);
    try {
      await saveItem(db, draft, { shopId: draft.shopId });
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraftRef.current);

  return (
    <Modal title={isNewItem ? 'Add Inventory Item' : 'Edit Item'} onClose={() => onDone?.()} dirty={dirty} className="modal-card-wide">
    <form onSubmit={handleSubmit} className="item-form">
      <Section title="Item">
        <Field label="SKU">
          <input value={draft.sku} onChange={set('sku')} required />
        </Field>
        <Field label="Name">
          <input value={draft.name} onChange={set('name')} required />
        </Field>
        <Field label="Category">
          <select value={draft.category} onChange={set('category')}>
            <option value="">Category…</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Location">
          <select value={draft.location} onChange={set('location')}>
            <option value="">Location…</option>
            {locations.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
          </select>
        </Field>
      </Section>

      <div className="item-form-section">
        <h4 className="item-form-section-title">Shop</h4>
        {canPickShop ? (
          <div className="item-form-grid">
            <Field label="Shop" className="item-form-shop-field">
              <select value={draft.shopId || ''} onChange={set('shopId')} required>
                <option value="">Select a shop…</option>
                {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <p className="item-form-shop-confirm">
              {draft.shopId
                ? <>This item will be added to <strong>{selectedShopName || draft.shopId}</strong>.</>
                : 'Choose which shop this item belongs to before saving.'}
            </p>
          </div>
        ) : (
          <p className="item-form-shop-confirm">
            {selectedShopName ? <>Shop: <strong>{selectedShopName}</strong></> : 'Shop: —'}
          </p>
        )}
      </div>

      <Section title="Battery details">
        <Field label="Battery model">
          <input placeholder="e.g. N50" value={draft.batteryModel} onChange={set('batteryModel')} />
        </Field>
        <Field label="Voltage">
          <input type="number" value={draft.voltage} onChange={set('voltage')} />
        </Field>
        <Field label="Capacity">
          <input placeholder="e.g. 35Ah/320CCA" value={draft.capacity} onChange={set('capacity')} />
        </Field>
        <Field label="Warranty (months)">
          <input type="number" value={draft.warrantyMonths} onChange={set('warrantyMonths')} />
        </Field>
        <Field label="Vehicle type">
          <input value={draft.vehicleType} onChange={set('vehicleType')} list="vehicle-type-suggestions" />
          <datalist id="vehicle-type-suggestions">
            {VEHICLE_TYPE_SUGGESTIONS.map((v) => <option key={v} value={v} />)}
          </datalist>
        </Field>
      </Section>

      <Section title="Stock & pricing">
        <Field label="Starting stock (Pieces)">
          <input type="number" value={draft.baseUnitStock} onChange={set('baseUnitStock')} />
        </Field>
        <Field label="Base cost">
          <input type="number" value={draft.unitCost} onChange={set('unitCost')} />
        </Field>
        <Field label="Markup type">
          <select value={draft.markupType} onChange={set('markupType')}>
            <option value="percent">Markup %</option>
            <option value="fixed">Markup ₱</option>
          </select>
        </Field>
        <Field label="Markup value">
          <input type="number" value={draft.markupValue} onChange={set('markupValue')} />
        </Field>
        <p className="item-form-price-preview">Selling price preview: ₱{previewPrice.toFixed(2)}</p>
      </Section>

      <div className="item-form-section">
        <h4 className="item-form-section-title">Extra units (Pack/Box/Case…)</h4>
        {(draft.units || []).map((u, idx) => (
          <div className="item-form-unit-row" key={idx}>
            <Field label="Unit name" className="item-form-unit-field">
              <input placeholder="e.g. Pack" value={u.name} onChange={setUnitRow(idx, 'name')} />
            </Field>
            <Field label="Factor" className="item-form-unit-field">
              <input type="number" placeholder="Base units per unit" value={u.factor} onChange={setUnitRow(idx, 'factor')} />
            </Field>
            <Field label="Cost" className="item-form-unit-field">
              <input type="number" value={u.cost} onChange={setUnitRow(idx, 'cost')} />
            </Field>
            <Field label="Price" className="item-form-unit-field">
              <input type="number" value={u.price} onChange={setUnitRow(idx, 'price')} />
            </Field>
            <Field label="Stock" className="item-form-unit-field">
              <input type="number" value={u.stock} onChange={setUnitRow(idx, 'stock')} />
            </Field>
            <button type="button" className="btn-danger item-form-unit-remove" onClick={() => removeUnitRow(idx)}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn-secondary" onClick={addUnitRow}>+ Add unit</button>
      </div>

      <Section title="Reorder point">
        <Field label="Reorder point">
          <input type="number" value={draft.reorderPoint ?? 0} onChange={set('reorderPoint')} />
        </Field>
        <Field label="Reorder unit">
          <select value={draft.reorderUnit || draft.baseUnitName || 'Piece'} onChange={set('reorderUnit')}>
            {reorderUnitOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </Field>
      </Section>

      <div className="item-form-section">
        <h4 className="item-form-section-title">Barcode &amp; QR code</h4>
        <p className="item-form-codes-hint">Generated automatically and linked to this product — cannot be edited.</p>
        <ProductCodes item={draft} />
      </div>

      {error && <p className="item-form-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={() => onDone?.()} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save item'}</button>
      </div>
    </form>
    </Modal>
  );
}
