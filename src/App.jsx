import { useState } from 'react';
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

export default function App() {
  const { user, profile, role, loading, login, logout, resetPassword } = useAuth();
  const [view, setView] = useState('overview');
  const shops = useShops();

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

  function renderView() {
    switch (view) {
      case 'pos': return <POSView role={role} shopId={shopId} cashierId={user.uid} cashierEmail={user.email} />;
      case 'inventory': return <InventoryList role={role} shopId={shopId} />;
      case 'catalog': return <CatalogManager />;
      case 'damage': return <DamageReportsView role={role} shopId={shopId} userId={user.uid} />;
      case 'transfers': return <TransfersView role={role} shopId={shopId} userId={user.uid} />;
      case 'sales': return <SalesHistory role={role} shopId={shopId} userId={user.uid} />;
      case 'shops': return <ShopsView />;
      case 'users': return <UsersView />;
      case 'overview':
      default:
        return role === 'owner' ? <OwnerDashboard /> : <ShopReports shopId={shopId} shopName={shopName} />;
    }
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} role={role} fullName={profile.fullName} onLogout={logout} />
      <main className="app-main">{renderView()}</main>
    </div>
  );
}
