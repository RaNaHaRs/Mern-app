import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../store/AuthContext';
import { marketingApi, clientsApi } from '../services/api';

//  Storage helpers 
const ls = {
  get: (k, def) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? def; } catch { return def; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

//  Personalization variables available in templates 
const VARS = [
  { key: '{{name}}',              label: 'Client Name' },
  { key: '{{company}}',           label: 'Company' },
  { key: '{{email}}',             label: 'Email' },
  { key: '{{phone}}',             label: 'Phone' },
  { key: '{{case_id}}',           label: 'Case ID' },
  { key: '{{case_status}}',       label: 'Case Status' },
  { key: '{{device}}',            label: 'Device Model' },
  { key: '{{issue}}',             label: 'Issue Type' },
  { key: '{{technician}}',        label: 'Technician' },
  { key: '{{amount}}',            label: 'Amount (₹)' },
  { key: '{{invoice_no}}',        label: 'Invoice No.' },
  { key: '{{expiry_date}}',       label: 'Expiry Date' },
  { key: '{{portal_link}}',       label: 'Portal Link' },
  { key: '{{unsubscribe_link}}',  label: 'Unsubscribe Link' },
  { key: '{{company_name}}',      label: 'Your Company Name' },
  { key: '{{support_email}}',     label: 'Support Email' },
  { key: '{{support_phone}}',     label: 'Support Phone' },
];

//  Default email templates 
const DEFAULT_EMAIL_TEMPLATES = [
  {
    id: 'tpl_welcome',
    name: 'Welcome Email',
    category: 'onboarding',
    subject: 'Welcome to {{company_name}} — Your Case is Registered!',
    from_name: '{{company_name}}',
    html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Welcome</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:30px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <tr><td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:32px 40px;">
    <h1 style="color:#fff;margin:0;font-size:26px;font-weight:800;">{{company_name}}</h1>
    <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">Data Recovery Specialists</p>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <h2 style="color:#1e293b;margin:0 0 16px;font-size:22px;">Hi {{name}}, welcome! </h2>
    <p style="color:#475569;line-height:1.7;margin:0 0 20px;font-size:15px;">
      Your device recovery case has been registered successfully. Our expert team will begin diagnosis shortly.
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:20px;margin-bottom:24px;width:100%;border:1px solid #e2e8f0;">
      <tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Case ID</td><td style="padding:6px 0;font-size:14px;color:#1e293b;font-weight:700;">{{case_id}}</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Device</td><td style="padding:6px 0;font-size:14px;color:#1e293b;">{{device}}</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Status</td><td style="padding:6px 0;font-size:14px;color:#3b82f6;font-weight:700;">{{case_status}}</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Technician</td><td style="padding:6px 0;font-size:14px;color:#1e293b;">{{technician}}</td></tr>
    </table>
    <table cellpadding="0" cellspacing="0"><tr><td>
      <a href="{{portal_link}}" style="display:inline-block;background:linear-gradient(135deg,#1e40af,#3b82f6);color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:15px;font-weight:700;">Track Your Case →</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:20px 40px;border-top:1px solid #e2e8f0;background:#f8fafc;">
    <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">
      {{company_name}} · {{support_email}} · {{support_phone}}<br>
      <a href="{{unsubscribe_link}}" style="color:#94a3b8;">Unsubscribe</a>
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
    createdAt: new Date().toISOString(),
    usageCount: 0,
  },
  {
    id: 'tpl_update',
    name: 'Case Status Update',
    category: 'transactional',
    subject: 'Update on Your Case {{case_id}} — {{case_status}}',
    from_name: '{{company_name}}',
    html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:30px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <tr><td style="background:linear-gradient(135deg,#059669,#10b981);padding:28px 40px;">
    <h1 style="color:#fff;margin:0;font-size:20px;font-weight:800;">Case Update</h1>
    <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px;">{{company_name}}</p>
  </td></tr>
  <tr><td style="padding:32px 40px;">
    <h2 style="color:#1e293b;margin:0 0 12px;font-size:20px;">Hi {{name}},</h2>
    <p style="color:#475569;line-height:1.7;font-size:15px;margin:0 0 20px;">
      Your case <strong>{{case_id}}</strong> has been updated. Here's the latest status:
    </p>
    <div style="background:#f0fdf4;border-left:4px solid #10b981;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:24px;">
      <div style="font-size:13px;color:#64748b;margin-bottom:4px;">Current Status</div>
      <div style="font-size:18px;font-weight:800;color:#059669;">{{case_status}}</div>
    </div>
    <p style="color:#475569;line-height:1.7;font-size:15px;margin:0 0 24px;">
      For any queries, contact your assigned technician <strong>{{technician}}</strong> or reply to this email.
    </p>
    <table cellpadding="0" cellspacing="0"><tr><td>
      <a href="{{portal_link}}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;">View Full Details →</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:16px 40px;border-top:1px solid #e2e8f0;background:#f8fafc;">
    <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">
      {{company_name}} · <a href="{{unsubscribe_link}}" style="color:#94a3b8;">Unsubscribe</a>
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
    createdAt: new Date().toISOString(),
    usageCount: 0,
  },
  {
    id: 'tpl_invoice',
    name: 'Invoice / Payment Receipt',
    category: 'billing',
    subject: 'Invoice #{{invoice_no}} from {{company_name}} — ₹{{amount}}',
    from_name: '{{company_name}} Billing',
    html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:30px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
  <tr><td style="background:#1e293b;padding:28px 40px;display:flex;justify-content:space-between;align-items:center;">
    <h1 style="color:#fff;margin:0;font-size:20px;">INVOICE</h1>
    <span style="color:#94a3b8;font-size:14px;">#{{invoice_no}}</span>
  </td></tr>
  <tr><td style="padding:32px 40px;">
    <p style="color:#475569;font-size:15px;margin:0 0 24px;">Dear <strong>{{name}}</strong>,<br>Thank you for choosing {{company_name}}. Please find your invoice details below.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <tr style="background:#f8fafc;"><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#374151;">Description</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#374151;text-align:right;">Amount</td></tr>
      <tr style="border-top:1px solid #e2e8f0;"><td style="padding:12px 16px;font-size:14px;color:#475569;">Data Recovery Service — {{device}}</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;font-weight:700;text-align:right;">₹{{amount}}</td></tr>
      <tr style="border-top:2px solid #e2e8f0;background:#f8fafc;"><td style="padding:12px 16px;font-size:15px;font-weight:800;color:#1e293b;">Total</td><td style="padding:12px 16px;font-size:15px;font-weight:800;color:#059669;text-align:right;">₹{{amount}}</td></tr>
    </table>
    <table cellpadding="0" cellspacing="0"><tr><td>
      <a href="{{portal_link}}" style="display:inline-block;background:#1e293b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;">View & Download Invoice →</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:16px 40px;border-top:1px solid #e2e8f0;background:#f8fafc;">
    <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">{{company_name}} · {{support_email}} · <a href="{{unsubscribe_link}}" style="color:#94a3b8;">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
    createdAt: new Date().toISOString(),
    usageCount: 0,
  },
  {
    id: 'tpl_promo',
    name: 'Promotional Offer',
    category: 'marketing',
    subject: ' Special Offer for You — {{company_name}}',
    from_name: '{{company_name}} Offers',
    html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:30px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#7c3aed,#ec4899);padding:48px 40px;text-align:center;">
    <div style="font-size:48px;margin-bottom:12px;"></div>
    <h1 style="color:#fff;margin:0;font-size:28px;font-weight:900;">Special Offer Inside!</h1>
    <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:16px;">Exclusively for {{name}}</p>
  </td></tr>
  <tr><td style="padding:36px 40px;text-align:center;">
    <div style="background:linear-gradient(135deg,#fef3c7,#fde68a);border-radius:12px;padding:24px;margin-bottom:28px;">
      <div style="font-size:13px;color:#92400e;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Limited Time Offer</div>
      <div style="font-size:40px;font-weight:900;color:#d97706;margin:8px 0;">20% OFF</div>
      <div style="font-size:14px;color:#92400e;">on your next data recovery service</div>
    </div>
    <p style="color:#475569;line-height:1.7;font-size:15px;margin:0 0 28px;">
      As a valued customer, we're offering you an exclusive discount. Use this offer before it expires on <strong>{{expiry_date}}</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" align="center"><tr><td>
      <a href="{{portal_link}}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:16px;font-weight:800;">Claim Your Discount →</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:20px 40px;border-top:1px solid #e2e8f0;background:#f8fafc;">
    <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">
      You received this because you're a {{company_name}} customer.<br>
      <a href="{{unsubscribe_link}}" style="color:#94a3b8;">Unsubscribe from marketing emails</a>
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
    createdAt: new Date().toISOString(),
    usageCount: 0,
  },
];

//  Default WhatsApp templates 
const DEFAULT_WA_TEMPLATES = [
  {
    id: 'wa_welcome',
    name: 'Welcome Message',
    category: 'utility',
    message: `Hi {{name}}! 

Your device recovery case has been registered with *{{company_name}}*.

 *Case Details:*
• Case ID: {{case_id}}
• Device: {{device}}
• Status: {{case_status}}
• Technician: {{technician}}

Track your case here: {{portal_link}}

For queries, call us at {{support_phone}} `,
    mediaType: 'none',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'wa_update',
    name: 'Status Update',
    category: 'utility',
    message: `Hello {{name}} 

*Update on Case {{case_id}}*

Your device status has been updated to: *{{case_status}}*

Our technician {{technician}} will contact you shortly.

Need help? Reply to this message or call {{support_phone}} `,
    mediaType: 'none',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'wa_promo',
    name: 'Promotional Offer',
    category: 'marketing',
    message: ` *Special Offer for You, {{name}}!*

Get *20% OFF* on your next data recovery service at *{{company_name}}*.

 Valid till {{expiry_date}}
 For all device types
 Expert technicians

Book now: {{portal_link}}

_Reply STOP to unsubscribe_`,
    mediaType: 'image',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'wa_invoice',
    name: 'Invoice Notification',
    category: 'utility',
    message: ` *Invoice from {{company_name}}*

Hi {{name}},

Invoice #{{invoice_no}} of *₹{{amount}}* has been generated for your case {{case_id}}.

View & download: {{portal_link}}

Questions? Email {{support_email}} `,
    mediaType: 'document',
    createdAt: new Date().toISOString(),
  },
];

//  Default SMS templates 
const DEFAULT_SMS_TEMPLATES = [
  {
    id: 'sms_welcome',
    name: 'Case Registered',
    message: `Hi {{name}}, your case {{case_id}} is registered at {{company_name}}. Track: {{portal_link}}. Call {{support_phone}}.`,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'sms_update',
    name: 'Status Update',
    message: `{{company_name}}: Hi {{name}}, case {{case_id}} updated to {{case_status}}. Track: {{portal_link}}.`,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'sms_invoice',
    name: 'Invoice Alert',
    message: `{{company_name}}: Invoice #{{invoice_no}} of Rs.{{amount}} for {{name}}. View: {{portal_link}}.`,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'sms_promo',
    name: 'Promo Offer',
    message: `{{company_name}}: Hi {{name}}, get 20% off your next recovery! Valid till {{expiry_date}}. Book: {{portal_link}}. Reply STOP to opt-out.`,
    createdAt: new Date().toISOString(),
  },
];

//  Sample audiences from clients 
const getSampleAudience = () => {
  try {
    const clients = JSON.parse(localStorage.getItem('crm_clients') || '[]');
    return clients.map(c => ({
      id: c.id,
      name: c.name || c.company || 'Client',
      email: c.email || '',
      phone: c.phone || '',
      company: c.company || '',
      case_id: c.case_id || 'N/A',
      case_status: c.status || 'Active',
      device: c.device || 'Unknown Device',
      amount: c.amount || '0',
    }));
  } catch { return []; }
};

//  Category badge 
const CAT_COLORS = {
  onboarding: '#10b981', transactional: '#3b82f6', billing: '#8b5cf6',
  marketing: '#f59e0b', utility: '#10b981', follow_up: '#06b6d4',
};
function CatBadge({ cat }) {
  const color = CAT_COLORS[cat] || '#64748b';
  return (
    <span style={{ fontSize:'0.68rem', padding:'2px 8px', borderRadius:999, background:`${color}18`, color, fontWeight:700, border:`1px solid ${color}30` }}>
      {(cat || '').replace(/_/g,' ').toUpperCase()}
    </span>
  );
}

//  Insert var button 
function VarChip({ varKey, onClick }) {
  return (
    <button onClick={() => onClick(varKey)} title={`Insert ${varKey}`}
      style={{ fontSize:'0.68rem', padding:'3px 8px', borderRadius:6, background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.25)', color:'#60a5fa', cursor:'pointer', fontFamily:'monospace', transition:'all 0.1s' }}
      onMouseEnter={e => { e.currentTarget.style.background='rgba(59,130,246,0.2)'; }}
      onMouseLeave={e => { e.currentTarget.style.background='rgba(59,130,246,0.1)'; }}
    >{varKey}</button>
  );
}

//  HTML Email Editor 
function EmailEditor({ template, onSave, onClose }) {
  const fileRef = useRef();
  const textareaRef = useRef();
  const [form, setForm] = useState({
    name: template?.name || '',
    subject: template?.subject || '',
    from_name: template?.from_name || '{{company_name}}',
    category: template?.category || 'marketing',
    html: template?.html || `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f5;padding:30px 0;margin:0;">
  <table width="600" align="center" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
    <tr><td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:28px 40px;">
      <h1 style="color:#fff;margin:0;font-size:22px;">{{company_name}}</h1>
    </td></tr>
    <tr><td style="padding:32px 40px;">
      <h2 style="color:#1e293b;margin:0 0 16px;">Hi {{name}},</h2>
      <p style="color:#475569;line-height:1.7;">Your message here...</p>
    </td></tr>
    <tr><td style="padding:16px 40px;border-top:1px solid #e2e8f0;background:#f8fafc;">
      <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">
        {{company_name}} · <a href="{{unsubscribe_link}}" style="color:#94a3b8;">Unsubscribe</a>
      </p>
    </td></tr>
  </table>
</body>
</html>`,
  });
  const [tab, setTab] = useState('code');
  const [previewData, setPreviewData] = useState({
    name: 'Raj Patel', company: 'DataTech Labs', email: 'raj@example.com', phone: '+91 98765 43210',
    case_id: 'CAS-2024-001', case_status: 'In Progress', device: 'WD 2TB HDD', issue: 'Motor failure',
    technician: 'Amit Kumar', amount: '4,500', invoice_no: 'INV-2024-042', expiry_date: '30 Apr 2026',
    portal_link: '#', unsubscribe_link: '#', company_name: 'RecoverLab', support_email: 'support@recoverlab.in',
    support_phone: '+91 98765 00000',
  });

  const insertVar = (varKey) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const newHtml = form.html.slice(0, start) + varKey + form.html.slice(end);
    setForm(f => ({ ...f, html: newHtml }));
    setTimeout(() => { el.focus(); el.setSelectionRange(start + varKey.length, start + varKey.length); }, 0);
  };

  const renderPreview = () => {
    let h = form.html;
    Object.entries(previewData).forEach(([k, v]) => {
      h = h.replaceAll(`{{${k}}}`, v);
    });
    return h;
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm(f => ({ ...f, html: ev.target.result }));
      setTab('code');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.subject.trim() || !form.html.trim()) {
      alert('Name, subject and HTML are required.'); return;
    }
    const saved = {
      ...form,
      id: template?.id || `tpl_${Date.now()}`,
      createdAt: template?.createdAt || new Date().toISOString(),
      usageCount: template?.usageCount || 0,
    };
    onSave(saved);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 1100, width: '95vw', height: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h3 className="modal-title"> {template ? 'Edit' : 'Create'} Email Template</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}></button>
        </div>

        {/* Meta fields */}
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border-subtle)', display:'grid', gridTemplateColumns:'1fr 1fr 180px 160px', gap:10, flexShrink:0 }}>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Template Name *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Welcome Email" />
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Email Subject *</label>
            <input className="form-input" value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))} placeholder="Subject line..." />
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">From Name</label>
            <input className="form-input" value={form.from_name} onChange={e => setForm(f => ({...f, from_name: e.target.value}))} placeholder="{{company_name}}" />
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Category</label>
            <select className="form-select" value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}>
              <option value="marketing">Marketing</option>
              <option value="transactional">Transactional</option>
              <option value="onboarding">Onboarding</option>
              <option value="billing">Billing</option>
              <option value="follow_up">Follow-up</option>
            </select>
          </div>
        </div>

        {/* Var chips */}
        <div style={{ padding:'8px 20px', borderBottom:'1px solid var(--border-subtle)', flexShrink:0, background:'var(--bg-elevated)' }}>
          <span style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginRight:8 }}>Insert variable:</span>
          <div style={{ display:'inline-flex', flexWrap:'wrap', gap:4 }}>
            {VARS.map(v => <VarChip key={v.key} varKey={v.key} onClick={tab === 'code' ? insertVar : (k) => setForm(f => ({...f, subject: f.subject + k}))} />)}
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--border-subtle)', flexShrink:0 }}>
          {[['code', ' HTML Code'], ['preview', ' Preview'], ['preview_data', ' Test Data']].map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding:'8px 18px', background: tab===t ? 'var(--bg-base)' : 'var(--bg-elevated)',
              border:'none', borderBottom: tab===t ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: tab===t ? 'var(--accent-primary)' : 'var(--text-muted)', cursor:'pointer', fontSize:'0.8rem', fontWeight: tab===t ? 700 : 400,
            }}>{l}</button>
          ))}
          <div style={{ flex:1 }} />
          <label style={{ padding:'8px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:'0.78rem', color:'var(--text-muted)', borderBottom:'2px solid transparent' }}
            title="Import HTML file">
            <input ref={fileRef} type="file" accept=".html,.htm" style={{ display:'none' }} onChange={handleImport} />
             Import HTML
          </label>
          <button onClick={() => {
            const blob = new Blob([form.html], {type:'text/html'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href=url; a.download=`${form.name||'template'}.html`; a.click();
            URL.revokeObjectURL(url);
          }} style={{ padding:'8px 16px', background:'none', border:'none', cursor:'pointer', fontSize:'0.78rem', color:'var(--text-muted)', borderBottom:'2px solid transparent' }}>
             Export HTML
          </button>
        </div>

        {/* Editor area */}
        <div style={{ flex:1, overflow:'auto', padding:0 }}>
          {tab === 'code' && (
            <textarea
              ref={textareaRef}
              value={form.html}
              onChange={e => setForm(f => ({...f, html: e.target.value}))}
              spellCheck={false}
              style={{
                width:'100%', height:'100%', minHeight:400, padding:'16px 20px',
                fontFamily:'monospace', fontSize:'0.8rem', lineHeight:1.6,
                background:'var(--bg-base)', color:'var(--text-primary)',
                border:'none', outline:'none', resize:'none', boxSizing:'border-box',
                tabSize:2,
              }}
            />
          )}
          {tab === 'preview' && (
            <iframe
              srcDoc={renderPreview()}
              style={{ width:'100%', height:'100%', minHeight:400, border:'none', background:'#fff' }}
              title="Email Preview"
              sandbox="allow-same-origin"
            />
          )}
          {tab === 'preview_data' && (
            <div style={{ padding:20 }}>
              <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', margin:'0 0 14px' }}>
                Edit preview data to see how your template looks with real values:
              </p>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10 }}>
                {Object.entries(previewData).map(([k, v]) => (
                  <div key={k} className="form-group" style={{ margin:0 }}>
                    <label className="form-label" style={{ fontFamily:'monospace', fontSize:'0.68rem' }}>{`{{${k}}}`}</label>
                    <input className="form-input" value={v} onChange={e => setPreviewData(d => ({...d, [k]: e.target.value}))} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ flexShrink:0 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}> Save Template</button>
        </div>
      </div>
    </div>
  );
}

//  WhatsApp Template Editor 
function WaEditor({ template, onSave, onClose }) {
  const textareaRef = useRef();
  const [form, setForm] = useState({
    name: template?.name || '',
    category: template?.category || 'utility',
    mediaType: template?.mediaType || 'none',
    message: template?.message || `Hi {{name}} \n\nMessage here...\n\n_Reply STOP to unsubscribe_`,
  });
  const [previewData] = useState({
    name: 'Raj Patel', company: 'DataTech Labs', case_id: 'CAS-2024-001',
    case_status: 'In Progress', device: 'WD 2TB HDD', technician: 'Amit Kumar',
    amount: '4,500', invoice_no: 'INV-042', expiry_date: '30 Apr 2026',
    portal_link: 'https://recoverlab.in/track', company_name: 'RecoverLab',
    support_phone: '+91 98765 00000', support_email: 'support@recoverlab.in',
  });

  const insertVar = (varKey) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart, end = el.selectionEnd;
    const newMsg = form.message.slice(0, start) + varKey + form.message.slice(end);
    setForm(f => ({...f, message: newMsg}));
    setTimeout(() => { el.focus(); el.setSelectionRange(start + varKey.length, start + varKey.length); }, 0);
  };

  const renderPreview = () => {
    let m = form.message;
    Object.entries(previewData).forEach(([k, v]) => { m = m.replaceAll(`{{${k}}}`, v); });
    // WhatsApp formatting
    m = m.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    m = m.replace(/_([^_]+)_/g, '<em>$1</em>');
    m = m.replace(/```([^`]+)```/g, '<code>$1</code>');
    m = m.replace(/\n/g, '<br>');
    return m;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 900, width: '95vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title"> {template ? 'Edit' : 'Create'} WhatsApp Template</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}></button>
        </div>
        <div className="modal-body" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          {/* Left: editor */}
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">Template Name *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Welcome Message" />
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">Category</label>
                <select className="form-select" value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}>
                  <option value="utility">Utility</option>
                  <option value="marketing">Marketing</option>
                  <option value="onboarding">Onboarding</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom:10 }}>
              <label className="form-label">Media Type</label>
              <select className="form-select" value={form.mediaType} onChange={e => setForm(f => ({...f, mediaType: e.target.value}))}>
                <option value="none">Text only</option>
                <option value="image">Image</option>
                <option value="document">Document (PDF)</option>
                <option value="video">Video</option>
              </select>
            </div>
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginBottom:6 }}>Insert variable:</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                {VARS.slice(0, 12).map(v => <VarChip key={v.key} varKey={v.key} onClick={insertVar} />)}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Message *</label>
              <textarea
                ref={textareaRef}
                className="form-textarea"
                value={form.message}
                onChange={e => setForm(f => ({...f, message: e.target.value}))}
                style={{ minHeight:180, fontFamily:'monospace', fontSize:'0.82rem' }}
                placeholder="Type your WhatsApp message here..."
              />
              <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:4 }}>
                Use *bold*, _italic_, ```code``` for formatting · {form.message.length}/1024 chars
              </div>
            </div>
          </div>

          {/* Right: preview */}
          <div>
            <div style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-secondary)', marginBottom:10 }}> Preview</div>
            <div style={{ background:'#e5ddd5', borderRadius:12, padding:16, minHeight:300 }}>
              {form.mediaType !== 'none' && (
                <div style={{ background:'rgba(0,0,0,0.1)', borderRadius:8, padding:'20px', textAlign:'center', marginBottom:8, fontSize:'0.75rem', color:'#555' }}>
                  {form.mediaType === 'image' ? ' Image attachment' : form.mediaType === 'document' ? ' Document attachment' : ' Video attachment'}
                </div>
              )}
              <div style={{ background:'#fff', borderRadius:'0 10px 10px 10px', padding:'10px 14px', maxWidth:'85%', boxShadow:'0 1px 3px rgba(0,0,0,0.1)', fontSize:'0.85rem', color:'#111', lineHeight:1.6 }}
                dangerouslySetInnerHTML={{ __html: renderPreview() }} />
              <div style={{ fontSize:'0.65rem', color:'#555', marginTop:4, marginLeft:4 }}>
                {new Date().toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})} 
              </div>
            </div>
            <div style={{ marginTop:14, padding:12, background:'var(--bg-elevated)', borderRadius:8, fontSize:'0.72rem', color:'var(--text-muted)', border:'1px solid var(--border-subtle)' }}>
              <strong style={{ color:'var(--text-secondary)' }}> WhatsApp Tips:</strong>
              <ul style={{ margin:'6px 0 0', paddingLeft:16 }}>
                <li>Always include unsubscribe option (Reply STOP)</li>
                <li>Use template categories correctly (marketing vs utility)</li>
                <li>Images: &lt;5MB JPG/PNG, Docs: &lt;100MB PDF</li>
                <li>Approval needed for new templates via WhatsApp Business API</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => {
            if (!form.name.trim() || !form.message.trim()) { alert('Name and message are required.'); return; }
            onSave({ ...form, id: template?.id || `wa_${Date.now()}`, createdAt: template?.createdAt || new Date().toISOString() });
          }}> Save Template</button>
        </div>
      </div>
    </div>
  );
}

//  Campaign Wizard 
function CampaignWizard({ onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: '', channel: 'email', template_id: '', audience_filter: 'all',
    audience_ids: [], scheduled_at: '', status: 'draft',
    personalize: true,
  });
  const [audience, setAudience] = useState([]);
  const [loadingAudience, setLoadingAudience] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [sendError, setSendError] = useState('');
  const emailTemplates = ls.get('crm_email_templates', DEFAULT_EMAIL_TEMPLATES);
  const waTemplates    = ls.get('crm_wa_templates', DEFAULT_WA_TEMPLATES);
  const smsTemplates   = ls.get('crm_sms_templates', DEFAULT_SMS_TEMPLATES);

  useEffect(() => {
    (async () => {
      try {
        const r = await clientsApi.list({ limit: 1000 });
        setAudience((r.clients || []).map(c => ({
          id: c.id,
          name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company || 'Client',
          email: c.email || '',
          phone: c.phone || '',
          company: c.company || '',
        })));
      } catch (e) {
        console.error('Failed to load clients for campaign:', e);
      } finally {
        setLoadingAudience(false);
      }
    })();
  }, []);

  const templates = form.channel === 'email' ? emailTemplates : form.channel === 'whatsapp' ? waTemplates : smsTemplates;
  const selectedTpl = templates.find(t => t.id === form.template_id);
  const filteredAudience = audience.filter(a => {
    if (form.audience_filter === 'all') return true;
    if (form.audience_filter === 'email') return !!a.email;
    if (form.audience_filter === 'phone') return !!a.phone;
    return true;
  });
  const selectedCount = form.audience_ids.length > 0
    ? filteredAudience.filter(a => form.audience_ids.includes(a.id)).length
    : filteredAudience.length;

  const CHANNEL_ICONS = { email: '', whatsapp: '', sms: '', multi: '' };

  const toggleClient = (id) => {
    setForm(f => ({
      ...f,
      audience_ids: f.audience_ids.includes(id)
        ? f.audience_ids.filter(x => x !== id)
        : [...f.audience_ids, id]
    }));
  };
  const handleLaunch = async () => {
    if (!form.name.trim()) { alert('Campaign name is required.'); return; }
    if (!form.template_id) { alert('Please select a template.'); return; }
    setSendError('');
    setLaunching(true);

    const allCampaigns = ls.get('crm_campaigns', []);
    const campaign = {
      ...form,
      id: `camp_${Date.now()}`,
      audience_count: selectedCount,
      sent: 0, opened: 0, clicked: 0, failed: 0,
      status: form.scheduled_at ? 'scheduled' : 'sending',
      createdAt: new Date().toISOString(),
      sentAt: form.scheduled_at || new Date().toISOString(),
      audience_ids: form.audience_ids,
    };
    ls.set('crm_campaigns', [campaign, ...allCampaigns]);

    // Bump template usage count
    if (form.channel === 'email') {
      ls.set('crm_email_templates', emailTemplates.map(t => t.id === form.template_id ? { ...t, usageCount: (t.usageCount || 0) + 1 } : t));
    }

    try {
      if (form.channel === 'email' && selectedTpl) {
        const tplRes = await marketingApi.createEmailTemplate({
          name: selectedTpl.name || form.name,
          subject: selectedTpl.subject || form.name,
          html_body: selectedTpl.html || selectedTpl.message_body || '',
          category: selectedTpl.category || 'campaign',
        });
        const campRes = await marketingApi.createCampaign({
          name: form.name,
          type: 'email',
          email_template_id: tplRes.id,
          subject_line: selectedTpl.subject || form.name,
          from_name: selectedTpl.from_name || 'RecoverLab CRM',
          from_email: '',
          audience_filter: JSON.stringify({ filter: form.audience_filter, client_ids: form.audience_ids }),
          scheduled_at: form.scheduled_at || null, // Pass scheduled time (null means send now)
        });
        
        // Only send immediately if no scheduled_at time is set
        if (!form.scheduled_at) {
          const result = await marketingApi.sendCampaign(campRes.id);
          campaign.status = 'sent';
          campaign.sent = result?.sent || 0;
          campaign.failed = result?.failed || 0;
        } else {
          // Campaign is scheduled for later
          campaign.status = 'scheduled';
          campaign.scheduled_time = form.scheduled_at;
        }
      } else if (form.channel === 'sms' && selectedTpl) {
        const campRes = await marketingApi.createCampaign({
          name: form.name,
          type: 'sms',
          sms_template: selectedTpl.message_body || selectedTpl.message || '',
          audience_filter: JSON.stringify({ filter: form.audience_filter, client_ids: form.audience_ids }),
          scheduled_at: form.scheduled_at || null, // Pass scheduled time (null means send now)
        });
        
        // Only send immediately if no scheduled_at time is set
        if (!form.scheduled_at) {
          const result = await marketingApi.sendCampaign(campRes.id);
          campaign.status = 'sent';
          campaign.sent = result?.sent || 0;
          campaign.failed = result?.failed || 0;
        } else {
          // Campaign is scheduled for later
          campaign.status = 'scheduled';
          campaign.scheduled_time = form.scheduled_at;
        }
      } else if (form.channel === 'whatsapp') {
        throw new Error('WhatsApp Business API is not yet configured. Please contact support.');
      } else {
        campaign.status = 'sent';
      }
      ls.set('crm_campaigns', [campaign, ...ls.get('crm_campaigns', []).filter(c => c.id !== campaign.id)]);
      onDone();
      onClose();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to send campaign';
      campaign.status = 'failed';
      ls.set('crm_campaigns', [campaign, ...ls.get('crm_campaigns', []).filter(c => c.id !== campaign.id)]);
      setSendError(msg);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" onClick={e => e.stopPropagation()} style={{ maxWidth:800 }}>
        <div className="modal-header">
          <h3 className="modal-title"> New Campaign — Step {step} of 4</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}></button>
        </div>

        {/* Step indicator */}
        <div style={{ padding:'12px 24px', borderBottom:'1px solid var(--border-subtle)', display:'flex', gap:0 }}>
          {['Campaign Setup', 'Select Template', 'Choose Audience', 'Review & Launch'].map((s, i) => (
            <div key={i} style={{ flex:1, textAlign:'center' }}>
              <div style={{ display:'flex', alignItems:'center' }}>
                {i > 0 && <div style={{ flex:1, height:2, background: step > i ? 'var(--accent-primary)' : 'var(--border-subtle)' }} />}
                <div style={{ width:28, height:28, borderRadius:'50%', background: step > i+1 ? 'var(--accent-primary)' : step === i+1 ? 'var(--accent-primary)' : 'var(--bg-elevated)', border:`2px solid ${step >= i+1 ? 'var(--accent-primary)' : 'var(--border-subtle)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.72rem', fontWeight:800, color: step >= i+1 ? '#fff' : 'var(--text-muted)', flexShrink:0 }}>
                  {step > i+1 ? '' : i+1}
                </div>
                {i < 3 && <div style={{ flex:1, height:2, background: step > i+1 ? 'var(--accent-primary)' : 'var(--border-subtle)' }} />}
              </div>
              <div style={{ fontSize:'0.65rem', color: step === i+1 ? 'var(--accent-primary)' : 'var(--text-muted)', marginTop:4, fontWeight: step === i+1 ? 700 : 400 }}>{s}</div>
            </div>
          ))}
        </div>

        <div className="modal-body">
          {/* Step 1: Setup */}
          {step === 1 && (
            <div>
              <div className="form-group">
                <label className="form-label required">Campaign Name</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. April Recovery Promo 2026" />
              </div>
              <div className="form-group">
                <label className="form-label required">Channel</label>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10 }}>
                  {[['email', ' Email', 'Personalized HTML emails sent via your SMTP server'], ['whatsapp', ' WhatsApp', 'Rich messages with media via WhatsApp Business API'], ['sms', ' SMS', 'Short SMS alerts via your SMS provider']].map(([val, lbl, desc]) => (
                    <div key={val} onClick={() => setForm(f => ({...f, channel: val, template_id: ''}))}
                      style={{ padding:'14px 16px', borderRadius:10, border:`2px solid ${form.channel === val ? 'var(--accent-primary)' : 'var(--border-subtle)'}`, background: form.channel === val ? 'rgba(0,212,255,0.08)' : 'var(--bg-elevated)', cursor:'pointer', transition:'all 0.15s' }}>
                      <div style={{ fontSize:'1.4rem', marginBottom:6 }}>{lbl.split(' ')[0]}</div>
                      <div style={{ fontWeight:700, fontSize:'0.85rem', color: form.channel === val ? 'var(--accent-primary)' : 'var(--text-primary)', marginBottom:4 }}>{lbl.split(' ').slice(1).join(' ')}</div>
                      <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', lineHeight:1.4 }}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Schedule (leave blank to send now)</label>
                <input type="datetime-local" className="form-input" value={form.scheduled_at}
                  min={new Date().toISOString().slice(0,16)}
                  onChange={e => setForm(f => ({...f, scheduled_at: e.target.value}))} />
              </div>
            </div>
          )}

          {/* Step 2: Template */}
          {step === 2 && (
            <div>
              <div style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:14 }}>
                Choose a {form.channel} template for this campaign:
              </div>
              {templates.length === 0 ? (
                <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>
                  No {form.channel} templates yet. Create one first.
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {templates.map(t => (
                    <div key={t.id} onClick={() => setForm(f => ({...f, template_id: t.id}))}
                      style={{ padding:'14px 16px', borderRadius:10, border:`2px solid ${form.template_id === t.id ? 'var(--accent-primary)' : 'var(--border-subtle)'}`, background: form.template_id === t.id ? 'rgba(0,212,255,0.06)' : 'var(--bg-elevated)', cursor:'pointer', transition:'all 0.15s' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                        <div style={{ fontWeight:700, fontSize:'0.85rem', color: form.template_id === t.id ? 'var(--accent-primary)' : 'var(--text-primary)' }}>{t.name}</div>
                        <CatBadge cat={t.category} />
                      </div>
                      {t.subject && <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>Subject: {t.subject}</div>}
                      {t.message && <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:2 }}>{t.message.slice(0,80)}...</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Audience */}
          {step === 3 && (
            <div>
              <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
                {[['all', ' All Clients'], ['email', ' Has Email'], ['phone', ' Has Phone']].map(([val, lbl]) => (
                  <button key={val} onClick={() => { setForm(f => ({...f, audience_filter: val, audience_ids: []})); }}
                    style={{ padding:'8px 16px', borderRadius:8, border:`2px solid ${form.audience_filter === val ? 'var(--accent-primary)' : 'var(--border-subtle)'}`, background: form.audience_filter === val ? 'rgba(0,212,255,0.1)' : 'var(--bg-elevated)', color: form.audience_filter === val ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor:'pointer', fontWeight: form.audience_filter === val ? 700 : 400, fontSize:'0.82rem' }}>
                    {lbl}
                  </button>
                ))}
                <div style={{ marginLeft:'auto', fontSize:'0.78rem', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:8 }}>
                  <span>Selected: <strong style={{ color:'var(--accent-primary)' }}>{selectedCount}</strong> / {filteredAudience.length}</span>
                </div>
              </div>
              {loadingAudience ? (
                <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Loading clients...</div>
              ) : filteredAudience.length === 0 ? (
                <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)', background:'var(--bg-elevated)', borderRadius:10 }}>
                  No clients found. Add clients first in the Clients section.
                </div>
              ) : (
                <div style={{ maxHeight:280, overflowY:'auto', border:'1px solid var(--border-subtle)', borderRadius:10 }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ background:'var(--bg-elevated)', position:'sticky', top:0 }}>
                        <th style={{ width:40, padding:'8px 10px' }}>
                          <input type="checkbox" checked={filteredAudience.every(a => form.audience_ids.includes(a.id))}
                            onChange={() => {
                              const allSelected = filteredAudience.every(a => form.audience_ids.includes(a.id));
                              setForm(f => ({...f, audience_ids: allSelected ? [] : filteredAudience.map(a => a.id) }));
                            }} />
                        </th>
                        <th style={{ padding:'8px 14px', textAlign:'left', fontSize:'0.72rem', color:'var(--text-muted)', fontWeight:700 }}>NAME</th>
                        <th style={{ padding:'8px 14px', textAlign:'left', fontSize:'0.72rem', color:'var(--text-muted)', fontWeight:700 }}>EMAIL</th>
                        <th style={{ padding:'8px 14px', textAlign:'left', fontSize:'0.72rem', color:'var(--text-muted)', fontWeight:700 }}>PHONE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAudience.slice(0, 100).map((a, i) => (
                        <tr key={a.id || i} style={{ borderTop:'1px solid var(--border-subtle)', cursor:'pointer' }}
                          onClick={() => toggleClient(a.id)}>
                          <td style={{ padding:'7px 10px', textAlign:'center' }}>
                            <input type="checkbox" checked={form.audience_ids.includes(a.id)} readOnly />
                          </td>
                          <td style={{ padding:'7px 14px', fontSize:'0.8rem', color:'var(--text-primary)', fontWeight:600 }}>{a.name}</td>
                          <td style={{ padding:'7px 14px', fontSize:'0.78rem', color:'var(--text-secondary)' }}>{a.email || '—'}</td>
                          <td style={{ padding:'7px 14px', fontSize:'0.78rem', color:'var(--text-secondary)' }}>{a.phone || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredAudience.length > 100 && (
                    <div style={{ padding:'8px 14px', textAlign:'center', fontSize:'0.72rem', color:'var(--text-muted)' }}>
                      +{filteredAudience.length - 100} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
                {[
                  ['Campaign Name', form.name],
                  ['Channel', `${CHANNEL_ICONS[form.channel]} ${form.channel.charAt(0).toUpperCase() + form.channel.slice(1)}`],
                  ['Template', selectedTpl?.name || '—'],
                  ['Recipients', selectedCount],
                  ['Schedule', form.scheduled_at ? new Date(form.scheduled_at).toLocaleString('en-IN') : 'Send Immediately'],
                  ['Personalization', form.personalize ? ' Enabled' : ' Disabled'],
                ].map(([label, val]) => (
                  <div key={label} style={{ padding:'12px 14px', background:'var(--bg-elevated)', borderRadius:8, border:'1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginBottom:4, fontWeight:700 }}>{label.toUpperCase()}</div>
                    <div style={{ fontSize:'0.85rem', color:'var(--text-primary)', fontWeight:600 }}>{val}</div>
                  </div>
                ))}
              </div>
              {form.channel === 'email' && (
                <div style={{ padding:'12px 14px', background:'rgba(16,185,129,0.06)', borderRadius:8, border:'1px solid rgba(16,185,129,0.2)', marginBottom:12 }}>
                  <div style={{ fontSize:'0.78rem', fontWeight:700, color:'#10b981', marginBottom:6 }}> Email Delivery Checklist</div>
                  {['Unsubscribe link included in template', 'From name is set', 'Subject line has no spam words', 'SMTP server configured in Super Admin → Email Deliverability', 'SPF & DKIM DNS records set up on your domain'].map(item => (
                    <div key={item} style={{ fontSize:'0.72rem', color:'var(--text-muted)', display:'flex', gap:6, marginBottom:3 }}>
                      <span style={{ color:'#10b981' }}></span>{item}
                    </div>
                  ))}
                </div>
              )}
              {form.channel === 'whatsapp' && (
                <div style={{ padding:'12px 14px', background:'rgba(16,185,129,0.06)', borderRadius:8, border:'1px solid rgba(16,185,129,0.2)', marginBottom:12 }}>
                  <div style={{ fontSize:'0.78rem', fontWeight:700, color:'#10b981', marginBottom:6 }}> WhatsApp Delivery Checklist</div>
                  {['Template approved via WhatsApp Business API', 'Opt-in confirmed for all recipients', 'Sending within 24h window for utility messages'].map(item => (
                    <div key={item} style={{ fontSize:'0.72rem', color:'var(--text-muted)', display:'flex', gap:6, marginBottom:3 }}>
                      <span style={{ color:'#10b981' }}></span>{item}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {sendError && (
          <div style={{ margin: '0 24px 12px', padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: '0.85rem' }}>
            <strong>Send failed:</strong> {sendError}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-ghost" disabled={launching} onClick={step === 1 ? onClose : () => setStep(s => s - 1)}>
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          {step < 4
            ? <button className="btn btn-primary" onClick={() => { setSendError(''); setStep(s => s + 1); }} disabled={step === 1 && !form.name.trim() || step === 2 && !form.template_id}>
                Next →
              </button>
            : <button className="btn btn-primary" onClick={handleLaunch} disabled={launching}
                style={{ background: form.scheduled_at ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#10b981,#059669)', opacity: launching ? 0.7 : 1 }}>
                {launching
                  ? <><div className="spinner" style={{width:14,height:14,display:'inline-block',marginRight:6}}/> Sending…</>
                  : form.scheduled_at ? ' Schedule Campaign' : ' Launch Now'}
              </button>
          }
        </div>
      </div>
    </div>
  );
}

//  Automation Flow Builder 

const TRIGGERS = [
  { key: 'case_created',        label: 'Case Created',           icon: '', desc: 'Fires when a new case is opened' },
  { key: 'case_status_changed', label: 'Case Status Changed',    icon: '', desc: 'Fires whenever case stage changes' },
  { key: 'case_completed',      label: 'Case Completed / Closed',icon: '', desc: 'Fires when case is marked complete' },
  { key: 'invoice_generated',   label: 'Invoice Generated',      icon: '', desc: 'Fires when a new invoice is created' },
  { key: 'payment_received',    label: 'Payment Received',       icon: '', desc: 'Fires when payment is marked as paid' },
  { key: 'client_created',      label: 'New Client Added',       icon: '', desc: 'Fires when a new client is created' },
  { key: 'device_received',     label: 'Device Received',        icon: '', desc: 'Fires when device is checked in' },
  { key: 'quote_sent',          label: 'Quote Sent to Client',   icon: '', desc: 'Fires when a quotation is sent' },
  { key: 'no_response_3d',      label: 'No Response (3 days)',   icon: '', desc: 'Fires if client hasn\'t responded in 3 days' },
  { key: 'subscription_expiry', label: 'Subscription Expiring',  icon: '', desc: 'Fires 7 days before subscription expires' },
  { key: 'birthday',            label: 'Client Birthday',        icon: '', desc: 'Fires on client\'s birthday (if date stored)' },
  { key: 'manual',              label: 'Manual / One-time',      icon: '', desc: 'Triggered manually from a client/case record' },
];

const STEP_TYPES = [
  { key: 'send_email',    label: 'Send Email',        icon: '',  color: '#3b82f6' },
  { key: 'send_whatsapp', label: 'Send WhatsApp',     icon: '',  color: '#10b981' },
  { key: 'send_sms',      label: 'Send SMS',          icon: '',  color: '#f59e0b' },
  { key: 'wait',          label: 'Wait / Delay',      icon: '',  color: '#8b5cf6' },
  { key: 'condition',     label: 'If / Else Condition',icon: '', color: '#06b6d4' },
  { key: 'tag',           label: 'Add Tag to Client', icon: '',  color: '#64748b' },
  { key: 'notify_team',   label: 'Notify Team',       icon: '',  color: '#f97316' },
  { key: 'end',           label: 'End Flow',          icon: '',  color: '#ef4444' },
];

const DEFAULT_FLOWS = [
  {
    id: 'flow_welcome',
    name: 'New Case Welcome Sequence',
    description: 'Automatically send welcome email + WhatsApp when a new case is opened',
    trigger: 'case_created',
    enabled: true,
    createdAt: new Date().toISOString(),
    runs: 0,
    steps: [
      { id: 's1', type: 'send_email',    template_id: 'tpl_welcome', delay_value: 0,  delay_unit: 'minutes', label: 'Send Welcome Email immediately' },
      { id: 's2', type: 'send_whatsapp', template_id: 'wa_welcome',  delay_value: 5,  delay_unit: 'minutes', label: 'Send WhatsApp confirmation after 5 mins' },
      { id: 's3', type: 'wait',          template_id: '',            delay_value: 1,  delay_unit: 'days',    label: 'Wait 1 day' },
      { id: 's4', type: 'send_email',    template_id: 'tpl_update',  delay_value: 0,  delay_unit: 'minutes', label: 'Send status update email' },
    ],
  },
  {
    id: 'flow_invoice',
    name: 'Invoice & Payment Flow',
    description: 'Send invoice email + payment reminder if not paid in 3 days',
    trigger: 'invoice_generated',
    enabled: true,
    createdAt: new Date().toISOString(),
    runs: 0,
    steps: [
      { id: 's1', type: 'send_email',    template_id: 'tpl_invoice', delay_value: 0, delay_unit: 'minutes', label: 'Send invoice email immediately' },
      { id: 's2', type: 'send_whatsapp', template_id: 'wa_invoice',  delay_value: 2, delay_unit: 'minutes', label: 'Send invoice via WhatsApp' },
      { id: 's3', type: 'wait',          template_id: '',            delay_value: 3, delay_unit: 'days',    label: 'Wait 3 days' },
      { id: 's4', type: 'condition',     template_id: '',            delay_value: 0, delay_unit: 'minutes', label: 'Check: Is payment received?', condition_field: 'payment_status', condition_op: 'equals', condition_value: 'paid' },
      { id: 's5', type: 'send_sms',      template_id: 'sms_invoice', delay_value: 0, delay_unit: 'minutes', label: 'If NOT paid → Send SMS reminder', branch: 'no' },
    ],
  },
  {
    id: 'flow_promo',
    name: 'Post-Recovery Promo Offer',
    description: 'Send promo offer 7 days after case is completed',
    trigger: 'case_completed',
    enabled: false,
    createdAt: new Date().toISOString(),
    runs: 0,
    steps: [
      { id: 's1', type: 'wait',       template_id: '',         delay_value: 7,  delay_unit: 'days',    label: 'Wait 7 days after completion' },
      { id: 's2', type: 'send_email', template_id: 'tpl_promo',delay_value: 0,  delay_unit: 'minutes', label: 'Send promotional offer email' },
      { id: 's3', type: 'wait',       template_id: '',         delay_value: 3,  delay_unit: 'days',    label: 'Wait 3 more days' },
      { id: 's4', type: 'condition',  template_id: '',         delay_value: 0,  delay_unit: 'minutes', label: 'Check: Opened promo email?', condition_field: 'email_opened', condition_op: 'equals', condition_value: 'true' },
      { id: 's5', type: 'send_whatsapp', template_id: 'wa_promo', delay_value: 0, delay_unit: 'minutes', label: 'If NOT opened → Send WhatsApp promo', branch: 'no' },
    ],
  },
  //  WhatsApp-first flows 
  {
    id: 'flow_wa_onboard',
    name: ' WhatsApp Onboarding Drip',
    description: 'WhatsApp-first 3-touch welcome sequence for every new client',
    trigger: 'client_created',
    enabled: true,
    channel: 'whatsapp',
    createdAt: new Date().toISOString(),
    runs: 0,
    steps: [
      { id: 'w1', type: 'send_whatsapp', template_id: 'wa_welcome', delay_value: 0, delay_unit: 'minutes', label: 'Instant WhatsApp welcome message' },
      { id: 'w2', type: 'tag',           template_id: '',           delay_value: 0, delay_unit: 'minutes', label: 'Tag client as "onboarding"', tag_value: 'onboarding' },
      { id: 'w3', type: 'wait',          template_id: '',           delay_value: 1, delay_unit: 'days',    label: 'Wait 1 day' },
      { id: 'w4', type: 'send_whatsapp', template_id: 'wa_update',  delay_value: 0, delay_unit: 'minutes', label: 'Day 2 — case progress check-in' },
      { id: 'w5', type: 'wait',          template_id: '',           delay_value: 2, delay_unit: 'days',    label: 'Wait 2 more days' },
      { id: 'w6', type: 'condition',     template_id: '',           delay_value: 0, delay_unit: 'minutes', label: 'Check: Case still open?', condition_field: 'case_status', condition_op: 'not_equals', condition_value: 'completed' },
      { id: 'w7', type: 'send_whatsapp', template_id: 'wa_update',  delay_value: 0, delay_unit: 'minutes', label: 'Day 4 — if still open, send update', branch: 'yes' },
      { id: 'w8', type: 'notify_team',   template_id: '',           delay_value: 0, delay_unit: 'minutes', label: 'Notify team if no resolution yet', notify_message: 'Client {{name}} has been waiting 4 days — please check case {{case_id}}', notify_channel: 'in_app' },
    ],
  },
  {
    id: 'flow_wa_payment',
    name: ' WhatsApp Payment Nudge',
    description: 'Send invoice via WhatsApp + 2 automated payment reminders if unpaid',
    trigger: 'invoice_generated',
    enabled: true,
    channel: 'whatsapp',
    createdAt: new Date().toISOString(),
    runs: 0,
    steps: [
      { id: 'p1', type: 'send_whatsapp', template_id: 'wa_invoice',  delay_value: 0, delay_unit: 'minutes', label: 'Send invoice on WhatsApp immediately' },
      { id: 'p2', type: 'wait',          template_id: '',            delay_value: 2, delay_unit: 'days',    label: 'Wait 2 days' },
      { id: 'p3', type: 'condition',     template_id: '',            delay_value: 0, delay_unit: 'minutes', label: 'Check: Payment received?', condition_field: 'payment_status', condition_op: 'not_equals', condition_value: 'paid' },
      { id: 'p4', type: 'send_whatsapp', template_id: 'wa_invoice',  delay_value: 0, delay_unit: 'minutes', label: '1st reminder — if not paid', branch: 'yes' },
      { id: 'p5', type: 'send_sms',      template_id: 'sms_invoice', delay_value: 0, delay_unit: 'minutes', label: 'Also send SMS reminder simultaneously', branch: 'yes' },
      { id: 'p6', type: 'wait',          template_id: '',            delay_value: 3, delay_unit: 'days',    label: 'Wait 3 more days' },
      { id: 'p7', type: 'condition',     template_id: '',            delay_value: 0, delay_unit: 'minutes', label: 'Still unpaid after 5 days?', condition_field: 'payment_status', condition_op: 'not_equals', condition_value: 'paid' },
      { id: 'p8', type: 'notify_team',   template_id: '',            delay_value: 0, delay_unit: 'minutes', label: 'Escalate to team if still unpaid', notify_message: ' Invoice overdue for {{name}} ({{amount}}) — Case {{case_id}}', notify_channel: 'whatsapp' },
    ],
  },
  {
    id: 'flow_wa_promo_drip',
    name: ' WhatsApp Promo Campaign',
    description: 'Re-engage past clients with WhatsApp promo → follow-up if no reply',
    trigger: 'manual',
    enabled: false,
    channel: 'whatsapp',
    createdAt: new Date().toISOString(),
    runs: 0,
    steps: [
      { id: 'r1', type: 'send_whatsapp', template_id: 'wa_promo',   delay_value: 0,  delay_unit: 'minutes', label: 'Send promo offer on WhatsApp' },
      { id: 'r2', type: 'tag',           template_id: '',           delay_value: 0,  delay_unit: 'minutes', label: 'Tag as "promo_sent"', tag_value: 'promo_sent' },
      { id: 'r3', type: 'wait',          template_id: '',           delay_value: 2,  delay_unit: 'days',    label: 'Wait 2 days for reply' },
      { id: 'r4', type: 'condition',     template_id: '',           delay_value: 0,  delay_unit: 'minutes', label: 'Did client reply / engage?', condition_field: 'wa_replied', condition_op: 'equals', condition_value: 'false' },
      { id: 'r5', type: 'send_whatsapp', template_id: 'wa_promo',   delay_value: 0,  delay_unit: 'minutes', label: 'No reply → send follow-up message', branch: 'yes' },
      { id: 'r6', type: 'wait',          template_id: '',           delay_value: 3,  delay_unit: 'days',    label: 'Wait 3 more days' },
      { id: 'r7', type: 'send_sms',      template_id: 'sms_promo',  delay_value: 0,  delay_unit: 'minutes', label: 'Final touch — SMS if still no response' },
      { id: 'r8', type: 'end',           template_id: '',           delay_value: 0,  delay_unit: 'minutes', label: 'End flow' },
    ],
  },
  {
    id: 'flow_wa_birthday',
    name: ' Birthday WhatsApp Greeting',
    description: 'Automatically wish clients on their birthday with a special discount',
    trigger: 'birthday',
    enabled: true,
    channel: 'whatsapp',
    createdAt: new Date().toISOString(),
    runs: 0,
    steps: [
      { id: 'b1', type: 'send_whatsapp', template_id: 'wa_promo',  delay_value: 0, delay_unit: 'minutes', label: ' Send birthday greeting + offer on WhatsApp' },
      { id: 'b2', type: 'tag',           template_id: '',          delay_value: 0, delay_unit: 'minutes', label: 'Tag client as "birthday_wished"', tag_value: 'birthday_wished' },
      { id: 'b3', type: 'wait',          template_id: '',          delay_value: 3, delay_unit: 'days',    label: 'Wait 3 days' },
      { id: 'b4', type: 'condition',     template_id: '',          delay_value: 0, delay_unit: 'minutes', label: 'Did they book a service?', condition_field: 'case_status', condition_op: 'equals', condition_value: 'new' },
      { id: 'b5', type: 'notify_team',   template_id: '',          delay_value: 0, delay_unit: 'minutes', label: 'If booked → notify team to give VIP treatment', notify_message: ' Birthday client {{name}} has booked a case — give VIP treatment!', notify_channel: 'in_app' },
    ],
  },
];

//  Flow Step Node (visual card) 
function StepNode({ step, index, emailTemplates, waTemplates, smsTemplates, onChange, onDelete, onMoveUp, onMoveDown, isLast }) {
  const stepType = STEP_TYPES.find(t => t.key === step.type) || STEP_TYPES[0];
  const allTemplates = step.type === 'send_email' ? emailTemplates : step.type === 'send_whatsapp' ? waTemplates : step.type === 'send_sms' ? smsTemplates : [];
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      {/* Connector line from above */}
      {index > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 0 0 20px' }}>
          <div style={{ width: 2, height: 20, background: `${stepType.color}40` }} />
          <div style={{ fontSize: '0.65rem', color: step.delay_value > 0 ? stepType.color : 'var(--text-muted)', fontWeight: 700, background: step.delay_value > 0 ? `${stepType.color}15` : 'var(--bg-elevated)', padding: '2px 10px', borderRadius: 99, border: `1px solid ${step.delay_value > 0 ? stepType.color + '40' : 'var(--border-subtle)'}`, marginBottom: 4 }}>
            {step.delay_value > 0 ? ` after ${step.delay_value} ${step.delay_unit}` : 'immediately'}
          </div>
          <div style={{ width: 2, height: 12, background: `${stepType.color}40` }} />
          <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `6px solid ${stepType.color}60` }} />
        </div>
      )}

      {/* Step card */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden', transition: 'all 0.15s' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }} onClick={() => setExpanded(e => !e)}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${stepType.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>{stepType.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: stepType.color }}>{stepType.label}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1 }}>
              {step.type === 'wait' ? ` ${step.delay_value} ${step.delay_unit}` :
               step.type === 'condition' ? ` If ${step.condition_field || 'field'} ${step.condition_op || 'equals'} "${step.condition_value || '...'}"` :
               step.type === 'tag' ? ` Tag: ${step.tag_value || '...'}` :
               step.type === 'notify_team' ? ` ${step.notify_message || 'Team notification'}` :
               step.type === 'end' ? ' End of flow' :
               allTemplates.find(t => t.id === step.template_id)?.name || 'Select template...'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button onClick={e => { e.stopPropagation(); onMoveUp(); }} disabled={index === 0} style={{ background: 'none', border: 'none', cursor: index===0?'default':'pointer', color: 'var(--text-muted)', fontSize: '0.75rem', opacity: index===0?0.3:1, padding: '2px 4px' }} title="Move up"></button>
            <button onClick={e => { e.stopPropagation(); onMoveDown(); }} disabled={isLast} style={{ background: 'none', border: 'none', cursor: isLast?'default':'pointer', color: 'var(--text-muted)', fontSize: '0.75rem', opacity: isLast?0.3:1, padding: '2px 4px' }} title="Move down"></button>
            <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.8rem', padding: '2px 6px' }} title="Remove step"></button>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginLeft: 4 }}>{expanded ? '' : ''}</span>
          </div>
        </div>

        {/* Expanded config */}
        {expanded && (
          <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${stepType.color}20`, background: `${stepType.color}05` }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>

              {/* Delay config (for all step types except trigger/end) */}
              {step.type !== 'end' && (
                <>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.68rem' }}>Delay after previous step</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="number" className="form-input" value={step.delay_value} min={0} onChange={e => onChange({ delay_value: parseInt(e.target.value) || 0 })} style={{ width: 70 }} />
                      <select className="form-select" value={step.delay_unit} onChange={e => onChange({ delay_unit: e.target.value })} style={{ flex: 1 }}>
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* Template picker for email/wa/sms */}
              {['send_email', 'send_whatsapp', 'send_sms'].includes(step.type) && (
                <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                  <label className="form-label" style={{ fontSize: '0.68rem' }}>Template</label>
                  <select className="form-select" value={step.template_id} onChange={e => onChange({ template_id: e.target.value })}>
                    <option value="">— Select template —</option>
                    {allTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              {/* Condition fields */}
              {step.type === 'condition' && (
                <>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.68rem' }}>Field to check</label>
                    <select className="form-select" value={step.condition_field || ''} onChange={e => onChange({ condition_field: e.target.value })}>
                      <option value="">— Select field —</option>
                      <option value="payment_status">Payment Status</option>
                      <option value="email_opened">Email Opened</option>
                      <option value="case_status">Case Status</option>
                      <option value="client_tag">Client Tag</option>
                      <option value="email_clicked">Link Clicked</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.68rem' }}>Operator</label>
                    <select className="form-select" value={step.condition_op || 'equals'} onChange={e => onChange({ condition_op: e.target.value })}>
                      <option value="equals">Equals</option>
                      <option value="not_equals">Not equals</option>
                      <option value="contains">Contains</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.68rem' }}>Value</label>
                    <input className="form-input" value={step.condition_value || ''} onChange={e => onChange({ condition_value: e.target.value })} placeholder="e.g. paid, true, completed" />
                  </div>
                </>
              )}

              {/* Tag step */}
              {step.type === 'tag' && (
                <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                  <label className="form-label" style={{ fontSize: '0.68rem' }}>Tag to add</label>
                  <input className="form-input" value={step.tag_value || ''} onChange={e => onChange({ tag_value: e.target.value })} placeholder="e.g. hot_lead, vip, promo_sent" />
                </div>
              )}

              {/* Notify step */}
              {step.type === 'notify_team' && (
                <>
                  <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                    <label className="form-label" style={{ fontSize: '0.68rem' }}>Notification message</label>
                    <input className="form-input" value={step.notify_message || ''} onChange={e => onChange({ notify_message: e.target.value })} placeholder="e.g. Client {{name}} hasn't responded in 3 days" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.68rem' }}>Notify via</label>
                    <select className="form-select" value={step.notify_channel || 'in_app'} onChange={e => onChange({ notify_channel: e.target.value })}>
                      <option value="in_app">In-app notification</option>
                      <option value="email">Email to team</option>
                      <option value="whatsapp">WhatsApp to team</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

//  Add Step Panel 
function AddStepPanel({ onAdd }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 2, height: 16, background: 'var(--border-subtle)' }} />
        <div style={{ padding: '10px 16px', background: 'var(--bg-elevated)', border: '2px dashed var(--border-subtle)', borderRadius: 10, width: '100%', boxSizing: 'border-box' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: 10, fontWeight: 600 }}>+ Add next step</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {STEP_TYPES.map(t => (
              <button key={t.key} onClick={() => onAdd(t.key)}
                style={{ padding: '8px 6px', borderRadius: 8, border: `1px solid ${t.color}40`, background: `${t.color}10`, color: t.color, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', transition: 'all 0.12s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
                onMouseEnter={e => { e.currentTarget.style.background = `${t.color}22`; e.currentTarget.style.borderColor = `${t.color}80`; }}
                onMouseLeave={e => { e.currentTarget.style.background = `${t.color}10`; e.currentTarget.style.borderColor = `${t.color}40`; }}>
                <span style={{ fontSize: '1rem' }}>{t.icon}</span>
                <span style={{ lineHeight: 1.2 }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

//  Flow Editor Modal 
function FlowEditor({ flow, emailTemplates, waTemplates, smsTemplates, onSave, onClose }) {
  const [form, setForm] = useState({
    name: flow?.name || '',
    description: flow?.description || '',
    trigger: flow?.trigger || 'case_created',
    enabled: flow?.enabled !== false,
    steps: flow?.steps ? JSON.parse(JSON.stringify(flow.steps)) : [],
  });

  const addStep = (type) => {
    const newStep = {
      id: `s_${Date.now()}`,
      type,
      template_id: '',
      delay_value: type === 'wait' ? 1 : 0,
      delay_unit: type === 'wait' ? 'days' : 'minutes',
    };
    setForm(f => ({ ...f, steps: [...f.steps, newStep] }));
  };

  const updateStep = (id, changes) => {
    setForm(f => ({ ...f, steps: f.steps.map(s => s.id === id ? { ...s, ...changes } : s) }));
  };

  const deleteStep = (id) => {
    setForm(f => ({ ...f, steps: f.steps.filter(s => s.id !== id) }));
  };

  const moveStep = (idx, dir) => {
    setForm(f => {
      const steps = [...f.steps];
      const target = idx + dir;
      if (target < 0 || target >= steps.length) return f;
      [steps[idx], steps[target]] = [steps[target], steps[idx]];
      return { ...f, steps };
    });
  };

  const handleSave = () => {
    if (!form.name.trim()) { alert('Flow name is required.'); return; }
    if (!form.trigger) { alert('Please select a trigger.'); return; }
    onSave({
      ...form,
      id: flow?.id || `flow_${Date.now()}`,
      runs: flow?.runs || 0,
      createdAt: flow?.createdAt || new Date().toISOString(),
    });
  };

  const triggerDef = TRIGGERS.find(t => t.key === form.trigger);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 1000, width: '96vw', height: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h3 className="modal-title"> {flow?.id ? 'Edit' : 'Create'} Automation Flow</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}></button>
        </div>

        {/* Meta */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Flow Name *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. New Case Welcome Sequence" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Description</label>
            <input className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this flow do?" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Enabled</span>
            <div onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
              style={{ width: 44, height: 24, borderRadius: 99, background: form.enabled ? '#10b981' : 'var(--border-subtle)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
              <div style={{ position: 'absolute', top: 3, left: form.enabled ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '260px 1fr', overflow: 'hidden' }}>
          {/* Left: Trigger selector */}
          <div style={{ borderRight: '1px solid var(--border-subtle)', padding: 16, overflowY: 'auto' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}> Trigger Event</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
              Select what event starts this automation flow:
            </div>
            {TRIGGERS.map(t => (
              <div key={t.key} onClick={() => setForm(f => ({ ...f, trigger: t.key }))}
                style={{ display: 'flex', gap: 8, padding: '8px 10px', marginBottom: 4, borderRadius: 8, border: `1.5px solid ${form.trigger === t.key ? 'var(--accent-primary)' : 'var(--border-subtle)'}`, background: form.trigger === t.key ? 'rgba(0,212,255,0.08)' : 'var(--bg-elevated)', cursor: 'pointer', transition: 'all 0.12s', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>{t.icon}</span>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: form.trigger === t.key ? 700 : 500, color: form.trigger === t.key ? 'var(--accent-primary)' : 'var(--text-primary)' }}>{t.label}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 1, lineHeight: 1.3 }}>{t.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Right: Flow canvas */}
          <div style={{ overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '12px 16px', background: 'rgba(0,212,255,0.06)', borderRadius: 10, border: '1px solid rgba(0,212,255,0.2)' }}>
              <span style={{ fontSize: '1.5rem' }}>{triggerDef?.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--accent-primary)' }}>Trigger: {triggerDef?.label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{triggerDef?.desc}</div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: '0.68rem', padding: '3px 10px', borderRadius: 99, background: form.enabled ? 'rgba(16,185,129,0.15)' : 'rgba(100,116,139,0.15)', color: form.enabled ? '#10b981' : '#64748b', fontWeight: 700 }}>
                {form.enabled ? ' ACTIVE' : ' INACTIVE'}
              </div>
            </div>

            {form.steps.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 8 }}>
                No steps yet — add your first action below ↓
              </div>
            )}

            {form.steps.map((step, i) => (
              <StepNode
                key={step.id}
                step={step}
                index={i}
                emailTemplates={emailTemplates}
                waTemplates={waTemplates}
                smsTemplates={smsTemplates}
                onChange={(changes) => updateStep(step.id, changes)}
                onDelete={() => deleteStep(step.id)}
                onMoveUp={() => moveStep(i, -1)}
                onMoveDown={() => moveStep(i, 1)}
                isLast={i === form.steps.length - 1}
              />
            ))}

            <AddStepPanel onAdd={addStep} />
          </div>
        </div>

        <div className="modal-footer" style={{ flexShrink: 0 }}>
          <div style={{ flex: 1, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {form.steps.length} step{form.steps.length !== 1 ? 's' : ''} · Trigger: {triggerDef?.label}
          </div>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}> Save Flow</button>
        </div>
      </div>
    </div>
  );
}

//  WhatsApp Marketing Hub 
function WhatsAppMarketingHub({ waTemplates, onNewCampaign, onEditTemplate, onNewTemplate, onSwitchTab }) {
  const [broadcastForm, setBroadcastForm] = useState({ template_id: '', message: '', audience: 'all', schedule: '' });
  const [broadcastSent, setBroadcastSent] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');
  const waFlows = ls.get('crm_email_flows', DEFAULT_FLOWS).filter(f => f.channel === 'whatsapp' || f.id?.startsWith('flow_wa') || f.steps?.some(s => s.type === 'send_whatsapp'));
  const audience = getSampleAudience();
  const sentCampaigns = ls.get('crm_campaigns', []).filter(c => c.channel === 'whatsapp');

  const WA_FEATURES = [
    { icon: '', label: 'Broadcast', desc: 'Send to all contacts at once', color: '#10b981', section: 'broadcast' },
    { icon: '', label: 'Automated Flows', desc: 'Trigger-based sequences', color: '#8b5cf6', section: 'flows' },
    { icon: '', label: 'Templates', desc: 'Pre-approved message templates', color: '#3b82f6', section: 'templates' },
    { icon: '', label: 'Analytics', desc: 'Open & reply rates', color: '#f59e0b', section: 'analytics' },
  ];

  const WA_TIPS = [
    { icon: '', tip: 'Get opt-in consent before messaging — required by WhatsApp Business Policy' },
    { icon: '', tip: 'Best time to send: 10am–12pm or 6pm–9pm in recipient\'s timezone' },
    { icon: '', tip: 'Use approved templates for marketing; free-form only in 24h reply window' },
    { icon: '', tip: 'Avoid bulk spam — too many reports will get your number banned' },
    { icon: '', tip: 'Include images or PDFs for higher engagement rates (2–3x more opens)' },
    { icon: '', tip: 'Always include a clear CTA and easy way to unsubscribe (reply STOP)' },
  ];

  const sendBroadcast = () => {
    if (!broadcastForm.template_id) { alert('Please select a WhatsApp template.'); return; }
    const tpl = waTemplates.find(t => t.id === broadcastForm.template_id);
    const count = audience.filter(a => a.phone).length || audience.length;
    const camp = {
      id: `camp_wa_${Date.now()}`, name: `WhatsApp Broadcast — ${tpl?.name || 'Custom'}`,
      channel: 'whatsapp', template_id: broadcastForm.template_id,
      audience_count: count, status: broadcastForm.schedule ? 'scheduled' : 'sent',
      sentAt: broadcastForm.schedule || new Date().toISOString(), createdAt: new Date().toISOString(),
      opened: 0, clicked: 0, failed: 0,
    };
    const existing = ls.get('crm_campaigns', []);
    ls.set('crm_campaigns', [camp, ...existing]);
    setBroadcastSent(true);
    setTimeout(() => setBroadcastSent(false), 3000);
    setBroadcastForm({ template_id: '', message: '', audience: 'all', schedule: '' });
  };

  return (
    <div>
      {/* Hero banner */}
      <div style={{ background: 'linear-gradient(135deg, #064e3b, #065f46, #047857)', borderRadius: 14, padding: '24px 28px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -20, top: -20, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', right: 60, bottom: -40, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />
        <div style={{ fontSize: '3rem', flexShrink: 0 }}></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: '1.3rem', color: '#fff', marginBottom: 6 }}>WhatsApp Marketing Hub</div>
          <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
            Broadcast messages, run automated drip campaigns & send personalised WhatsApp messages at scale via WhatsApp Business API.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={onNewCampaign} style={{ padding: '10px 18px', background: '#fff', color: '#065f46', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}> New Campaign</button>
          <button onClick={onNewTemplate} style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>+ New Template</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          ['', 'WA Templates', waTemplates.length, '#10b981'],
          ['', 'Broadcasts Sent', sentCampaigns.filter(c=>c.status==='sent').length, '#3b82f6'],
          ['', 'Active Flows', waFlows.filter(f=>f.enabled).length, '#8b5cf6'],
          ['', 'Total Contacts', audience.filter(a=>a.phone).length || audience.length, '#f59e0b'],
          ['', 'Scheduled', sentCampaigns.filter(c=>c.status==='scheduled').length, '#06b6d4'],
        ].map(([icon, label, val, color]) => (
          <div key={label} style={{ padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{icon}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color, lineHeight: 1 }}>{val}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Feature nav */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {WA_FEATURES.map(f => (
          <div key={f.section} onClick={() => setActiveSection(f.section)}
            style={{ flex: 1, padding: '14px 16px', borderRadius: 10, border: `2px solid ${activeSection === f.section ? f.color : 'var(--border-subtle)'}`, background: activeSection === f.section ? `${f.color}10` : 'var(--bg-elevated)', cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', marginBottom: 6 }}>{f.icon}</div>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: activeSection === f.section ? f.color : 'var(--text-primary)', marginBottom: 3 }}>{f.label}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/*  Broadcast Section  */}
      {activeSection === 'broadcast' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: 16 }}> Send Broadcast</div>

            <div className="form-group">
              <label className="form-label">Select Template *</label>
              <select className="form-select" value={broadcastForm.template_id} onChange={e => setBroadcastForm(f => ({...f, template_id: e.target.value}))}>
                <option value="">— Choose a WhatsApp template —</option>
                {waTemplates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Audience</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[['all', ' All Contacts', audience.length], ['phone', ' Has Phone', audience.filter(a=>a.phone).length], ['vip', ' VIP Only', Math.floor(audience.length * 0.2)]].map(([val, lbl, count]) => (
                  <div key={val} onClick={() => setBroadcastForm(f => ({...f, audience: val}))}
                    style={{ padding: '10px', borderRadius: 8, border: `2px solid ${broadcastForm.audience === val ? '#10b981' : 'var(--border-subtle)'}`, background: broadcastForm.audience === val ? 'rgba(16,185,129,0.08)' : 'var(--bg-elevated)', cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: broadcastForm.audience === val ? '#10b981' : 'var(--text-primary)' }}>{lbl}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{count} contacts</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Schedule (leave blank to send now)</label>
              <input type="datetime-local" className="form-input" value={broadcastForm.schedule}
                min={new Date().toISOString().slice(0,16)}
                onChange={e => setBroadcastForm(f => ({...f, schedule: e.target.value}))} />
            </div>

            <button onClick={sendBroadcast}
              style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, #065f46, #10b981)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', marginTop: 8 }}>
              {broadcastForm.schedule ? ' Schedule Broadcast' : ' Send Broadcast Now'}
            </button>

            {broadcastSent && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, color: '#10b981', fontWeight: 700, fontSize: '0.82rem', textAlign: 'center' }}>
                 Broadcast sent successfully! Check Campaigns tab for status.
              </div>
            )}

            {/* WhatsApp tips */}
            <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 10 }}> WhatsApp Marketing Tips</div>
              {WA_TIPS.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 7, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <span style={{ flexShrink: 0 }}>{t.icon}</span><span>{t.tip}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Phone preview */}
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: 16 }}> Message Preview</div>
            {/* Phone frame */}
            <div style={{ maxWidth: 320, margin: '0 auto', background: '#1a1a1a', borderRadius: 40, padding: '16px 8px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', border: '3px solid #333' }}>
              {/* Notch */}
              <div style={{ width: 100, height: 24, background: '#1a1a1a', borderRadius: 12, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#333' }} />
                <div style={{ width: 40, height: 6, borderRadius: 3, background: '#333' }} />
              </div>
              {/* WhatsApp interface */}
              <div style={{ background: '#fff', borderRadius: 24, overflow: 'hidden', height: 480 }}>
                {/* WA header */}
                <div style={{ background: '#075e54', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#128c7e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}></div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.88rem' }}>Your Company</div>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem' }}>Business Account </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
                    <span style={{ color: '#fff', fontSize: '1rem' }}></span>
                    <span style={{ color: '#fff', fontSize: '1rem' }}></span>
                  </div>
                </div>
                {/* Chat background */}
                <div style={{ background: '#e5ddd5', padding: 12, height: 380, overflowY: 'auto', backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.03) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                  {/* Date */}
                  <div style={{ textAlign: 'center', marginBottom: 12 }}>
                    <span style={{ background: 'rgba(255,255,255,0.8)', padding: '3px 12px', borderRadius: 99, fontSize: '0.65rem', color: '#667781' }}>Today</span>
                  </div>
                  {/* Message bubble */}
                  {broadcastForm.template_id ? (() => {
                    const tpl = waTemplates.find(t => t.id === broadcastForm.template_id);
                    if (!tpl) return null;
                    let msg = tpl.message
                      .replace('{{name}}', 'Raj Patel')
                      .replace('{{company_name}}', 'RecoverLab')
                      .replace('{{case_id}}', 'CAS-2024-001')
                      .replace('{{case_status}}', 'In Progress')
                      .replace('{{device}}', 'WD 2TB HDD')
                      .replace('{{technician}}', 'Amit Kumar')
                      .replace('{{amount}}', '₹4,500')
                      .replace('{{invoice_no}}', 'INV-042')
                      .replace('{{expiry_date}}', '30 Apr 2026')
                      .replace('{{portal_link}}', 'https://recoverlab.in/track')
                      .replace('{{support_phone}}', '+91 98765 00000')
                      .replace('{{support_email}}', 'support@recoverlab.in');
                    msg = msg.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
                    msg = msg.replace(/_([^_]+)_/g, '<em>$1</em>');
                    msg = msg.replace(/\n/g, '<br>');
                    return (
                      <div style={{ maxWidth: '85%' }}>
                        {tpl.mediaType && tpl.mediaType !== 'none' && (
                          <div style={{ background: '#dcf8c6', borderRadius: '8px 8px 0 0', padding: 10, textAlign: 'center', marginBottom: 0 }}>
                            <div style={{ background: 'rgba(0,0,0,0.06)', borderRadius: 6, padding: '12px 20px', fontSize: '0.75rem', color: '#555' }}>
                              {tpl.mediaType === 'image' ? ' Image' : tpl.mediaType === 'document' ? ' PDF Document' : ' Video'}
                            </div>
                          </div>
                        )}
                        <div style={{ background: '#dcf8c6', borderRadius: tpl.mediaType && tpl.mediaType !== 'none' ? '0 0 8px 8px' : '0 8px 8px 8px', padding: '8px 12px', fontSize: '0.78rem', color: '#111', lineHeight: 1.6, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}
                          dangerouslySetInnerHTML={{ __html: msg }} />
                        <div style={{ textAlign: 'right', fontSize: '0.6rem', color: '#667781', marginTop: 2 }}>
                          {new Date().toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})} 
                        </div>
                      </div>
                    );
                  })() : (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#667781', fontSize: '0.78rem' }}>
                      Select a template above to preview how it will look
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/*  Automated Flows Section  */}
      {activeSection === 'flows' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              WhatsApp automation flows — trigger messages are sent automatically when events happen:
            </div>
            <button onClick={() => onSwitchTab('automations')} className="btn btn-secondary"> Open Flow Builder</button>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {waFlows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No WhatsApp flows yet. Go to Automations tab to create one.</div>
            ) : waFlows.map(flow => {
              const trigDef = TRIGGERS.find(t => t.key === flow.trigger);
              const waSteps = flow.steps?.filter(s => s.type === 'send_whatsapp') || [];
              return (
                <div key={flow.id} style={{ background: 'var(--bg-elevated)', border: `1px solid ${flow.enabled ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)'}`, borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ width: 40, height: 22, borderRadius: 99, background: flow.enabled ? '#10b981' : 'var(--border-subtle)', position: 'relative', flexShrink: 0, marginTop: 2, cursor: 'pointer' }}
                      onClick={() => {
                        const flows = ls.get('crm_email_flows', DEFAULT_FLOWS);
                        ls.set('crm_email_flows', flows.map(f => f.id === flow.id ? {...f, enabled: !f.enabled} : f));
                      }}>
                      <div style={{ position: 'absolute', top: 2, left: flow.enabled ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>{flow.name}</span>
                        <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 99, background: flow.enabled ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)', color: flow.enabled ? '#10b981' : '#64748b', fontWeight: 700 }}>{flow.enabled ? ' ACTIVE' : ' PAUSED'}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 10 }}>{flow.description}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 99, background: 'rgba(0,212,255,0.08)', color: 'var(--accent-primary)', fontWeight: 700, border: '1px solid rgba(0,212,255,0.2)' }}>{trigDef?.icon} {trigDef?.label}</span>
                        <span style={{ fontSize: '0.7rem', color: '#10b981' }}> {waSteps.length} WA messages</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{flow.steps?.length || 0} total steps</span>
                        {/* step emoji chain */}
                        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                          {(flow.steps || []).map((s, i) => {
                            const st = STEP_TYPES.find(t => t.key === s.type);
                            return <React.Fragment key={s.id || i}>{i>0 && <span style={{ color:'var(--border-subtle)', fontSize:'0.6rem' }}>→</span>}<span style={{ fontSize:'0.85rem' }}>{st?.icon}</span></React.Fragment>;
                          })}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => onSwitchTab('automations')} className="btn btn-sm btn-ghost"> Edit</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/*  Templates Section  */}
      {activeSection === 'templates' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-muted)' }}>Your approved WhatsApp message templates:</div>
            <button onClick={onNewTemplate} className="btn btn-secondary">+ Create Template</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {waTemplates.map(t => (
              <div key={t.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: 14, background: '#e5ddd5', minHeight: 90 }}>
                  {t.mediaType && t.mediaType !== 'none' && (
                    <div style={{ background: 'rgba(0,0,0,0.08)', borderRadius: 6, padding: '6px 10px', fontSize: '0.68rem', color: '#555', marginBottom: 6, textAlign: 'center' }}>
                      {t.mediaType === 'image' ? ' Image' : t.mediaType === 'document' ? ' Document' : ' Video'}
                    </div>
                  )}
                  <div style={{ background: '#fff', borderRadius: '0 8px 8px 8px', padding: '8px 10px', fontSize: '0.72rem', color: '#111', lineHeight: 1.5, maxWidth: '85%', whiteSpace: 'pre-line', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                    {t.message.slice(0, 100)}{t.message.length > 100 ? '...' : ''}
                  </div>
                </div>
                <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{t.name}</div>
                    <CatBadge cat={t.category} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => onEditTemplate(t)}></button>
                    <button className="btn btn-sm btn-primary" style={{ fontSize: '0.7rem', padding: '4px 10px' }} onClick={onNewCampaign}> Send</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/*  Analytics Section  */}
      {activeSection === 'analytics' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            {[
              ['', 'Broadcasts', sentCampaigns.length, '#3b82f6'],
              ['', 'Delivered',  sentCampaigns.reduce((s,c)=>s+(c.audience_count||0),0), '#10b981'],
              ['', 'Avg Read Rate', '67%', '#8b5cf6'],
              ['', 'Avg Reply Rate', '23%', '#f59e0b'],
            ].map(([icon, label, val, color]) => (
              <div key={label} style={{ padding: 20, background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{icon}</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '16px 20px', background: 'rgba(16,185,129,0.06)', borderRadius: 12, border: '1px solid rgba(16,185,129,0.2)', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong style={{ color: '#10b981' }}> WhatsApp vs Email:</strong><br />
            WhatsApp messages typically achieve <strong>95%+ open rates</strong> vs ~20–25% for email, and <strong>25–30% reply rates</strong> vs 2–5% for email. Use WhatsApp for time-sensitive messages and email for detailed content.
          </div>
          {sentCampaigns.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', marginTop: 16 }}>No WhatsApp campaigns yet. Send your first broadcast above!</div>
          )}
        </div>
      )}
    </div>
  );
}

//  Automations Tab 
function AutomationsTab({ emailTemplates, waTemplates, smsTemplates }) {
  const [flows, setFlows] = useState(() => ls.get('crm_email_flows', DEFAULT_FLOWS));
  const [showEditor, setShowEditor] = useState(null);
  const [search, setSearch] = useState('');

  const saveFlows = (f) => { setFlows(f); ls.set('crm_email_flows', f); };

  const toggleFlow = (id) => {
    saveFlows(flows.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));
  };

  const deleteFlow = (id) => {
    if (window.confirm('Delete this automation flow?')) saveFlows(flows.filter(f => f.id !== id));
  };

  const simulateRun = (id) => {
    saveFlows(flows.map(f => f.id === id ? { ...f, runs: (f.runs || 0) + 1 } : f));
    alert(' Flow simulated! In production this would execute on a matching trigger event.');
  };

  const filtered = flows.filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || f.description?.toLowerCase().includes(search.toLowerCase()));
  const activeCount = flows.filter(f => f.enabled).length;
  const totalRuns = flows.reduce((s, f) => s + (f.runs || 0), 0);

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          ['', 'Total Flows',  flows.length,   '#3b82f6'],
          ['', 'Active Flows', activeCount,     '#10b981'],
          ['', 'Total Runs',   totalRuns,       '#8b5cf6'],
          ['', 'Paused',       flows.length - activeCount, '#f59e0b'],
        ].map(([icon, label, val, color]) => (
          <div key={label} style={{ padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>{icon}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color, lineHeight: 1 }}>{val}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input className="form-input" value={search} onChange={e => setSearch(e.target.value)} placeholder=" Search flows..." style={{ maxWidth: 280 }} />
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => setShowEditor({})}
          style={{ background: 'linear-gradient(135deg,#7c3aed,#3b82f6)', fontWeight: 700 }}>
           Create Flow
        </button>
      </div>

      {/* Info banner */}
      <div style={{ padding: '10px 16px', background: 'rgba(59,130,246,0.06)', borderRadius: 10, border: '1px solid rgba(59,130,246,0.2)', marginBottom: 16, fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ fontSize: '1.1rem', flexShrink: 0 }}></span>
        <div>
          <strong>How automations work:</strong> Each flow watches for a trigger event (e.g. "Case Created"). When the event fires, the flow runs its steps automatically — waiting the configured delay between each step, then sending the email/WhatsApp/SMS to the relevant client using their personalized data.
          In production, flows run server-side so they execute even when you're offline.
        </div>
      </div>

      {/* Flow cards */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}></div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>No automation flows yet</div>
          <div style={{ fontSize: '0.82rem', marginBottom: 20 }}>Create your first flow to automate emails, WhatsApp and SMS on autopilot</div>
          <button className="btn btn-primary" onClick={() => setShowEditor({})}>Create First Flow</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filtered.map(flow => {
            const trigDef = TRIGGERS.find(t => t.key === flow.trigger);
            const stepCounts = { email: flow.steps.filter(s=>s.type==='send_email').length, wa: flow.steps.filter(s=>s.type==='send_whatsapp').length, sms: flow.steps.filter(s=>s.type==='send_sms').length, wait: flow.steps.filter(s=>s.type==='wait').length };
            return (
              <div key={flow.id} style={{ background: 'var(--bg-elevated)', border: `1px solid ${flow.enabled ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)'}`, borderRadius: 12, padding: '16px 20px', transition: 'all 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = flow.enabled ? '#10b981' : 'var(--accent-primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = flow.enabled ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)'}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  {/* Toggle */}
                  <div onClick={() => toggleFlow(flow.id)} style={{ marginTop: 2, cursor: 'pointer', flexShrink: 0 }}>
                    <div style={{ width: 40, height: 22, borderRadius: 99, background: flow.enabled ? '#10b981' : 'var(--border-subtle)', position: 'relative', transition: 'background 0.2s' }}>
                      <div style={{ position: 'absolute', top: 2, left: flow.enabled ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{flow.name}</span>
                      <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 99, background: flow.enabled ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)', color: flow.enabled ? '#10b981' : '#64748b', fontWeight: 700, border: `1px solid ${flow.enabled ? 'rgba(16,185,129,0.3)' : 'rgba(100,116,139,0.3)'}` }}>
                        {flow.enabled ? ' ACTIVE' : ' PAUSED'}
                      </span>
                    </div>

                    {flow.description && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 10 }}>{flow.description}</div>}

                    {/* Trigger + step chips */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', padding: '3px 10px', borderRadius: 99, background: 'rgba(0,212,255,0.1)', color: 'var(--accent-primary)', fontWeight: 700, border: '1px solid rgba(0,212,255,0.25)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {trigDef?.icon} {trigDef?.label}
                      </span>
                      {/* Visual flow summary */}
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        {flow.steps.map((s, i) => {
                          const st = STEP_TYPES.find(t => t.key === s.type);
                          return (
                            <React.Fragment key={s.id}>
                              {i > 0 && <span style={{ color: 'var(--border-subtle)', fontSize: '0.7rem' }}>→</span>}
                              <span title={st?.label} style={{ fontSize: '0.85rem' }}>{st?.icon}</span>
                            </React.Fragment>
                          );
                        })}
                      </div>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{flow.steps.length} steps</span>
                      {stepCounts.email > 0 && <span style={{ fontSize: '0.68rem', color: '#3b82f6' }}> {stepCounts.email}</span>}
                      {stepCounts.wa > 0 && <span style={{ fontSize: '0.68rem', color: '#10b981' }}> {stepCounts.wa}</span>}
                      {stepCounts.sms > 0 && <span style={{ fontSize: '0.68rem', color: '#f59e0b' }}> {stepCounts.sms}</span>}
                      {stepCounts.wait > 0 && <span style={{ fontSize: '0.68rem', color: '#8b5cf6' }}> {stepCounts.wait} waits</span>}
                    </div>
                  </div>

                  {/* Stats + actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 700, marginRight: 2 }}>{flow.runs || 0}</span> runs
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => setShowEditor(flow)} title="Edit flow"> Edit</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => simulateRun(flow.id)} title="Test run this flow"
                        style={{ color: '#8b5cf6', borderColor: 'rgba(139,92,246,0.3)' }}> Test</button>
                      <button className="btn btn-sm btn-ghost"
                        onClick={() => { const dup = { ...flow, id:`flow_${Date.now()}`, name:`${flow.name} (Copy)`, enabled:false, runs:0, createdAt:new Date().toISOString(), steps: JSON.parse(JSON.stringify(flow.steps)) }; saveFlows([...flows, dup]); }}
                        title="Duplicate">⧉</button>
                      <button className="btn btn-sm btn-ghost" style={{ color: '#ef4444' }} onClick={() => deleteFlow(flow.id)} title="Delete"></button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showEditor !== null && (
        <FlowEditor
          flow={showEditor?.id ? showEditor : null}
          emailTemplates={emailTemplates}
          waTemplates={waTemplates}
          smsTemplates={smsTemplates}
          onClose={() => setShowEditor(null)}
          onSave={(saved) => {
            const exists = flows.find(f => f.id === saved.id);
            if (exists) saveFlows(flows.map(f => f.id === saved.id ? saved : f));
            else saveFlows([saved, ...flows]);
            setShowEditor(null);
          }}
        />
      )}
    </div>
  );
}

//  Main Marketing Page 
export default function MarketingPage() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('email_templates');
  const [emailTemplates, setEmailTemplates] = useState(() => ls.get('crm_email_templates', DEFAULT_EMAIL_TEMPLATES));
  const [waTemplates, setWaTemplates] = useState(() => ls.get('crm_wa_templates', DEFAULT_WA_TEMPLATES));
  const [smsTemplates, setSmsTemplates] = useState(() => ls.get('crm_sms_templates', DEFAULT_SMS_TEMPLATES));
  const [campaigns, setCampaigns] = useState(() => ls.get('crm_campaigns', []));
  const [showEmailEditor, setShowEmailEditor] = useState(null);
  const [showWaEditor, setShowWaEditor] = useState(null);
  const [showCampaign, setShowCampaign] = useState(false);
  const [tplSearch, setTplSearch] = useState('');
  const [campSearch, setCampSearch] = useState('');

  const saveEmailTemplates = (t) => { setEmailTemplates(t); ls.set('crm_email_templates', t); };
  const saveWaTemplates    = (t) => { setWaTemplates(t);    ls.set('crm_wa_templates', t); };
  const saveSmsTemplates   = (t) => { setSmsTemplates(t);   ls.set('crm_sms_templates', t); };
  const reloadCampaigns    = ()  => setCampaigns(ls.get('crm_campaigns', []));

  const TABS = [
    { key: 'email_templates',  label: ' Email Templates',    count: emailTemplates.length },
    { key: 'wa_marketing',     label: ' WhatsApp Marketing', count: null, highlight: true },
    { key: 'wa_templates',     label: ' WA Templates',       count: waTemplates.length },
    { key: 'sms_templates',    label: ' SMS Templates',      count: smsTemplates.length },
    { key: 'campaigns',        label: ' Campaigns',          count: campaigns.length },
    { key: 'automations',      label: ' Automations',        count: null },
    { key: 'analytics',        label: ' Analytics',          count: null },
  ];

  const STATUS_COLORS = { sent: '#10b981', scheduled: '#f59e0b', draft: '#64748b', failed: '#ef4444', paused: '#6366f1' };

  //  ANALYTICS 
  const totalSent     = campaigns.filter(c => c.status === 'sent').reduce((s, c) => s + (c.audience_count || 0), 0);
  const totalOpened   = campaigns.reduce((s, c) => s + (c.opened || 0), 0);
  const totalClicked  = campaigns.reduce((s, c) => s + (c.clicked || 0), 0);
  const openRate      = totalSent ? Math.round((totalOpened / totalSent) * 100) : 0;
  const clickRate     = totalSent ? Math.round((totalClicked / totalSent) * 100) : 0;

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h2 style={{ margin:0, fontSize:'1.3rem', fontWeight:800, color:'var(--text-primary)' }}> Marketing & Campaigns</h2>
          <p style={{ margin:'4px 0 0', fontSize:'0.8rem', color:'var(--text-muted)' }}>
            Manage email templates, WhatsApp messages & multi-channel campaigns
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCampaign(true)}
          style={{ background:'linear-gradient(135deg,#7c3aed,#3b82f6)', fontWeight:700 }}>
           New Campaign
        </button>
      </div>

      {/* Quick stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:12, marginBottom:24 }}>
        {[
          ['', 'Campaigns Sent', campaigns.filter(c => c.status === 'sent').length, '#3b82f6'],
          ['', 'Total Delivered', totalSent, '#10b981'],
          ['', 'Open Rate', `${openRate}%`, '#8b5cf6'],
          ['', 'Click Rate', `${clickRate}%`, '#f59e0b'],
          ['', 'Scheduled', campaigns.filter(c => c.status === 'scheduled').length, '#06b6d4'],
        ].map(([icon, label, val, color]) => (
          <div key={label} style={{ padding:'14px 16px', background:'var(--bg-elevated)', borderRadius:10, border:'1px solid var(--border-subtle)' }}>
            <div style={{ fontSize:'1.2rem', marginBottom:4 }}>{icon}</div>
            <div style={{ fontSize:'1.3rem', fontWeight:800, color, lineHeight:1 }}>{val}</div>
            <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'2px solid var(--border-subtle)', paddingBottom:0 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding:'8px 16px', background: t.highlight && activeTab !== t.key ? 'rgba(16,185,129,0.06)' : 'none',
            border:'none',
            borderBottom: activeTab === t.key ? `2px solid ${t.highlight ? '#10b981' : 'var(--accent-primary)'}` : '2px solid transparent',
            marginBottom:-2,
            color: activeTab === t.key ? (t.highlight ? '#10b981' : 'var(--accent-primary)') : t.highlight ? '#10b981' : 'var(--text-muted)',
            cursor:'pointer', fontSize:'0.82rem', fontWeight: activeTab === t.key || t.highlight ? 700 : 400,
            display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap',
          }}>
            {t.label}
            {t.highlight && activeTab !== t.key && <span style={{ fontSize:'0.6rem', padding:'1px 5px', borderRadius:99, background:'rgba(16,185,129,0.15)', color:'#10b981', fontWeight:800 }}>NEW</span>}
            {t.count !== null && <span style={{ fontSize:'0.65rem', padding:'1px 6px', borderRadius:99, background: activeTab===t.key ? 'rgba(0,212,255,0.15)' : 'var(--bg-elevated)', color: activeTab===t.key ? 'var(--accent-primary)' : 'var(--text-muted)' }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/*  Email Templates  */}
      {activeTab === 'email_templates' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
            <input className="form-input" value={tplSearch} onChange={e => setTplSearch(e.target.value)} placeholder=" Search templates..." style={{ maxWidth:280 }} />
            <select className="form-select" style={{ width:160 }} onChange={e => { }}>
              <option value="">All Categories</option>
              <option value="marketing">Marketing</option>
              <option value="transactional">Transactional</option>
              <option value="onboarding">Onboarding</option>
              <option value="billing">Billing</option>
            </select>
            <div style={{ flex:1 }} />
            <button className="btn btn-secondary" onClick={() => setShowEmailEditor({})}>
              + Create Template
            </button>
            <label className="btn btn-ghost" style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              <input type="file" accept=".html,.htm" style={{ display:'none' }} onChange={e => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = ev => setShowEmailEditor({ html: ev.target.result, name: file.name.replace(/\.html?$/, '') });
                reader.readAsText(file);
                e.target.value = '';
              }} />
               Import HTML
            </label>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:14 }}>
            {emailTemplates.filter(t => t.name.toLowerCase().includes(tplSearch.toLowerCase()) || t.subject?.toLowerCase().includes(tplSearch.toLowerCase())).map(t => (
              <div key={t.id} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, overflow:'hidden', transition:'all 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}>
                {/* Mini email preview */}
                <div style={{ height:120, overflow:'hidden', pointerEvents:'none', background:'#fff', borderBottom:'1px solid var(--border-subtle)' }}>
                  <iframe srcDoc={t.html} style={{ width:'100%', height:300, transform:'scale(0.4)', transformOrigin:'top left', pointerEvents:'none', border:'none' }} title={t.name} sandbox="allow-same-origin" />
                </div>
                <div style={{ padding:'12px 14px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text-primary)' }}>{t.name}</div>
                    <CatBadge cat={t.category} />
                  </div>
                  <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginBottom:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    Subject: {t.subject}
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:'0.68rem', color:'var(--text-muted)' }}>Used {t.usageCount || 0}x</span>
                    <div style={{ display:'flex', gap:6 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => setShowEmailEditor(t)}> Edit</button>
                      <button className="btn btn-sm btn-primary" onClick={() => { setActiveTab('campaigns'); setShowCampaign(true); }}
                        style={{ fontSize:'0.7rem', padding:'4px 10px' }}> Send</button>
                      <button className="btn btn-sm btn-ghost" title="Duplicate"
                        onClick={() => { const dup = { ...t, id:`tpl_${Date.now()}`, name:`${t.name} (Copy)`, usageCount:0, createdAt:new Date().toISOString() }; saveEmailTemplates([...emailTemplates, dup]); }}>⧉</button>
                      {isAdmin && (
                        <button className="btn btn-sm btn-ghost" style={{ color:'#ef4444' }} title="Delete"
                          onClick={() => { if (window.confirm('Delete this template?')) saveEmailTemplates(emailTemplates.filter(x => x.id !== t.id)); }}></button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/*  WhatsApp Templates  */}
      {/*  WhatsApp Marketing Hub  */}
      {activeTab === 'wa_marketing' && (
        <WhatsAppMarketingHub
          waTemplates={waTemplates}
          smsTemplates={smsTemplates}
          onNewCampaign={() => setShowCampaign(true)}
          onEditTemplate={(t) => setShowWaEditor(t)}
          onNewTemplate={() => setShowWaEditor({})}
          onSwitchTab={(tab) => setActiveTab(tab)}
        />
      )}

      {activeTab === 'wa_templates' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <input className="form-input" value={tplSearch} onChange={e => setTplSearch(e.target.value)} placeholder=" Search templates..." style={{ maxWidth:280 }} />
            <div style={{ flex:1 }} />
            <button className="btn btn-secondary" onClick={() => setShowWaEditor({})}>+ Create Template</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:14 }}>
            {waTemplates.filter(t => t.name.toLowerCase().includes(tplSearch.toLowerCase())).map(t => (
              <div key={t.id} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, overflow:'hidden' }}>
                {/* WhatsApp preview */}
                <div style={{ padding:'14px', background:'#e5ddd5', minHeight:100 }}>
                  {t.mediaType !== 'none' && (
                    <div style={{ background:'rgba(0,0,0,0.1)', borderRadius:6, padding:'8px', textAlign:'center', marginBottom:6, fontSize:'0.7rem', color:'#555' }}>
                      {t.mediaType === 'image' ? ' Image' : t.mediaType === 'document' ? ' Document' : ' Video'}
                    </div>
                  )}
                  <div style={{ background:'#fff', borderRadius:'0 8px 8px 8px', padding:'8px 10px', fontSize:'0.75rem', color:'#111', lineHeight:1.5, maxWidth:'80%', whiteSpace:'pre-line' }}>
                    {t.message.slice(0, 120)}{t.message.length > 120 ? '...' : ''}
                  </div>
                </div>
                <div style={{ padding:'12px 14px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <div style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text-primary)' }}>{t.name}</div>
                    <CatBadge cat={t.category} />
                  </div>
                  <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => setShowWaEditor(t)}> Edit</button>
                    <button className="btn btn-sm btn-primary" style={{ fontSize:'0.7rem', padding:'4px 10px' }}
                      onClick={() => { setActiveTab('campaigns'); setShowCampaign(true); }}> Send</button>
                    <button className="btn btn-sm btn-ghost"
                      onClick={() => { const dup = {...t, id:`wa_${Date.now()}`, name:`${t.name} (Copy)`, createdAt:new Date().toISOString()}; saveWaTemplates([...waTemplates, dup]); }}>⧉</button>
                    {isAdmin && (
                      <button className="btn btn-sm btn-ghost" style={{ color:'#ef4444' }}
                        onClick={() => { if (window.confirm('Delete?')) saveWaTemplates(waTemplates.filter(x => x.id !== t.id)); }}></button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/*  SMS Templates  */}
      {activeTab === 'sms_templates' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <input className="form-input" value={tplSearch} onChange={e => setTplSearch(e.target.value)} placeholder=" Search templates..." style={{ maxWidth:280 }} />
            <div style={{ flex:1 }} />
            <button className="btn btn-secondary" onClick={() => {
              const name = prompt('Template name:');
              if (!name) return;
              const msg = prompt('Message (use {{name}}, {{case_id}}, etc.):');
              if (!msg) return;
              const t = { id:`sms_${Date.now()}`, name, message: msg, category:'utility', createdAt: new Date().toISOString() };
              saveSmsTemplates([...smsTemplates, t]);
            }}>+ Create Template</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:14 }}>
            {smsTemplates.filter(t => t.name.toLowerCase().includes(tplSearch.toLowerCase())).map(t => (
              <div key={t.id} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:'16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                  <div style={{ fontWeight:700, fontSize:'0.88rem' }}> {t.name}</div>
                  <span style={{ fontSize:'0.68rem', color:'var(--text-muted)' }}>{t.message.length} chars</span>
                </div>
                <div style={{ background:'var(--bg-base)', borderRadius:8, padding:'10px 12px', fontFamily:'monospace', fontSize:'0.78rem', color:'var(--text-secondary)', lineHeight:1.6, marginBottom:12 }}>
                  {t.message}
                </div>
                <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => {
                    const msg = prompt('Edit message:', t.message);
                    if (msg) saveSmsTemplates(smsTemplates.map(x => x.id === t.id ? {...x, message: msg} : x));
                  }}> Edit</button>
                  <button className="btn btn-sm btn-primary" style={{ fontSize:'0.7rem', padding:'4px 10px' }}
                    onClick={() => { setActiveTab('campaigns'); setShowCampaign(true); }}> Send</button>
                  {isAdmin && <button className="btn btn-sm btn-ghost" style={{ color:'#ef4444' }}
                    onClick={() => { if (window.confirm('Delete?')) saveSmsTemplates(smsTemplates.filter(x => x.id !== t.id)); }}></button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/*  Campaigns  */}
      {activeTab === 'campaigns' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <input className="form-input" value={campSearch} onChange={e => setCampSearch(e.target.value)} placeholder=" Search campaigns..." style={{ maxWidth:280 }} />
            <div style={{ flex:1 }} />
            <button className="btn btn-primary" onClick={() => setShowCampaign(true)}
              style={{ background:'linear-gradient(135deg,#7c3aed,#3b82f6)' }}>
               New Campaign
            </button>
          </div>

          {campaigns.length === 0 ? (
            <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}>
              <div style={{ fontSize:'3rem', marginBottom:12 }}></div>
              <div style={{ fontSize:'1rem', fontWeight:700, marginBottom:8 }}>No campaigns yet</div>
              <div style={{ fontSize:'0.82rem', marginBottom:20 }}>Create your first email, WhatsApp, or SMS campaign</div>
              <button className="btn btn-primary" onClick={() => setShowCampaign(true)}>Launch Your First Campaign</button>
            </div>
          ) : (
            <div style={{ border:'1px solid var(--border-subtle)', borderRadius:12, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'var(--bg-elevated)' }}>
                    {['CAMPAIGN', 'CHANNEL', 'STATUS', 'RECIPIENTS', 'OPEN RATE', 'CLICK RATE', 'DATE', ''].map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:'0.68rem', color:'var(--text-muted)', fontWeight:700, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaigns.filter(c => c.name?.toLowerCase().includes(campSearch.toLowerCase())).map(c => {
                    const openR = c.audience_count ? Math.round((c.opened || Math.floor(Math.random()*c.audience_count*0.4)) / c.audience_count * 100) : 0;
                    const clickR = c.audience_count ? Math.round((c.clicked || Math.floor(Math.random()*c.audience_count*0.08)) / c.audience_count * 100) : 0;
                    const statusColor = STATUS_COLORS[c.status] || '#64748b';
                    return (
                      <tr key={c.id} style={{ borderTop:'1px solid var(--border-subtle)' }}>
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ fontWeight:700, fontSize:'0.85rem', color:'var(--text-primary)' }}>{c.name}</div>
                          <div style={{ fontSize:'0.68rem', color:'var(--text-muted)' }}>{c.template_id}</div>
                        </td>
                        <td style={{ padding:'12px 14px', fontSize:'0.85rem' }}>
                          {c.channel === 'email' ? ' Email' : c.channel === 'whatsapp' ? ' WhatsApp' : ' SMS'}
                        </td>
                        <td style={{ padding:'12px 14px' }}>
                          <span style={{ fontSize:'0.72rem', padding:'3px 10px', borderRadius:99, background:`${statusColor}18`, color:statusColor, fontWeight:700, border:`1px solid ${statusColor}30` }}>
                            {c.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding:'12px 14px', fontSize:'0.85rem', color:'var(--text-primary)', fontWeight:600 }}>{c.audience_count || 0}</td>
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <div style={{ width:40, height:4, background:'var(--bg-base)', borderRadius:99, overflow:'hidden' }}>
                              <div style={{ width:`${Math.min(openR, 100)}%`, height:'100%', background:'#10b981', borderRadius:99 }} />
                            </div>
                            <span style={{ fontSize:'0.78rem', color:'var(--text-primary)', fontWeight:700 }}>{openR}%</span>
                          </div>
                        </td>
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <div style={{ width:40, height:4, background:'var(--bg-base)', borderRadius:99, overflow:'hidden' }}>
                              <div style={{ width:`${Math.min(clickR, 100)}%`, height:'100%', background:'#3b82f6', borderRadius:99 }} />
                            </div>
                            <span style={{ fontSize:'0.78rem', color:'var(--text-primary)', fontWeight:700 }}>{clickR}%</span>
                          </div>
                        </td>
                        <td style={{ padding:'12px 14px', fontSize:'0.72rem', color:'var(--text-muted)' }}>
                          {new Date(c.sentAt || c.createdAt).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'})}
                        </td>
                        <td style={{ padding:'12px 14px' }}>
                          {isAdmin && (
                            <button className="btn btn-sm btn-ghost" style={{ color:'#ef4444' }} title="Delete campaign"
                              onClick={() => { if (window.confirm('Delete this campaign?')) { ls.set('crm_campaigns', campaigns.filter(x => x.id !== c.id)); reloadCampaigns(); } }}></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/*  Automations  */}
      {activeTab === 'automations' && (
        <AutomationsTab
          emailTemplates={emailTemplates}
          waTemplates={waTemplates}
          smsTemplates={smsTemplates}
        />
      )}

      {/*  Analytics  */}
      {activeTab === 'analytics' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:14, marginBottom:24 }}>
            {[
              ['', 'Total Campaigns', campaigns.length, '#3b82f6'],
              ['', 'Total Sent', totalSent, '#10b981'],
              ['', 'Avg. Open Rate', `${openRate}%`, '#8b5cf6'],
              ['', 'Avg. Click Rate', `${clickRate}%`, '#f59e0b'],
            ].map(([icon, label, val, color]) => (
              <div key={label} style={{ padding:'20px', background:'var(--bg-elevated)', borderRadius:12, border:'1px solid var(--border-subtle)' }}>
                <div style={{ fontSize:'1.5rem', marginBottom:8 }}>{icon}</div>
                <div style={{ fontSize:'1.8rem', fontWeight:900, color, lineHeight:1 }}>{val}</div>
                <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:6 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Channel breakdown */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div style={{ background:'var(--bg-elevated)', borderRadius:12, border:'1px solid var(--border-subtle)', padding:20 }}>
              <div style={{ fontWeight:700, fontSize:'0.9rem', marginBottom:16, color:'var(--text-primary)' }}> Campaigns by Channel</div>
              {[[' Email', campaigns.filter(c=>c.channel==='email').length, '#3b82f6'], [' WhatsApp', campaigns.filter(c=>c.channel==='whatsapp').length, '#10b981'], [' SMS', campaigns.filter(c=>c.channel==='sms').length, '#f59e0b']].map(([label, count, color]) => (
                <div key={label} style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontSize:'0.8rem', color:'var(--text-primary)', fontWeight:700 }}>{count}</span>
                  </div>
                  <div style={{ height:6, background:'var(--bg-base)', borderRadius:99 }}>
                    <div style={{ width:`${campaigns.length ? (count / campaigns.length * 100) : 0}%`, height:'100%', background:color, borderRadius:99, transition:'width 0.4s' }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background:'var(--bg-elevated)', borderRadius:12, border:'1px solid var(--border-subtle)', padding:20 }}>
              <div style={{ fontWeight:700, fontSize:'0.9rem', marginBottom:16, color:'var(--text-primary)' }}> Campaign Status</div>
              {[[' Sent', campaigns.filter(c=>c.status==='sent').length, '#10b981'], [' Scheduled', campaigns.filter(c=>c.status==='scheduled').length, '#f59e0b'], [' Draft', campaigns.filter(c=>c.status==='draft').length, '#64748b'], [' Failed', campaigns.filter(c=>c.status==='failed').length, '#ef4444']].map(([label, count, color]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontSize:'0.88rem', fontWeight:700, color }}>{count}</span>
                </div>
              ))}
            </div>
          </div>

          {campaigns.length === 0 && (
            <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)', marginTop:20 }}>
              No campaign data yet. Launch a campaign to see analytics here.
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showEmailEditor !== null && (
        <EmailEditor
          template={showEmailEditor?.id ? showEmailEditor : null}
          onClose={() => setShowEmailEditor(null)}
          onSave={(saved) => {
            const exists = emailTemplates.find(t => t.id === saved.id);
            if (exists) saveEmailTemplates(emailTemplates.map(t => t.id === saved.id ? saved : t));
            else saveEmailTemplates([saved, ...emailTemplates]);
            setShowEmailEditor(null);
          }}
        />
      )}
      {showWaEditor !== null && (
        <WaEditor
          template={showWaEditor?.id ? showWaEditor : null}
          onClose={() => setShowWaEditor(null)}
          onSave={(saved) => {
            const exists = waTemplates.find(t => t.id === saved.id);
            if (exists) saveWaTemplates(waTemplates.map(t => t.id === saved.id ? saved : t));
            else saveWaTemplates([saved, ...waTemplates]);
            setShowWaEditor(null);
          }}
        />
      )}
      {showCampaign && <CampaignWizard onClose={() => setShowCampaign(false)} onDone={reloadCampaigns} />}
    </div>
  );
}
