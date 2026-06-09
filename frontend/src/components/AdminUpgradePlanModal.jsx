/**
 * Admin Upgrade/Renew Plan Modal
 * For admins to upgrade or renew a subscriber's plan
 * Opens Razorpay checkout for payment
 */

import React, { useState, useEffect } from 'react';

const getToken = () => localStorage.getItem('accessToken');

const saApi = {
  async post(path, body) {
    const res = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5001/api'}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`,
      },
      body: JSON.stringify(body),
    });
    return res.json();
  },
  async get(path) {
    const res = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5001/api'}${path}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
    });
    return res.json();
  },
};

export function AdminUpgradePlanModal({ tenant, onClose, onSuccess }) {
  const [plans, setPlans] = useState([]);
  const [newPlan, setNewPlan] = useState(tenant.plan);
  const [months, setMonths] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    saApi.get('/super-admin/plans')
      .then(res => {
        if (res.plans) setPlans(res.plans);
      })
      .catch(() => {});
  }, []);

  const selectedPlan = plans.find(p => p.key === newPlan) || plans[0];
  const amount = selectedPlan ? selectedPlan.price * months : 0;

  const handleUpgrade = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Step 1: Create order via admin endpoint
      const orderRes = await saApi.post(`/super-admin/tenants/${tenant.id}/upgrade-plan`, {
        new_plan: newPlan,
        months,
      });

      if (orderRes.error) throw new Error(orderRes.error);

      const { order_id, purchase_id, key_id } = orderRes;

      // Step 2: Load Razorpay script
      if (!window.Razorpay) {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        document.head.appendChild(script);

        await new Promise((resolve, reject) => {
          script.onload = resolve;
          setTimeout(() => {
            if (!window.Razorpay) reject(new Error('Razorpay script failed to load'));
            else resolve();
          }, 3000);
        });
      }

      // Step 3: Open Razorpay checkout
      const options = {
        key: key_id,
        amount: amount * 100, // in paise
        currency: 'INR',
        name: 'RecoverLab',
        description: `${selectedPlan.label} Plan - ${tenant.company_name}`,
        order_id: order_id,
        handler: async (response) => {
          try {
            // Step 4: Verify payment
            const verifyRes = await saApi.post('/razorpay/verify-payment', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              purchase_id: purchase_id,
            });

            if (verifyRes.success) {
              // PLAN FEATURES NOW ACTIVE IN RUNNING APP
              // Backend has already updated the user's subscription_plan, status, and expiry
              // Frontend can now fetch fresh user data with new plan features via /api/auth/me
              
              alert(`✅ Payment successful!\n\nPlan upgraded to ${selectedPlan.label}\n\nYour new plan features are now active!`);
              
              // Trigger user data refresh so AuthContext gets updated subscription data
              // This causes UI components to re-render with new features
              if (window.__refreshUserData) {
                window.__refreshUserData();
              }
              
              onSuccess?.();
              onClose();
            } else {
              throw new Error(verifyRes.error || 'Payment verification failed');
            }
          } catch (err) {
            alert(`❌ Payment verification failed:\n\n${err.message}`);
          }
        },
        prefill: {
          name: 'Admin',
          email: tenant.admin_email,
        },
        theme: { color: '#00d4ff' },
        modal: {
          ondismiss: () => {
            setLoading(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-md" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Upgrade / Renew Plan</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '20px' }}>
          {error && (
            <div style={{
              padding: '10px 12px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 'var(--radius-md)',
              color: '#ef4444',
              fontSize: '0.8rem',
              marginBottom: '16px',
            }}>
              ❌ {error}
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label className="form-label">Subscriber</label>
            <div style={{ 
              padding: '10px 12px',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.9rem',
            }}>
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>{tenant.company_name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{tenant.admin_email}</div>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label className="form-label">Current Plan</label>
            <div style={{
              padding: '10px 12px',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.9rem',
              fontWeight: 600,
            }}>
              {tenant.plan || 'Free'}
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label className="form-label">New Plan</label>
            <select 
              className="form-input"
              value={newPlan}
              onChange={e => setNewPlan(e.target.value)}
              disabled={loading}
            >
              {plans.map(p => (
                <option key={p.key} value={p.key}>
                  {p.label} - ₹{p.price.toLocaleString('en-IN')}/month
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label className="form-label">Months</label>
            <input 
              type="number"
              className="form-input"
              min="1"
              max="36"
              value={months}
              onChange={e => setMonths(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={loading}
            />
          </div>

          <div className="card" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', marginBottom: '16px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Total Amount</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)' }}>
              ₹{amount.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {selectedPlan?.label} × {months} month(s)
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              className="btn btn-primary btn-block"
              onClick={handleUpgrade}
              disabled={loading || !selectedPlan}
            >
              {loading ? '⏳ Opening Payment...' : '💳 Proceed to Payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
