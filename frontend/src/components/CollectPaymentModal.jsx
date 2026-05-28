import { useState } from 'react';
import { casesApi } from '../services/api';

export default function CollectPaymentModal({ isOpen, onClose, caseData, clientName, onSuccess }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !caseData) return null;

  const pendingAmount = parseFloat(caseData.pending_amount || 0);

  const handleCollect = async () => {
    if (pendingAmount <= 0) {
      setError('No pending amount to collect');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await casesApi.collectPayment(caseData.id);
      
      if (result && result.success) {
        // Call success callback with updated data
        if (onSuccess) {
          onSuccess(result.case);
        }
        onClose();
      } else {
        setError(result?.message || 'Failed to collect payment');
      }
    } catch (err) {
      setError(err?.message || 'Error collecting payment');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (val) => {
    return `₹${parseFloat(val || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    })}`;
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'var(--bg-primary)',
        borderRadius: 8,
        padding: 24,
        maxWidth: 400,
        width: '100%',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
        border: '1px solid var(--border-subtle)'
      }}>
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
            💰 Collect Payment
          </h3>

          {/* Client Info */}
          <div style={{ padding: 12, backgroundColor: 'var(--bg-elevated)', borderRadius: 6, marginBottom: 12 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Client</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {clientName}
            </div>
          </div>

          {/* Case Number */}
          <div style={{ padding: 12, backgroundColor: 'var(--bg-elevated)', borderRadius: 6, marginBottom: 12 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Case Number</div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {caseData.case_number}
            </div>
          </div>

          {/* Pending Amount */}
          <div style={{ 
            padding: 12, 
            backgroundColor: 'rgba(245, 158, 11, 0.1)', 
            borderRadius: 6, 
            marginBottom: 16,
            border: '1px solid rgba(245, 158, 11, 0.3)'
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Pending Amount to Collect</div>
            <div style={{ 
              fontSize: '1.4rem', 
              fontWeight: 700, 
              color: 'var(--status-warning)',
              fontFamily: 'var(--font-mono)'
            }}>
              {formatCurrency(pendingAmount)}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              padding: 10,
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 6,
              color: 'var(--status-danger)',
              fontSize: '0.85rem',
              marginBottom: 12
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              opacity: isLoading ? 0.6 : 1
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCollect}
            disabled={isLoading || pendingAmount <= 0}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: 4,
              backgroundColor: pendingAmount > 0 ? 'var(--status-success)' : 'var(--text-muted)',
              color: '#fff',
              cursor: isLoading || pendingAmount <= 0 ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              opacity: isLoading || pendingAmount <= 0 ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {isLoading ? '⟳ Processing...' : '✓ Collect Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}
