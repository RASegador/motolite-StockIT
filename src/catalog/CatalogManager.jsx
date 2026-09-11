import { useState } from 'react';
import { Tag, MapPin, Truck } from 'lucide-react';
import { useCategories, useLocations, useSuppliers } from './useCatalog';
import { addCategory, deleteCategory, addLocation, deleteLocation, addSupplier, deleteSupplier } from './catalogActions';
import { db } from '../firebase';

function ListEditor({ icon, title, rows, onAdd, onRemove, renderLabel }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    try {
      await onAdd(value);
      setValue('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="catalog-section">
      <h3>{icon} {title}</h3>
      <form onSubmit={handleAdd}>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Add ${title.toLowerCase()}`} />
        <button type="submit">Add</button>
      </form>
      {error && <p className="catalog-error">{error}</p>}
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <span>{renderLabel ? renderLabel(row) : row.name}</span>
            <button onClick={async () => {
              try { await onRemove(row.name); } catch (err) { setError(err.message); }
            }}>Remove</button>
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
