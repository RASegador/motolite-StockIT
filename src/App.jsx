import { useState, useEffect } from 'react';
import { useAuth } from './auth/useAuth';
import LoginScreen from './auth/LoginScreen';
import Sidebar from './shared/Sidebar';
import InventoryList from './inventory/InventoryList';
import POSView from './pos/POSView';
import DamageReportsView from './damage/DamageReportsView';
import TransfersView from './transfers/TransfersView';
import ShopsView from './shops/ShopsView';
import UsersView from './users/UsersView';
import CatalogManager from './catalog/CatalogManager';
import OwnerDashboard from './reports/OwnerDashboard';
import ShopReports from './reports/ShopReports';
import SalesHistory from './reports/SalesHistory';
import { useShops } from './shops/useShops';
import { can } from './lib/permissions';

export default function App() {
  const { user, profile, role, loading, login, logout, resetPassword } = useAuth();
  const [view, setView] = useState('overview');
  const shops = useShops();

  // Guard against stale `view` state carrying over across a logout/re-login
  // cycle in the same tab (this App instance never unmounts across the auth
  // early-returns below, so `view` from a previous session/role can persist).
  // The render-time can() guard in renderView() is the actual defense; this
  // reset just gets every fresh login back to a safe default proactively.
  useEffect(() => {
    setView('overview');
  }, [user?.uid]);

  if (loading) return <div className="app-loading">Loading…</div>;
  if (!user) return <LoginScreen onLogin={login} onResetPassword={resetPassword} />;
  if (!profile) {
    return (
      <div className="app-no-profile">
        No account profile found. Ask your Owner/Admin to set up your account, then sign in again.
        <button onClick={logout}>Sign out</button>
      </div>
    );
  }
  if (profile.active === false) {
    return (
      <div className="app-deactivated">
        Your account has been deactivated. Contact your Owner/Admin.
        <button onClick={logout}>Sign out</button>
      </div>
    );
  }

  const shopId = profile.shopId;
  const shopName = shops.find((s) => s.id === shopId)?.name || '';

  function defaultView() {
    return role === 'owner' ? <OwnerDashboard /> : <ShopReports shopId={shopId} shopName={shopName} />;
  }

  // Each case is gated on the exact same permission Sidebar.jsx uses to
  // decide whether to show that nav item (see NAV_ITEMS in Sidebar.jsx).
  // This defends against ANY stale/invalid `view` value reaching a screen
  // the current role isn't permitted to see — e.g. a Manager navigates to
  // 'catalog', logs out, and a Cashier logs in on the same tab: `view` is
  // still 'catalog', Sidebar correctly hides that nav item, but without
  // this guard renderView() would still match `case 'catalog'` and render
  // CatalogManager for the Cashier anyway.
  function renderView() {
    switch (view) {
      case 'pos':
        return can(role, 'pos')
          ? <POSView role={role} shopId={shopId} cashierId={user.uid} cashierEmail={user.email} />
          : defaultView();
      case 'inventory':
        return can(role, 'viewInventory') ? <InventoryList role={role} shopId={shopId} /> : defaultView();
      case 'catalog':
        return can(role, 'manageCategories') ? <CatalogManager /> : defaultView();
      case 'damage':
        return can(role, 'reportDamage')
          ? <DamageReportsView role={role} shopId={shopId} userId={user.uid} />
          : defaultView();
      case 'transfers':
        return can(role, 'initiateTransfer')
          ? <TransfersView role={role} shopId={shopId} userId={user.uid} />
          : defaultView();
      case 'sales':
        return can(role, 'viewOwnSales')
          ? <SalesHistory role={role} shopId={shopId} userId={user.uid} />
          : defaultView();
      case 'shops':
        return can(role, 'manageShops') ? <ShopsView /> : defaultView();
      case 'users':
        return can(role, 'manageUsers') ? <UsersView /> : defaultView();
      case 'overview':
      default:
        return defaultView();
    }
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} role={role} fullName={profile.fullName} onLogout={logout} />
      <main className="app-main">{renderView()}</main>
    </div>
  );
}
