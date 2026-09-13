import { useState, useEffect } from 'react';
import { useAuth } from './auth/useAuth';
import LoginScreen from './auth/LoginScreen';
import ChangePasswordScreen from './auth/ChangePasswordScreen';
import { completeFirstLogin } from './users/userActions';
import Topbar from './shared/Topbar';
import InventoryList from './inventory/InventoryList';
import POSView from './pos/POSView';
import DamageReportsView from './damage/DamageReportsView';
import TransfersView from './transfers/TransfersView';
import ShopsView from './shops/ShopsView';
import UsersView from './users/UsersView';
import CatalogManager from './catalog/CatalogManager';
import OwnerDashboard from './reports/OwnerDashboard';
import OwnerActivityLog from './reports/OwnerActivityLog';
import RestockView from './restock/RestockView';
import ShopReports from './reports/ShopReports';
import SalesHistory from './reports/SalesHistory';
import { useShops } from './shops/useShops';
import { can } from './lib/permissions';

export default function App() {
  const { user, profile, role, loading, login, logout, resetPassword } = useAuth();
  const [view, setView] = useState('overview');
  const shops = useShops();
  // Owner's profile has shopId: null (Owner isn't tied to one shop) — but
  // POS/Inventory-create/Damage/Transfer-initiate all write a `shopId`
  // onto the document they create. Passing profile.shopId straight through
  // for those screens would write shopId: null (orphaned items no shop can
  // see, sales dashboardStats silently drops, etc). This lets Owner pick
  // which shop they're acting as before using any of those write screens.
  const [ownerActiveShopId, setOwnerActiveShopId] = useState(null);

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
  if (profile.mustChangePassword) {
    return <ChangePasswordScreen onSubmit={completeFirstLogin} onLogout={logout} />;
  }

  const shopId = profile.shopId;
  const shopName = shops.find((s) => s.id === shopId)?.name || '';
  // The shopId to use for shop-scoped WRITE screens only (POS, Inventory
  // create/edit, Damage report, Transfer initiate). Read/list screens that
  // already branch on role === 'owner' to see every shop keep using
  // `shopId`/`profile.shopId` unchanged.
  const writeShopId = role === 'owner' ? ownerActiveShopId : shopId;

  // POSView/Receipt use `cashierEmail` to print who rang up a sale up —
  // named for what it held before accounts had real emails. Manager/
  // Cashier accounts now sign in with a Username backed by a synthetic,
  // never-shown email (see src/lib/credentials.js), so their Firestore
  // profile's fullName is what actually belongs on a printed receipt;
  // user.email only remains as a fallback for the original Owner account.
  function defaultView() {
    if (role === 'owner') return <OwnerDashboard userId={user.uid} />;
    if (can(role, 'viewReports')) return <ShopReports shopId={shopId} shopName={shopName} />;
    // Cashier has neither viewReports nor a shop-reports screen of their
    // own — land them on POS instead of a screen they can't see.
    return <POSView role={role} shopId={writeShopId} cashierId={user.uid} cashierEmail={profile.fullName || user.email} />;
  }

  function OwnerShopPicker() {
    if (role !== 'owner') return null;
    return (
      <div className="owner-active-shop-picker">
        <label>
          Active shop:{' '}
          <select value={ownerActiveShopId || ''} onChange={(e) => setOwnerActiveShopId(e.target.value || null)}>
            <option value="">Select a shop…</option>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
    );
  }

  // Each case is gated on the exact same permission Sidebar.jsx uses to
  // decide whether to show that nav item (see NAV_ITEMS in Sidebar.jsx).
  // This defends against ANY stale/invalid `view` value reaching a screen
  // the current role isn't permitted to see — e.g. a Manager navigates to
  // 'catalog', logs out, and a Cashier logs in on the same tab: `view` is
  // still 'catalog', Sidebar correctly hides that nav item, but without
  // this guard renderView() would still match `case 'catalog'` and render
  // CatalogManager for the Cashier anyway.
  // Owner must pick an active shop before using a screen that WRITES a
  // shopId onto a document (POS checkout, Damage report, Transfer
  // initiate) — otherwise that write would silently use shopId: null.
  function requireOwnerShop(node) {
    if (role === 'owner' && !writeShopId) {
      return (
        <div className="owner-shop-required">
          Select an active shop above before using this screen.
        </div>
      );
    }
    return node;
  }

  function renderView() {
    switch (view) {
      case 'pos':
        return can(role, 'pos')
          ? requireOwnerShop(<POSView role={role} shopId={writeShopId} cashierId={user.uid} cashierEmail={profile.fullName || user.email} />)
          : defaultView();
      case 'inventory':
        return can(role, 'viewInventory') ? <InventoryList role={role} shopId={writeShopId} userId={user.uid} /> : defaultView();
      case 'catalog':
        return can(role, 'manageCategories') ? <CatalogManager /> : defaultView();
      case 'damage':
        return can(role, 'reportDamage')
          ? requireOwnerShop(<DamageReportsView role={role} shopId={writeShopId} userId={user.uid} />)
          : defaultView();
      case 'transfers':
        // Cashier can't initiate a transfer but can now receive/confirm
        // one (see permissions.js) — either permission gets them into
        // this screen, TransfersView itself hides the "Initiate" button
        // and only exposes what the role can actually do.
        return (can(role, 'initiateTransfer') || can(role, 'confirmTransfer'))
          ? requireOwnerShop(<TransfersView role={role} shopId={writeShopId} userId={user.uid} />)
          : defaultView();
      case 'sales':
        return can(role, 'viewOwnSales') || can(role, 'viewSalesReports')
          ? <SalesHistory role={role} shopId={shopId} userId={user.uid} />
          : defaultView();
      case 'shops':
        return can(role, 'manageShops') ? <ShopsView /> : defaultView();
      case 'users':
        return can(role, 'manageUsers') ? <UsersView currentUid={user.uid} /> : defaultView();
      case 'activityLog':
        return can(role, 'viewActivityLog') ? <OwnerActivityLog /> : defaultView();
      case 'restock':
        return (can(role, 'createRestockRequest') || can(role, 'reviewRestockRequest'))
          ? requireOwnerShop(<RestockView role={role} shopId={writeShopId} userId={user.uid} />)
          : defaultView();
      case 'overview':
      default:
        return defaultView();
    }
  }

  return (
    <div className="app-shell">
      <Topbar view={view} setView={setView} role={role} fullName={profile.fullName} onLogout={logout} />
      <main className="app-main">
        <OwnerShopPicker />
        {renderView()}
      </main>
    </div>
  );
}
