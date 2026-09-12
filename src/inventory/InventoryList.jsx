import { useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUpCircle, PackagePlus, Eye, Battery } from 'lucide-react';
import { useItems } from './useItems';
import { deleteItem } from './inventoryActions';
import { reorderThresholdInBase } from '../lib/units';
import { currency } from '../lib/format';
import { can } from '../lib/permissions';
import { useCategories } from '../catalog/useCatalog';
import { db } from '../firebase';
import ItemForm from './ItemForm';
import ItemDetailView from './ItemDetailView';
import MoveStockModal from './MoveStockModal';
import RestockModal from './RestockModal';

function stockStatus(item) {
  if (item.quantity <= 0) return { key: 'out', label: 'Out of Stock' };
  if (item.quantity <= reorderThresholdInBase(item)) return { key: 'low', label: 'Low Stock' };
  return { key: 'in', label: 'In Stock' };
}

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'name-desc', label: 'Name (Z–A)' },
  { value: 'price-asc', label: 'Price (low–high)' },
  { value: 'price-desc', label: 'Price (high–low)' },
  { value: 'qty-asc', label: 'Quantity (low–high)' },
  { value: 'qty-desc', label: 'Quantity (high–low)' },
];

export default function InventoryList({ role, shopId }) {
  const items = useItems({ role, shopId });
  const categories = useCategories();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('name-asc');
  const [editingItem, setEditingItem] = useState(null);
  const [viewingItem, setViewingItem] = useState(null);
  const [movingItem, setMovingItem] = useState(null);
  const [restockingItem, setRestockingItem] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const q = search.trim().toLowerCase();
  let filtered = items.filter((it) => {
    const matchesSearch = !q || it.sku?.toLowerCase().includes(q) || it.name?.toLowerCase().includes(q)
      || it.batteryModel?.toLowerCase().includes(q) || it.vehicleType?.toLowerCase().includes(q);
    const matchesCategory = !categoryFilter || it.category === categoryFilter;
    const matchesStatus = !statusFilter || stockStatus(it).key === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const [sortField, sortDir] = sort.split('-');
  const sortKey = { name: 'name', price: 'sellingPrice', qty: 'quantity' }[sortField];
  filtered = [...filtered].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const cmp = typeof av === 'string' ? (av || '').localeCompare(bv || '') : (av || 0) - (bv || 0);
    return sortDir === 'desc' ? -cmp : cmp;
  });

  return (
    <div className="inventory-list">
      <div className="inventory-toolbar">
        <input className="inventory-search" placeholder="Search SKU, name, model, vehicle type…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="in">In Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="inventory-toolbar-spacer" />
        {can(role, 'editInventory') && (
          role === 'owner' && !shopId
            ? <span className="inventory-owner-shop-hint">Select an active shop above to add a new item.</span>
            : <button className="btn-primary" onClick={() => setShowNewForm(true)}><Plus size={16} /> Add New Item</button>
        )}
      </div>

      <div className="inventory-table-wrap">
        <table className="inventory-table">
          <thead>
            <tr>
              <th></th><th>Item</th><th>Category</th><th>Barcode</th>
              <th>Qty</th><th>Price</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => {
              const status = stockStatus(it);
              return (
                <tr key={it.id}>
                  <td>
                    <div className="inventory-thumb"><Battery size={20} /></div>
                  </td>
                  <td>
                    <div className="inventory-item-name">{it.name}</div>
                    <div className="inventory-item-sku">{it.sku}</div>
                  </td>
                  <td>{it.category || '—'}</td>
                  <td className="inventory-barcode-cell">{it.barcode || '—'}</td>
                  <td>{it.quantity}</td>
                  <td>{currency(it.sellingPrice)}</td>
                  <td><span className={`status-badge status-${status.key}`}>{status.label}</span></td>
                  <td>
                    <div className="inventory-actions">
                      {can(role, 'viewInventory') && (
                        <button className="icon-button" onClick={() => setViewingItem(it)} aria-label="View"><Eye size={14} /></button>
                      )}
                      {can(role, 'stockReceive') && (
                        <button className="icon-button" onClick={() => setMovingItem(it)} aria-label="Move stock"><ArrowUpCircle size={14} /></button>
                      )}
                      {can(role, 'stockReceive') && (
                        <button className="icon-button" onClick={() => setRestockingItem(it)} aria-label="Restock"><PackagePlus size={14} /></button>
                      )}
                      {can(role, 'editInventory') && (
                        <button className="icon-button" onClick={() => setEditingItem(it)} aria-label="Edit"><Pencil size={14} /></button>
                      )}
                      {can(role, 'deleteInventory') && (
                        <button className="icon-button icon-button-danger" onClick={() => deleteItem(db, it.id)} aria-label="Delete"><Trash2 size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="inventory-empty">No items match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showNewForm && <ItemForm shopId={shopId} onDone={() => setShowNewForm(false)} />}
      {editingItem && <ItemForm item={editingItem} shopId={shopId} onDone={() => setEditingItem(null)} />}
      {viewingItem && <ItemDetailView item={viewingItem} onClose={() => setViewingItem(null)} />}
      {movingItem && <MoveStockModal item={movingItem} onClose={() => setMovingItem(null)} />}
      {restockingItem && <RestockModal item={restockingItem} onClose={() => setRestockingItem(null)} />}
    </div>
  );
}
