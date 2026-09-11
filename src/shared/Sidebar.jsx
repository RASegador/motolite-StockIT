import { LayoutGrid, Boxes, ShoppingCart, AlertTriangle, Truck, Store, ShieldCheck, Tag, Receipt, LogOut } from 'lucide-react';
import { can } from '../lib/permissions';

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid, permission: null },
  { key: 'pos', label: 'POS', icon: ShoppingCart, permission: 'pos' },
  { key: 'inventory', label: 'Inventory', icon: Boxes, permission: 'viewInventory' },
  { key: 'catalog', label: 'Categories/Locations/Suppliers', icon: Tag, permission: 'manageCategories' },
  { key: 'damage', label: 'Damaged/Returned', icon: AlertTriangle, permission: 'reportDamage' },
  { key: 'transfers', label: 'Branch Transfers', icon: Truck, permission: 'initiateTransfer' },
  // Gated on 'viewOwnSales' specifically (not 'viewSalesReports'): that
  // permission is true for Owner and Cashier and false for Manager in
  // src/lib/permissions.js, which happens to be exactly the set of roles
  // that should see this nav item — Owner sees every sale, Cashier sees
  // only their own (SalesHistory.jsx itself branches on role for which).
  { key: 'sales', label: 'Sales History', icon: Receipt, permission: 'viewOwnSales' },
  { key: 'shops', label: 'Shops', icon: Store, permission: 'manageShops' },
  { key: 'users', label: 'Users', icon: ShieldCheck, permission: 'manageUsers' },
];

export default function Sidebar({ view, setView, role, fullName, onLogout }) {
  return (
    <nav className="sidebar">
      <img src="/branding/motolite-logo.png" alt="Motolite" className="sidebar-logo" />
      <p className="sidebar-user">{fullName} ({role})</p>
      <ul>
        {NAV_ITEMS.filter((item) => item.permission === null || can(role, item.permission)).map((item) => (
          <li key={item.key} className={view === item.key ? 'active' : ''} onClick={() => setView(item.key)}>
            <item.icon size={16} /> {item.label}
          </li>
        ))}
      </ul>
      <button className="sidebar-logout" onClick={onLogout}><LogOut size={16} /> Sign out</button>
    </nav>
  );
}
