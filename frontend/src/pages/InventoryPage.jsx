import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { inventoryApi } from '../services/api';
import { useAuth } from '../store/AuthContext';
import InventoryHddFields from '../components/InventoryHddFields';
import { useInventoryConfig } from '../hooks/useInventoryConfig';
import { loadInventoryFields } from '../utils/inventoryFieldSettings';
import {
  FORM_INV_CATEGORIES, isHddCategoryKey, getCategoryMeta, normalizeCategoryKey,
} from '../constants/inventoryConfig';

export const INV_CATEGORIES = FORM_INV_CATEGORIES;

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
    transferred: { color: '#f59e0b', bg: 'rgba(245,158,11,0.14)' },
    deleted:   { color: '#94a3b8', bg: 'rgba(100,116,139,0.12)' },
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
function NewItemModal({ onClose, onCreated, editItem, hddCompanies }) {
  const isEdit = !!editItem;
  const formCategories = FORM_INV_CATEGORIES;
  const [form, setForm] = useState(() => editItem ? {
    ...editItem,
    category: normalizeCategoryKey(editItem.ui_category || editItem.category),
  } : {
    category: 'hdd', quantity: 1, min_quantity: 1, condition: 'used',
    status: 'available', company: '', stock_number: '', brand: '', model: '',
    name: '', description: '', serial_number: '', pcb_number: '', capacity: '', interface: '', form_factor: '',
    firmware: '', site_code: '', family: '', date_code: '', head_map: '',
    location: '', unit_cost: '', notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customFieldValues, setCustomFieldValues] = useState(() => editItem?.custom_field_values || {});
  const [inventoryFields, setInventoryFields] = useState(() => loadInventoryFields(editItem ? normalizeCategoryKey(editItem.ui_category || editItem.category) : 'hdd'));

  const companies = hddCompanies?.length ? hddCompanies : ['Western Digital', 'Seagate', 'Other'];
  const isHDD = isHddCategoryKey(form.category, formCategories);
  const isPcb = form.category === 'pcb';
  const isSsd = form.category === 'ssd';
  const isOther = form.category === 'other';
  const showStockNumber = !isPcb;
  const showDynamicFields = isHDD && !isPcb;

  useEffect(() => {
    setInventoryFields(loadInventoryFields(form.category));
  }, [form.category]);

  const RESERVED_INVENTORY_KEYS = new Set([
    'stock_number', 'category', 'company', 'brand', 'model', 'name', 'serial_number', 'pcb_number',
    'capacity', 'interface', 'form_factor', 'firmware', 'site_code', 'date_code', 'head_map', 'family',
    'condition', 'status', 'quantity', 'min_quantity', 'unit_cost', 'location', 'notes', 'description',
  ]);

  const renderInventorySettingsField = (field) => {
    const value = form[field.key] ?? '';
    const onChange = (e) => setForm(prev => ({ ...prev, [field.key]: e.target.value }));
    return (
      <div key={field.key} className="form-group" style={{ margin: 0 }}>
        <label className="form-label">{field.label}</label>
        {field.type === 'select' ? (
          <select className="form-select" value={value} onChange={onChange}>
            <option value="">Select…</option>
            {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        ) : field.type === 'textarea' ? (
          <textarea className="form-textarea" style={{ minHeight: 56 }} value={value} onChange={onChange} />
        ) : (
          <input className="form-input" type={field.type === 'number' ? 'number' : 'text'} value={value} onChange={onChange} />
        )}
      </div>
    );
  };

  const customInventoryFields = inventoryFields.filter(f => !RESERVED_INVENTORY_KEYS.has(f.key));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isPcb) {
      if (!String(form.model || '').trim()) { setError('Model is required for PCB'); return; }
      if (!String(form.name || '').trim()) { setError('PCB Name is required'); return; }
      if (!String(form.pcb_number || '').trim()) { setError('PCB Number is required'); return; }
      if (!String(form.notes || '').trim()) { setError('Problem is required for PCB'); return; }
    }
    let stockId = String(form.stock_number || form.stock_id || '').trim();
    if (!stockId) {
      if (form.category === 'pcb') {
        stockId = `PCB-${Date.now()}`;
      } else if (form.category === 'other' || form.category === 'others') {
        stockId = `OTH-${Date.now()}`;
      } else if (form.category === 'stock_item') {
        stockId = `STK-${Date.now()}`;
      } else {
        stockId = `${String(form.category).substring(0, 3).toUpperCase()}-${Date.now()}`;
      }
    }
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
                <select className="form-select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value, company: formCategories.find(c => c.key === e.target.value)?.brand || f.company }))}>
                  {formCategories.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                </select>
              </InventoryFormField>
              {showStockNumber && (
                <InventoryFormField label={form.category === 'hdd' ? 'HDD No' : 'Stock ID'} field="stock_number" placeholder="Enter unique stock ID (required)" required form={form} setForm={setForm} />
              )}
            </div>

            {isPcb && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <InventoryFormField label="Model" field="model" placeholder="Enter model" required form={form} setForm={setForm} />
                <InventoryFormField label="PCB Name" field="name" placeholder="Enter PCB name" required form={form} setForm={setForm} />
                <InventoryFormField label="PCB Number" field="pcb_number" placeholder="Enter PCB number" required form={form} setForm={setForm} />
                <InventoryFormField label="Problem" field="notes" placeholder="Describe the problem" required full form={form} setForm={setForm}>
                  <textarea className="form-textarea" style={{ minHeight: 60 }} required value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </InventoryFormField>
              </div>
            )}

            {isSsd && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <InventoryFormField label="SSD Name" field="name" placeholder="Enter SSD name" form={form} setForm={setForm} />
                <InventoryFormField label="Serial No" field="serial_number" placeholder="Enter serial number" form={form} setForm={setForm} />
                <InventoryFormField label="Model" field="model" placeholder="Enter model" form={form} setForm={setForm} />
                <InventoryFormField label="Capacity" field="capacity" form={form} setForm={setForm}>
                  <select className="form-select" value={form.capacity || ''} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}>
                    <option value="">Select capacity…</option>
                    {['120GB','240GB','256GB','480GB','512GB','1TB','2TB','4TB'].map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </InventoryFormField>
              </div>
            )}

            {isOther && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 12 }}>
                <InventoryFormField label="Device" field="name" placeholder="Enter device name" form={form} setForm={setForm} />
                <InventoryFormField label="Problem" field="notes" placeholder="Describe the problem" full form={form} setForm={setForm}>
                  <textarea className="form-textarea" style={{ minHeight: 60 }} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </InventoryFormField>
                <InventoryFormField label="Note" field="description" placeholder="Any additional note" full form={form} setForm={setForm}>
                  <textarea className="form-textarea" style={{ minHeight: 60 }} value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </InventoryFormField>
              </div>
            )}

            {showDynamicFields && (
              <InventoryHddFields
                category={form.category === 'hdd' ? 'harddisk' : form.category}
                form={form}
                setForm={setForm}
                customFieldValues={customFieldValues}
                setCustomFieldValues={setCustomFieldValues}
              />
            )}

            {customInventoryFields.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 10 }}>
                  Inventory settings fields — {form.category?.replace(/_/g, ' ') || 'Category'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {customInventoryFields.map(renderInventorySettingsField)}
                </div>
              </div>
            )}

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
              !isSsd && !isOther && !isPcb && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                  <InventoryFormField label="Problem / Notes" field="notes" full form={form} setForm={setForm}>
                    <textarea className="form-textarea" style={{ minHeight: 60 }} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                  </InventoryFormField>
                </div>
              )
            )}
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading || (showStockNumber && !form.stock_number)} onClick={handleSubmit}>
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
// ─── Delete Confirmation Modal ─────────────────────────────────────────────────
function DeleteConfirmModal({ selectedCount, onConfirm, onCancel }) {
  const [loading, setLoading] = useState(false);
  const handleDelete = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  const title = '🗑️ Move to Recycle Bin';
  const message = `Move ${selectedCount} item${selectedCount > 1 ? 's' : ''} to the recycle bin? You can restore them from the Recycle Bin tab.`;
  const btnText = 'Move to Recycle Bin';
  const btnStyle = 'btn-secondary';

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: 16, color: 'var(--text-primary)' }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className={`btn ${btnStyle}`} onClick={handleDelete} disabled={loading}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Processing...</> : btnText}
          </button>
        </div>
      </div>
    </div>
  );
}

