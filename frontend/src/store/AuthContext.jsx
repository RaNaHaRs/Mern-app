import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { authApi } from '../services/api';

const INACTIVITY_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours
const WARNING_BEFORE     = 5 * 60 * 1000;        // warn 5 min before logout

const AuthContext = createContext(null);

// ─── Granular Permission Modules ───────────────────────────────────────────
export const PERMISSION_MODULES = [
  {
    key: 'cases',
    label: 'Cases',
    icon: '📂',
    actions: ['view', 'create', 'edit', 'delete', 'advance_stage'],
  },
  {
    key: 'clients',
    label: 'Clients',
    icon: '👥',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    icon: '🔄',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'accounting',
    label: 'Accounting',
    icon: '💼',
    actions: ['view', 'create_invoice', 'create_quote', 'record_payment', 'create_expense'],
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: '📊',
    actions: ['view', 'export'],
  },
  {
    key: 'analytics',
    label: 'Analytics',
    icon: '📈',
    actions: ['view'],
  },
  {
    key: 'knowledge_base',
    label: 'Knowledge Base',
    icon: '📚',
    actions: ['view', 'create', 'delete'],
  },
  {
    key: 'recycle_bin',
    label: 'Recycle Bin',
    icon: '🗑️',
    actions: ['view', 'restore', 'permanent_delete'],
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: '⚙️',
    actions: [
      'view',
      'edit_company',
      'edit_numbers',
      'edit_users',
      'edit_roles',
      'edit_stages',
      'edit_symptoms',
      'edit_failure_types',
      'edit_brands',
      'edit_payment_methods',
      'edit_whatsapp',
      'edit_razorpay',
      'edit_gst',
    ],
  },
  {
    key: 'users',
    label: 'User Management',
    icon: '👤',
    actions: ['view', 'create', 'edit', 'deactivate'],
  },
  {
    key: 'webhooks',
    label: 'Webhooks',
    icon: '🔗',
    actions: ['view', 'edit'],
  },
];

export const STAFF_PERMISSION_MODULES = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊', actions: ['view'] },
  { key: 'tenants', label: 'Subscribers', icon: '👥', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'purchases', label: 'Purchases', icon: '💳', actions: ['view', 'export'] },
  { key: 'plans', label: 'Plans & Pricing', icon: '🧾', actions: ['view', 'edit'] },
  { key: 'coupons', label: 'Coupons', icon: '🎟️', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'invoices', label: 'Invoices', icon: '🧾', actions: ['view', 'export'] },
  { key: 'branding', label: 'Branding', icon: '🎨', actions: ['view', 'edit'] },
  { key: 'seo', label: 'SEO Settings', icon: '🔎', actions: ['view', 'edit'] },
  { key: 'homepage', label: 'Homepage', icon: '🏠', actions: ['view', 'edit'] },
  { key: 'accounts', label: 'SA Accounts', icon: '👤', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'activity_logs', label: 'Activity Logs', icon: '📝', actions: ['view', 'export'] },
  { key: 'platform', label: 'Platform', icon: '⚙️', actions: ['view', 'edit'] },
  { key: 'email_delivery', label: 'Email Deliverability', icon: '✉️', actions: ['view', 'edit'] },
  { key: 'staff', label: 'Staff', icon: '👥', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'roles', label: 'Roles', icon: '🔐', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'security', label: 'Security & Backup', icon: '🛡️', actions: ['view', 'edit'] },
  { key: 'settings', label: 'Settings', icon: '⚙️', actions: ['view', 'edit'] },
];

// Default full-access permissions (for admin role)
export function buildFullPermissions(modules = PERMISSION_MODULES) {
  const perms = {};
  modules.forEach(m => {
    perms[m.key] = {};
    m.actions.forEach(a => { perms[m.key][a] = true; });
  });
  return perms;
}

