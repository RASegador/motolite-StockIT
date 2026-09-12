import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import PublicProductView from './public/PublicProductView.jsx';
import PublicReceiptView from './public/PublicReceiptView.jsx';
import './index.css';

// The app has no client-side router — every screen is authenticated
// view-state inside <App>. The two exceptions are the QR-code destinations,
// which must work for someone with no account at all, so they're resolved
// here, before <App> (and its login gate) ever renders. Kept as a plain
// path check rather than pulling in a routing library for two routes.
function resolveRoute() {
  const path = window.location.pathname;
  const productMatch = path.match(/^\/p\/([^/]+)\/?$/);
  if (productMatch) return <PublicProductView itemId={decodeURIComponent(productMatch[1])} />;
  const receiptMatch = path.match(/^\/r\/([^/]+)\/?$/);
  if (receiptMatch) return <PublicReceiptView token={decodeURIComponent(receiptMatch[1])} />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {resolveRoute()}
  </React.StrictMode>
);
