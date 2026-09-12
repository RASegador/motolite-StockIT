import { X } from 'lucide-react';
import Tooltip from '../shared/Tooltip';
import { useSuppliers } from '../catalog/useCatalog';
import { getItemUnits, getUnitCounts } from '../lib/units';
import { currency } from '../lib/format';
import ProductCodes from '../barcode/ProductCodes';

// Read-only detail panel — available to anyone with viewInventory (including
// Cashier, who can't edit), so there's a way to see everything about an item
// (specs, full barcode, per-unit stock breakdown) without the edit form.
export default function ItemDetailView({ item, onClose }) {
  const suppliers = useSuppliers();
  const supplierNames = (item.supplierIds || [])
    .map((id) => suppliers.find((s) => s.id === id)?.name)
    .filter(Boolean);
  const units = getItemUnits(item);
  const counts = getUnitCounts(item);

  return (
    <div className="modal" onClick={onClose}>
      <div className="item-detail" onClick={(e) => e.stopPropagation()}>
        <div className="item-detail-header">
          <h2>{item.name}</h2>
          <Tooltip label="Close this panel">
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </Tooltip>
        </div>

        <div className="item-detail-grid">
          <div>
            <p><span>SKU</span>{item.sku}</p>
            <p><span>Category</span>{item.category || '—'}</p>
            <p><span>Location</span>{item.location || '—'}</p>
            <p><span>Suppliers</span>{supplierNames.length ? supplierNames.join(', ') : '—'}</p>
          </div>
          <div>
            <p><span>Battery model</span>{item.batteryModel || '—'}</p>
            <p><span>Voltage</span>{item.voltage ? `${item.voltage}V` : '—'}</p>
            <p><span>Capacity</span>{item.capacity || '—'}</p>
            <p><span>Vehicle type</span>{item.vehicleType || '—'}</p>
            <p><span>Warranty</span>{item.warrantyMonths ? `${item.warrantyMonths} months` : '—'}</p>
          </div>
        </div>

        <div className="item-detail-stock">
          <h3>Stock by unit</h3>
          <table>
            <thead><tr><th>Unit</th><th>Cost</th><th>Price</th><th>In stock</th></tr></thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.name}>
                  <td>{u.name}{u.isBase ? '' : ` (${u.factor}× ${item.baseUnitName})`}</td>
                  <td>{currency(u.cost)}</td>
                  <td>{currency(u.price)}</td>
                  <td>{counts[u.name] || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="item-detail-total-qty">Total: {item.quantity} {item.baseUnitName}(s)</p>
        </div>

        {item.barcode && (
          <div className="item-detail-barcode">
            <h3>Barcode &amp; QR Code</h3>
            <ProductCodes item={item} />
          </div>
        )}
      </div>
    </div>
  );
}
