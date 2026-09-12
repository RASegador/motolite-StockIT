import { useState } from 'react';
import { ShoppingCart, Search, Plus, Minus } from 'lucide-react';
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

  const q = search.trim().toLowerCase();
  const visibleItems = q.length === 0 ? items : items.filter((it) =>
    it.sku?.toLowerCase().includes(q) || it.name?.toLowerCase().includes(q)
    || it.batteryModel?.toLowerCase().includes(q) || it.vehicleType?.toLowerCase().includes(q)
  );

  function cartQtyFor(itemId, unitName) {
    return cart.find((l) => l.itemId === itemId && l.unitName === unitName)?.qty || 0;
  }

  function setLineQty(item, unit, qty) {
    setCart((prev) => {
      const withoutLine = prev.filter((l) => !(l.itemId === item.id && l.unitName === unit.name));
      if (qty <= 0) return withoutLine;
      return [...withoutLine, {
        itemId: item.id, sku: item.sku, name: item.name, qty,
        unitName: unit.name, unitPrice: unit.price, factor: unit.factor,
      }];
    });
  }

  function bumpQty(item, delta) {
    const unit = getItemUnits(item)[0];
    const current = cartQtyFor(item.id, unit.name);
    const next = Math.max(0, Math.min(item.quantity, current + delta));
    setLineQty(item, unit, next);
  }

  function addToCart(item) {
    bumpQty(item, 1);
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
      <div className="pos-main">
        <div className="pos-search">
          <Search size={16} />
          <input placeholder="Search SKU, name, model, vehicle type…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="pos-grid">
          {visibleItems.map((it) => {
            const unit = getItemUnits(it)[0];
            const qty = cartQtyFor(it.id, unit.name);
            return (
              <div className="pos-item-card" key={it.id}>
                <div className="pos-item-card-info">
                  <p className="pos-item-card-name">{it.name}</p>
                  <p className="pos-item-card-sku">{it.sku}</p>
                  <p className="pos-item-card-price">{currency(it.sellingPrice)}</p>
                  <p className="pos-item-card-stock">{it.quantity} in stock</p>
                </div>
                <div className="qty-stepper">
                  <button type="button" onClick={() => bumpQty(it, -1)} disabled={qty === 0} aria-label={`Remove one ${it.name}`}>
                    <Minus size={14} />
                  </button>
                  <span>{qty}</span>
                  <button type="button" onClick={() => bumpQty(it, 1)} disabled={qty >= it.quantity} aria-label={`Add one ${it.name}`}>
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            );
          })}
          {visibleItems.length === 0 && <p className="pos-empty">No items match your search.</p>}
        </div>
      </div>

      <div className="pos-cart-card">
        <h3><ShoppingCart size={16} /> Cart</h3>
        <ul className="pos-cart-lines">
          {cart.map((line) => {
            const item = items.find((it) => it.id === line.itemId);
            return (
            <li key={`${line.itemId}-${line.unitName}`}>
              <span className="pos-cart-line-name">{line.sku} — {line.name}</span>
              <div className="qty-stepper">
                <button type="button" onClick={() => item ? bumpQty(item, -1) : setLineQty({ id: line.itemId }, { name: line.unitName, price: line.unitPrice, factor: line.factor }, line.qty - 1)} aria-label={`Remove one ${line.name}`}>
                  <Minus size={14} />
                </button>
                <span>{line.qty}</span>
                <button type="button" onClick={() => item && bumpQty(item, 1)} disabled={item && line.qty >= item.quantity} aria-label={`Add one ${line.name}`}>
                  <Plus size={14} />
                </button>
              </div>
              <span className="pos-cart-line-total">{currency(line.unitPrice * line.qty)}</span>
            </li>
            );
          })}
          {cart.length === 0 && <li className="pos-empty">Cart is empty.</li>}
        </ul>
        <p className="pos-total">Total: {currency(total)}</p>
        <input placeholder="Amount received" type="number" value={amountReceived}
          onChange={(e) => setAmountReceived(e.target.value)} />
        {error && <p className="pos-error">{error}</p>}
        <button className="btn-primary pos-checkout-btn" disabled={cart.length === 0} onClick={handleCheckout}>Checkout</button>
      </div>

      {completedSale && <Receipt sale={completedSale} onClose={() => setCompletedSale(null)} />}
    </div>
  );
}
