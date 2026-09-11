import { useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUpCircle, PackagePlus } from 'lucide-react';
import { useItems } from './useItems';
import { deleteItem } from './inventoryActions';
import { reorderThresholdInBase } from '../lib/units';
import { can } from '../lib/permissions';
import { db } from '../firebase';
import ItemForm from './ItemForm';
import MoveStockModal from './MoveStockModal';
import RestockModal from './RestockModal';

export default function InventoryList({ role, shopId }) {
  const items = useItems({ role, shopId });
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [movingItem, setMovingItem] = useState(null);
  const [restockingItem, setRestockingItem] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const filtered = items.filter((it) => {
    const q = search.toLowerCase();
    return !q || it.sku?.toLowerCase().includes(q) || it.name?.toLowerCase().includes(q)
      || it.batteryModel?.toLowerCase().includes(q) || it.vehicleType?.toLowerCase().includes(q);
  });

  return (
    <div className="inventory-list">
      <div className="inventory-toolbar">
        <input placeholder="Search SKU, name, model, vehicle type…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {can(role, 'editInventory') && (
          <button onClick={() => setShowNewForm(true)}><Plus size={16} /> Add item</button>
        )}
      </div>

      <table>
        <thead>
          <tr>
            <th>SKU</th><th>Name</th><th>Model</th><th>Vehicle</th><th>Qty</th><th>Price</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((it) => {
            const low = it.quantity <= reorderThresholdInBase(it);
            return (
              <tr key={it.id} className={low ? 'low-stock' : ''}>
                <td>{it.sku}</td>
                <td>{it.name}</td>
                <td>{it.batteryModel}</td>
                <td>{it.vehicleType}</td>
                <td>{it.quantity}</td>
                <td>₱{Number(it.sellingPrice || 0).toFixed(2)}</td>
                <td>
                  {can(role, 'stockReceive') && (
                    <button onClick={() => setMovingItem(it)}><ArrowUpCircle size={14} /></button>
                  )}
                  {can(role, 'stockReceive') && (
                    <button onClick={() => setRestockingItem(it)}><PackagePlus size={14} /></button>
                  )}
                  {can(role, 'editInventory') && (
                    <button onClick={() => setEditingItem(it)}><Pencil size={14} /></button>
                  )}
                  {can(role, 'deleteInventory') && (
                    <button onClick={() => deleteItem(db, it.id)}><Trash2 size={14} /></button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {showNewForm && <ItemForm shopId={shopId} onDone={() => setShowNewForm(false)} />}
      {editingItem && <ItemForm item={editingItem} shopId={shopId} onDone={() => setEditingItem(null)} />}
      {movingItem && <MoveStockModal item={movingItem} onClose={() => setMovingItem(null)} />}
      {restockingItem && <RestockModal item={restockingItem} onClose={() => setRestockingItem(null)} />}
    </div>
  );
}
