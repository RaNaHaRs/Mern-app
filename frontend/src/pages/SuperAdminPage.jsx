import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../store/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTheme, useFontSize } from '../store/ThemeContext';
import UserAvatar from '../components/UserAvatar';
import './SuperAdminPage.css';
import {
  RazorpaySettingsTab,
  InvoiceSettingsTab,
  SeoSettingsTab,
  HomepageSettingsTab,
  TwoFASettingsTab,
} from '../components/PlatformSettingsTabs';
const SuperAdminAutomation = React.lazy(() => import('./SuperAdminAutomation'));

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
const fmtAmt = (n) => `₹${parseFloat(n || 0).toLocaleString('en-IN')}`;

const BASE_URL = '/api';
const getToken = () => localStorage.getItem('accessToken');

const saFetch = async (url, options) => {
  const token = getToken();
  const headers = {
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  let res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        const accessToken = refreshData?.accessToken;
        if (accessToken) {
          localStorage.setItem('accessToken', accessToken);
          headers.Authorization = `Bearer ${accessToken}`;
          res = await fetch(url, { ...options, headers });
        }
      }
    }
    if (res.status === 401) {
      localStorage.clear();
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || d.errors?.[0]?.msg || `HTTP ${res.status}`);
  return d;
};
const saApi = {
  get: (path) => saFetch(`${BASE_URL}/super-admin${path}`, { method: 'GET' }),
  post: (path, body) => saFetch(`${BASE_URL}/super-admin${path}`, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => saFetch(`${BASE_URL}/super-admin${path}`, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (path) => saFetch(`${BASE_URL}/super-admin${path}`, { method: 'DELETE' }),
  put: (path, body) => saFetch(`${BASE_URL}/super-admin${path}`, { method: 'PUT', body: JSON.stringify(body) }),
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
<<<<<<< HEAD
  const [plansLoading, setPlansLoading] = useState(true);
  const [dynamicPlans, setDynamicPlans] = useState(DEFAULT_PLANS);
  
  // Load plans from backend on mount
  useEffect(() => {
    saApi.get('/plans')
      .then(res => {
        if (res.plans && res.plans.length > 0) {
          setDynamicPlans(res.plans);
        }
      })
      .catch(() => {})
      .finally(() => setPlansLoading(false));
  }, []);
  
=======
  const dynamicPlans = getPlans().filter(p => p.is_active !== false);
>>>>>>> 389f48cffc70f5609955a908ae817717ba7d9296
  const [form, setForm] = useState({
    company_name: '', admin_name: '', admin_email: '', admin_password: '',
    plan: dynamicPlans[1]?.key || 'professional', max_team_users: dynamicPlans[1]?.maxUsers || 5, subscription_months: 12,
    phone: '', gstin: '', city: '', notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [razorpayOrder, setRazorpayOrder] = useState(null);
  const [paymentLink, setPaymentLink] = useState(null);  // NEW: Store generated payment link
  const [fieldErrors, setFieldErrors] = useState({});
  const selPlan = dynamicPlans.find(p => p.key === form.plan) || dynamicPlans[1] || dynamicPlans[0];

  const FieldErr = ({ field }) => fieldErrors[field] ? <div style={{ fontSize: '0.68rem', color: '#ef4444', marginTop: 4 }}>{fieldErrors[field]}</div> : null;

  const setFormField = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setFieldErrors(f => ({ ...f, [field]: '' }));
  };

  const handle = async () => {
    setFieldErrors({});
    const errs = {};
    if (!form.company_name) errs.company_name = 'Company name is required';
    if (!form.admin_name) errs.admin_name = 'Admin name is required';
    if (!form.admin_email) errs.admin_email = 'Admin email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.admin_email)) errs.admin_email = 'Invalid email format';
    if (!form.admin_password) errs.admin_password = 'Password is required';
    else if (form.admin_password.length < 8) errs.admin_password = 'Password must be at least 8 characters';
    if (form.phone) {
      const digits = form.phone.replace(/\D/g, '');
      if (digits.length !== 10) errs.phone = 'Mobile number must be exactly 10 digits';
    }
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    setLoading(true);
    try {
      await saApi.post('/tenants', {
        ...form,
        amount: selPlan.price * form.subscription_months,
        expiry_date: new Date(Date.now() + form.subscription_months * 30 * 86400000).toISOString().slice(0, 10),
      });
      alert(`✅ Subscriber "${form.company_name}" created!\n\nLogin: ${form.admin_email}\nPassword: ${form.admin_password}`);
      onDone();
      onClose();
    } catch (e) { setFieldErrors({ _general: e.message }); } finally { setLoading(false); }
  };

  const handleGeneratePaymentLink = async () => {
    // STEP 1: Generate shareable payment link (NOT checkout)
    setLoading(true);
    try {
      console.log('🔗 Generating payment link...', {
        amount: selPlan.price * form.subscription_months,
        plan_key: form.plan,
        months: form.subscription_months,
      });

      // Call /api/payment-link/generate to create shareable link
      const linkRes = await saApi.post('/payment-link/generate', {
        amount: selPlan.price * form.subscription_months,
        plan_key: form.plan,
        plan_label: selPlan.label,
        months: form.subscription_months,
        customer_email: form.admin_email,
        customer_name: form.admin_name,
        description: `${selPlan.label} Plan for ${form.company_name}`,
        tenant_user_id: undefined,  // New subscriber, no user ID yet
      });

      if (linkRes.error) {
        throw new Error(linkRes.error);
      }

      if (!linkRes.payment_link) {
        throw new Error('No payment link generated');
      }

      console.log('✅ Payment link generated:', linkRes.payment_link);
      
      // Store the link for display
      setPaymentLink({
        link: linkRes.payment_link,
        linkId: linkRes.link_id,
        amount: linkRes.amount,
        planLabel: linkRes.plan_label,
        months: linkRes.months,
      });

      // Show success
      alert(`✅ Payment Link Generated!\n\nLink: ${linkRes.payment_link}\n\nYou can now copy and share this link with the subscriber.`);
    } catch (err) {
      console.error('Payment link generation error:', err);
      alert(`❌ Failed to generate link:\n\n${err.message}\n\nPlease try again or contact support.`);
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToCheckout = async () => {
    // STEP 2: When user clicks "Proceed to Payment", open Razorpay checkout for the payment link
    if (!paymentLink) {
      alert('Please generate a payment link first');
      return;
    }

    setLoading(true);
    try {
      console.log('🚀 Opening Razorpay checkout for link:', paymentLink.linkId);

      // Call /api/payment-link/:link_id/checkout to get Razorpay order
      const checkoutRes = await saApi.post(`/payment-link/${paymentLink.linkId}/checkout`, {
        customer_email: form.admin_email,
        customer_name: form.admin_name,
      });

      if (checkoutRes.error) {
        throw new Error(checkoutRes.error);
      }

      const { order_id, purchase_id, key_id } = checkoutRes;

      if (!order_id) {
        throw new Error('No order ID returned from server');
      }

      // Load Razorpay script if not already loaded
      if (!window.Razorpay) {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.onerror = () => {
          throw new Error('Failed to load Razorpay script. Check your internet connection.');
        };
        document.head.appendChild(script);
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          setTimeout(() => {
            if (!window.Razorpay) {
              reject(new Error('Razorpay script failed to load'));
            } else {
              resolve();
            }
          }, 3000);
        });
      }

      // Open Razorpay checkout
      const options = {
        key: key_id,
        amount: paymentLink.amount * 100, // In paise
        currency: 'INR',
        name: 'RecoverLab',
        description: `${paymentLink.planLabel} Plan × ${paymentLink.months} month(s)`,
        order_id: order_id,
        handler: async (response) => {
          // Step 5: Verify payment signature
          try {
            const verifyRes = await saApi.post('/razorpay/verify-payment', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              purchase_id: purchase_id,
            });

            if (verifyRes.success) {
              alert(`✅ Payment successful!\n\nOrder ID: ${response.razorpay_order_id}\n\nYour subscription is now active.\n\nPlan features: ${verifyRes.subscription?.planDetails?.features?.join(', ') || 'Standard features'}`);
              
              // Create subscriber account after payment
              try {
                const createRes = await saApi.post('/tenants', {
                  ...form,
                  amount: selPlan.price * form.subscription_months,
                  expiry_date: new Date(Date.now() + form.subscription_months * 30 * 86400000).toISOString().slice(0, 10),
                });
                if (createRes.error) throw new Error(createRes.error);
              } catch (err) {
                console.warn('Account creation after payment:', err.message);
                // Still close even if account creation has issues
              }
              
              // Refresh user data if available
              if (window.__refreshUserData) {
                window.__refreshUserData();
              }
              
              onDone();
              onClose();
            } else {
              throw new Error(verifyRes.error || 'Payment verification failed');
            }
          } catch (err) {
            alert(`❌ Payment verification failed: ${err.message}`);
          }
        },
        prefill: {
          name: form.admin_name,
          email: form.admin_email,
          contact: form.phone,
        },
        theme: {
          color: '#00d4ff',
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error('Razorpay error:', err);
      alert(`❌ Failed to open payment:\n\n${err.message}\n\nPlease try again or contact support.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Create New Subscriber</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        {fieldErrors._general && <div style={{ padding: '10px 16px', margin: '0 20px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: '#ef4444', fontSize: '0.82rem', fontWeight: 600 }}>{fieldErrors._general}</div>}
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Left — Account Details */}
          <div>
            <div className="card-title" style={{ marginBottom: 12 }}>Account Details</div>
            <div className="form-group">
              <label className="form-label required">Company / Lab Name</label>
              <input className={`form-input${fieldErrors.company_name ? ' form-input-error' : ''}`} value={form.company_name} onChange={e => setFormField('company_name', e.target.value)} placeholder="e.g. DataRescue Mumbai" />
              <FieldErr field="company_name" />
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label required">Admin Name</label>
                <input className={`form-input${fieldErrors.admin_name ? ' form-input-error' : ''}`} value={form.admin_name} onChange={e => setFormField('admin_name', e.target.value)} placeholder="Full name" />
                <FieldErr field="admin_name" />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className={`form-input${fieldErrors.phone ? ' form-input-error' : ''}`} value={form.phone} onChange={e => setFormField('phone', e.target.value)} placeholder="+91 98765 43210" />
                <FieldErr field="phone" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label required">Admin Email (Login ID)</label>
              <input type="email" className={`form-input${fieldErrors.admin_email ? ' form-input-error' : ''}`} value={form.admin_email} onChange={e => setFormField('admin_email', e.target.value)} placeholder="admin@theirlab.com" />
              <FieldErr field="admin_email" />
            </div>
            <div className="form-group">
              <label className="form-label required">Initial Password</label>
              <input type="password" className={`form-input${fieldErrors.admin_password ? ' form-input-error' : ''}`} value={form.admin_password} onChange={e => setFormField('admin_password', e.target.value)} placeholder="Min 8 chars" />
              <FieldErr field="admin_password" />
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">City</label>
                <input className={`form-input${fieldErrors.city ? ' form-input-error' : ''}`} value={form.city} onChange={e => setFormField('city', e.target.value)} placeholder="Mumbai" />
                <FieldErr field="city" />
              </div>
              <div className="form-group">
                <label className="form-label">GSTIN</label>
                <input className={`form-input font-mono${fieldErrors.gstin ? ' form-input-error' : ''}`} value={form.gstin} onChange={e => setFormField('gstin', e.target.value)} placeholder="27AABCT..." />
                <FieldErr field="gstin" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Internal Notes</label>
              <textarea className="form-textarea" style={{ minHeight: 60 }} value={form.notes} onChange={e => setFormField('notes', e.target.value)} placeholder="Any notes about this client..." />
              <FieldErr field="notes" />
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

            {/* PAYMENT LINK SECTION — Show generated link with copy/share buttons */}
            {paymentLink ? (
              <div style={{ padding: '12px 14px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--radius-md)', marginBottom: 14 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: 8, color: '#3b82f6' }}>✅ Payment Link Generated</div>
                
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>Shareable Link:</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
                  <input 
                    type="text" 
                    readOnly 
                    value={paymentLink.link} 
                    style={{ 
                      flex: 1, 
                      padding: '6px 8px', 
                      borderRadius: 4, 
                      border: '1px solid var(--border-subtle)', 
                      background: 'var(--bg-secondary)',
                      fontSize: '0.7rem',
                      fontFamily: 'monospace',
                      cursor: 'pointer'
                    }} 
                    onClick={e => e.target.select()}
                  />
                  <button 
                    className="btn btn-sm btn-secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(paymentLink.link);
                      alert('Link copied to clipboard!');
                    }}
                    style={{ padding: '6px 10px', fontSize: '0.7rem' }}
                  >
                    📋 Copy
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button 
                    className="btn btn-sm btn-secondary"
                    onClick={handleProceedToCheckout}
                    disabled={loading}
                    style={{ flex: 1 }}
                  >
                    💳 Proceed to Payment
                  </button>
                  <button 
                    className="btn btn-sm btn-secondary"
                    onClick={() => setPaymentLink(null)}
                    disabled={loading}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <button 
                className="btn btn-secondary" 
                style={{ width: '100%', marginBottom: 8 }} 
                onClick={handleGeneratePaymentLink}
                disabled={loading}
              >
                {loading ? '⏳ Generating Link...' : '🔗 Generate Payment Link'}
              </button>
            )}
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
  const formatDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toISOString().slice(0, 10);
  };
  const [form, setForm] = useState({
    company_name: tenant.company_name || '',
    plan: tenant.plan || 'professional',
    max_team_users: tenant.max_team_users || 5,
    status: tenant.status || 'active',
    expiry_date: formatDate(tenant.expiry_date),
    notes: tenant.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const [tenantData, setTenantData] = useState(tenant);

  useEffect(() => {
    saApi.get(`/tenants`).then(data => {
      const tenants = Array.isArray(data) ? data : (data?.tenants || []);
      const found = tenants.find(t => t.id === tenant.id);
      if (found) {
        setTenantData(found);
        setForm(f => ({
          ...f,
          expiry_date: formatDate(found.expiry_date),
        }));
      }
    }).catch(() => {});
  }, [tenant.id]);

  const handle = async () => {
    setLoading(true);
    try {
      await saApi.patch(`/tenants/${tenant.id}`, form);
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
                {getPlans().filter(p => p.is_active !== false).map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
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
    const action = u.is_active ? 'Deactivate' : 'Activate';
    if (!confirm(`${action} ${u.full_name || u.username}?`)) return;
    try {
      const res = await saApi.patch(`/tenants/${tenant.id}/users/${u.id}`, { is_active: !u.is_active });
<<<<<<< HEAD
      if (res?.error) {
        throw new Error(res.error);
      }
      if (res.ok) {
=======
      if (res.ok || res.is_active !== undefined) {
>>>>>>> 389f48cffc70f5609955a908ae817717ba7d9296
        setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: res.is_active } : x));
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      alert(err.message || 'Unable to update user status');
    }
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
                  <UserAvatar
                    name={u.full_name || u.username || u.email}
                    avatarUrl={u.avatar_url || null}
                    size={36}
                  />
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
          <UserAvatar
            name={tenant.admin_name || tenant.company_name || tenant.admin_email}
            avatarUrl={tenant.avatar_url || null}
            size={32}
            style={{ borderRadius: 8 }}
          />
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

// ── Confirm Delete Modal ────────────────────────────────────────────────
function ConfirmDeleteModal({ target, onConfirm, onCancel }) {
  if (!target) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{target.mode === 'forever' ? 'Permanently Delete Plan' : 'Remove Plan'}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: '0.9rem', marginBottom: 16 }}>
            {target.mode === 'forever'
              ? `Permanently delete "${target.label}"? This cannot be undone.`
              : `Remove "${target.label}" subscription plan?`}
          </div>
          {target.subscriberCount > 0 && (
            <div style={{ padding: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, fontSize: '0.82rem', marginBottom: 12 }}>
              <strong>{target.subscriberCount} active subscriber{target.subscriberCount > 1 ? 's' : ''}</strong> on this plan will retain their current subscription but cannot change to or select this plan.
            </div>
          )}
          {target.subscriberCount === 0 && (
            <div style={{ padding: 12, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, fontSize: '0.82rem', marginBottom: 12 }}>
              No active subscribers on this plan. It will be removed from the listing.
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn" style={{ background: '#ef4444', color: '#fff', border: 'none' }} onClick={onConfirm}>
            {target.mode === 'forever' ? 'Delete Forever' : `Remove ${target.label}`}
          </button>
        </div>
      </div>
    </div>
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
  const [deletedPlans, setDeletedPlans] = useState([]);
  const [editing, setEditing] = useState(null);
  const [newPlan, setNewPlan] = useState({ key:'', label:'', price:0, maxUsers:5, color:'#3b82f6', features:[] });
  const [showAdd, setShowAdd] = useState(false);
  const [newFeature, setNewFeature] = useState('');
  const [saved, setSaved] = useState(false);
  const [activeView, setActiveView] = useState('plans'); // 'plans' | 'permissions' | 'recycle'
  const [permissions, setPermissions] = useState(getPermissions);
  const [selPermPlan, setSelPermPlan] = useState(plans[0]?.key || 'starter');
  const [deleteTarget, setDeleteTarget] = useState(null); // { key, label, subscriberCount, mode }

  const loadActivePlans = () => {
    saApi.get('/plans').then(d => {
      if (d.plans) {
        localStorage.setItem('sa_custom_plans', JSON.stringify(d.plans));
        setPlans(d.plans);
      }
    }).catch(() => {});
  };

  const loadDeletedPlans = () => {
    saApi.get('/plans?include_inactive=true').then(d => {
      if (d.plans) setDeletedPlans(d.plans.filter(p => !p.is_active));
    }).catch(() => {});
  };

  // Load active plans on mount
  useEffect(() => { loadActivePlans(); }, []);

  const persist = (p) => {
    localStorage.setItem('sa_custom_plans', JSON.stringify(p));
    setPlans(p); setSaved(true); setTimeout(() => setSaved(false), 2500);
    saApi.put('/plans', { plans: p }).catch(() => {}); // async save to backend (best-effort)
  };
  const persistPerms = (p) => {
    localStorage.setItem('sa_plan_permissions', JSON.stringify(p));
    setPermissions(p); setSaved(true); setTimeout(() => setSaved(false), 2500);
  };
  const startEdit = (plan) => setEditing({ ...plan });
  const saveEdit  = async () => {
    const editKey = editing.key;
    const updated = plans.map(p => p.key === editKey ? editing : p);
    persist(updated);
    setEditing(null);
    const plan = updated.find(p => p.key === editKey);
    if (plan && plan.id) {
      await saApi.patch(`/plans/${plan.id}`, {
        label: plan.label,
        price_monthly: plan.price,
        max_users: plan.maxUsers,
        color: plan.color,
        features: plan.features,
      }).catch(() => {});
    }
  };
  const removePlan = async (id) => {
    if (!confirm('Permanently remove this plan?')) return;
    try {
      await saApi.del(`/plans/${id}`);
      loadActivePlans();
    } catch (e) { alert(e.message); }
  };
  const restorePlan = async (plan) => {
    if (plan && plan.id) {
      await saApi.patch(`/plans/${plan.id}`, { is_active: true }).catch(() => {});
    }
    loadActivePlans();
    loadDeletedPlans();
  };
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
          {[{v:'plans',label:'Plans'},{v:'permissions',label:'Permissions & Access'},{v:'recycle',label:'Recycle Bin'}].map(t => (
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
                      <div style={{ marginBottom:12 }}>{plan.features.map((f, fi) => <div key={`${f}_${fi}`} style={{ fontSize:'0.72rem', color:'var(--text-secondary)', marginBottom:3 }}>{f}</div>)}</div>
                      <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', borderTop:'1px solid var(--border-subtle)', paddingTop:8, marginBottom:10 }}>
                        MRR: <strong style={{ color:plan.color }}>₹{(plan.price * tenantCount).toLocaleString('en-IN')}</strong>
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => startEdit(plan)}>Edit</button>
                        <button className="btn btn-sm" style={{background:'rgba(16,185,129,0.1)',color:'#10b981',borderColor:'rgba(16,185,129,0.2)',fontSize:'0.72rem'}}
                          onClick={() => { setSelPermPlan(plan.key); setActiveView('permissions'); }}>Permissions</button>
                        <button className="btn btn-sm" style={{background:'rgba(239,68,68,0.1)',color:'#ef4444',borderColor:'rgba(239,68,68,0.2)',fontSize:'0.72rem'}} onClick={() => removePlan(plan.id)}>Remove</button>
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
        {['view', 'create', 'edit', 'delete', 'export'].map(a => <div key={a} className="sa-perm-action-col">{a.charAt(0).toUpperCase()+a.slice(1)}</div>)}
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

      {/* ── Recycle Bin View ── */}
      {activeView === 'recycle' && (
        <div>
          <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#ef4444' }}>Recycle Bin — Deactivated Plans</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>Deactivated plans can be restored. Previously removed plans that were only in local storage will reappear after refresh.</div>
            </div>
          </div>
          {deletedPlans.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <div className="empty-title">No deactivated plans</div>
              <div className="empty-desc">Removed plans will appear here so you can restore them.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {deletedPlans.map(plan => (
                <div key={plan.key} className="card" style={{ opacity: 0.6, border: `1px solid ${plan.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: plan.color }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: plan.color }}>{plan.label}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>₹{plan.price}/mo · {plan.maxUsers === -1 ? 'Unlimited' : plan.maxUsers} users · <code>{plan.key}</code></div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', borderColor: 'rgba(16,185,129,0.2)', fontSize: '0.72rem' }}
                      onClick={() => restorePlan(plan)}>Restore</button>
                    <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)', fontSize: '0.72rem' }}
                      onClick={() => setDeleteTarget({ key: plan.key, label: plan.label, subscriberCount: 0, mode: 'forever' })}>Delete Forever</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {deleteTarget && <ConfirmDeleteModal target={deleteTarget} onConfirm={confirmDeletePlan} onCancel={() => setDeleteTarget(null)} />}
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
              {isVerified ? `Mode: ${rzpMode.toUpperCase()}` : 'Enter your credentials below to enable payment collection'}
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
  const [form, setForm] = useState({ code:'', type:'global', target_email:'', discount_type:'percent', discount_value:'', max_uses:'', expiry_date:'', description:'' });
  const [showAdd, setShowAdd] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingCoupons, setLoadingCoupons] = useState(true);

  const reload = useCallback(() => {
    saApi.get('/coupons').then(d => { setCoupons(d.coupons || []); setLoadingCoupons(false); }).catch(() => setLoadingCoupons(false));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const genCode = () => setForm(f => ({ ...f, code: Math.random().toString(36).substring(2,8).toUpperCase() }));
  const editCoupon = (coupon) => {
    setForm(coupon);
    setShowAdd(true);
  };
  
  const addCoupon = async () => {
    if (!form.code || !form.discount_value) { alert('Code and discount value are required'); return; }
    try {
      await saApi.post('/coupons', { ...form, code: form.code.toUpperCase() });
      reload();
      setForm({ code:'', type:'global', target_email:'', discount_type:'percent', discount_value:10, max_uses:'', expiry_date:'', description:'' });
      setShowAdd(false);
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    } catch (e) { alert(e.message); }
  };
  const removeCoupon = async (code) => {
    if (!confirm(`Remove coupon ${code}?`)) return;
    try {
      await saApi.del(`/coupons/${code}`);
      reload();
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    } catch {}
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
                        <button className="btn btn-sm btn-ghost" style={{color:'var(--accent-primary)',fontSize:'0.7rem'}} onClick={()=>editCoupon(c)}>Edit</button>
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
  const DEFAULT_BRANDING = { platform_name: 'RecoverLab', tagline: 'Professional Data Recovery CRM', support_email: 'support@recoverlab.in', support_phone: '', logo_url: '', favicon_url: '', primary_color: '#00d4ff', accent_color: '#8b5cf6', terms_url: '', privacy_url: '', twitter_url: '', linkedin_url: '' };
  const load = () => { try { return JSON.parse(localStorage.getItem('sa_branding') || 'null') || {}; } catch { return {}; } };
  const [form, setForm] = useState(() => ({ ...DEFAULT_BRANDING, ...load() }));
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState({ logo: false, favicon: false });
  const [imageErrors, setImageErrors] = useState({ logo: false, favicon: false });

  // Load branding from backend on mount
  useEffect(() => {
    fetch('/api/settings/branding').then(r => r.ok ? r.json() : null).then(d => {
      if (d && d.platform_name) {
        setForm(f => ({ ...f, ...d }));
        localStorage.setItem('sa_branding', JSON.stringify(d));
        window.__branding = d;
        window.dispatchEvent(new CustomEvent('sa_branding_update', { detail: d }));
        applyBranding(d);
      }
    }).catch(() => {});
  }, []);

  const hexToRgba = (hex, a = 1) => {
    try {
      const h = hex.replace('#', '');
      const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    } catch (e) { return hex; }
  };

  const applyBranding = (b) => {
    if (!b) return;
    try { document.title = b.platform_name || document.title; } catch (e) {}
    try {
      if (b.favicon_url) {
        const ts = Date.now();
        const old = document.querySelector("link[rel~='icon']");
        if (old) old.remove();
        let link = document.createElement('link');
        link.rel = 'icon'; link.type = 'image/x-icon'; link.href = `${b.favicon_url}?v=${ts}`;
        document.getElementsByTagName('head')[0].appendChild(link);
      }
    } catch (e) {}
    try {
      const root = document.documentElement;
      if (b.accent_color) {
        root.style.setProperty('--accent-primary', b.accent_color);
        root.style.setProperty('--accent-glow', hexToRgba(b.accent_color, 0.14));
        root.style.setProperty('--accent-glow-strong', hexToRgba(b.accent_color, 0.28));
      }
      if (b.primary_color) {
        root.style.setProperty('--status-info', b.primary_color);
        root.style.setProperty('--status-info-bg', hexToRgba(b.primary_color, 0.12));
      }
    } catch (e) {}
  };

<<<<<<< HEAD
  const handleFileUpload = async (field, file) => {
    console.log(`Uploading ${field}:`, file.name);
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'];
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload a valid image file (JPG, PNG, GIF, SVG, WebP, or ICO)');
      return;
    }
    
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    const fieldKey = field === 'logo' ? 'logo_url' : 'favicon_url';
    
    // Reset error state and start uploading
    setImageErrors(e => ({ ...e, [field]: false }));
    setUploading(u => ({ ...u, [field]: true }));
    
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/super-admin/branding/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        body: fd,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      const data = await res.json();
      console.log(`Upload response for ${field}:`, data);
      
      if (data.url) {
        // Update form with server URL
        setForm(f => {
          const newForm = { ...f, [fieldKey]: data.url };
          console.log(`Updated form after ${field} upload:`, newForm);
          return newForm;
        });
      }
    } catch (e) { 
      console.error(`Upload failed for ${field}:`, e);
      alert('Upload failed: ' + e.message); 
    } finally { 
      setUploading(u => ({ ...u, [field]: false })); 
    }
  };

  const save = () => {
    console.log('Saving branding with form data:', form);
    localStorage.setItem('sa_branding', JSON.stringify(form));
    applyBranding(form);
    window.__branding = form;
    window.dispatchEvent(new CustomEvent('sa_branding_update', { detail: form }));
    saApi.put('/settings', { branding: form })
      .then(() => console.log('Branding saved successfully'))
      .catch(err => console.error('Failed to save branding:', err));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
=======
  const save = () => { localStorage.setItem('sa_branding', JSON.stringify(form)); applyBranding(form); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const reset = () => { localStorage.removeItem('sa_branding'); setForm({ ...DEFAULT_BRANDING }); applyBranding(DEFAULT_BRANDING); setSaved(true); setTimeout(() => setSaved(false), 2000); };
>>>>>>> 389f48cffc70f5609955a908ae817717ba7d9296

  useEffect(() => { try { const stored = load(); if (stored) applyBranding(stored); } catch (e) {} }, []);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Platform Identity</div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Platform Name</label><input className="form-input" value={form.platform_name} onChange={e => setForm(f => ({ ...f, platform_name: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Tagline</label><input className="form-input" value={form.tagline} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} /></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Logo</label>
            {form.logo_url && (
              <div style={{ 
                width: '100%', 
                height: 120, 
                marginBottom: 12,
                border: '2px dashed var(--border-default)', 
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-subtle)',
                padding: 12,
                position: 'relative',
                overflow: 'hidden'
              }}>
                {imageErrors.logo ? (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>⚠️ Failed to load image</span>
                ) : (
                  <img 
                    src={form.logo_url} 
                    alt="Logo Preview" 
                    style={{ 
                      maxWidth: '100%', 
                      maxHeight: '100%', 
                      objectFit: 'contain',
                      display: 'block'
                    }} 
                    onError={() => setImageErrors(e => ({ ...e, logo: true }))}
                  />
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
                {uploading.logo ? 'Uploading...' : (form.logo_url ? 'Change Logo' : 'Upload Logo')}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload('logo', f); e.target.value = ''; }} />
              </label>
              {form.logo_url && (
                <button 
                  type="button"
                  className="btn btn-sm btn-danger" 
                  onClick={() => { setForm(f => ({ ...f, logo_url: '' })); setImageErrors(e => ({ ...e, logo: false })); }}
                  style={{ padding: '4px 10px' }}
                >
                  Remove
                </button>
              )}
            </div>
            <input className="form-input" style={{ marginTop: 8, fontSize: '0.72rem' }} placeholder="Or paste logo URL" value={form.logo_url} onChange={e => { setForm(f => ({ ...f, logo_url: e.target.value })); setImageErrors(er => ({ ...er, logo: false })); }} />
            <div style={{ marginTop: 6, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Recommended: PNG or SVG, transparent background, 200×60px
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Favicon</label>
            {form.favicon_url && (
              <div style={{ 
                width: '100%', 
                height: 120, 
                marginBottom: 12,
                border: '2px dashed var(--border-default)', 
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-subtle)',
                padding: 20,
                position: 'relative',
                overflow: 'hidden'
              }}>
                {imageErrors.favicon ? (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>⚠️ Failed to load image</span>
                ) : (
                  <img 
                    src={form.favicon_url} 
                    alt="Favicon Preview" 
                    style={{ 
                      maxWidth: '80px',
                      maxHeight: '80px',
                      objectFit: 'contain',
                      display: 'block',
                      imageRendering: 'crisp-edges'
                    }} 
                    onError={() => setImageErrors(e => ({ ...e, favicon: true }))}
                  />
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
                {uploading.favicon ? 'Uploading...' : (form.favicon_url ? 'Change Favicon' : 'Upload Favicon')}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload('favicon', f); e.target.value = ''; }} />
              </label>
              {form.favicon_url && (
                <button 
                  type="button"
                  className="btn btn-sm btn-danger" 
                  onClick={() => { setForm(f => ({ ...f, favicon_url: '' })); setImageErrors(e => ({ ...e, favicon: false })); }}
                  style={{ padding: '4px 10px' }}
                >
                  Remove
                </button>
              )}
            </div>
            <input className="form-input" style={{ marginTop: 8, fontSize: '0.72rem' }} placeholder="Or paste favicon URL" value={form.favicon_url} onChange={e => { setForm(f => ({ ...f, favicon_url: e.target.value })); setImageErrors(er => ({ ...er, favicon: false })); }} />
            <div style={{ marginTop: 6, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Recommended: ICO, PNG or SVG, 32×32px or 64×64px
            </div>
          </div>
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
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={save}>{saved ? 'Saved!' : 'Save Branding Settings'}</button>
        <button className="btn btn-secondary" onClick={reset}>Reset to Default</button>
      </div>
    </div>
  );
}

// ── SEO Tab ─────────────────────────────────────────────────────────────────
function SeoTab() {
  const load = () => { try { return JSON.parse(localStorage.getItem('sa_seo') || 'null') || {}; } catch { return {}; } };
  const [form, setForm] = useState(() => ({ meta_title: 'RecoverLab CRM — Professional Data Recovery Platform', meta_description: 'The complete SaaS CRM for data recovery labs. Manage cases, clients, inventory, billing and team with one platform.', meta_keywords: 'data recovery CRM, data recovery software, hard drive recovery tool', og_image_url: '', canonical_url: 'https://recoverlab.in', robots: 'index, follow', google_analytics_id: '', google_tag_manager_id: '', facebook_pixel_id: '', sitemap_enabled: true, schema_org_enabled: true, ...load() }));
  const [saved, setSaved] = useState(false);
  const applySeo = (s) => {
    if (!s) return;
    try { document.title = s.meta_title || document.title; } catch (e) {}
    try {
      const setMeta = (name, value, prop = 'name') => {
        if (!value) return;
        let el = document.querySelector(`meta[${prop}="${name}"]`);
        if (!el) { el = document.createElement('meta'); el.setAttribute(prop, name); document.head.appendChild(el); }
        el.content = value;
      };
      setMeta('description', s.meta_description || '');
      setMeta('keywords', s.meta_keywords || '');
      setMeta('robots', s.robots || '');
      // OpenGraph
      const setOg = (name, value) => { if (!value) return; let el = document.querySelector(`meta[property="og:${name}"]`); if (!el) { el = document.createElement('meta'); el.setAttribute('property', `og:${name}`); document.head.appendChild(el); } el.content = value; };
      setOg('title', s.meta_title || '');
      setOg('description', s.meta_description || '');
      if (s.og_image_url) setOg('image', s.og_image_url);
      // canonical
      if (s.canonical_url) {
        let link = document.querySelector("link[rel='canonical']");
        if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
        link.href = s.canonical_url;
      }
    } catch (e) {}

    // Analytics scripts (lightweight injection; avoid duplicates)
    try {
      // Remove existing sa-ga or sa-gtm scripts
      const existingGa = document.getElementById('sa-ga'); if (existingGa) existingGa.remove();
      const existingGtag = document.getElementById('sa-gtm'); if (existingGtag) existingGtag.remove();
      if (s.google_analytics_id) {
        const s1 = document.createElement('script'); s1.id = 'sa-ga'; s1.async = true; s1.src = `https://www.googletagmanager.com/gtag/js?id=${s.google_analytics_id}`; document.head.appendChild(s1);
        const s2 = document.createElement('script'); s2.id = 'sa-ga-init'; s2.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config','${s.google_analytics_id}');`; document.head.appendChild(s2);
      }
      if (s.google_tag_manager_id && !s.google_analytics_id) {
        const sGtm = document.createElement('script'); sGtm.id = 'sa-gtm'; sGtm.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${s.google_tag_manager_id}');`; document.head.appendChild(sGtm);
      }
    } catch (e) {}

    // Dispatch event so other pages can react
    try { window.dispatchEvent(new CustomEvent('sa_seo_update', { detail: s })); } catch (e) {}
  };

  const save = () => { localStorage.setItem('sa_seo', JSON.stringify(form)); applySeo(form); setSaved(true); setTimeout(() => setSaved(false), 2000); };

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
    hero_badge: 'Enterprise Data Recovery CRM',
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
    show_client_portal: true,
    app_name: 'RecoverLab CRM',
    app_tagline: 'Enterprise Data Recovery Platform',
    logo_emoji: '\uD83D\uDCBE',
    primary_color: '#00d4ff',
    features: [
      { icon: '\uD83D\uDCC2', title: 'Case Management', desc: 'Full lifecycle tracking from intake to delivery' },
      { icon: '\uD83D\uDCB3', title: 'Billing & Invoicing', desc: 'Auto-generate invoices, quotations and receipts' },
      { icon: '\uD83D\uDEE0\uFE0F', title: 'Inventory & Donors', desc: 'Smart matching of donor drives to active cases' },
    ],
    how_it_works: [
      { step: '01', icon: '\uD83D\uDCE5', title: 'Receive Device', desc: 'Log the faulty device into the CRM with client details.' },
      { step: '02', icon: '\uD83D\uDD2C', title: 'Diagnose & Quote', desc: 'Engineers assess the damage and auto-send a quotation.' },
      { step: '03', icon: '\uD83D\uDD27', title: 'Perform Recovery', desc: 'Track the recovery process stage by stage.' },
      { step: '04', icon: '\uD83D\uDCE6', title: 'Deliver & Invoice', desc: 'Generate invoice, send payment link, mark delivered.' },
    ],
    why_us: [
      { icon: '\uD83D\uDEE1\uFE0F', title: 'Enterprise Security', desc: 'Per-user AES-256 encryption, 2FA authentication.' },
      { icon: '\u26A1', title: 'Real-time Everything', desc: 'Live case updates, team chat, webhook events.' },
      { icon: '\uD83D\uDD17', title: 'Integrates Anywhere', desc: 'Connect to n8n, Zapier, Slack, or any HTTP endpoint.' },
      { icon: '\uD83D\uDCF1', title: 'Mobile Responsive', desc: 'Full mobile support with adaptive layouts.' },
      { icon: '\uD83D\uDCBE', title: 'Data Never Lost', desc: 'Automated backups including all images.' },
      { icon: '\uD83C\uDFAF', title: 'Built for Recovery Labs', desc: 'HDD/SSD/RAID-specific workflows and analytics.' },
    ],
    testimonials: [
      { name: 'Rohit Mehta', role: 'Owner, DataFix Solutions', text: 'We\'ve been able to scale our lab operations to 3x without hiring additional staff.' },
      { name: 'Priya Sharma', role: 'Operations Head, Stellar Data', text: 'The case management and automated billing alone saved us 20 hours a week.' },
      { name: 'Amit Patel', role: 'CTO, DiskDoctor Services', text: 'No more spreadsheets, no more missed follow-ups. It just works.' },
    ],
    footer_text: `© ${new Date().getFullYear()} RecoverLab. All rights reserved.`,
    ...load(),
  }));
  const [saved, setSaved] = useState(false);

  // Load homepage from backend on mount
  useEffect(() => {
    fetch('/api/settings/homepage').then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        // Handle both pre-parsed (object) and JSON string responses
        const parsed = typeof d === 'string' ? JSON.parse(d) : d;
        if (parsed && parsed.hero_title) {
          setForm(f => ({ ...f, ...parsed }));
          localStorage.setItem('sa_homepage', JSON.stringify(parsed));
        }
      }
    }).catch(() => {});
  }, []);

  const applyHomepage = (h) => {
    try { window.dispatchEvent(new CustomEvent('sa_homepage_update', { detail: h })); } catch (e) {}
    try { localStorage.setItem('sa_homepage', JSON.stringify(h)); } catch (e) {}
  };

  const save = () => {
    applyHomepage(form);
<<<<<<< HEAD
    // Persist to backend
    saApi.put('/settings', { homepage: form }).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
=======
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    saApi.patch('/settings', { key: 'homepage', value: form }).catch(() => {});
>>>>>>> 389f48cffc70f5609955a908ae817717ba7d9296
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Announcement Banner */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="card-title" style={{ margin: 0 }}>Announcement Banner</div>
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

      {/* App Identity */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>App Identity</div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">App Name</label><input className="form-input" value={form.app_name} onChange={e => setForm(f => ({ ...f, app_name: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Tagline</label><input className="form-input" value={form.app_tagline} onChange={e => setForm(f => ({ ...f, app_tagline: e.target.value }))} /></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Logo Emoji</label><input className="form-input" value={form.logo_emoji} onChange={e => setForm(f => ({ ...f, logo_emoji: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Primary Color</label><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="color" value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))} style={{ width: 44, height: 36, padding: 2, border: '1px solid var(--border-default)', borderRadius: 6, cursor: 'pointer' }} /><span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{form.primary_color}</span></div></div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Hero Section</div>
        <div className="form-group"><label className="form-label">Badge Text (optional)</label><input className="form-input" value={form.hero_badge} onChange={e => setForm(f => ({ ...f, hero_badge: e.target.value }))} /></div>
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
        {[['show_pricing_section', 'Pricing / Plans Section'], ['show_features_section', 'Features Grid Section'], ['show_testimonials', 'Testimonials Section'], ['show_faq', 'FAQ Section'], ['show_client_portal', 'Client Portal Section']].map(([key, label]) => (
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
        <button className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, features: [...f.features, { icon: '\u2B50', title: 'New Feature', desc: 'Describe this feature' }] }))}>Add Feature Card</button>
      </div>

      {/* How It Works */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>How It Works Steps</div>
        {form.how_it_works.map((item, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '50px 50px 1fr 1fr auto', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label" style={{ fontSize: '0.68rem' }}>Step</label><input className="form-input" value={item.step} onChange={e => { const arr = [...form.how_it_works]; arr[idx] = { ...arr[idx], step: e.target.value }; setForm(f => ({ ...f, how_it_works: arr })); }} /></div>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label" style={{ fontSize: '0.68rem' }}>Icon</label><input className="form-input" value={item.icon} onChange={e => { const arr = [...form.how_it_works]; arr[idx] = { ...arr[idx], icon: e.target.value }; setForm(f => ({ ...f, how_it_works: arr })); }} /></div>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label" style={{ fontSize: '0.68rem' }}>Title</label><input className="form-input" value={item.title} onChange={e => { const arr = [...form.how_it_works]; arr[idx] = { ...arr[idx], title: e.target.value }; setForm(f => ({ ...f, how_it_works: arr })); }} /></div>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label" style={{ fontSize: '0.68rem' }}>Description</label><input className="form-input" value={item.desc} onChange={e => { const arr = [...form.how_it_works]; arr[idx] = { ...arr[idx], desc: e.target.value }; setForm(f => ({ ...f, how_it_works: arr })); }} /></div>
            <button onClick={() => setForm(f => ({ ...f, how_it_works: f.how_it_works.filter((_, i) => i !== idx) }))} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 6, padding: '7px 10px', cursor: 'pointer', marginBottom: 0 }}>Remove</button>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, how_it_works: [...f.how_it_works, { step: '0' + (f.how_it_works.length + 1), icon: '', title: '', desc: '' }] }))}>Add Step</button>
      </div>

      {/* Why Us */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Why Us Points</div>
        {form.why_us.map((item, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr auto', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label" style={{ fontSize: '0.68rem' }}>Icon</label><input className="form-input" value={item.icon} onChange={e => { const arr = [...form.why_us]; arr[idx] = { ...arr[idx], icon: e.target.value }; setForm(f => ({ ...f, why_us: arr })); }} /></div>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label" style={{ fontSize: '0.68rem' }}>Title</label><input className="form-input" value={item.title} onChange={e => { const arr = [...form.why_us]; arr[idx] = { ...arr[idx], title: e.target.value }; setForm(f => ({ ...f, why_us: arr })); }} /></div>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label" style={{ fontSize: '0.68rem' }}>Description</label><input className="form-input" value={item.desc} onChange={e => { const arr = [...form.why_us]; arr[idx] = { ...arr[idx], desc: e.target.value }; setForm(f => ({ ...f, why_us: arr })); }} /></div>
            <button onClick={() => setForm(f => ({ ...f, why_us: f.why_us.filter((_, i) => i !== idx) }))} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 6, padding: '7px 10px', cursor: 'pointer', marginBottom: 0 }}>Remove</button>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, why_us: [...f.why_us, { icon: '', title: '', desc: '' }] }))}>Add Why Us Point</button>
      </div>

      {/* Testimonials */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Testimonials</div>
        {form.testimonials.map((item, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label" style={{ fontSize: '0.68rem' }}>Name</label><input className="form-input" value={item.name} onChange={e => { const arr = [...form.testimonials]; arr[idx] = { ...arr[idx], name: e.target.value }; setForm(f => ({ ...f, testimonials: arr })); }} /></div>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label" style={{ fontSize: '0.68rem' }}>Role</label><input className="form-input" value={item.role} onChange={e => { const arr = [...form.testimonials]; arr[idx] = { ...arr[idx], role: e.target.value }; setForm(f => ({ ...f, testimonials: arr })); }} /></div>
            <div className="form-group" style={{ margin: 0 }}><label className="form-label" style={{ fontSize: '0.68rem' }}>Text</label><input className="form-input" value={item.text} onChange={e => { const arr = [...form.testimonials]; arr[idx] = { ...arr[idx], text: e.target.value }; setForm(f => ({ ...f, testimonials: arr })); }} /></div>
            <button onClick={() => setForm(f => ({ ...f, testimonials: f.testimonials.filter((_, i) => i !== idx) }))} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 6, padding: '7px 10px', cursor: 'pointer', marginBottom: 0 }}>Remove</button>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, testimonials: [...f.testimonials, { name: '', role: '', text: '' }] }))}>Add Testimonial</button>
      </div>

      <div className="form-group"><label className="form-label">Footer Copyright Text</label><input className="form-input" value={form.footer_text} onChange={e => setForm(f => ({ ...f, footer_text: e.target.value }))} /></div>
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
  const [resendingId, setResendingId] = useState(null);
  const [resendMsg, setResendMsg] = useState('');
  const [exporting, setExporting] = useState(false);

  const openPdf = async (id) => {
    try {
      const token = getToken();
      const res = await fetch(`/api/super-admin/purchases/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Failed to load PDF' })); alert(err.error); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) { alert('Popup blocked. Allow popups to view PDF.'); URL.revokeObjectURL(url); }
    } catch (e) {
      alert(`Error: ${e.message}`);
    }
  };

  const resendInvoice = async (id) => {
    setResendingId(id);
    setResendMsg('');
    try {
      const res = await saApi.post(`/purchases/${id}/resend-invoice`);
      if (res.error) { setResendMsg(`Error: ${res.error}`); return; }
      setResendMsg('Resent successfully');
    } catch (e) {
      setResendMsg(`Error: ${e.message}`);
    } finally {
      setResendingId(null);
      setTimeout(() => setResendMsg(''), 4000);
    }
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/super-admin/purchases/export-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'success' }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Export failed' })); alert(err.error); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `Invoices_Export_${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Export failed: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  const [invoicePage, setInvoicePage] = useState(1);
  const PER_PAGE = 15;
  const invoices = purchases.filter(p => p.status === 'success').map((p, i) => ({
    ...p,
    invoice_number: `${settings.invoice_prefix}-${String(i + 1).padStart(4, '0')}`,
    gst_amount: Math.round((p.amount || 0) * (settings.gst_percent || 18) / 100),
    total_with_gst: Math.round((p.amount || 0) * (1 + (settings.gst_percent || 18) / 100)),
  }));
  const paginatedInvoices = invoices.slice((invoicePage - 1) * PER_PAGE, invoicePage * PER_PAGE);

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
          {invoices.length > 0 && <button className="btn btn-secondary btn-sm" onClick={exportAll} disabled={exporting}>{exporting ? 'Exporting...' : 'Export All'}</button>}
        </div>
        {invoices.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}><div className="empty-icon">📭</div><div className="empty-title">No paid subscriptions yet</div><div className="empty-desc">Invoices are auto-generated when Razorpay payment.captured webhook fires</div></div>
        ) : (
          <div className="table-container">
            <table>
              <thead><tr><th>Invoice #</th><th>Subscriber</th><th>Plan</th><th>Amount</th><th>GST ({settings.gst_percent}%)</th><th>Total</th><th>Date</th><th>Actions</th></tr></thead>
              <tbody>
                {paginatedInvoices.map(inv => (
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
                        <button className="btn btn-sm btn-secondary" onClick={() => openPdf(inv.id)}>📄 PDF</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => resendInvoice(inv.id)} disabled={resendingId === inv.id}>{resendingId === inv.id ? 'Sending...' : '📄 Resend'}</button>
                        {resendMsg && resendingId === null && <span style={{ fontSize: '0.7rem', color: resendMsg.includes('Error') ? '#ef4444' : '#22c55e', alignSelf: 'center' }}>{resendMsg}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {invoices.length > PER_PAGE && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Showing {Math.min((invoicePage - 1) * PER_PAGE + 1, invoices.length)}–{Math.min(invoicePage * PER_PAGE, invoices.length)} of {invoices.length}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" disabled={invoicePage === 1} onClick={() => setInvoicePage(p => p - 1)}>Prev</button>
                  <button className="btn btn-secondary btn-sm" disabled={invoicePage * PER_PAGE >= invoices.length} onClick={() => setInvoicePage(p => p + 1)}>Next</button>
                </div>
              </div>
            )}
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
    try {
      await saApi.post('/accounts', form);
      setForm({ name: '', email: '', password: '', role: 'support_admin', permissions: 'view_only' });
      setShowAdd(false);
      setSaved(true); setTimeout(() => setSaved(false), 1500);
      reload();
    } catch (e) { alert(e.message); }
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
              <UserAvatar
                name={acc.name || acc.email}
                avatarUrl={acc.avatar_url || null}
                size={42}
              />
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
                    <button className="btn btn-sm btn-secondary" onClick={async () => { try { await saApi.patch(`/accounts/${acc.id}`, { is_active: !acc.is_active }); reload(); } catch {} }}>
                      {acc.is_active ? '\u23F8 Deactivate' : '\u25B6 Activate'}
                    </button>
                    <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)', fontSize: '0.72rem' }} onClick={async () => { if (!confirm(`Delete ${acc.name}?`)) return; try { await saApi.del(`/accounts/${acc.id}`); reload(); } catch {} }}>Delete</button>
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
      ${rows.map(r => `<tr><td>${new Date(r.created_at || r.at || Date.now()).toLocaleString()}</td><td>${(r.action||r.title||'')}</td><td>${(r.description||r.detail||'')}</td><td>${r.module||r.resource_type||''}</td></tr>`).join('')}
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
          <div key={log.id} className="sa-activity-card" style={{ display: 'flex', gap: 14, padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', alignItems: 'center' }}>
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
                <div key={l.id || l.request_id || Math.random()} className="sa-activity-card" style={{ display: 'flex', gap: 14, padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
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
  const [health, setHealth] = useState([
    { label: 'API Server', status: 'operational', uptime: '99.97%' },
    { label: 'Database', status: 'operational', uptime: '99.99%' },
    { label: 'File Storage', status: 'operational', uptime: '99.95%' },
    { label: 'Email (SMTP)', status: form.smtp_host ? 'configured' : 'not_configured', uptime: form.smtp_host ? '—' : '—' },
    { label: 'Razorpay Webhook', status: localStorage.getItem('sa_rzp_verified') === 'true' ? 'verified' : 'not_verified', uptime: '—' },
  ]);
  
  const save = () => { localStorage.setItem('sa_platform', JSON.stringify(form)); setSaved(true); setTimeout(() => setSaved(false), 2000); };

  // Load uptime stats from API on mount
  useEffect(() => {
    saApi.get('/platform-uptime')
      .then(data => {
        if (data && typeof data === 'object') {
          const healthData = [
            { label: data.api?.label || 'API Server', status: data.api?.status || 'operational', uptime: data.api?.uptime || '99.97%' },
            { label: data.database?.label || 'Database', status: data.database?.status || 'operational', uptime: data.database?.uptime || '99.99%' },
            { label: data.storage?.label || 'File Storage', status: data.storage?.status || 'operational', uptime: data.storage?.uptime || '99.95%' },
            { label: data.email?.label || 'Email (SMTP)', status: form.smtp_host ? 'configured' : 'not_configured', uptime: form.smtp_host ? data.email?.uptime || '99.90%' : '—' },
            { label: 'Razorpay Webhook', status: localStorage.getItem('sa_rzp_verified') === 'true' ? 'verified' : 'not_verified', uptime: '—' },
          ];
          setHealth(healthData);
        }
      })
      .catch(() => {});
  }, [form.smtp_host]);

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
function StatCard({ label, value, sub, color }) {
  const isNumeric = typeof value === 'number' || /^[₹\d,.\s]+$/.test(String(value));
  return (
    <div className="sa-stat-card" style={{ '--sa-stat-color': color }}>
      <div className="sa-stat-glow" style={{ background: color }} />
      <div className="sa-stat-label">{label}</div>
      <div className={`sa-stat-value${isNumeric ? ' sa-stat-numeric' : ''}`}>{value}</div>
      {sub && <div className="sa-stat-sub">{sub}</div>}
    </div>
  );
}

// ── Dashboard Tab ──────────────────────────────────────────────────────────
function DashboardTab({ tenants, stats, dashboardStats, onAddTenant }) {
  const plans = getPlans();
  const SEV_COLORS = { success:'#10b981', info:'var(--accent-primary)', warn:'#f59e0b', danger:'#ef4444' };
  const [recentActivity, setRecentActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityPage, setActivityPage] = useState(1);
  const ACTIVITY_PER_PAGE = 3;
  useEffect(() => {
    let cancelled = false;
    setActivityLoading(true);
    saApi.get('/dashboard/recent-activity').then(data => {
      if (cancelled) return;
      const activities = (data.activities || []).map(a => {
        const actionUpper = (a.action || '').toUpperCase();
        let severity = 'info';
        if (/create|add|new/i.test(actionUpper)) severity = 'success';
        else if (/update|edit|change|modify/i.test(actionUpper)) severity = 'info';
        else if (/delete|remove|suspend|cancel|expire/i.test(actionUpper)) severity = 'danger';
        else if (/payment|paid|revenue|invoice/i.test(actionUpper)) severity = 'success';
        return {
          action: a.action,
          detail: a.description || a.title,
          user_name: a.user_name,
          severity,
          at: a.created_at,
        };
      });
      setRecentActivity(activities);
      setActivityLoading(false);
    }).catch(() => { if (!cancelled) setActivityLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const health = [
    { label:'API Server',        status:'operational' },
    { label:'Database',          status:'operational' },
    { label:'File Storage',      status:'operational' },
    { label:'Email (SMTP)',      status: localStorage.getItem('sa_smtp_host') ? 'configured' : 'not_configured' },
    { label:'Razorpay Webhook',  status: localStorage.getItem('sa_rzp_verified') === 'true' ? 'verified' : 'not_configured' },
  ];
  const backendMrr = parseFloat(dashboardStats?.revenue?.mrr) || 0;
  const backendTotalRevenue = parseFloat(dashboardStats?.revenue?.total_revenue) || 0;
  const planRevenue = plans.map(p => ({ ...p, count: tenants.filter(t => t.plan === p.key).length }));
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
        <StatCard icon={statIcons.mrr}      label="Monthly Revenue" value={`₹${planRevenue.reduce((sum, p) => sum + p.price * p.count, 0).toLocaleString('en-IN')}`} sub="Active subscriptions" color="#8b5cf6" />
        <StatCard icon={statIcons.plan}     label="Total Revenue"   value={`₹${backendTotalRevenue.toLocaleString('en-IN')}`} sub="All time (from purchases)" color="#f59e0b" />
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
            {activityLoading ? (
              <div style={{ padding: '12px 0', textAlign: 'center' }}><div className="spinner" style={{ width: 18, height: 18, margin: '0 auto' }} /></div>
            ) : recentActivity.length === 0 ? (
              <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>No recent activity</div>
            ) : (
              <>
                {recentActivity.slice((activityPage - 1) * ACTIVITY_PER_PAGE, activityPage * ACTIVITY_PER_PAGE).map((log, i) => (
                  <div key={i} className="sa-activity-item" style={{ padding: '8px 0' }}>
                    <div className="sa-activity-dot" style={{ background: SEV_COLORS[log.severity] }} />
                    <div style={{ flex: 1 }}>
                      <span className="sa-activity-action" style={{ background: `${SEV_COLORS[log.severity]}18`, color: SEV_COLORS[log.severity] }}>{log.action}</span>
                      <div className="sa-activity-detail">{log.detail}</div>
                      <div className="sa-activity-time">{log.user_name} · {timeAgo(log.at)}</div>
                    </div>
                  </div>
                ))}
                {recentActivity.length > ACTIVITY_PER_PAGE && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '10px 0 4px', borderTop: '1px solid var(--border-subtle)' }}>
                    <button
                      onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                      disabled={activityPage === 1}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: activityPage === 1 ? 'var(--bg-muted)' : 'var(--bg-elevated)', color: activityPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: activityPage === 1 ? 'default' : 'pointer', fontSize: '0.72rem', fontWeight: 600 }}
                    >← Prev</button>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {activityPage} / {Math.ceil(recentActivity.length / ACTIVITY_PER_PAGE)}
                    </span>
                    <button
                      onClick={() => setActivityPage(p => Math.min(Math.ceil(recentActivity.length / ACTIVITY_PER_PAGE), p + 1))}
                      disabled={activityPage >= Math.ceil(recentActivity.length / ACTIVITY_PER_PAGE)}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: activityPage >= Math.ceil(recentActivity.length / ACTIVITY_PER_PAGE) ? 'var(--bg-muted)' : 'var(--bg-elevated)', color: activityPage >= Math.ceil(recentActivity.length / ACTIVITY_PER_PAGE) ? 'var(--text-muted)' : 'var(--text-primary)', cursor: activityPage >= Math.ceil(recentActivity.length / ACTIVITY_PER_PAGE) ? 'default' : 'pointer', fontSize: '0.72rem', fontWeight: 600 }}
                    >Next →</button>
                  </div>
                )}
              </>
            )}
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
  const [testStatus, setTestStatus] = useState(null);
  const [testMsg, setTestMsg] = useState('');

  // Fetch Super Admin SMTP config from backend on mount
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const res = await fetch('/api/settings/smtp/super-admin', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.host) {
          setCfg(c => ({
            ...c,
            smtp_host: data.host || '',
            smtp_port: data.port || 587,
            smtp_user: data.user || '',
            smtp_pass: '',
            smtp_from_email: data.from_email || '',
            smtp_from_name: data.from_name || 'RecoverLab CRM',
          }));
        }
      } catch {}
    })();
  }, []);
  const [tab, setTab] = useState('smtp');

  const save = async () => {
    localStorage.setItem('sa_email_config', JSON.stringify(cfg));
    // Save to Super Admin SMTP config endpoint (separate from Admin/Company SMTP)
    try {
      const token = localStorage.getItem('accessToken');
      await fetch('/api/settings/smtp/super-admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          host: cfg.smtp_host,
          port: Number(cfg.smtp_port) || 587,
          user: cfg.smtp_user,
          ...(cfg.smtp_pass ? { password: cfg.smtp_pass } : {}),
          from_name: cfg.smtp_from_name,
          from_email: cfg.smtp_from_email,
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
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/settings/smtp/super-admin/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
  const [tenantPage, setTenantPage] = useState(1);
  const [purchasePage, setPurchasePage] = useState(1);
  const PER_PAGE = 15;

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
      setTenants(Array.isArray(data) ? data : (data?.tenants || []));
    } catch { } finally { setLoading(false); }
  }, []);

  const loadPurchases = useCallback(() => {
    saApi.get('/purchases').then(d => {
      if (Array.isArray(d)) setBackendPurchases(d);
    }).catch(() => {});
  }, []);

  const onTenantChange = useCallback(() => {
    load();
    loadPurchases();
  }, [load, loadPurchases]);

  useEffect(() => { load(); }, [load]);

  // Fetch dashboard stats + purchases from backend
  useEffect(() => {
    saApi.get('/dashboard').then(d => {
      if (d && d.tenants) setDashboardStats(d);
    }).catch(() => {});
    loadPurchases();
  }, [loadPurchases]);

  const handleImpersonate = async (tenant) => {
    try {
      const res = await saApi.post(`/login-as/${tenant.id}`);
      if (res.error) { alert(res.error); return; }
      if (!res.token) { alert('Failed to get access token'); return; }
      sessionStorage.setItem('accessTokenOverride', res.token);
      const url = `${window.location.origin}/`;
      window.open(url, '_blank');
    } catch (e) {
      alert('Impersonation failed: ' + (e.message || 'Unknown error'));
    }
  };

  const handleToggle = async (tenant) => {
    const newStatus = tenant.status === 'suspended' ? 'active' : 'suspended';
    try {
      await saApi.patch(`/tenants/${tenant.id}`, { status: newStatus });
      load();
    } catch (e) { alert(e.message); }
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

  // Dashboard stats from backend
  const [dashboardStats, setDashboardStats] = useState({ tenants: {}, revenue: { total_revenue: 0, mrr: 0 }, topActions: [], planStats: [] });

  // Purchase tracking state — merge backend data + local simulated
  const [purchases, setPurchases] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sa_purchase_log') || '[]'); } catch { return []; }
  });
  const [backendPurchases, setBackendPurchases] = useState([]);
  const allPurchases = useMemo(() => {
    const mapped = (backendPurchases || []).map(bp => ({
      id: bp.id,
      timestamp: bp.created_at || bp.paid_at,
      tenant_name: bp.full_name || bp.company_name || '',
      tenant_email: bp.email || '',
      plan: bp.plan_key,
      plan_label: bp.plan_label || bp.plan_key,
      amount: parseFloat(bp.amount) || 0,
      status: bp.status === 'paid' ? 'success' : bp.status,
      razorpay_payment_id: bp.razorpay_payment_id,
      razorpay_order_id: bp.razorpay_order_id,
      source: 'db',
    }));
    const merged = [...purchases, ...mapped].filter((item, idx, self) =>
      idx === self.findIndex(t => t.id === item.id)
    );
    return merged.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }, [purchases, backendPurchases]);
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
    <div className="super-admin-layout">
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
        <DashboardTab tenants={tenants} stats={stats} dashboardStats={dashboardStats} onAddTenant={() => setShowAdd(true)} />
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
                  {filtered.slice((tenantPage - 1) * PER_PAGE, tenantPage * PER_PAGE).map(t => (
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
              {filtered.length > PER_PAGE && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Showing {Math.min((tenantPage - 1) * PER_PAGE + 1, filtered.length)}–{Math.min(tenantPage * PER_PAGE, filtered.length)} of {filtered.length}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" disabled={tenantPage === 1} onClick={() => setTenantPage(p => p - 1)}>Prev</button>
                    <button className="btn btn-secondary btn-sm" disabled={tenantPage * PER_PAGE >= filtered.length} onClick={() => setTenantPage(p => p + 1)}>Next</button>
                  </div>
                </div>
              )}
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
        <RazorpaySettingsTab />
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
            <div className="card-title">
              Subscription Purchase Tracker
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
                ({allPurchases.length} total · {backendPurchases.length} from DB · {purchases.length} local)
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={loadPurchases}>Refresh</button>
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
              '', 'Successful', allPurchases.filter(p => p.status === 'success').length, '#10b981',
            ], [
              '', 'Failed', allPurchases.filter(p => p.status === 'failed').length, '#ef4444',
            ], [
              '', 'Pending', allPurchases.filter(p => p.status === 'pending').length, '#f59e0b',
            ], [
              '', 'Total Revenue', fmtAmt(allPurchases.filter(p => p.status === 'success').reduce((s, p) => s + (p.amount || 0), 0)), '#8b5cf6',
            ]].map(([icon, label, val, color]) => (
              <div key={label} className="card" style={{ padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
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
                  <th>Subscriber</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Razorpay ID</th>
                  <th>Actions</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {allPurchases.length === 0 ? (
                  <tr><td colSpan={8}>
                    <div className="empty-state" style={{ padding: 40 }}>
                      <div className="empty-icon">📭</div>
                      <div className="empty-title">No Purchase Events</div>
                      <div className="empty-desc">Run the seed script or configure Razorpay webhook to add purchases.</div>
                    </div>
                  </td></tr>
                ) : allPurchases.slice((purchasePage - 1) * PER_PAGE, purchasePage * PER_PAGE).map(p => (
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
                    <td><span className="font-mono" style={{ fontWeight: 700 }}>{fmtAmt(p.amount)}</span></td>
                    <td>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: 999, fontFamily: 'var(--font-mono)',
                        background: p.status === 'success' ? 'rgba(16,185,129,0.15)' : p.status === 'failed' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                        color: p.status === 'success' ? '#10b981' : p.status === 'failed' ? '#ef4444' : '#f59e0b',
                      }}>{p.status.toUpperCase()}</span>
                    </td>
                    <td>
                      {p.razorpay_payment_id ? (
                        <span className="font-mono text-xs" style={{ color: 'var(--accent-primary)' }}>{p.razorpay_payment_id}</span>
                      ) : <span className="text-xs text-muted">N/A</span>}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openPdf(p.id)}>PDF</button>
                    </td>
                    <td>{p.source === 'db' ? 'DB' : 'Local'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allPurchases.length > PER_PAGE && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Showing {Math.min((purchasePage - 1) * PER_PAGE + 1, allPurchases.length)}–{Math.min(purchasePage * PER_PAGE, allPurchases.length)} of {allPurchases.length}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" disabled={purchasePage === 1} onClick={() => setPurchasePage(p => p - 1)}>Prev</button>
                  <button className="btn btn-secondary btn-sm" disabled={purchasePage * PER_PAGE >= allPurchases.length} onClick={() => setPurchasePage(p => p + 1)}>Next</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Branding Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'branding' && <BrandingTab />}

      {/* ── SEO Tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'seo' && <SeoSettingsTab />}

      {/* ── Homepage Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'homepage' && <HomepageSettingsTab />}

      {/* ── Invoices Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'invoices' && <InvoiceSettingsTab />}

      {/* ── 2FA Tab ────────────────────────────────────────────────────────── */}
      {activeTab === '2fa' && <TwoFASettingsTab />}

      {/* ── SA Accounts Tab ────────────────────────────────────────────────── */}
      {activeTab === 'accounts' && <AccountsTab />}

      {/* ── Activity Logs Tab ──────────────────────────────────────────────── */}
      {activeTab === 'logs' && <ActivityLogsTab />}

      {/* ── Platform Settings Tab ── */}
      {activeTab === 'platform' && <PlatformTab />}

      {/* ── Email Deliverability Tab ──────────────────────────────────────────── */}
      {activeTab === 'email_delivery' && <EmailDeliverabilityTab />}

      {/* Automation Center Tab */}
      {activeTab === 'automation' && (
        <React.Suspense fallback={<div className="spinner" style={{ width: 40, height: 40 }} /> }>
          <SuperAdminAutomation />
        </React.Suspense>
      )}

      </div>{/* end sa-main */}

      {showAdd && <AddTenantModal onClose={() => setShowAdd(false)} onDone={onTenantChange} />}
      {editTenant && <EditTenantModal tenant={editTenant} onClose={() => setEditTenant(null)} onDone={onTenantChange} />}
      {viewUsersTenant && <TenantUsersModal tenant={viewUsersTenant} onClose={() => setViewUsersTenant(null)} />}
    </div>
  );
}
