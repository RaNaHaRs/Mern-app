import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { inventoryApi } from '../services/api';
import { useAuth } from '../store/AuthContext';
import { isHddCategoryKey } from '../constants/inventoryConfig';
import { useInventoryConfig } from '../hooks/useInventoryConfig';
import InventoryHddFields from '../components/InventoryHddFields';
import MediaFileGrid from '../components/MediaFileGrid';

const BASE_URL = '/api';
const getToken = () => localStorage.getItem('accessToken');

const INV_CATEGORIES = [
  { key: 'wd_35',      label: 'WD 3.5"',       icon: '💿', color: '#3b82f6' },
  { key: 'wd_25',      label: 'WD 2.5"',       icon: '💽', color: '#22d3ee' },
  { key: 'seagate_35', label: 'Seagate 3.5"',  icon: '💿', color: '#f59e0b' },
  { key: 'seagate_25', label: 'Seagate 2.5"',  icon: '💽', color: '#fbbf24' },
  { key: 'others_35',  label: 'Others 3.5"',   icon: '💿', color: '#8b5cf6' },
  { key: 'others_25',  label: 'Others 2.5"',   icon: '💽', color: '#a78bfa' },
  { key: 'pcb',        label: 'PCB',            icon: '🔌', color: '#10b981' },
  { key: 'ssd',        label: 'SSD',            icon: '⚡', color: '#06b6d4' },
  { key: 'phone',      label: 'Phone',          icon: '📱', color: '#ec4899' },
];

const HDD_COMPANIES = [
  'Western Digital','Seagate','Toshiba','Samsung','Hitachi (HGST)',
  'Fujitsu','IBM / HGST','Maxtor','Quantum','LaCie','Buffalo',
  'Transcend','SanDisk','Kingston','Crucial','Lexar','Corsair',
  'ADATA','SK Hynix','Micron','Intel','Other'
];

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function StatusBadge({ status }) {
  const map = {
    available: { color:'#10b981', bg:'rgba(16,185,129,0.12)' },
    reserved:  { color:'#f59e0b', bg:'rgba(245,158,11,0.12)' },
    used:      { color:'#94a3b8', bg:'rgba(100,116,139,0.12)' },
    damaged:   { color:'#ef4444', bg:'rgba(239,68,68,0.12)' },
    donated:   { color:'#8b5cf6', bg:'rgba(139,92,246,0.12)' },
  };
  const s = map[status] || map.available;
  return <span style={{ fontSize:'0.68rem',fontWeight:700,padding:'3px 8px',borderRadius:999,color:s.color,background:s.bg,fontFamily:'var(--font-mono)',textTransform:'uppercase' }}>{status?.replace(/_/g,' ')}</span>;
}

const HEALTH_OPTIONS = ['Good', 'Fair', 'Damaged', 'Repair Needed', 'Untested', 'For Parts', 'Other'];

function formatNoteDateTime(iso) {
  if (!iso) return { date: '—', time: '' };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
  };
}

