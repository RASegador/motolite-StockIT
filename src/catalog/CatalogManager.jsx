import { useState } from 'react';
import { Tag, MapPin, Truck, Plus } from 'lucide-react';
import { useCategories, useLocations, useSuppliers } from './useCatalog';
import { addCategory, deleteCategory, addLocation, deleteLocation, addSupplier, deleteSupplier } from './catalogActions';
import { db } from '../firebase';
import Modal from '../shared/Modal';

function ListEditor({ icon, title, rows, onAdd, onRemove, renderLabel }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    try {
      await onAdd(value);
      setValue('');
      setShowAddForm(false);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="catalog-section">
      <div className="section-header-row">
        <h3>{icon} {title}</h3>
        <button type="button" className="btn-primary" onClick={() => setShowAddForm(true)}><Plus size={16} /> Add</button>
      </div>
      {error && !showAddForm && <p className="catalog-error">{error}</p>}

      {showAddForm && (
        <Modal title={`Add ${title.slice(0, -1)}`} onClose={() => setShowAddForm(false)} dirty={value.trim() !== ''}>
          <form onSubmit={handleAdd} className="item-form">
            <div className="item-form-grid">
              <label className="item-form-field">
                <span className="item-form-field-label">{title.slice(0, -1)} name</span>
                <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Add ${title.toLowerCase()}`} autoFocus />
              </label>
            </div>
            {error && <p className="modal-error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary">Add</button>
            </div>
          </form>
        </Modal>
      )}

      <ul>
        {rows.map((row) => (
          <li key={row.id} className="list-row">
            <span>{renderLabel ? renderLabel(row) : row.name}</span>
            <div className="list-row-actions">
              <button className="btn-danger" onClick={async () => {
                try { await onRemove(row.name); } catch (err) { setError(err.message); }
              }}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CatalogManager() {
  const categories = useCategories();
  const locations = useLocations();
  const suppliers = useSuppliers();

  return (
    <div className="catalog-manager">
      <ListEditor icon={<Tag size={16} />} title="Categories" rows={categories}
        onAdd={(name) => addCategory(db, name)} onRemove={(name) => deleteCategory(db, name)} />
      <ListEditor icon={<MapPin size={16} />} title="Locations" rows={locations}
        onAdd={(name) => addLocation(db, name)} onRemove={(name) => deleteLocation(db, name)} />
      <ListEditor icon={<Truck size={16} />} title="Suppliers" rows={suppliers}
        onAdd={(name) => addSupplier(db, { name })} onRemove={(name) => {
          const match = suppliers.find((s) => s.name === name);
          if (match) return deleteSupplier(db, match.id);
        }} renderLabel={(row) => row.name} />
    </div>
  );
}
