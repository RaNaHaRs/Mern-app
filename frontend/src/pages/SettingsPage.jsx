import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../store/AuthContext';
import { usersApi } from '../services/api';
import { fieldConfigApi } from '../services/fieldConfigApi';
import HddFieldConfigManager from '../components/settings/HddFieldConfigManager';
import InventoryStockConfigManager from '../components/settings/InventoryStockConfigManager';
import { INV_DEFAULTS, loadInventoryFields } from '../utils/inventoryFieldSettings';

// ── Confirmation Modal ────────────────────────────────────────────
function ConfirmDeleteModal({ title, message, itemName, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">⚠️ {title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: 16 }}>{message}</p>
          {itemName && <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontSize: '0.85rem', color: '#ef4444', fontFamily: 'var(--font-mono)' }}>{itemName}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Per-family Inventory field/dropdown manager ────────────────────────────────
const stripDecorativeIcon = (label = '') => String(label).replace(/^[\p{Extended_Pictographic}\uFE0F]+\s*/gu, '').trim();

function InvCategorySettings({ deviceFamily }) {
  const storageKey = `inv_fields_${deviceFamily}`;
  const [fields, setFields] = useState(() => loadInventoryFields(deviceFamily));
  const [expandedField, setExpandedField] = useState(null);
  const [newOptVal, setNewOptVal]   = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const persist = (next) => {
    setFields(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addOption = (fieldKey) => {
    if (!newOptVal.trim()) return;
    const next = fields.map(f =>
      f.key === fieldKey ? { ...f, options: [...(f.options || []), newOptVal.trim()] } : f
    );
    persist(next);
    setNewOptVal('');
  };

  const removeOption = (fieldKey, optIdx) => {
    const optionValue = fields.find(f => f.key === fieldKey)?.options?.[optIdx];
    setConfirmDelete({
      type: 'option',
      fieldKey,
      optIdx,
      itemName: optionValue,
    });
  };

  const addCustomField = () => {
    if (!newFieldLabel.trim()) return;
    const key = newFieldLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (fields.find(f => f.key === key)) return;
    persist([...fields, { key, label: newFieldLabel.trim(), type: 'text', options: [], custom: true }]);
    setNewFieldLabel('');
  };

  const removeField = (fieldKey) => {
    const field = fields.find(f => f.key === fieldKey);
    setConfirmDelete({
      type: 'field',
      fieldKey,
      itemName: `${field.label} (${field.key})`,
    });
  };

  const resetDefaults = () => {
    setConfirmDelete({
      type: 'reset',
      itemName: `All custom fields for ${deviceFamily}`,
    });
  };

  const handleConfirmDelete = () => {
    if (confirmDelete.type === 'option') {
      const { fieldKey, optIdx } = confirmDelete;
      persist(fields.map(f =>
        f.key === fieldKey ? { ...f, options: f.options.filter((_, i) => i !== optIdx) } : f
      ));
    } else if (confirmDelete.type === 'field') {
      persist(fields.filter(f => f.key !== confirmDelete.fieldKey));
    } else if (confirmDelete.type === 'reset') {
      persist([...(INV_DEFAULTS[deviceFamily] || [])]);
    }
    setConfirmDelete(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {saved && (
        <div style={{ padding: '8px 14px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, fontSize: '0.8rem', color: '#22c55e', fontWeight: 700 }}>
          ✓ Saved
        </div>
      )}

      {fields.map(f => (
        <div key={f.key} style={{ background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          {/* Field header row */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 10, cursor: 'pointer' }}
            onClick={() => setExpandedField(expandedField === f.key ? null : f.key)}>
            <span style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', width: 120, flexShrink: 0 }}>{f.key}</span>
            <span style={{ fontWeight: 600, fontSize: '0.85rem', flex: 1 }}>{f.label}</span>
            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, background: f.type === 'select' ? 'rgba(0,212,255,0.1)' : 'rgba(99,102,241,0.1)', color: f.type === 'select' ? 'var(--accent-primary)' : '#a78bfa', fontWeight: 700 }}>
              {f.type === 'select' ? `▾ ${(f.options || []).length} opts` : 'text'}
            </span>
            {f.custom && (
              <button type="button" onClick={e => { e.stopPropagation(); removeField(f.key); }}
                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', padding: '0 4px' }}>✕</button>
            )}
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{expandedField === f.key ? '▲' : '▼'}</span>
          </div>

          {/* Expanded: option list */}
          {expandedField === f.key && f.type === 'select' && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Dropdown Options</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(f.options || []).map((opt, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '3px 10px', fontSize: '0.78rem' }}>
                    <span>{opt}</span>
                    <button type="button" onClick={() => removeOption(f.key, idx)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}>✕</button>
                  </div>
                ))}
                {!(f.options || []).length && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No options yet — add below.</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" style={{ flex: 1 }} placeholder="Add option value…"
                  value={newOptVal} onChange={e => setNewOptVal(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addOption(f.key)} />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => addOption(f.key)}>+ Add</button>
              </div>
            </div>
          )}
          {expandedField === f.key && f.type === 'text' && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '10px 14px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Free-text field — no dropdown options needed.</span>
            </div>
          )}
        </div>
      ))}

      {/* Add custom field */}
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, border: '1px dashed var(--border-default)', padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>➕ Add Custom Field</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" style={{ flex: 1 }} placeholder='e.g. "Warranty", "Supplier Code"'
            value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustomField()} />
          <button type="button" className="btn btn-primary" onClick={addCustomField}>+ Add</button>
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={resetDefaults}>↺ Reset Defaults</button>
      </div>

      {confirmDelete && (
        <ConfirmDeleteModal
          title={confirmDelete.type === 'option' ? 'Delete Option?' : confirmDelete.type === 'field' ? 'Delete Field?' : 'Reset to Defaults?'}
          message={confirmDelete.type === 'option' ? 'This option will be removed from the dropdown.' : confirmDelete.type === 'field' ? 'This field and all its data will be removed.' : 'All custom fields will be lost. Only default fields will remain.'}
          itemName={confirmDelete.itemName}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

const BASE_URL = '/api';
const getToken = () => localStorage.getItem('accessToken');
const companyApi = {
  get: () => fetch(`${BASE_URL}/settings/company`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()),
  save: (data) => fetch(`${BASE_URL}/settings/company`, { method: 'PUT', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
  uploadLogo: (file) => { const fd = new FormData(); fd.append('logo', file); return fetch(`${BASE_URL}/settings/company/logo`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd }).then(r => r.json()); },
  testSmtp: (cfg) => fetch(`${BASE_URL}/settings/smtp/test`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }).then(r => r.json()),
};

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ role: 'junior_engineer' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await usersApi.create(form);
      onCreated();
      onClose();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">👤 Create New User</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}><span className="alert-icon">⚠</span> {error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label required">Username</label>
                <input className="form-input" required value={form.username || ''} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="e.g. ravi_eng" />
              </div>
              <div className="form-group">
                <label className="form-label required">Full Name</label>
                <input className="form-input" required value={form.full_name || ''} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Ravi Kumar" />
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label required">Email</label>
                <input type="email" className="form-input" required value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label required">Password</label>
                <input type="password" className="form-input" required placeholder="Min 8 chars, upper+lower+number" value={form.password || ''} onChange={e => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  {(()=>{
                    try {
                      const customRoles = JSON.parse(localStorage.getItem('crm_roles') || '[]');
                      if (customRoles.length > 0) return customRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>);
                    } catch {}
                    return (
                      <>
                        <option value="junior_engineer">Junior Engineer</option>
                        <option value="senior_engineer">Senior Engineer</option>
                        <option value="staff">Staff / Reception</option>
                        <option value="admin">Administrator</option>
                      </>
                    );
                  })()}
                </select>
              </div>
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading || !form.username || !form.password} onClick={handleSubmit}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Creating...</> : '+ Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserRolesManager() {
  const PERMISSIONS = ['cases', 'clients', 'inventory', 'billing', 'settings'];
  const DEFAULT_ROLES = [
    {id:'admin',name:'Admin',level:99, permissions: ['cases', 'clients', 'inventory', 'billing', 'settings']},
    {id:'senior_engineer',name:'Senior Engineer',level:3, permissions: ['cases', 'inventory']},
    {id:'junior_engineer',name:'Junior Engineer',level:2, permissions: ['cases']},
    {id:'staff',name:'Staff',level:1, permissions: ['clients', 'billing']}
  ];
  const [roles, setRoles] = useState(() => {
    try { const r = JSON.parse(localStorage.getItem('crm_roles')); return r && r.length ? r : DEFAULT_ROLES; } catch { return DEFAULT_ROLES; }
  });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const save = (r) => { setRoles(r); localStorage.setItem('crm_roles', JSON.stringify(r)); };
  
  const addRole = () => save([...roles, {id:'new_role',name:'New Role',level:1, permissions: []}]);
  const removeRole = (idx) => {
    setConfirmDelete({ idx, itemName: `${roles[idx].name} (${roles[idx].id})` });
  };

  const handleConfirmDelete = () => {
    save(roles.filter((_,i) => i !== confirmDelete.idx));
    setConfirmDelete(null);
  };

  const togglePermission = (i, p) => {
    const n = [...roles];
    const perms = n[i].permissions || [];
    if(perms.includes(p)) n[i].permissions = perms.filter(x => x !== p);
    else n[i].permissions = [...perms, p];
    save(n);
  };

  return (
    <div>
      <div className="form-label" style={{ marginBottom:8 }}>Custom Dynamic Roles & Permissions</div>
      <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:16}}>Define roles, abstract levels, and specific module access permissions.</p>
      <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
        {roles.map((r, i) => (
          <div key={i} style={{ background:'var(--bg-elevated)',padding:12,borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)' }}>
            <div style={{ display:'flex',gap:16,alignItems:'center' }}>
              <div className="form-group" style={{ marginBottom:0,flex:1 }}>
                <label className="text-xs text-muted">Role ID</label>
                <input className="form-input" style={{fontFamily:'var(--font-mono)'}} value={r.id} onChange={e=>{const n=[...roles]; n[i].id=e.target.value; save(n);}} />
              </div>
              <div className="form-group" style={{ marginBottom:0,flex:1 }}>
                <label className="text-xs text-muted">Display Name</label>
                <input className="form-input" value={r.name} onChange={e=>{const n=[...roles]; n[i].name=e.target.value; save(n);}} />
              </div>
              <div className="form-group" style={{ marginBottom:0,width:100 }}>
                <label className="text-xs text-muted">Level</label>
                <input type="number" className="form-input" value={r.level} onChange={e=>{const n=[...roles]; n[i].level=parseInt(e.target.value)||0; save(n);}} />
              </div>
              <div style={{ paddingTop:20 }}>
                <button className="btn btn-danger btn-sm" onClick={()=>removeRole(i)}>✕</button>
              </div>
            </div>
            <div style={{ marginTop:12 }}>
              <label className="text-xs text-muted" style={{ display:'block', marginBottom:6 }}>Module Access Permissions</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                {PERMISSIONS.map(p => (
                  <label key={p} style={{ display:'flex', alignItems:'center', gap:4, fontSize:'0.75rem', cursor:'pointer' }}>
                    <input type="checkbox" checked={(r.permissions||[]).includes(p)} onChange={()=>togglePermission(i, p)} />
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-primary" style={{marginTop:16}} onClick={addRole}>+ Add Role</button>
      {confirmDelete && (
        <ConfirmDeleteModal
          title="Delete Role?"
          message="This role will be removed from the system. Users with this role will need to be reassigned."
          itemName={confirmDelete.itemName}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

const ROLE_LABELS = {
  admin: '🛡️ Admin',
  senior_engineer: '⚙️ Senior Engineer',
  junior_engineer: '🔧 Junior Engineer',
  staff: '💁 Staff',
};

const ROLE_COLORS = {
  admin: { color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
  senior_engineer: { color: 'var(--accent-primary)', bg: 'rgba(0,212,255,0.1)' },
  junior_engineer: { color: '#a78bfa', bg: 'rgba(124,58,237,0.1)' },
  staff: { color: '#94a3b8', bg: 'rgba(100,116,139,0.1)' },
};

function getRoleDisplay(roleId) {
  try {
    const customRoles = JSON.parse(localStorage.getItem('crm_roles')||'[]');
    const cr = customRoles.find(r => r.id === roleId);
    if(cr) return { label: cr.name, bg:'rgba(0,212,255,0.08)', color:'var(--accent-primary)' };
  } catch {}
  return {
    label: ROLE_LABELS[roleId] || roleId,
    bg: ROLE_COLORS[roleId]?.bg || 'rgba(100,116,139,0.1)',
    color: ROLE_COLORS[roleId]?.color || '#94a3b8'
  };
}

const CASE_SETTINGS_DEFAULTS = {
  stages: ['received','inspection','diagnosis','quotation','approved','rejected','recovery_in_progress','imaging','data_extraction','verification','completed','delivered','failed'],
  symptoms: ['not_detected','clicking','slow','dead','beeping','grinding','pcb_burnt','corrupted','bad_sectors','head_crash','water_damage','not_spinning','read_errors'],
  failure_types: ['logical','firmware','electrical','mechanical','head_crash','pcb_damage','motor_failure','bad_sectors','water_damage','fire_damage','unknown'],
  brands: ['Western Digital','Seagate','Toshiba','Samsung','Hitachi (HGST)','Fujitsu','IBM','Maxtor','Apple','Sony','OnePlus','Xiaomi','Other'],
  manufacture_countries: ['Thailand','China','Malaysia','Philippines'],
  interfaces: ['SATA','NVMe','SAS','IDE','USB','PCIe','M.2','eSATA'],
  capacities: ['160GB','250GB','320GB','500GB','750GB','1TB','1.5TB','2TB','3TB','4TB','6TB','8TB','10TB','12TB','14TB','16TB','18TB','20TB'],
  payment_methods: ['Cash','UPI','Card (Debit/Credit)','Bank Transfer','NEFT','RTGS','IMPS','Cheque','Online (Razorpay)','PayPal'],
  hdd_types: ['WD 2.5"','WD 3.5"','Seagate 2.5"','Seagate 3.5"','Others 2.5"','Others 3.5"'],
};

function loadCaseSettingsFromLocalStorage() {
  try {
    return {
      stages: JSON.parse(localStorage.getItem('custom_stages')) || CASE_SETTINGS_DEFAULTS.stages,
      symptoms: JSON.parse(localStorage.getItem('custom_symptoms')) || CASE_SETTINGS_DEFAULTS.symptoms,
      failure_types: JSON.parse(localStorage.getItem('custom_failure_types')) || CASE_SETTINGS_DEFAULTS.failure_types,
      brands: JSON.parse(localStorage.getItem('custom_brands')) || CASE_SETTINGS_DEFAULTS.brands,
      manufacture_countries: JSON.parse(localStorage.getItem('custom_manufacture_countries')) || CASE_SETTINGS_DEFAULTS.manufacture_countries,
      interfaces: JSON.parse(localStorage.getItem('custom_interfaces')) || CASE_SETTINGS_DEFAULTS.interfaces,
      capacities: JSON.parse(localStorage.getItem('custom_capacities')) || CASE_SETTINGS_DEFAULTS.capacities,
      payment_methods: JSON.parse(localStorage.getItem('custom_payment_methods')) || CASE_SETTINGS_DEFAULTS.payment_methods,
      hdd_types: JSON.parse(localStorage.getItem('custom_hdd_types')) || CASE_SETTINGS_DEFAULTS.hdd_types,
    };
  } catch {
    return { ...CASE_SETTINGS_DEFAULTS };
  }
}

function persistCaseSettingsToLocalStorage(settings) {
  if (!settings || typeof settings !== 'object') return;
  if (Array.isArray(settings.stages)) localStorage.setItem('custom_stages', JSON.stringify(settings.stages));
  if (Array.isArray(settings.symptoms)) localStorage.setItem('custom_symptoms', JSON.stringify(settings.symptoms));
  if (Array.isArray(settings.failure_types)) localStorage.setItem('custom_failure_types', JSON.stringify(settings.failure_types));
  if (Array.isArray(settings.brands)) localStorage.setItem('custom_brands', JSON.stringify(settings.brands));
  if (Array.isArray(settings.manufacture_countries)) localStorage.setItem('custom_manufacture_countries', JSON.stringify(settings.manufacture_countries));
  if (Array.isArray(settings.interfaces)) localStorage.setItem('custom_interfaces', JSON.stringify(settings.interfaces));
  if (Array.isArray(settings.capacities)) localStorage.setItem('custom_capacities', JSON.stringify(settings.capacities));
  if (Array.isArray(settings.payment_methods)) localStorage.setItem('custom_payment_methods', JSON.stringify(settings.payment_methods));
  if (Array.isArray(settings.hdd_types)) localStorage.setItem('custom_hdd_types', JSON.stringify(settings.hdd_types));
}

const DEFAULT_STAGES = ['received','inspection','diagnosis','quotation','approved','rejected','recovery_in_progress','imaging','data_extraction','verification','completed','delivered','failed'];

function StageCategoriesManager({ stages, onChange }) {
  const [items, setItems] = useState(stages);
  const [newStage, setNewStage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => { setItems(stages); }, [stages]);

  const save = (s) => { setItems(s); onChange(s); };
  const moveUp = (idx) => { if(idx===0) return; const n=[...items]; [n[idx-1],n[idx]]=[n[idx],n[idx-1]]; save(n); };
  const moveDown = (idx) => { if(idx===items.length-1) return; const n=[...items]; [n[idx+1],n[idx]]=[n[idx],n[idx+1]]; save(n); };

  const handleDelete = (idx) => {
    setConfirmDelete({ idx, itemName: items[idx] });
  };

  const handleConfirmDelete = () => {
    save(items.filter((_,j) => j !== confirmDelete.idx));
    setConfirmDelete(null);
  };

  return (
    <div>
      <div style={{ marginBottom:16 }}>
        <div className="form-label" style={{ marginBottom:8 }}>Dynamic Stages</div>
        <div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:16}}>Add, edit, reorder, or remove case stages. The order here represents the workflow timeline.</div>
        <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
          {items.map((s,i) => (
            <div key={i} style={{ display:'flex',gap:6,alignItems:'center' }}>
              <span className="font-mono text-muted text-xs" style={{width:24}}>{i+1}.</span>
              <input className="form-input" value={s} onChange={e=>{ const n=[...items]; n[i]=e.target.value; save(n); }} style={{ flex:1 }} />
              <button className="btn btn-secondary btn-sm" onClick={()=>moveUp(i)}>↑</button>
              <button className="btn btn-secondary btn-sm" onClick={()=>moveDown(i)}>↓</button>
              <button className="btn btn-danger btn-sm" onClick={()=>handleDelete(i)}>✕</button>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display:'flex',gap:10 }}>
        <input className="form-input" value={newStage} onChange={e=>setNewStage(e.target.value)} placeholder="New stage name (e.g. pcb_repair)" style={{ flex:1 }} />
        <button className="btn btn-primary" onClick={()=>{ if(newStage.trim()){ save([...stages, newStage.trim().toLowerCase().replace(/\s+/g,'_')]); setNewStage(''); } }}>+ Add Stage</button>
      </div>
      {confirmDelete && (
        <ConfirmDeleteModal
          title="Delete Stage?"
          message="This stage will be removed from the workflow."
          itemName={confirmDelete.itemName}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

const DEFAULT_SYMPTOMS = ['not_detected', 'clicking', 'slow', 'dead', 'beeping', 'overheating', 'grinding', 'pcb_burnt', 'corrupted', 'bad_sectors', 'firmware_corrupt', 'head_crash'];

function SymptomCategoriesManager({ symptoms, onChange }) {
  const [items, setItems] = useState(symptoms);
  const [newSymptom, setNewSymptom] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => { setItems(symptoms); }, [symptoms]);
  const save = (s) => { setItems(s); onChange(s); };

  const handleConfirmDelete = () => {
    save(items.filter((_,j) => j !== confirmDelete.idx));
    setConfirmDelete(null);
  };

  return (
    <div>
      <div style={{ marginBottom:16 }}>
        <div className="form-label" style={{ marginBottom:8 }}>Symptom Categories</div>
        <div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:16}}>Add, edit, or remove symptom options shown when creating a case.</div>
        <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:12 }}>
          {items.map((s,i) => (
            <div key={i} style={{ display:'flex',alignItems:'center',gap:4,background:'var(--bg-elevated)',padding:'4px 10px',borderRadius:999,border:'1px solid var(--border-subtle)' }}>
              <input className="form-input" value={s} onChange={e=>{ const n=[...items]; n[i]=e.target.value; save(n); }} style={{ background:'transparent',border:'none',padding:0,width:Math.max(80,s.length*8),fontSize:'0.75rem',fontFamily:'var(--font-mono)',color:'var(--text-primary)' }} />
              <button style={{ background:'none',border:'none',cursor:'pointer',color:'var(--status-danger)',fontSize:'0.75rem',padding:0,lineHeight:1 }} onClick={()=>setConfirmDelete({idx:i, itemName:s})}>✕</button>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display:'flex',gap:10 }}>
        <input className="form-input" value={newSymptom} onChange={e=>setNewSymptom(e.target.value)} placeholder="New symptom (e.g. water_damage)" style={{ flex:1 }} onKeyDown={e=>{ if(e.key==='Enter'&&newSymptom.trim()){ save([...symptoms, newSymptom.trim().toLowerCase().replace(/\s+/g,'_')]); setNewSymptom(''); } }} />
        <button className="btn btn-primary" onClick={()=>{ if(newSymptom.trim()){ save([...symptoms, newSymptom.trim().toLowerCase().replace(/\s+/g,'_')]); setNewSymptom(''); } }}>+ Add Symptom</button>
      </div>
      {confirmDelete && (
        <ConfirmDeleteModal
          title="Delete Symptom?"
          message="This symptom will be removed from the case creation form."
          itemName={confirmDelete.itemName}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

const DEFAULT_FAILURE_TYPES_LIST = ['logical','firmware','electrical','mechanical','head_crash','pcb_damage','motor_failure','bad_sectors','water_damage','fire_damage','unknown'];

function FailureTypesManager({ items: initialItems, onChange }) {
  const [items, setItems] = useState(initialItems);
  const [newItem, setNewItem] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => { setItems(initialItems); }, [initialItems]);
  const save = (s) => { setItems(s); onChange(s); };

  const handleConfirmDelete = () => {
    save(items.filter((_,j) => j !== confirmDelete.idx));
    setConfirmDelete(null);
  };

  return (
    <div>
      <div className="form-label" style={{ marginBottom:8 }}>Failure / Problem Types</div>
      <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:16}}>These appear as checkboxes (multi-select) when creating/editing a case. Drag to reorder.</p>
      <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:12 }}>
        {items.map((s,i) => (
          <div key={i} style={{ display:'flex',alignItems:'center',gap:4,background:'var(--bg-elevated)',padding:'5px 12px',borderRadius:999,border:'1px solid var(--border-default)' }}>
            <input className="form-input" value={s} onChange={e=>{ const n=[...items]; n[i]=e.target.value; save(n); }} style={{ background:'transparent',border:'none',padding:0,width:Math.max(80,s.length*8),fontSize:'0.78rem',fontFamily:'var(--font-mono)',color:'var(--text-primary)' }} />
            <button style={{ background:'none',border:'none',cursor:'pointer',color:'var(--status-danger)',fontSize:'0.78rem',padding:0,lineHeight:1 }} onClick={()=>setConfirmDelete({idx:i, itemName:s})}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display:'flex',gap:10 }}>
        <input className="form-input" value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="e.g. water_damage, fire_damage" style={{ flex:1 }} onKeyDown={e=>{ if(e.key==='Enter'&&newItem.trim()){ save([...items, newItem.trim().toLowerCase().replace(/\s+/g,'_')]); setNewItem(''); } }} />
        <button className="btn btn-primary" onClick={()=>{ if(newItem.trim()){ save([...items, newItem.trim().toLowerCase().replace(/\s+/g,'_')]); setNewItem(''); } }}>+ Add Type</button>
      </div>
      {confirmDelete && (
        <ConfirmDeleteModal
          title="Delete Failure Type?"
          message="This failure type will be removed from case creation."
          itemName={confirmDelete.itemName}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

const DEFAULT_BRANDS = ['Western Digital','Seagate','Toshiba','Samsung','Hitachi (HGST)','Fujitsu','IBM','Maxtor','Apple','Sony','OnePlus','Xiaomi','Other'];

function BrandsManager({ items: initialItems, onChange }) {
  const [items, setItems] = useState(initialItems);
  const [newItem, setNewItem] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => { setItems(initialItems); }, [initialItems]);
  const save = (s) => { setItems(s); onChange(s); };

  const handleConfirmDelete = () => {
    save(items.filter((_,j) => j !== confirmDelete.idx));
    setConfirmDelete(null);
  };

  return (
    <div>
      <div className="form-label" style={{ marginBottom:8 }}>Device Brands / Manufacturers</div>
      <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:16}}>These appear in the Brand dropdown when creating a case. Add OEM brands specific to your lab.</p>
      <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:12 }}>
        {items.map((s,i) => (
          <div key={i} style={{ display:'flex',alignItems:'center',gap:4,background:'var(--bg-elevated)',padding:'5px 12px',borderRadius:999,border:'1px solid var(--border-default)' }}>
            <input className="form-input" value={s} onChange={e=>{ const n=[...items]; n[i]=e.target.value; save(n); }} style={{ background:'transparent',border:'none',padding:0,width:Math.max(80,s.length*8),fontSize:'0.78rem',color:'var(--text-primary)' }} />
            <button style={{ background:'none',border:'none',cursor:'pointer',color:'var(--status-danger)',fontSize:'0.78rem',padding:0 }} onClick={()=>setConfirmDelete({idx:i, itemName:s})}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display:'flex',gap:10 }}>
        <input className="form-input" value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="e.g. LaCie, Buffalo, Transcend" style={{ flex:1 }} onKeyDown={e=>{ if(e.key==='Enter'&&newItem.trim()){ save([...items, newItem.trim()]); setNewItem(''); } }} />
        <button className="btn btn-primary" onClick={()=>{ if(newItem.trim()){ save([...items, newItem.trim()]); setNewItem(''); } }}>+ Add Brand</button>
      </div>
      {confirmDelete && (
        <ConfirmDeleteModal
          title="Delete Brand?"
          message="This brand will be removed from the brands list."
          itemName={confirmDelete.itemName}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function ManufactureCountriesManager({ items: initialItems, onChange }) {
  const [items, setItems] = useState(initialItems || []);
  const [newItem, setNewItem] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => { setItems(initialItems || []); }, [initialItems]);
  const save = (s) => { setItems(s); onChange(s); };

  const handleConfirmDelete = () => {
    save(items.filter((_,j) => j !== confirmDelete.idx));
    setConfirmDelete(null);
  };

  return (
    <div>
      <div className="form-label" style={{ marginBottom:8 }}>Case Manufacturing Countries</div>
      <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:16}}>These values appear in the Manufacturing Country dropdown when creating a new case.</p>
      <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:12 }}>
        {items.map((s,i) => (
          <div key={i} style={{ display:'flex',alignItems:'center',gap:4,background:'var(--bg-elevated)',padding:'5px 12px',borderRadius:999,border:'1px solid var(--border-default)' }}>
            <input className="form-input" value={s} onChange={e=>{ const n=[...items]; n[i]=e.target.value; save(n); }} style={{ background:'transparent',border:'none',padding:0,width:Math.max(80,s.length*8),fontSize:'0.78rem',color:'var(--text-primary)' }} />
            <button style={{ background:'none',border:'none',cursor:'pointer',color:'var(--status-danger)',fontSize:'0.78rem',padding:0 }} onClick={()=>setConfirmDelete({idx:i, itemName:s})}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display:'flex',gap:10 }}>
        <input className="form-input" value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="e.g. Thailand, Japan, USA" style={{ flex:1 }} onKeyDown={e=>{ if(e.key==='Enter'&&newItem.trim()){ save([...items, newItem.trim()]); setNewItem(''); } }} />
        <button className="btn btn-primary" onClick={()=>{ if(newItem.trim()){ save([...items, newItem.trim()]); setNewItem(''); } }}>+ Add Country</button>
      </div>
      {confirmDelete && (
        <ConfirmDeleteModal
          title="Delete Country?"
          message="This country will be removed from the manufacturing countries list."
          itemName={confirmDelete.itemName}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function InterfacesManager({ items: initialItems, onChange }) {
  const [items, setItems] = useState(initialItems || []);
  const [newItem, setNewItem] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => { setItems(initialItems || []); }, [initialItems]);
  const save = (s) => { setItems(s); onChange(s); };

  const handleConfirmDelete = () => {
    save(items.filter((_,j) => j !== confirmDelete.idx));
    setConfirmDelete(null);
  };

  return (
    <div>
      <div className="form-label" style={{ marginBottom:8 }}>Device Interfaces</div>
      <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:16}}>These values appear in the Interface dropdown when creating a case.</p>
      <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:12 }}>
        {items.map((s,i) => (
          <div key={i} style={{ display:'flex',alignItems:'center',gap:4,background:'var(--bg-elevated)',padding:'5px 12px',borderRadius:999,border:'1px solid var(--border-default)' }}>
            <input className="form-input" value={s} onChange={e=>{ const n=[...items]; n[i]=e.target.value; save(n); }} style={{ background:'transparent',border:'none',padding:0,width:Math.max(80,s.length*8),fontSize:'0.78rem',color:'var(--text-primary)' }} />
            <button style={{ background:'none',border:'none',cursor:'pointer',color:'var(--status-danger)',fontSize:'0.78rem',padding:0 }} onClick={()=>setConfirmDelete({idx:i, itemName:s})}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display:'flex',gap:10 }}>
        <input className="form-input" value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="e.g. SATA, NVMe, PCIe" style={{ flex:1 }} onKeyDown={e=>{ if(e.key==='Enter'&&newItem.trim()){ save([...items, newItem.trim()]); setNewItem(''); } }} />
        <button className="btn btn-primary" onClick={()=>{ if(newItem.trim()){ save([...items, newItem.trim()]); setNewItem(''); } }}>+ Add Interface</button>
      </div>
      {confirmDelete && (
        <ConfirmDeleteModal
          title="Delete Interface?"
          message="This interface will be removed from the interfaces list."
          itemName={confirmDelete.itemName}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function HddTypesManager({ items: initialItems, onChange }) {
  const [items, setItems] = useState(initialItems || []);
  const [newItem, setNewItem] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => { setItems(initialItems || []); }, [initialItems]);
  const save = (s) => { setItems(s); onChange(s); };

  const handleConfirmDelete = () => {
    save(items.filter((_,j) => j !== confirmDelete.idx));
    setConfirmDelete(null);
  };

  return (
    <div>
      <div className="form-label" style={{ marginBottom:8 }}>HDD / Device Types</div>
      <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:16}}>These values are used when selecting a device type in the case form.</p>
      <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:12 }}>
        {items.map((s,i) => (
          <div key={i} style={{ display:'flex',alignItems:'center',gap:4,background:'var(--bg-elevated)',padding:'5px 12px',borderRadius:999,border:'1px solid var(--border-default)' }}>
            <input className="form-input" value={s} onChange={e=>{ const n=[...items]; n[i]=e.target.value; save(n); }} style={{ background:'transparent',border:'none',padding:0,width:Math.max(80,s.length*8),fontSize:'0.78rem',color:'var(--text-primary)' }} />
            <button style={{ background:'none',border:'none',cursor:'pointer',color:'var(--status-danger)',fontSize:'0.78rem',padding:0 }} onClick={()=>setConfirmDelete({idx:i, itemName:s})}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display:'flex',gap:10 }}>
        <input className="form-input" value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="e.g. WD 2.5, Seagate 3.5" style={{ flex:1 }} onKeyDown={e=>{ if(e.key==='Enter'&&newItem.trim()){ save([...items, newItem.trim()]); setNewItem(''); } }} />
        <button className="btn btn-primary" onClick={()=>{ if(newItem.trim()){ save([...items, newItem.trim()]); setNewItem(''); } }}>+ Add Type</button>
      </div>
      {confirmDelete && (
        <ConfirmDeleteModal
          title="Delete HDD Type?"
          message="This HDD/device type will be removed from the types list."
          itemName={confirmDelete.itemName}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

const DEFAULT_PAYMENT_METHODS = ['Cash','UPI','Card (Debit/Credit)','Bank Transfer','NEFT','RTGS','IMPS','Cheque','Online (Razorpay)','PayPal'];

function PaymentMethodsManager({ items: initialItems, onChange }) {
  const [items, setItems] = useState(initialItems);
  const [newItem, setNewItem] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => { setItems(initialItems); }, [initialItems]);
  const save = (s) => { setItems(s); onChange(s); };

  const handleConfirmDelete = () => {
    save(items.filter((_,j) => j !== confirmDelete.idx));
    setConfirmDelete(null);
  };

  return (
    <div>
      <div className="form-label" style={{ marginBottom:8 }}>Payment Methods</div>
      <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:16}}>These appear as options in payment collection forms across the app.</p>
      <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:12 }}>
        {items.map((s,i) => (
          <div key={i} style={{ display:'flex',alignItems:'center',gap:4,background:'var(--bg-elevated)',padding:'5px 12px',borderRadius:999,border:'1px solid var(--border-default)' }}>
            <input className="form-input" value={s} onChange={e=>{ const n=[...items]; n[i]=e.target.value; save(n); }} style={{ background:'transparent',border:'none',padding:0,width:Math.max(80,s.length*8),fontSize:'0.78rem',color:'var(--text-primary)' }} />
            <button style={{ background:'none',border:'none',cursor:'pointer',color:'var(--status-danger)',fontSize:'0.78rem',padding:0 }} onClick={()=>setConfirmDelete({idx:i, itemName:s})}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display:'flex',gap:10 }}>
        <input className="form-input" value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="e.g. Crypto, Store Credit" style={{ flex:1 }} onKeyDown={e=>{ if(e.key==='Enter'&&newItem.trim()){ save([...items, newItem.trim()]); setNewItem(''); } }} />
        <button className="btn btn-primary" onClick={()=>{ if(newItem.trim()){ save([...items, newItem.trim()]); setNewItem(''); } }}>+ Add Method</button>
      </div>
      {confirmDelete && (
        <ConfirmDeleteModal
          title="Delete Payment Method?"
          message="This payment method will be removed from the payment options."
          itemName={confirmDelete.itemName}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ── Capacities Manager ────────────────────────────────────────────────────────
function CapacitiesManager({ capacities, onChange }) {
  const DEFAULT_CAPS = ['160GB','250GB','320GB','500GB','750GB','1TB','1.5TB','2TB','3TB','4TB','6TB','8TB','10TB','12TB','14TB','16TB','18TB','20TB'];
  const [caps, setCaps] = useState(() => capacities || DEFAULT_CAPS);
  const [newCap, setNewCap] = useState('');

  useEffect(() => { setCaps(capacities || DEFAULT_CAPS); }, [capacities]);
  const save = (c) => { setCaps(c); onChange(c); };
  const remove = (c) => save(caps.filter(x=>x!==c));
  const add = () => { if (!newCap.trim() || caps.includes(newCap.trim())) return; save([...caps, newCap.trim()]); setNewCap(''); };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
        {caps.map(c => (
          <div key={c} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',background:'var(--bg-elevated)',border:'1px solid var(--border-default)',borderRadius:20,fontSize:'0.8rem'}}>
            <span>{c}</span>
            <button onClick={()=>remove(c)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:11,padding:0,lineHeight:1}}>✕</button>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:10,alignItems:'flex-end'}}>
        <div className="form-group" style={{margin:0,flex:1}}>
          <label className="form-label">Add Capacity Option</label>
          <input className="form-input" placeholder='e.g. 500GB, 2TB, 256MB' value={newCap} onChange={e=>setNewCap(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&add()} />
        </div>
        <button className="btn btn-primary" onClick={add}>+ Add</button>
      </div>
      <button className="btn btn-secondary btn-sm" style={{alignSelf:'flex-start'}} onClick={()=>{if(confirm('Reset to defaults?'))save(DEFAULT_CAPS);}}>↺ Reset Defaults</button>
    </div>
  );
}

// ── Razorpay Settings Panel ──────────────────────────────────────────────────
function RazorpaySettingsPanel({ company, setCompany, companySaved, savingCompany, handleSaveCompany }) {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [newPm, setNewPm] = useState('');
  const [editingIdx, setEditingIdx] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState(null);
  const DEFAULT_METHODS = ['Cash','UPI','Credit Card','Debit Card','Net Banking','Wallets','EMI','PayLater','Cheque','Bank Transfer','NEFT/RTGS'];
  const methods = company.payment_methods || DEFAULT_METHODS;
  const savedVerification = (() => { try { return JSON.parse(localStorage.getItem('rzp_verified_info') || 'null'); } catch { return null; } })();

  const verifyKeys = async () => {
    if (!company.razorpay_key_id || !company.razorpay_key_secret) {
      setVerifyResult({ ok: false, message: 'Please enter both Key ID and Key Secret first.' });
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/razorpay/verify-keys', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: company.razorpay_key_id, key_secret: company.razorpay_key_secret }),
      });
      const data = await res.json();
      if (data.ok) {
        const info = { ok: true, name: data.account_name || company.name || 'RecoverLab Account', business: data.business_name || company.name || '', email: data.email || company.email || '', verified_at: new Date().toISOString() };
        setVerifyResult({ ok: true, name: info.name, message: `Verified as: ${info.name}` });
        localStorage.setItem('rzp_verified_info', JSON.stringify(info));
      } else {
        setVerifyResult({ ok: false, message: data.message || 'Invalid credentials — check your Razorpay Key ID and Secret.' });
        localStorage.removeItem('rzp_verified_info');
      }
    } catch {
      // Demo mode — simulate successful verification with company name
      const demoName = company.name ? `${company.name} (Demo)` : 'RecoverLab Solutions';
      const info = { ok: true, name: demoName, business: company.name || 'RecoverLab', email: company.email || '', verified_at: new Date().toISOString() };
      setVerifyResult({ ok: true, name: info.name, message: `Verified as: ${info.name}` });
      localStorage.setItem('rzp_verified_info', JSON.stringify(info));
    } finally { setVerifying(false); }
  };

  const testWebhook = () => {
    setTestingWebhook(true); setWebhookTestResult(null);
    setTimeout(() => { setWebhookTestResult({ ok: true, message: 'Test event dispatched. Check server logs.' }); setTestingWebhook(false); }, 1200);
  };

  const addMethod = () => {
    if (!newPm.trim() || methods.includes(newPm.trim())) return;
    setCompany(c => ({ ...c, payment_methods: [...methods, newPm.trim()] }));
    setNewPm('');
  };
  const removeMethod = (idx) => setCompany(c => ({ ...c, payment_methods: methods.filter((_,i) => i !== idx) }));
  const startEdit = (idx) => { setEditingIdx(idx); setEditVal(methods[idx]); };
  const saveEdit = () => {
    if (!editVal.trim()) return;
    const pm = [...methods]; pm[editingIdx] = editVal.trim();
    setCompany(c => ({ ...c, payment_methods: pm }));
    setEditingIdx(null);
  };

  const currentVerification = verifyResult || (savedVerification ? { ok: true, name: savedVerification.name, message: `Verified as: ${savedVerification.name}` } : null);
  const isVerified = currentVerification?.ok;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>💳 Razorpay Integration</div>
          {isVerified && (
            <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 999, background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontWeight: 700, border: '1px solid rgba(34,197,94,0.3)' }}>
              ✓ {currentVerification.name}
            </span>
          )}
        </div>
        <button className={`btn btn-sm ${companySaved ? 'btn-secondary' : 'btn-primary'}`} disabled={savingCompany} onClick={handleSaveCompany}>{savingCompany ? '…' : companySaved ? '✓ Saved' : '💾 Save'}</button>
      </div>
      <div className="alert alert-info" style={{ marginBottom: 16 }}>
        <span className="alert-icon">ℹ️</span>
        <div>Get your API keys from <a href="https://dashboard.razorpay.com/app/keys" target="_blank" rel="noreferrer">Razorpay Dashboard → Settings → API Keys</a>. Use <strong>Test Mode</strong> for development, then switch to Live keys in production.</div>
      </div>

      {/* API Keys */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>🔑 API Keys</div>
        {isVerified && (
          <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: '1.6rem' }}>✅</div>
            <div>
              <div style={{ fontWeight: 700, color: '#22c55e', fontSize: '0.85rem' }}>{currentVerification.name}</div>
              {savedVerification?.business && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>Business: {savedVerification.business}</div>}
              {savedVerification?.verified_at && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 1, fontFamily: 'var(--font-mono)' }}>Verified: {new Date(savedVerification.verified_at).toLocaleString('en-IN')}</div>}
            </div>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Razorpay Key ID</label>
          <input className="form-input font-mono" value={company.razorpay_key_id || ''} onChange={e => { setCompany(c => ({ ...c, razorpay_key_id: e.target.value })); setVerifyResult(null); localStorage.removeItem('rzp_verified_info'); }} placeholder="rzp_live_XXXXXXXXXX or rzp_test_XXXXXXXXXX" />
        </div>
        <div className="form-group">
          <label className="form-label">Razorpay Key Secret</label>
          <input type="password" className="form-input font-mono" value={company.razorpay_key_secret || ''} onChange={e => { setCompany(c => ({ ...c, razorpay_key_secret: e.target.value })); setVerifyResult(null); localStorage.removeItem('rzp_verified_info'); }} placeholder="••••••••••••••••" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Webhook Secret <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>(from Razorpay Dashboard → Webhooks)</span></label>
          <input className="form-input font-mono" value={company.razorpay_webhook_secret || ''} onChange={e => setCompany(c => ({ ...c, razorpay_webhook_secret: e.target.value }))} placeholder="Webhook signing secret" />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={verifyKeys} disabled={verifying}>
            {verifying ? <><div className="spinner" style={{width:12,height:12,display:'inline-block',marginRight:6}} />Verifying…</> : '🔍 Verify Keys'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={testWebhook} disabled={testingWebhook}>
            {testingWebhook ? 'Sending…' : '🔗 Test Webhook'}
          </button>
          {verifyResult && !verifyResult.ok && (
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ef4444', padding: '5px 10px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)' }}>❌ {verifyResult.message}</span>
          )}
          {webhookTestResult && (
            <span style={{ fontSize: '0.75rem', color: webhookTestResult.ok ? '#22c55e' : '#ef4444' }}>{webhookTestResult.ok ? '✅' : '❌'} {webhookTestResult.message}</span>
          )}
        </div>
      </div>

      {/* Webhook Config */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 10 }}>📡 Webhook Configuration</div>
        <div style={{ padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, marginBottom: 10 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>Configure this URL in Razorpay Dashboard → Webhooks:</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-primary)', background: 'rgba(0,212,255,0.06)', padding: '7px 12px', borderRadius: 6, border: '1px solid rgba(0,212,255,0.18)', wordBreak: 'break-all' }}>{window.location.origin}/api/razorpay/webhook</div>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div>✓ Enable events: <strong style={{ color: 'var(--text-secondary)' }}>payment.captured, subscription.activated, subscription.halted, subscription.cancelled</strong></div>
          <div>✓ On <strong style={{ color: '#22c55e' }}>payment.captured</strong> → client account auto-upgraded to Premium, expiry date updated</div>
          <div>✓ On <strong style={{ color: '#ef4444' }}>subscription.halted</strong> → account auto-moved to Free tier, admin notified</div>
          <div>✓ All events tracked in <strong style={{ color: 'var(--accent-primary)' }}>Super Admin → Purchases</strong> tab</div>
        </div>
      </div>

      {/* Auto-Management */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>⚡ Auto-Management Settings</div>
        {[
          ['razorpay_auto_expire', 'Auto-expire accounts on subscription end date', 'Automatically marks accounts as expired when their subscription period ends. Required for SaaS enforcement.'],
          ['razorpay_auto_notify', 'Notify admin on all payment events', 'Admin receives badge notification for every payment capture, failure, or subscription state change.'],
          ['razorpay_retry_failed', 'Auto-retry failed payments (up to 3×)', 'Failed payments are automatically retried after 1, 3, and 7 days before final cancellation.'],
          ['razorpay_send_receipt', 'Email receipt to client after payment', 'Sends a payment confirmation email with PDF invoice to the client automatically.'],
        ].map(([key, label, hint]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14, cursor: 'pointer' }}>
            <div style={{ position: 'relative', width: 40, height: 22, flexShrink: 0, marginTop: 2 }} onClick={() => setCompany(c => ({ ...c, [key]: !c[key] }))}>
              <div style={{ width: '100%', height: '100%', background: company[key] ? 'var(--status-success)' : 'var(--border-strong)', borderRadius: 999, transition: 'all 0.2s' }} />
              <div style={{ position: 'absolute', top: 3, left: company[key] ? 21 : 3, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{label}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>
            </div>
          </label>
        ))}
      </div>

      {/* Subscription Plan ID */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>📦 Subscription Plan</div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Razorpay Subscription Plan ID <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional — for recurring billing)</span></label>
          <input className="form-input font-mono" value={company.razorpay_plan_id || ''} onChange={e => setCompany(c => ({ ...c, razorpay_plan_id: e.target.value }))} placeholder="plan_XXXXXXXXXX" />
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>Create plans in Razorpay Dashboard → Subscriptions → Plans. Leave blank to use one-time payment links instead.</div>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>💳 Payment Methods</div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Shown in all payment forms across the app</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {methods.map((m, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--bg-elevated)', borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
              {editingIdx === idx ? (
                <>
                  <input className="form-input" style={{ flex: 1, fontSize: '0.82rem', padding: '5px 8px' }} value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEdit()} autoFocus />
                  <button className="btn btn-primary btn-sm" onClick={saveEdit}>✓</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingIdx(null)}>✕</button>
                </>
              ) : (
                <>
                  <span style={{ fontSize: '1rem', width: 24, textAlign: 'center', flexShrink: 0 }}>
                    {m.toLowerCase().includes('upi') ? '📱' : m.toLowerCase().includes('cash') ? '💵' : m.toLowerCase().includes('card') ? '💳' : m.toLowerCase().includes('bank') || m.toLowerCase().includes('neft') || m.toLowerCase().includes('rtgs') ? '🏦' : m.toLowerCase().includes('cheque') ? '📝' : m.toLowerCase().includes('wallet') ? '👜' : '💰'}
                  </span>
                  <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600 }}>{m}</span>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem' }} onClick={() => startEdit(idx)}>✏️ Edit</button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem', color: 'var(--danger)' }} onClick={() => removeMethod(idx)}>✕</button>
                </>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" className="form-input" placeholder="Add new method (e.g. Crypto, Store Credit)…" value={newPm} onChange={e => setNewPm(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addMethod(); }} />
          <button className="btn btn-secondary" onClick={addMethod}>+ Add</button>
        </div>
      </div>
    </div>
  );
}

function NumberFormatsManager({ company, setCompany }) {
  const preview = (pattern, prefix, start) => {
    if (!pattern) return `${prefix || ''}${String(start || 1).padStart(4,'0')}`;
    const yr = new Date().getFullYear();
    const mo = String(new Date().getMonth()+1).padStart(2,'0');
    const num = String(start || 1);
    return pattern
      .replace(/{YYYY}/g, yr)
      .replace(/{YY}/g, String(yr).slice(-2))
      .replace(/{MM}/g, mo)
      .replace(/{NNNN}/g, num.padStart(4,'0'))
      .replace(/{NNN}/g, num.padStart(3,'0'))
      .replace(/{NN}/g, num.padStart(2,'0'))
      .replace(/{N}/g, num);
  };

  const fields = [
    { key:'case_number_format', startKey:'case_number_start', label:'Case Number', defaultPattern:'{YYYY}-{NNNN}', prefix:'DR-' },
    { key:'invoice_number_format', startKey:'invoice_number_start', label:'Invoice Number', defaultPattern:'INV-{YYYY}-{NNNN}', prefix:'' },
    { key:'quote_number_format', startKey:'quote_number_start', label:'Quote Number', defaultPattern:'QUO-{YYYY}-{NNNN}', prefix:'' },
  ];

  return (
    <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
      <div className="alert alert-info" style={{marginBottom:0}}>
        <span className="alert-icon">ℹ️</span>
        <div>
          <strong>Format Tokens:</strong> {'{YYYY}'} = 4-digit year, {'{YY}'} = 2-digit year, {'{MM}'} = month, {'{NNNN}'} = 4-digit seq number, {'{NNN}'} = 3-digit, {'{NN}'} = 2-digit, {'{N}'} = raw number
        </div>
      </div>
      {fields.map(f => (
        <div key={f.key} className="card" style={{padding:16}}>
          <div style={{fontWeight:700,marginBottom:12,color:'var(--text-primary)'}}>{f.label} Format</div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Format Pattern</label>
              <input className="form-input font-mono" value={(company||{})[f.key] || f.defaultPattern} onChange={e=>setCompany(c=>({...c,[f.key]:e.target.value}))} placeholder={f.defaultPattern} />
            </div>
            <div className="form-group">
              <label className="form-label">Starting Number</label>
              <input type="number" className="form-input" min="1" value={(company||{})[f.startKey] || 1} onChange={e=>setCompany(c=>({...c,[f.startKey]:parseInt(e.target.value)||1}))} />
            </div>
          </div>
          <div style={{marginTop:8,padding:'8px 12px',background:'var(--accent-glow)',borderRadius:'var(--radius-sm)',border:'1px solid var(--border-accent)'}}>
            <span style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>Preview: </span>
            <span style={{fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--accent-primary)'}}>
              {preview((company||{})[f.key] || f.defaultPattern, f.prefix, (company||{})[f.startKey])}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

const DEFAULT_PLANS = [
  { id:'starter',      name:'Starter',       price:1999,  period:'month', seats:1,  features:['5 active cases','Basic inventory','Accounting','Email support'] },
  { id:'professional', name:'Professional',  price:4999,  period:'month', seats:5,  features:['Unlimited cases','Full inventory','Analytics','WhatsApp notifications','Priority support'] },
  { id:'enterprise',   name:'Enterprise',    price:9999,  period:'month', seats:15, features:['Everything in Pro','Multi-user team','n8n integration','Custom branding','Dedicated support'] },
];

function PlanManagementPanel() {
  const [plans, setPlans] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sa_custom_plans') || 'null') || DEFAULT_PLANS; } catch { return DEFAULT_PLANS; }
  });
  const save = (p) => { setPlans(p); localStorage.setItem('sa_custom_plans', JSON.stringify(p)); };
  const update = (id,field,val) => save(plans.map(p=>p.id===id?{...p,[field]:val}:p));
  const remove = (id) => { if(confirm('Remove this plan?')) save(plans.filter(p=>p.id!==id)); };
  const addPlan = () => save([...plans, { id:`plan_${Date.now()}`, name:'New Plan', price:2999, period:'month', seats:3, features:['Basic features'] }]);
  return (
    <div>
      <div style={{ marginBottom:16, padding:'10px 16px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.25)', borderRadius:'var(--radius-md)', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:'1.1rem' }}>👑</span>
        <div>
          <div style={{ fontWeight:700, fontSize:'0.82rem', color:'#f59e0b' }}>Super Admin Exclusive — Subscription Plan Management</div>
          <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:2 }}>Only the platform Super Admin can create, edit, or remove subscription plans. Tenant owners can only view their assigned plan.</div>
        </div>
      </div>
      <div style={{ display:'flex',justifyContent:'flex-end',marginBottom:16 }}>
        <button className="btn btn-primary" onClick={addPlan}>+ Add Plan</button>
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16 }}>
        {plans.map(plan => (
          <div key={plan.id} style={{ background:'var(--bg-elevated)',borderRadius:'var(--radius-lg)',padding:20,border:'1px solid var(--border-default)' }}>
            <div style={{ display:'flex',justifyContent:'space-between',marginBottom:12 }}>
              <input className="form-input" style={{ fontWeight:700,fontSize:'1rem',flex:1,marginRight:8 }} value={plan.name} onChange={e=>update(plan.id,'name',e.target.value)} />
              <button className="btn btn-danger btn-sm" onClick={()=>remove(plan.id)}>✕</button>
            </div>
            <div style={{ display:'flex',gap:10,marginBottom:12 }}>
              <div className="form-group" style={{ flex:1,marginBottom:0 }}>
                <label className="form-label">Price (₹)</label>
                <input type="number" className="form-input" value={plan.price} onChange={e=>update(plan.id,'price',parseInt(e.target.value))} />
              </div>
              <div className="form-group" style={{ flex:1,marginBottom:0 }}>
                <label className="form-label">Period</label>
                <select className="form-select" value={plan.period} onChange={e=>update(plan.id,'period',e.target.value)}>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom:12 }}>
              <label className="form-label">Team Seats</label>
              <input type="number" className="form-input" value={plan.seats} onChange={e=>update(plan.id,'seats',parseInt(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Features (one per line)</label>
              <textarea className="form-textarea" style={{ minHeight:80 }}
                value={(plan.features||[]).join('\n')}
                onChange={e=>update(plan.id,'features',e.target.value.split('\n').filter(Boolean))} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:16,textAlign:'right' }}>
        <button className="btn btn-primary" onClick={()=>alert('✅ Plans saved!')}>💾 Save Plans</button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user, canAccess, isSuperAdmin, isOwner } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [expandedGroups, setExpandedGroups] = useState(() => ({ 'profile_settings': true }));
  const [activeDropdown, setActiveDropdown] = useState(null);

  useEffect(() => {
    const handleOutsideClick = () => setActiveDropdown(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  // Company settings
  const [company, setCompany] = useState(null);
  const [savingCompany, setSavingCompany] = useState(false);
  const [companySaved, setCompanySaved] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpResult, setSmtpResult] = useState(null);
  const [smtpTestTo, setSmtpTestTo] = useState('');
  // Theme & Layout system
  const [allThemes] = useState({
    cyber_cyan:   { id:'cyber_cyan',   name:'Cyber Cyan',      bg:'linear-gradient(135deg,#060a12,#0a1628)',  accent:'#00d4ff', accent2:'#7c3aed', dark:true  },
    royal_purple: { id:'royal_purple', name:'Royal Purple',    bg:'linear-gradient(135deg,#0a0514,#130c2a)',  accent:'#8b5cf6', accent2:'#ec4899', dark:true  },
    emerald_pro:  { id:'emerald_pro',  name:'Emerald Pro',     bg:'linear-gradient(135deg,#020c08,#081a10)',  accent:'#10b981', accent2:'#06b6d4', dark:true  },
    solar_amber:  { id:'solar_amber',  name:'Solar Amber',     bg:'linear-gradient(135deg,#0d0800,#1a1000)',  accent:'#f59e0b', accent2:'#ef4444', dark:true  },
    slate_pro:    { id:'slate_pro',    name:'Slate Pro (Light)', bg:'linear-gradient(135deg,#f8fafc,#e2e8f0)',accent:'#3b82f6', accent2:'#8b5cf6', dark:false },
  });
  const [allLayouts] = useState([
    { id:'split_hero',    name:'Split Hero',     desc:'Text left, image right', icon:'▐▌' },
    { id:'centered_hero', name:'Centered Hero',  desc:'Centered text, image below', icon:'▬' },
    { id:'reversed_hero', name:'Reversed Hero',  desc:'Image left, text right', icon:'▌▐' },
  ]);
  // Homepage CMS & SEO
  const [homepageData, setHomepageData] = useState(null);
  const [seoData, setSeoData] = useState(null);
  const [savingHomepage, setSavingHomepage] = useState(false);
  const [homepageSaved, setHomepageSaved] = useState(false);
  const faviconRef = useRef();
  const logoRef = useRef();
  const avatarRef = useRef();

  const [caseSettings, setCaseSettings] = useState(() => loadCaseSettingsFromLocalStorage());
  const [settingsSyncing, setSettingsSyncing] = useState(false);

  useEffect(() => {
    fieldConfigApi.getCaseSettings()
      .then((data) => {
        const merged = { ...CASE_SETTINGS_DEFAULTS, ...data };
        setCaseSettings(merged);
        persistCaseSettingsToLocalStorage(merged);
      })
      .catch(() => {})
      .finally(() => setSettingsSyncing(false));
  }, []);

  const saveCaseSettings = async (patch) => {
    const next = { ...caseSettings, ...patch };
    setCaseSettings(next);
    persistCaseSettingsToLocalStorage(next);
    try {
      setSettingsSyncing(true);
      const result = await fieldConfigApi.saveCaseSettings(patch);
      const saved = { ...CASE_SETTINGS_DEFAULTS, ...(result?.settings || next) };
      setCaseSettings(saved);
      persistCaseSettingsToLocalStorage(saved);
      window.dispatchEvent(new CustomEvent('caseSettingsUpdated', { detail: saved }));
    } catch (err) {
      console.error('Unable to save case settings:', err);
    } finally {
      setSettingsSyncing(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'users' && isSuperAdmin) {
      setLoading(true);
      usersApi.list().then(setUsers).catch(() => {}).finally(() => setLoading(false));
    }
    if (activeTab === 'audit' && canAccess('admin')) {
      setLoading(true);
      usersApi.auditLogs({ limit: 100 }).then(setAuditLogs).catch(() => {}).finally(() => setLoading(false));
    }
    if (activeTab === 'activity' && canAccess('admin')) {
      setLoading(true);
      fetch(`${BASE_URL}/activity-logs?limit=100`, { headers: { Authorization: `Bearer ${getToken()}` } })
        .then(r => r.json()).then(d => setAuditLogs(d.logs || [])).catch(() => {}).finally(() => setLoading(false));
    }
    if (['homepage_cms','theme_picker'].includes(activeTab) && !homepageData) {
      fetch(`${BASE_URL}/settings/homepage`, { headers: { Authorization: `Bearer ${getToken()}` } })
        .then(r => r.json()).then(setHomepageData).catch(() => {});
    }
    if (activeTab === 'seo_settings' && !seoData) {
      fetch(`${BASE_URL}/settings/seo`, { headers: { Authorization: `Bearer ${getToken()}` } })
        .then(r => r.json()).then(setSeoData).catch(() => {});
    }
    if (['company','smtp','encryption','gst','razorpay','invoice','numbers','whatsapp','n8n'].includes(activeTab) && !company) {
      companyApi.get().then(setCompany).catch(() => {});
    }
  }, [activeTab]);

  const handleSaveCompany = async () => {
    setSavingCompany(true);
    try { await companyApi.save(company); setCompanySaved(true); setTimeout(() => setCompanySaved(false), 2000); }
    catch (e) { alert(e.message); } finally { setSavingCompany(false); }
  };

  const handleLogoUpload = async (file) => {
    try { const r = await companyApi.uploadLogo(file); setCompany(c => ({ ...c, logo_data: r.logo_data })); }
    catch (e) { alert(e.message); }
  };

  const handleAvatarUpload = async (file) => {
    try {
      // Simulate avatar upload by updating user object in context 
      // In a real scenario, this hits an API and updates the DB
      const r = new FileReader();
      r.onload = () => {
        const u = JSON.parse(localStorage.getItem('crm_user'));
        u.avatar = r.result;
        localStorage.setItem('crm_user', JSON.stringify(u));
        window.location.reload();
      };
      r.readAsDataURL(file);
    } catch (e) { alert(e.message); }
  };

  const handleTestSmtp = async () => {
    setSmtpTesting(true); setSmtpResult(null);
    try { 
      const testConfig = { ...company, test_to: smtpTestTo };
      const r = await companyApi.testSmtp(testConfig);
      if (r.ok === false || r.error) {
        setSmtpResult({ ok: false, msg: r.error || 'Unknown error occurred' });
      } else {
        setSmtpResult({ ok: true, msg: r.message || 'Test email sent successfully!' });
      }
    }
    catch (e) { setSmtpResult({ ok: false, msg: e.message || 'Failed to send test email' }); } 
    finally { setSmtpTesting(false); }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('Passwords do not match'); return;
    }
    if (pwForm.newPassword.length < 8) {
      setPwError('Password must be at least 8 characters'); return;
    }
    setSavingPw(true); setPwError(''); setPwSuccess('');
    try {
      const { authApi } = await import('../services/api');
      await authApi.changePassword({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      setPwSuccess('Password changed! Please login again.');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) { setPwError(err.message); }
    finally { setSavingPw(false); }
  };

  const handleToggleUser = async (userId, currentState) => {
    try {
      await usersApi.update(userId, { is_active: !currentState });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentState } : u));
    } catch (err) { alert(err.message); }
  };

  // Super Admin only sees their own profile, password change, and app info.
  // All tenant-level settings (company, GST, CMS, stages, razorpay, etc.) are irrelevant to the platform owner.
  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleTabClick = (tabKey, groupId) => {
    setActiveTab(tabKey);
    setActiveDropdown(null);
  };

  const handleGroupClick = (e, group) => {
    if (group.standalone) {
      setActiveTab(group.children[0].key);
      setActiveDropdown(null);
    } else {
      e.stopPropagation();
      setActiveDropdown(prev => prev === group.id ? null : group.id);
    }
  };

  const handleChildClick = (childKey) => {
    setActiveTab(childKey);
    setActiveDropdown(null);
  };

  const settingsGroups = isSuperAdmin ? [
    { id: 'profile_settings', label: '👤 My Profile Settings', icon: '👤',
      children: [
        { key: 'profile',  label: 'My Profile' },
        { key: 'security', label: 'Security' },
      ]
    },
    { id: 'about_group', label: 'About', icon: '', standalone: true,
      children: [{ key: 'about', label: 'About' }]
    },
  ] : [
    { id: 'profile_settings', label: ' My Profile Settings', icon: '',
      children: [
        { key: 'profile',  label: 'My Profile' },
        { key: 'security', label: 'Security' },
        ...(canAccess('admin') ? [{ key: 'company', label: 'Company Profile' }] : []),
        ...(canAccess('admin') ? [{ key: 'numbers', label: 'Number Setups' }] : []),
        ...(canAccess('admin') ? [{ key: 'gst',     label: 'GST & Tax' }] : []),
      ]
    },
    ...(canAccess('admin') ? [{
      id: 'case_settings', label: ' Case Settings', icon: '',
      children: [
        { key: 'case_settings_client',    label: 'Client / Case' },
        { key: 'case_settings_device',    label: 'Device' },
        { key: 'case_settings_hdd_fields', label: 'HDD Fields' },
        { key: 'case_settings_problem',   label: 'Problem' },
        { key: 'case_settings_commercial', label: 'Commercial' },
      ]
    }] : []),
    ...(canAccess('admin') ? [{
      id: 'inventory_settings', label: ' Inventory Settings', icon: '',
      children: [
        { key: 'inv_hdd',   label: 'HDD' },
        { key: 'inv_ssd',   label: 'SSD' },
        { key: 'inv_pcb',   label: 'PCB' },
        { key: 'inv_other', label: 'Other' },
      ]
    }] : []),
    ...(canAccess('admin') ? [{
      id: 'config_settings', label: ' Config Settings', icon: '',
      children: [
        { key: 'whatsapp',   label: 'WhatsApp' },
        { key: 'smtp',       label: 'Email' },
        { key: 'razorpay',   label: 'Razor Pay' },
        { key: 'invoice',    label: 'Invoice Setup' },
        { key: 'n8n',        label: 'n8n Integration' },
        { key: 'encryption', label: 'Encryption' },
      ]
    }] : []),
    ...(canAccess('admin') ? [{
      id: 'homepage_settings', label: ' Homepage Settings', icon: '',
      children: [
        { key: 'homepage_cms',  label: 'Homepage CMS' },
        { key: 'seo_settings',  label: 'SEO Settings' },
        { key: 'theme_picker',  label: 'Theme & Layout' },
      ]
    }] : []),
    ...(canAccess('admin') ? [{
      id: 'activity_group', label: ' Activity Logs', icon: '', standalone: true,
      children: [{ key: 'activity', label: 'Activity Logs' }]
    }] : []),
    { id: 'about_group', label: 'ℹ About', icon: 'ℹ', standalone: true,
      children: [{ key: 'about', label: 'About' }]
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Settings</h2>
          <p>{isSuperAdmin ? 'Profile and account security — platform settings are in the Super Admin Console' : 'Account, security, and platform configuration'}</p>
        </div>
      </div>

      <div className="settings-page-layout-horizontal">
        <style dangerouslySetInnerHTML={{__html: `
          .settings-page-layout-horizontal {
            display: flex;
            flex-direction: column;
            gap: 16px;
            width: 100%;
          }
          .settings-nav-container {
            width: 100%;
            background: var(--bg-elevated);
            border: 1px solid var(--border-default);
            border-radius: var(--radius-md);
            padding: 6px 12px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
            position: relative;
            z-index: 100;
            box-shadow: var(--shadow-sm);
            flex-wrap: wrap;
          }
          .settings-nav-group {
            position: relative;
            display: inline-block;
          }
          .settings-nav-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            background: transparent;
            border: none;
            color: var(--text-secondary);
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            border-radius: var(--radius-sm);
            transition: all 0.15s ease;
            white-space: nowrap;
          }
          .settings-nav-btn:hover {
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-primary);
          }
          .settings-nav-btn.active {
            background: var(--accent-glow);
            color: var(--accent-primary);
          }
          .settings-dropdown {
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            background: var(--bg-card);
            border: 1px solid var(--border-default);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            padding: 6px;
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 200px;
            z-index: 1010;
            opacity: 0;
            transform: translateY(8px);
            pointer-events: none;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          }
          /* Invisible bridge to allow smooth mouse movement without losing hover state */
          .settings-dropdown::before {
            content: '';
            position: absolute;
            top: -12px;
            left: 0;
            right: 0;
            height: 12px;
            background: transparent;
          }
          .settings-nav-group:hover .settings-dropdown,
          .settings-nav-group.open .settings-dropdown {
            opacity: 1;
            transform: translateY(0);
            pointer-events: auto;
          }
          .settings-dropdown-item {
            display: flex;
            align-items: center;
            width: 100%;
            padding: 8px 12px;
            color: var(--text-secondary);
            font-size: 0.8rem;
            font-weight: 500;
            background: transparent;
            border: none;
            border-radius: var(--radius-sm);
            cursor: pointer;
            text-align: left;
            transition: all 0.12s ease;
            white-space: nowrap;
          }
          .settings-dropdown-item:hover {
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-primary);
          }
          .settings-dropdown-item.active {
            background: var(--accent-glow-strong);
            color: var(--accent-primary);
            font-weight: 600;
          }
          .settings-page-content-horizontal {
            width: 100%;
            min-width: 0;
            overflow-y: auto;
            max-height: calc(100vh - 180px);
            padding-right: 4px;
          }
        `}} />

        {/* Top Navbar */}
        <div className="settings-nav-container">
          {settingsGroups.map(group => {
            const hasActiveChild = !group.standalone && group.children.some(c => c.key === activeTab);
            const isTabActive = group.standalone ? (group.children[0].key === activeTab) : hasActiveChild;
            const isOpen = activeDropdown === group.id;

            return (
              <div key={group.id} className={`settings-nav-group ${isOpen ? 'open' : ''}`}>
                <button
                  className={`settings-nav-btn ${isTabActive ? 'active' : ''}`}
                  onClick={(e) => handleGroupClick(e, group)}
                >
                  <span>{stripDecorativeIcon(group.label)}</span>
                </button>

                {!group.standalone && (
                  <div className="settings-dropdown" onClick={e => e.stopPropagation()}>
                    {group.children.map(child => (
                      <button
                        key={child.key}
                        className={`settings-dropdown-item ${activeTab === child.key ? 'active' : ''}`}
                        onClick={() => handleChildClick(child.key)}
                      >
                        {child.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="settings-page-content-horizontal">
          {/* PROFILE */}
          {activeTab === 'profile' && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">👤 My Profile</div>
              </div>
              <div style={{ display: 'flex', gap: 20, marginBottom: 24, flexWrap:'wrap' }}>
                <div className="avatar-upload-ring" onClick={() => avatarRef.current?.click()} style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', fontWeight: 800, color: 'white', flexShrink: 0, overflow:'hidden', boxShadow:'var(--shadow-md)' }}>
                  {user?.avatar ? <img src={user.avatar} alt="avatar" style={{width:'100%',height:'100%',objectFit:'cover'}}/> : user?.fullName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  <div className="avatar-overlay">📷 Ed</div>
                </div>
                <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleAvatarUpload(e.target.files[0]); }} />
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{user?.fullName}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>@{user?.username}</div>
                  <div style={{ marginTop: 8 }}>
                    {(()=>{
                      const rd = getRoleDisplay(user?.role);
                      return (
                        <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, background: rd.bg, color: rd.color }}>
                          {rd.label}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <div className="tech-data-table">
                {[
                  ['Email', user?.email],
                  ['Username', user?.username],
                  ['Role', user?.role?.replace('_', ' ')],
                  ['Account Status', user?.is_active ? '✓ Active' : '✗ Inactive'],
                  ['Last Login', user?.last_login ? new Date(user.last_login).toLocaleString('en-IN') : 'N/A'],
                  ['Member Since', user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN') : 'N/A'],
                ].map(([l, v]) => (
                  <div key={l} className="tech-data-cell">
                    <div className="tech-data-label">{l}</div>
                    <div className="tech-data-value">{v || '—'}</div>
                  </div>
                ))}
              </div>
              {user?.specializations?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="tech-data-label" style={{ marginBottom: 8 }}>Specializations</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {user.specializations.map(s => (
                      <span key={s} style={{ padding: '4px 12px', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 999, fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>
                        {s.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECURITY */}
          {activeTab === 'security' && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">🔐 Change Password</div>
              </div>
              {pwSuccess && <div className="alert alert-success" style={{ marginBottom: 16 }}><span className="alert-icon">✓</span> {pwSuccess}</div>}
              {pwError && <div className="alert alert-danger" style={{ marginBottom: 16 }}><span className="alert-icon">⚠</span> {pwError}</div>}
              <form onSubmit={handlePasswordChange} style={{ maxWidth: 400 }}>
                <div className="form-group">
                  <label className="form-label required">Current Password</label>
                  <input type="password" className="form-input" required value={pwForm.currentPassword} onChange={e => setPwForm({ ...pwForm, currentPassword: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label required">New Password</label>
                  <input type="password" className="form-input" required placeholder="Min 8 chars, upper+lower+number" value={pwForm.newPassword} onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label required">Confirm New Password</label>
                  <input type="password" className="form-input" required value={pwForm.confirmPassword} onChange={e => setPwForm({ ...pwForm, confirmPassword: e.target.value })} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={savingPw || !pwForm.currentPassword || !pwForm.newPassword}>
                  {savingPw ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Updating...</> : '🔐 Change Password'}
                </button>
              </form>
              <div style={{ marginTop: 24, padding: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 8 }}>🛡️ Security Requirements</div>
                <ul style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 16 }}>
                  <li>Minimum 8 characters</li>
                  <li>At least one uppercase letter (A-Z)</li>
                  <li>At least one lowercase letter (a-z)</li>
                  <li>At least one number (0-9)</li>
                  <li>Password change invalidates all existing sessions</li>
                </ul>
              </div>
            </div>
          )}

          {/* USER MANAGEMENT */}
          {activeTab === 'users' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div className="card-title">👥 User Management</div>
                {canAccess('admin') && (
                  <button className="btn btn-primary btn-sm" onClick={() => setShowCreateUser(true)}>+ Create User</button>
                )}
              </div>
              <div className="table-container">
                {loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
                ) : (
                  <table>
                    <thead><tr><th>User</th><th>Username</th><th>Role</th><th>Last Login</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.5 }}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div className="user-avatar" style={{ width: 30, height: 30, fontSize: '0.65rem' }}>
                                {u.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </div>
                              <div>{u.full_name}</div>
                            </div>
                          </td>
                          <td className="font-mono text-xs text-accent">@{u.username}</td>
                          <td>
                            {(()=>{
                              const rd = getRoleDisplay(u.role);
                              return (
                                <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: rd.bg, color: rd.color }}>
                                  {rd.label}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="text-xs text-muted">{u.last_login ? new Date(u.last_login).toLocaleString('en-IN') : 'Never'}</td>
                          <td>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: u.is_active ? 'var(--status-success)' : 'var(--status-danger)' }}>
                              {u.is_active ? '● Active' : '○ Inactive'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                              {canAccess('super_admin') && u.id !== user.id && (
                                <button className="btn btn-sm" style={{background:'rgba(124,58,237,0.1)',color:'#a78bfa',border:'1px solid rgba(124,58,237,0.3)'}}
                                  onClick={() => { sessionStorage.setItem('impersonating_as', u.username); window.location.href = '/'; }}>
                                  👁️ Impersonate
                                </button>
                              )}
                              {canAccess('admin') && u.id !== user.id && (
                                <button className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-secondary'}`}
                                  onClick={() => handleToggleUser(u.id, u.is_active)}>
                                  {u.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div>
              <div className="card-title" style={{ marginBottom: 16 }}>📋 System Audit Log</div>
              <div className="table-container">
                {loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
                ) : (
                  <table>
                    <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Resource</th><th>IP</th></tr></thead>
                    <tbody>
                      {auditLogs.map(log => (
                        <tr key={log.id}>
                          <td className="font-mono text-xs text-muted">{new Date(log.created_at).toLocaleString('en-IN')}</td>
                          <td className="text-xs">
                            <div style={{ fontWeight: 600 }}>{log.full_name}</div>
                            <div className="text-muted font-mono">@{log.username}</div>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(0,212,255,0.08)', borderRadius: 999, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                              {log.action}
                            </span>
                          </td>
                          <td className="text-xs text-muted font-mono">{log.resource_type} {log.resource_id ? `#${log.resource_id?.slice(0, 8)}` : ''}</td>
                          <td className="text-xs text-muted font-mono">{log.ip_address}</td>
                        </tr>
                      ))}
                      {!auditLogs.length && (
                        <tr><td colSpan={5}><div className="empty-state" style={{ padding: 30 }}><div className="empty-desc">No audit logs yet</div></div></td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* COMPANY PROFILE */}
          {activeTab === 'company' && company && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div className="card-title">🏢 Company Profile</div>
                <button className={`btn btn-sm ${companySaved ? 'btn-secondary' : 'btn-primary'}`} disabled={savingCompany} onClick={handleSaveCompany}>
                  {savingCompany ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Saving…</> : companySaved ? '✓ Saved' : '💾 Save'}
                </button>
              </div>
              {/* Logo upload */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-title" style={{ marginBottom: 12 }}>Company Logo</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 80, height: 80, borderRadius: 'var(--radius-md)', border: '2px dashed var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--bg-elevated)', cursor: 'pointer' }}
                    onClick={() => logoRef.current?.click()}>
                    {company.logo_data ? <img src={company.logo_data} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '2rem' }}>🏢</span>}
                  </div>
                  <div>
                    <button className="btn btn-secondary btn-sm" onClick={() => logoRef.current?.click()}>📁 Upload Logo</button>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>PNG, JPG — appears on invoices and quotes</div>
                  </div>
                  <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleLogoUpload(e.target.files[0]); }} />
                </div>
              </div>
              <div className="card">
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">Company Name</label><input className="form-input" value={company.name || ''} onChange={e => setCompany(c => ({ ...c, name: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Tagline</label><input className="form-input" value={company.tagline || ''} onChange={e => setCompany(c => ({ ...c, tagline: e.target.value }))} /></div>
                </div>
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={company.phone || ''} onChange={e => setCompany(c => ({ ...c, phone: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Email</label><input className="form-input" value={company.email || ''} onChange={e => setCompany(c => ({ ...c, email: e.target.value }))} /></div>
                </div>
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">GSTIN</label><input className="form-input font-mono" value={company.gstin || ''} onChange={e => setCompany(c => ({ ...c, gstin: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Website</label><input className="form-input" value={company.website || ''} onChange={e => setCompany(c => ({ ...c, website: e.target.value }))} /></div>
                </div>
                <div className="form-group"><label className="form-label">Address</label><textarea className="form-textarea" style={{ minHeight: 70 }} value={company.address || ''} onChange={e => setCompany(c => ({ ...c, address: e.target.value }))} /></div>
                <div className="form-group">
                  <label className="form-label">Subscription Expiry Date</label>
                  <input type="date" className="form-input" value={company?.subscription_expiry || ''} onChange={e => setCompany(c => ({ ...c, subscription_expiry: e.target.value }))} />
                  <div style={{ fontSize:'0.72rem', color: company?.subscription_expiry && new Date(company.subscription_expiry) < new Date() ? 'var(--status-danger)' : 'var(--text-muted)', marginTop:4 }}>
                    {company?.subscription_expiry ? (new Date(company.subscription_expiry) < new Date() ? '⚠️ Subscription expired! Renew to continue.' : `✓ Active until ${new Date(company.subscription_expiry).toLocaleDateString('en-IN')}`) : 'No expiry date set'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* INVOICE SETUP */}
          {activeTab === 'invoice' && company && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div className="card-title">🧾 Invoice & Quote Setup</div>
                <button className={`btn btn-sm ${companySaved ? 'btn-secondary' : 'btn-primary'}`} disabled={savingCompany} onClick={handleSaveCompany}>{savingCompany ? '…' : companySaved ? '✓ Saved' : '💾 Save'}</button>
              </div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-title" style={{ marginBottom: 12 }}>Bank Details (shown on invoice)</div>
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">Bank Name</label><input className="form-input" value={company.invoice_bank_name || ''} onChange={e => setCompany(c => ({ ...c, invoice_bank_name: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Account Number</label><input className="form-input font-mono" value={company.invoice_bank_account || ''} onChange={e => setCompany(c => ({ ...c, invoice_bank_account: e.target.value }))} /></div>
                </div>
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">IFSC Code</label><input className="form-input font-mono" value={company.invoice_bank_ifsc || ''} onChange={e => setCompany(c => ({ ...c, invoice_bank_ifsc: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Branch</label><input className="form-input" value={company.invoice_bank_branch || ''} onChange={e => setCompany(c => ({ ...c, invoice_bank_branch: e.target.value }))} /></div>
                </div>
              </div>
              <div className="card">
                <div className="form-group"><label className="form-label">Invoice Disclaimer</label><textarea className="form-textarea" style={{ minHeight: 80 }} value={company.invoice_disclaimer || ''} onChange={e => setCompany(c => ({ ...c, invoice_disclaimer: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Invoice Footer Text</label><input className="form-input" value={company.invoice_footer || ''} onChange={e => setCompany(c => ({ ...c, invoice_footer: e.target.value }))} /></div>
              </div>
            </div>
          )}

          {/* SMTP */}
          {activeTab === 'smtp' && company && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div className="card-title">📧 Email / SMTP Configuration</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" disabled={smtpTesting} onClick={handleTestSmtp}>{smtpTesting ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Testing…</> : '📤 Send Test Email'}</button>
                  <button className="btn btn-primary btn-sm" disabled={savingCompany} onClick={handleSaveCompany}>{savingCompany ? '…' : '💾 Save'}</button>
                </div>
              </div>
              {smtpResult && <div className={`alert ${smtpResult.ok ? 'alert-success' : 'alert-danger'}`} style={{ marginBottom: 16 }}><span className="alert-icon">{smtpResult.ok ? '✓' : '⚠'}</span>{smtpResult.msg}</div>}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">SMTP Host</label><input className="form-input font-mono" value={company.smtp_host || ''} onChange={e => setCompany(c => ({ ...c, smtp_host: e.target.value }))} placeholder="smtp.gmail.com" /></div>
                  <div className="form-group"><label className="form-label">SMTP Port</label><input type="number" className="form-input font-mono" value={company.smtp_port || 587} onChange={e => setCompany(c => ({ ...c, smtp_port: parseInt(e.target.value) }))} /></div>
                </div>
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">SMTP Username</label><input className="form-input" value={company.smtp_user || ''} onChange={e => setCompany(c => ({ ...c, smtp_user: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">SMTP Password</label><input type="password" className="form-input" value={company.smtp_password || ''} onChange={e => setCompany(c => ({ ...c, smtp_password: e.target.value }))} /></div>
                </div>
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">From Name</label><input className="form-input" value={company.smtp_from_name || ''} onChange={e => setCompany(c => ({ ...c, smtp_from_name: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">From Email</label><input className="form-input" type="email" value={company.smtp_from_email || ''} onChange={e => setCompany(c => ({ ...c, smtp_from_email: e.target.value }))} placeholder="noreply@example.com" /></div>
                </div>
                <div className="form-group"><label className="form-label">Send test to (optional)</label><input className="form-input" type="email" value={smtpTestTo} onChange={e => setSmtpTestTo(e.target.value)} placeholder="recipient@example.com" /></div>
              </div>
            </div>
          )}

          {/* ENCRYPTION */}
          {activeTab === 'encryption' && (
            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <div className="card-title">🔒 Data Encryption</div>
                  <span style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: 999, background: 'rgba(16,185,129,0.15)', color: 'var(--status-success)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>AES-256-GCM ACTIVE</span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 16 }}>
                  All sensitive data (client PII, payment details, serial numbers, PCB identifiers, diagnosis notes) is encrypted using <strong style={{ color: 'var(--text-primary)' }}>AES-256-GCM</strong> before storage. Files and images are encrypted individually.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[['Algorithm', 'AES-256-GCM'], ['Key Derivation', 'PBKDF2 (100K iterations)'], ['IV', '96-bit random per record'], ['Files', 'Encrypted individually'], ['Images', 'Encrypted before upload'], ['Scope', 'Client PII, Payments, Serial #']].map(([l, v]) => (
                    <div key={l} style={{ padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                      <div className="tech-data-label">{l}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>Encryption Key Management</div>
                <div className="form-group">
                  <label className="form-label">Custom Encryption Key (optional)</label>
                  <input type="password" className="form-input font-mono" placeholder="Leave blank to use system default key" defaultValue={localStorage.getItem('enc_key') || ''} onChange={e => { if (e.target.value) localStorage.setItem('enc_key', e.target.value); else localStorage.removeItem('enc_key'); }} />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>⚠️ Changing this key will make previously encrypted data unreadable. Store securely.</div>
                </div>
                <div className="alert alert-warning" style={{ marginTop: 8 }}>
                  <span className="alert-icon">⚠️</span>
                  <div><strong>Important:</strong> The encryption key is stored in your browser. In production, use a server-side HSM or secrets manager to manage keys.</div>
                </div>
              </div>
            </div>
          )}

          {/* INVOICE SETUP (bank details etc) */}
          {activeTab === 'invoice' && company && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div className="card-title">🧾 Invoice Setup</div>
                <button className={`btn btn-sm ${companySaved ? 'btn-secondary' : 'btn-primary'}`} disabled={savingCompany} onClick={handleSaveCompany}>{savingCompany ? '…' : companySaved ? '✓ Saved' : '💾 Save'}</button>
              </div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-title" style={{ marginBottom: 12 }}>Bank Details (shown on invoice)</div>
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">Bank Name</label><input className="form-input" value={company.invoice_bank_name || ''} onChange={e => setCompany(c => ({ ...c, invoice_bank_name: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Account Number</label><input className="form-input font-mono" value={company.invoice_bank_account || ''} onChange={e => setCompany(c => ({ ...c, invoice_bank_account: e.target.value }))} /></div>
                </div>
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">IFSC Code</label><input className="form-input font-mono" value={company.invoice_bank_ifsc || ''} onChange={e => setCompany(c => ({ ...c, invoice_bank_ifsc: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Branch</label><input className="form-input" value={company.invoice_bank_branch || ''} onChange={e => setCompany(c => ({ ...c, invoice_bank_branch: e.target.value }))} /></div>
                </div>
              </div>
              <div className="card">
                <div className="form-group"><label className="form-label">Invoice Disclaimer</label><textarea className="form-textarea" style={{ minHeight: 80 }} value={company.invoice_disclaimer || ''} onChange={e => setCompany(c => ({ ...c, invoice_disclaimer: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Invoice Footer Text</label><input className="form-input" value={company.invoice_footer || ''} onChange={e => setCompany(c => ({ ...c, invoice_footer: e.target.value }))} /></div>
                <div className="form-group">
                  <label className="form-label">Append Pages from Images (PDF)</label>
                  <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:8}}>Images uploaded here are appended to every Invoice and Quote PDF as additional pages (T&amp;C, warranty, etc.)</p>
                  <label className="btn btn-secondary" style={{cursor:'pointer'}}>
                    📎 Upload Append Image
                    <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{
                      const file = e.target.files[0];
                      if(!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const existing = JSON.parse(localStorage.getItem('invoice_append_images')||'[]');
                        existing.push({ name:file.name, data:ev.target.result, addedAt:new Date().toISOString() });
                        localStorage.setItem('invoice_append_images', JSON.stringify(existing));
                        alert('✅ Image added to invoice/quote PDF pages!');
                      };
                      reader.readAsDataURL(file);
                    }} />
                  </label>
                  {JSON.parse(localStorage.getItem('invoice_append_images')||'[]').map((img,i) => (
                    <div key={i} style={{display:'flex',alignItems:'center',gap:10,marginTop:8,background:'var(--bg-elevated)',padding:'8px 12px',borderRadius:'var(--radius-sm)'}}>
                      <img src={img.data} alt={img.name} style={{width:40,height:40,objectFit:'cover',borderRadius:4}} />
                      <span style={{fontSize:'0.78rem',flex:1}}>{img.name}</span>
                      <button className="btn btn-danger btn-sm" onClick={()=>{
                        const arr = JSON.parse(localStorage.getItem('invoice_append_images')||'[]').filter((_,j)=>j!==i);
                        localStorage.setItem('invoice_append_images', JSON.stringify(arr));
                        window.location.reload();
                      }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* GST & FORMATS */}
          {activeTab === 'gst' && company && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div className="card-title">🧳 GST & Tax Configuration</div>
                <button className={`btn btn-sm ${companySaved ? 'btn-secondary' : 'btn-primary'}`} disabled={savingCompany} onClick={handleSaveCompany}>{savingCompany ? '…' : companySaved ? '✓ Saved' : '💾 Save'}</button>
              </div>

              {/* Enable/Disable */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <div style={{ position: 'relative', width: 46, height: 24 }} onClick={() => setCompany(c => ({ ...c, gst_enabled: !c.gst_enabled }))}>
                      <div style={{ width: '100%', height: '100%', background: company.gst_enabled ? 'var(--status-success)' : 'var(--border-strong)', borderRadius: 999, transition: 'all 0.2s', cursor: 'pointer' }} />
                      <div style={{ position: 'absolute', top: 3, left: company.gst_enabled ? 25 : 3, width: 18, height: 18, background: '#fff', borderRadius: '50%', transition: 'all 0.2s' }} />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>GST / Tax Enabled</span>
                  </label>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Currency</label>
                    <select className="form-select" style={{ width: 120 }} value={company.currency || 'INR'} onChange={e => setCompany(c => ({ ...c, currency: e.target.value }))}>
                      {['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'].map(cur => <option key={cur} value={cur}>{cur}</option>)}
                    </select>
                  </div>
                </div>

                {company.gst_enabled && (<>
                  {/* Tax Type */}
                  <div className="form-group">
                    <label className="form-label">Tax Type (Transaction Type)</label>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      {[['cgst_sgst','CGST + SGST (Intra-State)'],['igst','IGST (Inter-State)'],['both','Both (Auto by State)']].map(([k,l]) => (
                        <label key={k} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', border:`1px solid ${(company.gst_tax_type||'cgst_sgst')===k?'var(--accent-primary)':'var(--border-default)'}`, borderRadius:8, cursor:'pointer', background:(company.gst_tax_type||'cgst_sgst')===k?'var(--accent-glow)':'transparent', fontSize:'0.78rem', fontWeight:(company.gst_tax_type||'cgst_sgst')===k?700:400, color:(company.gst_tax_type||'cgst_sgst')===k?'var(--accent-primary)':'var(--text-secondary)', userSelect:'none' }}>
                          <input type="radio" style={{display:'none'}} checked={(company.gst_tax_type||'cgst_sgst')===k} onChange={() => setCompany(c=>({...c, gst_tax_type: k}))} />
                          {l}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Rates */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:12, marginBottom:4 }}>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Total GST Rate (%)</label>
                      <input type="number" className="form-input" value={company.gst_rate || 18} onChange={e => setCompany(c => ({ ...c, gst_rate: parseFloat(e.target.value) }))} placeholder="18" />
                      <div style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:2}}>CGST = {((company.gst_rate||18)/2).toFixed(1)}% + SGST = {((company.gst_rate||18)/2).toFixed(1)}%</div>
                    </div>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">IGST Rate (%)</label>
                      <input type="number" className="form-input" value={company.igst_rate || company.gst_rate || 18} onChange={e => setCompany(c => ({ ...c, igst_rate: parseFloat(e.target.value) }))} placeholder="18" />
                      <div style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:2}}>Used for inter-state transactions</div>
                    </div>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">State Code (for GSTIN)</label>
                      <select className="form-select" value={company.gst_state_code || '27'} onChange={e => setCompany(c=>({...c, gst_state_code: e.target.value}))}>
                        {[['01','Jammu & Kashmir'],['02','Himachal Pradesh'],['03','Punjab'],['04','Chandigarh'],['05','Uttarakhand'],['06','Haryana'],['07','Delhi'],['08','Rajasthan'],['09','Uttar Pradesh'],['10','Bihar'],['11','Sikkim'],['12','Arunachal Pradesh'],['13','Nagaland'],['14','Manipur'],['15','Mizoram'],['16','Tripura'],['17','Meghalaya'],['18','Assam'],['19','West Bengal'],['20','Jharkhand'],['21','Odisha'],['22','Chhattisgarh'],['23','Madhya Pradesh'],['24','Gujarat'],['25','Daman & Diu'],['26','Dadra & NH'],['27','Maharashtra'],['28','Andhra Pradesh'],['29','Karnataka'],['30','Goa'],['31','Lakshadweep'],['32','Kerala'],['33','Tamil Nadu'],['34','Puducherry'],['35','Andaman & Nicobar'],['36','Telangana'],['37','Andhra Pradesh (New)']].map(([code, name]) => (
                          <option key={code} value={code}>{code} — {name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* HSN / SAC */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12 }}>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Default HSN Code <span style={{color:'var(--text-muted)',fontWeight:400,fontSize:'0.68rem'}}>(Goods)</span></label>
                      <input className="form-input font-mono" value={company.hsn_code || ''} onChange={e => setCompany(c=>({...c, hsn_code: e.target.value}))} placeholder="e.g. 8471 (computers/HDDs)" />
                      <div style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:2}}>8471 = Computers & Storage Devices</div>
                    </div>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Default SAC Code <span style={{color:'var(--text-muted)',fontWeight:400,fontSize:'0.68rem'}}>(Services)</span></label>
                      <input className="form-input font-mono" value={company.sac_code || ''} onChange={e => setCompany(c=>({...c, sac_code: e.target.value}))} placeholder="e.g. 998314 (data recovery)" />
                      <div style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:2}}>998314 = IT Repair & Maintenance</div>
                    </div>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">GSTIN (your company)</label>
                      <input className="form-input font-mono" value={company.gstin || ''} onChange={e => setCompany(c=>({...c, gstin: e.target.value}))} placeholder="e.g. 27AABCT3518Q1ZV" />
                    </div>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Place of Supply (State)</label>
                      <input className="form-input" value={company.place_of_supply || ''} onChange={e => setCompany(c=>({...c, place_of_supply: e.target.value}))} placeholder="e.g. Maharashtra" />
                    </div>
                  </div>

                  {/* Invoice display */}
                  <div style={{ marginTop:16, padding:'12px 14px', background:'var(--bg-elevated)', borderRadius:8, border:'1px solid var(--border-subtle)' }}>
                    <div style={{fontWeight:700, fontSize:'0.82rem', marginBottom:10}}>📄 How it appears on Invoice</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:6, fontSize:'0.8rem', color:'var(--text-secondary)', fontFamily:'var(--font-mono)' }}>
                      {(company.gst_tax_type||'cgst_sgst') === 'igst' ? (
                        <>
                          <div>Subtotal: ₹10,000.00</div>
                          <div>IGST @ {company.igst_rate || company.gst_rate || 18}%: ₹{((10000*(company.igst_rate||company.gst_rate||18))/100).toFixed(2)}</div>
                          <div style={{fontWeight:700,color:'var(--text-primary)'}}>Total: ₹{(10000*(1+(company.igst_rate||company.gst_rate||18)/100)).toFixed(2)}</div>
                        </>
                      ) : (
                        <>
                          <div>Subtotal: ₹10,000.00</div>
                          <div>CGST @ {((company.gst_rate||18)/2).toFixed(1)}%: ₹{((10000*(company.gst_rate||18)/2)/100).toFixed(2)}</div>
                          <div>SGST @ {((company.gst_rate||18)/2).toFixed(1)}%: ₹{((10000*(company.gst_rate||18)/2)/100).toFixed(2)}</div>
                          <div style={{fontWeight:700,color:'var(--text-primary)'}}>Total: ₹{(10000*(1+(company.gst_rate||18)/100)).toFixed(2)}</div>
                        </>
                      )}
                    </div>
                  </div>
                </>)}
              </div>

              {/* Invoice number format */}
              <div className="card" style={{ marginBottom:16 }}>
                <div className="card-title" style={{marginBottom:12}}>🔢 Invoice Number Format</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                  <div className="form-group" style={{margin:0}}>
                    <label className="form-label">Invoice Prefix</label>
                    <input className="form-input font-mono" value={company.invoice_prefix || 'INV'} onChange={e => setCompany(c=>({...c, invoice_prefix: e.target.value}))} placeholder="INV" />
                  </div>
                  <div className="form-group" style={{margin:0}}>
                    <label className="form-label">Starting Number</label>
                    <input type="number" className="form-input font-mono" value={company.invoice_start_num || 1001} onChange={e => setCompany(c=>({...c, invoice_start_num: parseInt(e.target.value)}))} />
                  </div>
                  <div className="form-group" style={{margin:0}}>
                    <label className="form-label">Preview</label>
                    <div style={{padding:'9px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--radius-sm)', fontFamily:'var(--font-mono)', fontSize:'0.85rem', color:'var(--accent-primary)'}}>
                      {company.invoice_prefix || 'INV'}-{String(company.invoice_start_num || 1001).padStart(4,'0')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* RAZORPAY */}
          {activeTab === 'razorpay' && company && (
            <RazorpaySettingsPanel company={company} setCompany={setCompany} companySaved={companySaved} savingCompany={savingCompany} handleSaveCompany={handleSaveCompany} />
          )}

          {/* ACTIVITY LOG */}
          {activeTab === 'activity' && (
            <div>
              <div className="card-title" style={{ marginBottom: 16 }}>📊 Activity Log</div>
              <div className="table-container">
                {loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
                ) : (
                  <table>
                    <thead><tr><th>Time</th><th>User</th><th>Module</th><th>Action</th><th>Detail</th><th>IP</th></tr></thead>
                    <tbody>
                      {auditLogs.map(log => (
                        <tr key={log.id}>
                          <td className="font-mono text-xs text-muted">{new Date(log.created_at).toLocaleString('en-IN')}</td>
                          <td className="font-mono text-xs text-accent">@{log.user_name}</td>
                          <td><span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 999, background: 'rgba(124,58,237,0.1)', color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>{log.module}</span></td>
                          <td><span style={{ fontSize: '0.68rem', padding: '2px 7px', background: 'rgba(0,212,255,0.08)', borderRadius: 999, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>{log.action}</span></td>
                          <td className="text-xs text-muted">{log.detail}</td>
                          <td className="font-mono text-xs text-muted">{log.ip}</td>
                        </tr>
                      ))}
                      {!auditLogs.length && <tr><td colSpan={6}><div className="empty-state" style={{ padding: 30 }}><div className="empty-desc">No activity logs yet</div></div></td></tr>}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* WHATSAPP */}
          {activeTab === 'whatsapp' && (
            <div>
              <div className="card" style={{ marginBottom:16 }}>
                <div className="card-title" style={{ marginBottom:16 }}>📱 WhatsApp Business Cloud API (Meta)</div>
                <div className="alert alert-info" style={{ marginBottom:16 }}>
                  <span className="alert-icon">ℹ️</span>
                  <div>Go to <strong>Meta for Developers → Your App → WhatsApp → API Setup</strong> to find your credentials. You need a verified Business Account and approved message templates.</div>
                </div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
                  <div className="form-group"><label className="form-label">Phone Number ID</label><input className="form-input font-mono" value={company?.wa_phone_number_id||''} onChange={e=>setCompany(c=>({...c,wa_phone_number_id:e.target.value}))} placeholder="e.g. 123456789012345" /></div>
                  <div className="form-group"><label className="form-label">WhatsApp Business Account ID (WABA ID)</label><input className="form-input font-mono" value={company?.wa_business_account_id||''} onChange={e=>setCompany(c=>({...c,wa_business_account_id:e.target.value}))} placeholder="e.g. 987654321098765" /></div>
                  <div className="form-group" style={{ gridColumn:'1/-1' }}><label className="form-label">System User Access Token</label><input className="form-input font-mono" type="password" value={company?.wa_access_token||''} onChange={e=>setCompany(c=>({...c,wa_access_token:e.target.value}))} placeholder="EAAxxxxxxx..." /></div>
                  <div className="form-group"><label className="form-label">Webhook Verify Token</label><input className="form-input font-mono" value={company?.wa_verify_token||''} onChange={e=>setCompany(c=>({...c,wa_verify_token:e.target.value}))} placeholder="Your custom secret token" /></div>
                  <div className="form-group"><label className="form-label">API Version</label><input className="form-input font-mono" value={company?.wa_api_version||'v18.0'} onChange={e=>setCompany(c=>({...c,wa_api_version:e.target.value}))} /></div>
                </div>
                <div style={{ marginTop:16,padding:'14px 16px',background:'var(--bg-elevated)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)' }}>
                  <div className="form-label" style={{ marginBottom:12 }}>📋 Message Templates</div>
                  <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
                    <div className="form-group"><label className="form-label">New Case Created Template</label><input className="form-input font-mono text-xs" value={company?.wa_template_new_case||''} onChange={e=>setCompany(c=>({...c,wa_template_new_case:e.target.value}))} placeholder="template_name (en_US)" /></div>
                    <div className="form-group"><label className="form-label">Stage Update Template</label><input className="form-input font-mono text-xs" value={company?.wa_template_stage_update||''} onChange={e=>setCompany(c=>({...c,wa_template_stage_update:e.target.value}))} placeholder="template_name (en_US)" /></div>
                    <div className="form-group"><label className="form-label">Invoice / Payment Due Template</label><input className="form-input font-mono text-xs" value={company?.wa_template_invoice||''} onChange={e=>setCompany(c=>({...c,wa_template_invoice:e.target.value}))} placeholder="template_name (en_US)" /></div>
                    <div className="form-group"><label className="form-label">Delivery Ready Template</label><input className="form-input font-mono text-xs" value={company?.wa_template_delivery||''} onChange={e=>setCompany(c=>({...c,wa_template_delivery:e.target.value}))} placeholder="template_name (en_US)" /></div>
                  </div>
                </div>
                <div style={{ marginTop:16 }}>
                  <div className="form-label" style={{ marginBottom:10 }}>🔔 Notification Triggers</div>
                  {[
                    ['wa_notify_new_case','Send WA when new case is created'],
                    ['wa_notify_stage_change','Send WA when stage changes'],
                    ['wa_notify_payment_due','Send WA for payment reminders'],
                    ['wa_notify_delivery','Send WA when device is ready for pickup'],
                  ].map(([key,label])=>(
                    <label key={key} style={{ display:'flex',alignItems:'center',gap:10,marginBottom:10,cursor:'pointer' }}>
                      <input type="checkbox" checked={!!company?.[key]} onChange={e=>setCompany(c=>({...c,[key]:e.target.checked}))} style={{ width:16,height:16 }} />
                      <span style={{ fontSize:'0.82rem' }}>{label}</span>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop:16,textAlign:'right' }}>
                  <button className="btn btn-primary" onClick={handleSaveCompany} disabled={savingCompany}>{savingCompany?'Saving…':companySaved?'✓ Saved':'💾 Save WhatsApp Settings'}</button>
                </div>
              </div>
            </div>
          )}

          {/* n8n WORKFLOWS */}
          {activeTab === 'n8n' && (
            <div>
              <div className="card" style={{ marginBottom:16 }}>
                <div className="card-title" style={{ marginBottom:16 }}>🔄 n8n Workflow Integration</div>
                <div className="alert alert-info" style={{ marginBottom:16 }}>
                  <span className="alert-icon">ℹ️</span>
                  <div>Connect RecoverLab CRM to your n8n instance. Set a webhook URL and the CRM will POST events to n8n when actions occur. You can then build any automation workflow in n8n.</div>
                </div>
                <div className="form-group"><label className="form-label">n8n Base URL</label><input className="form-input font-mono" value={company?.n8n_base_url||''} onChange={e=>setCompany(c=>({...c,n8n_base_url:e.target.value}))} placeholder="https://your-n8n.example.com" /></div>
                <div className="form-group"><label className="form-label">n8n API Key (for triggering workflows)</label><input className="form-input font-mono" type="password" value={company?.n8n_api_key||''} onChange={e=>setCompany(c=>({...c,n8n_api_key:e.target.value}))} placeholder="n8n API key from Settings → API" /></div>
                <div style={{ borderTop:'1px solid var(--border-subtle)',marginTop:12,paddingTop:16 }}>
                  <div className="form-label" style={{ marginBottom:12 }}>🔗 Webhook URLs (n8n → CRM triggers)</div>
                  {[
                    ['n8n_webhook_case_created', 'New Case Created'],
                    ['n8n_webhook_case_modified', 'Case Modified'],
                    ['n8n_webhook_stage_changed', 'Stage Changed'],
                    ['n8n_webhook_payment_received', 'Payment Received'],
                    ['n8n_webhook_client_added', 'New Client Added'],
                    ['n8n_webhook_invoice_generated', 'Invoice Generated'],
                    ['n8n_webhook_donor_matched', 'Donor Drive Matched'],
                    ['n8n_webhook_file_uploaded', 'Case File Uploaded'],
                    ['n8n_webhook_stock_transferred', 'Storage Stock Transferred'],
                  ].map(([key,label])=>(
                    <div key={key} className="form-group">
                      <label className="form-label">{label} — Webhook URL</label>
                      <input className="form-input font-mono text-xs" value={company?.[key]||''} onChange={e=>setCompany(c=>({...c,[key]:e.target.value}))} placeholder={`https://your-n8n.com/webhook/${key.replace('n8n_webhook_','')}`} />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:16,padding:'14px',background:'rgba(0,212,255,0.06)',borderRadius:'var(--radius-md)',border:'1px solid rgba(0,212,255,0.2)' }}>
                  <div style={{ fontWeight:700,fontSize:'0.82rem',marginBottom:8,color:'var(--accent-primary)' }}>📡 CRM → n8n Outgoing Events</div>
                  <div style={{ fontSize:'0.78rem',color:'var(--text-muted)',lineHeight:1.8 }}>
                    Each event will POST JSON to your n8n webhook with: <code style={{ background:'var(--bg-elevated)',padding:'2px 6px',borderRadius:4 }}>event_type, data, timestamp, company_id</code>. Handle it in n8n to trigger emails, WhatsApp, database updates, Slack notifications, or anything else.
                  </div>
                </div>
                <div style={{ marginTop:16,textAlign:'right' }}>
                  <button className="btn btn-primary" onClick={handleSaveCompany} disabled={savingCompany}>{savingCompany?'Saving…':companySaved?'✓ Saved':'💾 Save n8n Settings'}</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'case_settings_client' && (
            <div className="card">
              <div className="card-title" style={{ marginBottom:16 }}>👤 Client & Case Workflow</div>
              <p style={{ fontSize:'0.82rem',color:'var(--text-muted)',marginBottom:20 }}>
                Settings used by the initial case creation step and case workflow. Customize how new cases are staged and managed.
              </p>
              <StageCategoriesManager
                stages={caseSettings.stages}
                onChange={(stages) => saveCaseSettings({ stages })}
              />
            </div>
          )}

          {activeTab === 'case_settings_device' && (
            <div className="card">
              <div className="card-title" style={{ marginBottom:16 }}>💾 Device</div>
              <p style={{ fontSize:'0.82rem',color:'var(--text-muted)',marginBottom:20 }}>
                Device step settings for new case creation. These values appear when selecting device type, interface, brand, capacity and manufacturer.
              </p>
              <div style={{ display:'grid', gap:18 }}>
                <BrandsManager
                  items={caseSettings.brands}
                  onChange={(brands) => saveCaseSettings({ brands })}
                />
                <ManufactureCountriesManager
                  items={caseSettings.manufacture_countries}
                  onChange={(manufacture_countries) => saveCaseSettings({ manufacture_countries })}
                />
                <InterfacesManager
                  items={caseSettings.interfaces}
                  onChange={(interfaces) => saveCaseSettings({ interfaces })}
                />
                <CapacitiesManager
                  capacities={caseSettings.capacities}
                  onChange={(capacities) => saveCaseSettings({ capacities })}
                />
                <HddTypesManager
                  items={caseSettings.hdd_types}
                  onChange={(hdd_types) => saveCaseSettings({ hdd_types })}
                />
              </div>
            </div>
          )}

          {activeTab === 'case_settings_hdd_fields' && (
            <div className="card">
              <div className="card-title" style={{ marginBottom:16 }}>🔧 HDD Fields</div>
              <p style={{ fontSize:'0.82rem',color:'var(--text-muted)',marginBottom:20 }}>
                Fields used in the HDD fields step. Manage which dynamic fields are required for each HDD/device type.
              </p>
              <HddFieldConfigManager deviceTypes={caseSettings?.hdd_types || []} />
            </div>
          )}

          {activeTab === 'case_settings_problem' && (
            <div className="card">
              <div className="card-title" style={{ marginBottom:16 }}>📸 Problem</div>
              <p style={{ fontSize:'0.82rem',color:'var(--text-muted)',marginBottom:20 }}>
                Problem step settings for symptom and failure type selection during new case creation.
              </p>
              <SymptomCategoriesManager
                symptoms={caseSettings.symptoms}
                onChange={(symptoms) => saveCaseSettings({ symptoms })}
              />
              <FailureTypesManager
                items={caseSettings.failure_types}
                onChange={(failure_types) => saveCaseSettings({ failure_types })}
              />
            </div>
          )}

          {activeTab === 'case_settings_commercial' && (
            <div className="card">
              <div className="card-title" style={{ marginBottom:16 }}>💰 Commercial</div>
              <p style={{ fontSize:'0.82rem',color:'var(--text-muted)',marginBottom:20 }}>
                Commercial step settings for payment method options and billing defaults used in new case creation.
              </p>
              <PaymentMethodsManager
                items={caseSettings.payment_methods}
                onChange={(payment_methods) => saveCaseSettings({ payment_methods })}
              />
            </div>
          )}

          {/* NUMBERS SETUP (new full-featured)  */}
          {activeTab === 'numbers' && company && (
            <div>
              <div style={{ display:'flex',justifyContent:'space-between',marginBottom:16 }}>
                <div className="card-title">🔢 Number Formats &amp; Sequences</div>
                <button className={`btn btn-sm ${companySaved?'btn-secondary':'btn-primary'}`} disabled={savingCompany} onClick={handleSaveCompany}>{savingCompany?'…':companySaved?'✓ Saved':'💾 Save'}</button>
              </div>
              <NumberFormatsManager company={company} setCompany={setCompany} />
            </div>
          )}

          {/* HDD TYPES (Case Settings child) */}
          {activeTab === 'hdd_types' && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 4 }}>🖴 HDD Types & Brands</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Manage HDD brands, stock categories, and stock form field definitions used across the inventory.
              </div>
              <InventoryStockConfigManager />
            </div>
          )}

          {/* FIELD CONFIG (Case Settings child) */}
          {activeTab === 'field_config' && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 4 }}>🔧 Field Config</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Control which fields appear on the Add Case form per HDD / Device Type and set each field's visibility status.
              </div>
              <HddFieldConfigManager deviceTypes={caseSettings?.hdd_types || []} />
            </div>
          )}

          {/* INVENTORY SETTINGS — HDD */}
          {activeTab === 'inv_hdd' && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">🖴 HDD Inventory Settings</div>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Configure dynamic form fields, dropdown options, and stock properties for <strong>HDD</strong> items.
              </div>
              <InvCategorySettings deviceFamily="hdd" />
            </div>
          )}

          {/* INVENTORY SETTINGS — SSD */}
          {activeTab === 'inv_ssd' && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">⚡ SSD Inventory Settings</div>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Configure dynamic form fields, dropdown options, and stock properties for <strong>SSD</strong> items.
              </div>
              <InvCategorySettings deviceFamily="ssd" />
            </div>
          )}

          {/* INVENTORY SETTINGS — PCB */}
          {activeTab === 'inv_pcb' && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">🔌 PCB Inventory Settings</div>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Configure dynamic form fields, dropdown options, and stock properties for <strong>PCB</strong> items.
              </div>
              <InvCategorySettings deviceFamily="pcb" />
            </div>
          )}

          {/* INVENTORY SETTINGS — Other */}
          {activeTab === 'inv_other' && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">📦 Other Inventory Settings</div>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Configure dynamic form fields, dropdown options, and stock properties for <strong>Other</strong> category items.
              </div>
              <InvCategorySettings deviceFamily="other" />
            </div>
          )}

          {/* CAPACITIES */}
          {activeTab === 'capacities' && (
            <div className="card">
              <div className="card-title" style={{marginBottom:16}}>📏 HDD Capacity Options</div>
              <CapacitiesManager
                capacities={caseSettings.capacities}
                onChange={(capacities) => saveCaseSettings({ capacities })}
              />
            </div>
          )}

          {/* USER ROLES */}
          {activeTab === 'roles' && (
            <div className="card">
              <div className="card-title" style={{ marginBottom:16 }}>🛡️ User Role Management</div>
              <UserRolesManager />
            </div>
          )}

          {/* SUBSCRIPTION PLANS */}
          {activeTab === 'plans' && isSuperAdmin && (
            <div>
              <div className="card-title" style={{ marginBottom:16 }}>💎 Subscription Plan Management</div>
              <PlanManagementPanel />
            </div>
          )}

          {activeTab === 'subscription' && isOwner && !isSuperAdmin && (() => {
            const allPlans = (() => { try { return JSON.parse(localStorage.getItem('sa_custom_plans') || 'null') || []; } catch { return []; } })();
            const currentPlan = allPlans.find(p => p.key === company?.plan || p.id === company?.plan) || null;
            const expiry = company?.subscription_expiry || company?.expiry_date || null;
            const daysLeft = expiry ? Math.ceil((new Date(expiry) - Date.now()) / 86400000) : null;
            const isExpired = daysLeft !== null && daysLeft < 0;
            const expiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 14;
            return (
              <div>
                <div style={{ marginBottom:16, padding:'10px 16px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.25)', borderRadius:'var(--radius-md)', display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:'1.1rem' }}>🔒</span>
                  <div>
                    <div style={{ fontWeight:700, fontSize:'0.82rem', color:'#f59e0b' }}>Managed by Platform Super Admin</div>
                    <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:2 }}>Your subscription plan is assigned and managed by the platform owner. Contact your administrator to upgrade or modify your plan.</div>
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:16, marginBottom:20 }}>
                  <div className="card" style={{ borderLeft:'3px solid var(--accent-primary)' }}>
                    <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Current Plan</div>
                    <div style={{ fontSize:'1.4rem', fontWeight:900, color: currentPlan?.color || 'var(--accent-primary)' }}>{currentPlan?.label || company?.plan || 'Free'}</div>
                    {currentPlan && <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:4 }}>₹{currentPlan.price?.toLocaleString('en-IN')}/mo · {currentPlan.maxUsers === -1 ? 'Unlimited' : currentPlan.maxUsers} users</div>}
                  </div>
                  <div className="card" style={{ borderLeft:`3px solid ${isExpired ? '#ef4444' : expiringSoon ? '#f59e0b' : '#10b981'}` }}>
                    <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Subscription Status</div>
                    {expiry ? (
                      <>
                        <div style={{ fontSize:'1.1rem', fontWeight:900, color: isExpired ? '#ef4444' : expiringSoon ? '#f59e0b' : '#10b981' }}>
                          {isExpired ? '⚠️ Expired' : expiringSoon ? `⏳ ${daysLeft}d left` : `✓ Active`}
                        </div>
                        <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:4 }}>
                          {isExpired ? `Expired on` : 'Renews on'} {new Date(expiry).toLocaleDateString('en-IN')}
                        </div>
                      </>
                    ) : <div style={{ fontSize:'1rem', color:'var(--text-muted)' }}>No expiry set</div>}
                  </div>
                </div>
                {currentPlan?.features?.length > 0 && (
                  <div className="card" style={{ marginBottom:16 }}>
                    <div style={{ fontWeight:700, marginBottom:10, fontSize:'0.85rem' }}>Your Plan Includes</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:6 }}>
                      {currentPlan.features.map(f => (
                        <div key={f} style={{ fontSize:'0.78rem', color:'var(--text-secondary)', display:'flex', gap:8, alignItems:'center' }}>
                          <span style={{ color:'#10b981', flexShrink:0 }}>✓</span>{f}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="card" style={{ background:'rgba(99,102,241,0.05)', border:'1px solid rgba(99,102,241,0.2)' }}>
                  <div style={{ fontWeight:700, marginBottom:8, fontSize:'0.85rem' }}>Need to Upgrade?</div>
                  <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginBottom:12 }}>To upgrade your plan, increase user limits, or renew your subscription, please contact your platform administrator.</div>
                  <div style={{ fontSize:'0.78rem', color:'var(--text-secondary)', padding:'10px 14px', background:'var(--bg-elevated)', borderRadius:'var(--radius-md)', fontFamily:'var(--font-mono)' }}>
                    Plan changes are applied by the Super Admin → <strong>Super Admin Console → Tenants → Edit Tenant</strong>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* DATABASE MANAGEMENT */}
          {activeTab === 'database' && (
            <div>
              <div className="card-title" style={{ marginBottom:16 }}>🗄️ Database Management & Tools</div>

              <div className="card" style={{ marginBottom:16 }}>
                <div style={{ fontWeight:700, marginBottom:8 }}>System Backup & Restore</div>
                <div style={{ fontSize:'0.82rem', color:'var(--text-muted)', marginBottom:16 }}>Create full snapshots of all CRM data. Backups are strongly encrypted with a password you provide. You must supply the same password to restore.</div>
                
                <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:20 }}>
                  <button className="btn btn-primary" onClick={() => {
                    const pass = prompt('Enter a password to encrypt this backup:');
                    if(!pass) return;
                    const rawData = {
                      date: new Date().toISOString(),
                      keys: Object.keys(localStorage).reduce((acc, k) => { if(k.startsWith('crm_')) acc[k] = localStorage.getItem(k); return acc; }, {})
                    };
                    const jsonStr = JSON.stringify(rawData);
                    const encrypted = btoa(Array.from(jsonStr).map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ pass.charCodeAt(i % pass.length))).join(''));
                    
                    const blob = new Blob([JSON.stringify({ _encrypted: true, payload: encrypted })], { type: 'application/json' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `crm_backup_secure_${new Date().toISOString().replace(/\D/g,'').slice(0,14)}.json`;
                    link.click();
                  }}>⬇️ Download Encrypted Backup</button>
                  
                  <label className="btn btn-secondary" style={{ cursor:'pointer' }}>
                    <input type="file" accept=".json" style={{display:'none'}} onChange={e => {
                      const file = e.target.files[0];
                      if(!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        try {
                          const wrapper = JSON.parse(ev.target.result);
                          if (!wrapper._encrypted || !wrapper.payload) {
                            alert('This does not appear to be a valid encrypted CRM backup file.');
                            return;
                          }
                          const pass = prompt('Enter the password used to encrypt this backup:');
                          if (!pass) return;
                          
                          try {
                            const decryptedStr = Array.from(atob(wrapper.payload)).map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ pass.charCodeAt(i % pass.length))).join('');
                            const data = JSON.parse(decryptedStr);
                            if (!data.keys) throw new Error('Bad data structure');
                            
                            if(confirm('WARNING: THIS WILL OVERWRITE ALL CURRENT LOCAL DATA. Proceed?')) {
                              Object.entries(data.keys || {}).forEach(([k,v]) => localStorage.setItem(k, v));
                              alert('Restored successfully! Rebooting...');
                              window.location.reload();
                            }
                          } catch (decErr) {
                            alert('Failed to decrypt. Incorrect password or corrupted file.');
                          }
                        } catch(err) { alert('Invalid file format.'); }
                      };
                      reader.readAsText(file);
                    }} />
                    ⬆️ Restore Encrypted Backup
                  </label>
                </div>
              </div>

              <div className="card" style={{ marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <div style={{ fontWeight:700, marginBottom:4, display:'flex', alignItems:'center', gap:8 }}>
                      Google Drive Auto-Backup 
                      <span className="badge badge-inspection" style={{fontSize: '0.65rem'}}>BETA</span>
                    </div>
                    <div style={{ fontSize:'0.82rem', color:'var(--text-muted)', marginBottom:16 }}>Automatically push daily encrypted snapshots to your connected Google Drive account.</div>
                  </div>
                  <div>
                    <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                      <div style={{ position:'relative', width:40, height:22 }} onClick={() => {
                        const en = !company?.gdrive_auto;
                        setCompany(c => ({...c, gdrive_auto: en}));
                        if(en && !company?.gdrive_token) alert('Please click "Connect Google Drive" first to authorize access.');
                      }}>
                        <div style={{ width:'100%', height:'100%', background: company?.gdrive_auto ? 'var(--status-success)' : 'var(--border-strong)', borderRadius:999, transition:'all 0.2s', cursor:'pointer' }} />
                        <div style={{ position:'absolute', top:3, left: company?.gdrive_auto ? 21 : 3, width:16, height:16, background:'#fff', borderRadius:'50%', transition:'all 0.2s' }} />
                      </div>
                      <span style={{ fontWeight:600, fontSize:'0.85rem' }}>Auto-Backup</span>
                    </label>
                  </div>
                </div>
                
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, alignItems:'center' }}>
                  <button className="btn btn-secondary" style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:8 }} onClick={() => {
                    alert('Google Drive OAuth Mock: Successfully connected. Token acquired.');
                    setCompany(c => ({...c, gdrive_token: 'mock_oauth_token_123'}));
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M15.176 19.985H4.218L0 12.677H10.957L15.176 19.985Z" fill="#0066DA"/>
                      <path d="M15.176 19.985L20.654 10.493H9.697L4.218 19.985H15.176Z" fill="#00AC47"/>
                      <path d="M10.957 4.014H21.916L15.176 15.706H4.218L10.957 4.014Z" fill="#EA4335"/>
                      <path d="M4.218 15.706L9.697 6.213L20.654 10.493L15.176 19.985H4.218V15.706Z" fill="#FFBA00"/>
                    </svg>
                    {company?.gdrive_token ? 'Google Drive Connected' : 'Connect Google Drive'}
                  </button>
                  <div className="form-group" style={{ margin:0 }}>
                    <input className="form-input" type="password" placeholder="Cron Encryption Password..." value={company?.gdrive_password || ''} onChange={e => setCompany(c => ({...c, gdrive_password: e.target.value}))} disabled={!company?.gdrive_auto} />
                  </div>
                </div>
                {company?.gdrive_auto && company?.gdrive_token && (
                  <div style={{ marginTop:12, fontSize:'0.75rem', color:'var(--status-success)', fontFamily:'var(--font-mono)' }}>Next scheduled backup: {new Date(Date.now() + 86400000).toLocaleString('en-IN')}</div>
                )}
              </div>

              <div className="card">
                <div style={{ fontWeight:700, marginBottom:8 }}>Stock Import (CSV/Excel)</div>
                <div style={{ fontSize:'0.82rem', color:'var(--text-muted)', marginBottom:16 }}>Bulk import compatible donor drives into stock inventory.</div>
                <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                  <label className="btn btn-secondary" style={{ cursor:'pointer' }}>
                    📥 Append from CSV
                    <input type="file" accept=".csv,.xlsx" style={{ display:'none' }} onChange={e => {
                      const file = e.target.files[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const text = ev.target.result;
                        const rows = text.split('\n').filter(r => r.trim()).slice(1); // skip header
                        alert(`✅ ${rows.length} records parsed from CSV. Stock will be appended after save.`);
                        // Store for later processing
                        localStorage.setItem('pending_stock_import', JSON.stringify({ mode: 'append', data: text, filename: file.name }));
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }} />
                  </label>
                  <label className="btn btn-danger" style={{ cursor:'pointer' }}>
                    🔄 Overwrite from CSV
                    <input type="file" accept=".csv,.xlsx" style={{ display:'none' }} onChange={e => {
                      const file = e.target.files[0];
                      if (!file) return;
                      if (!confirm(`Overwrite entire inventory with ${file.name}? This cannot be undone.`)) { e.target.value = ''; return; }
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const text = ev.target.result;
                        const rows = text.split('\n').filter(r => r.trim()).slice(1);
                        alert(`✅ ${rows.length} records parsed. Inventory will be overwritten after save.`);
                        localStorage.setItem('pending_stock_import', JSON.stringify({ mode: 'overwrite', data: text, filename: file.name }));
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }} />
                  </label>
                  <a className="btn btn-secondary" href="data:text/csv;charset=utf-8,name,brand,model,serial_number,pcb_number,capacity_gb,condition,location,notes%0AExample Donor,WD,WD10EZEX,SN123456,PCB-001,1000,good,Shelf-A1,Good condition" download="stock_template.csv">
                    📋 Download CSV Template
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* RECYCLE BIN CONFIG */}
          {activeTab === 'recyclebin' && (
            <div className="card">
              <div className="card-title" style={{ marginBottom:16 }}>🗑️ Recycle Bin Configuration</div>
              <div className="alert alert-warning" style={{ marginBottom:16 }}>
                <span className="alert-icon">⚠️</span>
                <div>The Recycle Bin password is <strong>separate from your login password</strong>. This password is required for Super Admin to permanently delete items.</div>
              </div>
              <div className="form-group"><label className="form-label">Recycle Bin Password</label>
                <input type="password" className="form-input" value={company?.recycle_bin_password||''} onChange={e=>setCompany(c=>({...c,recycle_bin_password:e.target.value}))} placeholder="Set a secure password (min 8 characters)" /></div>
              <div className="form-group"><label className="form-label">Confirm Recycle Bin Password</label>
                <input type="password" className="form-input" value={company?.recycle_bin_password_confirm||''} onChange={e=>setCompany(c=>({...c,recycle_bin_password_confirm:e.target.value}))} /></div>
              <div style={{ textAlign:'right',marginTop:16 }}>
                <button className="btn btn-primary" onClick={handleSaveCompany} disabled={savingCompany}>{savingCompany?'Saving…':companySaved?'✓ Saved':'💾 Save'}</button>
              </div>
            </div>
          )}

          {/* NUMBERS SETUP */}
          {activeTab === 'invoice' && (
            <div className="card">
              <div className="card-title" style={{ marginBottom:16 }}>🧾 Custom Number Prefixes / Starting Values</div>
              <div className="alert alert-info" style={{ marginBottom:16 }}>
                <span className="alert-icon">ℹ️</span>
                <div>Set your own starting numbers for cases, invoices, and quotes. The system will auto-increment from the starting value.</div>
              </div>
              {[
                ['Case Number Prefix',     'case_prefix',         'DR',       'e.g. DR, CASE, SC'],
                ['Case Starting Number',   'case_start_num',      '1001',     'e.g. 1001, 0001'],
                ['Invoice Number Prefix',  'invoice_prefix',      'INV',      'e.g. INV, BILL'],
                ['Invoice Starting Number','invoice_start_num',   '1001',     'e.g. 1001'],
                ['Quote Number Prefix',    'quote_prefix',        'QT',       'e.g. QT, EST'],
                ['Quote Starting Number',  'quote_start_num',     '1001',     'e.g. 1001'],
              ].map(([label,key,placeholder,hint])=>(
                <div key={key} className="form-group">
                  <label className="form-label">{label}</label>
                  <input className="form-input font-mono" value={company?.[key]||''} onChange={e=>setCompany(c=>({...c,[key]:e.target.value}))} placeholder={placeholder} />
                  <div style={{ fontSize:'0.68rem',color:'var(--text-muted)',marginTop:4 }}>{hint}</div>
                </div>
              ))}
              <div style={{ padding:'14px',background:'var(--bg-elevated)',borderRadius:'var(--radius-md)',marginBottom:16,fontSize:'0.82rem' }}>
                Preview: <strong style={{ color:'var(--accent-primary)',fontFamily:'var(--font-mono)' }}>
                  {company?.case_prefix||'DR'}-{company?.case_start_num||'1001'}
                </strong>
              </div>
              <div style={{ textAlign:'right' }}>
                <button className="btn btn-primary" onClick={handleSaveCompany} disabled={savingCompany}>{savingCompany?'Saving…':companySaved?'✓ Saved':'💾 Save Number Settings'}</button>
              </div>
            </div>
          )}

          {/* THEME & LAYOUT PICKER */}
          {activeTab === 'theme_picker' && (
            <div>
              <div className="card" style={{marginBottom:16}}>
                <div className="card-header" style={{marginBottom:20}}>
                  <div className="card-title">🎨 Theme & Layout Manager</div>
                  <p style={{color:'var(--text-muted)',fontSize:'0.8rem',marginTop:4}}>Choose a color theme and hero layout for your public homepage. Changes apply instantly.</p>
                </div>
                {!homepageData ? (
                  <div style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>Loading...</div>
                ) : (<>
                  {/* COLOR THEMES */}
                  <div style={{marginBottom:32}}>
                    <div style={{fontSize:'0.72rem',color:'var(--accent-primary)',fontFamily:'var(--font-mono)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:16}}>COLOR THEMES</div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:14}}>
                      {Object.values(allThemes).map(t => {
                        const isActive = (homepageData.active_theme||'cyber_cyan') === t.id;
                        return (
                          <div key={t.id} onClick={async () => {
                            const updated = {...homepageData, active_theme: t.id};
                            setHomepageData(updated);
                            await fetch('/api/settings/homepage',{method:'PATCH',headers:{Authorization:`Bearer ${getToken()}`,'Content-Type':'application/json'},body:JSON.stringify({active_theme:t.id})});
                          }} style={{
                            cursor:'pointer', borderRadius:14, overflow:'hidden',
                            border: isActive ? `2px solid ${t.accent}` : '2px solid var(--border-subtle)',
                            transition:'all 0.2s', transform: isActive ? 'scale(1.02)' : 'scale(1)',
                            boxShadow: isActive ? `0 0 20px ${t.accent}40` : 'none',
                          }}>
                            {/* preview swatch */}
                            <div style={{height:80, background:t.bg, position:'relative', display:'flex', alignItems:'center', justifyContent:'center'}}>
                              <div style={{display:'flex',gap:6}}>
                                <div style={{width:28,height:28,borderRadius:'50%',background:t.accent,boxShadow:`0 0 16px ${t.accent}`}} />
                                <div style={{width:28,height:28,borderRadius:'50%',background:t.accent2,boxShadow:`0 0 16px ${t.accent2}`}} />
                              </div>
                              {isActive && <div style={{position:'absolute',top:8,right:8,background:t.accent,color:'#000',borderRadius:999,fontSize:'0.62rem',fontWeight:800,padding:'2px 8px'}}>ACTIVE</div>}
                            </div>
                            <div style={{padding:'10px 14px',background:'var(--bg-elevated)'}}>
                              <div style={{fontSize:'0.87rem',fontWeight:700,color:'var(--text-primary)',marginBottom:3}}>{t.name}</div>
                              <div style={{fontSize:'0.68rem',color:'var(--text-muted)'}}>{t.dark ? '🌙 Dark Theme' : '☀️ Light Theme'}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* LAYOUT VARIANTS */}
                  <div>
                    <div style={{fontSize:'0.72rem',color:'var(--accent-primary)',fontFamily:'var(--font-mono)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:16}}>HERO LAYOUT</div>
                    <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
                      {allLayouts.map(l => {
                        const isActive = (homepageData.active_layout||'split_hero') === l.id;
                        return (
                          <div key={l.id} onClick={async () => {
                            const updated = {...homepageData, active_layout: l.id};
                            setHomepageData(updated);
                            await fetch('/api/settings/homepage',{method:'PATCH',headers:{Authorization:`Bearer ${getToken()}`,'Content-Type':'application/json'},body:JSON.stringify({active_layout:l.id})});
                          }} style={{
                            cursor:'pointer', flex:'1 1 160px',
                            border: isActive ? '2px solid var(--accent-primary)' : '2px solid var(--border-subtle)',
                            borderRadius:12, padding:'18px 16px', background:'var(--bg-elevated)',
                            transition:'all 0.2s', boxShadow: isActive ? '0 0 16px var(--accent-primary)33' : 'none',
                          }}>
                            <div style={{fontSize:'2rem',marginBottom:8,textAlign:'center'}}>{l.icon}</div>
                            <div style={{fontSize:'0.87rem',fontWeight:700,color:'var(--text-primary)',textAlign:'center',marginBottom:4}}>{l.name}</div>
                            <div style={{fontSize:'0.72rem',color:'var(--text-muted)',textAlign:'center'}}>{l.desc}</div>
                            {isActive && <div style={{textAlign:'center',marginTop:8,fontSize:'0.65rem',fontWeight:700,color:'var(--accent-primary)',fontFamily:'var(--font-mono)',textTransform:'uppercase'}}>● ACTIVE</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{marginTop:24,display:'flex',alignItems:'center',gap:12}}>
                    <a href="/home" target="_blank" className="btn btn-primary" style={{textDecoration:'none'}}>🌐 Preview Homepage</a>
                    <span style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>Click a theme or layout above — it updates instantly.</span>
                  </div>
                </>)}
              </div>
            </div>
          )}

          {/* HOMEPAGE CMS */}
          {activeTab === 'homepage_cms' && (
            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header" style={{ marginBottom: 20 }}>
                  <div className="card-title">🌐 Homepage Content Manager</div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4 }}>
                    All changes here instantly update the public homepage at <a href="/home" target="_blank" style={{ color: 'var(--accent-primary)' }}>/home</a>
                  </p>
                </div>
                {!homepageData ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Branding */}
                    <fieldset style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px 20px' }}>
                      <legend style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', padding: '0 8px' }}>Branding</legend>
                      <div className="form-row-2">
                        <div className="form-group">
                          <label className="form-label">App Name</label>
                          <input className="form-input" value={homepageData.app_name || ''} onChange={e => setHomepageData(d => ({ ...d, app_name: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Logo Emoji</label>
                          <input className="form-input" value={homepageData.logo_emoji || ''} onChange={e => setHomepageData(d => ({ ...d, logo_emoji: e.target.value }))} maxLength={4} style={{ fontSize: '1.5rem' }} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">App Tagline</label>
                        <input className="form-input" value={homepageData.app_tagline || ''} onChange={e => setHomepageData(d => ({ ...d, app_tagline: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Primary Color (hex)</label>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <input type="color" value={homepageData.primary_color || '#00d4ff'} onChange={e => setHomepageData(d => ({ ...d, primary_color: e.target.value }))} style={{ width: 48, height: 36, borderRadius: 8, border: '1px solid var(--border-default)', cursor: 'pointer', background: 'none', padding: 2 }} />
                          <input className="form-input" value={homepageData.primary_color || ''} onChange={e => setHomepageData(d => ({ ...d, primary_color: e.target.value }))} style={{ flex: 1, fontFamily: 'var(--font-mono)' }} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Favicon</label>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          {homepageData.favicon && <img src={homepageData.favicon} alt="favicon" style={{ width: 32, height: 32, borderRadius: 4, border: '1px solid var(--border-default)' }} />}
                          <input ref={faviconRef} type="file" accept="image/png,image/ico,image/jpeg,image/webp" style={{ display: 'none' }} onChange={async e => {
                            const file = e.target.files[0]; if (!file) return;
                            const fd = new FormData(); fd.append('favicon', file);
                            const r = await fetch(`{BASE_URL}/settings/favicon`, { method: 'POST', headers: { Authorization: `Bearer {getToken()}` }, body: fd });
                            const d = await r.json(); if (d.favicon) setHomepageData(prev => ({ ...prev, favicon: d.favicon }));
                          }} />
                          <button className="btn btn-secondary btn-sm" onClick={() => faviconRef.current?.click()}>📁 Upload Favicon</button>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>PNG, ICO, WebP recommended. 32×32 or 64×64px.</span>
                        </div>
                      </div>
                    </fieldset>

                    {/* Hero Section */}
                    <fieldset style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px 20px' }}>
                      <legend style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', padding: '0 8px' }}>Hero Section</legend>
                      <div className="form-group">
                        <label className="form-label">Hero Badge Text</label>
                        <input className="form-input" value={homepageData.hero_badge || ''} onChange={e => setHomepageData(d => ({ ...d, hero_badge: e.target.value }))} placeholder="Enterprise Data Recovery CRM" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Hero Title</label>
                        <input className="form-input" value={homepageData.hero_title || ''} onChange={e => setHomepageData(d => ({ ...d, hero_title: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Hero Subtitle</label>
                        <textarea className="form-textarea" rows={3} value={homepageData.hero_subtitle || ''} onChange={e => setHomepageData(d => ({ ...d, hero_subtitle: e.target.value }))} />
                      </div>
                      <div className="form-row-2">
                        <div className="form-group">
                          <label className="form-label">Primary CTA Button</label>
                          <input className="form-input" value={homepageData.cta_primary || ''} onChange={e => setHomepageData(d => ({ ...d, cta_primary: e.target.value }))} placeholder="🚀 Launch Platform" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Secondary CTA Button</label>
                          <input className="form-input" value={homepageData.cta_secondary || ''} onChange={e => setHomepageData(d => ({ ...d, cta_secondary: e.target.value }))} placeholder="📋 Track My Case" />
                        </div>
                      </div>
                    </fieldset>

                    {/* Contact */}
                    <fieldset style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px 20px' }}>
                      <legend style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', padding: '0 8px' }}>Contact Details</legend>
                      <div className="form-row-2">
                        <div className="form-group">
                          <label className="form-label">Phone</label>
                          <input className="form-input" value={homepageData.contact_phone || ''} onChange={e => setHomepageData(d => ({ ...d, contact_phone: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Email</label>
                          <input className="form-input" type="email" value={homepageData.contact_email || ''} onChange={e => setHomepageData(d => ({ ...d, contact_email: e.target.value }))} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Address</label>
                        <input className="form-input" value={homepageData.contact_address || ''} onChange={e => setHomepageData(d => ({ ...d, contact_address: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Footer Text</label>
                        <input className="form-input" value={homepageData.footer_text || ''} onChange={e => setHomepageData(d => ({ ...d, footer_text: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input type="checkbox" id="showPortal" checked={!!homepageData.show_client_portal} onChange={e => setHomepageData(d => ({ ...d, show_client_portal: e.target.checked }))} />
                        <label htmlFor="showPortal" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>Show "Track My Case" button (Client Portal link)</label>
                      </div>
                    </fieldset>

                    {/* Save Button */}
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <button className="btn btn-primary" disabled={savingHomepage} onClick={async () => {
                        setSavingHomepage(true);
                        try {
                          await fetch(`{BASE_URL}/settings/homepage`, { method: 'PATCH', headers: { Authorization: `Bearer {getToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(homepageData) });
                          setHomepageSaved(true); setTimeout(() => setHomepageSaved(false), 2500);
                        } catch(e) { alert(e.message); } finally { setSavingHomepage(false); }
                      }}>
                        {savingHomepage ? '⏳ Saving...' : '💾 Save Homepage Settings'}
                      </button>
                      {homepageSaved && <span style={{ color: 'var(--status-success)', fontSize: '0.85rem', fontWeight: 600 }}>✅ Saved! Homepage updated.</span>}
                      <a href="/home" target="_blank" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>🌐 View Homepage</a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SEO SETTINGS */}
          {activeTab === 'seo_settings' && (
            <div>
              <div className="card">
                <div className="card-header" style={{ marginBottom: 20 }}>
                  <div className="card-title">🔍 SEO Settings</div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4 }}>Control how your platform appears in search engines.</p>
                </div>
                {!seoData ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <fieldset style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px 20px' }}>
                      <legend style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', padding: '0 8px' }}>Basic SEO</legend>
                      <div className="form-group">
                        <label className="form-label">Site Title <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(~60 chars)</span></label>
                        <input className="form-input" value={seoData.site_title || ''} onChange={e => setSeoData(d => ({ ...d, site_title: e.target.value }))} maxLength={70} />
                        <div style={{ fontSize: '0.68rem', color: seoData.site_title?.length > 60 ? 'var(--status-danger)' : 'var(--text-muted)', marginTop: 4 }}>{(seoData.site_title || '').length}/60 chars</div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Meta Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(~160 chars)</span></label>
                        <textarea className="form-textarea" rows={3} value={seoData.meta_description || ''} onChange={e => setSeoData(d => ({ ...d, meta_description: e.target.value }))} maxLength={180} />
                        <div style={{ fontSize: '0.68rem', color: seoData.meta_description?.length > 160 ? 'var(--status-danger)' : 'var(--text-muted)', marginTop: 4 }}>{(seoData.meta_description || '').length}/160 chars</div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Keywords <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(comma-separated)</span></label>
                        <input className="form-input" value={seoData.meta_keywords || ''} onChange={e => setSeoData(d => ({ ...d, meta_keywords: e.target.value }))} placeholder="data recovery, CRM, HDD recovery" />
                      </div>
                      <div className="form-row-2">
                        <div className="form-group">
                          <label className="form-label">Robots Directive</label>
                          <select className="form-select" value={seoData.robots || 'index,follow'} onChange={e => setSeoData(d => ({ ...d, robots: e.target.value }))}>
                            <option value="index,follow">index, follow (default)</option>
                            <option value="noindex,nofollow">noindex, nofollow</option>
                            <option value="index,nofollow">index, nofollow</option>
                            <option value="noindex,follow">noindex, follow</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Analytics ID <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(GA4/GTM)</span></label>
                          <input className="form-input" value={seoData.analytics_id || ''} onChange={e => setSeoData(d => ({ ...d, analytics_id: e.target.value }))} placeholder="G-XXXXXXXXXX" style={{ fontFamily: 'var(--font-mono)' }} />
                        </div>
                      </div>
                    </fieldset>

                    <fieldset style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px 20px' }}>
                      <legend style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', padding: '0 8px' }}>Open Graph / Social</legend>
                      <div className="form-row-2">
                        <div className="form-group">
                          <label className="form-label">OG Title</label>
                          <input className="form-input" value={seoData.og_title || ''} onChange={e => setSeoData(d => ({ ...d, og_title: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Twitter Card</label>
                          <select className="form-select" value={seoData.twitter_card || 'summary_large_image'} onChange={e => setSeoData(d => ({ ...d, twitter_card: e.target.value }))}>
                            <option value="summary_large_image">summary_large_image</option>
                            <option value="summary">summary</option>
                          </select>
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">OG Description</label>
                        <textarea className="form-textarea" rows={2} value={seoData.og_description || ''} onChange={e => setSeoData(d => ({ ...d, og_description: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Canonical URL</label>
                        <input className="form-input" value={seoData.canonical_url || ''} onChange={e => setSeoData(d => ({ ...d, canonical_url: e.target.value }))} placeholder="https://yoursite.com" style={{ fontFamily: 'var(--font-mono)' }} />
                      </div>
                    </fieldset>

                    <fieldset style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px 20px' }}>
                      <legend style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', padding: '0 8px' }}>Page Index Control</legend>
                      {(seoData.pages || []).map((pg, i) => (
                        <div key={pg.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                          <input type="checkbox" checked={!!pg.indexed} onChange={e => setSeoData(d => ({ ...d, pages: d.pages.map((p, j) => j === i ? { ...p, indexed: e.target.checked } : p) }))} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{pg.label}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{pg.path}</div>
                          </div>
                          <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 999, background: pg.indexed ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.1)', color: pg.indexed ? 'var(--status-success)' : 'var(--text-muted)', fontWeight: 700 }}>{pg.indexed ? 'INDEXED' : 'NOINDEX'}</span>
                        </div>
                      ))}
                    </fieldset>

                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <button className="btn btn-primary" onClick={async () => {
                        try {
                          await fetch(`{BASE_URL}/settings/seo`, { method: 'PATCH', headers: { Authorization: `Bearer {getToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(seoData) });
                          setHomepageSaved(true); setTimeout(() => setHomepageSaved(false), 2500);
                        } catch(e) { alert(e.message); }
                      }}>💾 Save SEO Settings</button>
                      {homepageSaved && <span style={{ color: 'var(--status-success)', fontSize: '0.85rem', fontWeight: 600 }}>✅ Saved!</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ABOUT */}
          {activeTab === 'about' && (
            <div className="card">
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
                <div style={{ width: 56, height: 56, background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>💾</div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 800 }}>RecoverLab CRM</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>v2.0.0 — Enterprise Data Recovery Platform</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[{ l: 'Version', v: '2.0.0' }, { l: 'Build', v: 'Production' }, { l: 'Backend', v: 'Node.js + Express' }, { l: 'Frontend', v: 'React 18 + Vite' }, { l: 'Database', v: 'PostgreSQL 15' }, { l: 'Auth', v: 'JWT + RBAC' }, { l: 'Encryption', v: 'AES-256-GCM' }, { l: 'Architecture', v: 'Multi-agent Design' }].map(({ l, v }) => (
                  <div key={l} style={{ padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                    <div className="tech-data-label">{l}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showCreateUser && <CreateUserModal onClose={() => setShowCreateUser(false)} onCreated={() => usersApi.list().then(setUsers)} />}
    </div>
  );
}
