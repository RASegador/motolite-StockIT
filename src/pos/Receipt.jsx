import { currency } from '../lib/format';

export default function Receipt({ sale, onClose }) {
  return (
    <div className="receipt-modal">
      <div className="receipt">
        <img src="/branding/motolite-logo.png" alt="Motolite" className="receipt-logo" />
        <h3>Receipt {sale.receiptNo}</h3>
        <p>{new Date(sale.timestamp).toLocaleString()}</p>
        <table>
          <tbody>
            {sale.items.map((line, i) => (
              <tr key={i}>
                <td>{line.sku} × {line.qty} {line.unitName}</td>
                <td>{currency(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="receipt-total">Total: {currency(sale.total)}</p>
        {sale.amountReceived != null && (
          <>
            <p>Received: {currency(sale.amountReceived)}</p>
            <p>Change: {currency(sale.change)}</p>
          </>
        )}
      </div>
      <button onClick={() => window.print()}>Print</button>
      <button onClick={onClose}>Close</button>
    </div>
  );
}
