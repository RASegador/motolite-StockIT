import { useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUpCircle, PackagePlus, Eye, Battery, Download, Upload, Printer } from 'lucide-react';
import { printLabelSheet } from '../barcode/bulkPrint';
import Tooltip from '../shared/Tooltip';
import { useItems } from './useItems';
import { useWarehouseItems } from '../restock/useWarehouseItems';
import { useShops } from '../shops/useShops';
import { deleteItem } from './inventoryActions';
import { reorderThresholdInBase } from '../lib/units';
import { currency } from '../lib/format';
import { can } from '../lib/permissions';
import { useCategories, useSuppliers } from '../catalog/useCatalog';
import { db } from '../firebase';
import { toCsv } from '../lib/csv';
import ItemForm from './ItemForm';
import ItemDetailView from './ItemDetailView';
import MoveStockModal from './MoveStockModal';
import RestockModal from './RestockModal';
import ImportItemsModal from './ImportItemsModal';

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

export default function InventoryList({ role, shopId, userId }) {
  // "Inventory & Restock Section Structure" spec: the Inventory Section IS
  // the Warehouse — every item Admin adds lives there, and this is now
  // the master list, not a merge of every store's stock. A Manager (or
  // Warehouse-role login) still only sees their OWN assigned location via
  // the plain useItems() call below — this warehouse-scoping only applies
  // to the Admin ('admin') view. Both hooks are called unconditionally
  // (rules of hooks) and only one's result is actually used.
  const shops = useShops();
  const warehouseShopIds = shops.filter((s) => s.type === 'warehouse').map((s) => s.id);
  const ownItems = useItems({ role, shopId });
  const warehouseItems = useWarehouseItems(role === 'admin' ? warehouseShopIds : []);
  const items = role === 'admin' ? warehouseItems : ownItems;
  const categories = useCategories();
  const suppliers = useSuppliers();
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  function supplierNames(it) {
    const names = (it.supplierIds || []).map((id) => supplierById.get(id)?.name).filter(Boolean);
    return names.length ? names.join(', ') : '—';
  }
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('name-asc');
  const [editingItem, setEditingItem] = useState(null);
  const [viewingItem, setViewingItem] = useState(null);
  const [movingItem, setMovingItem] = useState(null);
  const [restockingItem, setRestockingItem] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  // Bulk label printing (see src/barcode/bulkPrint.js): which items are
  // checked, keyed by id so it survives re-sorting/re-filtering without
  // getting confused about row identity.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [printing, setPrinting] = useState(false);

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

  // Exports exactly what's currently on screen (respects search/category/
  // status filters) — pairs with ImportItemsModal, which accepts the same
  // column names back, so "export, edit in a spreadsheet, re-import" is a
  // real round trip rather than two independently-shaped formats.
  const EXPORT_HEADERS = ['sku', 'name', 'category', 'supplier', 'quantity', 'unitCost', 'sellingPrice', 'batteryModel', 'voltage', 'capacity', 'vehicleType', 'reorderPoint'];
  function handleExport() {
    const rows = filtered.map((it) => ({
      sku: it.sku || '', name: it.name || '', category: it.category || '', supplier: supplierNames(it) === '—' ? '' : supplierNames(it),
      quantity: it.quantity ?? 0, unitCost: it.unitCost ?? '', sellingPrice: it.sellingPrice ?? '',
      batteryModel: it.batteryModel || '', voltage: it.voltage ?? '', capacity: it.capacity || '',
      vehicleType: it.vehicleType || '', reorderPoint: it.reorderPoint ?? '',
    }));
    const csv = toCsv(EXPORT_HEADERS, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const selectedItems = filtered.filter((it) => selectedIds.has(it.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every((it) => selectedIds.has(it.id));

  function toggleOne(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filtered.forEach((it) => next.delete(it.id));
        return next;
      }
      const next = new Set(prev);
      filtered.forEach((it) => next.add(it.id));
      return next;
    });
  }

  async function handlePrintLabels() {
    setPrinting(true);
    try {
      await printLabelSheet(selectedItems, window.location.origin);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="inventory-list">
      {role === 'admin' && (
        <p className="dashboard-activity-hint">
          This is the Warehouse's master stock — every item Admin adds here becomes available for stores to
          request in the Restock section. A store's own stock is separate and only changes through an approved
          Restock/Transfer that store has received.
        </p>
      )}
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
        {/* Exporting is read-only, so it's available to anyone who can see
            this list at all (Manager/Warehouse's own store, Admin's
            warehouse master list) — only creating/importing is gated on
            editInventory. */}
        <button className="btn-secondary" onClick={handleExport}><Download size={16} /> Export CSV</button>
        {/* Same read-only availability as Export CSV above — printing a
            barcode/QR label doesn't change anything, so anyone who can see
            this list can print from it. Disabled (not hidden) with 0
            selected, since the checkboxes it depends on are always visible. */}
        <Tooltip label={selectedItems.length === 0 ? 'Check one or more items below first' : `Print a label for ${selectedItems.length} selected item${selectedItems.length === 1 ? '' : 's'}`}>
          <button className="btn-secondary" onClick={handlePrintLabels} disabled={selectedItems.length === 0 || printing}>
            <Printer size={16} /> {printing ? 'Preparing…' : `Print labels${selectedItems.length ? ` (${selectedItems.length})` : ''}`}
          </button>
        </Tooltip>
        {can(role, 'editInventory') && (
          <button className="btn-secondary" onClick={() => setShowImport(true)}><Upload size={16} /> Import CSV</button>
        )}
        {/* Owner/Admin no longer needs to pre-select an "active shop" from
            the sidebar just to open this form — ItemForm itself carries a
            required Shop dropdown for new items now, so the shop is chosen
            (and validated) right where the item is created. */}
        {can(role, 'editInventory') && (
          <button className="btn-primary" onClick={() => setShowNewForm(true)}><Plus size={16} /> Add New Item</button>
        )}
      </div>

      <div className="inventory-table-wrap">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered}
                  aria-label="Select all items currently shown, for label printing"
                  disabled={filtered.length === 0}
                />
              </th>
              <th></th><th>Item</th><th>Category</th><th>Supplier</th><th>Barcode</th>
              <th>Qty</th><th>Unit</th><th>Price</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => {
              const status = stockStatus(it);
              return (
                <tr key={it.id}>
                  <td>
                    <input
                      type="checkbox" checked={selectedIds.has(it.id)} onChange={() => toggleOne(it.id)}
                      aria-label={`Select ${it.name || it.sku} for label printing`}
                    />
                  </td>
                  <td>
                    <div className="inventory-thumb"><Battery size={20} /></div>
                  </td>
                  <td>
                    <div className="inventory-item-name">{it.name}</div>
                    <div className="inventory-item-sku">{it.sku}</div>
                  </td>
                  <td>{it.category || '—'}</td>
                  <td>{supplierNames(it)}</td>
                  <td className="inventory-barcode-cell">{it.barcode || '—'}</td>
                  <td>{it.quantity}</td>
                  <td>{it.baseUnitName || 'Piece'}</td>
                  <td>{currency(it.sellingPrice)}</td>
                  <td><span className={`status-badge status-${status.key}`}>{status.label}</span></td>
                  <td>
                    <div className="inventory-actions">
                      {can(role, 'viewInventory') && (
                        <Tooltip label="View item details">
                          <button className="icon-button" onClick={() => setViewingItem(it)} aria-label="View"><Eye size={14} /></button>
                        </Tooltip>
                      )}
                      {can(role, 'stockReceive') && (
                        <Tooltip label="Move stock between units">
                          <button className="icon-button" onClick={() => setMovingItem(it)} aria-label="Move stock"><ArrowUpCircle size={14} /></button>
                        </Tooltip>
                      )}
                      {can(role, 'stockReceive') && (
                        <Tooltip label="Add new stock to this item">
                          <button className="icon-button" onClick={() => setRestockingItem(it)} aria-label="Restock"><PackagePlus size={14} /></button>
                        </Tooltip>
                      )}
                      {can(role, 'editInventory') && (
                        <Tooltip label="Edit item information">
                          <button className="icon-button" onClick={() => setEditingItem(it)} aria-label="Edit"><Pencil size={14} /></button>
                        </Tooltip>
                      )}
                      {can(role, 'deleteInventory') && (
                        <Tooltip label="Delete this item">
                          <button className="icon-button icon-button-danger" onClick={() => deleteItem(db, it.id, { actorId: userId })} aria-label="Delete"><Trash2 size={14} /></button>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="inventory-empty">No items match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showImport && (
        <ImportItemsModal
          warehouseShops={shops.filter((s) => s.type === 'warehouse')} items={warehouseItems} suppliers={suppliers}
          userId={userId} onClose={() => setShowImport(false)} onDone={() => setShowImport(false)}
        />
      )}
      {showNewForm && <ItemForm shopId={shopId} role={role} userId={userId} onDone={() => setShowNewForm(false)} />}
      {editingItem && <ItemForm item={editingItem} shopId={shopId} role={role} userId={userId} onDone={() => setEditingItem(null)} />}
      {viewingItem && <ItemDetailView item={viewingItem} onClose={() => setViewingItem(null)} />}
      {movingItem && <MoveStockModal item={movingItem} userId={userId} onClose={() => setMovingItem(null)} />}
      {restockingItem && <RestockModal item={restockingItem} userId={userId} onClose={() => setRestockingItem(null)} />}
    </div>
  );
}
