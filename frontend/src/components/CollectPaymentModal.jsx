import { useState, useEffect } from 'react';
import { clientsApi } from '../services/api';

export default function CollectPaymentModal({ isOpen, onClose, cases, clientId, clientName, selectedCaseId, onSuccess }) {
  const [selCaseId, setSelCaseId] = useState('');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validationError, setValidationError] = useState(null);

  const validCases = (cases || []).filter(c => parseFloat(c.pending_amount || 0) > 0);

  const selectedCase = validCases.find(c => c.id === selCaseId);

  useEffect(() => {
    if (isOpen) {
      if (selectedCaseId) {
        const c = validCases.find(x => x.id === selectedCaseId);
        if (c) {
          setSelCaseId(c.id);
          setAmount(String(Math.floor(parseFloat(c.pending_amount || 0))));
        } else {
          setSelCaseId('');
          setAmount('');
        }
      } else {
        setSelCaseId('');
        setAmount('');
      }
    } else {
      setSelCaseId('');
      setAmount('');
      setIsLoading(false);
      setError(null);
      setValidationError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && selCaseId && !amount) {
      const c = validCases.find(x => x.id === selCaseId);
      if (c) {
        setAmount(String(Math.floor(parseFloat(c.pending_amount || 0))));
      }
    }
  }, [validCases]);

  if (!isOpen) return null;

  const handleCaseChange = (e) => {
    const id = e.target.value;
    setSelCaseId(id);
    setValidationError(null);
    setError(null);
    if (id) {
      const c = validCases.find(x => x.id === id);
      if (c) {
        setAmount(String(Math.floor(parseFloat(c.pending_amount || 0))));
      }
    } else {
      setAmount('');
    }
  };

  const handleAmountChange = (e) => {
    const v = e.target.value.replace(/[^0-9]/g, '');
    setAmount(v);
    setValidationError(null);
  };

  const validate = () => {
    if (!selCaseId) {
      setValidationError('Please select a case');
      return false;
    }
    if (!amount || amount.trim() === '') {
      setValidationError('Payment amount is required');
      return false;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setValidationError('Amount must be greater than zero');
      return false;
    }
    if (selectedCase && amt > parseFloat(selectedCase.pending_amount || 0)) {
      setValidationError(`Amount cannot exceed ${formatCurrency(parseFloat(selectedCase.pending_amount || 0))}, the pending amount`);
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setError(null);
    if (!validate()) return;

    setIsLoading(true);
    try {
      const result = await clientsApi.collectPending(clientId, {
        case_id: selCaseId,
        amount: parseFloat(amount)
      });

      if (result && result.ok) {
        if (onSuccess) onSuccess();
        onClose();
      } else {
        setError(result?.error || result?.message || 'Failed to collect payment');
      }
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Error collecting payment');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (val) =>
    `\u20B9${parseFloat(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 8,
        padding: 24,
        maxWidth: 440,
        width: '100%',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
        border: '1px solid #e0e0e0'
      }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: 20, color: '#1a1a1a' }}>
          Collect Payment
        </h3>

        <div style={{ padding: '8px 12px', background: '#f5f5f5', borderRadius: 6, marginBottom: 16 }}>
          <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: 2 }}>Client</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a1a' }}>{clientName}</div>
        </div>

        {/* Case select */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#555', marginBottom: 6, display: 'block' }}>
            Case <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <select
            value={selCaseId}
            onChange={handleCaseChange}
            style={{
              width: '100%', padding: '10px 12px', fontSize: '0.9rem',
              border: '2px solid #3b82f6', borderRadius: 6,
              background: '#ffffff', color: '#1a1a1a',
              outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 500
            }}
          >
            <option value="">-- Select a case --</option>
            {validCases.map(c => (
              <option key={c.id} value={c.id}>
                {c.case_number} — Pending: {formatCurrency(c.pending_amount)}{c.device_brand ? ` (${c.device_brand} ${c.device_model || ''})` : ''}
              </option>
            ))}
          </select>
          {validCases.length === 0 && (
            <div style={{ fontSize: '0.75rem', color: '#d97706', marginTop: 4 }}>
              No cases with pending amount for this client
            </div>
          )}
        </div>

        {/* Amount */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#555', marginBottom: 6, display: 'block' }}>
            Payment Amount <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              fontSize: '1rem', color: '#888', fontWeight: 600
            }}>{'\u20B9'}</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={amount}
              onChange={handleAmountChange}
              style={{
                width: '100%', padding: '10px 10px 10px 32px', fontSize: '1rem',
                border: `2px solid ${validationError ? '#dc2626' : '#d1d5db'}`,
                borderRadius: 6, background: '#ffffff',
                color: '#1a1a1a', outline: 'none',
                fontFamily: 'monospace', fontWeight: 600, boxSizing: 'border-box'
              }}
            />
          </div>
          {selectedCase && (
            <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4 }}>
              Pending: {formatCurrency(selectedCase.pending_amount)}
            </div>
          )}
        </div>

        {/* Validation error */}
        {validationError && (
          <div style={{
            padding: '8px 10px', background: '#fef2f2',
            border: '1px solid #fca5a5', borderRadius: 6,
            color: '#dc2626', fontSize: '0.82rem', marginBottom: 12
          }}>
            {validationError}
          </div>
        )}

        {/* Server error */}
        {error && (
          <div style={{
            padding: '8px 10px', background: '#fef2f2',
            border: '1px solid #fca5a5', borderRadius: 6,
            color: '#dc2626', fontSize: '0.82rem', marginBottom: 12
          }}>
            {error}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={onClose} disabled={isLoading} style={{
            padding: '10px 20px', border: '1px solid #d1d5db', borderRadius: 6,
            background: '#ffffff', color: '#1a1a1a',
            cursor: isLoading ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: isLoading ? 0.6 : 1
          }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={isLoading || !selCaseId} style={{
            padding: '10px 20px', border: 'none', borderRadius: 6,
            background: selCaseId ? '#16a34a' : '#9ca3af',
            color: '#ffffff', cursor: isLoading || !selCaseId ? 'not-allowed' : 'pointer',
            fontWeight: 600, opacity: isLoading || !selCaseId ? 0.6 : 1
          }}>
            {isLoading ? 'Processing...' : 'Collect Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}