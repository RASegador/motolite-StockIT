import { useState } from 'react';
import { ShieldCheck, Search } from 'lucide-react';
import { lookupWarrantyBySerial, lookupWarrantyByPhone, warrantyStatus } from './warrantyLookupActions';
import { db } from '../firebase';

export default function WarrantyLookupView() {
  const [mode, setMode] = useState('serial');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    setError('');
    setSearching(true);
    try {
      if (mode === 'serial') {
        const record = await lookupWarrantyBySerial(db, query);
        setResults(record ? [record] : []);
      } else {
        setResults(await lookupWarrantyByPhone(db, query));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="warranty-lookup-view">
      <h2><ShieldCheck size={18} /> Warranty Lookup</h2>
      <p className="dashboard-activity-hint">
        Find what a battery's serial number was sold as, when, and whether it's still under warranty.
        Only items with "Track serial numbers" turned on (see Inventory → Add/Edit Item) show up here.
      </p>
      <form onSubmit={handleSearch} className="warranty-lookup-form">
        <select value={mode} onChange={(e) => { setMode(e.target.value); setResults(null); }}>
          <option value="serial">By serial number</option>
          <option value="phone">By customer phone</option>
        </select>
        <input placeholder={mode === 'serial' ? 'Serial number' : 'Customer phone'} value={query}
          onChange={(e) => setQuery(e.target.value)} required />
        <button className="btn-primary" type="submit" disabled={searching}>
          <Search size={14} /> {searching ? 'Searching…' : 'Search'}
        </button>
      </form>
      {error && <p className="pos-error">{error}</p>}
      {results && (
        results.length === 0 ? (
          <p className="inventory-empty">No matching serial found.</p>
        ) : (
          <table className="dashboard-shop-table">
            <thead><tr><th>Serial</th><th>Item</th><th>Sold</th><th>Shop</th><th>Warranty status</th></tr></thead>
            <tbody>
              {results.map((r) => {
                const status = warrantyStatus(r);
                return (
                  <tr key={r.serial}>
                    <td>{r.serial}</td><td>{r.sku} — {r.name}</td>
                    <td>{new Date(r.soldAt).toLocaleDateString()}</td><td>{r.shopName}</td>
                    <td className={status.active ? 'cash-reconciliation-over' : 'cash-reconciliation-short'}>
                      {status.label}{status.active && status.expiresAt ? ` (until ${new Date(status.expiresAt).toLocaleDateString()})` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}
