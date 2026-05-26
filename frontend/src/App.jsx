import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/AuthContext';
import { ThemeProvider, FontSizeProvider, useTheme, useFontSize } from './store/ThemeContext';
import FloatingChat from './components/FloatingChat';
import SuperAdminFloatingChat from './components/SuperAdminFloatingChat';


// Re-export so any existing import { useTheme, useFontSize } from '../App' still works
export { useTheme, useFontSize };

// Pages (lazy-loaded)
const LoginPage        = React.lazy(() => import('./pages/LoginPage'));
const Dashboard        = React.lazy(() => import('./pages/Dashboard'));
const CasesPage        = React.lazy(() => import('./pages/CasesPage'));
const CaseDetail       = React.lazy(() => import('./pages/CaseDetail'));
const ClientsPage      = React.lazy(() => import('./pages/ClientsPage'));
const ClientDetail     = React.lazy(() => import('./pages/ClientDetail'));
const InventoryPage    = React.lazy(() => import('./pages/InventoryPage'));
const InventoryDetail  = React.lazy(() => import('./pages/InventoryDetail'));
const DonorsPage       = React.lazy(() => import('./pages/DonorsPage'));
const TransferredItemsPage = React.lazy(() => import('./pages/TransferredItemsPage'));
const AnalyticsPage    = React.lazy(() => import('./pages/AnalyticsPage'));
const SettingsPage     = React.lazy(() => import('./pages/SettingsPage'));
const AccountingPage   = React.lazy(() => import('./pages/AccountingPage'));
const SolutionsPage    = React.lazy(() => import('./pages/SolutionsPage'));
const ReportsPage      = React.lazy(() => import('./pages/ReportsPage'));
const SubscriptionPage = React.lazy(() => import('./pages/SubscriptionPage'));
const RecycleBinPage   = React.lazy(() => import('./pages/RecycleBinPage'));
const WebhooksPage     = React.lazy(() => import('./pages/WebhooksPage'));
const ClientPortalPage   = React.lazy(() => import('./pages/ClientPortalPage'));
const SuperAdminPage     = React.lazy(() => import('./pages/SuperAdminPage'));
const UserManagementPage = React.lazy(() => import('./pages/UserManagementPage'));
const SecurityBackupPage = React.lazy(() => import('./pages/SecurityBackupPage'));
const TeamChatPage       = React.lazy(() => import('./pages/TeamChatPage'));
const PublicHomePage     = React.lazy(() => import('./pages/PublicHomePage'));
const SignupPage          = React.lazy(() => import('./pages/SignupPage'));
const MarketingPage       = React.lazy(() => import('./pages/MarketingPage'));
// StorageModelsPage removed per user request

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-logo">💾</div>
      <div className="spinner" />
    </div>
  );
}

