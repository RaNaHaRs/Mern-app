import React, { useState, useEffect, useCallback } from 'react';
import { accountingApi } from '../services/api';
import { useAuth } from '../store/AuthContext';
import { openPrintPreviewWindow } from '../utils/printPreview';

const fmt = (n) => `₹${parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Q_STATUS = { draft: { color: '#94a3b8', bg: 'rgba(100,116,139,0.12)', label: 'Draft' }, sent: { color: '#60a5fa', bg: 'rgba(59,130,246,0.12)', label: 'Sent' }, accepted: { color: '#34d399', bg: 'rgba(16,185,129,0.15)', label: 'Accepted' }, rejected: { color: '#f87171', bg: 'rgba(239,68,68,0.12)', label: 'Rejected' }, invoiced: { color: '#a78bfa', bg: 'rgba(124,58,237,0.12)', label: 'Invoiced' } };
const I_STATUS = { unpaid: { color: '#fbbf24', bg: 'rgba(245,158,11,0.12)', label: 'Unpaid' }, paid: { color: '#34d399', bg: 'rgba(16,185,129,0.15)', label: 'Paid' }, overdue: { color: '#f87171', bg: 'rgba(239,68,68,0.15)', label: 'Overdue' }, partial: { color: '#00d4ff', bg: 'rgba(0,212,255,0.12)', label: 'Partial' }, cancelled: { color: '#94a3b8', bg: 'rgba(100,116,139,0.1)', label: 'Cancelled' } };
const EXP_CATS = ['equipment', 'consumables', 'donor_drives', 'rent', 'utilities', 'salaries', 'marketing', 'other'];
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
    <strong>📦 Courier Slip</strong>
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
    <button class="btn-close" onclick="window.close()">✕ Close</button>
    <button type="button" class="btn-print">🖨 Print</button>
  </div>
  <div class="slip-wrap"><div class="slip">
    <div class="slip-header">
      <div>
        <div class="brand">📦 ${coName}</div>
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
    <div class="warn">⚠ FRAGILE — Handle with care. Contains electronic storage media. Do NOT expose to magnets, heat, or static.</div>
  </div></div>
  <div class="cut-line">✂ Cut along this line — Affix to courier package</div>
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

// ── Line Items Editor ───────────────────────────────────────────
function LineItemsEditor({ items, onChange }) {
  const add = () => onChange([...items, { description: '', qty: 1, unit_price: 0 }]);
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  const update = (i, field, val) => { const n = [...items]; n[i] = { ...n[i], [field]: val }; onChange(n); };
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 100px 30px', gap: 6, marginBottom: 6 }}>
        <span className="form-label" style={{ marginBottom: 0 }}>Description</span>
        <span className="form-label" style={{ marginBottom: 0 }}>Qty</span>
        <span className="form-label" style={{ marginBottom: 0 }}>Unit Price</span>
        <span />
      </div>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 100px 30px', gap: 6, marginBottom: 6 }}>
          <input className="form-input" style={{ padding: '7px 10px' }} value={it.description} onChange={e => update(i, 'description', e.target.value)} placeholder="Service / item description" />
          <input className="form-input" style={{ padding: '7px 8px' }} type="number" min="1" value={it.qty} onChange={e => update(i, 'qty', parseFloat(e.target.value) || 1)} />
          <input className="form-input" style={{ padding: '7px 8px' }} type="number" min="0" value={it.unit_price} onChange={e => update(i, 'unit_price', parseFloat(e.target.value) || 0)} />
          <button onClick={() => remove(i)} style={{ background: 'rgba(239,68,68,0.15)', border: 'none', borderRadius: 6, color: '#f87171', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
        </div>
      ))}
      <button className="btn btn-secondary btn-sm" onClick={add} style={{ marginTop: 4 }}>+ Add Line</button>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, fontSize: '0.8rem' }}>
        {(() => {
          const sub = items.reduce((s, l) => s + (l.qty || 1) * (l.unit_price || 0), 0);
          return <span className="text-muted">Subtotal: <strong style={{ color: 'var(--text-primary)' }}>{fmt(sub)}</strong></span>;
        })()}
      </div>
    </div>
  );
}

// ── Invoice Print View ──────────────────────────────────────────
function InvoicePrintModal({ invoice, onClose }) {
  const handlePrint = () => window.print();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" onClick={e => e.stopPropagation()} style={{ maxWidth: 860 }}>
        <div className="modal-header">
          <h3 className="modal-title">🖨 Invoice — {invoice.invoice_number}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handlePrint}>🖨 Print / Save PDF</button>
            <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="modal-body" id="print-invoice" style={{ background: '#fff', color: '#111', borderRadius: 8, padding: 40, fontFamily: 'Inter, sans-serif' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, borderBottom: '2px solid #00d4ff', paddingBottom: 20 }}>
            <div>
              {(() => {
                const co = (() => { try { return JSON.parse(localStorage.getItem('crm_company')) || {}; } catch { return {}; }})();
                return (
                  <>
                    {co.logo_data ? <img src={co.logo_data} alt="logo" style={{ maxHeight: 50, marginBottom: 4 }} /> : null}
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0d1117', letterSpacing: '-0.03em' }}>{co.name || 'RecoverLab'}</div>
                    {co.tagline && <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: 2 }}>{co.tagline}</div>}
                    {co.address && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>{co.address}</div>}
                    {co.phone && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{co.phone} {co.email ? '| ' + co.email : ''}</div>}
                    {co.gstin && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4, fontWeight: 700 }}>GSTIN: {co.gstin}</div>}
                  </>
                );
              })()}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#00d4ff' }}>INVOICE</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0d1117', marginTop: 4 }}>{invoice.invoice_number}</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>Date: {fmtDate(invoice.created_at)}</div>
              <div style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 2 }}>Due: {fmtDate(invoice.due_date)}</div>
            </div>
          </div>
          {/* Client */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Bill To</div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0d1117' }}>{invoice.client_name}</div>
            {invoice.company && <div style={{ color: '#475569', fontSize: '0.8rem' }}>{invoice.company}</div>}
            {invoice.client_address && <div style={{ color: '#64748b', fontSize: '0.78rem' }}>{invoice.client_address}</div>}
            {invoice.client_gstin && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>GSTIN: {invoice.client_gstin}</div>}
            {invoice.case_number && <div style={{ fontSize: '0.72rem', color: '#00d4ff', marginTop: 4 }}>Ref: {invoice.case_number}</div>}
          </div>
          {/* Line items */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Description</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', width: 60 }}>Qty</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', width: 120 }}>Unit Price</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', width: 120 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.line_items.map((l, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', fontSize: '0.82rem', color: '#1e293b' }}>{l.description}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.82rem', color: '#475569' }}>{l.qty}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.82rem', color: '#475569' }}>₹{parseFloat(l.unit_price).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.82rem', fontWeight: 600, color: '#1e293b' }}>₹{((l.qty||1)*(l.unit_price||0)).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 280 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.82rem', color: '#475569' }}>
                <span>Subtotal</span><span>₹{parseFloat(invoice.subtotal||0).toLocaleString('en-IN')}</span>
              </div>
              {invoice.discount_amt > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.82rem', color: '#10b981' }}>
                  <span>Discount</span><span>—₹{parseFloat(invoice.discount_amt).toLocaleString('en-IN')}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.82rem', color: '#475569' }}>
                <span>GST ({invoice.tax_pct}%)</span><span>₹{parseFloat(invoice.tax_amt||0).toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#0d1117', borderRadius: 8, marginTop: 6 }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>Total</span>
                <span style={{ fontSize: '1rem', fontWeight: 900, color: '#00d4ff' }}>₹{parseFloat(invoice.total||0).toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
          {invoice.notes && <div style={{ marginTop: 24, padding: '10px 14px', background: '#f8fafc', borderRadius: 6, fontSize: '0.78rem', color: '#64748b' }}>{invoice.notes}</div>}
          <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #e2e8f0', fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center' }}>Thank you for choosing RecoverLab — Your Data, Recovered.</div>
        </div>
      </div>
      <style>{`@media print { body * { visibility: hidden; } #print-invoice, #print-invoice * { visibility: visible; } #print-invoice { position: fixed; inset: 0; } }`}</style>
    </div>
  );
}

