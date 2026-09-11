import { useState } from 'react';
import { ShoppingCart, Search } from 'lucide-react';
import { useItems } from '../inventory/useItems';
import { getItemUnits } from '../lib/units';
import { currency } from '../lib/format';
import { completeSale } from './salesActions';
import { useBarcodeScanner } from '../barcode/useBarcodeScanner';
import { db } from '../firebase';
import Receipt from './Receipt';

export default function POSView({ role, shopId, cashierId, cashierEmail }) {
  const items = useItems({ role, shopId });
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]); // [{ itemId, sku, name, qty, unitName, unitPrice, factor }]
  const [amountReceived, setAmountReceived] = useState('');
  const [error, setError] = useState('');
  const [completedSale, setCompletedSale] = useState(null);

  const results = items.filter((it) => {
    const q = search.toLowerCase();
    return q.length > 0 && (
      it.sku?.toLowerCase().includes(q) || it.name?.toLowerCase().includes(q)
      || it.batteryModel?.toLowerCase().includes(q) || it.vehicleType?.toLowerCase().includes(q)
    );
  });

  function addToCart(item) {
    const unit = getItemUnits(item)[0];
    setCart((prev) => {
      const existing = prev.find((l) => l.itemId === item.id && l.unitName === unit.name);
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, {
        itemId: item.id, sku: item.sku, name: item.name, qty: 1,
        unitName: unit.name, unitPrice: unit.price, factor: unit.factor,
      }];
    });
    setSearch('');
  }

  // A hardware scanner keystroke-burst resolves to a barcode string here;
  // look it up among the currently-loaded items and reuse the same
  // add-to-cart flow as clicking a search result.
  useBarcodeScanner((code) => {
    const item = items.find((it) => it.barcode && it.barcode === code);
    if (item) addToCart(item);
  });

  const total = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);

  async function handleCheckout() {
    setError('');
    try {
      const sale = await completeSale(db, cart, amountReceived || null, { shopId, cashierId, cashierEmail });
      setCompletedSale(sale);
      setCart([]);
      setAmountReceived('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="pos-view">
      <div className="pos-search">
        <Search size={16} />
        <input placeholder="Search SKU, name, model, vehicle type…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {results.length > 0 && (
          <ul className="pos-search-results">
            {results.map((it) => (
              <li key={it.id} onClick={() => addToCart(it)}>
                {it.sku} — {it.name} ({currency(it.sellingPrice)}) — {it.quantity} in stock
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pos-cart">
        <h3><ShoppingCart size={16} /> Cart</h3>
        <ul>
          {cart.map((line, i) => (
            <li key={i}>
              {line.sku} × {line.qty} {line.unitName} — {currency(line.unitPrice * line.qty)}
            </li>
          ))}
        </ul>
        <p className="pos-total">Total: {currency(total)}</p>
        <input placeholder="Amount received" type="number" value={amountReceived}
          onChange={(e) => setAmountReceived(e.target.value)} />
        {error && <p className="pos-error">{error}</p>}
        <button disabled={cart.length === 0} onClick={handleCheckout}>Checkout</button>
      </div>

      {completedSale && <Receipt sale={completedSale} onClose={() => setCompletedSale(null)} />}
    </div>
  );
}
