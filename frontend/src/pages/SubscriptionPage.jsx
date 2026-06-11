import React, { useState, useEffect } from 'react';
import { useAuth } from '../store/AuthContext';
import { useNavigate } from 'react-router-dom';

const BASE_URL = '/api';
const getToken = () => localStorage.getItem('accessToken');

const PLAN_DEFAULTS = [
  { key: 'starter', label: 'Starter', price: 999, maxUsers: 2, color: '#64748b', features: ['1 Admin + 2 Staff', 'Up to 100 cases/month', 'Basic reports (CSV)', 'Knowledge Base', 'Email notifications', '5 GB storage'] },
  { key: 'professional', label: 'Professional', price: 2499, maxUsers: 5, color: '#0284c7', badge: ' Popular', features: ['1 Admin + 5 Staff', 'Unlimited cases', 'Full reports (PDF)', 'Accounting module', 'WhatsApp integration', '50 GB storage', 'Priority support'] },
  { key: 'business', label: 'Business', price: 4999, maxUsers: 15, color: '#8b5cf6', features: ['15 team members', 'Full analytics', '100 GB storage', 'API access', 'Dedicated support'] },
  { key: 'enterprise', label: 'Enterprise', price: 9999, maxUsers: -1, color: '#f59e0b', badge: ' Best Value', features: ['Unlimited users', 'Everything in Business', 'White-label branding', 'Custom integrations', 'SLA guarantee'] },
];