// Build empty permissions object (all false)
export function buildEmptyPermissions(modules = PERMISSION_MODULES) {
  const perms = {};
  modules.forEach(m => {
    perms[m.key] = {};
    m.actions.forEach(a => { perms[m.key][a] = false; });
  });
  return perms;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionWarning, setSessionWarning] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const intervalRef = useRef(null);

  const checkImpersonation = useCallback(() => {
    const overrideToken = sessionStorage.getItem('accessTokenOverride');
    if (!overrideToken) {
      setImpersonating(false);
      return;
    }
    try {
      const payload = JSON.parse(atob(overrideToken.split('.')[1]));
      setImpersonating(!!payload.impersonated_by);
    } catch {
      setImpersonating(false);
    }
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem('accessTokenOverride') || localStorage.getItem('accessToken');
    if (token) {
      authApi.me()
        .then(u => {
          setUser(u);
          checkImpersonation();
        })
        .catch(() => {
          localStorage.clear();
          sessionStorage.removeItem('accessTokenOverride');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [checkImpersonation]);

  const login = async (credentials) => {
    const data = await authApi.login(credentials);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser(data.user);
    return data.user;
  };

  // Set user from already-fetched login data (avoids double API call)
  const setLoggedIn = (userData) => {
    setUser(userData);
  };

  const logout = useCallback(async (reason) => {
    const refreshToken = localStorage.getItem('refreshToken');
    try { await authApi.logout(refreshToken); } catch {}
    localStorage.clear();
    sessionStorage.removeItem('accessTokenOverride');
    if (reason === 'inactivity') localStorage.setItem('logout_reason', 'inactivity');
    setUser(null);
    setSessionWarning(false);
    setImpersonating(false);
  }, []);

  const exitImpersonation = useCallback(() => {
    sessionStorage.removeItem('accessTokenOverride');
    setUser(null);
    setImpersonating(false);
    window.location.href = '/';
  }, []);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setSessionWarning(false);
  }, []);

  // ── Refresh User Data (used after subscription upgrades) ──────────────────
  const refreshUser = useCallback(async () => {
    try {
      const u = await authApi.me();
      setUser(u);
      return u;
    } catch (err) {
      console.error('Failed to refresh user data:', err.message);
    }
  }, []);

  // Make refreshUser available globally for payment modals
  useEffect(() => {
    window.__refreshUserData = refreshUser;
    return () => { delete window.__refreshUserData; };
  }, [refreshUser]);

  // ── Inactivity watcher ──────────────────────────────────────────
  useEffect(() => {
    if (!user) { clearInterval(intervalRef.current); return; }

    const onActivity = () => { lastActivityRef.current = Date.now(); setSessionWarning(false); };
    const events = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));

    intervalRef.current = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= INACTIVITY_TIMEOUT) {
        logout('inactivity');
      } else if (idle >= INACTIVITY_TIMEOUT - WARNING_BEFORE) {
        setSessionWarning(true);
      }
    }, 30_000); // check every 30s

    return () => {
      events.forEach(e => window.removeEventListener(e, onActivity));
      clearInterval(intervalRef.current);
    };
  }, [user, logout]);

  // ─── Role Hierarchy Check (legacy, for broad checks) ──────────────
  const canAccess = (minRole) => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    if (user.role === 'admin') return minRole !== 'super_admin';
    if (minRole === 'super_admin') return false;
    if (minRole === 'admin') return user.role === 'admin';

    // Use numeric hierarchy
    let hierarchy = { admin: 99, senior_engineer: 3, junior_engineer: 2, staff: 1, front_desk: 1, client: 0 };
    try {
      const customRoles = JSON.parse(localStorage.getItem('crm_roles') || '[]');
      if (customRoles.length > 0) {
        hierarchy = { admin: 99, super_admin: 999 };
        customRoles.forEach(r => { hierarchy[r.key || r.id] = r.level || 1; });
      }
    } catch {}
    return (hierarchy[user?.role] || 0) >= (hierarchy[minRole] || 0);
  };

  // ─── Granular Permission Check ─────────────────────────────────────
  // hasPermission('cases', 'view') → boolean
  const hasPermission = (module, action) => {
    if (!user) return false;
    // super_admin always has full access — no restrictions ever
    if (user.role === 'super_admin') return true;

    // admin: full access UNLESS super admin has set a custom plan-based override
    // A real override has module keys; { access_level } is just an SA staff role marker
    if (user.role === 'admin') {
      const adminPerms = user.permissions;
      const hasOverride = adminPerms && typeof adminPerms === 'object'
        && !adminPerms.access_level && Object.keys(adminPerms).length > 0;
      if (!hasOverride) return true; // no override → full access
      return !!(adminPerms[module] && adminPerms[module][action]);
    }

    // For staff roles: use permissions object resolved by backend at login
    const userPerms = (user.permissions && typeof user.permissions === 'object' && Object.keys(user.permissions).length > 0)
      ? user.permissions
      : (() => { try { return JSON.parse(localStorage.getItem(`user_perms_${user.id}`) || 'null'); } catch { return null; } })();

    if (!userPerms || typeof userPerms !== 'object' || Object.keys(userPerms).length === 0) {
      return false;
    }
    return !!(userPerms[module] && userPerms[module][action]);
  };

  // ─── Role Flags ────────────────────────────────────────────────────────
  // isSuperAdmin — platform-level owner (RecoverLab team)
  const isSuperAdmin = user?.role === 'super_admin';
  // isOwner — per-tenant account owner (the admin who manages this lab's subscription)
  const isOwner = user?.role === 'admin';
  // isAdmin — isOwner OR isSuperAdmin (broad admin gate)
  const isAdmin = isOwner || isSuperAdmin;
  // isPlatformStaff — platform-scoped staff (no tenant), mirrors backend isPlatformStaff logic
  const isPlatformStaff = user && user.role !== 'super_admin' && user.role !== 'admin' && !user.tenantId;
  const tenantId = user?.tenantId || user?.tenant_id || user?.id;

  return (
    <AuthContext.Provider value={{
      user, setUser, loading, login, logout, setLoggedIn, refreshUser,
      canAccess, hasPermission,
      isSuperAdmin, isOwner, isAdmin, tenantId,
      isPlatformStaff,
      sessionWarning, resetActivity,
      impersonating, exitImpersonation,
      PERMISSION_MODULES, STAFF_PERMISSION_MODULES, buildFullPermissions, buildEmptyPermissions,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