function InventoryNotesPanel({ notes, canAdd, newNote, onNewNoteChange, onAddNote, adding, title = 'Notes' }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 10, fontSize: '0.82rem' }}>📝 {title}</div>
      {canAdd && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <textarea
            className="form-textarea"
            style={{ minHeight: 56, flex: 1 }}
            placeholder="Add a note…"
            value={newNote}
            onChange={(e) => onNewNoteChange(e.target.value)}
          />
          <button type="button" className="btn btn-primary btn-sm" disabled={!newNote.trim() || adding} onClick={onAddNote}>
            {adding ? '…' : 'Add'}
          </button>
        </div>
      )}
      {notes.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No notes yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notes.map((n) => {
            const { date, time } = formatNoteDateTime(n.created_at);
            return (
              <div
                key={n.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-elevated)',
                }}
              >
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span>🕒 {date} · {time}</span>
                  {n.created_by_name && <span>· {n.created_by_name}</span>}
                </div>
                <div style={{ fontSize: '0.84rem', lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                  {n.text}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Comparison View (shown inline when caseId is in query params) ─────────────
function DonorPatientComparison({ donor, patientCaseId }) {
  const [patient, setPatient] = useState(null);
  const [patientImages, setPatientImages] = useState([]);
  const [donorImages, setDonorImages] = useState([]);

  useEffect(() => {
    if (!patientCaseId) return;
    fetch(`${BASE_URL}/cases/${patientCaseId}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(d => setPatient(d)).catch(() => {});
    fetch(`${BASE_URL}/inventory/${donor.id}/images`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(d => setDonorImages(d.images || [])).catch(() => {});
  }, [patientCaseId, donor.id]);

  if (!patient) return <div style={{ display:'flex',justifyContent:'center',padding:40 }}><div className="spinner" style={{ width:28,height:28 }} /></div>;

  const COMPARE_FIELDS = [
    { label: 'Brand / Company', pKey: 'device_brand', dKey: 'company', fallback: d => d.brand },
    { label: 'Model', pKey: 'device_model', dKey: 'model' },
    { label: 'Serial Number', pKey: 'serial_number', dKey: 'serial_number' },
    { label: 'PCB Number', pKey: 'pcb_number', dKey: 'pcb_number' },
    { label: 'Capacity', pKey: 'capacity_gb', dKey: 'capacity', fmt: v => v ? v+'GB' : '—', dfmt: v => v || '—' },
    { label: 'Firmware / SW Rev', pKey: 'firmware', dKey: 'firmware' },
    { label: 'Site Code / DCM', pKey: 'site_code', dKey: 'site_code' },
    { label: 'Date Code', pKey: 'date_code', dKey: 'date_code' },
    { label: 'Head Map', pKey: 'head_map', dKey: 'head_map' },
    { label: 'ROM Family', pKey: 'family', dKey: 'family' },
    { label: 'Interface', pKey: 'interface', dKey: 'interface' },
    { label: 'Form Factor', pKey: 'form_factor', dKey: 'form_factor' },
  ];

  const matchScore = COMPARE_FIELDS.filter(f => {
    const pv = (patient[f.pKey] || '').toString().toLowerCase().trim();
    const dv = (donor[f.dKey] || donor[f.fallback?.(donor)] || '').toString().toLowerCase().trim();
    return pv && dv && pv === dv;
  }).length;

  const pct = Math.round((matchScore / COMPARE_FIELDS.filter(f => patient[f.pKey] && donor[f.dKey]).length) * 100) || 0;

  return (
    <div>
      <div className="card" style={{ marginBottom:16,padding:20,background:'linear-gradient(135deg,rgba(0,212,255,0.06),rgba(124,58,237,0.06))' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12 }}>
          <div>
            <div style={{ fontSize:'1.1rem',fontWeight:800,marginBottom:4 }}>🔬 Donor ↔ Patient Comparison</div>
            <div style={{ fontSize:'0.82rem',color:'var(--text-muted)' }}>
              Patient: <strong style={{ color:'var(--accent-primary)' }}>{patient.case_number}</strong> —
              {patient.first_name} {patient.last_name} · {patient.device_brand} {patient.device_model}
            </div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:'2rem',fontWeight:900,color:pct>=70?'#10b981':pct>=40?'#f59e0b':'#ef4444' }}>{pct}%</div>
            <div style={{ fontSize:'0.72rem',color:'var(--text-muted)' }}>Compatibility Score</div>
          </div>
        </div>
      </div>

      {/* Side-by-side table */}
      <div className="card" style={{ overflow:'hidden',marginBottom:20 }}>
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',background:'var(--bg-elevated)',padding:'10px 16px',borderBottom:'1px solid var(--border-subtle)',fontWeight:700,fontSize:'0.8rem' }}>
          <div style={{ textAlign:'center',color:'var(--status-warning)' }}>🔬 Patient Drive ({patient.case_number})</div>
          <div style={{ textAlign:'center',color:'var(--text-muted)' }}>Field</div>
          <div style={{ textAlign:'center',color:'var(--accent-primary)' }}>💿 Donor Drive ({donor.stock_number || donor.sku})</div>
        </div>
        {COMPARE_FIELDS.map(f => {
          const pv = f.fmt ? f.fmt(patient[f.pKey]) : (patient[f.pKey] || '—');
          const dv = f.dfmt ? f.dfmt(donor[f.dKey]) : (donor[f.dKey] || (f.fallback ? f.fallback(donor) : '—') || '—');
          const match = pv !== '—' && dv !== '—' && pv.toString().toLowerCase() === dv.toString().toLowerCase();
          const bg = match ? 'rgba(16,185,129,0.06)' : (pv==='—'||dv==='—') ? 'transparent' : 'rgba(239,68,68,0.04)';
          return (
            <div key={f.label} style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',padding:'8px 16px',borderBottom:'1px solid var(--border-subtle)',background:bg,alignItems:'center' }}>
              <div className="font-mono" style={{ fontSize:'0.8rem',textAlign:'center',fontWeight:match?700:400,color:match?'var(--status-success)':'var(--text-primary)' }}>{pv}</div>
              <div style={{ fontSize:'0.7rem',color:'var(--text-muted)',textAlign:'center',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em' }}>
                {match ? <span style={{ color:'#10b981' }}>✓ {f.label}</span> : f.label}
              </div>
              <div className="font-mono" style={{ fontSize:'0.8rem',textAlign:'center',fontWeight:match?700:400,color:match?'var(--status-success)':'var(--text-primary)' }}>{dv}</div>
            </div>
          );
        })}
      </div>

      {/* Side-by-side images */}
      {(patientImages.length > 0 || donorImages.length > 0) && (
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:16 }}>
          <div className="card" style={{ padding:16 }}>
            <div style={{ fontWeight:700,marginBottom:10,fontSize:'0.85rem' }}>🔬 Patient Drive Photos</div>
            {patientImages.length > 0 ? (
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(80px,1fr))',gap:6 }}>
                {patientImages.map(img => <img key={img.id} src={img.data} alt={img.name} style={{ width:'100%',aspectRatio:'1',objectFit:'cover',borderRadius:6,cursor:'pointer' }} />)}
              </div>
            ) : <div style={{ textAlign:'center',color:'var(--text-muted)',fontSize:'0.8rem',padding:20 }}>No photos</div>}
          </div>
          <div className="card" style={{ padding:16 }}>
            <div style={{ fontWeight:700,marginBottom:10,fontSize:'0.85rem' }}>💿 Donor Drive Photos</div>
            {donorImages.length > 0 ? (
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(80px,1fr))',gap:6 }}>
                {donorImages.map(img => <img key={img.id} src={img.data} alt={img.name} style={{ width:'100%',aspectRatio:'1',objectFit:'cover',borderRadius:6,cursor:'pointer' }} />)}
              </div>
            ) : <div style={{ textAlign:'center',color:'var(--text-muted)',fontSize:'0.8rem',padding:20 }}>No photos</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main InventoryDetail ──────────────────────────────────────────────────────
export default function InventoryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { canAccess } = useAuth();
  const [item, setItem] = useState(null);
  const [images, setImages] = useState([]);
  const [files, setFiles] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [activeTab, setActiveTab] = useState('overview');
  const [savingEdit, setSavingEdit] = useState(false);
  const [noteEntries, setNoteEntries] = useState([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const imgRef = useRef();
  const fileRef = useRef();

  const compareWithCase = searchParams.get('compare');
  const { activeCategories, activeBrandNames } = useInventoryConfig();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/inventory/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      const item = data.item || data;
      setItem(item);
      setEditForm({ ...item });
      setNoteEntries(item.notes_timeline || []);

      const imgRes = await fetch(`${BASE_URL}/inventory/${id}/images`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const imgData = await imgRes.json();
      setImages(imgData.images || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (compareWithCase) setActiveTab('compare'); }, [compareWithCase]);

  const uploadMedia = async (fileList, isFile = false) => {
    setUploading(true);
    try {
      for (const f of Array.from(fileList)) {
        const reader = new FileReader();
        await new Promise(resolve => {
          reader.onload = async ev => {
            await fetch(`${BASE_URL}/inventory/${id}/images`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: f.name, data: ev.target.result, size: f.size, mimeType: f.type }),
            });
            resolve();
          };
          reader.readAsDataURL(f);
        });
      }
      load();
    } finally { setUploading(false); }
  };

  const handleDeleteMedia = async (imgId) => {
    if (!confirm('Delete this media?')) return;
    await fetch(`${BASE_URL}/inventory/${id}/images/${imgId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
    load();
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      const payload = {
        ...editForm,
        customFieldValues: editForm.custom_field_values || {},
      };
      if (!isOtherCat) delete payload.notes;
      await inventoryApi.update(id, payload);
      setEditing(false);
      load();
    } catch (e) { alert(e.message); } finally { setSavingEdit(false); }
  };

  const handleAddNote = async () => {
    const text = newNoteText.trim();
    if (!text) return;
    setAddingNote(true);
    try {
      const res = await inventoryApi.addNote(id, text);
      const note = res.note || res;
      setNoteEntries((prev) => [note, ...prev]);
      setNewNoteText('');
    } catch (e) {
      alert(e.message || 'Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  const handleDrop = e => { e.preventDefault(); uploadMedia(e.dataTransfer.files); };

  const handleTransferToClient = async () => {
    const newStatus = !item.is_transferred_to_client;
    const confirmMsg = newStatus 
      ? 'Are you sure you want to transfer this item to the client?' 
      : 'Are you sure you want to undo the transfer of this item to the client?';
    if (!confirm(confirmMsg)) return;
    try {
      const response = await inventoryApi.transferToClient(id, newStatus);
      setItem(prev => ({ ...prev, is_transferred_to_client: newStatus }));
      alert(`✅ Item status updated: Transferred to Client = ${newStatus ? 'Yes' : 'No'}`);
    } catch(e){ alert(e.message || 'Failed to update transfer status'); }
  };

  if (loading) return <div style={{ display:'flex',justifyContent:'center',paddingTop:80 }}><div className="spinner" style={{ width:32,height:32,borderWidth:3 }} /></div>;
  if (!item) return <div className="empty-state"><div className="empty-title">Stock item not found</div></div>;

  const uiCat = item.ui_category || item.category;
  const catList = activeCategories.length ? activeCategories : INV_CATEGORIES;
  const cat = catList.find(c => c.key === uiCat) || { key: uiCat, label: uiCat?.replace(/_/g, ' '), icon: '📦', color: '#64748b' };
  const isHDD = isHddCategoryKey(uiCat, activeCategories);
  const dyn = (() => {
    const d = item.dynamic_fields;
    if (!d) return {};
    if (typeof d === 'object') return d;
    try { return JSON.parse(d); } catch { return {}; }
  })();
  const val = (k) => item[k] || dyn[k] || null;
  const isPCB = uiCat === 'pcb';
  const isSSD = uiCat === 'ssd';
  const isOtherCat = uiCat === 'other' || uiCat === 'others' || uiCat === 'stock_item' || (!isHDD && !isPCB && !isSSD);

  const TABS = [
    { key: 'overview', label: '📋 Overview' },
    { key: 'photos', label: `📷 Media (${images.length})` },
    { key: 'history', label: '📜 History' },
    ...(compareWithCase ? [{ key: 'compare', label: '🔬 Comparison' }] : []),
  ];

  // Tech fields by device type
  const extraDynRows = isHDD
    ? Object.entries(dyn)
        .filter(([k, v]) => v && !['serial_number','pcb_number','capacity','interface','form_factor','firmware','site_code','date_code','head_map','family','model'].includes(k))
        .map(([k, v]) => [k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), v])
    : [];
  const customRows = (item.custom_fields_display || []).map(cf => [`✦ ${cf.label}`, cf.value]);

  const detailRows = isHDD ? [
    ['Stock ID', item.stock_number || item.sku],
    ['Company', item.company || item.brand],
    ['Model', val('model')],
    ['Serial Number', val('serial_number')],
    ['PCB Number', val('pcb_number')],
    ['Capacity', val('capacity')],
    ['Interface', val('interface')],
    ['Form Factor', val('form_factor')],
    ['Firmware / SW Rev', val('firmware') || item.firmware_version],
    ['Site Code / DCM', val('site_code')],
    ['Date Code', val('date_code')],
    ['Head Map', val('head_map')],
    ['ROM Family', val('family')],
    ['Category', cat.label],
    ...extraDynRows,
    ...customRows,
  ] : isPCB ? [
    ['Stock ID', item.stock_number || item.sku],
    ['PCB Number', item.pcb_number],
    ['Compatible Drives', item.compatible_drives],
    ['Firmware Chip', item.firmware],
    ['Voltage', item.voltage],
    ['Company', item.company || item.brand],
    ['Model / Part', item.model],
  ] : [
    ['Stock ID', item.stock_number || item.sku],
    ['Company / Brand', item.company || item.brand],
    ['Model', item.model],
    ['Serial Number', item.serial_number],
    ['Capacity', item.capacity],
    ['Interface', item.interface],
    ['Firmware', item.firmware],
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12 }}>
        <div>
          <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/inventory')}>← Back</button>
            <span style={{ fontSize:'1.4rem' }}>{cat.icon}</span>
            <span className="font-mono text-accent" style={{ fontSize:'1rem',fontWeight:700 }}>{item.stock_number || item.sku || 'N/A'}</span>
            <span style={{ fontSize:'0.72rem',padding:'3px 10px',borderRadius:999,background:`${cat.color}1a`,color:cat.color,fontWeight:700 }}>{cat.label}</span>
            <StatusBadge status={item.status || 'available'} />
          </div>
          <h2 style={{ marginBottom:4 }}>{isOtherCat ? (item.name || item.model || '—') : (`${item.company || item.brand || '—'} ${item.model || ''}`)}</h2>
          <div className="text-sm text-muted">
            {item.capacity && `${item.capacity} · `}
            {item.interface && `${item.interface} · `}
            {item.serial_number && <><span className="font-mono">S/N: {item.serial_number}</span> · </>}
            {item.pcb_number && <span className="font-mono">PCB: {item.pcb_number}</span>}
          </div>
        </div>
        <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
          {!editing && canAccess('junior_engineer') && (
            <button className="btn btn-secondary" onClick={() => { setEditForm({...item}); setEditing(true); setActiveTab('overview'); }}>✏️ Edit</button>
          )}
          {editing && (
            <>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={savingEdit} onClick={handleSaveEdit}>{savingEdit ? '…' : '💾 Save'}</button>
            </>
          )}
          <button className="btn btn-secondary" onClick={() => imgRef.current?.click()}>Add Media/Files</button>
          <button className={`btn btn-sm ${item.is_transferred_to_client ? 'btn-success' : 'btn-secondary'}`} onClick={handleTransferToClient}>
            {item.is_transferred_to_client ? '✓ Transferred to Client' : '🤝 Transfer to Client'}
          </button>
          <input ref={imgRef} type="file" multiple style={{ display:'none' }} onChange={e => uploadMedia(e.target.files)} />
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom:20 }}>
        {TABS.map(t => (
          <button key={t.key} className={`tab-btn ${activeTab===t.key?'active':''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div>
          {editing ? (
            <div className="card" style={{ padding:20 }}>
              <div className="card-title" style={{ marginBottom:16 }}>✏️ Edit Stock Item</div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
                {[
                  ['Stock ID', 'stock_number'],
                  ['Company', 'company','select', activeBrandNames.length ? activeBrandNames : HDD_COMPANIES],
                  ['Brand', 'brand'],
                  ['Model', 'model'],
                  ['Location', 'location'],
                  ['Unit Cost (₹)', 'unit_cost', 'number'],
                  ['Quantity', 'quantity', 'number'],
                  ['Status', 'status', 'select', ['available','reserved','used','damaged','donated']],
                  ['Condition', 'condition', 'select', ['new','used','refurb','for_parts','untested']],
                ].map(([label, field, type, options]) => (
                  <div key={field} className="form-group">
                    <label className="form-label">{label}</label>
                    {type === 'select' ? (
                      <select className="form-select" value={editForm[field]||''} onChange={e => setEditForm(f=>({...f,[field]:e.target.value}))}>
                        <option value="">Select…</option>
                        {options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={type||'text'} className="form-input" value={editForm[field]||''} onChange={e => setEditForm(f=>({...f,[field]:e.target.value}))} />
                    )}
                  </div>
                ))}
                {!isOtherCat && (
                  <div style={{ gridColumn: '1/-1' }}>
                    <InventoryHddFields
                      category={uiCat}
                      form={editForm}
                      setForm={setEditForm}
                      customFieldValues={editForm.custom_field_values || {}}
                      setCustomFieldValues={(fn) => setEditForm(f => ({
                        ...f,
                        custom_field_values: typeof fn === 'function' ? fn(f.custom_field_values || {}) : fn,
                      }))}
                    />
                  </div>
                )}
                {isOtherCat && (
                  <div style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 12 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Device Name</label>
                      <input className="form-input" value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Problem</label>
                      <textarea className="form-textarea" style={{ minHeight: 60 }} value={editForm.notes || ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Note</label>
                      <textarea className="form-textarea" style={{ minHeight: 60 }} value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                  </div>
                )}
                {!isOtherCat && (
                  <div style={{ gridColumn: '1/-1' }}>
                    <InventoryNotesPanel
                      title="Notes"
                      notes={noteEntries}
                      canAdd={canAccess('junior_engineer')}
                      newNote={newNoteText}
                      onNewNoteChange={setNewNoteText}
                      onAddNote={handleAddNote}
                      adding={addingNote}
                    />
                  </div>
                )}
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Health</label>
                  <select
                    className="form-select"
                    value={editForm.health || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, health: e.target.value }))}
                  >
                    <option value="">Select condition…</option>
                    {HEALTH_OPTIONS.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid-2">
              {/* Stock Details */}
              <div className="card">
                <div className="card-title" style={{ marginBottom:14 }}>🖥️ {cat.label} — Technical Details</div>
                <div className="tech-data-table">
                  {detailRows.map(([label, value]) => value ? (
                    <div key={label} className="tech-data-cell">
                      <div className="tech-data-label">{label}</div>
                      <div className="tech-data-value font-mono">{value}</div>
                    </div>
                  ) : null)}
                </div>
              </div>

              {/* Status & Stock Info */}
              <div>
                <div className="card" style={{ marginBottom:16 }}>
                  <div className="card-title" style={{ marginBottom:14 }}>📦 Stock Status</div>
                  <div className="tech-data-table">
                    {[
                      ['Status', <StatusBadge status={item.status || 'available'} />],
                      ['Condition', item.condition?.replace(/_/g,' ').toUpperCase()],
                      ['Quantity', <span className="font-mono" style={{ fontWeight:800,color:'var(--accent-primary)' }}>{item.quantity || 1}</span>],
                      ['Min Alert', item.min_quantity || 1],
                      ['Unit Cost', item.unit_cost ? `₹${parseFloat(item.unit_cost).toLocaleString('en-IN')}` : '—'],
                      ['Location', item.location || '—'],
                      ['Added', item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN') : '—'],
                      ['Added By', item.added_by || '—'],
                    ].map(([label, value]) => (
                      <div key={label} className="tech-data-cell">
                        <div className="tech-data-label">{label}</div>
                        <div className="tech-data-value">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {item.case_number && (
                  <div className="alert alert-info">
                    <span className="alert-icon">🔗</span>
                    <div>Linked to case <strong>{item.case_number}</strong>
                      <button className="btn btn-ghost btn-sm" style={{ marginLeft:8 }} onClick={() => navigate(`/cases/${item.case_number}`)}>View Case →</button>
                    </div>
                  </div>
                )}
                {isOtherCat && item.notes && (
                  <div className="card" style={{ padding: 14, marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '0.82rem' }}>📝 Problem</div>
                    <p style={{ fontSize: '0.82rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>{item.notes}</p>
                  </div>
                )}
                {!isOtherCat && (
                  <div style={{ marginBottom: 12 }}>
                    <InventoryNotesPanel
                      title="Notes"
                      notes={noteEntries}
                      canAdd={canAccess('junior_engineer')}
                      newNote={newNoteText}
                      onNewNoteChange={setNewNoteText}
                      onAddNote={handleAddNote}
                      adding={addingNote}
                    />
                  </div>
                )}
                <div className="card" style={{ padding: 14, marginBottom: item.description ? 12 : 0 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '0.82rem' }}>❤️ Health</div>
                  <p style={{ fontSize: '0.84rem', color: item.health ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {item.health || 'Not specified'}
                  </p>
                </div>
                {item.description && (
                  <div className="card" style={{ padding:14 }}>
                    <div style={{ fontWeight:700,marginBottom:6,fontSize:'0.82rem' }}>📝 Note</div>
                    <p style={{ fontSize:'0.82rem',lineHeight:1.7,color:'var(--text-secondary)' }}>{item.description}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Photos / Media Tab */}
      {activeTab === 'photos' && (
        <div>
          <div
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            onClick={() => imgRef.current?.click()}
            style={{ border:'2px dashed var(--border-default)',borderRadius:'var(--radius-xl)',padding:36,textAlign:'center',marginBottom:20,background:'var(--bg-elevated)',cursor:'pointer',transition:'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor='var(--accent-primary)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='var(--border-default)'}
          >
            {uploading ? (
              <><div className="spinner" style={{ width:24,height:24,margin:'0 auto 8px' }} /><div style={{ color:'var(--text-muted)',fontSize:'0.82rem' }}>Uploading…</div></>
            ) : (
              <><div style={{ fontSize:'2.5rem',marginBottom:8 }}>📤</div><div style={{ fontWeight:600,marginBottom:4 }}>Drag & drop media or click to browse</div><div style={{ fontSize:'0.75rem',color:'var(--text-muted)' }}>Supports images, videos (MP4, MOV, WebM), and files (PDF, DOC, ZIP, etc.)</div></>
            )}
          </div>
          {images.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📷</div><div className="empty-title">No photos yet</div><div className="empty-desc">Upload photos of label, PCB, condition, and damage</div></div>
          ) : (
            <MediaFileGrid
              items={images}
              onDelete={handleDeleteMedia}
              canDelete={canAccess('junior_engineer')}
              variant="gallery"
            />
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="card">
          <div className="card-title" style={{ marginBottom:14 }}>📜 Stock Movement History</div>
          {history.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📜</div><div className="empty-title">No history records yet</div></div>
          ) : (
            <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
              {history.map((h, i) => (
                <div key={i} style={{ display:'flex',gap:12,alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize:'1.2rem' }}>{h.type==='in'?'📥':h.type==='out'?'📤':h.type==='disposed'?'🗑️':'🔒'}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600,fontSize:'0.82rem' }}>{h.type?.toUpperCase()} — {h.quantity} unit(s)</div>
                    <div style={{ fontSize:'0.72rem',color:'var(--text-muted)' }}>{h.notes}</div>
                  </div>
                  <div className="text-xs text-muted font-mono">{h.created_at ? new Date(h.created_at).toLocaleString('en-IN') : '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Comparison Tab */}
      {activeTab === 'compare' && compareWithCase && (
        <DonorPatientComparison donor={item} patientCaseId={compareWithCase} />
      )}

    </div>
  );
}