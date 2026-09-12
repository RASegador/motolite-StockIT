import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Battery } from 'lucide-react';
import { db } from '../firebase';
import { currency } from '../lib/format';

// Reached by scanning an item's product QR code — no login, reads only the
// curated `productPublic/{itemId}` mirror (see buildPublicProduct), never
// the real `items` document (which Firestore rules keep behind auth anyway).
export default function PublicProductView({ itemId }) {
  const [state, setState] = useState({ loading: true, product: null, error: null });

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, 'productPublic', itemId))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) setState({ loading: false, product: null, error: 'not-found' });
        else setState({ loading: false, product: snap.data(), error: null });
      })
      .catch(() => !cancelled && setState({ loading: false, product: null, error: 'failed' }));
    return () => { cancelled = true; };
  }, [itemId]);

  if (state.loading) return <div className="public-page public-page-loading">Loading product…</div>;
  if (!state.product) {
    return (
      <div className="public-page public-page-error">
        <h2>Product not found</h2>
        <p>This QR code doesn't match any product we have on file.</p>
      </div>
    );
  }

  const p = state.product;
  return (
    <div className="public-page">
      <div className="public-card">
        <div className="public-card-icon"><Battery size={28} /></div>
        <h1>{p.name}</h1>
        <p className="public-card-sku">{p.sku}</p>
        <p className="public-card-price">{currency(p.sellingPrice)}</p>
        <dl className="public-card-specs">
          {p.category && <><dt>Category</dt><dd>{p.category}</dd></>}
          {p.batteryModel && <><dt>Battery model</dt><dd>{p.batteryModel}</dd></>}
          {p.voltage != null && <><dt>Voltage</dt><dd>{p.voltage}V</dd></>}
          {p.capacity && <><dt>Capacity</dt><dd>{p.capacity}</dd></>}
          {p.vehicleType && <><dt>Vehicle type</dt><dd>{p.vehicleType}</dd></>}
          {p.warrantyMonths != null && <><dt>Warranty</dt><dd>{p.warrantyMonths} months</dd></>}
        </dl>
        <p className="public-card-footer">Motolite IMS — Product Information</p>
      </div>
    </div>
  );
}
