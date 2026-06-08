import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/AuthContext';
import { ThemeProvider, FontSizeProvider, useTheme, useFontSize } from './store/ThemeContext';
import FloatingChat from './components/FloatingChat';
import SuperAdminFloatingChat from './components/SuperAdminFloatingChat';

export { useTheme, useFontSize };

// Lazy-loaded pages
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
const ResetPasswordPage = React.lazy(() => import('./pages/ResetPasswordPage'));
const AccountingPage   = React.lazy(() => import('./pages/AccountingPage'));
const SolutionsPage    = React.lazy(() => import('./pages/SolutionsPage'));
const ReportsPage      = React.lazy(() => import('./pages/ReportsPage'));
const SubscriptionPage = React.lazy(() => import('./pages/SubscriptionPage'));
const RecycleBinPage   = React.lazy(() => import('./pages/RecycleBinPage'));
const WebhooksPage     = React.lazy(() => import('./pages/WebhooksPage'));
const ClientPortalPage = React.lazy(() => import('./pages/ClientPortalPage'));
const SuperAdminPage   = React.lazy(() => import('./pages/SuperAdminPage'));
const UserManagementPage = React.lazy(() => import('./pages/UserManagementPage'));
const SecurityBackupPage = React.lazy(() => import('./pages/SecurityBackupPage'));
const TeamChatPage     = React.lazy(() => import('./pages/TeamChatPage'));
const PublicHomePage   = React.lazy(() => import('./pages/PublicHomePage'));
const SignupPage       = React.lazy(() => import('./pages/SignupPage'));
const MarketingPage    = React.lazy(() => import('./pages/MarketingPage'));

