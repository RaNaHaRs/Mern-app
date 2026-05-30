import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../store/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTheme, useFontSize } from '../store/ThemeContext';
import './SuperAdminPage.css';

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
const fmtAmt = (n) => `₹${parseFloat(n || 0).toLocaleString('en-IN')}`;

const BASE_URL = '/api';
const getToken = () => localStorage.getItem('accessToken');

const saApi = {
  get: (path) => fetch(`${BASE_URL}/super-admin${path}`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()),
  post: (path, body) => fetch(`${BASE_URL}/super-admin${path}`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  patch: (path, body) => fetch(`${BASE_URL}/super-admin${path}`, { method: 'PATCH', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  del: (path) => fetch(`${BASE_URL}/super-admin${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()),
  put: (path, body) => fetch(`${BASE_URL}/super-admin${path}`, { method: 'PUT', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
};

const DEFAULT_PLANS = [
  { key: 'starter', label: 'Starter', price: 999, maxUsers: 2, color: '#64748b', features: ['2 team users', 'Basic reports', '5GB storage'] },
  { key: 'professional', label: 'Professional', price: 2499, maxUsers: 5, color: '#3b82f6', features: ['5 team users', 'Advanced reports', '20GB storage', 'WhatsApp integration'] },
  { key: 'business', label: 'Business', price: 4999, maxUsers: 15, color: '#8b5cf6', features: ['15 team users', 'Full analytics', '100GB storage', 'API access', 'Priority support'] },
  { key: 'enterprise', label: 'Enterprise', price: 9999, maxUsers: -1, color: '#f59e0b', features: ['Unlimited users', 'Custom domain', 'Dedicated support', 'SLA guarantee'] },
];
// Always read from localStorage so PlansManager changes take effect everywhere
const getPlans = () => { try { return JSON.parse(localStorage.getItem('sa_custom_plans') || 'null') || DEFAULT_PLANS; } catch { return DEFAULT_PLANS; } };
// Legacy alias — module-level snapshot (components that need live data call getPlans() directly)
const PLANS = DEFAULT_PLANS;

const STATUS_COLORS = {
  active: '#10b981',
  trial: '#3b82f6',
  expired: '#ef4444',
  suspended: '#f59e0b',
  cancelled: '#64748b',
};

// ── Plan Badge ─────────────────────────────────────────────────────────────
function PlanBadge({ plan }) {
  const p = getPlans().find(x => x.key === plan) || { label: plan || 'Free', color: '#64748b' };
  return (
    <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 999, background: `${p.color}18`, color: p.color, fontWeight: 700, border: `1px solid ${p.color}30`, fontFamily: 'var(--font-mono)' }}>
      {p.label}
    </span>
  );
}

// ── Add Tenant Modal ───────────────────────────────────────────────────────
function AddTenantModal({ onClose, onDone }) {
  const dynamicPlans = getPlans();
  const [form, setForm] = useState({
    company_name: '', admin_name: '', admin_email: '', admin_password: '',
    plan: dynamicPlans[1]?.key || 'professional', max_team_users: dynamicPlans[1]?.maxUsers || 5, subscription_months: 12,
    phone: '', gstin: '', city: '', notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [razorpayOrder, setRazorpayOrder] = useState(null);
  const selPlan = dynamicPlans.find(p => p.key === form.plan) || dynamicPlans[1] || dynamicPlans[0];

  const handle = async () => {
    if (!form.company_name || !form.admin_email || !form.admin_password) {
      alert('Company name, admin email & password are required'); return;
    }
    setLoading(true);
    try {
      const res = await saApi.post('/tenants', {
        ...form,
        expiry_date: new Date(Date.now() + form.subscription_months * 30 * 86400000).toISOString().slice(0, 10),
      });
      if (res.error) throw new Error(res.error);
      alert(`✅ Subscriber "${form.company_name}" created!\n\nLogin: ${form.admin_email}\nPassword: ${form.admin_password}`);
      onDone();
      onClose();
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  const handleRazorpay = () => {
    // In demo mode — simulate payment
    const orderId = `order_demo_${Date.now()}`;
    setRazorpayOrder(orderId);
    alert(`\uD83D\uDCB3 Razorpay Order Created (Demo):\nOrder ID: ${orderId}\nAmount: \u20B9${selPlan.price * form.subscription_months}\n\nIn production this would open Razorpay checkout.`);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Create New Subscriber</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Left — Account Details */}
          <div>
            <div className="card-title" style={{ marginBottom: 12 }}>Account Details</div>
            <div className="form-group">
              <label className="form-label required">Company / Lab Name</label>
              <input className="form-input" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="e.g. DataRescue Mumbai" />
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label required">Admin Name</label>
                <input className="form-input" value={form.admin_name} onChange={e => setForm(f => ({ ...f, admin_name: e.target.value }))} placeholder="Full name" />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label required">Admin Email (Login ID)</label>
              <input type="email" className="form-input" value={form.admin_email} onChange={e => setForm(f => ({ ...f, admin_email: e.target.value }))} placeholder="admin@theirlab.com" />
            </div>
            <div className="form-group">
              <label className="form-label required">Initial Password</label>
              <input type="password" className="form-input" value={form.admin_password} onChange={e => setForm(f => ({ ...f, admin_password: e.target.value }))} placeholder="Min 8 chars" />
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">City</label>
                <input className="form-input" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Mumbai" />
              </div>
              <div className="form-group">
                <label className="form-label">GSTIN</label>
                <input className="form-input font-mono" value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))} placeholder="27AABCT..." />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Internal Notes</label>
              <textarea className="form-textarea" style={{ minHeight: 60 }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes about this client..." />
            </div>
          </div>

          {/* Right — Plan & Billing */}
          <div>
            <div className="card-title" style={{ marginBottom: 12 }}>Subscription Plan</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {dynamicPlans.map(p => (
                <div key={p.key} onClick={() => setForm(f => ({ ...f, plan: p.key, max_team_users: p.maxUsers === -1 ? 99 : p.maxUsers }))}
                  style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', border: `2px solid ${form.plan === p.key ? p.color : 'var(--border-subtle)'}`, background: form.plan === p.key ? `${p.color}10` : 'var(--bg-elevated)', cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ fontWeight: 700, color: p.color, fontSize: '0.85rem' }}>{p.label}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-primary)', margin: '2px 0' }}>₹{p.price.toLocaleString('en-IN')}<span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 400 }}>/mo</span></div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{p.maxUsers === -1 ? 'Unlimited' : p.maxUsers} users</div>
                </div>
              ))}
            </div>

            <div className="card" style={{ background: `${selPlan.color}08`, border: `1px solid ${selPlan.color}25`, marginBottom: 14 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: 8, color: selPlan.color }}>{selPlan.label} Plan Includes:</div>
              {selPlan.features.map(f => (
                <div key={f} style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 3 }}>{f}</div>
              ))}
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Duration (months)</label>
                <select className="form-select" value={form.subscription_months} onChange={e => setForm(f => ({ ...f, subscription_months: parseInt(e.target.value) }))}>
                  <option value={1}>1 Month</option>
                  <option value={3}>3 Months (-5%)</option>
                  <option value={6}>6 Months (-10%)</option>
                  <option value={12}>12 Months (-20%)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Max Team Users</label>
                <input type="number" className="form-input" value={form.max_team_users} onChange={e => setForm(f => ({ ...f, max_team_users: parseInt(e.target.value) }))} min={1} max={99} />
              </div>
            </div>

            <div style={{ padding: '12px 14px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius-md)', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Plan: {selPlan.label} × {form.subscription_months} months</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 700 }}>₹{(selPlan.price * form.subscription_months).toLocaleString('en-IN')}</span>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Expires: {new Date(Date.now() + form.subscription_months * 30 * 86400000).toLocaleDateString('en-IN')}</div>
            </div>

            <button className="btn btn-secondary" style={{ width: '100%', marginBottom: 8, gap: 8 }} onClick={handleRazorpay}>
              Generate Razorpay Payment Link
              {razorpayOrder && <span style={{ fontSize: '0.7rem', color: '#10b981' }}>Created</span>}
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading} onClick={handle}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Creating...</> : 'Create Subscriber Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Tenant Modal ──────────────────────────────────────────────────────
function EditTenantModal({ tenant, onClose, onDone }) {
  const [form, setForm] = useState({
    company_name: tenant.company_name || '',
    plan: tenant.plan || 'professional',
    max_team_users: tenant.max_team_users || 5,
    status: tenant.status || 'active',
    expiry_date: tenant.expiry_date || '',
    notes: tenant.notes || '',
  });
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      const res = await saApi.patch(`/tenants/${tenant.id}`, form);
      if (res.error) throw new Error(res.error);
      onDone();
      onClose();
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h3 className="modal-title">Edit Subscriber — {tenant.company_name}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Company Name</label>
            <input className="form-input" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Plan</label>
              <select className="form-select" value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
                {getPlans().map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="suspended">Suspended</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Max Team Users</label>
              <input type="number" className="form-input" value={form.max_team_users} onChange={e => setForm(f => ({ ...f, max_team_users: parseInt(e.target.value) }))} min={1} max={99} />
            </div>
            <div className="form-group">
              <label className="form-label">Expiry Date</label>
              <input type="date" className="form-input" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" style={{ minHeight: 70 }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading} onClick={handle}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving...</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tenant Users Modal ─────────────────────────────────────────────────────
function TenantUsersModal({ tenant, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const ROLE_COLORS = { admin: '#10b981', senior_engineer: '#3b82f6', engineer: '#6366f1', receptionist: '#f59e0b', viewer: '#64748b' };

  useEffect(() => {
    saApi.get(`/tenants/${tenant.id}/users`)
      .then(d => { setUsers(d.users || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tenant.id]);

  const toggleUser = async (u) => {
    const res = await saApi.patch(`/tenants/${tenant.id}/users/${u.id}`, { is_active: !u.is_active });
    if (res.ok) setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: !x.is_active } : x));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h3 className="modal-title">Users — {tenant.company_name}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} /></div>
          ) : users.length === 0 ? (
            <div className="empty-state" style={{ padding: 30 }}>
              <div className="empty-icon"></div>
              <div className="empty-title">No users found</div>
              <div className="empty-desc">This subscriber has no team members yet</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {users.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, opacity: u.is_active ? 1 : 0.55 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${ROLE_COLORS[u.role] || '#64748b'}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', border: `2px solid ${ROLE_COLORS[u.role] || '#64748b'}30` }}>
                    {u.role ? u.role[0].toUpperCase() : ''}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.83rem' }}>{u.full_name || u.username || u.email}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1 }}>{u.email}</div>
                  </div>
                  <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 999, background: `${ROLE_COLORS[u.role] || '#64748b'}15`, color: ROLE_COLORS[u.role] || '#64748b', fontWeight: 700 }}>{u.role}</span>
                  {!u.is_active && <span style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>INACTIVE</span>}
                  {u.last_login && <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Last: {new Date(u.last_login).toLocaleDateString('en-IN')}</span>}
                  {u.role !== 'admin' && (
                    <button className="btn btn-sm btn-secondary" style={{ fontSize: '0.7rem' }} onClick={() => toggleUser(u)}>
                      {u.is_active ? '\u23F8 Deactivate' : '\u25B6 Activate'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{users.length} user{users.length !== 1 ? 's' : ''} in this subscriber</div>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Tenant Row ──────────────────────────────────────────────────────────────
function TenantRow({ tenant, onEdit, onImpersonate, onToggle, onViewUsers }) {
  const daysLeft = Math.ceil((new Date(tenant.expiry_date) - Date.now()) / 86400000);
  const isExpired = daysLeft < 0;
  const isExpiringSoon = daysLeft >= 0 && daysLeft <= 14;

  return (
    <tr>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,212,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', border: '1px solid rgba(0,212,255,0.2)' }}>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{tenant.company_name}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{tenant.admin_email}</div>
          </div>
        </div>
      </td>
      <td><PlanBadge plan={tenant.plan} /></td>
      <td>
        <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 999, background: `${STATUS_COLORS[tenant.status] || '#64748b'}18`, color: STATUS_COLORS[tenant.status] || '#64748b', fontWeight: 700 }}>
          {tenant.status?.toUpperCase()}
        </span>
      </td>
      <td>
        <div style={{ fontSize: '0.78rem' }}>{tenant.team_user_count || 0} / {tenant.max_team_users}</div>
        <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 2, marginTop: 3, width: 60 }}>
          <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, ((tenant.team_user_count || 0) / tenant.max_team_users) * 100)}%`, background: 'var(--accent-primary)' }} />
        </div>
      </td>
      <td>
        <div style={{ fontSize: '0.78rem', color: isExpired ? 'var(--status-danger)' : isExpiringSoon ? '#f59e0b' : 'var(--text-secondary)' }}>
          {isExpired ? `Expired ${Math.abs(daysLeft)}d ago` : `${daysLeft}d left`}
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{new Date(tenant.expiry_date).toLocaleDateString('en-IN')}</div>
      </td>
      <td>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {tenant.city || '—'}
        </div>
      </td>
      <td>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-secondary" onClick={() => onEdit(tenant)} title="Edit">Edit</button>
          <button className="btn btn-sm" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', fontSize: '0.7rem' }}
            onClick={() => onViewUsers(tenant)} title="View users in this subscriber">
            Users
          </button>
          <button className="btn btn-sm" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', borderColor: 'rgba(99,102,241,0.3)', fontSize: '0.7rem' }}
            onClick={() => onImpersonate(tenant)} title="View as this subscriber">
            View
          </button>
          <button className="btn btn-sm" style={{ background: tenant.status === 'suspended' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: tenant.status === 'suspended' ? '#10b981' : '#f59e0b', borderColor: 'transparent', fontSize: '0.7rem' }}
            onClick={() => onToggle(tenant)}>
            {tenant.status === 'suspended' ? '▶ Unsuspend' : '⏸ Suspend'}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Plans Manager (with Permissions) ─────────────────────────────────────
const ALL_MODULES = [
  { key: 'cases',         label: 'Cases',          icon: '' },
  { key: 'clients',       label: 'Clients',         icon: '' },
  { key: 'inventory',     label: 'Inventory',         icon: '' },
  { key: 'accounting',    label: 'Accounting',         icon: '' },
  { key: 'reports',       label: 'Reports',         icon: '' },
  { key: 'analytics',     label: 'Analytics',       icon: '' },
  { key: 'knowledge_base',label: 'Knowledge Base',       icon: '' },
  { key: 'settings',      label: 'Settings',        icon: '' },
  { key: 'recycle_bin',   label: 'Recycle Bin',         icon: '' },
  { key: 'webhooks',      label: 'Webhooks',             icon: '' },
];
const ALL_ACTIONS = ['view', 'create', 'edit', 'delete', 'export'];
const DEFAULT_PERMISSIONS = {
  starter:      { cases:{view:true,create:true,edit:true,delete:false,export:false}, clients:{view:true,create:true,edit:true,delete:false,export:false}, inventory:{view:true,create:false,edit:false,delete:false,export:false}, accounting:{view:false,create:false,edit:false,delete:false,export:false}, reports:{view:true,create:false,edit:false,delete:false,export:false},   analytics:{view:false,create:false,edit:false,delete:false,export:false}, knowledge_base:{view:true,create:false,edit:false,delete:false,export:false}, settings:{view:true,create:false,edit:false,delete:false,export:false}, recycle_bin:{view:false,create:false,edit:false,delete:false,export:false}, webhooks:{view:false,create:false,edit:false,delete:false,export:false} },
  professional: { cases:{view:true,create:true,edit:true,delete:true,export:true},  clients:{view:true,create:true,edit:true,delete:true,export:true},  inventory:{view:true,create:true,edit:true,delete:false,export:true},  accounting:{view:true,create:true,edit:true,delete:false,export:true},  reports:{view:true,create:true,edit:false,delete:false,export:true},   analytics:{view:true,create:false,edit:false,delete:false,export:false}, knowledge_base:{view:true,create:true,edit:true,delete:false,export:false}, settings:{view:true,create:false,edit:true,delete:false,export:false}, recycle_bin:{view:true,create:false,edit:false,delete:false,export:false}, webhooks:{view:false,create:false,edit:false,delete:false,export:false} },
  business:     { cases:{view:true,create:true,edit:true,delete:true,export:true},  clients:{view:true,create:true,edit:true,delete:true,export:true},  inventory:{view:true,create:true,edit:true,delete:true,export:true},  accounting:{view:true,create:true,edit:true,delete:true,export:true},  reports:{view:true,create:true,edit:true,delete:false,export:true},   analytics:{view:true,create:true,edit:false,delete:false,export:true},  knowledge_base:{view:true,create:true,edit:true,delete:true,export:true},  settings:{view:true,create:false,edit:true,delete:false,export:false}, recycle_bin:{view:true,create:false,edit:false,delete:true,export:false}, webhooks:{view:true,create:true,edit:false,delete:false,export:false} },
  enterprise:   { cases:{view:true,create:true,edit:true,delete:true,export:true},  clients:{view:true,create:true,edit:true,delete:true,export:true},  inventory:{view:true,create:true,edit:true,delete:true,export:true},  accounting:{view:true,create:true,edit:true,delete:true,export:true},  reports:{view:true,create:true,edit:true,delete:true,export:true},   analytics:{view:true,create:true,edit:true,delete:true,export:true},  knowledge_base:{view:true,create:true,edit:true,delete:true,export:true},  settings:{view:true,create:true,edit:true,delete:true,export:true},  recycle_bin:{view:true,create:false,edit:false,delete:true,export:false}, webhooks:{view:true,create:true,edit:true,delete:true,export:false} },
};
const getPermissions = () => { try { return JSON.parse(localStorage.getItem('sa_plan_permissions') || 'null') || DEFAULT_PERMISSIONS; } catch { return DEFAULT_PERMISSIONS; } };

function PlansManager({ tenants }) {
  const [plans, setPlans] = useState(getPlans);
  const [editing, setEditing] = useState(null);
  const [newPlan, setNewPlan] = useState({ key:'', label:'', price:0, maxUsers:5, color:'#3b82f6', features:[] });
  const [showAdd, setShowAdd] = useState(false);
  const [newFeature, setNewFeature] = useState('');
  const [saved, setSaved] = useState(false);
  const [activeView, setActiveView] = useState('plans'); // 'plans' | 'permissions'
  const [permissions, setPermissions] = useState(getPermissions);
  const [selPermPlan, setSelPermPlan] = useState(plans[0]?.key || 'starter');

  // Load plans from backend on mount and sync to localStorage for cross-component use
  useEffect(() => {
    saApi.get('/plans').then(d => {
      if (d.plans) {
        localStorage.setItem('sa_custom_plans', JSON.stringify(d.plans));
        setPlans(d.plans);
      }
    }).catch(() => {});
  }, []);

  const persist = (p) => {
    localStorage.setItem('sa_custom_plans', JSON.stringify(p));
    setPlans(p); setSaved(true); setTimeout(() => setSaved(false), 2500);
    saApi.put('/plans', { plans: p }).catch(() => {}); // async save to backend
  };
  const persistPerms = (p) => {
    localStorage.setItem('sa_plan_permissions', JSON.stringify(p));
    setPermissions(p); setSaved(true); setTimeout(() => setSaved(false), 2500);
  };
  const startEdit = (plan) => setEditing({ ...plan });
  const saveEdit  = () => { persist(plans.map(p => p.key === editing.key ? editing : p)); setEditing(null); };
  const removePlan = (key) => { if (window.confirm('Remove plan? Existing subscribers keep their access.')) persist(plans.filter(p => p.key !== key)); };
  const addPlan = () => {
    if (!newPlan.key || !newPlan.label) { alert('Key and label required'); return; }
    if (plans.find(p => p.key === newPlan.key)) { alert('Plan key already exists'); return; }
    const updated = [...plans, newPlan];
    persist(updated);
    // Add default permissions row for new plan
    const updatedPerms = { ...permissions, [newPlan.key]: DEFAULT_PERMISSIONS.starter };
    persistPerms(updatedPerms);
    setNewPlan({ key:'', label:'', price:0, maxUsers:5, color:'#3b82f6', features:[] });
    setShowAdd(false);
  };

  const togglePerm = (planKey, module, action) => {
    const updated = {
      ...permissions,
      [planKey]: {
        ...(permissions[planKey] || {}),
        [module]: {
          ...(permissions[planKey]?.[module] || {}),
          [action]: !(permissions[planKey]?.[module]?.[action]),
        },
      },
    };
    persistPerms(updated);
  };

  const toggleAll = (planKey, module) => {
    const modPerms = permissions[planKey]?.[module] || {};
    const allOn = ALL_ACTIONS.every(a => modPerms[a]);
    const updated = {
      ...permissions,
      [planKey]: {
        ...(permissions[planKey] || {}),
        [module]: Object.fromEntries(ALL_ACTIONS.map(a => [a, !allOn])),
      },
    };
    persistPerms(updated);
  };

  const curPlan = plans.find(p => p.key === selPermPlan) || plans[0];

  return (
    <div>
      {/* View Toggle */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', gap:4, background:'var(--bg-elevated)', borderRadius:10, padding:3, border:'1px solid var(--border-subtle)' }}>
          {[{v:'plans',label:'Plans'},{v:'permissions',label:'Permissions & Access'}].map(t => (
            <button key={t.v}
              onClick={() => setActiveView(t.v)}
              style={{ padding:'6px 16px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700, fontSize:'0.79rem', fontFamily:'inherit',
                background: activeView===t.v ? 'linear-gradient(135deg,#7c3aed,#6d28d9)' : 'transparent',
                color: activeView===t.v ? '#fff' : 'var(--text-muted)', transition:'all 0.18s'
              }}>{t.label}</button>
          ))}
        </div>
        {activeView === 'plans' && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(!showAdd)}>Add Plan</button>
        )}
      </div>

      {/* ── Plans View ── */}
      {activeView === 'plans' && (
        <div>
          <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.1rem' }}></span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#f59e0b' }}>Super Admin Only — Plan Management</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>Only the platform Super Admin can create, edit, or remove subscription plans.</div>
            </div>
          </div>

          {showAdd && (
            <div className="card" style={{ marginBottom:16, border:'1px solid var(--accent-primary)' }}>
              <div style={{fontWeight:700,marginBottom:12}}>New Plan</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr auto', gap:10, alignItems:'flex-end' }}>
                <div className="form-group" style={{margin:0}}><label className="form-label">Key (unique)</label><input className="form-input font-mono" value={newPlan.key} onChange={e=>setNewPlan(p=>({...p,key:e.target.value.toLowerCase().replace(/\s/g,'_')}))} placeholder="starter" /></div>
                <div className="form-group" style={{margin:0}}><label className="form-label">Label</label><input className="form-input" value={newPlan.label} onChange={e=>setNewPlan(p=>({...p,label:e.target.value}))} placeholder="Starter" /></div>
                <div className="form-group" style={{margin:0}}><label className="form-label">Price/mo (₹)</label><input type="number" className="form-input" value={newPlan.price} onChange={e=>setNewPlan(p=>({...p,price:parseInt(e.target.value)||0}))} /></div>
                <div className="form-group" style={{margin:0}}><label className="form-label">Max Users (-1=∞)</label><input type="number" className="form-input" value={newPlan.maxUsers} onChange={e=>setNewPlan(p=>({...p,maxUsers:parseInt(e.target.value)||5}))} /></div>
                <div style={{display:'flex',gap:6}}><button className="btn btn-primary" onClick={addPlan}>Add</button><button className="btn btn-ghost" onClick={()=>setShowAdd(false)}>Close</button></div>
              </div>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:16 }}>
            {plans.map(plan => {
              const tenantCount = tenants.filter(t => t.plan === plan.key).length;
              const isEditing = editing?.key === plan.key;
              return (
                <div key={plan.key} className="card" style={{ border:`2px solid ${plan.color}30`, position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:plan.color }} />
                  {isEditing ? (
                    <div>
                      <div className="form-group" style={{margin:'0 0 8px'}}><label className="form-label" style={{fontSize:'0.7rem'}}>Label</label><input className="form-input" value={editing.label} onChange={e=>setEditing(p=>({...p,label:e.target.value}))} /></div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                        <div className="form-group" style={{margin:0}}><label className="form-label" style={{fontSize:'0.7rem'}}>Price/mo (₹)</label><input type="number" className="form-input" value={editing.price} onChange={e=>setEditing(p=>({...p,price:parseInt(e.target.value)||0}))} /></div>
                        <div className="form-group" style={{margin:0}}><label className="form-label" style={{fontSize:'0.7rem'}}>Max Users</label><input type="number" className="form-input" value={editing.maxUsers} onChange={e=>setEditing(p=>({...p,maxUsers:parseInt(e.target.value)||5}))} /></div>
                      </div>
                      <div className="form-group" style={{margin:'0 0 8px'}}><label className="form-label" style={{fontSize:'0.7rem'}}>Color</label><input type="color" value={editing.color} onChange={e=>setEditing(p=>({...p,color:e.target.value}))} style={{width:40,height:30,padding:2,border:'1px solid var(--border-default)',borderRadius:4,cursor:'pointer'}} /></div>
                      <div style={{marginBottom:8}}>
                        <label className="form-label" style={{fontSize:'0.7rem'}}>Features</label>
                        {editing.features.map((f,i) => (
                          <div key={i} style={{display:'flex',gap:4,marginBottom:4}}>
                            <input className="form-input" style={{flex:1,fontSize:'0.75rem',padding:'4px 8px'}} value={f} onChange={e=>{const ff=[...editing.features];ff[i]=e.target.value;setEditing(p=>({...p,features:ff}));}} />
                            <button onClick={()=>setEditing(p=>({...p,features:p.features.filter((_,j)=>j!==i)}))} style={{background:'none',border:'none',color:'var(--danger)',cursor:'pointer'}}>Remove</button>
                          </div>
                        ))}
                        <div style={{display:'flex',gap:4}}>
                          <input className="form-input" style={{flex:1,fontSize:'0.75rem',padding:'4px 8px'}} value={newFeature} onChange={e=>setNewFeature(e.target.value)} placeholder="Add feature..." onKeyDown={e=>{if(e.key==='Enter'&&newFeature.trim()){setEditing(p=>({...p,features:[...p.features,newFeature.trim()]}));setNewFeature('');}}} />
                          <button className="btn btn-sm btn-secondary" onClick={()=>{if(newFeature.trim()){setEditing(p=>({...p,features:[...p.features,newFeature.trim()]}));setNewFeature('');}}} >+</button>
                        </div>
                      </div>
                      <div style={{display:'flex',gap:6}}>
                        <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>setEditing(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                        <div>
                          <div style={{ fontWeight:800, fontSize:'1rem', color:plan.color }}>{plan.label}</div>
                          <div style={{ fontSize:'1.6rem', fontWeight:900, color:'var(--text-primary)', fontFamily:'var(--font-mono)' }}>₹{plan.price.toLocaleString('en-IN')}<span style={{ fontSize:'0.7rem', color:'var(--text-muted)', fontWeight:400 }}>/mo</span></div>
                          <div style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>{plan.maxUsers === -1 ? 'Unlimited' : plan.maxUsers} users · <code style={{fontSize:'0.68rem'}}>{plan.key}</code></div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:'1.2rem', fontWeight:900, color:plan.color }}>{tenantCount}</div>
                          <div style={{ fontSize:'0.65rem', color:'var(--text-muted)' }}>subscribers</div>
                        </div>
                      </div>
                      <div style={{ marginBottom:12 }}>{plan.features.map(f => <div key={f} style={{ fontSize:'0.72rem', color:'var(--text-secondary)', marginBottom:3 }}>{f}</div>)}</div>
                      <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', borderTop:'1px solid var(--border-subtle)', paddingTop:8, marginBottom:10 }}>
                        MRR: <strong style={{ color:plan.color }}>₹{(plan.price * tenantCount).toLocaleString('en-IN')}</strong>
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => startEdit(plan)}>Edit</button>
                        <button className="btn btn-sm" style={{background:'rgba(16,185,129,0.1)',color:'#10b981',borderColor:'rgba(16,185,129,0.2)',fontSize:'0.72rem'}}
                          onClick={() => { setSelPermPlan(plan.key); setActiveView('permissions'); }}>Permissions</button>
                        <button className="btn btn-sm" style={{background:'rgba(239,68,68,0.1)',color:'#ef4444',borderColor:'rgba(239,68,68,0.2)',fontSize:'0.72rem'}} onClick={() => removePlan(plan.key)}>Remove</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Permissions View ── */}
      {activeView === 'permissions' && (
        <div>
          <div style={{ marginBottom:14, padding:'10px 14px', background:'rgba(124,58,237,0.08)', border:'1px solid rgba(124,58,237,0.25)', borderRadius:10, display:'flex', alignItems:'center', gap:10 }}>
            <span style={{fontSize:'1.1rem'}}></span>
            <div>
              <div style={{fontWeight:700,fontSize:'0.82rem',color:'#a78bfa'}}>Module-level Permissions per Plan</div>
              <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:2}}>Define exactly which modules and actions each subscription plan grants to subscriber users. Changes apply to all subscribers on this plan.</div>
            </div>
          </div>

          {/* Plan Selector */}
          <div style={{ display:'flex', gap:8, marginBottom:18, flexWrap:'wrap' }}>
            {plans.map(p => (
              <button key={p.key}
                onClick={() => setSelPermPlan(p.key)}
                style={{ padding:'6px 14px', borderRadius:8, border:`2px solid ${selPermPlan===p.key ? p.color : 'var(--border-subtle)'}`,
                  background: selPermPlan===p.key ? `${p.color}18` : 'var(--bg-elevated)',
                  color: selPermPlan===p.key ? p.color : 'var(--text-muted)',
                  fontWeight:700, fontSize:'0.79rem', cursor:'pointer', transition:'all 0.15s', fontFamily:'inherit'
                }}>{p.label}</button>
            ))}
          </div>

          {/* Permission Matrix */}
          {curPlan && (
            <div className="sa-perm-matrix">
              <div className="sa-perm-header">
                <div className="sa-perm-module-col">Module</div>
                {ALL_ACTIONS.map(a => <div key={a} className="sa-perm-action-col">{a.charAt(0).toUpperCase()+a.slice(1)}</div>)}
                <div className="sa-perm-action-col">All</div>
              </div>
              {ALL_MODULES.map(mod => {
                const modPerms = permissions[selPermPlan]?.[mod.key] || {};
                const allOn = ALL_ACTIONS.every(a => modPerms[a]);
                return (
                  <div key={mod.key} className="sa-perm-row">
                    <div className="sa-perm-module-col">
                      <span className="sa-perm-mod-icon">{mod.icon}</span>
                      <span className="sa-perm-mod-label">{mod.label}</span>
                    </div>
                    {ALL_ACTIONS.map(action => (
                      <div key={action} className="sa-perm-action-col">
                        <button
                          className={`sa-perm-toggle${modPerms[action] ? ' on' : ''}`}
                          onClick={() => togglePerm(selPermPlan, mod.key, action)}
                          title={`${modPerms[action] ? 'Disable' : 'Enable'} ${action} on ${mod.label}`}
                        >
                          {modPerms[action]
                            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          }
                        </button>
                      </div>
                    ))}
                    <div className="sa-perm-action-col">
                      <button
                        className={`sa-perm-toggle${allOn ? ' on-all' : ''}`}
                        onClick={() => toggleAll(selPermPlan, mod.key)}
                        title={allOn ? 'Disable all' : 'Enable all'}
                        style={{ borderRadius:6, fontSize:'0.65rem', fontWeight:800, padding:'2px 7px', width:'auto', height:'auto' }}
                      >{allOn ? 'ON' : 'OFF'}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {saved && <div style={{position:'fixed',bottom:24,right:24,background:'linear-gradient(135deg,#7c3aed,#10b981)',color:'#fff',padding:'10px 18px',borderRadius:10,fontWeight:700,fontSize:'0.85rem',zIndex:9999,boxShadow:'0 4px 18px rgba(0,0,0,0.3)'}}>Saved successfully</div>}
    </div>
  );
}

// ── Razorpay Tab (standalone) ──────────────────────────────────────────────
function RazorpayTab({ tenants, simulateWebhook, filtered }) {
  const [rzpKey, setRzpKey] = useState(localStorage.getItem('sa_rzp_key_id') || '');
  const [rzpSecret, setRzpSecret] = useState(localStorage.getItem('sa_rzp_key_secret') || '');
  const [rzpWebhook, setRzpWebhook] = useState(localStorage.getItem('sa_rzp_webhook_secret') || '');
  const [rzpMode, setRzpMode] = useState(localStorage.getItem('sa_rzp_mode') || 'test');
  const [saved, setSaved] = useState(false);
  const isVerified = localStorage.getItem('sa_rzp_verified') === 'true';

  const save = () => {
    if (!rzpKey) { alert('Enter Razorpay Key ID first'); return; }
    localStorage.setItem('sa_rzp_key_id', rzpKey);
    localStorage.setItem('sa_rzp_key_secret', rzpSecret);
    localStorage.setItem('sa_rzp_webhook_secret', rzpWebhook);
    localStorage.setItem('sa_rzp_mode', rzpMode);
    localStorage.setItem('sa_rzp_verified', 'true');
    localStorage.setItem('sa_rzp_merchant_name', 'RecoverLab Solutions');
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  const EVENTS = ['payment.captured','payment.failed','subscription.activated','subscription.charged','subscription.halted','refund.created'];

  return (
    <div>
      {/* Status Banner */}
      <div style={{ marginBottom:18, padding:'14px 18px', borderRadius:12,
        background: isVerified ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
        border: `1px solid ${isVerified ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:40, height:40, borderRadius:10, background: isVerified ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.4rem' }}>R</div>
          <div>
            <div style={{ fontWeight:700, fontSize:'0.9rem', color: isVerified ? '#10b981' : '#f59e0b' }}>
              {isVerified ? 'Razorpay — Connected & Verified' : 'Razorpay — Not Configured'}
            </div>
            <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:2 }}>
              {isVerified ? `Merchant: ${localStorage.getItem('sa_rzp_merchant_name')} · Mode: ${rzpMode.toUpperCase()}` : 'Enter your credentials below to enable payment collection'}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          <span style={{ padding:'3px 10px', borderRadius:6, fontSize:'0.68rem', fontWeight:800, fontFamily:'var(--font-mono)',
            background: rzpMode==='live' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
            color: rzpMode==='live' ? '#10b981' : '#3b82f6' }}>{rzpMode.toUpperCase()} MODE</span>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {/* Left — Credentials */}
        <div>
          <div className="card" style={{ marginBottom:16 }}>
            <div className="card-title" style={{ marginBottom:14 }}>API Credentials</div>

            {/* Mode Toggle */}
            <div className="form-group">
              <label className="form-label">Mode</label>
              <div style={{ display:'flex', gap:6 }}>
                {['test','live'].map(m => (
                  <button key={m} onClick={() => setRzpMode(m)}
                    style={{ flex:1, padding:'8px 0', borderRadius:8, border:`2px solid ${rzpMode===m ? (m==='live'?'#10b981':'#3b82f6') : 'var(--border-subtle)'}`,
                      background: rzpMode===m ? (m==='live'?'rgba(16,185,129,0.12)':'rgba(59,130,246,0.12)') : 'transparent',
                      color: rzpMode===m ? (m==='live'?'#10b981':'#3b82f6') : 'var(--text-muted)',
                      fontWeight:700, fontSize:'0.8rem', cursor:'pointer', fontFamily:'inherit' }}>
                    {m === 'live' ? 'Live' : 'Test'}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Key ID <span style={{color:'var(--text-muted)',fontSize:'0.67rem'}}>({rzpMode === 'live' ? 'rzp_live_...' : 'rzp_test_...'})</span></label>
              <input className="form-input font-mono" placeholder={rzpMode==='live'?'rzp_live_...':'rzp_test_...'} value={rzpKey} onChange={e=>setRzpKey(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Key Secret</label>
              <input type="password" className="form-input font-mono" placeholder="Enter key secret" value={rzpSecret} onChange={e=>setRzpSecret(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Webhook Signing Secret <span style={{fontSize:'0.67rem',color:'var(--text-muted)'}}>from Razorpay Dashboard</span></label>
              <input className="form-input font-mono" placeholder="whsec_..." value={rzpWebhook} onChange={e=>setRzpWebhook(e.target.value)} />
            </div>
            <div style={{ display:'flex', gap:8, marginTop:4 }}>
              <button className="btn btn-primary" onClick={save}>Save & Verify</button>
              <button className="btn btn-secondary" onClick={() => {
                simulateWebhook(filtered[0]||{company_name:'Test Co',admin_email:'test@demo.com'}, getPlans()[1]||getPlans()[0], true);
                alert('✅ Simulated a successful payment webhook!');
              }}>Simulate Webhook</button>
            </div>
          </div>
        </div>

        {/* Right — Webhook Config */}
        <div>
          <div className="card" style={{ marginBottom:16 }}>
            <div className="card-title" style={{ marginBottom:14 }}>Webhook Configuration</div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginBottom:6 }}>Set this URL in your <strong>Razorpay Dashboard → Webhooks</strong>:</div>
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg-elevated)', borderRadius:8, border:'1px solid var(--border-subtle)' }}>
                <code style={{ flex:1, fontSize:'0.72rem', fontFamily:'var(--font-mono)', color:'var(--accent-primary)', wordBreak:'break-all' }}>
                  https://your-domain.com/api/razorpay/webhook
                </code>
                <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:'0.7rem', padding:4, borderRadius:4, transition:'all 0.15s' }}
                  onClick={() => navigator.clipboard?.writeText('https://your-domain.com/api/razorpay/webhook').then(() => alert('Copied!'))}>
                  
                </button>
              </div>
            </div>
            <div>
              <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-secondary)', marginBottom:8 }}>Enable these events:</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                {EVENTS.map(ev => (
                  <div key={ev} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 8px', background:'var(--bg-elevated)', borderRadius:6 }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:'#10b981', flexShrink:0 }} />
                    <code style={{ fontSize:'0.68rem', color:'var(--text-secondary)' }}>{ev}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom:14 }}>📖 Integration Guide</div>
            {[['1','Create a Razorpay account at razorpay.com'],['2','Switch to Live mode and copy API keys above'],['3','Add the webhook URL in Razorpay Dashboard'],['4','Enable the payment events listed above'],['5','Click Save & Verify to activate'],].map(([n,t]) => (
              <div key={n} style={{ display:'flex', gap:10, marginBottom:8, alignItems:'flex-start' }}>
                <div style={{ width:20, height:20, borderRadius:'50%', background:'rgba(124,58,237,0.2)', border:'1px solid rgba(124,58,237,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.65rem', fontWeight:800, color:'#a78bfa', flexShrink:0 }}>{n}</div>
                <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)', paddingTop:2 }}>{t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {saved && <div style={{position:'fixed',bottom:24,right:24,background:'linear-gradient(135deg,#7c3aed,#10b981)',color:'#fff',padding:'10px 18px',borderRadius:10,fontWeight:700,fontSize:'0.85rem',zIndex:9999}}>Razorpay settings saved!</div>}
    </div>
  );
}

// ── Coupon Manager ──────────────────────────────────────────────────────────
function CouponManager() {
  const [coupons, setCoupons] = useState([]);
  const [form, setForm] = useState({ code:'', type:'global', target_email:'', discount_type:'percent', discount_value:10, max_uses:'', expiry_date:'', description:'' });
  const [showAdd, setShowAdd] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingCoupons, setLoadingCoupons] = useState(true);

  const reload = useCallback(() => {
    saApi.get('/coupons').then(d => { setCoupons(d.coupons || []); setLoadingCoupons(false); }).catch(() => setLoadingCoupons(false));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const genCode = () => setForm(f => ({ ...f, code: Math.random().toString(36).substring(2,8).toUpperCase() }));
  const addCoupon = async () => {
    if (!form.code || !form.discount_value) { alert('Code and discount value are required'); return; }
    const res = await saApi.post('/coupons', { ...form, code: form.code.toUpperCase() });
    if (res.error) { alert(res.error); return; }
    reload();
    setForm({ code:'', type:'global', target_email:'', discount_type:'percent', discount_value:10, max_uses:'', expiry_date:'', description:'' });
    setShowAdd(false);
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  };
  const removeCoupon = async (code) => {
    if (!confirm(`Remove coupon ${code}?`)) return;
    await saApi.del(`/coupons/${code}`);
    reload();
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:'0.82rem', color:'var(--text-muted)' }}>Create global or user-specific discount coupons for subscriptions.</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(!showAdd)}>+ Create Coupon</button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom:16, border:'1px solid var(--accent-primary)' }}>
          <div style={{fontWeight:700,marginBottom:14}}>New Coupon Code</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{margin:0}}>
              <label className="form-label">Coupon Code</label>
              <div style={{display:'flex',gap:6}}>
                <input className="form-input font-mono" style={{flex:1,textTransform:'uppercase'}} value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value.toUpperCase()}))} placeholder="e.g. SAVE20" />
                <button className="btn btn-secondary btn-sm" onClick={genCode} title="Auto-generate">Auto</button>
              </div>
            </div>
            <div className="form-group" style={{margin:0}}>
              <label className="form-label">Coupon Type</label>
              <select className="form-select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value,target_email:''}))}>
                <option value="global">Global (anyone can use)</option>
                <option value="user">User-Specific</option>
              </select>
            </div>
            {form.type === 'user' && (
              <div className="form-group" style={{margin:0,gridColumn:'1/-1'}}>
                <label className="form-label">Target Email (who can use this)</label>
                <input className="form-input" value={form.target_email} onChange={e=>setForm(f=>({...f,target_email:e.target.value}))} placeholder="client@example.com" />
              </div>
            )}
            <div className="form-group" style={{margin:0}}>
              <label className="form-label">Discount Type</label>
              <select className="form-select" value={form.discount_type} onChange={e=>setForm(f=>({...f,discount_type:e.target.value}))}>
                <option value="percent">Percentage (%)</option>
                <option value="flat">Flat Amount (₹)</option>
              </select>
            </div>
            <div className="form-group" style={{margin:0}}>
              <label className="form-label">Discount Value</label>
              <input type="number" className="form-input" value={form.discount_value} onChange={e=>setForm(f=>({...f,discount_value:parseFloat(e.target.value)||0}))} placeholder={form.discount_type==='percent'?'e.g. 20':'e.g. 500'} />
            </div>
            <div className="form-group" style={{margin:0}}>
              <label className="form-label">Max Uses (blank = unlimited)</label>
              <input type="number" className="form-input" value={form.max_uses} onChange={e=>setForm(f=>({...f,max_uses:e.target.value}))} placeholder="e.g. 100" />
            </div>
            <div className="form-group" style={{margin:0}}>
              <label className="form-label">Expiry Date (optional)</label>
              <input type="date" className="form-input" value={form.expiry_date} onChange={e=>setForm(f=>({...f,expiry_date:e.target.value}))} />
            </div>
            <div className="form-group" style={{margin:0,gridColumn:'1/-1'}}>
              <label className="form-label">Description (internal note)</label>
              <input className="form-input" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="e.g. Launch offer for Q1 2025" />
            </div>
          </div>
          <div style={{display:'flex',gap:8,marginTop:14}}>
            <button className="btn btn-primary" onClick={addCoupon}>Create Coupon</button>
            <button className="btn btn-ghost" onClick={()=>setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loadingCoupons ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} /></div>
      ) : coupons.length === 0 ? (
        <div className="empty-state" style={{padding:40}}><div className="empty-icon"></div><div className="empty-title">No coupons yet</div><div className="empty-desc">Create your first coupon code</div></div>
      ) : (
        <div className="table-container">
          <table>
            <thead><tr>
              <th>CODE</th><th>TYPE</th><th>DISCOUNT</th><th>USES</th><th>EXPIRY</th><th>DESCRIPTION</th><th>ACTIONS</th>
            </tr></thead>
            <tbody>
              {coupons.map(c => {
                const expired = c.expiry_date && new Date(c.expiry_date) < new Date();
                const exhausted = c.max_uses && c.uses >= parseInt(c.max_uses);
                return (
                  <tr key={c.code}>
                    <td><span className="font-mono text-xs text-accent">{c.code}</span></td>
                    <td><span style={{fontSize:'0.72rem',padding:'2px 8px',borderRadius:999,background:c.type==='global'?'rgba(59,130,246,0.1)':'rgba(139,92,246,0.1)',color:c.type==='global'?'#3b82f6':'#8b5cf6',fontWeight:700}}>{c.type === 'global' ? '\uD83C\uDF0D Global' : `\uD83D\uDC64 ${c.target_email||'User'}`}</span></td>
                    <td style={{fontWeight:700}}>{c.discount_type==='percent'?`${c.discount_value}%`:`₹${c.discount_value}`}</td>
                    <td className="text-xs text-muted">{c.uses}/{c.max_uses||'∞'}</td>
                    <td className="text-xs" style={{color:expired?'#ef4444':'var(--text-muted)'}}>{c.expiry_date||'—'}{expired?' (Expired)':''}</td>
                    <td className="text-xs text-muted">{c.description||'—'}</td>
                    <td>
                      <div style={{display:'flex',gap:4}}>
                        <span style={{fontSize:'0.68rem',padding:'2px 6px',borderRadius:4,background:expired||exhausted?'rgba(239,68,68,0.1)':'rgba(34,197,94,0.1)',color:expired||exhausted?'#ef4444':'#22c55e',fontWeight:700}}>{expired?'Expired':exhausted?'Exhausted':'Active'}</span>
                        <button className="btn btn-sm btn-ghost" style={{color:'var(--danger)',fontSize:'0.7rem'}} onClick={()=>removeCoupon(c.code)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {saved && <div style={{position:'fixed',bottom:24,right:24,background:'#22c55e',color:'#fff',padding:'10px 18px',borderRadius:8,fontWeight:700,fontSize:'0.85rem',zIndex:9999}}>Coupons saved</div>}
    </div>
  );
}

// ── Branding Tab ────────────────────────────────────────────────────────────
function BrandingTab() {
  const load = () => { try { return JSON.parse(localStorage.getItem('sa_branding') || 'null') || {}; } catch { return {}; } };
  const [form, setForm] = useState(() => ({ platform_name: 'RecoverLab', tagline: 'Professional Data Recovery CRM', support_email: 'support@recoverlab.in', support_phone: '', logo_url: '', favicon_url: '', primary_color: '#00d4ff', accent_color: '#8b5cf6', terms_url: '', privacy_url: '', twitter_url: '', linkedin_url: '', ...load() }));
  const [saved, setSaved] = useState(false);

  const save = () => { localStorage.setItem('sa_branding', JSON.stringify(form)); setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Platform Identity</div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Platform Name</label><input className="form-input" value={form.platform_name} onChange={e => setForm(f => ({ ...f, platform_name: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Tagline</label><input className="form-input" value={form.tagline} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} /></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Logo URL</label><input className="form-input" placeholder="https://yoursite.com/logo.png" value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Favicon URL</label><input className="form-input" placeholder="https://yoursite.com/favicon.ico" value={form.favicon_url} onChange={e => setForm(f => ({ ...f, favicon_url: e.target.value }))} /></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Primary Color</label><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="color" value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))} style={{ width: 44, height: 36, padding: 2, border: '1px solid var(--border-default)', borderRadius: 6, cursor: 'pointer' }} /><input className="form-input font-mono" value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))} /></div></div>
          <div className="form-group"><label className="form-label">Accent / CTA Color</label><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="color" value={form.accent_color} onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))} style={{ width: 44, height: 36, padding: 2, border: '1px solid var(--border-default)', borderRadius: 6, cursor: 'pointer' }} /><input className="form-input font-mono" value={form.accent_color} onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))} /></div></div>
        </div>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Contact & Legal</div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Support Email</label><input type="email" className="form-input" value={form.support_email} onChange={e => setForm(f => ({ ...f, support_email: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Support Phone</label><input className="form-input" value={form.support_phone} onChange={e => setForm(f => ({ ...f, support_phone: e.target.value }))} placeholder="+91 98765 43210" /></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Terms of Service URL</label><input className="form-input" value={form.terms_url} onChange={e => setForm(f => ({ ...f, terms_url: e.target.value }))} placeholder="https://recoverlab.in/terms" /></div>
          <div className="form-group"><label className="form-label">Privacy Policy URL</label><input className="form-input" value={form.privacy_url} onChange={e => setForm(f => ({ ...f, privacy_url: e.target.value }))} placeholder="https://recoverlab.in/privacy" /></div>
        </div>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Social Links</div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Twitter / X</label><input className="form-input" value={form.twitter_url} onChange={e => setForm(f => ({ ...f, twitter_url: e.target.value }))} placeholder="https://twitter.com/recoverlab" /></div>
          <div className="form-group"><label className="form-label">LinkedIn</label><input className="form-input" value={form.linkedin_url} onChange={e => setForm(f => ({ ...f, linkedin_url: e.target.value }))} placeholder="https://linkedin.com/company/recoverlab" /></div>
        </div>
      </div>
      <div><button className="btn btn-primary" onClick={save}>{saved ? 'Saved!' : 'Save Branding Settings'}</button></div>
    </div>
  );
}

// ── SEO Tab ─────────────────────────────────────────────────────────────────
function SeoTab() {
  const load = () => { try { return JSON.parse(localStorage.getItem('sa_seo') || 'null') || {}; } catch { return {}; } };
  const [form, setForm] = useState(() => ({ meta_title: 'RecoverLab CRM — Professional Data Recovery Platform', meta_description: 'The complete SaaS CRM for data recovery labs. Manage cases, clients, inventory, billing and team with one platform.', meta_keywords: 'data recovery CRM, data recovery software, hard drive recovery tool', og_image_url: '', canonical_url: 'https://recoverlab.in', robots: 'index, follow', google_analytics_id: '', google_tag_manager_id: '', facebook_pixel_id: '', sitemap_enabled: true, schema_org_enabled: true, ...load() }));
  const [saved, setSaved] = useState(false);
  const save = () => { localStorage.setItem('sa_seo', JSON.stringify(form)); setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const charCount = (str, max) => ({ color: (str || '').length > max ? '#ef4444' : (str || '').length > max * 0.9 ? '#f59e0b' : 'var(--text-muted)', text: `${(str || '').length}/${max}` });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Core Meta Tags</div>
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><label className="form-label">Meta Title</label><span style={{ fontSize: '0.7rem', ...charCount(form.meta_title, 60) }}>{charCount(form.meta_title, 60).text}</span></div>
          <input className="form-input" value={form.meta_title} onChange={e => setForm(f => ({ ...f, meta_title: e.target.value }))} />
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>Appears in browser tab and search results. Ideal: 50–60 characters.</div>
        </div>
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><label className="form-label">Meta Description</label><span style={{ fontSize: '0.7rem', ...charCount(form.meta_description, 160) }}>{charCount(form.meta_description, 160).text}</span></div>
          <textarea className="form-textarea" style={{ minHeight: 70 }} value={form.meta_description} onChange={e => setForm(f => ({ ...f, meta_description: e.target.value }))} />
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>Shown in search engine results. Ideal: 150–160 characters.</div>
        </div>
        <div className="form-group"><label className="form-label">Keywords (comma-separated)</label><input className="form-input" value={form.meta_keywords} onChange={e => setForm(f => ({ ...f, meta_keywords: e.target.value }))} /></div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Canonical URL</label><input className="form-input font-mono" value={form.canonical_url} onChange={e => setForm(f => ({ ...f, canonical_url: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">OG Image URL</label><input className="form-input" placeholder="https://yoursite.com/og-image.png" value={form.og_image_url} onChange={e => setForm(f => ({ ...f, og_image_url: e.target.value }))} /></div>
        </div>
        <div className="form-group"><label className="form-label">Robots Directive</label>
          <select className="form-select" value={form.robots} onChange={e => setForm(f => ({ ...f, robots: e.target.value }))}>
            <option value="index, follow">index, follow (recommended)</option>
            <option value="noindex, follow">noindex, follow</option>
            <option value="index, nofollow">index, nofollow</option>
            <option value="noindex, nofollow">noindex, nofollow</option>
          </select>
        </div>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Analytics & Tracking</div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Google Analytics ID</label><input className="form-input font-mono" placeholder="G-XXXXXXXXXX" value={form.google_analytics_id} onChange={e => setForm(f => ({ ...f, google_analytics_id: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Google Tag Manager ID</label><input className="form-input font-mono" placeholder="GTM-XXXXXXX" value={form.google_tag_manager_id} onChange={e => setForm(f => ({ ...f, google_tag_manager_id: e.target.value }))} /></div>
        </div>
        <div className="form-group"><label className="form-label">Facebook Pixel ID</label><input className="form-input font-mono" placeholder="1234567890123456" value={form.facebook_pixel_id} onChange={e => setForm(f => ({ ...f, facebook_pixel_id: e.target.value }))} /></div>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Advanced SEO</div>
        {[['sitemap_enabled', 'Auto-generate XML Sitemap', 'Generates /sitemap.xml automatically'], ['schema_org_enabled', 'Schema.org Structured Data', 'Adds JSON-LD for rich snippets in search results']].map(([key, label, desc]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', marginBottom: 8 }}>
            <input type="checkbox" checked={!!form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} style={{ accentColor: 'var(--accent-primary)', width: 16, height: 16 }} />
            <div><div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{label}</div><div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{desc}</div></div>
          </label>
        ))}
      </div>
      <div><button className="btn btn-primary" onClick={save}>{saved ? 'Saved!' : 'Save SEO Settings'}</button></div>
    </div>
  );
}

// ── Homepage Tab ─────────────────────────────────────────────────────────────
function HomepageTab() {
  const load = () => { try { return JSON.parse(localStorage.getItem('sa_homepage') || 'null') || {}; } catch { return {}; } };
  const [form, setForm] = useState(() => ({
    hero_title: 'The Complete CRM for Data Recovery Labs',
    hero_subtitle: 'Manage cases, clients, billing and team — all in one place.',
    hero_cta_text: 'Start Free Trial',
    hero_cta_url: '/signup',
    hero_secondary_cta: 'View Demo',
    announcement_enabled: false,
    announcement_text: 'New: WhatsApp notifications now available!',
    announcement_color: '#3b82f6',
    show_pricing_section: true,
    show_features_section: true,
    show_testimonials: true,
    show_faq: true,
    features: [
      { icon: '', title: 'Case Management', desc: 'Full lifecycle tracking from intake to delivery' },
      { icon: '', title: 'Billing & Invoicing', desc: 'Auto-generate invoices, quotations and receipts' },
      { icon: '', title: 'Inventory & Donors', desc: 'Smart matching of donor drives to active cases' },
    ],
    footer_copyright: `© ${new Date().getFullYear()} RecoverLab. All rights reserved.`,
    ...load(),
  }));
  const [saved, setSaved] = useState(false);
  const save = () => { localStorage.setItem('sa_homepage', JSON.stringify(form)); setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Announcement Banner */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="card-title" style={{ margin: 0 }}>📢 Announcement Banner</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem' }}>
            <input type="checkbox" checked={form.announcement_enabled} onChange={e => setForm(f => ({ ...f, announcement_enabled: e.target.checked }))} style={{ accentColor: 'var(--accent-primary)' }} />
            Enable Banner
          </label>
        </div>
        {form.announcement_enabled && (
          <div style={{ padding: '10px 14px', background: form.announcement_color + '22', border: `1px solid ${form.announcement_color}44`, borderRadius: 'var(--radius-md)', marginBottom: 12, fontSize: '0.82rem', fontWeight: 600, color: form.announcement_color }}>
            Preview: {form.announcement_text}
          </div>
        )}
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Banner Text</label><input className="form-input" value={form.announcement_text} onChange={e => setForm(f => ({ ...f, announcement_text: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Banner Color</label><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="color" value={form.announcement_color} onChange={e => setForm(f => ({ ...f, announcement_color: e.target.value }))} style={{ width: 44, height: 36, padding: 2, border: '1px solid var(--border-default)', borderRadius: 6, cursor: 'pointer' }} /><span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{form.announcement_color}</span></div></div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Hero Section</div>
        <div className="form-group"><label className="form-label">Hero Title</label><input className="form-input" value={form.hero_title} onChange={e => setForm(f => ({ ...f, hero_title: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Hero Subtitle</label><textarea className="form-textarea" style={{ minHeight: 60 }} value={form.hero_subtitle} onChange={e => setForm(f => ({ ...f, hero_subtitle: e.target.value }))} /></div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Primary CTA Button Text</label><input className="form-input" value={form.hero_cta_text} onChange={e => setForm(f => ({ ...f, hero_cta_text: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Primary CTA URL</label><input className="form-input font-mono" value={form.hero_cta_url} onChange={e => setForm(f => ({ ...f, hero_cta_url: e.target.value }))} /></div>
        </div>
        <div className="form-group"><label className="form-label">Secondary CTA Text (optional)</label><input className="form-input" value={form.hero_secondary_cta} onChange={e => setForm(f => ({ ...f, hero_secondary_cta: e.target.value }))} /></div>
      </div>

      {/* Section Visibility */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Section Visibility</div>
        {[['show_pricing_section', 'Pricing / Plans Section'], ['show_features_section', 'Features Grid Section'], ['show_testimonials', 'Testimonials Section'], ['show_faq', 'FAQ Section']].map(([key, label]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', marginBottom: 6 }}>
            <input type="checkbox" checked={!!form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} style={{ accentColor: 'var(--accent-primary)', width: 15, height: 15 }} />
            <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{label}</span>
          </label>
        ))}
      </div>

      {/* Features */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Feature Cards</div>
        {form.features.map((feat, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr auto', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label" style={{ fontSize: '0.68rem' }}>Icon</label><input className="form-input" value={feat.icon} onChange={e => { const ff = [...form.features]; ff[idx] = { ...ff[idx], icon: e.target.value }; setForm(f => ({ ...f, features: ff })); }} /></div>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label" style={{ fontSize: '0.68rem' }}>Title</label><input className="form-input" value={feat.title} onChange={e => { const ff = [...form.features]; ff[idx] = { ...ff[idx], title: e.target.value }; setForm(f => ({ ...f, features: ff })); }} /></div>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label" style={{ fontSize: '0.68rem' }}>Description</label><input className="form-input" value={feat.desc} onChange={e => { const ff = [...form.features]; ff[idx] = { ...ff[idx], desc: e.target.value }; setForm(f => ({ ...f, features: ff })); }} /></div>
            <button onClick={() => setForm(f => ({ ...f, features: f.features.filter((_, i) => i !== idx) }))} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 6, padding: '7px 10px', cursor: 'pointer', marginBottom: 0 }}>Remove</button>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, features: [...f.features, { icon: '⭐', title: 'New Feature', desc: 'Describe this feature' }] }))}>Add Feature Card</button>
      </div>

      <div className="form-group"><label className="form-label">Footer Copyright Text</label><input className="form-input" value={form.footer_copyright} onChange={e => setForm(f => ({ ...f, footer_copyright: e.target.value }))} /></div>
      <div><button className="btn btn-primary" onClick={save}>{saved ? 'Saved!' : 'Save Homepage Settings'}</button></div>
    </div>
  );
}

// ── Invoices Tab ─────────────────────────────────────────────────────────────
function InvoicesTab({ purchases, tenants }) {
  const load = () => { try { return JSON.parse(localStorage.getItem('sa_invoice_settings') || 'null') || {}; } catch { return {}; } };
  const [settings, setSettings] = useState(() => ({ auto_send: true, auto_activate_tenant: true, from_email: 'billing@recoverlab.in', from_name: 'RecoverLab Billing', subject_template: 'Your {{plan_label}} Plan Invoice — {{invoice_number}}', body_intro: 'Thank you for subscribing to RecoverLab CRM. Please find your invoice details below.', include_pdf: true, gst_percent: 18, invoice_prefix: 'RCL-INV', company_gstin: '', ...load() }));
  const [saved, setSaved] = useState(false);
  const save = () => { localStorage.setItem('sa_invoice_settings', JSON.stringify(settings)); setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const invoices = purchases.filter(p => p.status === 'success').map((p, i) => ({
    ...p,
    invoice_number: `${settings.invoice_prefix}-${String(i + 1).padStart(4, '0')}`,
    gst_amount: Math.round((p.amount || 0) * (settings.gst_percent || 18) / 100),
    total_with_gst: Math.round((p.amount || 0) * (1 + (settings.gst_percent || 18) / 100)),
  }));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Settings */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>📄 Invoice & Auto-Activation Settings</div>
        <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
          {[['auto_send', 'Auto-send invoice email on payment success'], ['auto_activate_tenant', 'Auto-activate subscriber account on payment'], ['include_pdf', 'Attach PDF invoice to email']].map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <input type="checkbox" checked={!!settings[key]} onChange={e => setSettings(s => ({ ...s, [key]: e.target.checked }))} style={{ accentColor: 'var(--accent-primary)', width: 16, height: 16 }} />
              <div><div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{label}</div></div>
            </label>
          ))}
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">From Email</label><input type="email" className="form-input" value={settings.from_email} onChange={e => setSettings(s => ({ ...s, from_email: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">From Name</label><input className="form-input" value={settings.from_name} onChange={e => setSettings(s => ({ ...s, from_name: e.target.value }))} /></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Invoice Number Prefix</label><input className="form-input font-mono" value={settings.invoice_prefix} onChange={e => setSettings(s => ({ ...s, invoice_prefix: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">GST % (applied to invoice)</label><input type="number" className="form-input" value={settings.gst_percent} onChange={e => setSettings(s => ({ ...s, gst_percent: parseFloat(e.target.value) || 0 }))} min={0} max={28} /></div>
        </div>
        <div className="form-group"><label className="form-label">Company GSTIN (printed on invoice)</label><input className="form-input font-mono" value={settings.company_gstin} onChange={e => setSettings(s => ({ ...s, company_gstin: e.target.value }))} placeholder="27AABCT1332L1ZX" /></div>
        <div className="form-group"><label className="form-label">Email Subject Template</label><input className="form-input" value={settings.subject_template} onChange={e => setSettings(s => ({ ...s, subject_template: e.target.value }))} /><div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>Variables: {'{{plan_label}}'}, {'{{invoice_number}}'}, {'{{tenant_name}}'}, {'{{amount}}'}</div></div>
        <div className="form-group"><label className="form-label">Email Body Introduction</label><textarea className="form-textarea" style={{ minHeight: 70 }} value={settings.body_intro} onChange={e => setSettings(s => ({ ...s, body_intro: e.target.value }))} /></div>
        <button className="btn btn-primary" onClick={save}>{saved ? 'Saved!' : 'Save Invoice Settings'}</button>
      </div>

      {/* Invoice list */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="card-title" style={{ margin: 0 }}>📄 Generated Invoices ({invoices.length})</div>
          {invoices.length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => alert('In production: exports all invoices as ZIP with PDFs')}>Export All</button>}
        </div>
        {invoices.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}><div className="empty-icon">📭</div><div className="empty-title">No paid subscriptions yet</div><div className="empty-desc">Invoices are auto-generated when Razorpay payment.captured webhook fires</div></div>
        ) : (
          <div className="table-container">
            <table>
              <thead><tr><th>Invoice #</th><th>Subscriber</th><th>Plan</th><th>Amount</th><th>GST ({settings.gst_percent}%)</th><th>Total</th><th>Date</th><th>Actions</th></tr></thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td><span className="font-mono text-xs text-accent">{inv.invoice_number}</span></td>
                    <td><div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{inv.tenant_name}</div><div className="text-xs text-muted">{inv.tenant_email}</div></td>
                    <td><span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 999, background: 'rgba(0,212,255,0.1)', color: 'var(--accent-primary)', fontWeight: 700 }}>{inv.plan_label || inv.plan}</span></td>
                    <td className="font-mono">₹{(inv.amount || 0).toLocaleString('en-IN')}</td>
                    <td className="font-mono text-xs text-muted">₹{inv.gst_amount.toLocaleString('en-IN')}</td>
                    <td className="font-mono" style={{ fontWeight: 800 }}>₹{inv.total_with_gst.toLocaleString('en-IN')}</td>
                    <td className="text-xs text-muted">{inv.timestamp ? new Date(inv.timestamp).toLocaleDateString('en-IN') : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => alert(`[Demo] Invoice ${inv.invoice_number} PDF download\n\nSubscriber: ${inv.tenant_name}\nAmount: ₹${inv.total_with_gst.toLocaleString('en-IN')} (incl. ${settings.gst_percent}% GST)\nRazorpay ID: ${inv.razorpay_payment_id || '—'}`)}>📄 PDF</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => alert(`[Demo] Resending invoice to ${inv.tenant_email}`)}>📄 Resend</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SA Accounts Tab ──────────────────────────────────────────────────────────
function AccountsTab() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'support_admin', permissions: 'view_only' });
  const [saved, setSaved] = useState(false);

  const reload = useCallback(() => {
    saApi.get('/accounts').then(d => { setAccounts(d.accounts || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const addAccount = async () => {
    if (!form.name || !form.email) { alert('Name and email required'); return; }
    const res = await saApi.post('/accounts', form);
    if (res.error) { alert(res.error); return; }
    setForm({ name: '', email: '', password: '', role: 'support_admin', permissions: 'view_only' });
    setShowAdd(false);
    setSaved(true); setTimeout(() => setSaved(false), 1500);
    reload();
  };

  const ROLE_LABELS = { super_admin: 'Super Admin', support_admin: 'Support Admin', billing_admin: 'Billing Admin', content_admin: 'Content Admin' };
  const PERM_LABELS = { full: 'Full Access', billing_only: 'Billing Only', view_only: 'View Only' };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Super Admin Accounts</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>Manage platform-level admin accounts. Each account can have different access scopes.</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(!showAdd)}>+ Add Account</button>
      </div>

      {showAdd && (
        <div className="card" style={{ border: '1px solid var(--accent-primary)' }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>New Super Admin Account</div>
          <div className="form-row form-row-2">
            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Full Name</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Email</label><input type="email" className="form-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          </div>
          <div className="form-row form-row-2" style={{ marginTop: 10 }}>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Password</label><input type="password" className="form-input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label">Role</label>
              <select className="form-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 10 }}><label className="form-label">Access Level</label>
            <select className="form-select" value={form.permissions} onChange={e => setForm(f => ({ ...f, permissions: e.target.value }))}>
              {Object.entries(PERM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={addAccount}>Create Account</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} /></div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {accounts.map(acc => (
            <div key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', opacity: acc.is_active ? 1 : 0.5 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(0,212,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', border: '2px solid rgba(0,212,255,0.2)' }}>
                {acc.role ? acc.role[0].toUpperCase() : ''}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{acc.name}</span>
                  <span style={{ fontSize: '0.65rem', padding: '1px 7px', borderRadius: 999, background: 'rgba(0,212,255,0.1)', color: 'var(--accent-primary)', fontWeight: 700 }}>{ROLE_LABELS[acc.role] || acc.role}</span>
                  <span style={{ fontSize: '0.65rem', padding: '1px 7px', borderRadius: 999, background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', fontWeight: 700 }}>{PERM_LABELS[acc.permissions] || acc.permissions}</span>
                  {!acc.is_active && <span style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: 999, background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>INACTIVE</span>}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{acc.email} · Last login: {acc.last_login ? new Date(acc.last_login).toLocaleDateString('en-IN') : 'Never'}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {acc.role !== 'super_admin' && (
                  <>
                    <button className="btn btn-sm btn-secondary" onClick={async () => { const res = await saApi.patch(`/accounts/${acc.id}`, { is_active: !acc.is_active }); if (!res.error) reload(); }}>
                      {acc.is_active ? '\u23F8 Deactivate' : '\u25B6 Activate'}
                    </button>
                    <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)', fontSize: '0.72rem' }} onClick={async () => { if (!confirm(`Delete ${acc.name}?`)) return; const res = await saApi.del(`/accounts/${acc.id}`); if (!res.error) reload(); }}>Delete</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {saved && <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#22c55e', color: '#fff', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', zIndex: 9999 }}>Saved</div>}
    </div>
  );
}

// ── Activity Logs Tab ────────────────────────────────────────────────────────
function ActivityLogsTab() {
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [userMatches, setUserMatches] = useState([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userLogs, setUserLogs] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const SEV_COLORS = { success: '#10b981', info: 'var(--accent-primary)', warn: '#f59e0b', danger: '#ef4444' };

  const buildQuery = (opts = {}) => {
    const params = new URLSearchParams();
    const currentPage = opts.page ?? page;
    const currentLimit = opts.limit ?? limit;
    const query = opts.q ?? searchTerm;
    const action = opts.action ?? actionFilter;

    if (query) params.set('q', query);
    if (action) params.set('action', action);
    params.set('page', currentPage);
    params.set('limit', currentLimit);
    return params.toString() ? `?${params.toString()}` : '';
  };

  const loadLogs = async ({ page: p = 1, limit: l = 50, q = '', action = '' } = {}) => {
    setLogsLoading(true);
    try {
      const queryString = buildQuery({ page: p, limit: l, q, action });
      const d = await saApi.get(`/audit-logs${queryString}`);
      const normalized = (d.logs || []).map(r => ({
        id: r.id || r.request_id || Math.random().toString(36).slice(2, 9),
        action: r.action || r.title || '',
        detail: r.description || r.detail || r.title || '',
        user: r.full_name || r.username || r.user_name || r.user || 'System',
        at: r.created_at || r.at || new Date().toISOString(),
        severity: r.severity || 'info',
      }));
      setLogs(normalized);
      setTotal(d.total || 0);
      setPages(d.pages || Math.max(1, Math.ceil((d.total || normalized.length) / l)));
      setPage(p);
      setLimit(l);
    } catch (e) {
      console.error('Failed to load audit logs', e && e.message);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs({ page: 1, limit: 50, q: '', action: '' });
  }, []);

  // Search users by name/email (super-admin helper)
  const searchUsers = async (q) => {
    if (!q || !q.trim()) return setUserMatches([]);
    setUserLoading(true);
    try {
      const res = await saApi.get(`/users/search?name=${encodeURIComponent(q.trim())}`);
      setUserMatches(res.users || []);
    } catch (e) {
      console.error('User search failed', e && e.message);
      setUserMatches([]);
    } finally {
      setUserLoading(false);
    }
  };

  const fetchUserLogs = async (user) => {
    if (!user) return;
    setSelectedUser(user);
    setUserLoading(true);
    try {
      const res = await saApi.get(`/audit-logs?user_id=${encodeURIComponent(user.id)}&limit=500`);
      setUserLogs(res.logs || []);
    } catch (e) {
      console.error('Failed to fetch user logs', e && e.message);
      setUserLogs([]);
    } finally {
      setUserLoading(false);
    }
  };

  const exportUserLogsPdf = (user) => {
    const rows = userLogs || [];
    if (!rows.length) { alert('No logs to export for this user'); return; }
    const title = `Activity logs - ${user.full_name || user.username || user.email}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;padding:20px}h1{font-size:18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;font-size:12px}th{background:#f4f4f4}</style>
      </head><body><h1>${title}</h1><table><thead><tr><th>Timestamp</th><th>Action</th><th>Detail</th><th>Module</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${new Date(r.created_at || r.at || r.at).toLocaleString()}</td><td>${(r.action||r.action||'')}</td><td>${(r.description||r.detail||r.detail||'')}</td><td>${r.module||r.resource_type||''}</td></tr>`).join('')}
      </tbody></table></body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Popup blocked. Allow popups to export PDF.'); return; }
    w.document.write(html);
    w.document.close();
    // Give the window a moment to render
    setTimeout(() => w.print(), 500);
  };

  const handleApplyFilters = () => {
    const nextPage = 1;
    setPage(nextPage);
    loadLogs({ page: nextPage, limit, q: searchTerm, action: actionFilter });
  };

  const handleLimitChange = (value) => {
    const nextPage = 1;
    setLimit(value);
    setPage(nextPage);
    loadLogs({ page: nextPage, limit: value, q: searchTerm, action: actionFilter });
  };

  const goToPage = (pageNumber) => {
    if (pageNumber === page || logsLoading) return;
    setPage(pageNumber);
    loadLogs({ page: pageNumber, limit, q: searchTerm, action: actionFilter });
  };

  const pageButtons = React.useMemo(() => {
    const visible = [];
    const left = Math.max(1, page - 2);
    const right = Math.min(pages, page + 2);

    if (left > 1) {
      visible.push(1);
      if (left > 2) visible.push('start-ellipsis');
    }

    for (let i = left; i <= right; i += 1) {
      visible.push(i);
    }

    if (right < pages) {
      if (right < pages - 1) visible.push('end-ellipsis');
      visible.push(pages);
    }

    return visible;
  }, [page, pages]);

  const stats = React.useMemo(() => {
    const totalLogs = total;
    const byAction = logs.reduce((acc, cur) => { acc[cur.action] = (acc[cur.action] || 0) + 1; return acc; }, {});
    const topAction = Object.entries(byAction).sort((a, b) => b[1] - a[1])[0] || ['—', 0];
    const last24 = logs.filter(l => new Date(l.at) > Date.now() - 24 * 3600 * 1000).length;
    return { totalLogs, topAction: topAction[0], last24 };
  }, [logs, total]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 220 }}>
          <input className="search-input" placeholder="Search logs (action, detail, user)" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>

        <select className="form-select" style={{ width: 'auto' }} value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
          <option value="">All Events</option>
          <option value="TENANT">Subscriber Events</option>
          <option value="PAYMENT">Payment Events</option>
          <option value="PLAN">Plan Changes</option>
          <option value="LOGIN">Login Events</option>
          <option value="COUPON">Coupon Events</option>
        </select>

        <button className="btn btn-secondary btn-sm" onClick={handleApplyFilters}>Filter</button>
        <button className="btn btn-secondary btn-sm" onClick={() => loadLogs({ page: 1, limit, q: searchTerm, action: actionFilter })}>Refresh</button>
        <button className="btn btn-secondary btn-sm" onClick={() => { window.location.href = `${BASE_URL}/super-admin/audit-logs/export${buildQuery({ page, limit, q: searchTerm, action: actionFilter })}`; }}>Export CSV</button>
      </div>

      {/* User-specific search & PDF export (below filters) */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        <input className="form-input" placeholder="Search user by name or email" value={userQuery} onChange={e => { setUserQuery(e.target.value); }} style={{ minWidth: 220 }} />
        <button className="btn btn-primary btn-sm" onClick={() => searchUsers(userQuery)} disabled={userLoading}>{userLoading ? 'Searching...' : 'Find User'}</button>
        {userMatches.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {userMatches.slice(0,5).map(u => (
              <button key={u.id} className="btn btn-sm" style={{ fontSize: '0.78rem' }} onClick={() => fetchUserLogs(u)} title={u.email || ''}>
                Go: {u.full_name || u.username || u.email}
              </button>
            ))}
          </div>
        )}
        {selectedUser && (
          <>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginLeft: 8 }}>Selected: <strong>{selectedUser.full_name || selectedUser.username || selectedUser.email}</strong></div>
            <button className="btn btn-secondary btn-sm" onClick={() => exportUserLogsPdf(selectedUser)}>Export PDF</button>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: 12, minWidth: 160 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Logs</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{stats.totalLogs}</div>
        </div>
        <div className="card" style={{ padding: 12, minWidth: 160 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Last 24h</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{stats.last24}</div>
        </div>
        <div className="card" style={{ padding: 12, minWidth: 220 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Top Action</div>
          <div style={{ fontSize: '1rem', fontWeight: 700 }}>{stats.topAction} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>·</span></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Showing page {page} of {pages} ({logs.length} records on this page)</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Rows per page</label>
          <select className="form-select" style={{ width: 110 }} value={limit} onChange={e => handleLimitChange(Number(e.target.value))}>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {logsLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} /></div>
      ) : logs.length === 0 ? (
        <div className="empty-state" style={{ padding: 30 }}><div className="empty-icon"></div><div className="empty-title">No log entries</div><div className="empty-desc">Platform activity will appear here</div></div>
      ) : null}

      <div style={{ display: 'grid', gap: 8 }}>
        {!logsLoading && logs.map(log => (
          <div key={log.id} className="sa-activity-card" style={{ display: 'flex', gap: 14, padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderLeft: `4px solid ${SEV_COLORS[log.severity]}`, borderRadius: 'var(--radius-md)', alignItems: 'center' }}>
            <div style={{ minWidth: 12, display: 'flex', alignItems: 'flex-start', paddingTop: 2 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: SEV_COLORS[log.severity] }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: '0.78rem', padding: '3px 8px', borderRadius: 6, background: `${SEV_COLORS[log.severity]}15`, color: SEV_COLORS[log.severity], fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{log.action}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>by <strong>{log.user}</strong></span>
              </div>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>{log.detail}</div>
            </div>
            <div style={{ textAlign: 'right', minWidth: 145 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{fmtDate(log.at)}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>{fmtTime(log.at)}</div>
            </div>
          </div>
        ))}
      </div>

      {selectedUser && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Activity — {selectedUser.full_name || selectedUser.username || selectedUser.email}</div>
          {userLoading ? (
            <div style={{ textAlign: 'center', padding: 20 }}><div className="spinner" style={{ width: 20, height: 20, margin: '0 auto' }} /></div>
          ) : userLogs.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}><div className="empty-desc">No activity logs for this user</div></div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {userLogs.map(l => (
                <div key={l.id || l.request_id || Math.random()} className="sa-activity-card" style={{ display: 'flex', gap: 14, padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderLeft: `4px solid ${SEV_COLORS[l.severity || 'info']}`, borderRadius: 'var(--radius-md)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{l.action || l.title}</div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{l.description || l.detail || l.title}</div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 140 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{fmtDate(l.created_at || l.at)}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>{fmtTime(l.created_at || l.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        {pageButtons.map(pageNumber => (
          pageNumber === 'start-ellipsis' || pageNumber === 'end-ellipsis' ? (
            <span key={pageNumber} style={{ padding: '0 10px', color: 'var(--text-muted)' }}>…</span>
          ) : (
            <button
              key={pageNumber}
              className="btn btn-sm"
              style={{ minWidth: 36, fontWeight: pageNumber === page ? 700 : 500, background: pageNumber === page ? 'var(--accent-primary)' : 'var(--bg-card)', color: pageNumber === page ? '#fff' : 'var(--text-primary)' }}
              onClick={() => goToPage(pageNumber)}
              disabled={logsLoading}
            >
              {pageNumber}
            </button>
          )
        ))}
      </div>
    </div>
  );
}

// ── Platform Tab ─────────────────────────────────────────────────────────────
function PlatformTab() {
  const load = () => { try { return JSON.parse(localStorage.getItem('sa_platform') || 'null') || {}; } catch { return {}; } };
  const [form, setForm] = useState(() => ({ trial_days: 14, auto_suspend_days: 7, maintenance_mode: false, maintenance_message: 'We are performing scheduled maintenance. Back soon!', max_file_upload_mb: 100, smtp_host: '', smtp_port: '587', smtp_user: '', smtp_pass: '', smtp_from: 'noreply@recoverlab.in', ...load() }));
  const [saved, setSaved] = useState(false);
  const save = () => { localStorage.setItem('sa_platform', JSON.stringify(form)); setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const health = [
    { label: 'API Server', status: 'operational', uptime: '99.97%' },
    { label: 'Database', status: 'operational', uptime: '99.99%' },
    { label: 'File Storage', status: 'operational', uptime: '99.95%' },
    { label: 'Email (SMTP)', status: form.smtp_host ? 'configured' : 'not_configured', uptime: form.smtp_host ? '—' : '—' },
    { label: 'Razorpay Webhook', status: localStorage.getItem('sa_rzp_verified') === 'true' ? 'verified' : 'not_verified', uptime: '—' },
  ];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* System Health */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>System Health</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {health.map(h => (
            <div key={h.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{h.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {h.uptime !== '—' && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{h.uptime} uptime</span>}
                <span style={{ fontSize: '0.68rem', padding: '2px 10px', borderRadius: 999, fontWeight: 700,
                  background: h.status === 'operational' || h.status === 'verified' || h.status === 'configured' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                  color: h.status === 'operational' || h.status === 'verified' || h.status === 'configured' ? '#10b981' : '#f59e0b',
                }}>{h.status.replace(/_/g, ' ').toUpperCase()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Maintenance Mode */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="card-title" style={{ margin: 0 }}>Maintenance Mode</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.maintenance_mode} onChange={e => setForm(f => ({ ...f, maintenance_mode: e.target.checked }))} style={{ accentColor: '#f59e0b', width: 16, height: 16 }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: form.maintenance_mode ? '#f59e0b' : 'var(--text-muted)' }}>{form.maintenance_mode ? 'Enabled' : 'Disabled'}</span>
          </label>
        </div>
        {form.maintenance_mode && <div className="form-group"><label className="form-label">Maintenance Message</label><textarea className="form-textarea" style={{ minHeight: 60 }} value={form.maintenance_message} onChange={e => setForm(f => ({ ...f, maintenance_message: e.target.value }))} /></div>}
      </div>

      {/* Tenant Limits */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Default Limits for New Subscribers</div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Trial Duration (days)</label><input type="number" className="form-input" value={form.trial_days} onChange={e => setForm(f => ({ ...f, trial_days: parseInt(e.target.value) || 14 }))} min={1} max={90} /></div>
          <div className="form-group"><label className="form-label">Auto-suspend after expiry (days)</label><input type="number" className="form-input" value={form.auto_suspend_days} onChange={e => setForm(f => ({ ...f, auto_suspend_days: parseInt(e.target.value) || 7 }))} min={0} max={30} /></div>
        </div>
        <div className="form-group"><label className="form-label">Max File Upload Size (MB)</label><input type="number" className="form-input" value={form.max_file_upload_mb} onChange={e => setForm(f => ({ ...f, max_file_upload_mb: parseInt(e.target.value) || 100 }))} min={1} max={500} /></div>
      </div>

      {/* SMTP / Email */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>📧 SMTP Email Configuration</div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">SMTP Host</label><input className="form-input font-mono" value={form.smtp_host} onChange={e => setForm(f => ({ ...f, smtp_host: e.target.value }))} placeholder="smtp.gmail.com" /></div>
          <div className="form-group"><label className="form-label">SMTP Port</label><input className="form-input font-mono" value={form.smtp_port} onChange={e => setForm(f => ({ ...f, smtp_port: e.target.value }))} placeholder="587" /></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">SMTP Username</label><input className="form-input" value={form.smtp_user} onChange={e => setForm(f => ({ ...f, smtp_user: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">SMTP Password</label><input type="password" className="form-input" value={form.smtp_pass} onChange={e => setForm(f => ({ ...f, smtp_pass: e.target.value }))} /></div>
        </div>
        <div className="form-group"><label className="form-label">From Email Address</label><input type="email" className="form-input" value={form.smtp_from} onChange={e => setForm(f => ({ ...f, smtp_from: e.target.value }))} /></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={save}>{saved ? 'Saved!' : 'Save Platform Settings'}</button>
          <button className="btn btn-secondary" onClick={() => alert('[Demo] Test email sent to ' + form.smtp_from)}>📧 Send Test Email</button>
        </div>
      </div>
    </div>
  );
}

// ── Stat Card (Premium) ────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }) {
  const isNumeric = typeof value === 'number' || /^[₹\d,.\s]+$/.test(String(value));
  return (
    <div className="sa-stat-card" style={{ '--sa-stat-color': color }}>
      <div className="sa-stat-glow" style={{ background: color }} />
      <div className="sa-stat-icon" style={{ color }}>{icon}</div>
      <div className="sa-stat-label">{label}</div>
      <div className={`sa-stat-value${isNumeric ? ' sa-stat-numeric' : ''}`}>{value}</div>
      {sub && <div className="sa-stat-sub">{sub}</div>}
    </div>
  );
}

// ── Dashboard Tab ──────────────────────────────────────────────────────────
function DashboardTab({ tenants, stats, onAddTenant }) {
  const plans = getPlans();
  const SEV_COLORS = { success:'#10b981', info:'var(--accent-primary)', warn:'#f59e0b', danger:'#ef4444' };
  const recentActivity = [
    { action:'TENANT_CREATED', detail:'Created tenant "DataRescue Mumbai"',  severity:'info',    at: new Date(Date.now()-3600000).toISOString() },
    { action:'PAYMENT_RECEIVED', detail:'Payment ₹2,499 received from "HardDrive Pros"', severity:'success', at: new Date(Date.now()-43200000).toISOString() },
    { action:'PLAN_CHANGED', detail:'Changed plan for "TechLab Delhi" → Professional', severity:'warn', at: new Date(Date.now()-86400000).toISOString() },
    { action:'TENANT_SUSPENDED', detail:'Suspended "OldLab Chennai" (non-payment)', severity:'danger', at: new Date(Date.now()-172800000).toISOString() },
    { action:'BRANDING_UPDATED', detail:'Platform branding settings updated', severity:'info', at: new Date(Date.now()-259200000).toISOString() },
  ];
  const health = [
    { label:'API Server',        status:'operational' },
    { label:'Database',          status:'operational' },
    { label:'File Storage',      status:'operational' },
    { label:'Email (SMTP)',      status: localStorage.getItem('sa_smtp_host') ? 'configured' : 'not_configured' },
    { label:'Razorpay Webhook',  status: localStorage.getItem('sa_rzp_verified') === 'true' ? 'verified' : 'not_configured' },
  ];
  const planRevenue = plans.map(p => ({ ...p, count: tenants.filter(t => t.plan === p.key && t.status === 'active').length }));
  const maxRev = Math.max(...planRevenue.map(p => p.price * p.count), 1);

  const timeAgo = (iso) => {
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 3600)  return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86400)}d ago`;
  };

  const statIcons = {
    tenants: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    active:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
    expiring:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    mrr:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
    plan:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  };

  return (
    <div>
      {/* KPI Row */}
      <div className="sa-stats-grid" style={{ marginBottom: 20 }}>
        <StatCard icon={statIcons.tenants}  label="Total Subscribers"   value={stats.total}  color="#00d4ff" />
        <StatCard icon={statIcons.active}   label="Active Subscribers"  value={stats.active} sub={`${stats.trial} on trial`} color="#10b981" />
        <StatCard icon={statIcons.expiring} label="Expiring Soon"   value={stats.expiringSoon} sub="Next 14 days" color="#f59e0b" />
        <StatCard icon={statIcons.mrr}      label="Monthly Revenue" value={`₹${stats.mrr.toLocaleString('en-IN')}`} sub="Active MRR" color="#8b5cf6" />
        <StatCard icon={statIcons.plan}     label="Top Plan"        value={stats.active ? (plans.find(p => p.key === tenants.filter(t => t.status==='active')[0]?.plan)?.label || '—') : '—'} color="#3b82f6" />
      </div>

      <div className="sa-dash-grid">
        {/* Left Column */}
        <div>
          {/* Revenue by Plan */}
          <div className="sa-panel" style={{ marginBottom: 16 }}>
            <div className="sa-panel-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              Revenue by Plan
            </div>
            {planRevenue.map(p => (
              <div key={p.key} className="sa-rev-bar-wrap">
                <div className="sa-rev-bar-head">
                  <span className="sa-rev-bar-label">{p.label} <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>({p.count} subscribers)</span></span>
                  <span className="sa-rev-bar-val">₹{(p.price * p.count).toLocaleString('en-IN')}</span>
                </div>
                <div className="sa-rev-bar-track">
                  <div className="sa-rev-bar-fill" style={{ width: `${((p.price * p.count) / maxRev) * 100}%`, background: p.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* Recent Activity */}
          <div className="sa-panel">
            <div className="sa-panel-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              Recent Activity
            </div>
            {recentActivity.map((log, i) => (
              <div key={i} className="sa-activity-item">
                <div className="sa-activity-dot" style={{ background: SEV_COLORS[log.severity] }} />
                <div style={{ flex: 1 }}>
                  <span className="sa-activity-action" style={{ background: `${SEV_COLORS[log.severity]}18`, color: SEV_COLORS[log.severity] }}>{log.action}</span>
                  <div className="sa-activity-detail">{log.detail}</div>
                  <div className="sa-activity-time">{timeAgo(log.at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column */}
        <div>
          {/* Quick Actions */}
          <div className="sa-panel" style={{ marginBottom: 16 }}>
            <div className="sa-panel-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Quick Actions
            </div>
            <div className="sa-quick-actions">
              {[
                { label: 'New Subscriber',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>, action: onAddTenant },
                { label: 'Add Plan',    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, action: () => { sessionStorage.setItem('sa_active_tab', 'plans'); window.dispatchEvent(new Event('storage')); } },
                { label: 'Add Coupon', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>, action: () => { sessionStorage.setItem('sa_active_tab', 'coupons'); window.dispatchEvent(new Event('storage')); } },
                { label: 'View Logs',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>, action: () => { sessionStorage.setItem('sa_active_tab', 'logs'); window.dispatchEvent(new Event('storage')); } },
              ].map(q => (
                <button key={q.label} className="sa-quick-btn" onClick={q.action}>
                  {q.icon}{q.label}
                </button>
              ))}
            </div>
          </div>

          {/* System Health */}
          <div className="sa-panel">
            <div className="sa-panel-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              System Health
            </div>
            {health.map(h => {
              const ok = h.status === 'operational' || h.status === 'verified' || h.status === 'configured';
              return (
                <div key={h.label} className="sa-health-row">
                  <span className="sa-health-label">{h.label}</span>
                  <span className="sa-health-badge" style={{ background: ok ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: ok ? '#10b981' : '#f59e0b' }}>
                    {h.status.replace(/_/g,' ').toUpperCase()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Email Deliverability Tab ────────────────────────────────────────────────
function EmailDeliverabilityTab() {
  const BLANK = { smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '', smtp_from_email: '', smtp_from_name: 'RecoverLab CRM', reply_to: '', bounce_webhook: '', unsub_page: '' };
  const loadCfg = () => { try { return { ...BLANK, ...(JSON.parse(localStorage.getItem('sa_email_config') || 'null') || {}) }; } catch { return { ...BLANK }; } };
  const [cfg, setCfg] = useState(loadCfg);
  const [saved, setSaved] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testStatus, setTestStatus] = useState(null); // null | 'testing' | 'ok' | 'error'
  const [testMsg, setTestMsg] = useState('');
  const [tab, setTab] = useState('smtp');

  const save = async () => {
    localStorage.setItem('sa_email_config', JSON.stringify(cfg));
    // Sync SMTP fields to backend COMPANY_SETTINGS
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        body: JSON.stringify({
          smtp_host: cfg.smtp_host,
          smtp_port: Number(cfg.smtp_port) || 587,
          smtp_user: cfg.smtp_user,
          ...(cfg.smtp_pass ? { smtp_password: cfg.smtp_pass } : {}),
          smtp_from_name: cfg.smtp_from_name,
          smtp_from_email: cfg.smtp_from_email,
        }),
      });
    } catch {}
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  const sendTest = async () => {
    if (!testEmail) return;
    await save();
    setTestStatus('testing'); setTestMsg('');
    try {
      const res = await fetch('/api/settings/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        body: JSON.stringify({ test_to: testEmail }),
      });
      const data = await res.json();
      if (data.ok) { setTestStatus('ok'); setTestMsg(data.message); }
      else { setTestStatus('error'); setTestMsg(data.error || 'SMTP test failed'); }
    } catch (e) { setTestStatus('error'); setTestMsg(e.message); }
  };

  const INBOX_TIPS = [
    { icon: '', title: 'SPF Record', status: 'critical', desc: 'Authorizes your SMTP server to send on behalf of your domain. Add a TXT record at the root (@) of your domain in DNS:', code: 'v=spf1 ip4:YOUR.SMTP.SERVER.IP ~all' },
    { icon: '', title: 'DKIM Signing', status: 'critical', desc: 'Cryptographically signs outbound emails. Generate a DKIM key pair — add the public key as a TXT DNS record. Configure your SMTP server (Postfix/Exim/etc.) with the private key. Most important factor for inbox placement.' },
    { icon: '', title: 'DMARC Policy', status: 'recommended', desc: 'Ties SPF + DKIM together and tells receiving servers what to do with failing emails. Add a TXT record at _dmarc.yourdomain.com:', code: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com' },
    { icon: '', title: 'Custom Sending Domain', status: 'recommended', desc: 'Send from a dedicated subdomain (e.g. mail.yourdomain.com). Set the SMTP EHLO/HELO hostname to match. This protects your root domain reputation.' },
    { icon: '', title: 'Reverse DNS (PTR)', status: 'critical', desc: 'Your SMTP server\'s IP must have a valid PTR (reverse DNS) record pointing to your hostname. Ask your hosting/VPS provider. Missing PTR = instant spam folder.' },
    { icon: '', title: 'Domain Warmup', status: 'critical', desc: 'New IPs/domains must be warmed up. Start with 50 emails/day, double weekly for 4–6 weeks. Sending too many too fast triggers spam filters at Gmail, Yahoo, Outlook.' },
    { icon: '', title: 'Unsubscribe Header', status: 'critical', desc: 'Include List-Unsubscribe header and a visible unsubscribe link in every marketing email. Required by Gmail and Yahoo since 2024. Non-compliance leads to deliverability drops.' },
    { icon: '🧹', title: 'List Hygiene', status: 'recommended', desc: 'Remove hard-bounced addresses immediately. Remove soft-bounce addresses after 3 failures. Hard bounce rate >2% or spam rate >0.1% will get your IP/domain flagged.' },
    { icon: '📝', title: 'Plain Text Fallback', status: 'recommended', desc: 'Always include a plain text version alongside HTML. Emails with HTML-only content are flagged as suspicious by many spam filters. Add text/plain alternative in your templates.' },
    { icon: '🚫', title: 'Avoid Spam Triggers', status: 'recommended', desc: 'Avoid ALL CAPS, excessive "!!!", "FREE", "CLICK HERE NOW", image-heavy emails with little text, URL shorteners. Keep image-to-text ratio balanced. Never use purchased lists.' },
  ];

  const STATUS_COLORS = { critical: '#ef4444', recommended: '#f59e0b', optional: '#3b82f6' };

  const DNS_RECORDS = [
    { type: 'TXT',   host: '@',             value: 'v=spf1 ip4:YOUR.SMTP.IP ~all',                    label: 'SPF Record',        status: 'critical',     note: 'Replace YOUR.SMTP.IP with your mail server\'s public IP. You can also use a4:mail.yourdomain.com if your SMTP server has a dedicated subdomain.' },
    { type: 'TXT',   host: 'mail._domainkey', value: 'v=DKIM1; k=rsa; p=<YOUR_DKIM_PUBLIC_KEY>',      label: 'DKIM Record',       status: 'critical',     note: 'Generate a DKIM key pair (openssl or your mail server tool). Replace <YOUR_DKIM_PUBLIC_KEY> with the base64-encoded public key.' },
    { type: 'TXT',   host: '_dmarc',         value: 'v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@yourdomain.com', label: 'DMARC Record', status: 'recommended', note: 'Start with p=none for monitoring, upgrade to p=quarantine then p=reject as you confirm SPF+DKIM are working.' },
    { type: 'PTR',   host: 'YOUR.SMTP.IP',   value: 'mail.yourdomain.com',                            label: 'Reverse DNS (PTR)', status: 'critical',     note: 'Set via your hosting/VPS provider control panel. The PTR of your SMTP IP must match the hostname your server announces in EHLO/HELO.' },
    { type: 'A',     host: 'mail',           value: 'YOUR.SMTP.IP',                                   label: 'Mail Subdomain A',  status: 'recommended',  note: 'Create mail.yourdomain.com pointing to your SMTP server IP. Use this as your EHLO hostname and sending domain.' },
    { type: 'MX',    host: '@',             value: 'mail.yourdomain.com (priority 10)',                label: 'MX Record',         status: 'optional',     note: 'Needed if you also want to receive email at your domain. Not required if you only send.' },
  ];

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(59,130,246,0.1))', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: '2rem' }}></div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Email Deliverability Center</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>Configure your SMTP server, set up SPF/DKIM/DMARC, and ensure marketing emails land in the inbox — not spam.</div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border-subtle)', paddingBottom: 0 }}>
        {[['smtp', 'SMTP Configuration'], ['dns', 'DNS & Authentication'], ['tips', 'Inbox Best Practices']].map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 16px', background: 'none', border: 'none', borderBottom: tab===t ? '2px solid var(--accent-primary)' : '2px solid transparent', marginBottom: -2, color: tab===t ? 'var(--accent-primary)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: tab===t ? 700 : 400 }}>{l}</button>
        ))}
      </div>

      {/* ── SMTP Config ── */}
      {tab === 'smtp' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Left — server credentials */}
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 14, color: 'var(--text-secondary)' }}>SMTP Server Credentials</div>
            <div style={{ padding: '10px 14px', background: 'rgba(59,130,246,0.06)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.15)', marginBottom: 16, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Works with any SMTP server — Gmail Workspace, Zoho Mail, your own Postfix/Exim, cPanel Mail, or any hosting provider. Just enter the credentials below.
            </div>
            <div className="form-group">
              <label className="form-label">SMTP Host</label>
              <input className="form-input font-mono" value={cfg.smtp_host} onChange={e => setCfg(c => ({...c, smtp_host: e.target.value}))} placeholder="smtp.yourdomain.com" />
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Port</label>
                <select className="form-select" value={cfg.smtp_port} onChange={e => setCfg(c => ({...c, smtp_port: parseInt(e.target.value)}))}>
                  <option value={587}>587 — STARTTLS (recommended)</option>
                  <option value={465}>465 — SSL/TLS</option>
                  <option value={25}>25 — Plain (not recommended)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input className="form-input" value={cfg.smtp_user} onChange={e => setCfg(c => ({...c, smtp_user: e.target.value}))} placeholder="your@email.com" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Password / App Password</label>
              <input type="password" className="form-input" value={cfg.smtp_pass} onChange={e => setCfg(c => ({...c, smtp_pass: e.target.value}))} placeholder="SMTP password" />
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>For Gmail: use an App Password (not your Google account password). For cPanel: use the email account password.</div>
            </div>

            {/* Common presets hint */}
            <div style={{ padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>Common SMTP Hosts</div>
              {[
                ['Gmail Workspace', 'smtp.gmail.com', 587],
                ['Zoho Mail',       'smtp.zoho.in',   587],
                ['Outlook/Office365','smtp.office365.com', 587],
                ['cPanel / Hosting','mail.yourdomain.com', 587],
                ['Your own server', 'mail.yourdomain.com', 587],
              ].map(([name, host, port]) => (
                <div key={name} style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'center' }}>
                  <span style={{ minWidth: 160 }}>{name}:</span>
                  <code style={{ color: '#10b981', cursor: 'pointer' }} onClick={() => setCfg(c => ({...c, smtp_host: host, smtp_port: port}))}>{host}:{port}</code>
                  <span style={{ color: 'var(--accent-primary)', fontSize: '0.65rem', cursor: 'pointer' }} onClick={() => setCfg(c => ({...c, smtp_host: host, smtp_port: port}))}>use →</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — sender identity + test */}
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 14, color: 'var(--text-secondary)' }}>Sender Identity</div>
            <div className="form-group">
              <label className="form-label">From Email Address</label>
              <input className="form-input" value={cfg.smtp_from_email} onChange={e => setCfg(c => ({...c, smtp_from_email: e.target.value}))} placeholder="noreply@yourdomain.com" />
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>Must be an address authorised by your SMTP credentials. If blank, the SMTP username is used.</div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">From Name</label>
                <input className="form-input" value={cfg.smtp_from_name} onChange={e => setCfg(c => ({...c, smtp_from_name: e.target.value}))} placeholder="RecoverLab CRM" />
              </div>
              <div className="form-group">
                <label className="form-label">Reply-To</label>
                <input className="form-input" value={cfg.reply_to} onChange={e => setCfg(c => ({...c, reply_to: e.target.value}))} placeholder="support@yourdomain.com" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Bounce Webhook URL</label>
              <input className="form-input" value={cfg.bounce_webhook} onChange={e => setCfg(c => ({...c, bounce_webhook: e.target.value}))} placeholder="https://yourdomain.com/api/email/bounce" />
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>Configure in your SMTP server or mail relay to auto-remove bounced addresses.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Unsubscribe Page URL</label>
              <input className="form-input" value={cfg.unsub_page} onChange={e => setCfg(c => ({...c, unsub_page: e.target.value}))} placeholder="https://yourdomain.com/unsubscribe" />
            </div>

            {/* Test send */}
            <div style={{ padding: '14px 16px', background: 'rgba(0,212,255,0.06)', borderRadius: 10, border: '1px solid rgba(0,212,255,0.15)', marginTop: 8 }}>
              <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 10, color: 'var(--text-secondary)' }}>Test SMTP Connection</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="Send test to: you@example.com" style={{ flex: 1 }} />
                <button className="btn btn-secondary" onClick={sendTest} disabled={testStatus === 'testing'} style={{ whiteSpace: 'nowrap' }}>
                  {testStatus === 'testing' ? 'Sending…' : 'Send Test'}
                </button>
              </div>
              {testMsg && (
                <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 7, background: testStatus === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${testStatus === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, fontSize: '0.75rem', color: testStatus === 'ok' ? '#10b981' : '#ef4444' }}>
                  {testMsg}
                </div>
              )}
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={save} style={{ flex: 1 }}>{saved ? 'Saved & Synced!' : 'Save SMTP Settings'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DNS & Authentication ── */}
      {tab === 'dns' && (
        <div>
          <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.06)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', marginBottom: 20, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <strong>Critical:</strong> Without SPF and DKIM set up, emails from your SMTP server will almost always land in spam. Set up all records marked CRITICAL before sending any campaigns.
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            {DNS_RECORDS.map(r => (
              <div key={r.label} style={{ background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)', padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{r.label}</div>
                  <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 99, background: `${STATUS_COLORS[r.status]}18`, color: STATUS_COLORS[r.status], fontWeight: 700, border: `1px solid ${STATUS_COLORS[r.status]}30`, textTransform: 'uppercase' }}>{r.status}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 200px 1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 4, background: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontWeight: 700, textAlign: 'center' }}>{r.type}</span>
                  <code style={{ fontSize: '0.72rem', background: 'var(--bg-base)', padding: '3px 8px', borderRadius: 4, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.host}</code>
                  <code style={{ fontSize: '0.72rem', background: 'var(--bg-base)', padding: '3px 8px', borderRadius: 4, color: '#10b981', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.value}</code>
                  <button style={{ background: 'none', border: '1px solid var(--border-subtle)', padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontSize: '0.7rem', color: 'var(--text-muted)' }}
                    onClick={() => { navigator.clipboard?.writeText(r.value); alert('Copied!'); }}>Copy</button>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.note}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(16,185,129,0.06)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.2)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            💡 <strong>Verify your setup:</strong> Use <strong>mail-tester.com</strong> or <strong>MXToolbox SPF/DKIM Lookup</strong> to confirm all records are resolving correctly. Aim for a score of 9–10/10 before launching campaigns.
          </div>
        </div>
      )}

      {/* ── Inbox Best Practices ── */}
      {tab === 'tips' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {INBOX_TIPS.map(tip => (
            <div key={tip.title} style={{ background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.2rem' }}>{tip.icon}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{tip.title}</span>
                </div>
                <span style={{ fontSize: '0.65rem', padding: '2px 7px', borderRadius: 99, background: `${STATUS_COLORS[tip.status]}18`, color: STATUS_COLORS[tip.status], fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>{tip.status}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: tip.code ? 8 : 0 }}>{tip.desc}</div>
              {tip.code && (
                <code style={{ display: 'block', fontSize: '0.7rem', background: 'var(--bg-base)', padding: '6px 10px', borderRadius: 6, color: '#10b981', wordBreak: 'break-all' }}>{tip.code}</code>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Saved toast */}
      {saved && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', padding: '10px 18px', borderRadius: 10, fontWeight: 700, zIndex: 9999, boxShadow: '0 4px 16px rgba(16,185,129,0.4)' }}>SMTP settings saved!</div>}
    </div>
  );
}

// ── Main SuperAdmin Page ────────────────────────────────────────────────────
export default function SuperAdminPage() {
  const { user, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editTenant, setEditTenant] = useState(null);
  const [viewUsersTenant, setViewUsersTenant] = useState(null);
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('sa_active_tab') || 'dashboard');

  // Sync with sessionStorage when sidebar sets the tab
  useEffect(() => {
    const onStorage = () => setActiveTab(sessionStorage.getItem('sa_active_tab') || 'dashboard');
    window.addEventListener('storage', onStorage);
    // Poll sessionStorage since same-tab writes don't trigger storage event
    const poll = setInterval(() => {
      const tab = sessionStorage.getItem('sa_active_tab') || 'dashboard';
      setActiveTab(prev => prev !== tab ? tab : prev);
    }, 120);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(poll); };
  }, []);

  // Redirect if not super admin
  useEffect(() => {
    if (!isSuperAdmin && user) {
      navigate('/');
    }
  }, [isSuperAdmin, user, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await saApi.get('/tenants');
      setTenants(data.tenants || []);
    } catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleImpersonate = (tenant) => {
    sessionStorage.setItem('impersonating_as', tenant.company_name);
    sessionStorage.setItem('impersonating_tenant_id', tenant.id);
    alert(`Now viewing as: ${tenant.company_name}\n\nYou'll see their CRM data. Click "Exit" in the banner to return.`);
    navigate('/');
  };

  const handleToggle = async (tenant) => {
    const newStatus = tenant.status === 'suspended' ? 'active' : 'suspended';
    const res = await saApi.patch(`/tenants/${tenant.id}`, { status: newStatus });
    if (res.error) { alert(res.error); return; }
    load();
  };

  const filtered = tenants.filter(t => {
    const matchSearch = !search || `${t.company_name} ${t.admin_email} ${t.city}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.status === 'active').length,
    trial: tenants.filter(t => t.status === 'trial').length,
    expiringSoon: tenants.filter(t => {
      const d = Math.ceil((new Date(t.expiry_date) - Date.now()) / 86400000);
      return d >= 0 && d <= 14;
    }).length,
    mrr: tenants.filter(t => t.status === 'active').reduce((sum, t) => sum + (getPlans().find(p => p.key === t.plan)?.price || 0), 0),
  };

  // Purchase tracking state
  const [purchases, setPurchases] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sa_purchase_log') || '[]'); } catch { return []; }
  });
  const [newPurchaseCount, setNewPurchaseCount] = useState(() => {
    try { return parseInt(localStorage.getItem('sa_new_purchase_count') || '0'); } catch { return 0; }
  });

  const addPurchase = (entry) => {
    const arr = (() => { try { return JSON.parse(localStorage.getItem('sa_purchase_log') || '[]'); } catch { return []; } })();
    const newArr = [{ ...entry, id: Date.now().toString(), timestamp: new Date().toISOString() }, ...arr].slice(0, 200);
    localStorage.setItem('sa_purchase_log', JSON.stringify(newArr));
    setPurchases(newArr);
    const cnt = parseInt(localStorage.getItem('sa_new_purchase_count') || '0') + 1;
    localStorage.setItem('sa_new_purchase_count', cnt.toString());
    setNewPurchaseCount(cnt);
  };

  const clearNewCount = () => {
    localStorage.setItem('sa_new_purchase_count', '0');
    setNewPurchaseCount(0);
  };

  // Simulate webhook
  const simulateWebhook = (tenant, plan, success) => {
    addPurchase({
      tenant_name: tenant.company_name,
      tenant_email: tenant.admin_email || '—',
      plan: plan.key,
      plan_label: plan.label,
      amount: plan.price,
      status: success ? 'success' : 'failed',
      razorpay_payment_id: success ? `pay_${Math.random().toString(36).slice(2, 16)}` : null,
      razorpay_order_id: `order_${Math.random().toString(36).slice(2, 16)}`,
    });
  };

  // Theme + Font size + Clock
  const { theme, toggleTheme } = useTheme();
  const { fontSize, setFontSize } = useFontSize();
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  return (
    <div>
      {/* ═══ Hero Header ═══ */}
      <div className="sa-hero">
        <div className="sa-hero-inner">
          <div>
            <div className="sa-hero-badge">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17 5.8 21.3l2.4-7.4L2 9.4h7.6z"/></svg>
              Platform Command Center
            </div>
            <h1 className="sa-hero-title">Platform Command Center</h1>
            <p className="sa-hero-sub">Owner-level access ◆ manage subscribers, subscriptions &amp; platform configuration</p>
          </div>
          <div className="sa-hero-controls">
            {/* Font size */}
            <div className="sa-hero-ctrl-group">
              {[{ v:'small', label:'A\u207B' }, { v:'default', label:'A' }, { v:'large', label:'A\u207A' }].map(f => (
                <button key={f.v} className={`sa-fsize-btn${fontSize === f.v ? ' active' : ''}`} onClick={() => setFontSize(f.v)}>{f.label}</button>
              ))}
            </div>
            {/* Theme */}
            <button className="sa-hero-ctrl-btn" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark'
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              }
            </button>
            {/* Clock */}
            <div className="sa-hero-clock">
              <div className="sa-hero-clock-time">{now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
              <div className="sa-hero-clock-date">{now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            </div>
            {/* New Subscriber */}
            <button className="sa-btn-primary" onClick={() => setShowAdd(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Subscriber
            </button>
          </div>
        </div>
      </div>

      {/* ── Content (tab driven by main sidebar) ── */}
      <div className="sa-main">

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <DashboardTab tenants={tenants} stats={stats} onAddTenant={() => setShowAdd(true)} />
      )}

      {/* Subscriber Management Tab */}
      {activeTab === 'tenants' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
              <input className="search-input" placeholder="Search by company, email, city..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="form-select" style={{ width: 'auto' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="expired">Expired</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <div className="empty-title">No subscribers found</div>
              <div className="empty-desc">Create your first subscriber to get started with SaaS management</div>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAdd(true)}>+ Create First Subscriber</button>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Company / Admin</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Team Users</th>
                    <th>Subscription</th>
                    <th>Location</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <TenantRow
                      key={t.id}
                      tenant={t}
                      onEdit={setEditTenant}
                      onImpersonate={handleImpersonate}
                      onToggle={handleToggle}
                      onViewUsers={setViewUsersTenant}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Plans & Pricing Tab */}
      {activeTab === 'plans' && (
        <div>
          <div style={{ marginBottom:12 }}>
            <div className="card-title">Subscription Plans & Access Control</div>
            <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>Manage plans, pricing, and define which modules each plan can access.</div>
          </div>
          <PlansManager tenants={tenants} />
        </div>
      )}

      {/* Razorpay Tab */}
      {activeTab === 'razorpay' && (
        <RazorpayTab tenants={tenants} simulateWebhook={simulateWebhook} filtered={filtered} />
      )}

      {/* Coupons Tab */}
      {activeTab === 'coupons' && (
        <div>
          <div className="card-title" style={{ marginBottom: 12 }}>Coupon Code Management</div>
          <CouponManager />
        </div>
      )}

      {/* Purchase Tracking Tab */}
      {activeTab === 'purchases' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title">Subscription Purchase Tracker</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {newPurchaseCount > 0 && (
                <span style={{ padding: '4px 12px', background: 'rgba(16,185,129,0.15)', color: '#10b981', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }} onClick={clearNewCount}>
                  Mark {newPurchaseCount} as seen
                </span>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => {
                if (confirm('Clear all purchase logs?')) {
                  localStorage.setItem('sa_purchase_log', '[]');
                  setPurchases([]);
                  clearNewCount();
                }
              }}>Clear Logs</button>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[[
              '', 'Successful', purchases.filter(p => p.status === 'success').length, '#10b981',
            ], [
              '', 'Failed / Abandoned', purchases.filter(p => p.status === 'failed').length, '#ef4444',
            ], [
              '', 'Pending', purchases.filter(p => p.status === 'pending').length, '#f59e0b',
            ], [
              '', 'Total Revenue', fmtAmt(purchases.filter(p => p.status === 'success').reduce((s, p) => s + (p.amount || 0), 0)), '#8b5cf6',
            ]].map(([icon, label, val, color]) => (
              <div key={label} className="card" style={{ borderLeft: `3px solid ${color}`, padding: '12px 16px' }}>
                <div style={{ fontSize: '1.4rem' }}>{icon}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>{val}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Tenant</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Razorpay ID</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchases.length === 0 ? (
                  <tr><td colSpan={7}>
                    <div className="empty-state" style={{ padding: 40 }}>
                      <div className="empty-icon">📭</div>
                      <div className="empty-title">No Purchase Events</div>
                      <div className="empty-desc">Use the "Simulate Webhook" in Plans tab to test tracking, or configure the real Razorpay webhook</div>
                    </div>
                  </td></tr>
                ) : purchases.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div className="font-mono text-xs">{fmtDate(p.timestamp)}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{fmtTime(p.timestamp)}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.tenant_name}</div>
                      <div className="text-xs text-muted">{p.tenant_email}</div>
                    </td>
                    <td>
                      {(() => { const pl = getPlans().find(x => x.key === p.plan) || { label: p.plan_label || p.plan, color: '#64748b' }; return (
                        <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 999, background: `${pl.color}18`, color: pl.color, fontWeight: 700, border: `1px solid ${pl.color}30` }}>{pl.label}</span>
                      ); })()}
                    </td>
                    <td><span className="font-mono" style={{ fontWeight: 700 }}>{fmtAmt(p.amount)}/mo</span></td>
                    <td>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: 999, fontFamily: 'var(--font-mono)',
                        background: p.status === 'success' ? 'rgba(16,185,129,0.15)' : p.status === 'failed' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                        color: p.status === 'success' ? '#10b981' : p.status === 'failed' ? '#ef4444' : '#f59e0b',
                      }}>{p.status.toUpperCase()}</span>
                    </td>
                    <td>
                      {p.razorpay_payment_id ? (
                        <span className="font-mono text-xs" style={{ color: 'var(--accent-primary)' }}>{p.razorpay_payment_id}</span>
                      ) : <span className="text-xs text-muted">—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {p.status === 'success' && (
                          <button className="btn btn-sm btn-secondary" onClick={() => {
                            const tenant = tenants.find(t => t.company_name === p.tenant_name);
                            if (tenant) { setEditTenant(tenant); }
                            else alert('Tenant not found — may need manual update');
                          }}>Update Tenant</button>
                        )}
                        {p.status === 'failed' && (
                          <button className="btn btn-sm" style={{ background: 'rgba(0,212,255,0.1)', color: 'var(--accent-primary)', borderColor: 'rgba(0,212,255,0.3)', fontSize: '0.72rem' }}
                            onClick={() => alert(`Retry contact: ${p.tenant_email}`)}>Retry</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Branding Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'branding' && <BrandingTab />}

      {/* ── SEO Tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'seo' && <SeoTab />}

      {/* ── Homepage Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'homepage' && <HomepageTab />}

      {/* ── Invoices Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'invoices' && <InvoicesTab purchases={purchases} tenants={tenants} />}

      {/* ── SA Accounts Tab ────────────────────────────────────────────────── */}
      {activeTab === 'accounts' && <AccountsTab />}

      {/* ── Activity Logs Tab ──────────────────────────────────────────────── */}
      {activeTab === 'logs' && <ActivityLogsTab />}

      {/* ── Platform Settings Tab ── */}
      {activeTab === 'platform' && <PlatformTab />}

      {/* ── Email Deliverability Tab ──────────────────────────────────────────── */}
      {activeTab === 'email_delivery' && <EmailDeliverabilityTab />}

      </div>{/* end sa-main */}

      {showAdd && <AddTenantModal onClose={() => setShowAdd(false)} onDone={load} />}
      {editTenant && <EditTenantModal tenant={editTenant} onClose={() => setEditTenant(null)} onDone={load} />}
      {viewUsersTenant && <TenantUsersModal tenant={viewUsersTenant} onClose={() => setViewUsersTenant(null)} />}
    </div>
  );
}
