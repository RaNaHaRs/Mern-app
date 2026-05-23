import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { inventoryApi } from '../services/api';
import { useAuth } from '../store/AuthContext';
import InventoryHddFields from '../components/InventoryHddFields';
import { useInventoryConfig } from '../hooks/useInventoryConfig';
import { isHddCategoryKey } from '../constants/inventoryConfig';

export const INV_CATEGORIES = [
  { key: 'harddisk', label: 'Harddisk', icon: '💿', color: '#3b82f6', brand: '' },
  { key: 'pcb', label: 'PCB', icon: '🔌', color: '#10b981', brand: '' },
  { key: 'ssd', label: 'SSD', icon: '⚡', color: '#06b6d4', brand: '' },
  { key: 'other', label: 'Other', icon: '📦', color: '#8b5cf6', brand: '' },
];

const INVENTORY_CATEGORY_KEYS = ['harddisk', 'pcb', 'ssd', 'other'];

const BASE_URL = '/api';
const getToken = () => localStorage.getItem('accessToken');

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    available: { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
    reserved:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    used:      { color: '#94a3b8', bg: 'rgba(100,116,139,0.12)' },
    damaged:   { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    in_stock:  { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
    donated:   { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  };
  const s = map[status] || map.available;
  return (
    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: 999, color: s.color, background: s.bg, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

function InventoryFormField({ label, field, type = 'text', placeholder = '', required = false, full = false, form, setForm, children }) {
  const handleChange = (e) => {
    const value = e.target.value;
    const nextValue = type === 'number' ? (value === '' ? '' : parseInt(value, 10)) : value;
    setForm(f => ({ ...f, [field]: nextValue }));
  };

  return (
    <div className="form-group" style={full ? { gridColumn: '1/-1' } : {}}>
      <label className={`form-label${required ? ' required' : ''}`}>{label}</label>
      {children || (
        <input
          type={type}
          className="form-input"
          required={required}
          placeholder={placeholder}
          value={form[field] ?? ''}
          onChange={handleChange}
        />
      )}
    </div>
  );
}

// ─── Add / Edit Stock Item Modal ──────────────────────────────────────────────
function NewItemModal({ onClose, onCreated, editItem, invCategories, hddCompanies }) {
  const isEdit = !!editItem;
  const [form, setForm] = useState(() => editItem ? { ...editItem } : {
    category: 'harddisk', quantity: 1, min_quantity: 1, condition: 'used',
    status: 'available', company: '', stock_number: '', brand: '', model: '',
    serial_number: '', pcb_number: '', capacity: '', interface: '', form_factor: '',
    firmware: '', site_code: '', family: '', date_code: '', head_map: '',
    location: '', unit_cost: '', notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customFieldValues, setCustomFieldValues] = useState(() => editItem?.custom_field_values || {});

  const categoriesRaw = invCategories?.length ? invCategories : INV_CATEGORIES;
  const categories = categoriesRaw.filter(c => INVENTORY_CATEGORY_KEYS.includes(c.key));
  const formCategories = categories.length ? categories : INV_CATEGORIES;
  const companies = hddCompanies?.length ? hddCompanies : ['Western Digital', 'Seagate', 'Other'];
  const catInfo = formCategories.find(c => c.key === form.category) || formCategories[0];
  const isHDD = isHddCategoryKey(form.category, formCategories);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const stockId = String(form.stock_number || form.stock_id || '').trim();
    if (!stockId) {
      setError('Stock ID is required — enter a unique ID manually.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = {
        ...form,
        stock_number: stockId,
        stock_id: stockId,
        customFieldValues,
        quantity: form.quantity != null ? form.quantity : 1,
        min_quantity: form.min_quantity != null ? form.min_quantity : 1,
        status: form.status || 'available',
        condition: form.condition || 'used',
      };
      if (isEdit) {
        await inventoryApi.update(editItem.id, payload);
      } else {
        await inventoryApi.create(payload);
      }
      onCreated();
      onClose();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? '✏️ Edit Stock Item' : '+ Add Stock Item'}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
          {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}><span className="alert-icon">⚠</span> {error}</div>}
          <form onSubmit={handleSubmit}>
            {/* Category & Stock ID — required for all item types */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <InventoryFormField label="Category" field="category" required form={form} setForm={setForm}>
                <select className="form-select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value, company: categories.find(c => c.key === e.target.value)?.brand || f.company }))}>
                  {categories.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                </select>
              </InventoryFormField>
              <InventoryFormField label={form.category === 'harddisk' ? 'Harddisk No' : 'Stock ID'} field="stock_number" placeholder="Enter unique stock ID (required)" required form={form} setForm={setForm} />
            </div>

            {/* Dynamic fields from Settings → Field Config (per category) */}
            <InventoryHddFields
              category={form.category}
              form={form}
              setForm={setForm}
              customFieldValues={customFieldValues}
              setCustomFieldValues={setCustomFieldValues}
            />

            {isHDD && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <InventoryFormField label="Company / Manufacturer" field="company" form={form} setForm={setForm}>
                  <select className="form-select" value={form.company || ''} onChange={e => setForm(f => ({ ...f, company: e.target.value, brand: e.target.value !== 'Other' ? e.target.value : f.brand }))}>
                    <option value="">Select Company…</option>
                    {companies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </InventoryFormField>
                {form.company === 'Other' ? (
                  <InventoryFormField label="Custom Brand Name" field="brand" placeholder="Enter brand name" form={form} setForm={setForm} />
                ) : (
                  <InventoryFormField label="Model / Part No." field="model" placeholder="e.g. WD10EZEX" form={form} setForm={setForm} />
                )}
              </div>
            )}
            {isEdit ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <InventoryFormField label="Condition" field="condition" form={form} setForm={setForm}>
                    <select className="form-select" value={form.condition || 'used'} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}>
                      {[['new','New (Unused)'],['used','Used / Working'],['refurb','Refurbished'],['for_parts','For Parts / Faulty'],['untested','Untested']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </InventoryFormField>
                  <InventoryFormField label="Status" field="status" form={form} setForm={setForm}>
                    <select className="form-select" value={form.status || 'available'} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      {[['available','✅ Available'],['reserved','🔒 Reserved'],['used','📤 Used/Consumed'],['damaged','⚠️ Damaged'],['donated','💿 Donated to Case']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </InventoryFormField>
                  <InventoryFormField label="Quantity" field="quantity" type="number" form={form} setForm={setForm} />
                  <InventoryFormField label="Min Stock Alert" field="min_quantity" type="number" form={form} setForm={setForm} />
                  <InventoryFormField label="Unit Cost (₹)" field="unit_cost" type="number" placeholder="0.00" form={form} setForm={setForm} />
                  <InventoryFormField label="Shelf Location" field="location" placeholder="e.g. Cabinet A, Row 3" form={form} setForm={setForm} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                  <InventoryFormField label="Problem / Notes" field="notes" full form={form} setForm={setForm}>
                    <textarea className="form-textarea" style={{ minHeight: 60 }} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                  </InventoryFormField>
                </div>
              </>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <InventoryFormField label="Problem / Notes" field="notes" full form={form} setForm={setForm}>
                  <textarea className="form-textarea" style={{ minHeight: 60 }} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </InventoryFormField>
              </div>
            )}
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading || !form.stock_number} onClick={handleSubmit}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving...</> : isEdit ? '💾 Save Changes' : '+ Add to Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Adjust Stock Modal ────────────────────────────────────────────────────────
function AdjustStockModal({ item, onClose, onDone }) {
  const [form, setForm] = useState({ type: 'in', quantity: 1, notes: '' });
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try { await inventoryApi.adjust(item.id, form); onDone(); onClose(); }
    catch (err) { alert(err.message); } finally { setLoading(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">📦 Stock Adjustment — {item.stock_number || item.name}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <span className="text-xs text-muted">Current Stock</span>
            <span className="font-mono" style={{ fontWeight: 800, color: 'var(--accent-primary)' }}>{item.quantity} units</span>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Transaction Type</label>
              <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="in">📥 Stock In (Add)</option>
                <option value="out">📤 Stock Out (Remove)</option>
                <option value="reserved">🔒 Reserve for Case</option>
                <option value="disposed">🗑️ Disposed</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Quantity</label>
              <input type="number" className="form-input" required min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: parseInt(e.target.value) })} />
            </div>
            <div className="form-group">
              <label className="form-label">Notes / Reason</label>
              <input className="form-input" placeholder="Reason for adjustment..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading} onClick={handleSubmit}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Updating...</> : '✓ Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Import Modal ──────────────────────────────────────────────────────────────
function ImportModal({ onClose, onDone }) {
  const [mode, setMode] = useState('append');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const CSV_TEMPLATE_HEADERS = [
    'stock_number','category','company','brand','model','serial_number','pcb_number',
    'capacity','interface','form_factor','firmware','site_code','date_code','head_map',
    'family','condition','status','quantity','min_quantity','unit_cost','location','notes'
  ];

  const downloadTemplate = () => {
    const exampleRow = ['STK-001','wd_35','Western Digital','Western Digital','WD10EZEX','WD-WCAZBB12345','2060-771824-000','1TB','SATA','3.5" HDD','CC4H','WCAZBB','2502','00 01 02 03','RYNO5','used','available','1','1','500','Cabinet A','Sample item'];
    const csv = [CSV_TEMPLATE_HEADERS.join(','), exampleRow.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'inventory_import_template.csv'; a.click();
  };

  const parseFile = async (file) => {
    setError('');
    const isCSV = file.name.endsWith('.csv');
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      return headers.reduce((obj, h, i) => { obj[h] = vals[i] || ''; return obj; }, {});
    }).filter(r => Object.values(r).some(v => v));
    setParsedRows(rows);
    setPreview(rows.slice(0, 5));
  };

  const handleImport = async () => {
    if (!parsedRows.length) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${BASE_URL}/inventory/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: parsedRows, mode }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Import failed');
      alert(`✅ ${mode === 'overwrite' ? 'Overwrote' : 'Appended'} ${result.imported || parsedRows.length} items successfully!`);
      onDone();
      onClose();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h3 className="modal-title">📥 Import Stock</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}><span className="alert-icon">⚠</span> {error}</div>}
          
          {/* Import Mode */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Import Mode</div>
            <div style={{ display: 'flex', gap: 12 }}>
              {[['append','📥 Append','Add new items, existing unchanged'],['overwrite','📝 Overwrite','Replace existing items by stock_number, add new ones']].map(([v,label,desc]) => (
                <label key={v} style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 'var(--radius-md)', border: `2px solid ${mode===v?'var(--accent-primary)':'var(--border-default)'}`, cursor: 'pointer', background: mode===v?'var(--accent-glow)':'transparent' }}>
                  <input type="radio" name="mode" value={v} checked={mode===v} onChange={() => setMode(v)} style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{label}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Template download */}
          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            <span className="alert-icon">💡</span>
            <div>
              Download the CSV template with all required fields. Fill it in and upload below.
              <button className="btn btn-secondary btn-sm" style={{ marginLeft: 12 }} onClick={downloadTemplate}>⬇️ Download Template.csv</button>
            </div>
          </div>

          {/* File upload */}
          <div
            style={{ border: '2px dashed var(--border-default)', borderRadius: 'var(--radius-xl)', padding: 32, textAlign: 'center', cursor: 'pointer', background: 'var(--bg-elevated)', marginBottom: 16 }}
            onClick={() => fileRef.current?.click()}
          >
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📂</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Click to select CSV or Excel file</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>.csv files supported (Excel: save as CSV first)</div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
              onChange={e => { if (e.target.files[0]) parseFile(e.target.files[0]); e.target.value = ''; }} />
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div className="card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Preview ({parsedRows.length} rows to import)</div>
              </div>
              <div style={{ overflowX: 'auto', fontSize: '0.72rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{['stock_number','category','company','model','serial_number','pcb_number','capacity','status'].map(h => (
                      <th key={h} style={{ padding: '4px 8px', background: 'var(--bg-elevated)', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i}>{['stock_number','category','company','model','serial_number','pcb_number','capacity','status'].map(h => (
                        <td key={h} style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{row[h] || '—'}</td>
                      ))}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedRows.length > 5 && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8 }}>…and {parsedRows.length - 5} more rows</div>}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading || !parsedRows.length} onClick={handleImport}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Importing...</> : `📥 Import ${parsedRows.length} Items`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Export helpers ────────────────────────────────────────────────────────────
function exportToCSV(items) {
  const headers = ['stock_number','category','company','brand','model','serial_number','pcb_number','capacity','interface','firmware','site_code','date_code','condition','status','quantity','unit_cost','location','notes'];
  const rows = items.map(i => headers.map(h => `"${(i[h]||'').toString().replace(/"/g,'""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `inventory_export_${new Date().toISOString().slice(0,10)}.csv`; a.click();
}

function exportToPDF(items, catFilter) {
  const company = (() => { try { return JSON.parse(localStorage.getItem('crm_company')) || {}; } catch { return {}; } })();
  const html = `<!DOCTYPE html><html><head><title>Stock Report</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:20px}
    h1{font-size:18px;margin-bottom:4px} .sub{color:#666;font-size:11px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th{background:#0f172a;color:#00d4ff;padding:7px 8px;font-size:9px;text-align:left;text-transform:uppercase}
    td{border-bottom:1px solid #e2e8f0;padding:6px 8px;font-size:10px}
    tr:nth-child(even){background:#f8fafc}
    .badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:8px;font-weight:700}
    @media print{body{padding:0}}
  </style></head><body>
  <h1>${company.name || 'RecoverLab'} — Inventory / Stock Report</h1>
  <div class="sub">Category: ${catFilter || 'All'} · Generated: ${new Date().toLocaleString('en-IN')} · Total: ${items.length} items</div>
  <table><thead><tr><th>Stock #</th><th>Category</th><th>Company</th><th>Model</th><th>Serial #</th><th>PCB #</th><th>Capacity</th><th>Condition</th><th>Status</th><th>Qty</th><th>Location</th><th>Cost</th></tr></thead>
  <tbody>${items.map(i => `<tr>
    <td><b>${i.stock_number||i.sku||'—'}</b></td><td>${i.category?.replace(/_/g,' ')}</td>
    <td>${i.company||i.brand||'—'}</td><td>${i.model||'—'}</td>
    <td>${i.serial_number||'—'}</td><td>${i.pcb_number||'—'}</td>
    <td>${i.capacity||'—'}</td><td>${i.condition||'—'}</td>
    <td>${i.status||'available'}</td><td>${i.quantity||1}</td>
    <td>${i.location||'—'}</td><td>${i.unit_cost?'₹'+parseFloat(i.unit_cost).toLocaleString('en-IN'):'—'}</td>
  </tr>`).join('')}</tbody></table>
  <div style="margin-top:20px;font-size:9px;color:#888;border-top:1px solid #ccc;padding-top:8px">Total inventory value: ₹${items.reduce((s,i)=>s+(i.quantity*(parseFloat(i.unit_cost)||0)),0).toLocaleString('en-IN')}</div>
  </body></html>`;
  const w = window.open('', '_blank'); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400);
}

// ─── Main InventoryPage ────────────────────────────────────────────────────────
export default function InventoryPage() {
  const { canAccess } = useAuth();
  const navigate = useNavigate();
  const { activeCategories, activeBrandNames } = useInventoryConfig();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [adjustItem, setAdjustItem] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [lowStockAlerts, setLowStockAlerts] = useState(0);
  const [activeTab, setActiveTab] = useState('all');   // 'all' | category key | 'low_stock'
  const [exportLoading, setExportLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 40 };
      if (search) params.search = search;
      if (activeTab !== 'all' && activeTab !== 'low_stock') params.category = activeTab;

      const d = await inventoryApi.list(params);
      let finalItems = d.items || [];
      if (activeTab === 'low_stock') finalItems = finalItems.filter(i => i.quantity <= (i.min_quantity || 1));
      setItems(finalItems);
      setPagination(d.pagination || {});
      setLowStockAlerts(d.lowStockAlerts || 0);
    } catch { } finally { setLoading(false); }
  }, [search, page, activeTab]);

  useEffect(() => { load(); }, [load]);

  // Summary stats
  const totalItems = pagination.total || 0;
  const availableCount = items.filter(i => (i.status || 'available') === 'available').length;
  const totalValue = items.reduce((s, i) => s + (i.quantity * (parseFloat(i.unit_cost) || 0)), 0);

  const categoryTabs = (activeCategories.length ? activeCategories : INV_CATEGORIES)
    .filter(c => INVENTORY_CATEGORY_KEYS.includes(c.key));
  const displayCategoryTabs = categoryTabs.length ? categoryTabs : INV_CATEGORIES;

  const TABS = [
    { key: 'all', label: '📦 All', icon: '' },
    ...displayCategoryTabs.map(c => ({ key: c.key, label: `${c.icon} ${c.label}`, icon: c.icon, color: c.color })),
    { key: 'low_stock', label: `⚠️ Low Stock${lowStockAlerts > 0 ? ` (${lowStockAlerts})` : ''}` },
  ];

  const catForExport = activeTab !== 'all' && activeTab !== 'low_stock' ? displayCategoryTabs.find(c => c.key === activeTab)?.label : '';

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h2>Inventory — Stock Management</h2>
          <p>Donor drives, PCBs, SSDs, phones and spare parts · {totalItems} total items</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>📥 Import</button>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => exportToPDF(items, catForExport)}>📄 PDF</button>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => exportToCSV(items)}>📊 CSV</button>
          {canAccess('junior_engineer') && (
            <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Add Item</button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { icon: '📦', value: totalItems, label: 'Total Items', color: 'var(--accent-primary)', bg: 'rgba(0,212,255,0.1)' },
          { icon: '✅', value: availableCount, label: 'Available', color: 'var(--status-success)', bg: 'rgba(16,185,129,0.1)' },
          { icon: '⚠️', value: lowStockAlerts, label: 'Low Stock', color: lowStockAlerts > 0 ? 'var(--status-danger)' : 'var(--status-success)', bg: lowStockAlerts > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)' },
          { icon: '💰', value: `₹${totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, label: 'Stock Value', color: 'var(--status-success)', bg: 'rgba(16,185,129,0.1)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ '--stat-color': s.color, '--stat-bg': s.bg }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Category Tabs */}
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <div className="tabs" style={{ flexWrap: 'nowrap', minWidth: 'max-content' }}>
          {TABS.map(t => (
            <button key={t.key}
              className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
              style={t.color && activeTab === t.key ? { borderBottomColor: t.color, color: t.color } : {}}
              onClick={() => { setActiveTab(t.key); setPage(1); }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="filters-bar" style={{ marginBottom: 16 }}>
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input className="search-input" placeholder="Search stock#, serial, PCB, model…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Stock ID</th>
                  <th>Category</th>
                  <th>Company / Brand</th>
                  <th>Model</th>
                  <th>Serial #</th>
                  <th>PCB #</th>
                  <th>Capacity</th>
                  <th>Firmware</th>
                  <th>Condition</th>
                  <th>Status</th>
                  <th>Qty</th>
                  <th>Location</th>
                  <th>Cost</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const isLow = item.quantity <= (item.min_quantity || 1);
                  const cat = INV_CATEGORIES.find(c => c.key === (item.ui_category || item.category)) || INV_CATEGORIES[0];
                  const dyn = item.dynamic_fields && typeof item.dynamic_fields === 'object'
                    ? item.dynamic_fields
                    : (typeof item.dynamic_fields === 'string' ? (() => { try { return JSON.parse(item.dynamic_fields); } catch { return {}; } })() : {});
                  return (
                    <tr key={item.id}
                      style={{ background: isLow ? 'rgba(239,68,68,0.03)' : undefined, cursor: 'pointer' }}
                      onClick={() => navigate(`/inventory/${item.id}`)}>
                      <td>
                        <span className="font-mono text-accent" style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                          {item.stock_number || item.sku || '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.68rem', padding: '2px 8px', background: `${cat.color}18`, borderRadius: 999, color: cat.color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {cat.icon} {cat.label}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', fontWeight: 600 }}>{item.company || item.brand || '—'}</td>
                      <td className="text-xs font-mono">{item.model || item.name || '—'}</td>
                      <td className="text-xs font-mono text-muted">{item.serial_number || dyn.serial_number || '—'}</td>
                      <td className="text-xs font-mono">{item.pcb_number || dyn.pcb_number || '—'}</td>
                      <td className="text-xs text-muted">{item.capacity || dyn.capacity || '—'}</td>
                      <td className="text-xs font-mono text-muted">{item.firmware || item.firmware_version || dyn.firmware || '—'}</td>
                      <td>
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: item.condition === 'new' ? 'var(--status-success)' : item.condition === 'for_parts' ? 'var(--text-muted)' : 'var(--status-warning)' }}>
                          {item.condition?.replace(/_/g,' ').toUpperCase() || '—'}
                        </span>
                      </td>
                      <td><StatusBadge status={item.status || 'available'} /></td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.9rem', color: isLow ? 'var(--status-danger)' : item.quantity > 5 ? 'var(--status-success)' : 'var(--status-warning)' }}>
                          {item.quantity}
                          {isLow && <span style={{ marginLeft: 4, fontSize: '0.55rem', color: 'var(--status-danger)', fontWeight: 700 }}> ↓LOW</span>}
                        </span>
                      </td>
                      <td className="text-xs text-muted">{item.location || '—'}</td>
                      <td className="text-xs font-mono">{item.unit_cost ? `₹${parseFloat(item.unit_cost).toLocaleString('en-IN')}` : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                          {canAccess('junior_engineer') && (
                            <>
                              <button className="btn btn-secondary btn-sm" onClick={() => setEditItem(item)} style={{ padding: '4px 8px' }}>✏️</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setAdjustItem(item)} style={{ padding: '4px 8px' }}>± Qty</button>
                            </>
                          )}
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/inventory/${item.id}`)} style={{ padding: '4px 8px' }}>→</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!items.length && (
                  <tr><td colSpan={14}>
                    <div className="empty-state">
                      <div className="empty-icon">📦</div>
                      <div className="empty-title">No items found</div>
                      <div className="empty-desc">
                        {activeTab === 'low_stock' ? '✅ No low-stock alerts! Inventory looks good.' : 'Add stock items or import from CSV.'}
                      </div>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        {pagination.pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: 16, borderTop: '1px solid var(--border-subtle)' }}>
            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span className="text-xs text-muted font-mono">Page {page} of {pagination.pages}</span>
            <button className="btn btn-secondary btn-sm" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}
      </div>

      {/* Modals */}
      {showNew && (
        <NewItemModal onClose={() => setShowNew(false)} onCreated={load}
          invCategories={activeCategories} hddCompanies={activeBrandNames} />
      )}
      {editItem && (
        <NewItemModal onClose={() => setEditItem(null)} onCreated={load} editItem={editItem}
          invCategories={activeCategories} hddCompanies={activeBrandNames} />
      )}
      {adjustItem && <AdjustStockModal item={adjustItem} onClose={() => setAdjustItem(null)} onDone={load} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={load} />}
    </div>
  );
}
