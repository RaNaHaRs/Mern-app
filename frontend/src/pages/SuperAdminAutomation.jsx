import React, { useEffect, useState } from 'react';
import { useAuth } from '../store/AuthContext';

const BASE = '/api/super-admin/automation-center';
const token = () => localStorage.getItem('accessToken');

const EVENTS = [
  'ADMIN_CREATED', 'ADMIN_DELETED', 'TEAM_MEMBER_CREATED', 'TEAM_MEMBER_DELETED',
  'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_RENEWED', 'SUBSCRIPTION_EXPIRED',
  'PAYMENT_RECEIVED', 'PAYMENT_PENDING', 'PAYMENT_OVERDUE',
  'INVOICE_CREATED', 'INVOICE_SENT',
  'CASE_CREATED', 'CASE_UPDATED', 'CASE_COMPLETED', 'CASE_DELIVERED',
  'CLIENT_CREATED', 'CLIENT_DELETED',
  'INVENTORY_CREATED', 'INVENTORY_LOW_STOCK'
];

const RECIPIENT_TYPES = ['Admin', 'Client', 'Team Member', 'Super Admin', 'Custom Email'];

const VARIABLES = {
  name: 'Recipient name',
  email: 'Recipient email',
  phone: 'Phone number',
  company: 'Company name',
  invoice_number: 'Invoice number',
  case_number: 'Case number',
  amount: 'Amount',
  pending_amount: 'Pending amount',
  payment_amount: 'Payment amount',
  subscription_name: 'Subscription plan name',
  expiry_date: 'Subscription expiry date',
  login_url: 'Login URL',
  password: 'Password'
};