function Sidebar({ open, onClose }) {
  const { user, logout, canAccess, hasPermission, isSuperAdmin, isOwner, isAdmin } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const handleLogout = async () => { await logout(); navigate('/login'); };

  // Build nav with permission guards
  // Super Admin only sees their own console — no tenant-level Operations or Intelligence
  const opsItems = isSuperAdmin ? [] : [
    { icon: '⬡', label: 'Dashboard', to: '/' },
    ...(hasPermission('cases', 'view') || isAdmin ? [{ icon: '📂', label: 'Cases', to: '/cases' }] : []),
    ...(hasPermission('clients', 'view') || isAdmin ? [{ icon: '👥', label: 'Clients', to: '/clients' }] : []),
  ];
  const intelItems = isSuperAdmin ? [] : [
    ...(hasPermission('inventory', 'view') || isAdmin ? [{ icon: '🔄', label: 'Inventory', to: '/inventory' }] : []),
    ...(hasPermission('inventory', 'view') || isAdmin ? [{ icon: '💿', label: 'Donor Drive', to: '/donors' }] : []),
    ...(hasPermission('inventory', 'view') || isAdmin ? [{ icon: '📤', label: 'Transferred Items', to: '/transferred-items' }] : []),
    ...(hasPermission('knowledge_base', 'view') || isAdmin ? [{ icon: '📚', label: 'Knowledge Base', to: '/solutions' }] : []),
    ...(isAdmin ? [{ icon: '📣', label: 'Marketing', to: '/marketing' }] : []),
  ];
  const financeItems = isSuperAdmin ? [] : [
    ...(hasPermission('accounting', 'view') || isAdmin ? [{ icon: '💼', label: 'Accounting', to: '/accounting' }] : []),
    ...(hasPermission('reports', 'view') || isAdmin ? [{ icon: '📊', label: 'Reports', to: '/reports' }] : []),
    ...(hasPermission('analytics', 'view') || isAdmin ? [{ icon: '📈', label: 'Analytics', to: '/analytics' }] : []),
  ];
  const systemItems = isSuperAdmin
    // Super Admin system items — platform-level only
    ? [
        { icon: '🛡️', label: 'Security & Backup', to: '/security' },
        { icon: '⚙️', label: 'Settings', to: '/settings' },
      ]
    // Regular user system items — all items now properly permission-gated
    : [
        ...(isOwner ? [{ icon: '💎', label: 'Subscription', to: '/subscription' }] : []),
        ...(isAdmin ? [{ icon: '🛡️', label: 'Security & Backup', to: '/security' }] : []),
        { icon: '💬', label: 'Team Chat', to: '/chat' },
        ...(hasPermission('recycle_bin', 'view') || isAdmin ? [{ icon: '🗑️', label: 'Recycle Bin', to: '/recycle-bin' }] : []),
        ...(hasPermission('webhooks', 'view') || isAdmin ? [{ icon: '🔗', label: 'Webhooks', to: '/webhooks' }] : []),
        ...(hasPermission('settings', 'view') || isAdmin ? [{ icon: '⚙️', label: 'Settings', to: '/settings' }] : []),
        ...(isAdmin ? [{ icon: '📋', label: 'Client Portal', to: '/client-portal', external: true }] : []),
      ];

  const nav = [
    ...(isSuperAdmin ? [
      { group: 'Overview', items: [
        { icon: '⬡', label: 'Dashboard',      to: '/super-admin', end: true, saTab: 'dashboard' },
        { icon: '🏢', label: 'Subscribers',    to: '/super-admin', saTab: 'tenants' },
        { icon: '💳', label: 'Purchases',      to: '/super-admin', saTab: 'purchases' },
      ]},
      { group: 'Billing', items: [
        { icon: '💎', label: 'Plans & Pricing', to: '/super-admin', saTab: 'plans' },
        { icon: '💳', label: 'Razorpay',        to: '/super-admin', saTab: 'razorpay' },
        { icon: '🏷️', label: 'Coupons',        to: '/super-admin', saTab: 'coupons' },
        { icon: '🧾', label: 'Invoices',        to: '/super-admin', saTab: 'invoices' },
      ]},
      { group: 'Platform', items: [
        { icon: '🎨', label: 'Branding',           to: '/super-admin', saTab: 'branding' },
        { icon: '🔍', label: 'SEO',                to: '/super-admin', saTab: 'seo' },
        { icon: '🏠', label: 'Homepage',           to: '/super-admin', saTab: 'homepage' },
        { icon: '👤', label: 'SA Accounts',        to: '/super-admin', saTab: 'accounts' },
        { icon: '📋', label: 'Activity Logs',      to: '/super-admin', saTab: 'logs' },
        { icon: '⚙️', label: 'Platform',           to: '/super-admin', saTab: 'platform' },
        { icon: '📬', label: 'Email Deliverability', to: '/super-admin', saTab: 'email_delivery' },
      ]},
      { group: 'Access', items: [
        { icon: '👤', label: 'Users & Roles', to: '/users' },
        { icon: '💬', label: 'Team Chat', to: '/chat' },
        { icon: '🛡️', label: 'Security & Backup', to: '/security' },
        { icon: '⚙️', label: 'Settings',           to: '/settings' },
      ]},
    ] : []),
    ...(opsItems.length ? [{ group: 'Operations', items: opsItems }] : []),
    ...(intelItems.length ? [{ group: 'Intelligence', items: intelItems }] : []),
    ...(financeItems.length ? [{ group: 'Finance', items: financeItems }] : []),
    ...(!isSuperAdmin && systemItems.length ? [{ group: 'System', items: systemItems }] : []),
  ];

  // SA tab state — lifted into sidebar so clicking sidebar nav changes SA page tab
  const [saActiveTab, setSaActiveTab] = React.useState(() => sessionStorage.getItem('sa_active_tab') || 'dashboard');
  const setSaTab = (tab) => { setSaActiveTab(tab); sessionStorage.setItem('sa_active_tab', tab); };

  return (
    <>
      <div className={`sidebar-overlay${open ? ' visible' : ''}`} onClick={onClose} />
      <nav className={`sidebar${open ? ' open' : ''}`} data-theme-sidebar={theme}>
        <div className="sidebar-logo">
          <div className="logo-mark">
            <div className="logo-icon">💾</div>
            <div className="logo-text">
              <span className="logo-title">RecoverLab</span>
              <span className="logo-subtitle">CRM Platform</span>
            </div>
          </div>
        </div>

        <div className="sidebar-nav">
          {nav.map((group, _i) => (
            <div key={`${_i}-${group.group}`} className="nav-section">
              <div className="nav-section-label">{group.group}</div>
              {group.items.map(item => (
                item.saTab ? (
                  <button
                    key={item.saTab}
                    className={`nav-item${location.pathname === '/super-admin' && saActiveTab === item.saTab ? ' active' : ''}`}
                    onClick={() => { setSaTab(item.saTab); navigate('/super-admin'); onClose(); }}
                    style={{ width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    {item.label}
                  </button>
                ) : (
                  <NavLink
                    key={item.to + item.label}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                    onClick={onClose}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    {item.label}
                  </NavLink>
                )
              ))}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="user-card" onClick={() => { navigate('/settings'); onClose(); }}>
            <div className="user-avatar" style={{ overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {user?.avatar
                ? <img src={user.avatar} alt="avatar" style={{ width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%' }} />
                : user?.fullName?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
            </div>
            <div className="user-info">
              <div className="user-name">{user?.fullName}</div>
              <div className="user-role">{user?.role?.replace(/_/g,' ')}</div>
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); handleLogout(); }}
            style={{
              width:'100%', marginTop:6, padding:'8px 0', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'var(--radius-md)',
              color:'#ef4444', cursor:'pointer', fontSize:'0.78rem', fontWeight:700, transition:'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,0.18)'; }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(239,68,68,0.08)'; }}
          >
            🚪 Logout
          </button>
        </div>
      </nav>
    </>
  );
}

function Header() {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { fontSize, setFontSize } = useFontSize();
  const { logout, sessionWarning, resetActivity } = useAuth();
  const navigate = useNavigate();
  const titles = {
    '/': 'Dashboard', '/cases': 'Case Management', '/clients': 'Client Management',
    '/inventory': 'Inventory & Donors', '/donors': 'HDD Donor Drive Matching', '/accounting': 'Accounting', '/solutions': 'Knowledge Base',
    '/reports': 'Reports & Export', '/analytics': 'Analytics', '/subscription': 'Subscription & Plans',
    '/recycle-bin': 'Recycle Bin', '/settings': 'Settings', '/security': 'Security & Backup',
    '/super-admin': 'Platform Command Center', '/users': 'Users & Roles', '/chat': 'Team Chat',
  };
  const match = Object.keys(titles).sort((a,b) => b.length - a.length)
    .find(k => location.pathname.startsWith(k) && (location.pathname.length === k.length || location.pathname[k.length] === '/'));
  const title = match ? titles[match] : 'RecoverLab CRM';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      {/* ── Session expiry warning banner ── */}
      {sessionWarning && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: 'rgba(245,158,11,0.95)', color: '#fff',
          padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '0.82rem', fontWeight: 600, boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        }}>
          <span>⚠️ Your session will expire in ~5 minutes due to inactivity.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={resetActivity} style={{ background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.5)', color: '#fff', padding: '4px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }}>
              Stay Logged In
            </button>
            <button onClick={handleLogout} style={{ background: 'rgba(239,68,68,0.8)', border: 'none', color: '#fff', padding: '4px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }}>
              Logout Now
            </button>
          </div>
        </div>
      )}
      <header className="app-header" style={sessionWarning ? { paddingTop: 52 } : {}}>
        <h1 className="page-title">{title}</h1>
        <div className="header-actions">
          {/* Font size toggle */}
          <div className="font-size-toggle" title="Font size">
            {[{ v:'small', label:'A⁻', size:'0.72rem' }, { v:'default', label:'A', size:'0.82rem' }, { v:'large', label:'A⁺', size:'0.95rem' }].map(f => (
              <button key={f.v} className={`font-size-btn ${fontSize === f.v ? 'active' : ''}`}
                style={{ fontSize: f.size }} onClick={() => setFontSize(f.v)} title={f.v}>
                {f.label}
              </button>
            ))}
          </div>
          {/* Theme toggle */}
          <button onClick={toggleTheme} title={`Switch to ${theme==='dark'?'light':'dark'} mode`} style={{
            width:36,height:36,borderRadius:'var(--radius-full)',border:'1px solid var(--border-default)',
            background:'var(--bg-elevated)',color:'var(--text-secondary)',cursor:'pointer',fontSize:'1rem',
            display:'flex',alignItems:'center',justifyContent:'center',transition:'all var(--transition-fast)',
          }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent-primary)';e.currentTarget.style.color='var(--accent-primary)';}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-default)';e.currentTarget.style.color='var(--text-secondary)';}}
          >
            {theme==='dark'?'☀️':'🌙'}
          </button>
          <div style={{fontSize:'0.72rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>
            {new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
          </div>
        </div>
      </header>
    </>
  );
}

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const impersonating = sessionStorage.getItem('impersonating_as');
  const { isSuperAdmin } = useAuth();

  const isSuperAdminUser = isSuperAdmin && !impersonating;

  return (
    <div className={`app-layout ${isSuperAdminUser ? 'super-admin-layout' : 'saas-app'}`} style={impersonating ? { paddingTop: 36 } : {}}>
      {impersonating && (
        <div className="impersonation-banner">
          <span>👁️ Viewing as <strong>{impersonating}</strong> — Super Admin Impersonation Mode</span>
          <button onClick={() => { sessionStorage.removeItem('impersonating_as'); window.location.reload(); }}
            style={{ background:'rgba(255,255,255,0.2)',border:'1px solid rgba(255,255,255,0.4)',color:'white',padding:'3px 12px',borderRadius:6,cursor:'pointer',fontSize:'0.75rem' }}>
            ✕ Exit
          </button>
        </div>
      )}
      <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)}>☰</button>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <Header />
        <div className="page-content">
          <React.Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/"                  element={<Dashboard />} />
              <Route path="/cases"             element={<PermissionRoute module="cases"><CasesPage /></PermissionRoute>} />
              <Route path="/cases/:id"         element={<PermissionRoute module="cases"><CaseDetail /></PermissionRoute>} />
              <Route path="/clients"           element={<PermissionRoute module="clients"><ClientsPage /></PermissionRoute>} />
              <Route path="/clients/:id"       element={<PermissionRoute module="clients"><ClientDetail /></PermissionRoute>} />
              <Route path="/inventory"         element={<PermissionRoute module="inventory"><InventoryPage /></PermissionRoute>} />
              <Route path="/inventory/:id"     element={<PermissionRoute module="inventory"><InventoryDetail /></PermissionRoute>} />
              <Route path="/donors"            element={<PermissionRoute module="inventory"><DonorsPage /></PermissionRoute>} />
              <Route path="/transferred-items" element={<PermissionRoute module="inventory"><TransferredItemsPage /></PermissionRoute>} />
              <Route path="/accounting"        element={<PermissionRoute module="accounting"><AccountingPage /></PermissionRoute>} />
              <Route path="/solutions"         element={<PermissionRoute module="knowledge_base"><SolutionsPage /></PermissionRoute>} />
              <Route path="/reports"           element={<PermissionRoute module="reports"><ReportsPage /></PermissionRoute>} />
              <Route path="/analytics"         element={<PermissionRoute module="analytics"><AnalyticsPage /></PermissionRoute>} />
              <Route path="/subscription"      element={<AdminRoute><SubscriptionPage /></AdminRoute>} />
              <Route path="/recycle-bin"       element={<PermissionRoute module="recycle_bin"><RecycleBinPage /></PermissionRoute>} />
              <Route path="/security"           element={<AdminRoute><SecurityBackupPage /></AdminRoute>} />
              <Route path="/chat"               element={<TeamChatPage />} />
              <Route path="/webhooks"          element={<PermissionRoute module="webhooks"><WebhooksPage /></PermissionRoute>} />
              <Route path="/settings"          element={<SettingsPage />} />
              <Route path="/super-admin"       element={<SuperAdminRoute><SuperAdminPage /></SuperAdminRoute>} />
              <Route path="/marketing"         element={<AdminRoute><MarketingPage /></AdminRoute>} />
              <Route path="/users"             element={<SuperAdminRoute><UserManagementPage /></SuperAdminRoute>} />
              <Route path="*"                  element={<Navigate to="/" replace />} />
            </Routes>
          </React.Suspense>
        </div>
      </div>
      {!isSuperAdminUser && <FloatingChat />}
      {isSuperAdminUser && <SuperAdminFloatingChat />}
    </div>
  );
}

function PermissionRoute({ module, action = 'view', children }) {
  const { hasPermission, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!hasPermission(module, action)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function AdminRoute({ children }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

function SuperAdminRoute({ children }) {
  const { user, loading, isSuperAdmin } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;
  return children;
}

function ProtectedRoute({ children }) {
  const { user, loading, isSuperAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  // Super admin trying to access non-super-admin routes → redirect to super admin console
  if (isSuperAdmin && location.pathname === '/') return <Navigate to="/super-admin" replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <FontSizeProvider>
        <AuthProvider>
          <BrowserRouter>
            <React.Suspense fallback={<LoadingScreen />}>
              <Routes>
                {/* Public routes - no auth needed */}
                <Route path="/home" element={<PublicHomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/client-portal" element={<ClientPortalPage />} />
                {/* Protected routes */}
                <Route path="/*" element={<ProtectedRoute><AppLayout /></ProtectedRoute>} />
              </Routes>
            </React.Suspense>
          </BrowserRouter>
        </AuthProvider>
      </FontSizeProvider>
    </ThemeProvider>
  );
}
