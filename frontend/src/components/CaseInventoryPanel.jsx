import React, { useState, useEffect } from 'react';
import { casesApi, inventoryApi } from '../services/api';
import { useAuth } from '../store/AuthContext';

const BASE_URL = '/api';
const getToken = () => localStorage.getItem('accessToken');

async function parseErrorMsg(res) {
  try {
    const body = await res.text();
    if (!body) return `HTTP ${res.status}`;
    const json = JSON.parse(body);
    return json.error || (json.errors && json.errors.map(e => e.msg).join(', ')) || `HTTP ${res.status}`;
  } catch (_) {
    return `HTTP ${res.status}`;
  }
}

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--bg-input, var(--bg-elevated))',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  fontSize: '0.85rem',
  outline: 'none',
  boxSizing: 'border-box'
};

export default function CaseInventoryPanel({ caseId }) {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState(null);
  const [profit, setProfit] = useState(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState([]);
  const [editingCost, setEditingCost] = useState(null); // itemId being edited
  const [costForm, setCostForm] = useState({ unit_cost: '', discount: '', charge_to_client: false, client_charge_amount: '' });
  const [savingCost, setSavingCost] = useState(false);
  const [form, setForm] = useState({
    inventory_item_id: '',
    qty_allocated: 1,
    usage_type: 'CONSUMED',
    unit_cost: '',
    notes: '',
    charge_to_client: false,
    client_charge_amount: '',
  });
  const [expenseForm, setExpenseForm] = useState({
    expense_type: 'direct_purchase',
    amount: '',
    description: '',
    category: '',
    vendor_name: '',
    notes: ''
  });

  useEffect(() => {
    loadItems();
  }, [caseId]);

  const loadItems = async () => {
    try {
      setLoading(true);
      const [itemsRes, expensesRes, profitRes] = await Promise.all([
        fetch(`${BASE_URL}/cases/${caseId}/inventory`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        }),
        fetch(`${BASE_URL}/cases/${caseId}/expenses`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        }),
        fetch(`${BASE_URL}/cases/${caseId}/profit`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        })
      ]);

      if (itemsRes.ok) setItems(await itemsRes.json());
      if (expensesRes.ok) setExpenses(await expensesRes.json());
      if (profitRes.ok) setProfit(await profitRes.json());
    } catch (err) {
      console.error('Error loading case inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!form.inventory_item_id) {
      alert('Please select an inventory item');
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/cases/${caseId}/inventory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          ...form,
          qty_allocated: parseInt(form.qty_allocated),
          unit_cost: form.unit_cost ? parseFloat(form.unit_cost) : undefined,
          charge_to_client: form.charge_to_client,
          client_charge_amount: form.charge_to_client && form.client_charge_amount
            ? parseFloat(form.client_charge_amount) : undefined,
        })
      });

      if (!res.ok) {
        alert(`Error: ${await parseErrorMsg(res)}`);
        return;
      }

      await loadItems();
      setForm({
        inventory_item_id: '',
        qty_allocated: 1,
        usage_type: 'CONSUMED',
        unit_cost: '',
        notes: '',
        charge_to_client: false,
        client_charge_amount: '',
      });
      setShowAddItem(false);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

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

      await loadItems();
      setExpenseForm({
        expense_type: 'direct_purchase',
        amount: '',
        description: '',
        category: '',
        vendor_name: '',
        notes: ''
      });
      setShowExpenseForm(false);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleUpdateUsage = async (itemId, action) => {
    const qty = prompt(`Enter quantity to ${action}:`, '1');
    if (!qty) return;

    try {
      const res = await fetch(`${BASE_URL}/cases/${caseId}/inventory/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          action,
          qty: parseInt(qty)
        })
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Error: ${error.error}`);
        return;
      }

      await loadItems();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleRemoveItem = async (itemId) => {
    if (!confirm('Are you sure you want to remove this item?')) return;

    try {
      const res = await fetch(`${BASE_URL}/cases/${caseId}/inventory/${itemId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Error: ${error.error}`);
        return;
      }

      await loadItems();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleOpenCostEdit = (item) => {
    setEditingCost(item.id);
    const gross = parseFloat(item.unit_cost || 0) * item.qty_allocated;
    const discount = parseFloat(item.discount_amount || 0);
    const effective = Math.max(0, gross - discount);
    setCostForm({
      unit_cost: parseFloat(item.unit_cost || 0).toFixed(2),
      discount: discount.toFixed(2),
      charge_to_client: item.charge_to_client || false,
      client_charge_amount: item.charge_to_client
        ? parseFloat(item.client_charge_amount || effective).toFixed(2)
        : effective.toFixed(2),
    });
  };

  const handleSaveCost = async (itemId) => {
    setSavingCost(true);
    try {
      const res = await fetch(`${BASE_URL}/cases/${caseId}/inventory/${itemId}/cost`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          unit_cost: parseFloat(costForm.unit_cost),
          discount: parseFloat(costForm.discount || 0),
          charge_to_client: costForm.charge_to_client,
          client_charge_amount: costForm.charge_to_client && costForm.client_charge_amount
            ? parseFloat(costForm.client_charge_amount) : 0,
        })
      });
      if (!res.ok) {
        alert(`Error: ${await parseErrorMsg(res)}`);
        return;
      }
      setEditingCost(null);
      await loadItems();
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setSavingCost(false);
    }
  };

  if (loading) {
    return <div className="spinner" />;
  }

  return (
    <div>
      {/* Inventory Items Section */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div className="card-title">Used Inventory Items</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddItem(!showAddItem)}>
            {showAddItem ? '✕ Cancel' : '+ Add Item'}
          </button>
        </div>

        {showAddItem && (
          <div className="card-body" style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 16, overflow: 'visible' }}>
            <form onSubmit={handleAddItem}>
              <div className="form-group">
                <label>Select Inventory Item *</label>
                <InventorySelector
                  value={form.inventory_item_id}
                    onChange={(id, item) => {
                      setForm({ ...form, inventory_item_id: id, unit_cost: item.unit_cost });
                      setSelectedInventory([...selectedInventory, item]);
                    }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label>Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={form.qty_allocated}
                    onChange={(e) => {
                      const qty = e.target.value;
                      const autoAmount = (parseFloat(form.unit_cost || 0) * parseFloat(qty || 1)).toFixed(2);
                      setForm(f => ({
                        ...f,
                        qty_allocated: qty,
                        client_charge_amount: f.charge_to_client ? autoAmount : f.client_charge_amount,
                      }));
                    }}
                    style={inputStyle}
                  />
                </div>

                <div className="form-group">
                  <label>Cost to Case (Amount) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.unit_cost}
                    onChange={(e) => {
                      const cost = e.target.value;
                      const autoAmount = (parseFloat(cost || 0) * parseFloat(form.qty_allocated || 1)).toFixed(2);
                      setForm(f => ({
                        ...f,
                        unit_cost: cost,
                        client_charge_amount: f.charge_to_client ? autoAmount : f.client_charge_amount,
                      }));
                    }}
                    placeholder="Enter amount or apply discount"
                    style={inputStyle}
                    required={form.usage_type === 'CONSUMED'}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Usage Type *</label>
                <select
                  value={form.usage_type}
                  onChange={(e) => {
                    const ut = e.target.value;
                    setForm({ ...form, usage_type: ut,
                      charge_to_client: ut === 'CONSUMED' ? form.charge_to_client : false,
                      client_charge_amount: ut === 'CONSUMED' ? form.client_charge_amount : '',
                    });
                  }}
                  style={inputStyle}
                >
                  <option value="CONSUMED">Cost to Case</option>
                  <option value="TEMPORARY_TOOL">Temporary Used</option>
                </select>
              </div>

              {/* Charge to client — only for CONSUMED items with a cost */}
              {form.usage_type === 'CONSUMED' && parseFloat(form.unit_cost || 0) > 0 && (
                <div style={{
                  padding: '12px 14px',
                  background: form.charge_to_client ? 'rgba(251,191,36,0.07)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${form.charge_to_client ? 'rgba(251,191,36,0.3)' : 'var(--border-subtle)'}`,
                  borderRadius: 6,
                  marginBottom: 12,
                  transition: 'all 0.15s',
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={form.charge_to_client}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const autoAmount = (parseFloat(form.unit_cost || 0) * parseInt(form.qty_allocated || 1)).toFixed(2);
                        setForm({
                          ...form,
                          charge_to_client: checked,
                          client_charge_amount: checked ? autoAmount : '',
                        });
                      }}
                      style={{ width: 16, height: 16, accentColor: '#f59e0b', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f59e0b' }}>
                      Charge this inventory cost to client
                    </span>
                  </label>
                  {form.charge_to_client && (
                    <div style={{ marginTop: 10 }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                        Amount to charge client (₹) — auto-filled, edit if needed
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.client_charge_amount}
                        onChange={(e) => setForm({ ...form, client_charge_amount: e.target.value })}
                        style={{ ...inputStyle, width: 180 }}
                        placeholder={`₹${(parseFloat(form.unit_cost || 0) * parseInt(form.qty_allocated || 1)).toFixed(2)}`}
                      />
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        This amount will be added to the client's pending balance for this case.
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="form-group">
                <label>Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Add notes about this allocation..."
                  style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary btn-sm">Add Item</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddItem(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {items.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.8rem'
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <th style={{ padding: 8, textAlign: 'left' }}>Item</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Type</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Discount</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Our Cost</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Client Charge</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isTemp = item.usage_type === 'TEMPORARY_TOOL';
                  const isEditing = editingCost === item.id;
                  const discountAmt = parseFloat(item.discount_amount || 0);
                  // total_allocated_cost is generated (qty * unit_cost); effective = that minus discount
                  const grossCost = parseFloat(item.total_allocated_cost || 0);
                  const totalCost = isTemp ? 0 : Math.max(0, grossCost - discountAmt);
                  return (
                    <React.Fragment key={item.id}>
                      <tr style={{ borderBottom: isEditing ? 'none' : '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: 8 }}>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.sku}</div>
                        </td>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <span style={{
                            fontSize: '0.7rem',
                            padding: '2px 6px',
                            background: isTemp ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: isTemp ? '#3b82f6' : '#ef4444',
                            borderRadius: 3,
                            fontWeight: 600
                          }}>
                            {isTemp ? 'Temp Tool' : 'Consumed'}
                          </span>
                        </td>
                        <td style={{ padding: 8, textAlign: 'center' }}>{item.qty_allocated}</td>
                        <td style={{ padding: 8, textAlign: 'right', color: isTemp ? 'var(--text-muted)' : 'inherit' }}>
                          {isTemp ? '—' : `₹${parseFloat(item.unit_cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                        </td>
                        <td style={{ padding: 8, textAlign: 'right', color: 'var(--text-muted)' }}>
                          {isTemp || discountAmt === 0 ? '—' : `-₹${discountAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                        </td>
                        <td style={{ padding: 8, textAlign: 'right' }}>
                          {isTemp ? (
                            <span style={{ fontSize: '0.7rem', color: '#3b82f6', fontWeight: 600, padding: '2px 6px', background: 'rgba(59,130,246,0.08)', borderRadius: 3 }}>
                              No charge
                            </span>
                          ) : (
                            <span style={{ fontWeight: 600 }}>
                              ₹{totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: 8, textAlign: 'right' }}>
                          {item.charge_to_client ? (
                            <span style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              color: '#f59e0b',
                              background: 'rgba(251,191,36,0.1)',
                              border: '1px solid rgba(251,191,36,0.25)',
                              padding: '2px 7px',
                              borderRadius: 4,
                              display: 'inline-block',
                            }}>
                              ₹{parseFloat(item.client_charge_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <span style={{
                            fontSize: '0.7rem',
                            padding: '2px 6px',
                            background: item.status === 'allocated' ? 'rgba(168, 85, 247, 0.1)' :
                                      item.status === 'consumed' ? 'rgba(239, 68, 68, 0.1)' :
                                      item.status === 'returned' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                            color: item.status === 'allocated' ? '#a855f7' :
                                   item.status === 'consumed' ? '#ef4444' :
                                   item.status === 'returned' ? '#22c55e' : '#6b7280',
                            borderRadius: 3,
                            fontWeight: 600
                          }}>
                            {item.status}
                          </span>
                        </td>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                            {isTemp ? (
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => handleUpdateUsage(item.id, 'return')}
                                style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                              >
                                Return
                              </button>
                            ) : (
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => handleUpdateUsage(item.id, 'consume')}
                                style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                              >
                                Consume
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                className="btn btn-sm"
                                onClick={() => isEditing ? setEditingCost(null) : handleOpenCostEdit(item)}
                                style={{
                                  fontSize: '0.65rem',
                                  padding: '2px 6px',
                                  background: isEditing ? 'rgba(239,68,68,0.15)' : 'rgba(251,191,36,0.12)',
                                  color: isEditing ? '#ef4444' : '#f59e0b',
                                  border: `1px solid ${isEditing ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.3)'}`,
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                }}
                              >
                                {isEditing ? '✕ Cancel' : '✎ Edit Cost'}
                              </button>
                            )}
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => handleRemoveItem(item.id)}
                              style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isEditing && (
                        <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(251,191,36,0.04)' }}>
                          <td colSpan={9} style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                              <div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>Unit Cost (₹)</div>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={costForm.unit_cost}
                                  onChange={(e) => {
                                    const uc = e.target.value;
                                    const newTotal = Math.max(0, parseFloat(uc || 0) * item.qty_allocated - parseFloat(costForm.discount || 0));
                                    setCostForm(f => ({
                                      ...f,
                                      unit_cost: uc,
                                      client_charge_amount: f.charge_to_client ? newTotal.toFixed(2) : f.client_charge_amount,
                                    }));
                                  }}
                                  style={{ ...inputStyle, width: 120 }}
                                  disabled={isTemp}
                                  placeholder="0.00"
                                />
                              </div>
                              <div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>Discount (₹)</div>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={costForm.discount}
                                  onChange={(e) => {
                                    const disc = e.target.value;
                                    const newTotal = Math.max(0, parseFloat(costForm.unit_cost || 0) * item.qty_allocated - parseFloat(disc || 0));
                                    setCostForm(f => ({
                                      ...f,
                                      discount: disc,
                                      client_charge_amount: f.charge_to_client ? newTotal.toFixed(2) : f.client_charge_amount,
                                    }));
                                  }}
                                  style={{ ...inputStyle, width: 120 }}
                                  placeholder="0.00"
                                />
                              </div>
                              {/* Charge to client toggle in edit form */}
                              {!isTemp && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: '#f59e0b', userSelect: 'none' }}>
                                    <input
                                      type="checkbox"
                                      checked={costForm.charge_to_client}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        const effectiveTotal = Math.max(0, parseFloat(costForm.unit_cost || 0) * item.qty_allocated - parseFloat(costForm.discount || 0));
                                        setCostForm(f => ({
                                          ...f,
                                          charge_to_client: checked,
                                          client_charge_amount: checked ? effectiveTotal.toFixed(2) : '0',
                                        }));
                                      }}
                                      style={{ width: 15, height: 15, accentColor: '#f59e0b' }}
                                    />
                                    Charge to client
                                  </label>
                                  {costForm.charge_to_client && (
                                    <div>
                                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 3 }}>Client charge (₹)</div>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={costForm.client_charge_amount}
                                        onChange={(e) => setCostForm(f => ({ ...f, client_charge_amount: e.target.value }))}
                                        style={{ ...inputStyle, width: 120 }}
                                        placeholder="0.00"
                                      />
                                    </div>
                                  )}
                                </div>
                              )}
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', paddingBottom: 4 }}>
                                New Total: <strong style={{ color: 'var(--accent-primary)' }}>
                                  ₹{Math.max(0, (parseFloat(costForm.unit_cost || 0) * item.qty_allocated) - parseFloat(costForm.discount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </strong>
                              </div>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleSaveCost(item.id)}
                                disabled={savingCost}
                                style={{ fontSize: '0.72rem', padding: '4px 12px' }}
                              >
                                {savingCost ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
            No inventory items added yet
          </div>
        )}

        {items.length > 0 && (() => {
          const tempCount = items.filter(i => i.usage_type === 'TEMPORARY_TOOL').length;
          const totalOurCost = items
            .filter(i => i.usage_type !== 'TEMPORARY_TOOL')
            .reduce((sum, i) => sum + Math.max(0, parseFloat(i.total_allocated_cost || 0) - parseFloat(i.discount_amount || 0)), 0);
          const totalClientCharge = items
            .filter(i => i.charge_to_client)
            .reduce((sum, i) => sum + parseFloat(i.client_charge_amount || 0), 0);
          return (
            <div style={{
              padding: '10px 14px',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-sm)',
              marginTop: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: '0.85rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>
                  Our Cost (inventory)
                  {tempCount > 0 && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                      {tempCount} temp tool{tempCount !== 1 ? 's' : ''} excluded
                    </span>
                  )}
                </span>
                <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>
                  ₹{totalOurCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {totalClientCharge > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontWeight: 600, color: '#f59e0b' }}>Added to Client Balance</span>
                  <span style={{ fontWeight: 700, color: '#f59e0b' }}>
                    +₹{totalClientCharge.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Expenses Section */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div className="card-title">All Case Expenses</div>
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
                  <input
                    type="text"
                    value={expenseForm.vendor_name}
                    onChange={(e) => setExpenseForm({ ...expenseForm, vendor_name: e.target.value })}
                    style={inputStyle}
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

      {/* Profit Summary */}
      {profit && (
        <div className="card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
          <div className="card-title">Case Profitability</div>

          {/* Top row: 3 headline numbers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
            {[
              { label: 'Revenue', value: profit.revenue, color: '#22c55e' },
              { label: 'Total Expenses', value: profit.total_expenses, color: '#ef4444' },
              { label: 'Gross Profit', value: profit.gross_profit, color: parseFloat(profit.gross_profit || 0) >= 0 ? '#22c55e' : '#ef4444' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color, marginTop: 4 }}>
                  ₹{parseFloat(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>

          {/* Breakdown: revenue sources and cost sources */}
          {(parseFloat(profit.inventory_client_revenue || 0) > 0 || parseFloat(profit.inventory_our_cost || 0) > 0) && (
            <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontSize: '0.82rem' }}>
              <div style={{ fontWeight: 700, marginBottom: 10, color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Inventory Contribution
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>

                {/* Our cost for the item */}
                {parseFloat(profit.inventory_our_cost || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Our cost (items consumed)</span>
                    <span style={{ fontWeight: 600, color: '#ef4444' }}>
                      -₹{parseFloat(profit.inventory_our_cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                {/* What we billed the client */}
                {parseFloat(profit.inventory_client_revenue || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Billed to client (inventory charge)</span>
                    <span style={{ fontWeight: 600, color: '#22c55e' }}>
                      +₹{parseFloat(profit.inventory_client_revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                {/* Net margin from inventory */}
                {parseFloat(profit.inventory_our_cost || 0) > 0 && parseFloat(profit.inventory_client_revenue || 0) > 0 && (() => {
                  const margin = parseFloat(profit.inventory_client_revenue || 0) - parseFloat(profit.inventory_our_cost || 0);
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 7, borderTop: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontWeight: 600 }}>Inventory margin</span>
                      <span style={{ fontWeight: 700, color: margin >= 0 ? '#22c55e' : '#ef4444' }}>
                        {margin >= 0 ? '+' : ''}₹{margin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper component: Inventory selector dropdown
function InventorySelector({ value, onChange }) {
  const [options, setOptions] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const loadOptions = async () => {
      try {
        const res = await fetch(`${BASE_URL}/inventory?search=${encodeURIComponent(search)}&limit=20&min_quantity=1`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (res.ok) {
          const data = await res.json();
          setOptions(data.items || []);
        }
      } catch (err) {
        console.error('Error loading inventory:', err);
      }
    };

    loadOptions();
  }, [search, open]);

  return (
    <div style={{ position: 'relative', zIndex: open ? 1000 : 'auto' }}>
      <input
        type="text"
        placeholder="Search inventory..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: 'var(--bg-input, var(--bg-elevated))',
          color: 'var(--text-primary)',
          border: `1px solid ${open ? 'var(--accent-primary)' : 'var(--border-default)'}`,
          borderRadius: open ? 'var(--radius-sm) var(--radius-sm) 0 0' : 'var(--radius-sm)',
          fontSize: '0.85rem',
          outline: 'none',
          boxSizing: 'border-box'
        }}
      />
      {open && options.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'var(--bg-card)',
          border: '1px solid var(--accent-primary)',
          borderTop: 'none',
          borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
          maxHeight: 220,
          overflowY: 'auto',
          zIndex: 9999,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)'
        }}>
          {options.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                onChange(item.id, item);
                setSearch(item.name);
                setOpen(false);
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-elevated)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                transition: 'background 0.15s'
              }}
            >
              <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{item.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({item.sku})</span></div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Stock: {item.quantity} &nbsp;|&nbsp; Cost: ₹{parseFloat(item.unit_cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
