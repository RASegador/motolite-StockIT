import {
  LayoutGrid, Boxes, ShoppingCart, AlertTriangle, Truck, Store, ShieldCheck, Tag, Receipt, LogOut,
} from 'lucide-react';
import { can } from '../lib/permissions';
import Tooltip from './Tooltip';

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid, permission: null },
  { key: 'pos', label: 'POS', icon: ShoppingCart, permission: 'pos' },
  { key: 'inventory', label: 'Inventory', icon: Boxes, permission: 'viewInventory' },
  { key: 'catalog', label: 'Categories/Locations/Suppliers', icon: Tag, permission: 'manageCategories' },
  { key: 'damage', label: 'Damaged/Returned', icon: AlertTriangle, permission: 'reportDamage' },
  { key: 'transfers', label: 'Branch Transfers', icon: Truck, permission: 'initiateTransfer' },
  // Gated on 'viewOwnSales' OR 'viewSalesReports': 'viewOwnSales' is true
  // for Owner and Cashier (Owner sees every sale, Cashier sees only their
  // own — SalesHistory.jsx branches on role for which), and
  // 'viewSalesReports' is true for Owner and Manager (Manager sees their
  // whole shop's sales, no Cancel button since Manager can't cancel). The
  // OR covers all three roles that should see this nav item.
  { key: 'sales', label: 'Sales History', icon: Receipt, anyPermission: ['viewOwnSales', 'viewSalesReports'] },
  { key: 'shops', label: 'Shops', icon: Store, permission: 'manageShops' },
  { key: 'users', label: 'Users', icon: ShieldCheck, permission: 'manageUsers' },
];

export default function Sidebar({ view, setView, role, fullName, onLogout }) {
  return (
    <nav className="sidebar">
      <img src="/branding/motolite-logo.png" alt="Motolite" className="sidebar-logo" />
      <p className="sidebar-user">
        <span className="sidebar-user-name">{fullName}</span>
        <span className="sidebar-user-role">{role}</span>
      </p>
      <ul>
        {NAV_ITEMS.filter((item) => {
          if (item.permission === null) return true;
          if (item.anyPermission) return item.anyPermission.some((p) => can(role, p));
          return can(role, item.permission);
        }).map((item) => (
          <li key={item.key} className={view === item.key ? 'active' : ''} onClick={() => setView(item.key)}>
            <Tooltip label={item.label} className="sidebar-nav-item">
              <item.icon size={18} className="sidebar-nav-icon" />
              <span className="sidebar-nav-label">{item.label}</span>
            </Tooltip>
          </li>
        ))}
      </ul>
      <Tooltip label="Sign out" className="sidebar-logout-wrap">
        <button className="sidebar-logout" onClick={onLogout}>
          <LogOut size={18} className="sidebar-nav-icon" /> <span className="sidebar-nav-label">Sign out</span>
        </button>
      </Tooltip>
    </nav>
  );
}
