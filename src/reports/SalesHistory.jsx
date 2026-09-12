import { useState } from 'react';
import { Receipt, Eye, RotateCcw } from 'lucide-react';
import { useSales } from './useSales';
import { useShops } from '../shops/useShops';
import { cancelSale } from '../pos/salesActions';
import { can } from '../lib/permissions';
import { currency } from '../lib/format';
import { db } from '../firebase';
import ReceiptView from '../pos/Receipt';
import RefundModal from '../pos/RefundModal';
import Tooltip from '../shared/Tooltip';

// Owner/Admin sees every shop's sales (role === 'owner' already makes
// useSales fetch everything); a Cashier sees only their own — filtered
// here rather than in useSales, since "my sales" isn't a shop-scoping
// concern, it's a per-cashier one on top of the shop scope already
// applied by useSales for non-owner roles. Manager sees every sale in
// their own shop (useSales already scopes to shopId for non-owner roles)
// with no per-cashier filter and, per the Cancel-button gating below, no
// ability to cancel — Manager has viewSalesReports but not cancelSales.
export default function SalesHistory({ role, shopId, userId }) {
  const allSales = useSales({ role, shopId });
  const shops = useShops();
  const sales = role === 'cashier' ? allSales.filter((s) => s.cashierId === userId) : allSales;
  const [error, setError] = useState('');
  const [viewingSale, setViewingSale] = useState(null);
  const [refundingSale, setRefundingSale] = useState(null);

  async function handleCancel(sale) {
    setError('');
    try {
      await cancelSale(db, sale);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="sales-history">
      <h2><Receipt size={18} /> {role === 'cashier' ? 'My Sales' : 'Sales History'}</h2>
      {error && <p className="sales-history-error">{error}</p>}
      <table>
        <thead>
          <tr><th>Receipt</th><th>Date</th><th>Total</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr key={s.id}>
              <td>{s.receiptNo}</td>
              <td>{new Date(s.timestamp).toLocaleString()}</td>
              <td>{currency(s.total)}</td>
              <td>{s.cancelled ? 'Cancelled' : s.refundedAmount > 0 ? `Refunded ${currency(s.refundedAmount)}` : 'Completed'}</td>
              <td>
                <div className="list-row-actions">
                  <Tooltip label="View this transaction's receipt">
                    <button className="icon-button" aria-label="View receipt" onClick={() => setViewingSale(s)}>
                      <Eye size={14} />
                    </button>
                  </Tooltip>
                  {!s.cancelled && can(role, 'cancelSales') && (
                    <>
                      <Tooltip label="Refund item(s) from this sale">
                        <button className="icon-button" aria-label="Refund" onClick={() => setRefundingSale(s)}>
                          <RotateCcw size={14} />
                        </button>
                      </Tooltip>
                      <button className="btn-danger" onClick={() => handleCancel(s)}>Cancel</button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {viewingSale && (
        <ReceiptView
          sale={viewingSale}
          shopName={shops.find((sh) => sh.id === viewingSale.shopId)?.name || ''}
          copyLabel={role === 'cashier' ? 'Customer Copy' : 'Owner Copy'}
          onClose={() => setViewingSale(null)}
        />
      )}
      {refundingSale && (
        <RefundModal
          sale={refundingSale}
          userId={userId}
          onClose={() => setRefundingSale(null)}
          onDone={() => setRefundingSale(null)}
        />
      )}
    </div>
  );
}
