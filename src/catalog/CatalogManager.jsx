import { useState } from 'react';
import { Tag, MapPin, Truck, Plus, Pencil } from 'lucide-react';
import { useCategories, useLocations, useSuppliers } from './useCatalog';
import {
  addCategory, deleteCategory, renameCategory,
  addLocation, deleteLocation, renameLocation,
  addSupplier, deleteSupplier, renameSupplier,
} from './catalogActions';
import { db } from '../firebase';
import Modal from '../shared/Modal';

// One row, with its own local edit-mode toggle so renaming one row doesn't
// disturb the rest of the list.
function ListRow({ row, renderLabel, onRename, onRemove, setListError }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.name);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setValue(row.name);
    setEditing(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setListError('');
    try {
      await onRename(row, value);
      setEditing(false);
    } catch (err) {
      setListError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li className="list-row">
        <form onSubmit={handleSave} className="list-row-rename-form">
          <input value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn-secondary" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
        </form>
      </li>
    );
  }

  return (
    <li className="list-row">
      <span>{renderLabel ? renderLabel(row) : row.name}</span>
      <div className="list-row-actions">
        <button className="icon-button" onClick={startEdit} aria-label="Rename"><Pencil size={14} /></button>
        <button className="btn-danger" onClick={async () => {
          setListError('');
          try { await onRemove(row); } catch (err) { setListError(err.message); }
        }}>Remove</button>
      </div>
    </li>
  );
}

function ListEditor({ icon, title, rows, onAdd, onRemove, onRename, renderLabel }) {
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
          <ListRow key={row.id} row={row} renderLabel={renderLabel} onRename={onRename} onRemove={onRemove} setListError={setError} />
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
        onAdd={(name) => addCategory(db, name)}
        onRemove={(row) => deleteCategory(db, row.name)}
        onRename={(row, newName) => renameCategory(db, row.name, newName)} />
      <ListEditor icon={<MapPin size={16} />} title="Locations" rows={locations}
        onAdd={(name) => addLocation(db, name)}
        onRemove={(row) => deleteLocation(db, row.name)}
        onRename={(row, newName) => renameLocation(db, row.name, newName)} />
      <ListEditor icon={<Truck size={16} />} title="Suppliers" rows={suppliers}
        onAdd={(name) => addSupplier(db, { name })}
        onRemove={(row) => deleteSupplier(db, row.id)}
        onRename={(row, newName) => renameSupplier(db, row.id, newName)}
        renderLabel={(row) => row.name} />
    </div>
  );
}