// ── Record Payment Modal ────────────────────────────────────────
function RecordPaymentModal({ invoice, onClose, onDone }) {
  const [form, setForm] = useState({ amount: invoice.total - (invoice.amount_paid || 0), method: 'UPI', reference: '', note: '' });
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    setLoading(true);
    try { await accountingApi.recordPayment(invoice.id, form); onDone(); onClose(); }
    catch (err) { alert(err.message); } finally { setLoading(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3 className="modal-title">💳 Record Payment — {invoice.invoice_number}</h3><button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <span className="text-xs text-muted">Invoice Total</span><span className="font-mono" style={{ fontWeight: 800, color: 'var(--accent-primary)' }}>{fmt(invoice.total)}</span>
          </div>
          <div className="form-group"><label className="form-label required">Amount (₹)</label><input type="number" className="form-input" value={form.amount} onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) })} /></div>
          <div className="form-group">
            <label className="form-label">Discount Amount (₹)</label>
            <input type="number" className="form-input" min="0" step="0.01"
              value={form?.discount || ''}
              onChange={e => setForm(f => ({ ...f, discount: e.target.value }))}
              placeholder="0.00" />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Payment Method</label>
              <select className="form-select" value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
                {PAY_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Reference / Transaction ID</label><input className="form-input" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="UPI ref, cheque no..." /></div>
          </div>
          <div className="form-group"><label className="form-label">Note</label><input className="form-input" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></div>
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={loading || !form.amount} onClick={handle}>{loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Recording…</> : '✓ Record Payment'}</button></div>
      </div>
    </div>
  );
}

