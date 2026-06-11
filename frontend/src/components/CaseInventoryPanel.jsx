import React, { useState, useEffect } from 'react';
import { casesApi, inventoryApi, suggestionsApi } from '../services/api';
import { useAuth } from '../store/AuthContext';
import { Autocomplete, highlightMatch } from './FormComponents';
import { useNavigate } from 'react-router-dom';
import CaseExpensesPanel from './CaseExpensesPanel';

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
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profit, setProfit] = useState(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState([]);
  const [editingCost, setEditingCost] = useState(null); // itemId being edited
  const [costForm, setCostForm] = useState({ unit_cost: '', discount: '', charge_to_client: false, client_charge_amount: '' });
  const [savingCost, setSavingCost] = useState(false);
  const [form, setForm] = useState({
    inventory_item_id: '',
    // qty_allocated removed per request
    usage_type: 'CONSUMED',
    unit_cost: '',
    notes: '',
    charge_to_client: false,
    client_charge_amount: '',
  });

  useEffect(() => {
    loadItems();
  }, [caseId]);

  const loadItems = async () => {
    try {
      setLoading(true);
      const [itemsRes, profitRes] = await Promise.all([
        fetch(`${BASE_URL}/cases/${caseId}/inventory`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        }),
        fetch(`${BASE_URL}/cases/${caseId}/profit`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        })
      ]);

      if (itemsRes.ok) setItems(await itemsRes.json());
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
    const gross = parseFloat(item.unit_cost || 0);
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
                  onSelect={(id, item) => {
                    setForm({ ...form, inventory_item_id: id, unit_cost: item?.unit_cost || '' });
                    setSelectedInventory([...selectedInventory, item]);
                  }}
                />
              </div>

                <div className="form-group">
                    <label>Cost to Case (Amount)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.unit_cost}
                      onChange={(e) => {
                        const cost = e.target.value;
                        const autoAmount = (parseFloat(cost || 0)).toFixed(2);
                       setForm(f => ({
                         ...f,
                         unit_cost: cost,
                         client_charge_amount: f.charge_to_client ? autoAmount : f.client_charge_amount,
                       }));
                      }}
                      placeholder="Enter amount or apply discount"
                      style={inputStyle}
                    />
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
                         const autoAmount = (parseFloat(form.unit_cost || 0)).toFixed(2);
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
                        placeholder={`₹${(parseFloat(form.unit_cost || 0)).toFixed(2)}`}
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {items.map((item) => {
            const isTemp = item.usage_type === 'TEMPORARY_TOOL';
            const totalCost = isTemp ? 0 : Math.max(0, (parseFloat(item.total_allocated_cost || 0) - parseFloat(item.discount_amount || 0)));
            return (
              <div key={item.id} onClick={() => navigate(`/inventory/${item.id}`)} style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: 12,
                background: isTemp ? 'rgba(59,130,246,0.05)' : 'var(--bg-primary)',
                cursor: 'pointer',
                transition: 'transform 0.1s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
              }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.sku}</div>

                <div style={{ marginTop: 4, fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 600 }}>Cost:</span> {isTemp ? '—' : `₹${parseFloat(item.unit_cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                </div>
                <div style={{ marginTop: 4, fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 600 }}>Total:</span> {isTemp ? (<span style={{ color: '#3b82f6' }}>No charge</span>) : (<span>₹{totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>)}
                </div>
              </div>
            );
          })}
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

      <CaseExpensesPanel caseId={caseId} onExpenseAdded={loadItems} />

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

// Helper component: Inventory selector dropdown (UNCONTROLLED)
function InventorySelector({ onSelect }) {
  const [options, setOptions] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = React.useRef(null);

  useEffect(() => {
    if (!open) return;

    const loadOptions = async () => {
      try {
        const res = await fetch(`${BASE_URL}/inventory?search=${encodeURIComponent(search)}&limit=20&min_quantity=1&status=available`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (res.ok) {
          const data = await res.json();
          // Filter to only show available items (not transferred, not deleted)
          const availableItems = (data.items || []).filter(item => 
            item.status === 'available' && !item.is_transferred_to_client && !item.deleted_at
          );
          setOptions(availableItems);
        }
      } catch (err) {
        console.error('Error loading inventory:', err);
      }
    };

    const timer = setTimeout(loadOptions, 300);
    return () => clearTimeout(timer);
  }, [search, open]);

  const handleSelect = (item) => {
    onSelect(item.id, item);
    setSelectedName(item.name || `${item.company} ${item.model}`);
    setSearch('');
    setOpen(false);
    if (inputRef.current) {
      inputRef.current.value = item.name || `${item.company} ${item.model}` || item.stock_number || item.sku;
    }
  };

  return (
    <div style={{ position: 'relative', zIndex: open ? 1000 : 'auto' }}>
      <input
        ref={inputRef}
        type="text"
        placeholder="Search available inventory by name or SKU..."
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setSearch('');
        }}
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
          boxSizing: 'border-box',
          transition: 'border-color 0.15s'
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
              onClick={() => handleSelect(item)}
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
              <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                {item.name || `${item.company || item.brand} ${item.model}`} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({item.sku || item.stock_number})</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Stock: {item.quantity} &nbsp;|&nbsp; Cost: ₹{parseFloat(item.unit_cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>
      )}
      {open && options.length === 0 && search && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'var(--bg-card)',
          border: '1px solid var(--accent-primary)',
          borderTop: 'none',
          borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
          padding: '12px',
          textAlign: 'center',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          zIndex: 9999
        }}>
          No available inventory items found matching "{search}"
        </div>
      )}
      {open && options.length === 0 && !search && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'var(--bg-card)',
          border: '1px solid var(--accent-primary)',
          borderTop: 'none',
          borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
          padding: '12px',
          textAlign: 'center',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          zIndex: 9999
        }}>
          Type to search available inventory...
        </div>
      )}
    </div>
  );
}
