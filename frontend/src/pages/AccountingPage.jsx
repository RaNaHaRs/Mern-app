import React, { useState, useEffect, useCallback } from 'react';
import { accountingApi } from '../services/api';
import { useAuth } from '../store/AuthContext';
import { generateInvoicePDF, savePDF, openPDFPreview } from '../utils/pdfGenerator';
import { openPrintPreviewWindow } from '../utils/printPreview';

const fmt = (n) => `₹${parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Professional SVG Icons ──────────────────────────────────────
function IconTrendingUp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  );
}
function IconWallet() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12c0 1.1.9 2 2 2h14v-8" /><path d="M18 12a2 2 0 1 0 0 4 2 2 0 1 0 0-4z" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function IconAlert() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
function IconCreditCard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  );
}
function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function IconRestore() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
    </svg>
  );
}
function iconBtnStyle(variant) {
  const base = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, border: '1px solid', cursor: 'pointer', transition: 'all 0.15s', padding: 0, flexShrink: 0 };
  if (variant === 'danger') return { ...base, background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)', color: '#ef4444' };
  if (variant === 'ghost')  return { ...base, background: 'rgba(255,255,255,0.04)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' };
  if (variant === 'restore') return { ...base, background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)', color: '#10b981' };
  return base;
}


const P_CATS = ['equipment', 'consumables', 'parts', 'donor_drives', 'services', 'other'];
const I_STATUS = { unpaid: { color: '#fbbf24', bg: 'rgba(245,158,11,0.12)', label: 'Unpaid' }, paid: { color: '#34d399', bg: 'rgba(16,185,129,0.15)', label: 'Paid' }, overdue: { color: '#f87171', bg: 'rgba(239,68,68,0.15)', label: 'Overdue' }, partial: { color: '#00d4ff', bg: 'rgba(0,212,255,0.12)', label: 'Partial' }, cancelled: { color: '#94a3b8', bg: 'rgba(100,116,139,0.1)', label: 'Cancelled' } };
const EXP_CATS = ['equipment', 'consumables', 'donor_drives', 'rent', 'utilities', 'salaries', 'marketing', 'purchase', 'other'];
const PAY_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'NEFT', 'RTGS'];

function printCourierSlip(inv) {
  const co = (() => { try { return JSON.parse(localStorage.getItem('crm_company')) || {}; } catch { return {}; } })();
  const coName = co.name || 'RecoverLab CRM';
  const coAddr = co.address || 'Address not set';
  const coPhone = co.phone || '';
  const clientName = inv.client_name || '—';
  const clientAddr = inv.client_address || inv.company || 'Address not on file';
  const clientPhone = inv.client_phone || '';
  const ref = inv.invoice_number;
  const today = new Date().toLocaleDateString('en-IN');
  const html = `<!DOCTYPE html><html><head><title>Courier Slip</title>
  <style id="pageStyle">@page{size:A5 landscape;margin:0}</style>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    @media print{.controls,.cut-line{display:none!important}body{background:#fff;padding:0}.slip-wrap{padding:0;display:block}}
    body{font-family:Arial,sans-serif;background:#e2e8f0;min-height:100vh}
    .controls{background:#1e293b;color:#f8fafc;padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;position:sticky;top:0;z-index:99}
    .controls strong{font-size:13px;color:#00d4ff;margin-right:2px}
    .controls label{display:flex;align-items:center;gap:4px;color:#cbd5e1;white-space:nowrap}
    .controls select,.controls input[type=number]{background:#334155;color:#f1f5f9;border:1px solid #475569;padding:4px 7px;border-radius:4px;font-size:11px;cursor:pointer}
    .controls input[type=number]{width:58px;text-align:center}
    .custom-row{display:none;align-items:center;gap:6px;color:#cbd5e1;font-size:11px}
    .btn-print{background:#00d4ff;color:#0f172a;border:none;padding:6px 16px;border-radius:5px;font-weight:800;font-size:12px;cursor:pointer;margin-left:auto}
    .btn-close{background:rgba(255,255,255,0.08);color:#94a3b8;border:1px solid #475569;padding:5px 10px;border-radius:5px;font-size:11px;cursor:pointer}
    .slip-wrap{display:flex;justify-content:center;align-items:flex-start;padding:20px}
    .slip{border:2.5px solid #0f172a;border-radius:8px;overflow:hidden;width:100%;max-width:700px;background:#fff;box-shadow:0 6px 30px rgba(0,0,0,0.2)}
    .slip-header{background:#0f172a;color:#00d4ff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center}
    .brand{font-size:15px;font-weight:900;letter-spacing:0.04em}
    .date-line{font-size:11px;color:rgba(0,212,255,0.7);margin-top:3px;font-family:'Courier New',monospace}
    .ref-no{font-family:'Courier New',monospace;font-size:13px;font-weight:800;background:rgba(0,212,255,0.14);padding:3px 10px;border-radius:4px;border:1px solid rgba(0,212,255,0.35)}
    .addr-row{display:grid;grid-template-columns:3fr 2fr}
    .to-cell{padding:16px 18px;border-right:2px dashed #cbd5e1;background:#fff}
    .from-cell{padding:12px 16px;background:#f8fafc}
    .lbl{font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.14em;color:#94a3b8;margin-bottom:6px}
    .to-name{font-size:22px;font-weight:900;color:#0f172a;margin-bottom:5px;line-height:1.15}
    .to-addr{font-size:12px;color:#334155;line-height:1.7}
    .to-phone{font-size:15px;font-weight:800;color:#0f172a;margin-top:5px}
    .from-name{font-size:13px;font-weight:800;color:#0f172a;margin-bottom:3px}
    .from-addr{font-size:10px;color:#64748b;line-height:1.6}
    .bar-row{padding:9px 16px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between}
    .ref-lbl{font-size:8px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:0.1em;margin-bottom:3px}
    .ref-text{font-family:'Courier New',monospace;font-size:18px;font-weight:900;letter-spacing:0.18em;color:#0f172a}
    .tags{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
    .s-tag{font-size:9px;background:#0f172a;color:#00d4ff;padding:3px 9px;border-radius:3px;font-weight:700;letter-spacing:0.08em}
    .d-tag{font-size:10px;color:#334155;font-weight:700}
    .warn{padding:6px 16px;background:#fffbeb;border-top:1px solid #fde68a;font-size:9px;color:#92400e;font-weight:600}
    .cut-line{text-align:center;font-size:9px;color:#94a3b8;margin-top:12px;border-top:1px dashed #cbd5e1;padding-top:8px}
  </style></head><body>
  <div class="controls">
    <strong> Courier Slip</strong>
    <label>Size: <select id="sz" onchange="upd()">
      <option value="A5 landscape">A5 — Medium</option>
      <option value="A4 landscape">A4 — Large</option>
      <option value="A6 portrait">A6 — Small</option>
      <option value="10cm 10cm">Square 10×10 cm</option>
      <option value="15cm 15cm">Square 15×15 cm</option>
      <option value="10cm 15cm">Postcard 10×15 cm</option>
      <option value="letter landscape">Letter — Large</option>
      <option value="custom">Custom…</option>
    </select></label>
    <div class="custom-row" id="customRow">
      W:<input type="number" id="cw" value="148" min="50" max="500">mm ×
      H:<input type="number" id="ch" value="105" min="50" max="500">mm
      <button onclick="updCustom()" style="background:#00d4ff;color:#0f172a;border:none;padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer">Apply</button>
    </div>
    <button class="btn-close" onclick="window.close()"> Close</button>
    <button type="button" class="btn-print"> Print</button>
  </div>
  <div class="slip-wrap"><div class="slip">
    <div class="slip-header">
      <div>
        <div class="brand"> ${coName}</div>
        <div class="date-line">Date: ${today}</div>
      </div>
      <div class="ref-no">${ref}</div>
    </div>
    <div class="addr-row">
      <div class="to-cell">
        <div class="lbl">TO — Recipient</div>
        <div class="to-name">${clientName}</div>
        <div class="to-addr">${clientAddr}</div>
        ${clientPhone ? `<div class="to-phone">${clientPhone}</div>` : ''}
      </div>
      <div class="from-cell">
        <div class="lbl">FROM — Sender</div>
        <div class="from-name">${coName}</div>
        <div class="from-addr">${coAddr}${coPhone ? '<br/>' + coPhone : ''}</div>
      </div>
    </div>
    <div class="bar-row">
      <div><div class="ref-lbl">Reference</div><div class="ref-text">${ref}</div></div>
      <div class="tags"><span class="s-tag">DATA RECOVERY</span><span class="d-tag">${today}</span></div>
    </div>
    <div class="warn"> FRAGILE — Handle with care. Contains electronic storage media. Do NOT expose to magnets, heat, or static.</div>
  </div></div>
  <div class="cut-line"> Cut along this line — Affix to courier package</div>
  <script>
    function upd(){
      var v=document.getElementById('sz').value;
      var cr=document.getElementById('customRow');
      if(v==='custom'){cr.style.display='flex';}
      else{cr.style.display='none';document.getElementById('pageStyle').textContent='@page{size:'+v+';margin:0}';}
    }
    function updCustom(){
      var w=document.getElementById('cw').value,h=document.getElementById('ch').value;
      document.getElementById('pageStyle').textContent='@page{size:'+w+'mm '+h+'mm;margin:0}';
    }
  </script>
  </body></html>`;
  openPrintPreviewWindow(html);
}

function StatusBadge({ status, map }) {
  const s = map[status] || { color: '#94a3b8', bg: 'rgba(100,116,139,0.1)', label: status };
  return <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: 999, color: s.color, background: s.bg, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</span>;
}

//  Invoice Print View 


//  Record Payment Modal 
//  Purchase Form Modal 
function PurchaseModal({ onClose, onDone }) {
  const [form, setForm] = useState({ vendor_name: '', description: '', case_number: '', amount: '', tax_amt: '', purchase_date: new Date().toISOString().slice(0, 10), notes: '',
    add_to_inventory: false,
    inv_stock_number: '', inv_category: 'hdd', inv_company: '',
    inv_brand: '', inv_model: '', inv_serial_number: '',
    inv_quantity: 1, inv_min_quantity: 1,
    inv_condition: 'new', inv_status: 'available',
    inv_location: '', inv_name: '', inv_notes: '' });
  const [loading, setLoading] = useState(false);
  const total = (parseFloat(form.amount) || 0) + (parseFloat(form.tax_amt) || 0);

  const handle = async () => {
    setLoading(true);
    try { await accountingApi.createPurchase(form); onDone(); onClose(); }
    catch (err) { alert(err.message); } finally { setLoading(false); }
  };

  const toggleInv = () => {
    if (form.add_to_inventory) {
      setForm({ ...form, add_to_inventory: false });
    } else {
      const autoStock = form.description?.replace(/[^a-zA-Z0-9]/g,'_').toUpperCase().slice(0,20) || `PUR-${Date.now()}`;
      setForm({ ...form, add_to_inventory: true, inv_stock_number: autoStock, inv_name: form.description });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-header"><h3 className="modal-title">+ New Purchase</h3><button className="btn btn-ghost btn-icon" onClick={onClose}></button></div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Vendor / Supplier</label><input className="form-input" value={form.vendor_name} onChange={e => setForm({...form, vendor_name: e.target.value})} placeholder="e.g. TechParts India" /></div>
            <div className="form-group"><label className="form-label required">Date</label><input type="date" className="form-input" value={form.purchase_date} onChange={e => setForm({...form, purchase_date: e.target.value})} /></div>
          </div>
          <div className="form-group"><label className="form-label required">Description</label><input className="form-input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="e.g. Donor drive Seagate 1TB" /></div>
          <div className="form-group"><label className="form-label">Case Number (optional)</label><input className="form-input" value={form.case_number} onChange={e => setForm({...form, case_number: e.target.value})} placeholder="DR-2026-XXXXX" /></div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Amount (₹)</label><input type="number" className="form-input" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Tax / GST (₹)</label><input type="number" className="form-input" value={form.tax_amt} onChange={e => setForm({...form, tax_amt: e.target.value})} /></div>
          </div>
          <div style={{ background:'var(--bg-elevated)',borderRadius:'var(--radius-md)',padding:'10px 14px',marginBottom:16,display:'flex',justifyContent:'space-between' }}>
            <span className="text-xs text-muted">Total</span><span className="font-mono" style={{ fontWeight:800,color:'var(--accent-primary)' }}>{fmt(total)}</span>
          </div>
          <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" style={{ minHeight:50 }} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>

          {/* Toggle: Add to Inventory */}
          <label style={{ display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginTop:12,padding:'8px 0',borderTop:'1px solid var(--border-subtle)' }}>
            <input type="checkbox" checked={form.add_to_inventory} onChange={toggleInv} />
            <span style={{ fontWeight:600,fontSize:'0.85rem' }}>📦 Also add as Inventory item</span>
          </label>

          {form.add_to_inventory && (
            <div style={{ marginTop:8,padding:12,background:'var(--bg-elevated)',borderRadius:'var(--radius-md)' }}>
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label required">Category</label>
                  <select className="form-select" value={form.inv_category} onChange={e => setForm({...form, inv_category: e.target.value})}>
                    <option value="hdd">HDD</option>
                    <option value="ssd">SSD</option>
                    <option value="pcb">PCB</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label required">Stock Number</label><input className="form-input" value={form.inv_stock_number} onChange={e => setForm({...form, inv_stock_number: e.target.value})} placeholder="Unique stock ID" /></div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">Company / Manufacturer</label>
                  <select className="form-select" value={form.inv_company} onChange={e => setForm({...form, inv_company: e.target.value, inv_brand: e.target.value !== 'Other' ? e.target.value : form.inv_brand})}>
                    <option value="">Select Company…</option>
                    {['Western Digital','Seagate','Toshiba','Samsung','Hitachi','Other'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">{form.inv_company === 'Other' ? 'Custom Brand Name' : 'Brand'}</label>
                  {form.inv_company === 'Other'
                    ? <input className="form-input" value={form.inv_brand} onChange={e => setForm({...form, inv_brand: e.target.value})} placeholder="Enter brand name" />
                    : <input className="form-input" value={form.inv_brand || form.inv_company} readOnly />}
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">Model / Part No.</label><input className="form-input" value={form.inv_model} onChange={e => setForm({...form, inv_model: e.target.value})} placeholder="e.g. WD10EZEX" /></div>
                <div className="form-group"><label className="form-label">Serial Number</label><input className="form-input" value={form.inv_serial_number} onChange={e => setForm({...form, inv_serial_number: e.target.value})} placeholder="Enter serial number" /></div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">Condition</label>
                  <select className="form-select" value={form.inv_condition} onChange={e => setForm({...form, inv_condition: e.target.value})}>
                    <option value="new">New (Unused)</option>
                    <option value="used">Used / Working</option>
                    <option value="refurb">Refurbished</option>
                    <option value="for_parts">For Parts / Faulty</option>
                    <option value="untested">Untested</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Status</label>
                  <select className="form-select" value={form.inv_status} onChange={e => setForm({...form, inv_status: e.target.value})}>
                    <option value="available">Available</option>
                    <option value="reserved">Reserved</option>
                    <option value="used">Used / Consumed</option>
                    <option value="damaged">Damaged</option>
                    <option value="donated">Donated to Case</option>
                  </select>
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">Quantity</label><input type="number" className="form-input" value={form.inv_quantity} onChange={e => setForm({...form, inv_quantity: e.target.value})} min="1" /></div>
                <div className="form-group"><label className="form-label">Min Stock Alert</label><input type="number" className="form-input" value={form.inv_min_quantity} onChange={e => setForm({...form, inv_min_quantity: e.target.value})} min="1" placeholder="Reorder threshold" /></div>
              </div>
              <div className="form-group"><label className="form-label">Shelf Location</label><input className="form-input" value={form.inv_location} onChange={e => setForm({...form, inv_location: e.target.value})} placeholder="e.g. Cabinet A, Row 3" /></div>
              <div className="form-group"><label className="form-label">Notes / Problem</label><textarea className="form-textarea" style={{ minHeight:50 }} value={form.inv_notes} onChange={e => setForm({...form, inv_notes: e.target.value})} placeholder="Any additional notes" /></div>
            </div>
          )}
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={loading || !form.vendor_name || !form.description || !form.amount || (form.add_to_inventory && !form.inv_stock_number)} onClick={handle}>{loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : '+ Add Purchase'}</button></div>
      </div>
    </div>
  );
}

//  Expense Form Modal 
function ExpenseModal({ onClose, onDone, edit }) {
  const [form, setForm] = useState(edit || { date: new Date().toISOString().slice(0, 10), category: 'consumables', description: '', vendor: '', amount: '', tax_amt: '', receipt_note: '', case_number: '' });
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    setLoading(true);
    try {
      if (edit?.id) { await accountingApi.updateExpense(edit.id, form); }
      else { await accountingApi.createExpense(form); }
      onDone(); onClose();
    } catch (err) { alert(err.message); } finally { setLoading(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3 className="modal-title">{edit?.id ? '✏️ Edit Expense' : '+ Record Expense'}</h3><button className="btn btn-ghost btn-icon" onClick={onClose}></button></div>
        <div className="modal-body">
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Date</label><input type="date" className="form-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Category</label>
              <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {EXP_CATS.map(c => <option key={c} value={c}>{c.replace('_', ' ').toUpperCase()}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group"><label className="form-label required">Description</label><input className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Vendor / Supplier</label><input className="form-input" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} /></div>
            <div className="form-group"><label className="form-label required">Amount (₹, excl. tax)</label><input type="number" className="form-input" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Tax / GST (₹)</label><input type="number" className="form-input" value={form.tax_amt} onChange={e => setForm({ ...form, tax_amt: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Total</label><input className="form-input" readOnly value={form.amount || form.tax_amt ? fmt((parseFloat(form.amount) || 0) + (parseFloat(form.tax_amt) || 0)) : ''} style={{ color: 'var(--accent-primary)', fontWeight: 700 }} /></div>
          </div>
          <div className="form-group"><label className="form-label">Case Number (optional)</label><input className="form-input" value={form.case_number} onChange={e => setForm({ ...form, case_number: e.target.value })} placeholder="DR-2026-XXXXX" /></div>
          <div className="form-group"><label className="form-label">Receipt Note</label><input className="form-input" value={form.receipt_note} onChange={e => setForm({ ...form, receipt_note: e.target.value })} /></div>
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={loading || !form.description || !form.amount} onClick={handle}>{loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : edit?.id ? 'Update' : '+ Add Expense'}</button></div>
      </div>
    </div>
  );
}

//  Main Accounting Page 
export default function AccountingPage() {
  const { canAccess } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const dailyRevenue = (() => {
    const days = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - idx));
      const dateKey = d.toISOString().slice(0, 10);
      return { date: dateKey, label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), amount: 0 };
    });
    const map = Object.fromEntries(days.map(d => [d.date, d]));
    invoices.forEach(inv => {
      if (!inv || inv.status !== 'paid') return;
      const paidDate = inv.paid_at || inv.updated_at;
      const dayKey = paidDate ? paidDate.slice(0, 10) : null;
      if (!dayKey || !map[dayKey]) return;
      map[dayKey].amount += parseFloat(inv.amount_paid || inv.total || 0) || 0;
    });
    return days;
  })();

  const getSummaryNumber = (...keys) => {
    for (const key of keys) {
      if (summary?.[key] != null && summary[key] !== '') {
        const parsed = parseFloat(summary[key]);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
    return 0;
  };

  const totalRevenueValue = getSummaryNumber(
    'case_total_paid',
    'caseTotalPaid',
    'totalRevenue',
    'total_revenue',
    'revenue',
    'total_collected',
    'accounting_total_collected',
    'total_invoiced',
    'totalInvoiced'
  );
  const totalExpensesValue = getSummaryNumber('total_expenses', 'totalExpenses', 'expenses', 'total_expenses', 'case_total_expenses');
  const casePendingValue = getSummaryNumber('pendingRevenue', 'pending_revenue', 'case_total_pending', 'caseTotalPending');
  const overdueValue = getSummaryNumber('case_total_pending_overdue', 'overdueRevenue', 'overdue_revenue');
  const monthlyRevenueValue = getSummaryNumber('revenue_month', 'revenueMonth');
  const netRevenueValue = totalRevenueValue - totalExpensesValue;
  const profitMarginPercent = totalRevenueValue > 0 ? (netRevenueValue / totalRevenueValue) * 100 : 0;
  // Modals
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [pdfInvoice, setPdfInvoice] = useState(null);

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editExpense, setEditExpense] = useState(null);
  const [recycleBin, setRecycleBin] = useState({ expenses: [], purchases: [], invoices: [] });
  const [showRecycleBin, setShowRecycleBin] = useState(false);

  const loadRecycleBin = useCallback(async (type) => {
    try {
      if (type === 'expenses' || !type) {
        const r = await accountingApi.listExpensesRecycleBin();
        setRecycleBin(prev => ({ ...prev, expenses: r.expenses || [] }));
      }
      if (type === 'purchases' || !type) {
        const r = await accountingApi.listPurchasesRecycleBin();
        setRecycleBin(prev => ({ ...prev, purchases: r.purchases || [] }));
      }
      if (type === 'invoices' || !type) {
        const r = await accountingApi.listInvoicesRecycleBin();
        setRecycleBin(prev => ({ ...prev, invoices: r.invoices || [] }));
      }
    } catch (e) { console.error('Recycle bin load error:', e); }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, inv, exp] = await Promise.all([
        accountingApi.summary(),
        accountingApi.listPurchases({ search }),
        accountingApi.listInvoices({ search, status: statusFilter }),
        accountingApi.listExpenses({ search }),
      ]);
      setSummary(s); setPurchases(p.purchases || []); setInvoices(inv.invoices || []); setExpenses(exp.expenses || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { load(); loadRecycleBin(); }, [load, loadRecycleBin]);

  const TABS = [
    { key: 'overview', label: ' Overview' },
    { key: 'purchases', label: ` Purchases (${purchases.length})` },
    { key: 'invoices', label: ` Invoices (${invoices.length})` },
    { key: 'expenses', label: ` Expenses (${expenses.length})` },
  ];

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Accounting</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Purchases, Invoices, Payments & Expenses</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {canAccess('junior_engineer') && activeTab === 'purchases' && <button className="btn btn-primary" onClick={() => setShowPurchaseForm(true)}>+ New Purchase</button>}
            {canAccess('junior_engineer') && activeTab === 'expenses' && <button className="btn btn-primary" onClick={() => setShowExpenseForm(true)}>+ Record Expense</button>}
          </div>
          {['purchases', 'invoices', 'expenses'].includes(activeTab) && (() => {
            const count = recycleBin[activeTab]?.length || 0;
            return (
              <button
                onClick={() => { setShowRecycleBin(true); loadRecycleBin(activeTab); }}
                title="Recycle Bin — View deleted items"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: count > 0 ? '#ef4444' : 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
              >
                <IconTrash />
                Recycle Bin{count > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 99, padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700, marginLeft: 2 }}>{count}</span>}
              </button>
            );
          })()}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 24 }}>
        {TABS.map(t => <button key={t.key} className={`tab-btn ${activeTab === t.key ? 'active' : ''}`} onClick={() => { setActiveTab(t.key); setSearch(''); setStatusFilter(''); loadRecycleBin(t.key !== 'overview' ? t.key : undefined); }}>{t.label}</button>)}
      </div>

      {/*  OVERVIEW  */}
      {activeTab === 'overview' && summary && (
        <div>
           {/* KPI Cards */}
           <div className="stats-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(5, minmax(180px, 1fr))', overflowX: 'auto' }}>
             {[
               { icon: <IconTrendingUp />, label: `${new Date().toLocaleString('en-US', { month: 'long' })} Revenue`, value: fmt(monthlyRevenueValue), color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
               { icon: <IconWallet />, label: 'Total Revenue (Net)', value: `${fmt(netRevenueValue)} (${profitMarginPercent >= 0 ? '+' : ''}${profitMarginPercent.toFixed(1)}%)`, color: netRevenueValue >= 0 ? 'var(--status-success)' : 'var(--status-danger)', bg: netRevenueValue >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' },
               { icon: <IconClock />, label: 'Pending Amount', value: fmt(casePendingValue), color: 'var(--status-warning)', bg: 'rgba(245,158,11,0.1)' },
               { icon: <IconAlert />, label: 'Overdue (30+ days)', value: fmt(overdueValue), color: 'var(--status-danger)', bg: 'rgba(239,68,68,0.1)' },
               { icon: <IconCreditCard />, label: 'Total Expenses', value: fmt(totalExpensesValue), color: '#f472b6', bg: 'rgba(236,72,153,0.1)' },
             ].map(stat => (
              <div key={stat.label} className="stat-card" style={{ '--stat-color': stat.color, '--stat-bg': stat.bg }}>
                <div className="stat-icon">{stat.icon}</div>
                <div className="stat-value" style={{ fontSize: '1.4rem' }}>{stat.value}</div>
                <div className="stat-label">{stat.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Invoice Status */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}> Invoice Status</div>
              {Object.entries(summary.invoiceCounts || {}).map(([s, count]) => {
                const info = I_STATUS[s] || { color: '#94a3b8', label: s };
                return (
                  <div key={s} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <StatusBadge status={s} map={I_STATUS} />
                    <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: info.color }}>{count}</span>
                  </div>
                );
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                <span>Quote Conversion Rate</span>
                <span style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>{summary.conversionRate}%</span>
              </div>
            </div>

            {/* Expenses Breakdown */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}> Expense Breakdown</div>
              {Object.entries(summary.expenseByCategory || {}).map(([cat, amt]) => {
                const acctOnlyTotal = Object.values(summary.expenseByCategory || {}).reduce((s, v) => s + v, 0);
                const pct = acctOnlyTotal ? Math.round((amt / acctOnlyTotal) * 100) : 0;
                return (
                  <div key={cat} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{cat.replace('_', ' ')}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{fmt(amt)}</span>
                    </div>
                    <div className="progress-bar" style={{ height: 5 }}><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}> Last 6 Months — Revenue vs Expenses</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 160, padding: '0 8px' }}>
                {(summary.monthlyRevenue || []).map(m => {
                  const maxVal = Math.max(...summary.monthlyRevenue.map(x => Math.max(x.revenue, x.expenses)), 1);
                  const revH = Math.round((m.revenue / maxVal) * 140);
                  const expH = Math.round((m.expenses / maxVal) * 140);
                  return (
                    <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140 }}>
                        <div title={`Revenue: ${fmt(m.revenue)}`} style={{ width: 14, height: revH || 2, background: 'var(--status-success)', borderRadius: '3px 3px 0 0', transition: 'height 0.5s', opacity: 0.85 }} />
                        <div title={`Expenses: ${fmt(m.expenses)}`} style={{ width: 14, height: expH || 2, background: '#f472b6', borderRadius: '3px 3px 0 0', transition: 'height 0.5s', opacity: 0.85 }} />
                      </div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{m.month.slice(5)}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: 'var(--status-success)', borderRadius: 2, display: 'inline-block' }} /> Revenue</span>
                <span style={{ fontSize: '0.7rem', color: '#f472b6', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: '#f472b6', borderRadius: 2, display: 'inline-block' }} /> Expenses</span>
              </div>
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}> Last 7 Days — Revenue per Day</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, padding: '0 8px' }}>
                {dailyRevenue.map(day => {
                  const maxVal = Math.max(...dailyRevenue.map(x => x.amount), 1);
                  const barH = Math.round((day.amount / maxVal) * 140);
                  return (
                    <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div title={`${fmt(day.amount)} on ${day.label}`} style={{ width: 12, height: barH || 2, background: 'var(--status-success)', borderRadius: '3px 3px 0 0', transition: 'height 0.5s', opacity: 0.9 }} />
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{day.label.slice(0, 2)}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                <span>Total</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmt(dailyRevenue.reduce((sum, d) => sum + d.amount, 0))}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/*  PURCHASES  */}
      {activeTab === 'purchases' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div className="search-bar"><span className="search-icon"></span><input className="search-input" placeholder="Search purchases…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Purchase #</th><th>Vendor</th><th>Description</th><th>Case</th><th>Amount</th><th>Date</th><th></th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={7}><div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div></td></tr>
                  : purchases.length === 0 ? <tr><td colSpan={7}><div className="empty-state"><div className="empty-icon"></div><div className="empty-title">No purchases recorded</div></div></td></tr>
                    : purchases.map(p => (
                      <tr key={p.id}>
                        <td><span className="font-mono text-xs" style={{ color: 'var(--accent-primary)' }}>{p.purchase_number}</span></td>
                        <td><div style={{ fontWeight: 600 }}>{p.vendor_name}</div></td>
                        <td style={{ maxWidth: 250 }}><div style={{ fontSize: '0.82rem' }}>{p.description}</div></td>
                        <td className="text-xs font-mono text-muted">{p.case_number || '—'}</td>
                        <td><span className="font-mono" style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(p.total)}</span></td>
                        <td className="text-xs text-muted">{fmtDate(p.purchase_date)}</td>
                        <td>{canAccess('admin') && (
                          <button title="Move to Recycle Bin" style={iconBtnStyle('danger')} onClick={async () => { if (confirm('Move this purchase to recycle bin? The linked expense will also be moved.')) { await accountingApi.deletePurchase(p.id); load(); loadRecycleBin('purchases'); } }}>
                            <IconTrash />
                          </button>
                        )}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {purchases.length > 0 && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
                <span className="text-xs text-muted">Total Purchases: <strong style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>{fmt(purchases.reduce((s, p) => s + parseFloat(p.total || 0), 0))}</strong></span>
              </div>
            )}
          </div>
        </div>
      )}

      {/*  INVOICES  */}
      {activeTab === 'invoices' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="search-bar"><span className="search-icon"></span><input className="search-input" placeholder="Search invoices…" value={search} onChange={e => setSearch(e.target.value)} /></div>
            <select className="form-select" style={{ width: 'auto', fontSize: '0.8rem' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {Object.keys(I_STATUS).map(s => <option key={s} value={s}>{I_STATUS[s].label}</option>)}
            </select>
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Invoice #</th><th>Invoice Date</th><th>Client</th><th>Title</th><th>Total</th><th>Due Date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={8}><div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div></td></tr>
                  : invoices.length === 0 ? <tr><td colSpan={8}><div className="empty-state"><div className="empty-icon"></div><div className="empty-title">No invoices found</div></div></td></tr>
                    : invoices.map(inv => (
                      <tr key={inv.id}>
                        <td><span className="font-mono text-xs" style={{ color: 'var(--accent-primary)' }}>{inv.invoice_number}</span></td>
                        <td><span className="text-xs text-muted">{fmtDate(inv.invoice_date || inv.created_at)}</span></td>
                        <td><div style={{ fontWeight: 600 }}>{inv.client_name}</div>{inv.company && <div className="text-xs text-muted">{inv.company}</div>}</td>
                        <td style={{ maxWidth: 200 }}><div style={{ fontSize: '0.82rem' }}>{inv.title}</div>{inv.case_number && <div className="text-xs text-muted font-mono">{inv.case_number}</div>}</td>
                        <td><span className="font-mono" style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(inv.total)}</span></td>
                        <td><span className={`text-xs ${inv.status === 'overdue' ? '' : 'text-muted'}`} style={inv.status === 'overdue' ? { color: 'var(--status-danger)', fontWeight: 700 } : {}}>{fmtDate(inv.due_date)}</span></td>
                        <td><StatusBadge status={inv.status} map={I_STATUS} /></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => { const doc = generateInvoicePDF(inv); setPdfInvoice({ doc, invoice: inv }); }}>⬇ PDF</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => printCourierSlip(inv)}>📦 Courier</button>
                            {inv.status !== 'paid' && (
                              <button title="Move to Recycle Bin" style={iconBtnStyle('danger')} onClick={async () => { if (confirm('Move invoice to recycle bin?')) { await accountingApi.deleteInvoice(inv.id); load(); loadRecycleBin('invoices'); } }}>
                                <IconTrash />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/*  EXPENSES  */}
      {activeTab === 'expenses' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div className="search-bar"><span className="search-icon"></span><input className="search-input" placeholder="Search expenses…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Vendor</th><th>Case</th><th>Amount</th><th>Tax</th><th>Total</th><th></th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={9}><div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div></td></tr>
                  : expenses.length === 0 ? <tr><td colSpan={9}><div className="empty-state"><div className="empty-icon"></div><div className="empty-title">No expenses recorded</div></div></td></tr>
                    : expenses.map(exp => (
                      <tr key={exp.id}>
                        <td className="text-xs font-mono">{fmtDate(exp.date)}</td>
                        <td><span style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: 999, background: 'rgba(124,58,237,0.1)', color: '#a78bfa', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{exp.category?.replace('_', ' ')}</span></td>
                        <td><div style={{ fontWeight: 500 }}>{exp.description}</div>{exp.receipt_note && <div className="text-xs text-muted">{exp.receipt_note}</div>}</td>
                        <td className="text-xs text-muted">{exp.vendor || '—'}</td>
                        <td className="text-xs font-mono">{exp.case_number || '—'}</td>
                        <td className="font-mono text-xs">{fmt(exp.amount)}</td>
                        <td className="font-mono text-xs text-muted">{exp.tax_amt > 0 ? fmt(exp.tax_amt) : '—'}</td>
                        <td><span className="font-mono" style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(exp.total)}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {canAccess('staff') && (
                              <button title="Edit" style={iconBtnStyle('ghost')} onClick={() => { setEditExpense(exp); setShowExpenseForm(true); }}>
                                <IconEdit />
                              </button>
                            )}
                            {canAccess('admin') && (
                              <button title="Move to Recycle Bin" style={iconBtnStyle('danger')} onClick={async () => { if (confirm('Move expense to recycle bin?')) { await accountingApi.deleteExpense(exp.id); load(); loadRecycleBin('expenses'); } }}>
                                <IconTrash />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {expenses.length > 0 && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
                <span className="text-xs text-muted">Total Expenses: <strong style={{ color: '#f472b6', fontFamily: 'var(--font-mono)' }}>{fmt(expenses.reduce((s, e) => s + parseFloat(e.total || 0), 0))}</strong></span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showPurchaseForm && <PurchaseModal onClose={() => setShowPurchaseForm(false)} onDone={load} />}
      {pdfInvoice && (
        <div className="modal-overlay" onClick={() => setPdfInvoice(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title"> Invoice — {pdfInvoice.invoice.invoice_number}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setPdfInvoice(null)}></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '24px 32px' }}>
              <button className="btn btn-primary" style={{ width: '100%', padding: '12px 0', fontSize: '0.95rem' }} onClick={() => { savePDF(pdfInvoice.doc, pdfInvoice.invoice.invoice_number); setPdfInvoice(null); }}>
                ⬇ Download PDF
              </button>
              <button className="btn btn-secondary" style={{ width: '100%', padding: '12px 0', fontSize: '0.95rem' }} onClick={() => { openPDFPreview(pdfInvoice.doc); setPdfInvoice(null); }}>
                🖨 Print
              </button>
            </div>
          </div>
        </div>
      )}
      {showExpenseForm && <ExpenseModal edit={editExpense} onClose={() => { setShowExpenseForm(false); setEditExpense(null); }} onDone={load} />}

      {/* Recycle Bin Modal */}
      {showRecycleBin && (
        <div className="modal-overlay" onClick={() => setShowRecycleBin(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 780 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconTrash />
                <h3 className="modal-title">Recycle Bin — {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
                {recycleBin[activeTab]?.length > 0 && (
                  <span style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', borderRadius: 99, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                    {recycleBin[activeTab].length} item{recycleBin[activeTab].length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowRecycleBin(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              {!recycleBin[activeTab]?.length ? (
                <div className="empty-state" style={{ padding: 48 }}>
                  <div className="empty-icon">🗑️</div>
                  <div className="empty-title">Recycle Bin is Empty</div>
                  <div className="empty-desc">No deleted {activeTab} found</div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem' }}>Description / #</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem' }}>Vendor / Client</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem' }}>Amount</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem' }}>Deleted On</th>
                      <th style={{ padding: '10px 16px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem' }}>Restore</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recycleBin[activeTab].map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {item.description || item.title || '—'}
                          </div>
                          {(item.purchase_number || item.invoice_number) && (
                            <div className="text-xs text-muted font-mono">{item.purchase_number || item.invoice_number}</div>
                          )}
                          {item.category && (
                            <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 3, background: 'rgba(124,58,237,0.1)', color: '#a78bfa', marginTop: 2, display: 'inline-block' }}>{item.category}</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                          {item.vendor_name || item.vendor || item.client_name || '—'}
                          {item.status && <div style={{ marginTop: 2 }}><StatusBadge status={item.status} map={I_STATUS} /></div>}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {fmt(item.total || item.amount || 0)}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {fmtDate(item.deleted_at)}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                            onClick={async () => {
                              try {
                                if (activeTab === 'expenses') await accountingApi.restoreExpense(item.id);
                                else if (activeTab === 'purchases') await accountingApi.restorePurchase(item.id);
                                else if (activeTab === 'invoices') await accountingApi.restoreInvoice(item.id);
                                load(); loadRecycleBin(activeTab);
                              } catch (err) { alert(err.message); }
                            }}
                          >
                            <IconRestore /> Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