// ── Quote / Invoice Form Modal ──────────────────────────────────
function QuoteFormModal({ existing, onClose, onDone }) {
  const isEdit = !!existing;
  const [form, setForm] = useState(existing ? { ...existing } : { title: '', client_name: '', company: '', case_number: '', line_items: [{ description: '', qty: 1, unit_price: 0 }], discount_pct: 0, tax_pct: 18, valid_until: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const subtotal = form.line_items.reduce((s, l) => s + (l.qty || 1) * (l.unit_price || 0), 0);
  const discountAmt = Math.round(subtotal * (form.discount_pct || 0) / 100);
  const taxAmt = Math.round((subtotal - discountAmt) * (form.tax_pct || 18) / 100);
  const total = subtotal - discountAmt + taxAmt;

  const handle = async () => {
    setLoading(true);
    try {
      if (isEdit) await accountingApi.updateQuote(existing.id, form);
      else await accountingApi.createQuote(form);
      onDone(); onClose();
    } catch (err) { alert(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3 className="modal-title">{isEdit ? '✏️ Edit Quote' : '+ New Quote / Estimate'}</h3><button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Quote Title</label><input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. HDD Recovery — WD Blue" /></div>
            <div className="form-group"><label className="form-label">Case Number</label><input className="form-input" value={form.case_number || ''} onChange={e => setForm({ ...form, case_number: e.target.value })} placeholder="DR-2026-XXXXX" /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Client Name</label><input className="form-input" value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Company</label><input className="form-input" value={form.company || ''} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
          </div>
          <div className="form-group">
            <label className="form-label">Line Items</label>
            <LineItemsEditor items={form.line_items} onChange={li => setForm({ ...form, line_items: li })} />
          </div>
          <div className="form-row form-row-3">
            <div className="form-group"><label className="form-label">Discount (%)</label><input type="number" className="form-input" min="0" max="100" value={form.discount_pct} onChange={e => setForm({ ...form, discount_pct: parseFloat(e.target.value) || 0 })} /></div>
            <div className="form-group"><label className="form-label">GST (%)</label><input type="number" className="form-input" min="0" value={form.tax_pct} onChange={e => setForm({ ...form, tax_pct: parseFloat(e.target.value) || 18 })} /></div>
            <div className="form-group"><label className="form-label">Valid Until</label><input type="date" className="form-input" value={form.valid_until || ''} onChange={e => setForm({ ...form, valid_until: e.target.value })} /></div>
          </div>
          <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" style={{ minHeight: 60 }} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          {/* Totals preview */}
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: '14px 18px', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
              {discountAmt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--status-success)' }}><span>Discount ({form.discount_pct}%)</span><span>—{fmt(discountAmt)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}><span>GST ({form.tax_pct}%)</span><span>{fmt(taxAmt)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 800, color: 'var(--accent-primary)', marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--border-default)' }}><span>Total</span><span>{fmt(total)}</span></div>
            </div>
          </div>
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={loading || !form.title || !form.client_name} onClick={handle}>{loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : isEdit ? '✓ Update Quote' : '+ Create Quote'}</button></div>
      </div>
    </div>
  );
}

// ── Convert to Invoice Modal ────────────────────────────────────
function ConvertModal({ quote, onClose, onDone }) {
  const [form, setForm] = useState({ client_address: '', client_gstin: '' });
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    setLoading(true);
    try { await accountingApi.convertToInvoice(quote.id, form); onDone(); onClose(); }
    catch (err) { alert(err.message); } finally { setLoading(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3 className="modal-title">📄 Convert to Invoice — {quote.quote_number}</h3><button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="alert alert-info" style={{ marginBottom: 16 }}><span className="alert-icon">ℹ️</span><div>An invoice will be generated from this quote for <strong>{fmt(quote.total)}</strong> due in 15 days.</div></div>
          <div className="form-group"><label className="form-label">Client Address</label><textarea className="form-textarea" style={{ minHeight: 60 }} value={form.client_address} onChange={e => setForm({ ...form, client_address: e.target.value })} placeholder="Full billing address" /></div>
          <div className="form-group"><label className="form-label">Client GSTIN (optional)</label><input className="form-input" value={form.client_gstin} onChange={e => setForm({ ...form, client_gstin: e.target.value })} placeholder="27XXXXX1234X1ZA" /></div>
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={loading} onClick={handle}>{loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Creating…</> : '📄 Generate Invoice'}</button></div>
      </div>
    </div>
  );
}

// ── Expense Form Modal ──────────────────────────────────────────
function ExpenseModal({ onClose, onDone }) {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), category: 'consumables', description: '', vendor: '', amount: '', tax_amt: '', receipt_note: '' });
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    setLoading(true);
    try { await accountingApi.createExpense(form); onDone(); onClose(); }
    catch (err) { alert(err.message); } finally { setLoading(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3 className="modal-title">+ Record Expense</h3><button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button></div>
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
          <div className="form-group"><label className="form-label">Receipt Note</label><input className="form-input" value={form.receipt_note} onChange={e => setForm({ ...form, receipt_note: e.target.value })} /></div>
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={loading || !form.description || !form.amount} onClick={handle}>{loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : '+ Add Expense'}</button></div>
      </div>
    </div>
  );
}

// ── Main Accounting Page ────────────────────────────────────────
export default function AccountingPage() {
  const { canAccess } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  // Modals
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [editQuote, setEditQuote] = useState(null);
  const [convertQuote, setConvertQuote] = useState(null);
  const [payInvoice, setPayInvoice] = useState(null);
  const [printInvoice, setPrintInvoice] = useState(null);
  const [showExpenseForm, setShowExpenseForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, q, inv, exp] = await Promise.all([
        accountingApi.summary(),
        accountingApi.listQuotes({ search, status: statusFilter }),
        accountingApi.listInvoices({ search, status: statusFilter }),
        accountingApi.listExpenses({ search }),
      ]);
      setSummary(s); setQuotes(q.quotes || []); setInvoices(inv.invoices || []); setExpenses(exp.expenses || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const TABS = [
    { key: 'overview', label: '📊 Overview' },
    { key: 'quotes', label: `📋 Quotes (${quotes.length})` },
    { key: 'invoices', label: `🧾 Invoices (${invoices.length})` },
    { key: 'expenses', label: `💸 Expenses (${expenses.length})` },
  ];

  return (
    <div>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Accounting</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Quotes, Invoices, Payments & Expenses</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {canAccess('junior_engineer') && activeTab === 'quotes' && <button className="btn btn-primary" onClick={() => setShowQuoteForm(true)}>+ New Quote</button>}
          {canAccess('junior_engineer') && activeTab === 'expenses' && <button className="btn btn-primary" onClick={() => setShowExpenseForm(true)}>+ Record Expense</button>}
          {canAccess('junior_engineer') && activeTab === 'invoices' && <button className="btn btn-secondary" onClick={() => setShowQuoteForm(true)}>+ Quote → Invoice</button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 24 }}>
        {TABS.map(t => <button key={t.key} className={`tab-btn ${activeTab === t.key ? 'active' : ''}`} onClick={() => { setActiveTab(t.key); setSearch(''); setStatusFilter(''); }}>{t.label}</button>)}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && summary && (
        <div>
          {/* KPI Cards */}
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            {[
              { icon: '💰', label: 'Total Revenue', value: fmt(summary.totalRevenue), color: 'var(--status-success)', bg: 'rgba(16,185,129,0.1)' },
              { icon: '⏳', label: 'Pending', value: fmt(summary.pendingRevenue), color: 'var(--status-warning)', bg: 'rgba(245,158,11,0.1)' },
              { icon: '🔴', label: 'Overdue', value: fmt(summary.overdueRevenue), color: 'var(--status-danger)', bg: 'rgba(239,68,68,0.1)' },
              { icon: '💸', label: 'Total Expenses', value: fmt(summary.totalExpenses), color: '#f472b6', bg: 'rgba(236,72,153,0.1)' },
              { icon: '📈', label: 'Net Profit', value: fmt(summary.netProfit), color: summary.netProfit >= 0 ? 'var(--status-success)' : 'var(--status-danger)', bg: summary.netProfit >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' },
              { icon: '🎯', label: 'Profit Margin', value: `${summary.profitMargin}%`, color: 'var(--accent-primary)', bg: 'rgba(0,212,255,0.1)' },
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
              <div className="card-title" style={{ marginBottom: 16 }}>🧾 Invoice Status</div>
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
              <div className="card-title" style={{ marginBottom: 16 }}>💸 Expense Breakdown</div>
              {Object.entries(summary.expenseByCategory || {}).map(([cat, amt]) => {
                const pct = Math.round(amt / summary.totalExpenses * 100);
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

          {/* Monthly Chart */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>📅 Last 6 Months — Revenue vs Expenses</div>
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
        </div>
      )}

      {/* ── QUOTES ── */}
      {activeTab === 'quotes' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="search-bar"><span className="search-icon">🔍</span><input className="search-input" placeholder="Search quotes…" value={search} onChange={e => setSearch(e.target.value)} /></div>
            <select className="form-select" style={{ width: 'auto', fontSize: '0.8rem' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {Object.keys(Q_STATUS).map(s => <option key={s} value={s}>{Q_STATUS[s].label}</option>)}
            </select>
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Quote #</th><th>Client</th><th>Title</th><th>Total</th><th>Valid Until</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={7}><div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div></td></tr>
                  : quotes.length === 0 ? <tr><td colSpan={7}><div className="empty-state"><div className="empty-icon">📋</div><div className="empty-title">No quotes found</div></div></td></tr>
                    : quotes.map(q => (
                      <tr key={q.id}>
                        <td><span className="font-mono text-xs" style={{ color: 'var(--accent-primary)' }}>{q.quote_number}</span></td>
                        <td><div style={{ fontWeight: 600 }}>{q.client_name}</div>{q.company && <div className="text-xs text-muted">{q.company}</div>}</td>
                        <td style={{ maxWidth: 200 }}><div style={{ fontSize: '0.82rem' }}>{q.title}</div>{q.case_number && <div className="text-xs text-muted font-mono">{q.case_number}</div>}</td>
                        <td><span className="font-mono" style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(q.total)}</span></td>
                        <td className="text-xs text-muted">{fmtDate(q.valid_until)}</td>
                        <td><StatusBadge status={q.status} map={Q_STATUS} /></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {q.status === 'draft' && <button className="btn btn-secondary btn-sm" onClick={() => { setEditQuote(q); setShowQuoteForm(true); }}>✏️ Edit</button>}
                            {q.status === 'draft' && <button className="btn btn-secondary btn-sm" onClick={async () => { await accountingApi.updateQuoteStatus(q.id, 'sent'); load(); }}>📤 Send</button>}
                            {q.status === 'sent' && <button className="btn btn-secondary btn-sm" onClick={async () => { await accountingApi.updateQuoteStatus(q.id, 'accepted'); load(); }}>✅ Accept</button>}
                            {q.status === 'sent' && <button className="btn btn-secondary btn-sm" onClick={async () => { await accountingApi.updateQuoteStatus(q.id, 'rejected'); load(); }}>❌ Reject</button>}
                            {(q.status === 'accepted') && <button className="btn btn-primary btn-sm" onClick={() => setConvertQuote(q)}>📄 Invoice</button>}
                            {q.status === 'draft' && <button className="btn btn-danger btn-sm" onClick={async () => { if (confirm('Delete this quote?')) { await accountingApi.deleteQuote(q.id); load(); } }}>🗑</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── INVOICES ── */}
      {activeTab === 'invoices' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <div className="search-bar"><span className="search-icon">🔍</span><input className="search-input" placeholder="Search invoices…" value={search} onChange={e => setSearch(e.target.value)} /></div>
            <select className="form-select" style={{ width: 'auto', fontSize: '0.8rem' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {Object.keys(I_STATUS).map(s => <option key={s} value={s}>{I_STATUS[s].label}</option>)}
            </select>
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Invoice #</th><th>Client</th><th>Title</th><th>Total</th><th>Due Date</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={7}><div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div></td></tr>
                  : invoices.length === 0 ? <tr><td colSpan={7}><div className="empty-state"><div className="empty-icon">🧾</div><div className="empty-title">No invoices found</div></div></td></tr>
                    : invoices.map(inv => (
                      <tr key={inv.id}>
                        <td><span className="font-mono text-xs" style={{ color: 'var(--accent-primary)' }}>{inv.invoice_number}</span></td>
                        <td><div style={{ fontWeight: 600 }}>{inv.client_name}</div>{inv.company && <div className="text-xs text-muted">{inv.company}</div>}</td>
                        <td style={{ maxWidth: 200 }}><div style={{ fontSize: '0.82rem' }}>{inv.title}</div>{inv.case_number && <div className="text-xs text-muted font-mono">{inv.case_number}</div>}</td>
                        <td><span className="font-mono" style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(inv.total)}</span></td>
                        <td><span className={`text-xs ${inv.status === 'overdue' ? '' : 'text-muted'}`} style={inv.status === 'overdue' ? { color: 'var(--status-danger)', fontWeight: 700 } : {}}>{fmtDate(inv.due_date)}</span></td>
                        <td><StatusBadge status={inv.status} map={I_STATUS} /></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setPrintInvoice(inv)}>🖨️ Print</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => printCourierSlip(inv)}>🚚 Courier</button>
                            {['unpaid', 'overdue', 'partial'].includes(inv.status) && <button className="btn btn-primary btn-sm" onClick={() => setPayInvoice(inv)}>💳 Pay</button>}
                            {inv.status !== 'paid' && <button className="btn btn-danger btn-sm" onClick={async () => { if (confirm('Delete invoice?')) { await accountingApi.deleteInvoice(inv.id); load(); } }}>🗑</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── EXPENSES ── */}
      {activeTab === 'expenses' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div className="search-bar"><span className="search-icon">🔍</span><input className="search-input" placeholder="Search expenses…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          </div>
          <div className="table-container">
            <table>
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Vendor</th><th>Amount</th><th>Tax</th><th>Total</th><th></th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={8}><div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div></td></tr>
                  : expenses.length === 0 ? <tr><td colSpan={8}><div className="empty-state"><div className="empty-icon">💸</div><div className="empty-title">No expenses recorded</div></div></td></tr>
                    : expenses.map(exp => (
                      <tr key={exp.id}>
                        <td className="text-xs font-mono">{fmtDate(exp.date)}</td>
                        <td><span style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: 999, background: 'rgba(124,58,237,0.1)', color: '#a78bfa', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{exp.category?.replace('_', ' ')}</span></td>
                        <td><div style={{ fontWeight: 500 }}>{exp.description}</div>{exp.receipt_note && <div className="text-xs text-muted">{exp.receipt_note}</div>}</td>
                        <td className="text-xs text-muted">{exp.vendor || '—'}</td>
                        <td className="font-mono text-xs">{fmt(exp.amount)}</td>
                        <td className="font-mono text-xs text-muted">{exp.tax_amt > 0 ? fmt(exp.tax_amt) : '—'}</td>
                        <td><span className="font-mono" style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(exp.total)}</span></td>
                        <td>{canAccess('admin') && <button className="btn btn-danger btn-sm" onClick={async () => { if (confirm('Delete expense?')) { await accountingApi.deleteExpense(exp.id); load(); } }}>🗑</button>}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {expenses.length > 0 && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
                <span className="text-xs text-muted">Total Expenses: <strong style={{ color: '#f472b6', fontFamily: 'var(--font-mono)' }}>{fmt(expenses.reduce((s, e) => s + e.total, 0))}</strong></span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showQuoteForm && <QuoteFormModal existing={editQuote} onClose={() => { setShowQuoteForm(false); setEditQuote(null); }} onDone={load} />}
      {convertQuote && <ConvertModal quote={convertQuote} onClose={() => setConvertQuote(null)} onDone={() => { load(); setActiveTab('invoices'); }} />}
      {payInvoice && <RecordPaymentModal invoice={payInvoice} onClose={() => setPayInvoice(null)} onDone={load} />}
      {printInvoice && <InvoicePrintModal invoice={printInvoice} onClose={() => setPrintInvoice(null)} />}
      {showExpenseForm && <ExpenseModal onClose={() => setShowExpenseForm(false)} onDone={load} />}
    </div>
  );
}
