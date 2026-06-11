import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { clientsApi } from '../services/api';
import { exportApi } from '../services/exportApi';
import { useAuth } from '../store/AuthContext';

function NewClientModal({ onClose, onCreated, initialData }) {
  const isEdit = !!initialData?.id;
  const [form, setForm] = useState(initialData || { country: 'India' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isEdit) {
        await clientsApi.update(initialData.id, form);
      } else {
        const client = await clientsApi.create(form);
        onCreated(client);
      }
      onCreated();
      onClose();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? '✏️ Edit Client' : '👥 New Client'}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-danger" style={{marginBottom:16}}><span className="alert-icon">⚠</span> {error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label required">First Name</label>
                <input className="form-input" required value={form.first_name||''} onChange={e=>setForm({...form,first_name:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label required">Last Name</label>
                <input className="form-input" required value={form.last_name||''} onChange={e=>setForm({...form,last_name:e.target.value})} />
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label required">Phone</label>
                <input className="form-input" required value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Alternate Phone</label>
                <input className="form-input" value={form.phone_alt||''} onChange={e=>setForm({...form,phone_alt:e.target.value})} />
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Company</label>
                <input className="form-input" value={form.company||''} onChange={e=>setForm({...form,company:e.target.value})} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <textarea className="form-textarea" style={{minHeight:60}} value={form.address||''} onChange={e=>setForm({...form,address:e.target.value})} />
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">City</label>
                <input className="form-input" value={form.city||''} onChange={e=>setForm({...form,city:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Referral Source</label>
                <select className="form-select" value={form.referral_source||''} onChange={e=>setForm({...form,referral_source:e.target.value})}>
                  <option value="">Select...</option>
                  <option>Walk-in</option><option>Google</option><option>Referral</option>
                  <option>Social Media</option><option>Repeat Client</option><option>Other</option>
                </select>
              </div>
            </div>
            <div style={{display:'flex',gap:20}}>
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:'0.82rem',cursor:'pointer'}}>
                <input type="checkbox" checked={form.is_corporate||false} onChange={e=>setForm({...form,is_corporate:e.target.checked})} />
                <span style={{color:'var(--text-secondary)'}}>Corporate Client</span>
              </label>
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:'0.82rem',cursor:'pointer'}}>
                <input type="checkbox" checked={form.is_vip||false} onChange={e=>setForm({...form,is_vip:e.target.checked})} />
                <span style={{color:'var(--text-secondary)'}}>⭐ VIP</span>
              </label>
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading||!form.first_name||!form.phone} onClick={handleSubmit}>
            {loading
              ? <><div className="spinner" style={{width:14,height:14}}/> {isEdit ? 'Saving...' : 'Creating...'}</>
              : isEdit ? 'Save Changes' : '+ Add Client'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CollectModal({ client, onClose, onCollected }) {
  const [pendingCases, setPendingCases] = useState([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [form, setForm] = useState({
    discount_type: 'none',
    discount_value: '',
    method: 'UPI',
    reference: '',
    notes: '',
  });
  const [grossAmount, setGrossAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState('');

  const PAY_METHODS = (() => {
    try { const c = JSON.parse(localStorage.getItem('custom_payment_methods')); if (c && c.length) return c; } catch {}
    try { const co = JSON.parse(localStorage.getItem('crm_company')); if (co?.payment_methods?.length) return co.payment_methods; } catch {}
    return ['Cash','UPI','Card (Debit/Credit)','Bank Transfer','NEFT','RTGS','Cheque','Online (Razorpay)'];
  })();

  useEffect(() => {
    if (!client?.id) return;
    setCasesLoading(true);
    clientsApi.get(client.id)
      .then(data => {
        const cases = (data.cases || []).filter(c => parseFloat(c.pending_amount || 0) > 0);
        setPendingCases(cases);
        if (cases.length === 1) {
          setSelectedCaseId(cases[0].id);
          setGrossAmount(String(parseFloat(cases[0].pending_amount || 0).toFixed(2)));
        }
      })
      .catch(() => setValidationError('Failed to load case details'))
      .finally(() => setCasesLoading(false));
  }, [client?.id]);

  if (!client) return null;

  const selectedCase = pendingCases.find(c => c.id === selectedCaseId);
  const remainingBalance = parseFloat(selectedCase?.pending_amount || 0);
  const gross = parseFloat(grossAmount) || 0;
  
  // Calculate discount amount - cap at gross amount for safety
  const discountAmt = form.discount_type === 'flat'
    ? Math.min(Math.max(0, parseFloat(form.discount_value) || 0), gross)
    : form.discount_type === 'percent'
      ? gross * (Math.min(Math.max(0, parseFloat(form.discount_value) || 0), 100) / 100)
      : 0;
  
  const finalAmount = Math.max(0, gross - discountAmt);
  
  // Calculate discount percentage for validation - round to avoid floating point precision issues
  const discount = gross > 0 ? Math.round((discountAmt / gross) * 10000) / 100 : 0;
  const fmt = v => `₹${parseFloat(v||0).toLocaleString('en-IN', {minimumFractionDigits:0,maximumFractionDigits:2})}`;

  const stageLabel = s => s ? s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) : '';
  const stageColor = s => {
    if (!s) return 'var(--text-muted)';
    if (s.includes('complet')||s.includes('deliver')) return 'var(--status-success)';
    if (s.includes('progress')||s.includes('recovery')) return '#2563eb';
    if (s.includes('cancel')||s.includes('failed')) return 'var(--status-danger,#ef4444)';
    return 'var(--status-warning)';
  };

  const handleCaseChange = id => {
    setSelectedCaseId(id);
    setValidationError('');
    const c = pendingCases.find(x => x.id === id);
    setGrossAmount(c ? String(parseFloat(c.pending_amount||0).toFixed(2)) : '');
  };

  const validate = () => {
    if (!selectedCaseId) return 'Please select a case.';
    if (!gross || gross <= 0) return 'Enter a valid gross amount.';
    // Remove the final amount validation - allow 0 when discount is applied
    if (finalAmount > remainingBalance) return `Amount cannot exceed remaining balance of ${fmt(remainingBalance)}.`;
    return '';
  };

  const handleCollect = async () => {
    const err = validate();
    setValidationError(err);
    if (err) return;
    setLoading(true);
    try {
      // Use threshold of 99.5% to account for floating point precision
      const is100Discount = discount >= 99.5;
      await clientsApi.collectPending(client.id, {
        case_selections: [{ case_id: selectedCaseId, amount: finalAmount }],
        method: form.method,
        reference: form.reference,
        notes: form.notes,
        is_100_percent_discount: is100Discount,
      });
      if (onCollected) await onCollected();
      try { window.dispatchEvent(new Event('paymentsUpdated')); } catch {}
      onClose();
    } catch (err) {
      setValidationError(err?.response?.data?.error || err?.message || 'Failed to collect payment');
    } finally { setLoading(false); }
  };

  const generateLink = async () => {
    const err = validate();
    if (err) { setValidationError(err); return; }
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('crm_token') || '';
      const res = await fetch(`${window.location.origin.includes('5173') ? 'http://localhost:5000' : ''}/api/razorpay/payment-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: finalAmount, description: 'Data Recovery Service Payment', case_id: selectedCaseId }),
      });
      const data = await res.json();
      const url = data.payment_link || `https://rzp.io/l/demo_${Math.random().toString(36).substring(2,8)}`;
      await navigator.clipboard.writeText(url).catch(()=>{});
      alert(`✅ Payment Link copied!\n\n${url}\n\nAmount: ₹${finalAmount.toLocaleString('en-IN')}${discountAmt>0?`\n(Incl. discount ₹${discountAmt.toLocaleString('en-IN')})`:''}` );
    } catch {
      const url = `https://rzp.io/l/demo_${Math.random().toString(36).substring(2,8)}`;
      await navigator.clipboard.writeText(url).catch(()=>{});
      alert(`Payment Link (demo) copied:\n${url}`);
    }
  };

  const formError = validationError || validate();

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth: 520}}>
        <div className="modal-header">
          <h3 className="modal-title"> Collect Payment — {client.first_name} {client.last_name}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {/* Case selector */}
          <div className="form-group">
            <label className="form-label">Select Case <span style={{color:'var(--status-danger,#ef4444)'}}>*</span></label>
            {casesLoading ? (
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 12px',background:'var(--bg-elevated)',borderRadius:'var(--radius-sm)'}}>
                <div className="spinner" style={{width:14,height:14}}/><span style={{color:'var(--text-muted)',fontSize:'0.85rem'}}>Loading cases…</span>
              </div>
            ) : pendingCases.length === 0 ? (
              <div style={{padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:'var(--radius-sm)',color:'var(--text-muted)',fontSize:'0.85rem'}}>No pending cases for this client</div>
            ) : (
              <select className="form-select" value={selectedCaseId} onChange={e => handleCaseChange(e.target.value)}>
                <option value="">— Choose a case —</option>
                {pendingCases.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.case_number}{c.stage ? ` [${stageLabel(c.stage)}]` : ''} — Pending {fmt(c.pending_amount)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Case financial breakdown */}
          {selectedCase && (
            <div style={{border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-md)', background:'var(--bg-elevated)', marginBottom:16, overflow:'hidden'}}>
              <div style={{padding:'8px 14px', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', gap:10}}>
                <span style={{fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'0.88rem'}}>{selectedCase.case_number}</span>
                {selectedCase.stage && (
                  <span style={{fontSize:'0.72rem',fontWeight:600,padding:'2px 8px',borderRadius:10,background:stageColor(selectedCase.stage)+'20',color:stageColor(selectedCase.stage),border:`1px solid ${stageColor(selectedCase.stage)}40`}}>
                    {stageLabel(selectedCase.stage)}
                  </span>
                )}
                <span style={{marginLeft:'auto', fontSize:'0.75rem', color:'var(--text-muted)'}}>{client.first_name} {client.last_name}</span>
              </div>
              <div style={{padding:'10px 14px', display:'flex', flexDirection:'column', gap:7, fontSize:'0.85rem'}}>
                <div style={{display:'flex', justifyContent:'space-between'}}>
                  <span style={{color:'var(--text-muted)'}}>Total Amount (Quotation)</span>
                  <span style={{fontWeight:600}}>{fmt(selectedCase.quotation_total)}</span>
                </div>
                <div style={{display:'flex', justifyContent:'space-between'}}>
                  <span style={{color:'var(--text-muted)'}}>Already Paid</span>
                  <span style={{fontWeight:600, color:'var(--status-success)'}}>- {fmt(selectedCase.total_paid)}</span>
                </div>
                <div style={{display:'flex', justifyContent:'space-between', paddingTop:6, borderTop:'1px solid var(--border-subtle)'}}>
                  <span style={{fontWeight:600}}>Pending Balance</span>
                  <span style={{fontWeight:700, color: remainingBalance > 0 ? 'var(--status-danger,#ef4444)' : 'var(--status-success)'}}>{fmt(remainingBalance)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Error banner */}
          {validationError && (
            <div style={{padding:10,borderRadius:'var(--radius-sm)',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.25)',color:'var(--status-danger,#ef4444)',fontSize:'0.88rem',marginBottom:12}}>
              {validationError}
            </div>
          )}

          {/* Amount + discount */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="form-group" style={{margin:0}}>
              <label className="form-label required">Gross Amount (₹)</label>
              <input type="number" className="form-input" value={grossAmount}
                onChange={e => { setValidationError(''); setGrossAmount(e.target.value); }}
                placeholder="0.00" disabled={!selectedCaseId} />
            </div>
            <div className="form-group" style={{margin:0}}>
              <label className="form-label">Discount</label>
              <div style={{display:'flex',gap:6}}>
                <select className="form-select" style={{width:130}} value={form.discount_type}
                  onChange={e => { setValidationError(''); setForm(p=>({...p,discount_type:e.target.value,discount_value:''})); }}>
                  <option value="none">No Discount</option>
                  <option value="flat">Flat (₹)</option>
                  <option value="percent">Percent (%)</option>
                </select>
                {form.discount_type !== 'none' && (
                  <input type="number" className="form-input" style={{flex:1}}
                    placeholder={form.discount_type==='percent'?'0–100':'Amount'}
                    value={form.discount_value}
                    onChange={e => { setValidationError(''); setForm(p=>({...p,discount_value:e.target.value})); }} />
                )}
              </div>
            </div>
          </div>

          {/* Payment summary breakdown */}
          {selectedCase && gross > 0 && (
            <div style={{background:'var(--bg-elevated)',borderRadius:8,margin:'10px 0',border:'1px solid var(--border-subtle)',overflow:'hidden'}}>
              <div style={{padding:'8px 14px', display:'flex', flexDirection:'column', gap:6, fontSize:'0.83rem'}}>
                <div style={{display:'flex', justifyContent:'space-between'}}>
                  <span style={{color:'var(--text-muted)'}}>Total Amount</span>
                  <span style={{fontWeight:600}}>{fmt(selectedCase.quotation_total)}</span>
                </div>
                <div style={{display:'flex', justifyContent:'space-between'}}>
                  <span style={{color:'var(--text-muted)'}}>Already Paid</span>
                  <span style={{fontWeight:600, color:'var(--status-success)'}}>- {fmt(selectedCase.total_paid)}</span>
                </div>
                <div style={{display:'flex', justifyContent:'space-between'}}>
                  <span style={{color:'var(--text-muted)'}}>Collecting Now{discountAmt > 0 ? ` (incl. −${fmt(discountAmt)} discount)` : ''}</span>
                  <span style={{fontWeight:600, color:'var(--accent-primary)'}}>- {fmt(finalAmount)}</span>
                </div>
                <div style={{display:'flex', justifyContent:'space-between', paddingTop:6, borderTop:'1px solid var(--border-subtle)'}}>
                  <span style={{fontWeight:700}}>Pending After</span>
                  <span style={{fontWeight:800, color: Math.max(0, remainingBalance - finalAmount) > 0 ? 'var(--status-danger,#ef4444)' : 'var(--status-success)'}}>
                    {fmt(Math.max(0, remainingBalance - finalAmount))}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Payment method + reference */}
          <div className="form-row form-row-2" style={{marginTop:8}}>
            <div className="form-group">
              <label className="form-label">Payment Method</label>
              <select className="form-select" value={form.method}
                onChange={e => { setValidationError(''); setForm(p=>({...p,method:e.target.value})); }}>
                {PAY_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Reference / Transaction ID</label>
              <input className="form-input" value={form.reference}
                onChange={e => { setValidationError(''); setForm(p=>({...p,reference:e.target.value})); }}
                placeholder="UPI ref, cheque no, transaction ID..." />
            </div>
          </div>

          {/* Notes */}
          <div className="form-group">
            <label className="form-label">Notes</label>
            <input className="form-input" value={form.notes}
              onChange={e => { setValidationError(''); setForm(p=>({...p,notes:e.target.value})); }}
              placeholder="Payment notes..." />
          </div>

          {/* Razorpay link box */}
          <div style={{display:'flex',gap:12,padding:'12px 14px',background:'rgba(0,212,255,0.05)',borderRadius:'var(--radius-sm)',border:'1px solid rgba(0,212,255,0.15)',alignItems:'center',marginBottom:4}}>
            <div style={{fontSize:'1.3rem'}}>🔗</div>
            <div style={{flex:1}}>
              <div style={{fontSize:'0.8rem',fontWeight:600,color:'var(--text-primary)',marginBottom:2}}>Generate Razorpay Link Instead</div>
              <div style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>Send a payment link to the client via WhatsApp/Email.</div>
            </div>
            <button className="btn btn-sm" style={{background:'rgba(0,212,255,0.1)',color:'var(--accent-primary)',borderColor:'rgba(0,212,255,0.3)'}} onClick={generateLink}>
              Generate Link
            </button>
          </div>

        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCollect}
            disabled={loading || !!formError || !selectedCaseId}>
            {loading
              ? <><div className="spinner" style={{width:14,height:14}}/> Recording…</>
              : ` Record Payment${finalAmount > 0 ? ` — ${fmt(finalAmount)}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const { canAccess } = useAuth();
  const [clients, setClients] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState(() => sessionStorage.getItem('clients_sortField') || 'created_at');
  const [sortOrder, setSortOrder] = useState(() => sessionStorage.getItem('clients_sortOrder') || 'desc');
  useEffect(() => { sessionStorage.setItem('clients_sortField', sortField); }, [sortField]);
  useEffect(() => { sessionStorage.setItem('clients_sortOrder', sortOrder); }, [sortOrder]);
  const [showNew, setShowNew] = useState(false);
  const [showEditClient, setShowEditClient] = useState(null);
  const [collectingIds, setCollectingIds] = useState(new Set());
  const [showCollectClient, setShowCollectClient] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await clientsApi.list({ page, limit: 25, search, sort: sortField, order: sortOrder });
      setClients(d.clients || []);
      setPagination(d.pagination || {});
    } catch {} finally { setLoading(false); }
  }, [search, page, sortField, sortOrder]);

  useEffect(() => { load(); }, [load]);

  const toggleSort = (field) => {
    setPage(1);
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortField(field);
    setSortOrder('asc');
  };

  const renderSortIcon = (field) => {
    if (sortField !== field) return '↕';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const handleCollect = (client) => {
    if (!client?.id) return;
    const pending = parseFloat(client.pending_amount || 0);
    if (pending <= 0) return;
    setShowCollectClient(client);
  };

  const handleExportClients = async () => {
    try {
      const blob = await exportApi.exportClients(
        {
          search: search,
          is_corporate: filters.is_corporate,
          is_vip: filters.is_vip
        }
      );
      const filename = `clients_export_${new Date().toISOString().split('T')[0]}.csv`;
      exportApi.downloadFile(blob, filename);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export clients: ' + (err.message || 'Unknown error'));
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Client Management</h2>
          <p>CRM — {pagination.total || 0} total clients</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleExportClients} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
             Export
          </button>
          {canAccess('staff') && (
            <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Client</button>
          )}
        </div>
      </div>

      <div className="filters-bar">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input className="search-input" placeholder="Search name, phone, email, company..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="table-container">
        <div style={{overflowX:'auto'}}>
          {loading ? (
            <div style={{display:'flex',justifyContent:'center',padding:60}}><div className="spinner" style={{width:28,height:28,borderWidth:3}}/></div>
          ) : (
            <table>
              <thead><tr>
                <th>
                  <button type="button" onClick={() => toggleSort('client_code')} style={{background:'transparent',border:'0',color:'inherit',padding:0,fontWeight:700,display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
                    Code <span style={{fontSize:'0.75rem',opacity:0.8}}>{renderSortIcon('client_code')}</span>
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => toggleSort('first_name')} style={{background:'transparent',border:'0',color:'inherit',padding:0,fontWeight:700,display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
                    Name <span style={{fontSize:'0.75rem',opacity:0.8}}>{renderSortIcon('first_name')}</span>
                  </button>
                </th>
                <th>Phone</th>
                <th>Email</th>
                <th>
                  <button type="button" onClick={() => toggleSort('company')} style={{background:'transparent',border:'0',color:'inherit',padding:0,fontWeight:700,display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
                    Company <span style={{fontSize:'0.75rem',opacity:0.8}}>{renderSortIcon('company')}</span>
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => toggleSort('active_cases')} style={{background:'transparent',border:'0',color:'inherit',padding:0,fontWeight:700,display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
                    Active Cases <span style={{fontSize:'0.75rem',opacity:0.8}}>{renderSortIcon('active_cases')}</span>
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => toggleSort('pending_amount')} style={{background:'transparent',border:'0',color:'inherit',padding:0,fontWeight:700,display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
                    Total Pending Amount <span style={{fontSize:'0.75rem',opacity:0.8}}>{renderSortIcon('pending_amount')}</span>
                  </button>
                </th>
                <th>Tags</th>
                <th>
                  <button type="button" onClick={() => toggleSort('created_at')} style={{background:'transparent',border:'0',color:'inherit',padding:0,fontWeight:700,display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
                    Joined <span style={{fontSize:'0.75rem',opacity:0.8}}>{renderSortIcon('created_at')}</span>
                  </button>
                </th>
                <th>Actions</th>
              </tr></thead>
              <tbody>
                {clients.map(cl => (
                  <tr key={cl.id} onClick={() => navigate(`/clients/${cl.id}`)}>
                    <td><span className="font-mono text-xs text-accent">{cl.client_code}</span></td>
                    <td>
                      <div style={{fontWeight:600,fontSize:'0.85rem'}}>{cl.first_name} {cl.last_name}</div>
                    </td>
                    <td className="font-mono text-xs">{cl.phone}</td>
                    <td className="text-xs text-muted">{cl.email||'—'}</td>
                    <td className="text-xs">{cl.company||'—'}</td>
                    <td>
                      <span style={{fontFamily:'var(--font-mono)',fontWeight:700,color: Number(cl.active_cases||0) > 0 ? 'var(--accent-primary)' : 'var(--text-muted)'}}>
                        {Number(cl.active_cases||0)} / {Number(cl.total_cases||0)}
                      </span>
                    </td>
                    <td className="font-mono text-xs">₹{parseFloat(cl.pending_amount || 0).toLocaleString('en-IN')}</td>
                    <td>
                      <div style={{display:'flex',gap:4}}>
                        {cl.is_vip && <span style={{fontSize:'0.65rem',padding:'2px 6px',background:'rgba(245,158,11,0.15)',borderRadius:999,color:'#fbbf24',fontFamily:'var(--font-mono)'}}>⭐ VIP</span>}
                        {cl.is_corporate && <span style={{fontSize:'0.65rem',padding:'2px 6px',background:'rgba(59,130,246,0.15)',borderRadius:999,color:'#60a5fa',fontFamily:'var(--font-mono)'}}>🏢 Corp</span>}
                      </div>
                    </td>
                    <td className="text-xs text-muted">{new Date(cl.created_at).toLocaleDateString('en-IN')}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{display:'flex',gap:6}}>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() => setShowEditClient(cl)}
                          title="Edit client"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${parseFloat(cl.pending_amount || 0) > 0 ? 'btn-primary' : 'btn-secondary'}`}
                          disabled={parseFloat(cl.pending_amount || 0) <= 0 || collectingIds.has(cl.id)}
                          onClick={() => handleCollect(cl)}
                        >
                          {collectingIds.has(cl.id) ? 'Collecting...' : 'Collect'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!clients.length && (
                  <tr><td colSpan={10}>
                    <div className="empty-state">
                      <div className="empty-icon">👥</div>
                      <div className="empty-title">No clients found</div>
                      <div className="empty-desc">Add your first client to get started</div>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        {pagination.pages > 1 && (
          <div style={{display:'flex',justifyContent:'center',gap:12,padding:16,borderTop:'1px solid var(--border-subtle)'}}>
            <button className="btn btn-secondary btn-sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← Prev</button>
            <span className="text-xs text-muted font-mono">Page {page} of {pagination.pages}</span>
            <button className="btn btn-secondary btn-sm" disabled={page>=pagination.pages} onClick={()=>setPage(p=>p+1)}>Next →</button>
          </div>
        )}
      </div>

      {showNew && <NewClientModal onClose={()=>setShowNew(false)} onCreated={load} />}
      {showEditClient && <NewClientModal initialData={showEditClient} onClose={()=>setShowEditClient(null)} onCreated={load} />}
      {showCollectClient && <CollectModal client={showCollectClient} onClose={()=>setShowCollectClient(null)} onCollected={load} />}
    </div>
  );
}
