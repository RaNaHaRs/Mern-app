import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, PERMISSION_MODULES, buildFullPermissions, buildEmptyPermissions } from '../store/AuthContext';

const stripDecorativeIcon = (label = '') => String(label).replace(/^[\p{Extended_Pictographic}\uFE0F]+\s*/gu, '').trim();

const BASE_URL = '/api';
const getToken = () => localStorage.getItem('accessToken');

const usersApi = {
  list: () => fetch(`${BASE_URL}/users`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()),
  create: (body) => fetch(`${BASE_URL}/users`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  update: (id, body) => fetch(`${BASE_URL}/users/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  deactivate: (id) => fetch(`${BASE_URL}/users/${id}/deactivate`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()),
  roles: {
    list: () => fetch(`${BASE_URL}/settings/roles`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()),
    create: (body) => fetch(`${BASE_URL}/settings/roles`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
    update: (id, body) => fetch(`${BASE_URL}/settings/roles/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
    delete: (id) => fetch(`${BASE_URL}/settings/roles/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()),
  },
};

//  Permission Matrix Editor 
function PermissionMatrix({ permissions, onChange, readonly = false }) {
  const toggleAll = (module, val) => {
    const updated = { ...permissions };
    if (!updated[module]) updated[module] = {};
    PERMISSION_MODULES.find(m => m.key === module)?.actions.forEach(a => {
      updated[module][a] = val;
    });
    onChange(updated);
  };

  const toggleOne = (module, action, val) => {
    const updated = { ...permissions, [module]: { ...(permissions[module] || {}), [action]: val } };
    onChange(updated);
  };

  const isModuleAllOn = (module) => {
    const mod = PERMISSION_MODULES.find(m => m.key === module);
    return mod?.actions.every(a => permissions[module]?.[a]);
  };

  const formatAction = (a) => a.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {PERMISSION_MODULES.map(mod => (
        <div key={mod.key} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{mod.label}</span>
            </div>
            {!readonly && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => toggleAll(mod.key, true)} style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.12)', color: '#10b981', border: 'none', cursor: 'pointer' }}>All On</button>
                <button onClick={() => toggleAll(mod.key, false)} style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', cursor: 'pointer' }}>All Off</button>
              </div>
            )}
            {readonly && (
              <span style={{ fontSize: '0.65rem', color: isModuleAllOn(mod.key) ? '#10b981' : 'var(--text-muted)', fontWeight: 700 }}>
                {isModuleAllOn(mod.key) ? ' Full Access' : 'Partial'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px' }}>
            {mod.actions.map(action => {
              const active = !!(permissions[mod.key]?.[action]);
              return (
                <label key={action} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: readonly ? 'default' : 'pointer', opacity: readonly && !active ? 0.4 : 1 }}>
                  <input
                    type="checkbox"
                    checked={active}
                    disabled={readonly}
                    onChange={e => toggleOne(mod.key, action, e.target.checked)}
                    style={{ accentColor: 'var(--accent-primary)' }}
                  />
                  <span style={{ fontSize: '0.72rem', color: active ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', transition: 'color 0.15s' }}>
                    {formatAction(action)}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

//  Role Modal 
function RoleModal({ role, restrictedPerms, onClose, onDone }) {
  const isNew = !role?.id;
  const [form, setForm] = useState({
    name: role?.name || '',
    key: role?.key || '',
    description: role?.description || '',
    color: role?.color || '#6366f1',
    permissions: role?.permissions || buildEmptyPermissions(),
  });
  const [loading, setLoading] = useState(false);

  // Restrict permissions to what the admin has granted
  const applyRestrictions = (perms) => {
    if (!restrictedPerms) return perms;
    const restricted = { ...perms };
    PERMISSION_MODULES.forEach(mod => {
      mod.actions.forEach(action => {
        if (!restrictedPerms[mod.key]?.[action]) {
          if (restricted[mod.key]) restricted[mod.key][action] = false;
        }
      });
    });
    return restricted;
  };

  const handle = async () => {
    if (!form.name) return;
    setLoading(true);
    try {
      const payload = {
        ...form,
        key: form.key || form.name.toLowerCase().replace(/\s+/g, '_'),
        permissions: applyRestrictions(form.permissions),
      };
      let res;
      if (isNew) res = await usersApi.roles.create(payload);
      else res = await usersApi.roles.update(role.id, payload);
      if (res.error) throw new Error(res.error);
      onDone();
      onClose();
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" onClick={e => e.stopPropagation()} style={{ maxWidth: 780 }}>
        <div className="modal-header">
          <h3 className="modal-title">{isNew ? '+ Create New Role' : ` Edit Role — ${role.name}`}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20 }}>
          {/* Left — Role Meta */}
          <div>
            <div className="form-group">
              <label className="form-label required">Role Name</label>
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, key: e.target.value.toLowerCase().replace(/\s+/g, '_') }))} placeholder="e.g. Senior Engineer" />
            </div>
            <div className="form-group">
              <label className="form-label">Key (auto)</label>
              <input className="form-input font-mono" style={{ fontSize: '0.75rem' }} value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" style={{ minHeight: 70 }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What can this role do?" />
            </div>
            <div className="form-group">
              <label className="form-label">Badge Color</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {COLORS.map(c => (
                  <div key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', border: form.color === c ? '3px solid white' : '2px solid transparent', boxShadow: form.color === c ? `0 0 0 2px ${c}` : 'none', transition: 'all 0.1s' }} />
                ))}
              </div>
            </div>
            {/* Quick presets */}
            <div className="form-group">
              <label className="form-label">Quick Preset</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[
                  { label: ' Senior Engineer', perms: { cases: { view: true, create: true, edit: true, delete: false, advance_stage: true }, clients: { view: true, create: false, edit: false, delete: false }, inventory: { view: true, create: false, edit: false, delete: false }, accounting: { view: false }, reports: { view: true, export: false }, analytics: { view: true }, knowledge_base: { view: true, create: true, delete: false }, recycle_bin: { view: false }, settings: { view: false }, users: { view: false }, webhooks: { view: false } } },
                  { label: ' Junior Engineer', perms: { cases: { view: true, create: false, edit: false, delete: false, advance_stage: false }, clients: { view: true, create: false, edit: false, delete: false }, inventory: { view: true }, reports: { view: false }, knowledge_base: { view: true } } },
                  { label: ' Receptionist', perms: { cases: { view: true, create: true, edit: true, delete: false }, clients: { view: true, create: true, edit: true, delete: false }, inventory: { view: false }, accounting: { view: false }, reports: { view: false } } },
                  { label: ' Accountant', perms: { cases: { view: true, create: false, edit: false, delete: false }, clients: { view: true }, accounting: { view: true, create_invoice: true, create_quote: true, record_payment: true, create_expense: true }, reports: { view: true, export: true } } },
                ].map(preset => (
                  <button key={preset.label} onClick={() => setForm(f => ({ ...f, permissions: { ...buildEmptyPermissions(), ...preset.perms } }))}
                    style={{ padding: '5px 8px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', cursor: 'pointer', fontSize: '0.72rem', color: 'var(--text-secondary)', textAlign: 'left' }}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {/* Right — Permissions Matrix */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Permission Matrix</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setForm(f => ({ ...f, permissions: buildFullPermissions() }))} style={{ padding: '3px 10px', fontSize: '0.68rem', borderRadius: 4, background: 'rgba(16,185,129,0.12)', color: '#10b981', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Grant All</button>
                <button onClick={() => setForm(f => ({ ...f, permissions: buildEmptyPermissions() }))} style={{ padding: '3px 10px', fontSize: '0.68rem', borderRadius: 4, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Revoke All</button>
              </div>
            </div>
            <div style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
              <PermissionMatrix permissions={form.permissions} onChange={perms => setForm(f => ({ ...f, permissions: perms }))} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading || !form.name} onClick={handle}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving...</> : (isNew ? '+ Create Role' : ' Save Role')}
          </button>
        </div>
      </div>
    </div>
  );
}

//  User Modal 
function UserModal({ editUser, roles, adminUsers, maxUsers, currentCount, onClose, onDone }) {
  const isNew = !editUser?.id;
  const [form, setForm] = useState({
    full_name: editUser?.full_name || '',
    username: editUser?.username || '',
    email: editUser?.email || '',
    password: '',
    role_key: editUser?.role || roles[0]?.key || '',
    assigned_admin_id: editUser?.assigned_admin_id || '',
    specializations: editUser?.specializations || [],
    phone: editUser?.phone || '',
    is_active: editUser?.is_active ?? true,
    permissions: editUser?.permissions || null, // null = use role defaults
    useCustomPerms: false,
  });
  const [loading, setLoading] = useState(false);
  const selRole = roles.find(r => r.key === form.role_key);

  const canCreateMore = !isNew || currentCount < maxUsers;

  const handle = async () => {
    if (!form.full_name || !form.username || (!editUser && !form.password)) {
      alert('Full name, username and password are required'); return;
    }
    if (isNew && !canCreateMore) {
      alert(` Team user limit reached (${maxUsers}). Contact support to upgrade your plan.`); return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        role: form.role_key,
        permissions: form.useCustomPerms ? form.permissions : null,
        assigned_admin_id: form.assigned_admin_id || undefined,
      };
      let res;
      if (isNew) res = await usersApi.create(payload);
      else res = await usersApi.update(editUser.id, payload);
      if (res.error) throw new Error(res.error);
      onDone();
      onClose();
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
        <div className="modal-header">
          <h3 className="modal-title">{isNew ? '+ Add Team Member' : ` Edit — ${editUser.full_name}`}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
          {/* Left — User Info */}
          <div>
            <div className="form-group">
              <label className="form-label required">Full Name</label>
              <input className="form-input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="John Engineer" />
            </div>
            <div className="form-group">
              <label className="form-label required">Username</label>
              <input className="form-input font-mono" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))} placeholder="john_eng" />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input type="email" className="form-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@yourlab.com" />
            </div>
            <div className="form-group">
              <label className="form-label">{isNew ? 'Password' : 'New Password (leave blank to keep)'}</label>
              <input type="password" className="form-input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={isNew ? 'Min 8 characters' : '••••••••'} />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" />
            </div>
            <div className="form-group">
              <label className="form-label required">Assign Role</label>
              <select className="form-select" value={form.role_key} onChange={e => setForm(f => ({ ...f, role_key: e.target.value, permissions: null, useCustomPerms: false }))}>
                <option value="">— Select Role —</option>
                {roles.map(r => (
                  <option key={r.key} value={r.key}>{r.name}</option>
                ))}
              </select>
              {selRole?.description && (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{selRole.description}</div>
              )}
            </div>
            {adminUsers.length > 0 && (
              <div className="form-group">
                <label className="form-label">Assign Admin</label>
                <select className="form-select" value={form.assigned_admin_id} onChange={e => setForm(f => ({ ...f, assigned_admin_id: e.target.value }))}>
                  <option value="">Automatic</option>
                  {adminUsers.map(admin => (
                    <option key={admin.id} value={admin.id}>{admin.full_name || admin.username}</option>
                  ))}
                </select>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Choose an admin who owns this team member. Defaults to your account when left blank.
                </div>
              </div>
            )}
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.8rem' }}>
                <input type="checkbox" checked={form.useCustomPerms} onChange={e => setForm(f => ({ ...f, useCustomPerms: e.target.checked, permissions: e.target.checked ? (selRole?.permissions || buildEmptyPermissions()) : null }))} />
                Override with custom permissions
              </label>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>By default, user inherits their assigned role's permissions</div>
            </div>
            {!isNew && (
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.8rem' }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                  Account Active
                </label>
              </div>
            )}
            {isNew && (
              <div className="alert" style={{ fontSize: '0.72rem', padding: 10, background: currentCount >= maxUsers ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.06)', border: '1px solid', borderColor: currentCount >= maxUsers ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)', borderRadius: 6 }}>
                <span>{currentCount >= maxUsers ? ' User limit reached!' : ` ${currentCount}/${maxUsers} team users used`}</span>
              </div>
            )}
          </div>
          {/* Right — Permissions */}
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 10 }}>
              {form.useCustomPerms ? ' Custom Permissions (overrides role)' : ` Permissions from role: ${selRole?.name || '—'}`}
            </div>
            <div style={{ maxHeight: 460, overflowY: 'auto', paddingRight: 4 }}>
              {form.useCustomPerms ? (
                <PermissionMatrix
                  permissions={form.permissions || buildEmptyPermissions()}
                  onChange={perms => setForm(f => ({ ...f, permissions: perms }))}
                />
              ) : (
                selRole?.permissions ? (
                  <PermissionMatrix permissions={selRole.permissions} readonly />
                ) : (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Select a role to preview permissions
                  </div>
                )
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading || (isNew && !canCreateMore)} onClick={handle}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving...</> : (isNew ? '+ Add User' : ' Save Changes')}
          </button>
        </div>
      </div>
    </div>
  );
}

//  My Permissions Viewer 
function MyPermissionsView({ user }) {
  const perms = user.permissions || null;
  if (!perms) {
    return (
      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}> Your Permissions</div>
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          Your permissions are inherited from your assigned role: <strong>{user.role?.replace(/_/g, ' ')}</strong>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {PERMISSION_MODULES.map(mod => (
            <div key={mod.key} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span>{mod.icon}</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{mod.label}</span>
              </div>
              <div style={{ fontSize: '0.65rem', color: '#10b981' }}> Role-based access</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 12 }}> Your Permissions</div>
      <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(0,212,255,0.06)', borderRadius: 6, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        Your account has custom permissions set by your administrator. Below is what you can access:
      </div>
      <PermissionMatrix permissions={perms} readonly />
    </div>
  );
}

//  Main Page 
export default function UserManagementPage() {
  const { user, isAdmin, hasPermission } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('users');
  const [showUserModal, setShowUserModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editRole, setEditRole] = useState(null);
  const [viewPermissions, setViewPermissions] = useState(null);
  const [assignedAdminFilter, setAssignedAdminFilter] = useState('');

  // Max users from company settings
  const maxUsers = (() => { try { return parseInt(JSON.parse(localStorage.getItem('crm_company') || '{}').max_team_users || 10); } catch { return 10; } })();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [ud, rd] = await Promise.all([usersApi.list(), usersApi.roles.list()]);
      setUsers(Array.isArray(ud) ? ud : (ud.users || []));
      setRoles(Array.isArray(rd) ? rd : []);
    } catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleToggleActive = async (u) => {
    const action = u.is_active ? 'Deactivate' : 'Activate';
    if (!confirm(`${action} ${u.full_name}?`)) return;
    try {
      const result = await usersApi.deactivate(u.id);
      if (result?.error) {
        throw new Error(result.error);
      }
      if (result && result.id) {
        await loadUsers();
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      alert(err.message || 'Unable to update user status');
    }
  };

  const adminUsers = users.filter(u => u.role === 'admin');
  const teamUsers = users.filter(u => u.role !== 'super_admin' && u.role !== 'admin');
  const visibleUsers = teamUsers.filter(u => !assignedAdminFilter || u.assigned_admin_id === assignedAdminFilter);

  const TABS = isAdmin
    ? [{ key: 'users', label: ' Team Users' }, { key: 'roles', label: ' Roles & Permissions' }, { key: 'my_perms', label: ' My Permissions' }]
    : [{ key: 'my_perms', label: ' My Permissions' }];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}> User Management</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            {isAdmin ? `Manage your team (${teamUsers.length}/${maxUsers} users)` : 'View your account permissions and access level'}
          </p>
        </div>
        {isAdmin && activeTab === 'users' && hasPermission('users', 'create') && (
          <button className="btn btn-primary" onClick={() => { setEditUser(null); setShowUserModal(true); }}>+ Add Team Member</button>
        )}
        {isAdmin && activeTab === 'roles' && (
          <button className="btn btn-primary" onClick={() => { setEditRole(null); setShowRoleModal(true); }}>+ Create Role</button>
        )}
      </div>

      <div className="tabs" style={{ marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.key} className={`tab-btn ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Team Users Tab */}
      {activeTab === 'users' && (
        <div>
          {/* Usage bar */}
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Team Users</span>
            <div style={{ flex: 1, height: 6, background: 'var(--bg-elevated)', borderRadius: 3 }}>
              <div style={{ height: '100%', borderRadius: 3, background: teamUsers.length >= maxUsers ? 'var(--status-danger)' : 'var(--accent-primary)', width: `${Math.min(100, (teamUsers.length / maxUsers) * 100)}%`, transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: teamUsers.length >= maxUsers ? 'var(--status-danger)' : 'var(--text-primary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              {teamUsers.length} / {maxUsers}
            </span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                <div style={{ minWidth: 220 }}>
                  <label className="form-label" style={{ marginBottom: 6 }}>Filter by Assigned Admin</label>
                  <select className="form-select" value={assignedAdminFilter} onChange={e => setAssignedAdminFilter(e.target.value)}>
                    <option value="">All Team Members</option>
                    {adminUsers.map(admin => (
                      <option key={admin.id} value={admin.id}>{admin.full_name || admin.username}</option>
                    ))}
                  </select>
                </div>
                {assignedAdminFilter && (
                  <button className="btn btn-secondary btn-sm" style={{ height: 34, marginTop: 24 }} onClick={() => setAssignedAdminFilter('')}>Clear filter</button>
                )}
              </div>
              {visibleUsers.length ? visibleUsers.map(u => {
                const role = roles.find(r => r.key === u.role);
                return (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', opacity: u.is_active === false ? 0.5 : 1 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${role?.color || '#6366f1'}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700, border: `2px solid ${role?.color || '#6366f1'}30`, color: role?.color || '#6366f1' }}>
                      {u.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{u.full_name}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>@{u.username}</span>
                        {u.is_active === false && <span style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: 999, background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>INACTIVE</span>}
                        {u.role === 'admin' && <span style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: 999, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontWeight: 700 }}>ADMIN</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {role && (
                          <span style={{ fontSize: '0.68rem', padding: '1px 8px', borderRadius: 999, background: `${role.color}18`, color: role.color, fontWeight: 700, border: `1px solid ${role.color}25` }}>
                            {role.name}
                          </span>
                        )}
                        {u.permissions && <span style={{ fontSize: '0.62rem', color: '#6366f1', fontWeight: 700 }}> Custom Perms</span>}
                        {u.email && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{u.email}</span>}
                        {u.assigned_admin_id && (
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', padding: '3px 8px', borderRadius: 999 }}>
                            Assigned to {adminUsers.find(a => a.id === u.assigned_admin_id)?.full_name || 'Admin'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => setViewPermissions(u)} title="View permissions"> Permissions</button>
                      {hasPermission('users', 'edit') && (
                        <button className="btn btn-sm btn-secondary" onClick={() => { setEditUser(u); setShowUserModal(true); }}> Edit</button>
                      )}
                      {(hasPermission('users', 'deactivate') || isAdmin) && u.role !== 'admin' && (
                        <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)', fontSize: '0.72rem' }} onClick={() => handleToggleActive(u)}>
                          {u.is_active === false ? ' Activate' : ' Deactivate'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              }) : null}
              {!visibleUsers.length && (
                <div className="empty-state">
                  <div className="empty-icon"></div>
                  <div className="empty-title">No matching team users</div>
                  <div className="empty-desc">Try clearing the assigned admin filter or add a new team member.</div>
                  <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowUserModal(true)}>+ Add Team Member</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Roles Tab */}
      {activeTab === 'roles' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {/* Built-in roles info */}
          <div className="alert alert-info" style={{ marginBottom: 4 }}>
            <span className="alert-icon">ℹ</span>
            <div><strong>Admin</strong> and <strong>Super Admin</strong> are system roles with full access that cannot be edited. Create custom roles for your team members.</div>
          </div>
          {roles.map(role => (
            <div key={role.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--bg-card)', border: `1px solid ${role.color || 'var(--border-subtle)'}30`, borderLeft: `4px solid ${role.color || 'var(--accent-primary)'}`, borderRadius: 'var(--radius-md)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: role.color || 'var(--text-primary)' }}>{role.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{role.key}</span>
                  <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 999, background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                    {Object.values(role.permissions || {}).reduce((acc, m) => acc + Object.values(m).filter(Boolean).length, 0)} permissions
                  </span>
                </div>
                {role.description && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{role.description}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-secondary" onClick={() => { setEditRole(role); setShowRoleModal(true); }}> Edit</button>
                <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)', fontSize: '0.72rem' }}
                  onClick={async () => { if (!confirm(`Delete role "${role.name}"?`)) return; await usersApi.roles.delete(role.id); loadUsers(); }}>
                   Delete
                </button>
              </div>
            </div>
          ))}
          {!roles.length && !loading && (
            <div className="empty-state">
              <div className="empty-icon"></div>
              <div className="empty-title">No custom roles yet</div>
              <div className="empty-desc">Create roles like "Senior Engineer", "Receptionist", or "Accountant" with specific permission sets</div>
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowRoleModal(true)}>+ Create First Role</button>
            </div>
          )}
        </div>
      )}

      {/* My Permissions Tab */}
      {activeTab === 'my_perms' && <MyPermissionsView user={user} />}

      {/* Modals */}
      {showUserModal && (
        <UserModal
          editUser={editUser}
          roles={roles}
          adminUsers={adminUsers}
          maxUsers={maxUsers}
          currentCount={teamUsers.length}
          onClose={() => setShowUserModal(false)}
          onDone={loadUsers}
        />
      )}
      {showRoleModal && (
        <RoleModal
          role={editRole}
          restrictedPerms={null}
          onClose={() => setShowRoleModal(false)}
          onDone={loadUsers}
        />
      )}
      {viewPermissions && (
        <div className="modal-overlay" onClick={() => setViewPermissions(null)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h3 className="modal-title"> Permissions — {viewPermissions.full_name}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setViewPermissions(null)}></button>
            </div>
            <div className="modal-body" style={{ maxHeight: 500, overflowY: 'auto' }}>
              <PermissionMatrix permissions={viewPermissions.permissions || roles.find(r => r.key === viewPermissions.role)?.permissions || buildEmptyPermissions()} readonly />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewPermissions(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