function PermanentDeleteModal({ selectedCount, onConfirm, onCancel }) {
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleConfirm = async () => {
    if (confirmText !== 'DELETE') return;
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, border: '1px solid rgba(239,68,68,0.35)' }}>
        <div className="modal-header" style={{ background: 'rgba(239,68,68,0.06)' }}>
          <h3 className="modal-title" style={{ color: 'var(--status-danger)' }}>⚠️ Delete Permanently</h3>
          <button className="btn btn-ghost btn-icon" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.85rem', marginBottom: 12 }}>
            Permanently delete {selectedCount} item{selectedCount > 1 ? 's' : ''}? This cannot be undone.
          </p>
          <div className="form-group">
            <label className="form-label required">Type DELETE to confirm</label>
            <input className="form-input" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="DELETE" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="btn btn-danger" disabled={loading || confirmText !== 'DELETE'} onClick={handleConfirm}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Deleting...</> : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const { canAccess, user } = useAuth();
  const navigate = useNavigate();
  const { activeBrandNames } = useInventoryConfig();
  const [items, setItems] = useState([]);
  const [recycleItems, setRecycleItems] = useState([]);
  const [pagination, setPagination] = useState({});
  const [recyclePagination, setRecyclePagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [recyclePage, setRecyclePage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [adjustItem, setAdjustItem] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [lowStockAlerts, setLowStockAlerts] = useState(0);
  const [viewMode, setViewMode] = useState('stock'); // 'stock' | 'recycle'
  const [activeTab, setActiveTab] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPermanentDelete, setShowPermanentDelete] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const displayList = viewMode === 'recycle' ? recycleItems : items;
  const activePagination = viewMode === 'recycle' ? recyclePagination : pagination;
  const activePage = viewMode === 'recycle' ? recyclePage : page;
  const setActivePage = viewMode === 'recycle' ? setRecyclePage : setPage;

  const loadStock = useCallback(async () => {
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
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [search, page, activeTab]);

  const loadRecycle = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: recyclePage, limit: 40 };
      if (search) params.search = search;
      const d = await inventoryApi.listRecycleBin(params);
      setRecycleItems(d.items || []);
      setRecyclePagination(d.pagination || {});
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [search, recyclePage]);

  const load = useCallback(async () => {
    if (viewMode === 'recycle') await loadRecycle();
    else await loadStock();
  }, [viewMode, loadStock, loadRecycle]);

  useEffect(() => { load(); }, [load]);

  // Summary stats
  const totalItems = pagination.total || 0;
  const availableCount = items.filter(i => (i.status || 'available') === 'available').length;
  const totalValue = items.reduce((s, i) => s + (i.quantity * (parseFloat(i.unit_cost) || 0)), 0);

  const TABS = [
    { key: 'all', label: '📦 All', icon: '' },
    ...INV_CATEGORIES.map(c => ({ key: c.key, label: `${c.icon} ${c.label}`, icon: c.icon, color: c.color })),
    { key: 'low_stock', label: `⚠️ Donor Drive${lowStockAlerts > 0 ? ` (${lowStockAlerts})` : ''}` },
  ];

  const catForExport = activeTab !== 'all' && activeTab !== 'low_stock' ? INV_CATEGORIES.find(c => c.key === activeTab)?.label : '';

  const handleTransfer = async (item) => {
    if (item.status === 'transferred') return;
    if (!confirm(`Transfer "${item.stock_number || item.name}" to Transferred Items?`)) return;
    try {
      await inventoryApi.transfer(item.id, 'Transferred from inventory stock');
      await loadStock();
    } catch (err) {
      alert(`Transfer failed: ${err.message}`);
    }
  };

  const handleSoftDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      await inventoryApi.bulkSoftDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
      await loadStock();
      setViewMode('recycle');
      setRecyclePage(1);
      await loadRecycle();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handlePermanentDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      if (selectedIds.size === 1) {
        await inventoryApi.permanentDelete(Array.from(selectedIds)[0]);
      } else {
        await inventoryApi.bulkPermanentDelete(Array.from(selectedIds));
      }
      setSelectedIds(new Set());
      setShowPermanentDelete(false);
      await loadRecycle();
    } catch (err) {
      alert(`Permanent delete failed: ${err.message}`);
    }
  };

  const handleRestore = async (id) => {
    try {
      await inventoryApi.restore(id);
      await loadRecycle();
      await loadStock();
    } catch (err) {
      alert(`Restore failed: ${err.message}`);
    }
  };

  const toggleSelect = (itemId) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayList.map(i => i.id)));
    }
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="inventory-page">
      <div className="page-header">
        <div className="page-header-left">
          <h2>Inventory — Stock Management</h2>
          <p>HDD, SSD, PCB &amp; other parts · {viewMode === 'stock' ? totalItems : recyclePagination.total || 0} {viewMode === 'stock' ? 'in stock' : 'in recycle bin'}</p>
        </div>
        <div className="inventory-toolbar">
          {selectedCount > 0 && viewMode === 'stock' && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowDeleteConfirm(true)}>🗑️ Delete ({selectedCount})</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>Clear</button>
            </>
          )}
          {selectedCount > 0 && viewMode === 'recycle' && isAdmin && (
            <>
              <button className="btn btn-danger btn-sm" onClick={() => setShowPermanentDelete(true)}>Delete Permanently ({selectedCount})</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>Clear</button>
            </>
          )}
          {selectedCount === 0 && viewMode === 'stock' && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>📥 Import</button>
              <button className="btn btn-secondary btn-sm" onClick={() => exportToPDF(items, catForExport)}>📄 PDF</button>
              <button className="btn btn-secondary btn-sm" onClick={() => exportToCSV(items)}>📊 CSV</button>
              {canAccess('junior_engineer') && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>+ Add Item</button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="tabs" style={{ flexShrink: 0 }}>
        <button type="button" className={`tab-btn ${viewMode === 'stock' ? 'active' : ''}`} onClick={() => { setViewMode('stock'); setSelectedIds(new Set()); setPage(1); }}>📦 Stock</button>
        <button type="button" className={`tab-btn ${viewMode === 'recycle' ? 'active' : ''}`} onClick={() => { setViewMode('recycle'); setSelectedIds(new Set()); setRecyclePage(1); }}>🗑️ Recycle Bin{recyclePagination.total ? ` (${recyclePagination.total})` : ''}</button>
      </div>

      {viewMode === 'stock' && (
      <div className="inventory-stats-grid stats-grid">
        {[
          { icon: '📦', value: totalItems, label: 'Total Items', color: 'var(--accent-primary)', bg: 'rgba(0,212,255,0.1)' },
          { icon: '✅', value: availableCount, label: 'Available', color: 'var(--status-success)', bg: 'rgba(16,185,129,0.1)' },
          { icon: '⚠️', value: lowStockAlerts, label: 'Donor Drive', color: lowStockAlerts > 0 ? 'var(--status-danger)' : 'var(--status-success)', bg: lowStockAlerts > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)' },
          { icon: '💰', value: `₹${totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, label: 'Stock Value', color: 'var(--status-success)', bg: 'rgba(16,185,129,0.1)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ '--stat-color': s.color, '--stat-bg': s.bg }}>
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>
      )}

      {viewMode === 'stock' && (
      <div style={{ overflowX: 'auto', flexShrink: 0 }}>
        <div className="tabs" style={{ flexWrap: 'nowrap', minWidth: 'max-content' }}>
          {TABS.map(t => (
            <button key={t.key} type="button"
              className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
              style={t.color && activeTab === t.key ? { borderBottomColor: t.color, color: t.color } : {}}
              onClick={() => { setActiveTab(t.key); setPage(1); }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      )}

      <div className="filters-bar" style={{ marginBottom: 0, flexShrink: 0 }}>
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input className="search-input" placeholder="Search stock#, serial, PCB, model…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="inventory-table-panel table-container">
        <div className="inventory-table-scroll">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  {(viewMode === 'stock' || viewMode === 'recycle') && (
                    <th style={{ width: '30px' }}>
                      <input type="checkbox" checked={selectedIds.size === displayList.length && displayList.length > 0} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                    </th>
                  )}
                  <th>Stock ID</th>
                  <th>Category</th>
                  <th>Company / Brand</th>
                  <th>Model</th>
                  <th>Serial #</th>
                  <th>PCB #</th>
                  <th>Capacity</th>
                  {viewMode === 'stock' && <th>Status</th>}
                  {viewMode === 'stock' && <th>Transferred to Client</th>}
                  <th>Qty</th>
                  {viewMode === 'recycle' && <th>Deleted</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displayList.map(item => {
                  const isLow = viewMode === 'stock' && item.quantity <= (item.min_quantity || 1);
                  const isTransferred = item.status === 'transferred';
                  const cat = getCategoryMeta(item.ui_category || item.category);
                  const dyn = item.dynamic_fields && typeof item.dynamic_fields === 'object'
                    ? item.dynamic_fields
                    : (typeof item.dynamic_fields === 'string' ? (() => { try { return JSON.parse(item.dynamic_fields); } catch { return {}; } })() : {});
                  const rowClass = isTransferred ? 'row-transferred' : isLow ? 'row-low-stock' : '';
                  return (
                    <tr key={item.id}
                      className={rowClass}
                      onClick={viewMode === 'stock' ? () => navigate(`/inventory/${item.id}`) : undefined}>
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} style={{ cursor: 'pointer' }} />
                      </td>
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
                      {viewMode === 'stock' && <td><StatusBadge status={item.status || 'available'} /></td>}
                      {viewMode === 'stock' && <td style={{ fontSize: '0.8rem', fontWeight: 600, color: item.is_transferred_to_client ? '#10b981' : '#94a3b8' }}>{item.is_transferred_to_client ? '✓ Yes' : '—'}</td>}
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem', color: isLow ? 'var(--status-danger)' : 'inherit' }}>
                          {item.quantity}
                          {isLow && <span style={{ marginLeft: 4, fontSize: '0.55rem', color: 'var(--status-danger)' }}> LOW</span>}
                        </span>
                      </td>
                      {viewMode === 'recycle' && (
                        <td className="text-xs text-muted">
                          {item.deleted_at ? new Date(item.deleted_at).toLocaleDateString('en-IN') : '—'}
                        </td>
                      )}
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                          {viewMode === 'stock' && canAccess('junior_engineer') && (
                            <>
                              <button type="button" className="btn btn-secondary btn-sm" disabled={isTransferred}
                                onClick={() => handleTransfer(item)} style={{ padding: '4px 8px', fontSize: '0.72rem' }} title={isTransferred ? 'Transferred' : 'Transfer'}>{isTransferred ? 'Transferred' : 'Transfer'}</button>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditItem(item)} style={{ padding: '4px 8px' }}>Edit</button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdjustItem(item)} style={{ padding: '4px 8px' }}>±</button>
                            </>
                          )}
                          {viewMode === 'recycle' && (
                            <>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleRestore(item.id)}>Restore</button>
                              {isAdmin && (
                                <button type="button" className="btn btn-danger btn-sm" onClick={() => { setSelectedIds(new Set([item.id])); setShowPermanentDelete(true); }}>Delete Permanently</button>
                              )}
                            </>
                          )}
                          {viewMode === 'stock' && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/inventory/${item.id}`)} style={{ padding: '4px 8px' }}>→</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!displayList.length && (
                  <tr><td colSpan={viewMode === 'recycle' ? 10 : 11}>
                    <div className="empty-state">
                      <div className="empty-icon">{viewMode === 'recycle' ? '🗑️' : '📦'}</div>
                      <div className="empty-title">{viewMode === 'recycle' ? 'Recycle bin is empty' : 'No items found'}</div>
                      <div className="empty-desc">
                        {viewMode === 'recycle' ? 'Deleted stock items appear here until restored or permanently removed.' : (activeTab === 'low_stock' ? '✅ No low-stock alerts!' : 'Add stock items or import from CSV.')}
                      </div>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        {activePagination.pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: 10, borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={activePage <= 1} onClick={() => setActivePage(p => p - 1)}>← Prev</button>
            <span className="text-xs text-muted font-mono">Page {activePage} of {activePagination.pages}</span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={activePage >= activePagination.pages} onClick={() => setActivePage(p => p + 1)}>Next →</button>
          </div>
        )}
      </div>

      {showNew && (
        <NewItemModal onClose={() => setShowNew(false)} onCreated={loadStock} hddCompanies={activeBrandNames} />
      )}
      {editItem && (
        <NewItemModal onClose={() => setEditItem(null)} onCreated={loadStock} editItem={editItem} hddCompanies={activeBrandNames} />
      )}
      {adjustItem && <AdjustStockModal item={adjustItem} onClose={() => setAdjustItem(null)} onDone={loadStock} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={loadStock} />}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          selectedCount={selectedCount}
          onConfirm={handleSoftDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {showPermanentDelete && (
        <PermanentDeleteModal
          selectedCount={selectedCount}
          onConfirm={handlePermanentDelete}
          onCancel={() => setShowPermanentDelete(false)}
        />
      )}
    </div>
  );
}
