import { useEffect, useState } from 'react';
import { ShoppingCart, Search, Plus, Minus, WifiOff } from 'lucide-react';
import { useItems } from '../inventory/useItems';
import { useShops } from '../shops/useShops';
import { getItemUnits } from '../lib/units';
import { currency } from '../lib/format';
import { completeSale } from './salesActions';
import { useBarcodeScanner } from '../barcode/useBarcodeScanner';
import { db } from '../firebase';
import Receipt from './Receipt';
import Tooltip from '../shared/Tooltip';
import { enqueueSale, listQueuedSales, syncQueuedSales, looksOffline } from './offlineQueue';

const PAYMENT_METHODS = ['Cash', 'GCash', 'Card', 'Other'];

function lineKey(itemId, unitName) {
  return `${itemId}::${unitName}`;
}

export default function POSView({ role, shopId, cashierId, cashierEmail }) {
  const items = useItems({ role, shopId });
  const shops = useShops();
  const shopName = shops.find((s) => s.id === shopId)?.name || '';
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]); // [{ itemId, sku, name, qty, unitName, unitPrice, factor }]
  const [amountReceived, setAmountReceived] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  // Discount is entirely optional — off by default on every sale. Toggling
  // it on reveals the type/value inputs; toggling it off (or leaving the
  // value blank) means completeSale() gets no discount at all, same as
  // before this feature existed.
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountType, setDiscountType] = useState('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [error, setError] = useState('');
  const [completedSale, setCompletedSale] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  // Keyed by lineKey(itemId, unitName) — kept separate from `cart` itself
  // so bumping a quantity doesn't need to reshuffle already-typed serials.
  const [serialsByLine, setSerialsByLine] = useState({});
  const [coreByLine, setCoreByLine] = useState({});
  const [pendingCount, setPendingCount] = useState(() => listQueuedSales().length);
  const [savedOffline, setSavedOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Retries whatever's queued whenever the browser reports coming back
  // online, and once on mount (covers the case where sales were queued in
  // an earlier visit and connectivity is already back by the time this
  // page loads again). See offlineQueue.js for why a failure stops at the
  // first entry rather than skipping it.
  async function trySync() {
    if (listQueuedSales().length === 0) return;
    setSyncing(true);
    try {
      await syncQueuedSales(db);
    } finally {
      setPendingCount(listQueuedSales().length);
      setSyncing(false);
    }
  }
  useEffect(() => {
    trySync();
    window.addEventListener('online', trySync);
    return () => window.removeEventListener('online', trySync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const coreCreditTotal = cart.reduce((s, l) => s + (Number(coreByLine[lineKey(l.itemId, l.unitName)]?.creditAmount) || 0), 0);
  const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0) - coreCreditTotal;
  // Mirrors completeSale()'s own clamping (0-100 for a percent, capped at
  // the subtotal for a fixed amount) purely so the cart preview matches
  // what checkout will actually charge — completeSale() is still the real
  // source of truth and re-derives this itself from the same inputs.
  const discountAmount = !discountEnabled || !discountValue
    ? 0
    : discountType === 'percent'
      ? subtotal * (Math.min(100, Math.max(0, Number(discountValue) || 0)) / 100)
      : Math.min(subtotal, Math.max(0, Number(discountValue) || 0));
  const total = subtotal - discountAmount;

  // Merges the free-standing serial/core-exchange entry state into the
  // cart lines completeSale() actually expects — kept separate above so
  // typing a serial never has to touch `cart` itself.
  function buildCartLinesForCheckout() {
    return cart.map((line) => {
      const key = lineKey(line.itemId, line.unitName);
      const serials = serialsByLine[key];
      const core = coreByLine[key];
      return {
        ...line,
        ...(serials ? { serials } : {}),
        ...(core?.creditAmount ? { coreExchange: core } : {}),
      };
    });
  }

  function resetCartState() {
    setCart([]);
    setAmountReceived('');
    setPaymentMethod('Cash');
    setDiscountEnabled(false);
    setDiscountValue('');
    setSerialsByLine({});
    setCoreByLine({});
    setCustomerName('');
    setCustomerPhone('');
  }

  async function handleCheckout() {
    setError('');
    setSavedOffline(false);
    const discount = discountEnabled && discountValue ? { type: discountType, value: Number(discountValue) } : null;
    const cartLines = buildCartLinesForCheckout();
    const customer = (customerName || customerPhone) ? { name: customerName, phone: customerPhone } : null;
    const meta = { shopId, cashierId, cashierEmail, shopName, paymentMethod, discount, customer };
    try {
      const sale = await completeSale(db, cartLines, amountReceived || null, meta);
      setCompletedSale(sale);
      resetCartState();
    } catch (err) {
      // A stock/validation error (missing a serial, not enough stock, an
      // empty cart) should surface immediately, not sit invisibly in an
      // offline queue — only something that looks like a connectivity
      // failure gets queued for automatic retry instead of blocking the
      // cashier at the counter.
      if (looksOffline(err)) {
        enqueueSale({ cartLines, amountReceived: amountReceived || null, meta });
        setPendingCount(listQueuedSales().length);
        setSavedOffline(true);
        resetCartState();
      } else {
        setError(err.message);
      }
    }
  }

  return (
    <div className="pos-view">
      {pendingCount > 0 && (
        <div className="pos-offline-banner" role="status">
          <WifiOff size={14} /> {pendingCount} sale{pendingCount === 1 ? '' : 's'} saved offline, waiting to sync
          {syncing ? '…' : '.'}
          <button type="button" className="btn-link" onClick={trySync} disabled={syncing}>Retry now</button>
        </div>
      )}
      {savedOffline && (
        <div className="pos-offline-banner pos-offline-banner-saved" role="status">
          No connection — this sale was saved on this device and will sync automatically once you're back online.
        </div>
      )}
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
                  <Tooltip label="Decrease quantity">
                    <button type="button" onClick={() => bumpQty(it, -1)} disabled={qty === 0} aria-label={`Remove one ${it.name}`}>
                      <Minus size={14} />
                    </button>
                  </Tooltip>
                  <span>{qty}</span>
                  <Tooltip label="Increase quantity">
                    <button type="button" onClick={() => bumpQty(it, 1)} disabled={qty >= it.quantity} aria-label={`Add one ${it.name}`}>
                      <Plus size={14} />
                    </button>
                  </Tooltip>
                </div>
              </div>
            );
          })}
          {visibleItems.length === 0 && <p className="pos-empty">No items match your search.</p>}
        </div>
      </div>

      <div className="pos-cart-card">
        {/* Static branding — always rendered on page load, independent of
            `completedSale`/cart state, unlike the logo on the printed
            Receipt (which only exists once a sale completes). */}
        <img src="/branding/motolite-logo.png" alt="Motolite" className="pos-cart-logo" />
        <h3><ShoppingCart size={16} /> Cart</h3>
        <ul className="pos-cart-lines">
          {cart.map((line) => {
            const item = items.find((it) => it.id === line.itemId);
            const key = lineKey(line.itemId, line.unitName);
            const serials = serialsByLine[key] || [];
            const core = coreByLine[key] || { oldSerial: '', oldBrand: '', creditAmount: '' };
            function setSerial(idx, value) {
              const next = [...serials];
              next[idx] = value;
              setSerialsByLine({ ...serialsByLine, [key]: next });
            }
            function setCoreField(field, value) {
              setCoreByLine({ ...coreByLine, [key]: { ...core, [field]: value } });
            }
            return (
            <li key={key} className="pos-cart-line">
              <div className="pos-cart-line-row">
                <span className="pos-cart-line-name">{line.sku} — {line.name}</span>
                <div className="qty-stepper">
                  <Tooltip label="Decrease quantity">
                    <button type="button" onClick={() => item ? bumpQty(item, -1) : setLineQty({ id: line.itemId }, { name: line.unitName, price: line.unitPrice, factor: line.factor }, line.qty - 1)} aria-label={`Remove one ${line.name}`}>
                      <Minus size={14} />
                    </button>
                  </Tooltip>
                  <span>{line.qty}</span>
                  <Tooltip label="Increase quantity">
                    <button type="button" onClick={() => item && bumpQty(item, 1)} disabled={item && line.qty >= item.quantity} aria-label={`Add one ${line.name}`}>
                      <Plus size={14} />
                    </button>
                  </Tooltip>
                </div>
                <span className="pos-cart-line-total">{currency(line.unitPrice * line.qty - (Number(core.creditAmount) || 0))}</span>
              </div>
              {item?.trackSerial && (
                <div className="pos-cart-line-serials">
                  {Array.from({ length: line.qty }).map((_, idx) => (
                    <input key={idx} placeholder={`Serial #${idx + 1}`} value={serials[idx] || ''}
                      onChange={(e) => setSerial(idx, e.target.value)} required />
                  ))}
                </div>
              )}
              <details className="pos-cart-line-core">
                <summary>Trade-in / core exchange (optional)</summary>
                <div className="pos-cart-line-core-fields">
                  <input placeholder="Old battery brand" value={core.oldBrand} onChange={(e) => setCoreField('oldBrand', e.target.value)} />
                  <input placeholder="Old battery serial" value={core.oldSerial} onChange={(e) => setCoreField('oldSerial', e.target.value)} />
                  <input type="number" placeholder="Credit ₱" value={core.creditAmount} onChange={(e) => setCoreField('creditAmount', e.target.value)} />
                </div>
              </details>
            </li>
            );
          })}
          {cart.length === 0 && <li className="pos-empty">Cart is empty.</li>}
        </ul>
        <div className="pos-customer">
          <input placeholder="Customer name (optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <input placeholder="Customer phone (optional)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
        </div>
        <div className="pos-discount">
          <label className="pos-discount-toggle">
            <input type="checkbox" checked={discountEnabled}
              onChange={(e) => { setDiscountEnabled(e.target.checked); if (!e.target.checked) setDiscountValue(''); }} />
            Apply discount (optional)
          </label>
          {discountEnabled && (
            <div className="pos-discount-fields">
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
                <option value="percent">% off</option>
                <option value="fixed">₱ off</option>
              </select>
              <input type="number" min="0" max={discountType === 'percent' ? 100 : undefined}
                placeholder={discountType === 'percent' ? '0–100' : 'Amount'}
                value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
            </div>
          )}
        </div>
        {discountAmount > 0 ? (
          <>
            <p className="pos-subtotal">Subtotal: {currency(subtotal)}</p>
            <p className="pos-discount-line">Discount: -{currency(discountAmount)}</p>
          </>
        ) : null}
        <p className="pos-total">Total: {currency(total)}</p>
        <label className="pos-payment-method">
          Payment method
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        {paymentMethod === 'Cash' && (
          <input placeholder="Amount received" type="number" value={amountReceived}
            onChange={(e) => setAmountReceived(e.target.value)} />
        )}
        {error && <p className="pos-error">{error}</p>}
        <button className="btn-primary pos-checkout-btn" disabled={cart.length === 0} onClick={handleCheckout}>Checkout</button>
      </div>

      {completedSale && <Receipt sale={completedSale} shopName={shopName} onClose={() => setCompletedSale(null)} />}
    </div>
  );
}