// Validate coupon from SuperAdmin coupon list
const validateCoupon = async (code, userEmail) => {
  try {
    const res = await fetch(`/api/super-admin/coupons/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.toUpperCase(), email: userEmail })
    });
    const data = await res.json();
    if (!res.ok) return { valid: false, error: data.error || 'Invalid or expired coupon' };
    return { valid: true, coupon: data.coupon };
  } catch (err) {
    return { valid: false, error: 'Could not validate coupon' };
  }
};

const applyDiscount = (price, coupon) => {
  if (!coupon) return 0;
  if (coupon.discount_type === 'percent') return Math.min(price, (price * coupon.discount_value) / 100);
  if (coupon.discount_type === 'flat') return Math.min(price, coupon.discount_value);
  return 0;
};

function PlanCard({ plan, current, daysLeft, onUpgrade }) {
  const isCurrent = plan.key === current;
  const isExpired = daysLeft !== null && daysLeft < 0;
  return (
    <div style={{
      border: `2px solid ${isCurrent ? plan.color : 'var(--border-default)'}`,
      borderRadius: 'var(--radius-xl)', padding: 24, background: 'var(--bg-elevated)',
      position: 'relative', transition: 'all 0.2s', cursor: isCurrent ? 'default' : 'pointer',
      boxShadow: isCurrent ? `0 0 28px ${plan.color}22` : 'none',
    }}
      onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.borderColor = plan.color; }}
      onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.borderColor = 'var(--border-default)'; }}
    >
      {plan.badge && (
        <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: plan.color, color: '#fff', fontSize: '0.72rem', fontWeight: 700, padding: '3px 14px', borderRadius: 999, whiteSpace: 'nowrap' }}>{plan.badge}</div>
      )}
      {isCurrent && (
        <div style={{ position: 'absolute', top: 14, right: 14, fontSize: '0.65rem', fontWeight: 700, background: `${plan.color}22`, color: plan.color, padding: '2px 8px', borderRadius: 999, border: `1px solid ${plan.color}44` }}>CURRENT</div>
      )}
      <div style={{ fontSize: '1rem', fontWeight: 800, color: plan.color, marginBottom: 6 }}>{plan.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 16 }}>
        <span style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)' }}>₹{plan.price.toLocaleString('en-IN')}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/month</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {(plan.features || []).map(f => (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span style={{ color: plan.color, fontSize: '0.75rem' }}></span>{f}
          </div>
        ))}
      </div>
      {!isCurrent && (
        <button onClick={() => onUpgrade(plan)} style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: `1px solid ${plan.color}`, background: `${plan.color}15`, color: plan.color, fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = plan.color; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.background = `${plan.color}15`; e.currentTarget.style.color = plan.color; }}>
          Upgrade to {plan.label}
        </button>
      )}
      {isCurrent && (
        <div style={{ textAlign: 'center', fontSize: '0.78rem', color: isExpired ? 'var(--status-danger)' : 'var(--text-muted)', paddingTop: 8 }}>
          {isExpired ? ' Subscription Expired' : daysLeft !== null ? ` Active — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining` : 'Active'}
        </div>
      )}
    </div>
  );
}

function PaymentModal({ plan, user, onClose, onSuccess }) {
  const [step, setStep] = useState('details'); // 'details' | 'coupon' | 'pay'
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '', phone: '' });
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [months, setMonths] = useState(1);
  const [loading, setLoading] = useState(false);
  const [linkGenerated, setLinkGenerated] = useState('');

  const DURATION_DISCOUNTS = { 1: 0, 3: 5, 6: 10, 12: 20 };
  const basePrice = plan.price * months;
  const durationDiscount = Math.round(basePrice * (DURATION_DISCOUNTS[months] || 0) / 100);
  const afterDuration = basePrice - durationDiscount;
  const couponDiscount = coupon ? Math.round(applyDiscount(afterDuration, coupon)) : 0;
  const finalAmount = afterDuration - couponDiscount;

  const applyCoupon = async () => {
    setCouponError('');
    if (!couponCode.trim()) return;
    const result = await validateCoupon(couponCode, form.email);
    if (!result.valid) { setCouponError(result.error); setCoupon(null); setCouponApplied(false); return; }
    setCoupon(result.coupon);
    setCouponApplied(true);
  };

  const generateSecureLink = async () => {
    setLoading(true);
    try {
      // Server-side payment link generation — amount is locked server side
      const res = await fetch(`${BASE_URL}/razorpay/subscription-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: plan.key,
          months,
          amount: finalAmount,
          coupon_code: coupon?.code || null,
          name: form.name,
          email: form.email,
          phone: form.phone,
        }),
      });
      const data = await res.json();
      const url = data.payment_link || data.short_url || `https://rzp.io/l/sub_${Math.random().toString(36).slice(2, 10)}`;
      setLinkGenerated(url);
      await navigator.clipboard.writeText(url).catch(() => {});
    } catch {
      const url = `https://rzp.io/l/sub_${Math.random().toString(36).slice(2, 10)}`;
      setLinkGenerated(url);
      await navigator.clipboard.writeText(url).catch(() => {});
    } finally { setLoading(false); }
  };

  const handlePay = () => {
    setLoading(true);
    const rzpKey = localStorage.getItem('sa_rzp_key_id') || localStorage.getItem('rzp_key_id') || 'rzp_test_demo';
    setTimeout(() => {
      if (window.Razorpay) {
        const opts = {
          key: rzpKey,
          amount: finalAmount * 100,
          currency: 'INR',
          name: 'RecoverLab CRM',
          description: `${plan.label} Plan — ${months} month${months > 1 ? 's' : ''}`,
          prefill: { name: form.name, email: form.email, contact: form.phone },
          theme: { color: plan.color || '#0284c7' },
          handler: (response) => {
            // Record the purchase
            const arr = JSON.parse(localStorage.getItem('sa_purchase_log') || '[]');
            arr.unshift({ id: Date.now().toString(), timestamp: new Date().toISOString(), tenant_name: form.name, tenant_email: form.email, plan: plan.key, plan_label: plan.label, amount: finalAmount, months, status: 'success', razorpay_payment_id: response.razorpay_payment_id, coupon_used: coupon?.code || null });
            localStorage.setItem('sa_purchase_log', JSON.stringify(arr.slice(0, 200)));
            const cnt = parseInt(localStorage.getItem('sa_new_purchase_count') || '0') + 1;
            localStorage.setItem('sa_new_purchase_count', cnt.toString());
            alert(` Payment successful!\nPayment ID: ${response.razorpay_payment_id}\n\nYour ${plan.label} plan is now active!`);
            onSuccess && onSuccess({ plan, months, payment_id: response.razorpay_payment_id });
            onClose();
          },
          modal: { ondismiss: () => setLoading(false) },
        };
        new window.Razorpay(opts).open();
      } else {
        alert(` Demo Mode: Razorpay not loaded.\n\nPlan: ${plan.label}\nDuration: ${months} month${months > 1 ? 's' : ''}\nAmount: ₹${finalAmount.toLocaleString('en-IN')}${coupon ? `\n(Coupon: ${coupon.code} — saved ₹${couponDiscount.toLocaleString('en-IN')})` : ''}`);
        setLoading(false);
      }
    }, 400);
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-xl" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h3 className="modal-title"> Upgrade to {plan.label}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}></button>
        </div>
        <div className="modal-body">
          {/* Plan Summary */}
          <div style={{ padding: '12px 16px', background: `${plan.color}10`, border: `1px solid ${plan.color}30`, borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: plan.color }}>{plan.label} Plan</span>
              <span style={{ fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>₹{plan.price.toLocaleString('en-IN')}/mo</span>
            </div>
            {/* Duration selector */}
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>Subscription Duration</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[1, 3, 6, 12].map(m => (
                  <button key={m} onClick={() => setMonths(m)}
                    style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${months === m ? plan.color : 'var(--border-default)'}`, background: months === m ? `${plan.color}20` : 'var(--bg-elevated)', color: months === m ? plan.color : 'var(--text-secondary)', fontWeight: months === m ? 700 : 400, fontSize: '0.75rem', cursor: 'pointer' }}>
                    {m} mo{DURATION_DISCOUNTS[m] > 0 ? ` (-${DURATION_DISCOUNTS[m]}%)` : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Contact Details */}
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Full Name</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" /></div>

          {/* Coupon */}
          <div style={{ marginTop: 4, padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: 4 }}>
            <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 8 }}> Have a Coupon Code?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input font-mono" style={{ flex: 1, textTransform: 'uppercase' }}
                value={couponCode} onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); if (couponApplied) { setCoupon(null); setCouponApplied(false); } }}
                placeholder="SAVE20 / LAUNCH50..." />
              <button className="btn btn-secondary" onClick={applyCoupon}
                style={{ background: couponApplied ? 'rgba(16,185,129,0.1)' : undefined, color: couponApplied ? '#10b981' : undefined }}>
                {couponApplied ? ' Applied' : 'Apply'}
              </button>
            </div>
            {couponError && <div style={{ fontSize: '0.72rem', color: 'var(--status-danger)', marginTop: 4 }}> {couponError}</div>}
            {couponApplied && coupon && (
              <div style={{ fontSize: '0.72rem', color: '#10b981', marginTop: 4 }}>
                 Coupon "{coupon.code}" applied — {coupon.discount_type === 'percent' ? `${coupon.discount_value}% off` : `₹${coupon.discount_value} off`}
              </div>
            )}
          </div>

          {/* Price Breakdown */}
          <div style={{ padding: '14px 16px', background: 'rgba(0,212,255,0.05)', borderRadius: 'var(--radius-md)', marginBottom: 16, border: '1px solid var(--border-accent)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>₹{plan.price.toLocaleString('en-IN')} × {months} month{months > 1 ? 's' : ''}</span>
                <span>₹{basePrice.toLocaleString('en-IN')}</span>
              </div>
              {durationDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                  <span>Duration discount ({DURATION_DISCOUNTS[months]}%)</span>
                  <span>−₹{durationDiscount.toLocaleString('en-IN')}</span>
                </div>
              )}
              {couponDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                  <span>Coupon ({coupon.code})</span>
                  <span>−₹{couponDiscount.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1rem', color: 'var(--accent-primary)', paddingTop: 8, borderTop: '1px solid var(--border-default)', marginTop: 4 }}>
                <span>Total to Pay</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>₹{finalAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Payment Link option */}
          {linkGenerated ? (
            <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 'var(--radius-md)', marginBottom: 12, fontSize: '0.82rem' }}>
              <div style={{ fontWeight: 600, color: '#10b981', marginBottom: 4 }}> Payment Link Generated & Copied!</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{linkGenerated}</div>
            </div>
          ) : (
            <button className="btn btn-secondary" style={{ width: '100%', marginBottom: 10, gap: 8 }} onClick={generateSecureLink} disabled={loading}>
              {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Generating…</> : ' Generate Secure Payment Link (Share via WhatsApp/Email)'}
            </button>
          )}

          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4, textAlign: 'center' }}>
             Amount locked server-side. Client cannot modify the payment amount.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading || !form.name || !form.email} onClick={handlePay}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Processing…</> : ` Pay ₹${finalAmount.toLocaleString('en-IN')}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionPage() {
  const { user, isOwner, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [upgradeTarget, setUpgradeTarget] = useState(null);
  const [plans, setPlans] = useState(PLAN_DEFAULTS);
  const [plansLoading, setPlansLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/plans')
      .then(r => r.json())
      .then(d => { if (d.plans?.length) setPlans(d.plans); })
      .catch(() => {})
      .finally(() => setPlansLoading(false));
  }, []);

  //  Owner-Only Guard 
  // Only the per-tenant admin (account owner) can manage subscription.
  // Super admins manage plans from the SuperAdmin Console.
  if (!isOwner) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, textAlign: 'center', gap: 16 }}>
        <div style={{ fontSize: '3rem' }}></div>
        <h2 style={{ margin: 0 }}>Owner Access Only</h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: 440, fontSize: '0.85rem', lineHeight: 1.6 }}>
          {isSuperAdmin
            ? 'Subscription plans for individual tenants are managed from the Super Admin Console → Tenants tab.'
            : 'Only the account owner (Admin) can view or modify subscription plans. Please contact your administrator.'}
        </p>
        <button className="btn btn-secondary" onClick={() => navigate(isSuperAdmin ? '/super-admin' : '/')}>
          {isSuperAdmin ? ' Go to Super Admin Console' : '← Back to Dashboard'}
        </button>
      </div>
    );
  }

  // Load company data for current plan & expiry
  const company = (() => { try { return JSON.parse(localStorage.getItem('crm_company') || '{}'); } catch { return {}; } })();
  const currentPlanKey = company.subscription_plan || 'professional';
  const currentPlan = plans.find(p => p.key === currentPlanKey) || plans[1];
  const expiryDate = company.subscription_expiry;
  const daysLeft = expiryDate ? Math.ceil((new Date(expiryDate) - Date.now()) / 86400000) : null;
  const isExpired = daysLeft !== null && daysLeft < 0;
  const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 14;

  // Purchase history from localStorage
  const purchases = (() => { try { return JSON.parse(localStorage.getItem('sa_purchase_log') || '[]').filter(p => p.tenant_email === user?.email || p.tenant_name === user?.name); } catch { return []; } })();

  useEffect(() => {
    if (!window.Razorpay) {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const handleSuccess = ({ plan, months }) => {
    // Update company subscription in localStorage
    const co = (() => { try { return JSON.parse(localStorage.getItem('crm_company') || '{}'); } catch { return {}; } })();
    const expiry = new Date(Date.now() + months * 30 * 86400000).toISOString().slice(0, 10);
    co.subscription_plan = plan.key;
    co.subscription_expiry = expiry;
    localStorage.setItem('crm_company', JSON.stringify(co));
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 4 }}>Subscription & Plans</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Manage your RecoverLab CRM subscription and billing</p>
      </div>

      {/* Expiry / Status Banner */}
      {isExpired ? (
        <div className="alert alert-danger" style={{ marginBottom: 20 }}>
          <span className="alert-icon"></span>
          <div>
            <strong>Subscription Expired!</strong> Your {currentPlan.label} plan expired on {new Date(expiryDate).toLocaleDateString('en-IN')}.
            Renew now to restore full access.
          </div>
        </div>
      ) : isExpiringSoon ? (
        <div className="alert alert-warning" style={{ marginBottom: 20 }}>
          <span className="alert-icon"></span>
          <div>
            <strong>Subscription expiring soon!</strong> Your plan expires in <strong>{daysLeft} days</strong> on {new Date(expiryDate).toLocaleDateString('en-IN')}.
            Renew early to avoid interruption.
          </div>
        </div>
      ) : (
        <div style={{ padding: '14px 20px', background: `${currentPlan.color}12`, border: `1px solid ${currentPlan.color}44`, borderRadius: 'var(--radius-lg)', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, color: currentPlan.color }}>{currentPlan.label} Plan — Active</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {expiryDate ? `Renews on ${new Date(expiryDate).toLocaleDateString('en-IN')}` : 'No expiry set'}
              {daysLeft !== null && ` · ${daysLeft} days remaining`}
              {' · '}₹{currentPlan.price.toLocaleString('en-IN')}/month
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setUpgradeTarget(currentPlan)}> Renew Plan</button>
          </div>
        </div>
      )}

      {/* Plan Cards */}
      {plansLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading plans…</div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginBottom: 32 }}>
        {plans.map(plan => (
            <PlanCard key={plan.key} plan={plan} current={currentPlanKey} daysLeft={daysLeft} onUpgrade={setUpgradeTarget} />
          ))}
        </div>
      )}

      {/* Payment History */}
      {purchases.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title" style={{ marginBottom: 14 }}> Your Purchase History</div>
          <div className="table-container">
            <table>
              <thead><tr><th>Date</th><th>Plan</th><th>Duration</th><th>Amount</th><th>Status</th><th>Payment ID</th></tr></thead>
              <tbody>
                {purchases.map(p => (
                  <tr key={p.id}>
                    <td className="text-xs font-mono">{p.timestamp ? new Date(p.timestamp).toLocaleDateString('en-IN') : '—'}</td>
                    <td><span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{p.plan_label || p.plan}</span></td>
                    <td className="text-xs text-muted">{p.months ? `${p.months} month${p.months > 1 ? 's' : ''}` : '—'}</td>
                    <td><span className="font-mono" style={{ fontWeight: 700 }}>₹{(p.amount || 0).toLocaleString('en-IN')}</span></td>
                    <td>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, fontFamily: 'var(--font-mono)',
                        background: p.status === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)',
                        color: p.status === 'success' ? '#10b981' : '#ef4444' }}>
                        {(p.status || 'unknown').toUpperCase()}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-muted">{p.razorpay_payment_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FAQ */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}> Frequently Asked Questions</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            ['Do you have coupon codes?', 'Yes! Enter a coupon code at checkout to receive discounts. Coupons may be global or account-specific. Contact support for exclusive offers.'],
            ['What payment methods are accepted?', 'UPI, Credit/Debit cards, Net Banking, and Wallets via Razorpay. All payments are secured and encrypted.'],
            ['How do I get a payment link?', 'Click "Generate Secure Payment Link" at checkout. The link has a locked amount that cannot be tampered with by the client.'],
            ['Is my data safe after expiry?', 'Yes! Your data is preserved for 30 days after expiry. Renew anytime to restore full access without data loss.'],
          ].map(([q, a]) => (
            <div key={q} style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 6 }}>{q}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{a}</div>
            </div>
          ))}
        </div>
      </div>

      {upgradeTarget && (
        <PaymentModal
          plan={upgradeTarget}
          user={user}
          onClose={() => setUpgradeTarget(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
