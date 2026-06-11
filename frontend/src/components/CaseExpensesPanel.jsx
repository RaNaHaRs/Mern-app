import React, { useState, useEffect } from 'react';
import { useAuth } from '../store/AuthContext';
import { Autocomplete, highlightMatch } from './FormComponents';
import { suggestionsApi } from '../services/api';

const BASE_URL = '/api';

const parseErrorMsg = async (res) => {
  try {
    const data = await res.json();
    return data.error || 'Unknown error';
  } catch {
    return 'Unknown error';
  }
};

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--border-default)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: '0.85rem'
};

export default function CaseExpensesPanel({ caseId, onExpenseAdded }) {
  const getToken = () => localStorage.getItem('accessToken');
  const [expenses, setExpenses] = useState(null);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    expense_type: 'direct_purchase',
    amount: '',
    description: '',
    category: '',
    vendor_name: '',
    notes: ''
  });

  const loadExpenses = async () => {
    try {
      const res = await fetch(`${BASE_URL}/cases/${caseId}/expenses`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.ok) {
        setExpenses(await res.json());
      }
    } catch (err) {
      console.error('Error fetching expenses:', err);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, [caseId]);

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.amount || !expenseForm.description) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/cases/${caseId}/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          ...expenseForm,
          amount: parseFloat(expenseForm.amount)
        })
      });

      if (!res.ok) {
        alert(`Error: ${await parseErrorMsg(res)}`);
        return;
      }

      await loadExpenses();
      setExpenseForm({
        expense_type: 'direct_purchase',
        amount: '',
        description: '',
        category: '',
        vendor_name: '',
        notes: ''
      });
      setShowExpenseForm(false);
      
      if (onExpenseAdded) {
        onExpenseAdded();
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-header">
        <div className="card-title">Case Expenses</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowExpenseForm(!showExpenseForm)}>
          {showExpenseForm ? '✕ Cancel' : '+ Add Expense'}
        </button>
      </div>

      {showExpenseForm && (
        <div className="card-body" style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 16 }}>
          <form onSubmit={handleAddExpense}>
            <div className="form-group">
              <label>Expense Type *</label>
              <select
                value={expenseForm.expense_type}
                onChange={(e) => setExpenseForm({ ...expenseForm, expense_type: e.target.value })}
                style={inputStyle}
              >
                <option value="inventory">Inventory</option>
                <option value="direct_purchase">Direct Purchase</option>
                <option value="shipping">Shipping</option>
                <option value="vendor">Vendor</option>
                <option value="lab">Lab</option>
                <option value="misc">Miscellaneous</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div className="form-group">
                <label>Vendor Name (optional)</label>
                <Autocomplete
                  value={expenseForm.vendor_name}
                  onChange={(val) => setExpenseForm({ ...expenseForm, vendor_name: val })}
                  placeholder="Vendor name (autocomplete)"
                  fetchSuggestions={async (search) => {
                    try {
                      return await suggestionsApi.searchVendors({ search });
                    } catch (_) { return []; }
                  }}
                  renderSuggestion={(s) => <span>{highlightMatch(s.text, expenseForm.vendor_name)}</span>}
                  minChars={2}
                  debounceMs={300}
                  maxSuggestions={8}
                  className="form-group"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Description *</label>
              <input
                type="text"
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                placeholder="Briefly describe this expense..."
                style={inputStyle}
              />
            </div>

            <div className="form-group">
              <label>Category (optional)</label>
              <input
                type="text"
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                placeholder="e.g., PCB Repair, Parts, etc."
                style={inputStyle}
              />
            </div>

            <div className="form-group">
              <label>Notes (optional)</label>
              <textarea
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                placeholder="Add additional notes..."
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary btn-sm">Add Expense</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowExpenseForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {expenses && expenses.expenses.length > 0 ? (
        <div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.8rem'
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <th style={{ padding: 8, textAlign: 'left' }}>Description</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>Type</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>Category</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>Vendor</th>
                </tr>
              </thead>
              <tbody>
                {expenses.expenses.map((exp) => (
                  <tr key={exp.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: 8 }}>{exp.description}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '2px 6px',
                        background: 'rgba(168, 85, 247, 0.1)',
                        color: '#a855f7',
                        borderRadius: 3,
                        fontWeight: 600
                      }}>
                        {exp.expense_type}
                      </span>
                    </td>
                    <td style={{ padding: 8, color: 'var(--text-muted)' }}>{exp.category || '—'}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>
                      ₹{parseFloat(exp.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: 8, color: 'var(--text-muted)' }}>{exp.vendor_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{
            padding: 12,
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-sm)',
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 12
          }}>
            {Object.entries(expenses.totals || {}).map(([type, amount]) => (
              <div key={type} style={{ fontSize: '0.85rem' }}>
                <div style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{type.replace(/_/g, ' ')}</div>
                <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--accent-primary)' }}>
                  ₹{parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
            <div style={{ fontSize: '0.85rem', borderTop: '1px solid var(--border-default)', paddingTop: 12, gridColumn: '1 / -1' }}>
              <div style={{ color: 'var(--text-muted)' }}>TOTAL EXPENSES</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#ef4444' }}>
                ₹{parseFloat(expenses.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
          No expenses recorded yet
        </div>
      )}
    </div>
  );
}
