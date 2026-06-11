import React, { useState, useEffect } from 'react';

const BASE_URL = '/api/super-admin';
const getToken = () => localStorage.getItem('accessToken');

const paymentsApi = {
  list: (params) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${BASE_URL}/payments?${query}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    }).then(r => r.json());
  },
  createManual: (data) => fetch(`${BASE_URL}/payments/manual`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  refund: (id, data) => fetch(`${BASE_URL}/payments/${id}/refund`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  getOverdue: () => fetch(`${BASE_URL}/payments/overdue`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  }).then(r => r.json()),
};

const STATUS_COLORS = {
  paid: '#10b981',
  pending: '#f59e0b',
  failed: '#ef4444',
  refunded: '#6366f1',
};

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

function PaymentManagement({ tenants }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ status: '', tenant_id: '' });
  const [showManualModal, setShowManualModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [overdueCount, setOverdueCount] = useState(0);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const data = await paymentsApi.list({ page, limit, ...filters });
      setPayments(data.payments || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to load payments:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadOverdueCount = async () => {
    try {
      const data = await paymentsApi.getOverdue();
      setOverdueCount(data.overdue_payments?.length || 0);
    } catch (err) {
      console.error('Failed to load overdue count:', err);
    }
  };

  useEffect(() => {
    loadPayments();
    loadOverdueCount();
  }, [page, limit]);

  const handleFilterApply = () => {
    setPage(1);
    loadPayments();
  };

  const formatAmount = (amt) => `₹${parseFloat(amt || 0).toLocaleString('en-IN')}`;
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0 }}>Payment Management</h3>
          <p style={{ fontSize: '0.85rem', color: '#666', margin: '4px 0 0' }}>
            Manage payments, refunds, and offline transactions
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowManualModal(true)}>
          + Record Manual Payment
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: 14, minWidth: 160 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Payments</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{total}</div>
        </div>
        <div className="card" style={{ padding: 14, minWidth: 160 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Overdue/Failed</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444' }}>{overdueCount}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, minWidth: 200 }}>
            <label className="form-label">Status</label>
            <select className="form-select" value={filters.status} 
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 250 }}>
            <label className="form-label">Tenant</label>
            <select className="form-select" value={filters.tenant_id} 
              onChange={e => setFilters(f => ({ ...f, tenant_id: e.target.value }))}>
              <option value="">All Tenants</option>
              {tenants?.map(t => (
                <option key={t.id} value={t.id}>{t.company_name || t.admin_email}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-secondary" onClick={handleFilterApply}>Apply Filters</button>
          <button className="btn btn-ghost" onClick={() => { setFilters({ status: '', tenant_id: '' }); setPage(1); }}>
            Clear
          </button>
        </div>
      </div>

      {/* Payments Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} />
        </div>
      ) : payments.length === 0 ? (
        <div className="empty-state" style={{ padding: 60 }}>
          <div className="empty-title">No payments found</div>
          <div className="empty-desc">Record manual payments or adjust filters</div>
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Tenant</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontSize: '0.82rem' }}>
                      {formatDate(p.created_at)}
                      {p.paid_at && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Paid: {formatDate(p.paid_at)}
                      </div>}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.company_name || p.tenant_name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.tenant_email}</div>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {p.plan_label} × {p.months}mo
                    </td>
                    <td style={{ fontWeight: 700, fontSize: '0.9rem' }}>{formatAmount(p.amount)}</td>
                    <td style={{ fontSize: '0.75rem' }}>
                      {p.razorpay_payment_id ? 'Razorpay' : p.payment_method || 'Online'}
                    </td>
                    <td>
                      <span style={{ 
                        fontSize: '0.72rem', padding: '3px 10px', borderRadius: 12, 
                        fontWeight: 700, textTransform: 'uppercase',
                        background: `${STATUS_COLORS[p.status] || '#64748b'}20`, 
                        color: STATUS_COLORS[p.status] || '#64748b' 
                      }}>
                        {p.status}
                      </span>
                      {p.status === 'refunded' && p.refund_amount && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          Refunded: {formatAmount(p.refund_amount)}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {p.status === 'paid' && (
                          <button className="btn btn-sm" 
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}
                            onClick={() => { setSelectedPayment(p); setShowRefundModal(true); }}>
                            Refund
                          </button>
                        )}
                        {p.invoice_url && (
                          <button className="btn btn-sm btn-secondary" onClick={() => window.open(p.invoice_url, '_blank')}>
                            Invoice
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Showing {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} of {total}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm btn-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <button className="btn btn-sm btn-secondary" disabled={page * limit >= total} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Manual Payment Modal */}
      {showManualModal && <ManualPaymentModal tenants={tenants} onClose={() => setShowManualModal(false)} onSuccess={() => { loadPayments(); setShowManualModal(false); }} />}

      {/* Refund Modal */}
      {showRefundModal && selectedPayment && <RefundModal payment={selectedPayment} onClose={() => { setShowRefundModal(false); setSelectedPayment(null); }} onSuccess={() => { loadPayments(); setShowRefundModal(false); setSelectedPayment(null); }} />}
    </div>
  );
}

// Manual Payment Modal Component
function ManualPaymentModal({ tenants, onClose, onSuccess }) {
  const [form, setForm] = useState({
    tenant_user_id: '',
    plan_key: 'professional',
    plan_label: 'Professional',
    amount: 2499,
    months: 1,
    payment_method: 'bank_transfer',
    reference_number: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.tenant_user_id || !form.amount || form.amount <= 0) {
      setError('Please select tenant and enter valid amount');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await paymentsApi.createManual(form);
      if (res.error) {
        setError(res.error);
        return;
      }
      alert('✅ Manual payment recorded successfully!');
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  const PLANS = [
    { key: 'starter', label: 'Starter', price: 999 },
    { key: 'professional', label: 'Professional', price: 2499 },
    { key: 'business', label: 'Business', price: 4999 },
    { key: 'enterprise', label: 'Enterprise', price: 9999 },
  ];

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h3 className="modal-title">Record Manual Payment</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{error}</div>}
          
          <div className="form-group">
            <label className="form-label required">Tenant</label>
            <select className="form-select" value={form.tenant_user_id} 
              onChange={e => setForm(f => ({ ...f, tenant_user_id: e.target.value }))}>
              <option value="">Select Tenant...</option>
              {tenants?.map(t => (
                <option key={t.id} value={t.id}>{t.company_name || t.admin_email}</option>
              ))}
            </select>
          </div>

          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Plan</label>
              <select className="form-select" value={form.plan_key} 
                onChange={e => {
                  const plan = PLANS.find(p => p.key === e.target.value);
                  setForm(f => ({ ...f, plan_key: e.target.value, plan_label: plan.label, amount: plan.price * f.months }));
                }}>
                {PLANS.map(p => (
                  <option key={p.key} value={p.key}>{p.label} (₹{p.price}/mo)</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Duration</label>
              <select className="form-select" value={form.months} 
                onChange={e => {
                  const months = parseInt(e.target.value);
                  const plan = PLANS.find(p => p.key === form.plan_key);
                  setForm(f => ({ ...f, months, amount: plan.price * months }));
                }}>
                <option value={1}>1 Month</option>
                <option value={3}>3 Months</option>
                <option value={6}>6 Months</option>
                <option value={12}>12 Months</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label required">Amount (₹)</label>
            <input type="number" className="form-input" value={form.amount} 
              onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
          </div>

          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Payment Method</label>
              <select className="form-select" value={form.payment_method} 
                onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
                {PAYMENT_METHODS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Reference Number</label>
              <input className="form-input" value={form.reference_number} 
                onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))} 
                placeholder="TXN123456" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" value={form.notes} 
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} 
              placeholder="Internal notes..." style={{ minHeight: 60 }} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Refund Modal Component
function RefundModal({ payment, onClose, onSuccess }) {
  const [amount, setAmount] = useState(payment.amount);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRefund = async () => {
    if (!reason.trim()) {
      setError('Please provide a reason for the refund');
      return;
    }
    if (amount <= 0 || amount > payment.amount) {
      setError(`Refund amount must be between ₹0.01 and ₹${payment.amount}`);
      return;
    }
    if (!confirm(`Process refund of ₹${amount} for ${payment.company_name || payment.tenant_email}?`)) {
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      const res = await paymentsApi.refund(payment.id, { amount, reason });
      if (res.error) {
        setError(res.error);
        return;
      }
      alert('✅ Refund processed successfully!');
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to process refund');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3 className="modal-title">Process Refund</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{error}</div>}
          
          {/* Payment Details */}
          <div className="card" style={{ background: 'var(--bg-elevated)', marginBottom: 16, padding: 14 }}>
            <div style={{ display: 'grid', gap: 8, fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Tenant:</span>
                <span style={{ fontWeight: 600 }}>{payment.company_name || payment.tenant_email}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Original Amount:</span>
                <span style={{ fontWeight: 700 }}>₹{parseFloat(payment.amount || 0).toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Payment Method:</span>
                <span>{payment.razorpay_payment_id ? 'Razorpay' : payment.payment_method || 'Online'}</span>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label required">Refund Amount (₹)</label>
            <input type="number" className="form-input" value={amount} 
              onChange={e => setAmount(parseFloat(e.target.value) || 0)} 
              max={payment.amount} min={0.01} step={0.01} />
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Maximum: ₹{parseFloat(payment.amount || 0).toLocaleString('en-IN')}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label required">Reason for Refund</label>
            <textarea className="form-textarea" value={reason} 
              onChange={e => setReason(e.target.value)} 
              placeholder="Explain why this refund is being processed..." 
              style={{ minHeight: 80 }} required />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn" onClick={handleRefund} disabled={loading}
            style={{ background: '#ef4444', color: '#fff', border: 'none' }}>
            {loading ? 'Processing...' : 'Process Refund'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PaymentManagement;