function fetchJson(path, opts = {}) {
  opts.headers = Object.assign({}, opts.headers || {}, { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' });
  return fetch(path, opts).then(r => r.json());
}

export default function SuperAdminAutomation() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [triggers, setTriggers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modals & Forms
  const [templateModal, setTemplateModal] = useState(false);
  const [triggerModal, setTriggerModal] = useState(false);
  const [previewModal, setPreviewModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editingTrigger, setEditingTrigger] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);

  // Template Form
  const [templateForm, setTemplateForm] = useState({ name: '', subject: '', body: '', is_active: true });
  // Trigger Form
  const [triggerForm, setTriggerForm] = useState({ name: '', event: '', recipient_type: 'Admin', email_template_id: '', is_active: true });
  // Logs Search
  const [logsSearch, setLogsSearch] = useState({ q: '', event: '', status: '' });

  // Load data
  useEffect(() => { loadTemplates(); loadTriggers(); loadLogs(); }, []);

  const loadTemplates = () => fetchJson(BASE + '/templates').then(d => Array.isArray(d) ? setTemplates(d) : null);
  const loadTriggers = () => fetchJson(BASE + '/triggers').then(d => Array.isArray(d) ? setTriggers(d) : null);
  const loadLogs = () => {
    const params = new URLSearchParams({ limit: 500, ...logsSearch }).toString();
    return fetchJson(BASE + '/logs?' + params).then(d => Array.isArray(d) ? setLogs(d) : null);
  };

  // Template handlers
  const openTemplateForm = (template = null) => {
    if (template) {
      setEditingTemplate(template);
      setTemplateForm(template);
    } else {
      setEditingTemplate(null);
      setTemplateForm({ name: '', subject: '', body: '', is_active: true });
    }
    setTemplateModal(true);
  };

  const saveTemplate = async () => {
    setLoading(true);
    try {
      const method = editingTemplate ? 'PUT' : 'POST';
      const url = editingTemplate ? `${BASE}/templates/${editingTemplate.id}` : `${BASE}/templates`;
      const res = await fetchJson(url, { method, body: JSON.stringify(templateForm) });
      if (res.id) {
        await loadTemplates();
        setTemplateModal(false);
      } else {
        alert(res.error || 'Failed to save template');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    } finally { setLoading(false); }
  };

  // Trigger handlers
  const openTriggerForm = (trigger = null) => {
    if (trigger) {
      setEditingTrigger(trigger);
      setTriggerForm(trigger);
    } else {
      setEditingTrigger(null);
      setTriggerForm({ name: '', event: '', recipient_type: 'Admin', email_template_id: '', is_active: true });
    }
    setTriggerModal(true);
  };

  const saveTrigger = async () => {
    if (!triggerForm.email_template_id) { alert('Please select an email template'); return; }
    setLoading(true);
    try {
      const method = editingTrigger ? 'PUT' : 'POST';
      const url = editingTrigger ? `${BASE}/triggers/${editingTrigger.id}` : `${BASE}/triggers`;
      const res = await fetchJson(url, { method, body: JSON.stringify(triggerForm) });
      if (res.id) {
        await loadTriggers();
        setTriggerModal(false);
      } else {
        alert(res.error || 'Failed to save trigger');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    } finally { setLoading(false); }
  };

  // Delete handlers
  const confirmDelete = (type, id, name) => {
    setDeleteTarget({ type, id, name });
    setDeleteModal(true);
  };

  const performDelete = async () => {
    if (!deleteTarget) return;
    setLoading(true);
    try {
      const url = `${BASE}/${deleteTarget.type}s/${deleteTarget.id}`;
      const res = await fetchJson(url, { method: 'DELETE' });
      if (res.ok) {
        deleteTarget.type === 'template' ? await loadTemplates() : await loadTriggers();
        setDeleteModal(false);
      } else {
        alert(res.error || 'Failed to delete');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    } finally { setLoading(false); }
  };

  // Toggle trigger active/inactive
  const toggleTrigger = async (trigger) => {
    try {
      const res = await fetchJson(`${BASE}/triggers/${trigger.id}`, { method: 'PUT', body: JSON.stringify({ is_active: !trigger.is_active }) });
      if (res.id) await loadTriggers();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  const getTemplateName = (id) => templates.find(t => t.id === id)?.name || '—';

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 8 }}>Automation Center</h3>
        <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: 12 }}>Manage email templates and automation triggers for system events.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => openTemplateForm()} className="btn btn-primary">+ Create Email Template</button>
          <button onClick={() => openTriggerForm()} className="btn btn-secondary">+ Create Trigger</button>
        </div>
      </div>

      {/* ──── EMAIL TEMPLATES SECTION ──── */}
      <div style={{ marginBottom: 24 }} className="card">
        <h4 style={{ marginBottom: 12, fontSize: '1rem', fontWeight: 600 }}>Email Templates ({templates.length})</h4>
        {templates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>No templates yet. Create one to get started.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }} className="table">
              <thead>
                <tr style={{ borderBottom: '1px solid #ddd', background: '#f9f9f9' }}>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>Subject</th>
                  <th style={{ textAlign: 'center', padding: '8px', fontWeight: 600, width: 80 }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600, width: 140 }}>Created</th>
                  <th style={{ textAlign: 'center', padding: '8px', fontWeight: 600, width: 180 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px' }}><strong>{t.name}</strong></td>
                    <td style={{ padding: '8px', color: '#666', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.subject}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <span className={`status-badge ${t.is_active ? 'status-active' : 'status-inactive'}`}>{t.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td style={{ padding: '8px', fontSize: '0.85rem', color: '#999' }}>{new Date(t.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <button onClick={() => { setPreviewTemplate(t); setPreviewModal(true); }} className="btn btn-ghost btn-sm" style={{ marginRight: 6 }}>Preview</button>
                      <button onClick={() => openTemplateForm(t)} className="btn btn-secondary btn-sm" style={{ marginRight: 6 }}>Edit</button>
                      <button onClick={() => confirmDelete('template', t.id, t.name)} className="btn btn-danger btn-sm">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ──── TRIGGERS SECTION ──── */}
      <div style={{ marginBottom: 24 }} className="card">
        <h4 style={{ marginBottom: 12, fontSize: '1rem', fontWeight: 600 }}>Automation Triggers ({triggers.length})</h4>
        {triggers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>No triggers configured yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }} className="table">
              <thead>
                <tr style={{ borderBottom: '1px solid #ddd', background: '#f9f9f9' }}>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>Event</th>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>Template</th>
                  <th style={{ textAlign: 'center', padding: '8px', fontWeight: 600, width: 80 }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600, width: 140 }}>Created</th>
                  <th style={{ textAlign: 'center', padding: '8px', fontWeight: 600, width: 200 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {triggers.map(tr => (
                  <tr key={tr.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px' }}><strong>{tr.name}</strong></td>
                    <td style={{ padding: '8px', color: '#666', fontSize: '0.9rem' }}>{tr.event}</td>
                    <td style={{ padding: '8px', color: '#666' }}>{getTemplateName(tr.email_template_id)}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <span className={`status-badge ${tr.is_active ? 'status-active' : 'status-inactive'}`}>{tr.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td style={{ padding: '8px', fontSize: '0.85rem', color: '#999' }}>{new Date(tr.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <button onClick={() => toggleTrigger(tr)} className="btn btn-ghost btn-sm" style={{ marginRight: 6 }}>{tr.is_active ? 'Disable' : 'Enable'}</button>
                      <button onClick={() => openTriggerForm(tr)} className="btn btn-secondary btn-sm" style={{ marginRight: 6 }}>Edit</button>
                      <button onClick={() => confirmDelete('trigger', tr.id, tr.name)} className="btn btn-danger btn-sm">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ──── TRIGGER LOGS SECTION ──── */}
      <div className="card">
        <h4 style={{ marginBottom: 12, fontSize: '1rem', fontWeight: 600 }}>Trigger Logs</h4>
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="Search..." value={logsSearch.q} onChange={e => setLogsSearch(s => ({ ...s, q: e.target.value }))} className="form-input" style={{ flex: 1 }} />
          <select value={logsSearch.event} onChange={e => setLogsSearch(s => ({ ...s, event: e.target.value }))} className="form-input">
            <option value="">All Events</option>
            {EVENTS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select value={logsSearch.status} onChange={e => setLogsSearch(s => ({ ...s, status: e.target.value }))} className="form-input">
            <option value="">All Status</option>
            <option>sent</option>
            <option>failed</option>
            <option>skipped</option>
          </select>
          <button onClick={loadLogs} className="btn btn-secondary">Search</button>
        </div>
        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>No logs yet.</div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 400, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f9f9f9' }}>
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>Trigger</th>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>Event</th>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>Recipient</th>
                  <th style={{ textAlign: 'center', padding: '8px', fontWeight: 600, width: 80 }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600 }}>When</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px' }}>{l.trigger_name}</td>
                    <td style={{ padding: '8px', color: '#666' }}>{l.event}</td>
                    <td style={{ padding: '8px', color: '#666', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.recipient_email || '—'}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: '0.75rem', background: l.status === 'sent' ? '#d4edda' : l.status === 'failed' ? '#f8d7da' : '#e2e3e5', color: l.status === 'sent' ? '#155724' : l.status === 'failed' ? '#856404' : '#383d41' }}>
                        {l.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px', fontSize: '0.8rem', color: '#999' }}>{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ──── TEMPLATE MODAL ──── */}
      {templateModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header"><h3 className="modal-title">{editingTemplate ? 'Edit' : 'Create'} Email Template</h3><button className="btn btn-ghost btn-icon" onClick={() => setTemplateModal(false)}></button></div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label required">Template Name *</label>
                <input className="form-input" value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Welcome Email" required />
              </div>
              <div className="form-group">
                <label className="form-label required">Subject *</label>
                <input className="form-input" value={templateForm.subject} onChange={e => setTemplateForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g., Welcome to {{company}}" required />
              </div>
              <div className="form-group">
                <label className="form-label required">Email Body *</label>
                <textarea className="form-textarea" value={templateForm.body} onChange={e => setTemplateForm(f => ({ ...f, body: e.target.value }))} placeholder="Email content. Supported variables: {{name}}, {{email}}, {{company}}, {{invoice_number}}, {{amount}}, etc." required style={{ minHeight: 200, fontFamily: 'monospace' }} />
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Supported Variables</summary>
                  <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {Object.entries(VARIABLES).map(([k, v]) => <div key={k}>{'{{'}{k}{'}}'} — {v}</div>)}
                  </div>
                </details>
              </div>
              <div className="form-group">
                <label className="form-label"><input type="checkbox" id="temp_active" checked={templateForm.is_active} onChange={e => setTemplateForm(f => ({ ...f, is_active: e.target.checked }))} />&nbsp;Active</label>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setTemplateModal(false)} disabled={loading} className="btn btn-secondary">Cancel</button>
              <button onClick={saveTemplate} disabled={loading} className="btn btn-primary">{loading ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ──── TRIGGER MODAL ──── */}
      {triggerModal && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header"><h3 className="modal-title">{editingTrigger ? 'Edit' : 'Create'} Trigger</h3><button className="btn btn-ghost btn-icon" onClick={() => setTriggerModal(false)}></button></div>
            <div className="modal-body">
              <div className="form-group"><label className="form-label required">Trigger Name *</label><input className="form-input" value={triggerForm.name} onChange={e => setTriggerForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Welcome New Admin" required /></div>
              <div className="form-group"><label className="form-label required">Event *</label><select className="form-input" value={triggerForm.event} onChange={e => setTriggerForm(f => ({ ...f, event: e.target.value }))} required><option value="">Select event...</option>{EVENTS.map(e => <option key={e} value={e}>{e}</option>)}</select></div>
              <div className="form-group"><label className="form-label required">Recipient Type *</label><select className="form-input" value={triggerForm.recipient_type} onChange={e => setTriggerForm(f => ({ ...f, recipient_type: e.target.value }))}>{RECIPIENT_TYPES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              <div className="form-group"><label className="form-label required">Email Template *</label><select className="form-input" value={triggerForm.email_template_id} onChange={e => setTriggerForm(f => ({ ...f, email_template_id: e.target.value }))} required><option value="">Select template...</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              <div className="form-group"><label className="form-label"><input type="checkbox" id="trig_active" checked={triggerForm.is_active} onChange={e => setTriggerForm(f => ({ ...f, is_active: e.target.checked }))} />&nbsp;Active</label></div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setTriggerModal(false)} disabled={loading} className="btn btn-secondary">Cancel</button>
              <button onClick={saveTrigger} disabled={loading} className="btn btn-primary">{loading ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ──── PREVIEW MODAL ──── */}
      {previewModal && previewTemplate && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setPreviewModal(false)}>
          <div style={{ background: 'white', borderRadius: 8, padding: 20, width: '90%', maxWidth: 600, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <h4 style={{ marginBottom: 16, fontSize: '1.1rem' }}>Preview: {previewTemplate.name}</h4>
            <div style={{ background: '#f9f9f9', padding: 12, borderRadius: 4, marginBottom: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.8rem', color: '#999', fontWeight: 600, marginBottom: 4 }}>Subject:</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>{previewTemplate.subject}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#999', fontWeight: 600, marginBottom: 4 }}>Body:</div>
                <div style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#333', fontFamily: 'monospace' }}>{previewTemplate.body}</div>
              </div>
            </div>
            <button onClick={() => setPreviewModal(false)} style={{ padding: '8px 16px', background: '#f5f5f5', border: '1px solid #ddd', cursor: 'pointer', borderRadius: 4, fontSize: '0.9rem' }}>Close</button>
          </div>
        </div>
      )}

      {/* ──── DELETE CONFIRMATION MODAL ──── */}
      {deleteModal && deleteTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setDeleteModal(false)}>
          <div style={{ background: 'white', borderRadius: 8, padding: 20, width: '90%', maxWidth: 400, boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <h4 style={{ marginBottom: 12, fontSize: '1rem' }}>Delete {deleteTarget.type}?</h4>
            <p style={{ marginBottom: 16, color: '#666', fontSize: '0.9rem' }}>Are you sure you want to delete <strong>"{deleteTarget.name}"</strong>? This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteModal(false)} disabled={loading} style={{ padding: '8px 16px', border: '1px solid #ddd', background: '#f5f5f5', cursor: 'pointer', borderRadius: 4, fontSize: '0.9rem' }}>Cancel</button>
              <button onClick={performDelete} disabled={loading} style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', borderRadius: 4, fontSize: '0.9rem' }}>{loading ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
