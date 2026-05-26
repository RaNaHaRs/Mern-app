import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { clientsApi } from '../services/api';
import { useAuth } from '../store/AuthContext';

const BASE_URL = '/api';
const getToken = () => localStorage.getItem('accessToken');

// ── Courier Slip Generator ──────────────────────────────────────
function CourierSlip({ client, company, onClose }) {
  const printSlip = () => {
    const html = `<!DOCTYPE html><html><head><title>Courier Slip</title>
    <style>
      @page { size: 100mm 150mm; margin: 0; }
      body { margin: 0; font-family: Arial, sans-serif; }
      .slip { width:100mm; min-height:150mm; padding:8mm; box-sizing:border-box; border:1px solid #ccc; }
      .header { text-align:center; border-bottom:2px solid #000; padding-bottom:4mm; margin-bottom:4mm; }
      .company-name { font-size:14pt; font-weight:900; color:#0284c7; }
      .section-label { font-size:7pt; font-weight:700; text-transform:uppercase; color:#64748b; letter-spacing:0.5px; margin-bottom:2mm; }
      .address-block { font-size:10pt; line-height:1.5; }
      .divider { border:none; border-top:1.5px dashed #999; margin:4mm 0; }
      .barcode-placeholder { text-align:center; margin:3mm 0; font-size:7pt; color:#94a3b8; border:1px dashed #ddd; padding:4mm; border-radius:4px; }
    </style></head>
    <body><div class="slip">
      <div class="header">
        <div class="company-name">${company?.name || 'RecoverLab'}</div>
        <div style="font-size:8pt;color:#64748b">${company?.tagline || 'Data Recovery Services'}</div>
      </div>
      <div class="section-label">FROM</div>
      <div class="address-block">
        <strong>${company?.name || 'RecoverLab'}</strong><br/>
        ${company?.address || '—'}<br/>
        ${company?.city ? company.city + (company?.pincode ? ' - ' + company.pincode : '') : ''}<br/>
        📞 ${company?.phone || '—'} | GSTIN: ${company?.gstin || '—'}
      </div>
      <hr class="divider"/>
      <div class="section-label">TO</div>
      <div class="address-block">
        <strong>${client.first_name} ${client.last_name}</strong><br/>
        ${client.company ? client.company + '<br/>' : ''}
        ${client.address || '—'}<br/>
        ${client.city ? client.city + (client.pincode ? ' - ' + client.pincode : '') : ''}<br/>
        📞 ${client.phone}
      </div>
      <hr class="divider"/>
      <div class="barcode-placeholder">[ Weight / Dimensions here ]</div>
      <div style="font-size:7pt;color:#94a3b8;text-align:center;margin-top:2mm">Generated: ${new Date().toLocaleString('en-IN')} | RecoverLab CRM</div>
    </div></body></html>`;
    const w = window.open('','_blank','width=420,height=600');
    if (!w) {
      alert('Please allow popups to print');
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3 className="modal-title">📦 Print Courier Slip</h3><button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="alert alert-info" style={{ marginBottom:16 }}><span className="alert-icon">ℹ️</span><div>This will generate a <strong>100mm × 150mm</strong> courier label. Company address is pulled from Settings → Company Profile.</div></div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
            <div style={{ padding:'12px',background:'var(--bg-elevated)',borderRadius:'var(--radius-md)' }}>
              <div style={{ fontSize:'0.65rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',marginBottom:6 }}>FROM</div>
              <div style={{ fontWeight:700,fontSize:'0.85rem' }}>{company?.name || 'Company Name (set in Settings)'}</div>
              <div style={{ fontSize:'0.78rem',color:'var(--text-muted)',marginTop:4,lineHeight:1.6 }}>{company?.address || '—'}<br/>{company?.city}</div>
            </div>
            <div style={{ padding:'12px',background:'var(--bg-elevated)',borderRadius:'var(--radius-md)' }}>
              <div style={{ fontSize:'0.65rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',marginBottom:6 }}>TO</div>
              <div style={{ fontWeight:700,fontSize:'0.85rem' }}>{client.first_name} {client.last_name}</div>
              <div style={{ fontSize:'0.78rem',color:'var(--text-muted)',marginTop:4,lineHeight:1.6 }}>{client.address || '—'}<br/>{client.city} {client.pincode && `- ${client.pincode}`}</div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={printSlip}>📮 Print Courier Slip</button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Client Modal ───────────────────────────────────────────
function EditClientModal({ client, onClose, onSaved }) {
  const [form, setForm] = useState({ ...client });
  const [loading, setLoading] = useState(false);

  const f = (field) => ({
    value: form[field] || '',
    onChange: e => setForm(p => ({ ...p, [field]: e.target.value })),
  });

  const handleSave = async () => {
    setLoading(true);
    try {
      await fetch(`${BASE_URL}/clients/${client.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      onSaved();
      onClose();
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3 className="modal-title">✏️ Edit Client — {client.first_name} {client.last_name}</h3><button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="form-row form-row-3">
            <div className="form-group"><label className="form-label required">First Name</label><input className="form-input" {...f('first_name')} /></div>
            <div className="form-group"><label className="form-label">Middle Name</label><input className="form-input" {...f('middle_name')} /></div>
            <div className="form-group"><label className="form-label required">Last Name</label><input className="form-input" {...f('last_name')} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Phone</label><input className="form-input" {...f('phone')} /></div>
            <div className="form-group"><label className="form-label">Alt Phone</label><input className="form-input" {...f('phone_alt')} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" {...f('email')} /></div>
            <div className="form-group"><label className="form-label">Company</label><input className="form-input" {...f('company')} /></div>
          </div>
          <div className="form-group"><label className="form-label">Address</label><textarea className="form-textarea" style={{ minHeight:60 }} {...f('address')} /></div>
          <div className="form-row form-row-3">
            <div className="form-group"><label className="form-label">City</label><input className="form-input" {...f('city')} /></div>
            <div className="form-group"><label className="form-label">State</label><input className="form-input" {...f('state')} /></div>
            <div className="form-group"><label className="form-label">Pincode</label><input className="form-input" {...f('pincode')} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">ID Type</label>
              <select className="form-select" {...f('id_type')}>
                {['','Aadhaar','PAN','Voter ID','Passport','Driving License'].map(v => <option key={v} value={v}>{v||'— None —'}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">ID Number</label><input className="form-input" {...f('id_number')} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">WhatsApp</label><input className="form-input" {...f('whatsapp')} placeholder="WA number (if different)" /></div>
            <div className="form-group"><label className="form-label">Reference Source</label>
              <select className="form-select" {...f('referral_source')}>
                {['','Google','Referral','Walk-in','Social Media','Website','Other'].map(v=><option key={v} value={v}>{v||'— Select —'}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group" style={{ display:'flex',alignItems:'center',gap:12,paddingTop:24 }}>
              <label style={{ display:'flex',alignItems:'center',gap:10,cursor:'pointer' }}>
                <input type="checkbox" checked={!!form.is_vip} onChange={e=>setForm(p=>({...p,is_vip:e.target.checked}))} style={{ width:16,height:16 }} />
                <span>⭐ VIP Client</span>
              </label>
            </div>
            <div className="form-group" style={{ display:'flex',alignItems:'center',gap:12,paddingTop:24 }}>
              <label style={{ display:'flex',alignItems:'center',gap:10,cursor:'pointer' }}>
                <input type="checkbox" checked={!!form.is_corporate} onChange={e=>setForm(p=>({...p,is_corporate:e.target.checked}))} style={{ width:16,height:16 }} />
                <span>🏢 Corporate</span>
              </label>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading||!form.first_name||!form.phone} onClick={handleSave}>
            {loading?<><div className="spinner" style={{width:14,height:14}}/> Saving…</>:'💾 Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Communication Modal ─────────────────────────────────────
function AddCommModal({ clientId, caseId, onClose, onDone }) {
  const [form, setForm] = useState({ type:'call',direction:'outbound',summary:'',case_id:caseId||'' });
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      await fetch(`${BASE_URL}/clients/${clientId}/communications`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${getToken()}`,'Content-Type':'application/json' },
        body: JSON.stringify(form),
      });
      onDone(); onClose();
    } catch(e){ alert(e.message); } finally{ setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h3 className="modal-title">💬 Add Communication</h3><button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Type</label>
              <select className="form-select" value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                {['call','whatsapp','email','in-person','sms'].map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Direction</label>
              <select className="form-select" value={form.direction} onChange={e=>setForm(p=>({...p,direction:e.target.value}))}>
                <option value="inbound">📥 Inbound (Client called)</option>
                <option value="outbound">📤 Outbound (We called)</option>
              </select>
            </div>
          </div>
          <div className="form-group"><label className="form-label required">Summary / Notes</label><textarea className="form-textarea" value={form.summary} onChange={e=>setForm(p=>({...p,summary:e.target.value}))} placeholder="What was discussed…" /></div>
          {caseId && <div className="form-group"><label className="form-label">Case Reference</label><input className="form-input font-mono" value={form.case_id} onChange={e=>setForm(p=>({...p,case_id:e.target.value}))} /></div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading||!form.summary} onClick={handle}>{loading?<><div className="spinner" style={{width:14,height:14}}/> Saving…</>:'➕ Add'}</button>
        </div>
      </div>
    </div>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canAccess } = useAuth();
  const [cl, setCl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [showEdit, setShowEdit] = useState(false);
  const [showCourier, setShowCourier] = useState(false);
  const [showComm, setShowComm] = useState(false);
  const [company, setCompany] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    clientsApi.get(id).then(setCl).catch(() => navigate('/clients')).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch(`${BASE_URL}/company/settings`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(d => setCompany(d.settings || d)).catch(() => {});
  }, []);

  if (loading) return <div style={{ display:'flex',justifyContent:'center',paddingTop:80 }}><div className="spinner" style={{ width:32,height:32,borderWidth:3 }} /></div>;
  if (!cl) return null;

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24 }}>
        <div>
          <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/clients')}>← Back</button>
            <span className="font-mono text-accent text-xs">{cl.client_code}</span>
            {cl.is_vip && <span style={{ fontSize:'0.7rem',padding:'2px 8px',background:'rgba(245,158,11,0.15)',borderRadius:999,color:'#fbbf24' }}>⭐ VIP</span>}
            {cl.is_corporate && <span style={{ fontSize:'0.7rem',padding:'2px 8px',background:'rgba(59,130,246,0.15)',borderRadius:999,color:'#60a5fa' }}>🏢 Corporate</span>}
          </div>
          <h2>{cl.first_name} {cl.middle_name ? cl.middle_name+' ' : ''}{cl.last_name}</h2>
          <div className="text-sm text-muted">{cl.phone}{cl.email && ` • ${cl.email}`}{cl.company && ` • ${cl.company}`}</div>
        </div>
        <div style={{ display:'flex',gap:10,flexWrap:'wrap' }}>
          <div style={{ textAlign:'right',padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)' }}>
            <div style={{ fontSize:'0.65rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',marginBottom:2 }}>Total Paid</div>
            <div style={{ fontSize:'1.1rem',fontWeight:800,color:'var(--status-success)',fontFamily:'var(--font-mono)' }}>₹{parseFloat(cl.total_paid||0).toLocaleString('en-IN')}</div>
          </div>
          <div style={{ textAlign:'right',padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)' }}>
            <div style={{ fontSize:'0.65rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',marginBottom:2 }}>Total Cases</div>
            <div style={{ fontSize:'1.1rem',fontWeight:800,color:'var(--accent-primary)',fontFamily:'var(--font-mono)' }}>{cl.total_cases||cl.cases?.length||0}</div>
          </div>
          <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
            {canAccess('junior_engineer') && <button className="btn btn-secondary btn-sm" onClick={() => setShowEdit(true)}>✏️ Edit</button>}
            <button className="btn btn-secondary btn-sm" onClick={() => setShowCourier(true)}>📮 Courier Slip</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom:20 }}>
        {[
          { key:'overview',       label:'📋 Overview' },
          { key:'cases',          label:'📂 Cases' },
          { key:'communications', label:'💬 Communications' },
        ].map(t => <button key={t.key} className={`tab-btn ${tab===t.key?'active':''}`} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {tab === 'overview' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-title" style={{ marginBottom:14 }}>👤 Contact Information</div>
            <div className="tech-data-table">
              {[
                ['Phone', cl.phone], ['Alt Phone', cl.phone_alt||'—'], ['Email', cl.email||'—'],
                ['WhatsApp', cl.whatsapp||cl.phone], ['Company', cl.company||'—'],
                ['City', cl.city||'—'], ['State', cl.state||'—'], ['Pincode', cl.pincode||'—'],
                ['Referral', cl.referral_source||'—'], ['ID', cl.id_type ? `${cl.id_type}: ${cl.id_number||'—'}` : '—'],
              ].map(([label, value]) => (
                <div key={label} className="tech-data-cell">
                  <div className="tech-data-label">{label}</div>
                  <div className="tech-data-value">{value}</div>
                </div>
              ))}
            </div>
            {cl.address && <div style={{ marginTop:12,fontSize:'0.8rem',color:'var(--text-secondary)',padding:'8px 10px',background:'var(--bg-elevated)',borderRadius:'var(--radius-sm)' }}>📍 {cl.address}</div>}
          </div>
          <div className="card">
            <div className="card-title" style={{ marginBottom:14 }}>📊 Summary</div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
              {[
                { l:'Total Cases', v:cl.cases?.length||0 },
                { l:'Amount Paid', v:`₹${parseFloat(cl.paymentSummary?.total_paid||0).toLocaleString('en-IN')}` },
                { l:'Member Since', v:new Date(cl.created_at).toLocaleDateString('en-IN') },
                { l:'ID Type', v:`${cl.id_type||'—'} ${cl.id_number||''}` },
              ].map(({ l, v }) => (
                <div key={l} style={{ padding:'12px',background:'var(--bg-elevated)',borderRadius:'var(--radius-sm)' }}>
                  <div className="tech-data-label">{l}</div>
                  <div style={{ fontSize:'0.9rem',fontWeight:700,color:'var(--text-primary)',marginTop:4 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'cases' && (
        <div className="table-container">
          <table>
            <thead><tr><th>Case #</th><th>Device</th><th>Stage</th><th>Failure</th><th>Date</th></tr></thead>
            <tbody>
              {(cl.cases||[]).map(c => (
                <tr key={c.id} onClick={() => navigate(`/cases/${c.id}`)} style={{ cursor:'pointer' }}>
                  <td><span className="font-mono text-xs text-accent">{c.case_number}</span></td>
                  <td>{c.device_brand} {c.device_model}</td>
                  <td><span className={`badge badge-${c.stage}`}>{c.stage?.replace(/_/g,' ')}</span></td>
                  <td>{c.failure_type && <span className={`badge badge-${c.failure_type}`}>{c.failure_type}</span>}</td>
                  <td className="text-xs text-muted">{new Date(c.created_at).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
              {!cl.cases?.length && <tr><td colSpan={5}><div className="empty-state" style={{ padding:30 }}><div className="empty-desc">No cases for this client</div></div></td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'communications' && (
        <div>
          <div style={{ display:'flex',justifyContent:'flex-end',marginBottom:12 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setShowComm(true)}>+ Add Communication</button>
          </div>
          <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
            {(cl.communications||[]).map(comm => (
              <div key={comm.id} style={{ padding:'12px',background:'var(--bg-elevated)',borderRadius:'var(--radius-sm)',borderLeft:'3px solid var(--border-accent)' }}>
                <div style={{ display:'flex',justifyContent:'space-between',marginBottom:4 }}>
                  <div style={{ display:'flex',gap:8,alignItems:'center' }}>
                    <span style={{ fontSize:'0.72rem',padding:'2px 8px',background:'rgba(0,212,255,0.1)',borderRadius:999,color:'var(--accent-primary)',fontFamily:'var(--font-mono)' }}>{comm.type}</span>
                    <span style={{ fontSize:'0.72rem',color:'var(--text-muted)' }}>{comm.direction}</span>
                  </div>
                  <span className="text-xs text-muted">{new Date(comm.created_at).toLocaleString('en-IN')}</span>
                </div>
                <div style={{ fontSize:'0.82rem',color:'var(--text-secondary)' }}>{comm.summary}</div>
                {comm.staff_name && <div className="text-xs text-muted" style={{ marginTop:4 }}>by {comm.staff_name}</div>}
              </div>
            ))}
            {!cl.communications?.length && <div className="empty-state" style={{ padding:30 }}><div className="empty-icon">💬</div><div className="empty-title">No communications recorded</div></div>}
          </div>
        </div>
      )}

      {showEdit && <EditClientModal client={cl} onClose={() => setShowEdit(false)} onSaved={load} />}
      {showCourier && <CourierSlip client={cl} company={company} onClose={() => setShowCourier(false)} />}
      {showComm && <AddCommModal clientId={id} onClose={() => setShowComm(false)} onDone={load} />}
    </div>
  );
}