// ── Icons (inline SVG, zero dependencies) ─────────────────────
const Icons = {
  dashboard: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>,
  cases: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
  clients: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  inventory: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  donors: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  knowledge: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>,
  accounting: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  reports: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  analytics: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  marketing: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  subscription: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  security: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  team: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  recycle: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
  webhooks: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  settings: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  chat: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  portal: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  superAdmin: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  logout: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  moon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
  sun: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
};

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-logo">RL</div>
      <div className="spinner spinner-lg" />
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────
function Sidebar({ open, onClose }) {
  const { user, logout, isSuperAdmin, isPlatformStaff, isOwner, isAdmin, hasPermission } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const hasSuperAdminAccess = isSuperAdmin || isPlatformStaff;

  const opsItems = hasSuperAdminAccess ? [] : [
    { icon: Icons.dashboard, label: 'Dashboard', to: '/' },
    ...(hasPermission('cases', 'view') || isAdmin ? [{ icon: Icons.cases, label: 'Cases', to: '/cases' }] : []),
    ...(hasPermission('clients', 'view') || isAdmin ? [{ icon: Icons.clients, label: 'Clients', to: '/clients' }] : []),
  ];
  const intelItems = hasSuperAdminAccess ? [] : [
    ...(hasPermission('inventory', 'view') || isAdmin ? [{ icon: Icons.inventory, label: 'Inventory', to: '/inventory' }] : []),
    ...(hasPermission('inventory', 'view') || isAdmin ? [{ icon: Icons.donors, label: 'Donor Drive', to: '/donors' }] : []),
    ...(hasPermission('knowledge_base', 'view') || isAdmin ? [{ icon: Icons.knowledge, label: 'Knowledge Base', to: '/solutions' }] : []),
  ];
  const financeItems = hasSuperAdminAccess ? [] : [
    ...(hasPermission('accounting', 'view') || isAdmin ? [{ icon: Icons.accounting, label: 'Accounting', to: '/accounting' }] : []),
    ...(hasPermission('reports', 'view') || isAdmin ? [{ icon: Icons.reports, label: 'Reports', to: '/reports' }] : []),
    ...(hasPermission('analytics', 'view') || isAdmin ? [{ icon: Icons.analytics, label: 'Analytics', to: '/analytics' }] : []),
    ...(isAdmin ? [{ icon: Icons.marketing, label: 'Marketing', to: '/marketing' }] : []),
  ];
  const systemItems = hasSuperAdminAccess
    ? []
    : [
        ...(isOwner ? [{ icon: Icons.subscription, label: 'Subscription', to: '/subscription' }] : []),
        ...(isAdmin ? [{ icon: Icons.security, label: 'Security & Backup', to: '/security' }] : []),
        ...(isAdmin ? [{ icon: Icons.team, label: 'Team', to: '/users' }] : []),
        ...(hasPermission('recycle_bin', 'view') || isAdmin ? [{ icon: Icons.recycle, label: 'Recycle Bin', to: '/recycle-bin' }] : []),
        ...(hasPermission('webhooks', 'view') || isAdmin ? [{ icon: Icons.webhooks, label: 'Webhooks', to: '/webhooks' }] : []),
        ...(hasPermission('settings', 'view') || isAdmin ? [{ icon: Icons.settings, label: 'Settings', to: '/settings' }] : []),
        ...(isAdmin ? [{ icon: Icons.portal, label: 'Client Portal', to: '/client-portal' }] : []),
      ];

  const nav = [
    ...(hasSuperAdminAccess ? [
      { group: 'Overview', items: [
        ...(hasPermission('dashboard', 'view') ? [{ icon: Icons.superAdmin, label: 'Dashboard', to: '/super-admin', end: true, tab: 'dashboard' }] : []),
        ...(hasPermission('tenants', 'view') ? [{ icon: Icons.clients, label: 'Subscribers', to: '/super-admin', tab: 'tenants' }] : []),
        ...(hasPermission('purchases', 'view') ? [{ icon: Icons.accounting, label: 'Purchases', to: '/super-admin', tab: 'purchases' }] : []),
      ]},
      { group: 'Billing', items: [
        ...(hasPermission('plans', 'view') ? [{ icon: Icons.subscription, label: 'Plans & Pricing', to: '/super-admin', tab: 'plans' }] : []),
        ...(hasPermission('razorpay', 'view') ? [{ icon: Icons.accounting, label: 'Razorpay', to: '/super-admin', tab: 'razorpay' }] : []),
        ...(hasPermission('coupons', 'view') ? [{ icon: Icons.webhooks, label: 'Coupons', to: '/super-admin', tab: 'coupons' }] : []),
        ...(hasPermission('invoices', 'view') ? [{ icon: Icons.reports, label: 'Invoices', to: '/super-admin', tab: 'invoices' }] : []),
      ]},
      { group: 'Platform', items: [
        ...(hasPermission('branding', 'view') ? [{ icon: Icons.settings, label: 'Branding', to: '/super-admin', tab: 'branding' }] : []),
        ...(hasPermission('seo', 'view') ? [{ icon: Icons.analytics, label: 'SEO', to: '/super-admin', tab: 'seo' }] : []),
        ...(hasPermission('homepage', 'view') ? [{ icon: Icons.marketing, label: 'Homepage', to: '/super-admin', tab: 'homepage' }] : []),
        ...(hasPermission('accounts', 'view') ? [{ icon: Icons.team, label: 'SA Accounts', to: '/super-admin', tab: 'accounts' }] : []),
        ...(hasPermission('activity_logs', 'view') ? [{ icon: Icons.reports, label: 'Activity Logs', to: '/super-admin', tab: 'logs' }] : []),
        ...(hasPermission('platform', 'view') ? [{ icon: Icons.settings, label: 'Platform', to: '/super-admin', tab: 'platform' }] : []),
        ...(hasPermission('email_delivery', 'view') ? [{ icon: Icons.webhooks, label: 'Email Deliverability', to: '/super-admin', tab: 'email_delivery' }] : []),
      ]},
      { group: 'Access', items: [
        ...(hasPermission('staff', 'view') ? [{ icon: Icons.team, label: 'Users', to: '/users' }] : []),
        ...(hasPermission('security', 'view') ? [{ icon: Icons.security, label: 'Security & Backup', to: '/security' }] : []),
        ...(hasPermission('settings', 'view') ? [{ icon: Icons.settings, label: 'Settings', to: '/settings' }] : []),
      ]},
    ] : []),
    ...(opsItems.length ? [{ group: 'Operations', items: opsItems }] : []),
    ...(intelItems.length ? [{ group: 'Intelligence', items: intelItems }] : []),
    ...(financeItems.length ? [{ group: 'Finance', items: financeItems }] : []),
    ...(systemItems.length ? [{ group: 'System', items: systemItems }] : []),
  ];

  return (
    <>
      <div className={`sidebar-overlay${open ? ' visible' : ''}`} onClick={onClose} />
      <nav className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-mark">
            <div className="logo-icon">RL</div>
            <div className="logo-text">
              <span className="logo-title">RecoverLab</span>
              <span className="logo-subtitle">CRM Platform</span>
            </div>
          </div>
        </div>

        <div className="sidebar-nav">
          {nav.map((group, i) => (
            <div key={`${i}-${group.group}`} className="nav-section">
              <div className="nav-section-label">{group.group}</div>
              {group.items.map((item, j) => (
                <NavLink
                  key={`${item.to}-${j}`}
                  to={item.to}
                  end={item.to === '/' || !!item.end}
                  className={({ isActive: navActive }) => {
                    const active = item.to === '/super-admin' ? navActive && item.tab === (sessionStorage.getItem('sa_active_tab') || 'dashboard') : navActive;
                    return `nav-item${active ? ' active' : ''}`;
                  }}
                  onClick={() => { if (item.tab) sessionStorage.setItem('sa_active_tab', item.tab); onClose(); }}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="user-card" onClick={() => { navigate('/settings'); onClose(); }}>
            <div className="user-avatar" style={{ overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {user?.avatar
                ? <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                : user?.fullName?.split(' ')?.map(n => n?.[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || 'U'}
            </div>
            <div className="user-info">
              <div className="user-name">{user?.fullName || 'User'}</div>
              <div className="user-role">{user?.role?.replace(/_/g, ' ') || ''}</div>
            </div>
          </div>
          <button onClick={handleLogout} title="Sign out">
            {Icons.logout} Logout
          </button>
        </div>
      </nav>
    </>
  );
}

// ── Header ─────────────────────────────────────────────────────
function Header() {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { fontSize, setFontSize } = useFontSize();
  const { logout, sessionWarning, resetActivity } = useAuth();
  const navigate = useNavigate();

  const titles = {
    '/': 'Dashboard', '/cases': 'Case Management', '/clients': 'Client Management',
    '/inventory': 'Inventory & Donors', '/donors': 'HDD Donor Drive', '/accounting': 'Accounting',
    '/solutions': 'Knowledge Base', '/reports': 'Reports & Export', '/analytics': 'Analytics',
    '/subscription': 'Subscription & Plans', '/recycle-bin': 'Recycle Bin', '/settings': 'Settings',
    '/security': 'Security & Backup', '/super-admin': 'Platform Command Center', '/users': 'Team Members',
    '/chat': 'Team Chat', '/marketing': 'Marketing', '/webhooks': 'Webhooks',
  };
  const match = Object.keys(titles).sort((a, b) => b.length - a.length)
    .find(k => location.pathname.startsWith(k) && (location.pathname.length === k.length || location.pathname[k.length] === '/'));
  const title = match ? titles[match] : 'RecoverLab CRM';

  const handleLogout = async () => { await logout(); navigate('/login'); };

  return (
    <>
      {sessionWarning && (
        <div className="impersonation-banner" style={{ background: 'rgba(245,158,11,0.95)', height: 'auto', padding: '10px 20px', zIndex: 9999 }}>
          <span>Your session will expire in ~5 minutes due to inactivity.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={resetActivity} className="btn btn-ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', padding: '3px 12px' }}>
              Stay Logged In
            </button>
            <button onClick={handleLogout} className="btn btn-danger" style={{ fontSize: '0.75rem', padding: '3px 12px' }}>
              Logout Now
            </button>
          </div>
        </div>
      )}
      <header className="app-header">
        <h1 className="page-title">{title}</h1>
        <div className="header-actions">
          <div className="font-size-toggle">
            {[{ v: 'small', label: 'A⁻' }, { v: 'default', label: 'A' }, { v: 'large', label: 'A⁺' }].map(f => (
              <button key={f.v} className={`font-size-btn ${fontSize === f.v ? 'active' : ''}`}
                onClick={() => setFontSize(f.v)} title={f.v}>{f.label}</button>
            ))}
          </div>
          <button className="theme-toggle-btn" onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? Icons.moon : Icons.sun}
          </button>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </header>
    </>
  );
}

// ── Route Guards ───────────────────────────────────────────────
function PermissionRoute({ module, action = 'view', children }) {
  const { hasPermission, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!hasPermission(module, action)) return <Navigate to="/" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

function SuperAdminRoute({ children }) {
  const { user, loading, isSuperAdmin, isPlatformStaff } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin && !isPlatformStaff) return <Navigate to="/" replace />;
  return children;
}

function ProtectedRoute({ children }) {
  const { user, loading, isSuperAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (isSuperAdmin && location.pathname === '/') return <Navigate to="/super-admin" replace />;
  return children;
}

// ── Main App Layout ────────────────────────────────────────────
function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isSuperAdmin, impersonating, exitImpersonation } = useAuth();
  const hasOverride = !!sessionStorage.getItem('accessTokenOverride');
  const showImpersonationBanner = impersonating || hasOverride;
  const isSuperAdminUser = isSuperAdmin && !showImpersonationBanner;

  return (
    <div className="app-layout" style={showImpersonationBanner ? { paddingTop: 36 } : {}}>
      {showImpersonationBanner && (
        <div className="impersonation-banner" style={{ height: 36 }}>
          <span>Viewing as subscriber account — Super Admin Impersonation Mode</span>
          <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>Changes made will persist</span>
          <button onClick={exitImpersonation}>Return to Super Admin</button>
        </div>
      )}
      <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <Header />
        <div className="page-content">
          <React.Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/cases" element={<PermissionRoute module="cases"><CasesPage /></PermissionRoute>} />
              <Route path="/cases/:id" element={<PermissionRoute module="cases"><CaseDetail /></PermissionRoute>} />
              <Route path="/clients" element={<PermissionRoute module="clients"><ClientsPage /></PermissionRoute>} />
              <Route path="/clients/:id" element={<PermissionRoute module="clients"><ClientDetail /></PermissionRoute>} />
              <Route path="/inventory" element={<PermissionRoute module="inventory"><InventoryPage /></PermissionRoute>} />
              <Route path="/inventory/:id" element={<PermissionRoute module="inventory"><InventoryDetail /></PermissionRoute>} />
              <Route path="/donors" element={<PermissionRoute module="inventory"><DonorsPage /></PermissionRoute>} />
              <Route path="/transferred-items" element={<PermissionRoute module="inventory"><TransferredItemsPage /></PermissionRoute>} />
              <Route path="/accounting" element={<PermissionRoute module="accounting"><AccountingPage /></PermissionRoute>} />
              <Route path="/solutions" element={<PermissionRoute module="knowledge_base"><SolutionsPage /></PermissionRoute>} />
              <Route path="/reports" element={<PermissionRoute module="reports"><ReportsPage /></PermissionRoute>} />
              <Route path="/analytics" element={<PermissionRoute module="analytics"><AnalyticsPage /></PermissionRoute>} />
              <Route path="/subscription" element={<AdminRoute><SubscriptionPage /></AdminRoute>} />
              <Route path="/recycle-bin" element={<PermissionRoute module="recycle_bin"><RecycleBinPage /></PermissionRoute>} />
              <Route path="/security" element={<AdminRoute><SecurityBackupPage /></AdminRoute>} />
              <Route path="/chat" element={<TeamChatPage />} />
              <Route path="/webhooks" element={<PermissionRoute module="webhooks"><WebhooksPage /></PermissionRoute>} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/super-admin" element={<SuperAdminRoute><SuperAdminPage /></SuperAdminRoute>} />
              <Route path="/marketing" element={<AdminRoute><MarketingPage /></AdminRoute>} />
              <Route path="/users" element={<AdminRoute><UserManagementPage /></AdminRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </React.Suspense>
        </div>
      </div>
      {!isSuperAdminUser && <FloatingChat />}
      {isSuperAdminUser && <SuperAdminFloatingChat />}
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <FontSizeProvider>
        <AuthProvider>
          <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
            <React.Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/home" element={<PublicHomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/client-portal" element={<ClientPortalPage />} />
                <Route path="/*" element={<ProtectedRoute><AppLayout /></ProtectedRoute>} />
              </Routes>
            </React.Suspense>
          </BrowserRouter>
        </AuthProvider>
      </FontSizeProvider>
    </ThemeProvider>
  );
}
