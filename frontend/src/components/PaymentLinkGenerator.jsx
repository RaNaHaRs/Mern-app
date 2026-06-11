/**
 * Payment Link Generator Component
 * Generates shareable Razorpay payment links for new subscribers
 * Separate from checkout flow
 */

import React, { useState } from 'react';

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
};

export function PaymentLinkGenerator({ plan, months, customerEmail, customerName, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await saApi.post('/payment-link/generate', {
        amount: plan.price * months,
        plan_key: plan.key,
        plan_label: plan.label,
        months,
        description: `${plan.label} Plan × ${months} month(s)`,
        customer_email: customerEmail,
        customer_name: customerName,
      });

      if (res.error) throw new Error(res.error);

      setGenerated(res);
      if (onSuccess) onSuccess(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(generated.payment_link);
    alert('Payment link copied to clipboard!');
  };

  if (generated) {
    return (
      <div className="modal-overlay">
        <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title">✅ Payment Link Generated</h3>
            <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
          </div>

          <div style={{ padding: '20px' }}>
            {/* Email Status Feedback */}
            {generated.customer_email && (
              <div style={{
                marginBottom: '16px',
                padding: '12px',
                background: generated.email_sent 
                  ? 'rgba(16,185,129,0.1)' 
                  : generated.email_error 
                    ? 'rgba(239,68,68,0.1)'
                    : 'rgba(100,116,139,0.05)',
                border: generated.email_sent 
                  ? '1px solid rgba(16,185,129,0.3)'
                  : generated.email_error
                    ? '1px solid rgba(239,68,68,0.3)'
                    : '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
              }}>
                {generated.email_sent ? (
                  <>
                    <div style={{ color: '#10b981', fontWeight: 600, marginBottom: '4px' }}>
                      ✓ Email sent successfully
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Payment link has been sent to <strong>{generated.customer_email}</strong>
                    </div>
                  </>
                ) : generated.email_error ? (
                  <>
                    <div style={{ color: '#ef4444', fontWeight: 600, marginBottom: '4px' }}>
                      ⚠ Email could not be sent
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {generated.email_error}. The payment link is still active and can be shared manually.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                      📧 Preparing to send email...
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="card" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', marginBottom: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#22c55e', marginBottom: '8px' }}>PAYMENT LINK GENERATED</div>
              
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Amount</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                  ₹{generated.amount.toLocaleString('en-IN')}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Plan</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{generated.plan_label} × {generated.months} month(s)</div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Status</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#22c55e' }}>Active</div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Created</div>
                <div style={{ fontSize: '0.8rem' }}>
                  {new Date(generated.created_at).toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-muted)' }}>PAYMENT LINK</div>
              <div style={{ 
                display: 'flex', 
                gap: '8px',
                background: 'var(--bg-secondary)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
              }}>
                <input 
                  type="text"
                  readOnly
                  value={generated.payment_link}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    fontSize: '0.8rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button 
                  className="btn btn-sm btn-primary"
                  onClick={handleCopyLink}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  📋 Copy
                </button>
              </div>
            </div>

            <div style={{ 
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              padding: '12px',
              background: 'rgba(59, 130, 246, 0.1)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
            }}>
              💡 Share this link with your customer. They can click it to pay via Razorpay.
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button className="btn btn-block" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Generate Payment Link</h3>
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

          <div className="card" style={{ background: 'rgba(100, 116, 139, 0.05)', marginBottom: '16px' }}>
            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Amount</span>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                ₹{(plan.price * months).toLocaleString('en-IN')}
              </div>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {plan.label} × {months} month(s)
            </div>
          </div>

          <button 
            className="btn btn-block btn-primary"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? '⏳ Generating...' : '🔗 Generate Payment Link'}
          </button>

          <div style={{
            marginTop: '12px',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}>
            A shareable link will be created. No payment is collected here.
          </div>
        </div>
      </div>
    </div>
  );
}
