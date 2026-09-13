import { useEffect, useRef, useState } from 'react';
import {
  LayoutGrid, Boxes, ShoppingCart, AlertTriangle, Truck, Store, ShieldCheck, Tag, Receipt, LogOut,
  ChevronDown, Menu, X, ClipboardList, PackageSearch,
} from 'lucide-react';
import { can } from '../lib/permissions';
import Tooltip from './Tooltip';

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid, permission: null },
  { key: 'pos', label: 'POS', icon: ShoppingCart, permission: 'pos' },
  { key: 'inventory', label: 'Inventory', icon: Boxes, permission: 'viewInventory' },
  { key: 'catalog', label: 'Categories/Locations/Suppliers', icon: Tag, permission: 'manageCategories' },
  { key: 'damage', label: 'Damaged/Returned', icon: AlertTriangle, permission: 'reportDamage' },
  { key: 'transfers', label: 'Branch Transfers', icon: Truck, anyPermission: ['initiateTransfer', 'confirmTransfer'] },
  { key: 'restock', label: 'Restock', icon: PackageSearch, anyPermission: ['createRestockRequest', 'reviewRestockRequest'] },
  // Gated on 'viewOwnSales' OR 'viewSalesReports': 'viewOwnSales' is true
  // for Admin only (sees every sale across every shop), and
  // 'viewSalesReports' is true for Admin and Manager (Manager sees their
  // whole shop's sales, no Cancel button since Manager can't cancel). The
  // OR covers both roles that should see this nav item.
  { key: 'sales', label: 'Sales History', icon: Receipt, anyPermission: ['viewOwnSales', 'viewSalesReports'] },
  { key: 'shops', label: 'Shops', icon: Store, permission: 'manageShops' },
  { key: 'users', label: 'Users', icon: ShieldCheck, permission: 'manageUsers' },
  { key: 'activityLog', label: 'Activity Log', icon: ClipboardList, permission: 'viewActivityLog' },
];

// Items kept inline at tablet width — everything else moves into "More".
// Picked as the ones used most often day-to-day; every role still sees
// every item they have permission for, just split across the inline row
// and the dropdown instead of all squeezed into one row.
const TABLET_PRIMARY_KEYS = ['overview', 'pos', 'inventory', 'sales'];

// `role` here is always the already-resolved value from useAuth() (see
// permissions.js's resolveRole()), so a legacy 'owner' doc already reads as
// 'admin' by the time it gets here — the capitalize fallback below handles
// 'admin' fine on its own, this just keeps the label logic explicit.
function roleLabel(role) {
  if (role === 'admin') return 'Admin';
  if (!role) return '';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function Topbar({ view, setView, role, fullName, onLogout }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const moreRef = useRef(null);
  const mobileRef = useRef(null);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.permission === null) return true;
    if (item.anyPermission) return item.anyPermission.some((p) => can(role, p));
    return can(role, item.permission);
  });
  const primaryItems = visibleItems.filter((item) => TABLET_PRIMARY_KEYS.includes(item.key));
  const secondaryItems = visibleItems.filter((item) => !TABLET_PRIMARY_KEYS.includes(item.key));
  const secondaryActive = secondaryItems.some((item) => item.key === view);

  // Close the "More" dropdown / mobile panel on an outside click — without
  // this, either would stay open after picking a page in some browsers'
  // event ordering, or after clicking anywhere else on the topbar.
  useEffect(() => {
    function handleClick(e) {
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
      if (mobileOpen && mobileRef.current && !mobileRef.current.contains(e.target)) setMobileOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [moreOpen, mobileOpen]);

  function go(key) {
    setView(key);
    setMoreOpen(false);
    setMobileOpen(false);
  }

  function NavButton({ item, iconSize = 17 }) {
    return (
      <button
        type="button"
        className={`topbar-nav-item ${view === item.key ? 'active' : ''}`}
        onClick={() => go(item.key)}
      >
        <item.icon size={iconSize} className="topbar-nav-icon" />
        <span className="topbar-nav-label">{item.label}</span>
      </button>
    );
  }

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <img src="/branding/motolite-logo.png" alt="Motolite" className="topbar-logo" />
        <span className="topbar-title">Motolite IMS</span>
      </div>

      {/* Desktop: every item in one row. */}
      <nav className="topbar-nav topbar-nav-full" aria-label="Main navigation">
        {visibleItems.map((item) => <NavButton key={item.key} item={item} />)}
      </nav>

      {/* Tablet: the most-used items inline, everything else under More. */}
      <nav className="topbar-nav topbar-nav-tablet" aria-label="Main navigation">
        {primaryItems.map((item) => <NavButton key={item.key} item={item} />)}
        {secondaryItems.length > 0 && (
          <div className="topbar-more" ref={moreRef}>
            <button
              type="button"
              className={`topbar-nav-item topbar-more-toggle ${secondaryActive ? 'active' : ''}`}
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
            >
              More <ChevronDown size={14} className={`topbar-more-chevron ${moreOpen ? 'open' : ''}`} />
            </button>
            {moreOpen && (
              <div className="topbar-more-menu">
                {secondaryItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`topbar-more-item ${view === item.key ? 'active' : ''}`}
                    onClick={() => go(item.key)}
                  >
                    <item.icon size={16} /> {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="topbar-right">
        <span className="topbar-user">
          <span className="topbar-user-name">{fullName}</span>
          <span className="topbar-user-role">{roleLabel(role)}</span>
        </span>
        <Tooltip label="Sign out" className="topbar-logout-wrap">
          <button className="topbar-logout" onClick={onLogout}>
            <LogOut size={17} /> <span className="topbar-logout-label">Sign out</span>
          </button>
        </Tooltip>
        {/* Mobile: everything collapses behind this. */}
        <button
          type="button"
          className="topbar-hamburger"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="topbar-mobile-panel" ref={mobileRef}>
          <p className="topbar-mobile-user">{fullName} <span className="topbar-user-role">{roleLabel(role)}</span></p>
          {visibleItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`topbar-mobile-item ${view === item.key ? 'active' : ''}`}
              onClick={() => go(item.key)}
            >
              <item.icon size={18} /> {item.label}
            </button>
          ))}
          <button type="button" className="topbar-mobile-item topbar-mobile-logout" onClick={onLogout}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      )}
    </header>
  );
}
