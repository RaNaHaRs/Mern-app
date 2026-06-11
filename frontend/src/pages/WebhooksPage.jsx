import React, { useState, useEffect } from 'react';
import { useAuth } from '../store/AuthContext';

const BASE_URL = '/api';
const getToken = () => localStorage.getItem('accessToken');

const WEBHOOK_EVENTS = [
  { key: 'case_created',    label: ' Case Created',       desc: 'Fires when a new case is opened' },
  { key: 'case_updated',    label: ' Case Updated',        desc: 'Any case field edit' },
  { key: 'stage_changed',   label: ' Stage Changed',       desc: 'Case moves to new stage' },
  { key: 'case_delivered',  label: ' Case Delivered',      desc: 'Device delivered to client' },
  { key: 'case_recovered',  label: ' Data Recovered',      desc: 'Recovery marked complete' },
  { key: 'case_stored',     label: ' Case Stored',         desc: 'Device stored after recovery' },
  { key: 'case_failed',     label: ' Case Failed',          desc: 'Case marked as failed/not recoverable' },
  { key: 'payment_received',label: ' Payment Received',    desc: 'A payment is recorded' },
  { key: 'invoice_created', label: ' Invoice Created',     desc: 'New invoice generated' },
  { key: 'client_added',    label: ' Client Added',        desc: 'New client registered' },
  { key: 'stock_transferred',label: ' Stock Transferred',  desc: 'Case HDD transferred to inventory' },
];

function generateId() {
  return `wh_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
}

const loadWebhooks = () => {
  try { return JSON.parse(localStorage.getItem('crm_webhooks') || '[]'); } catch { return []; }
};
const saveWebhooks = (wh) => localStorage.setItem('crm_webhooks', JSON.stringify(wh));

const loadLogs = () => {
  try { return JSON.parse(localStorage.getItem('crm_webhook_logs') || '[]'); } catch { return []; }
};

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState(loadWebhooks);
  const [logs, setLogs] = useState(loadLogs);
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('activeTab_Webhooks') || 'webhooks');
  useEffect(() => { sessionStorage.setItem('activeTab_Webhooks', activeTab); }, [activeTab]);
  const [showAdd, setShowAdd] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [logFilter, setLogFilter] = useState('all');

  const [form, setForm] = useState({ name:'', url:'', secret:'', events:[], enabled:true });

  const save = (wh) => { setWebhooks(wh); saveWebhooks(wh); };

  const addWebhook = () => {
    if (!form.name || !form.url || form.events.length === 0) {
      alert('Please fill Name, URL, and select at least one event.'); return;
    }
    const newWh = { id: generateId(), ...form, created_at: new Date().toISOString(), last_triggered: null, success_count: 0, fail_count: 0 };
    save([...webhooks, newWh]);
    setForm({ name:'', url:'', secret:'', events:[], enabled:true });
    setShowAdd(false);
  };

  const toggleEnabled = (id) => {
    save(webhooks.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w));
  };

  const deleteWebhook = (id) => {
    if (!confirm('Delete this webhook?')) return;
    save(webhooks.filter(w => w.id !== id));
  };

  const updateEvents = (eventKey) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(eventKey) ? f.events.filter(e => e !== eventKey) : [...f.events, eventKey],
    }));
  };

  const testWebhook = async (wh) => {
    setTestingId(wh.id);
    const logEntry = {
      id: `log_${Date.now()}`, webhook_id: wh.id, webhook_name: wh.name,
      event: 'test_ping', status: 'pending', url: wh.url,
      payload: JSON.stringify({ event_type: 'test_ping', message: 'Test from RecoverLab CRM', timestamp: new Date().toISOString() }),
      timestamp: new Date().toISOString(),
    };
    try {
      const resp = await fetch(wh.url, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json', ...(wh.secret ? { 'X-Webhook-Secret': wh.secret } : {}) },
        body: logEntry.payload,
      });
      logEntry.status = 'success'; logEntry.response_code = 200;
      save(webhooks.map(w => w.id === wh.id ? { ...w, last_triggered: new Date().toISOString(), success_count: (w.success_count||0)+1 } : w));
    } catch (e) {
      logEntry.status = 'failed'; logEntry.error = e.message;
      save(webhooks.map(w => w.id === wh.id ? { ...w, fail_count: (w.fail_count||0)+1 } : w));
    }
    const newLogs = [logEntry, ...loadLogs()].slice(0, 500);
    setLogs(newLogs);
    localStorage.setItem('crm_webhook_logs', JSON.stringify(newLogs));
    setTestingId(null);
  };

  const filteredLogs = logFilter === 'all' ? logs : logs.filter(l => l.status === logFilter);

  const clearLogs = () => {
    if (!confirm('Clear all webhook logs?')) return;
    setLogs([]); localStorage.removeItem('crm_webhook_logs');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 style={{ fontFamily:'var(--font-display)', fontWeight:800 }}> Webhooks</h2>
          <p style={{ color:'var(--text-muted)', fontSize:'0.82rem', marginTop:4 }}>
            Send real-time HTTP POST events to external services when CRM actions occur. Multiple webhooks can be active simultaneously.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Webhook</button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:0, marginBottom:20, borderBottom:'1px solid var(--border-subtle)' }}>
        {[['webhooks',` Webhooks (${webhooks.length})`],['logs',` Queue & Logs (${logs.length})`]].map(([k,l]) => (
          <button key={k} onClick={() => setActiveTab(k)} style={{
            padding:'10px 20px', border:'none', cursor:'pointer', fontSize:'0.82rem', fontWeight:600,
            background:'transparent', borderBottom: activeTab===k ? '2px solid var(--accent-primary)' : '2px solid transparent',
            color: activeTab===k ? 'var(--accent-primary)' : 'var(--text-muted)',
            transition:'all var(--transition-fast)',
          }}>{l}</button>
        ))}
      </div>

      {/* WEBHOOKS TAB */}
      {activeTab === 'webhooks' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {webhooks.length === 0 && (
            <div className="empty-state" style={{ padding:60 }}>
              <div className="empty-icon"></div>
              <div className="empty-title">No Webhooks Yet</div>
              <div className="empty-desc">Add a webhook to send real-time events to n8n, Zapier, Slack, your own server, or any HTTP endpoint.</div>
              <button className="btn btn-primary" style={{ marginTop:16 }} onClick={() => setShowAdd(true)}>+ Add First Webhook</button>
            </div>
          )}
          {webhooks.map(wh => (
            <div key={wh.id} style={{
              background:'var(--bg-card)', borderRadius:'var(--radius-lg)',
              border:`1px solid ${wh.enabled ? 'var(--border-default)' : 'var(--border-subtle)'}`,
              padding:'16px 20px', opacity: wh.enabled ? 1 : 0.6,
              transition:'all var(--transition-fast)',
            }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                    <div style={{
                      width:10, height:10, borderRadius:'50%', flexShrink:0,
                      background: wh.enabled ? 'var(--status-success)' : '#475569',
                      boxShadow: wh.enabled ? '0 0 6px var(--status-success)' : 'none',
                    }}/>
                    <span style={{ fontWeight:700, fontSize:'0.95rem' }}>{wh.name}</span>
                    {!wh.enabled && <span style={{ fontSize:'0.62rem', padding:'1px 7px', borderRadius:999, background:'rgba(71,85,105,0.2)', color:'#94a3b8' }}>DISABLED</span>}
                  </div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--accent-primary)', marginBottom:8, wordBreak:'break-all' }}>{wh.url}</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                    {(wh.events||[]).map(ev => {
                      const def = WEBHOOK_EVENTS.find(e => e.key === ev);
                      return <span key={ev} style={{ fontSize:'0.62rem', padding:'2px 8px', borderRadius:999, background:'rgba(0,212,255,0.08)', color:'var(--accent-primary)', border:'1px solid rgba(0,212,255,0.15)' }}>{def?.label || ev}</span>;
                    })}
                  </div>
                  <div style={{ display:'flex', gap:16, fontSize:'0.72rem', color:'var(--text-muted)' }}>
                    <span> {wh.success_count||0} success</span>
                    <span> {wh.fail_count||0} failed</span>
                    {wh.last_triggered && <span>Last: {new Date(wh.last_triggered).toLocaleString('en-IN')}</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                  <button className="btn btn-sm" style={{ background:'rgba(0,212,255,0.08)', color:'var(--accent-primary)', border:'1px solid rgba(0,212,255,0.2)' }}
                    onClick={() => testWebhook(wh)} disabled={testingId === wh.id}>
                    {testingId === wh.id ? <><div className="spinner" style={{width:12,height:12}}/> Testing…</> : ' Test'}
                  </button>
                  <button className="btn btn-sm" style={{ background:'rgba(16,185,129,0.08)', color:'var(--status-success)', border:'1px solid rgba(16,185,129,0.2)' }}
                    onClick={() => toggleEnabled(wh.id)}>
                    {wh.enabled ? ' Disable' : ' Enable'}
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => deleteWebhook(wh.id)}> Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* LOGS TAB */}
      {activeTab === 'logs' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <div style={{ display:'flex', gap:8 }}>
              {[['all','All'],['success',' Success'],['failed',' Failed'],['pending',' Pending']].map(([k,l]) => (
                <button key={k} onClick={() => setLogFilter(k)} style={{
                  padding:'5px 12px', borderRadius:999, border:'1px solid var(--border-default)',
                  background: logFilter===k ? 'var(--accent-primary)' : 'transparent',
                  color: logFilter===k ? '#000' : 'var(--text-muted)', cursor:'pointer', fontSize:'0.72rem', fontWeight:600,
                }}>{l}</button>
              ))}
            </div>
            <button className="btn btn-sm btn-danger" onClick={clearLogs}> Clear Logs</button>
          </div>

          <div style={{ background:'var(--bg-card)', borderRadius:'var(--radius-lg)', border:'1px solid var(--border-subtle)', overflow:'hidden' }}>
            {filteredLogs.length === 0 ? (
              <div className="empty-state" style={{ padding:40 }}>
                <div className="empty-desc">No webhook logs yet. Test a webhook or wait for events to fire.</div>
              </div>
            ) : filteredLogs.map(log => (
              <div key={log.id} className="webhook-log-item">
                <div className={`webhook-log-dot ${log.status}`} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                    <span style={{ fontWeight:600, color: log.status==='success'?'var(--status-success)':log.status==='failed'?'var(--status-danger)':'var(--status-warning)' }}>
                      {log.status.toUpperCase()}
                    </span>
                    <span style={{ color:'var(--text-muted)' }}>→</span>
                    <span style={{ fontWeight:600 }}>{log.webhook_name}</span>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', padding:'1px 7px', borderRadius:999, background:'rgba(0,212,255,0.08)', color:'var(--accent-primary)' }}>{log.event}</span>
                    <span style={{ color:'var(--text-muted)', fontSize:'0.68rem', marginLeft:'auto' }}>{new Date(log.timestamp).toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--text-muted)', wordBreak:'break-all' }}>{log.url}</div>
                  {log.error && <div style={{ fontSize:'0.68rem', color:'var(--status-danger)', marginTop:3 }}> {log.error}</div>}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop:12, padding:'10px 14px', background:'var(--bg-elevated)', borderRadius:'var(--radius-md)', fontSize:'0.72rem', color:'var(--text-muted)' }}>
             Total: {logs.length} logs |  Success: {logs.filter(l=>l.status==='success').length} |  Failed: {logs.filter(l=>l.status==='failed').length} |  Pending: {logs.filter(l=>l.status==='pending').length}
          </div>
        </div>
      )}

      {/* ADD WEBHOOK MODAL */}
      {showAdd && (
        <div className="modal-overlay">
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title"> Add New Webhook</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAdd(false)}></button>
            </div>
            <div className="modal-body">
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label required">Webhook Name</label>
                  <input className="form-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. n8n Case Events, Slack Notifier" />
                </div>
                <div className="form-group">
                  <label className="form-label required">Endpoint URL</label>
                  <input className="form-input font-mono" value={form.url} onChange={e=>setForm(f=>({...f,url:e.target.value}))} placeholder="https://your-endpoint.com/webhook" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Secret Token (optional, sent as X-Webhook-Secret header)</label>
                <input className="form-input font-mono" type="password" value={form.secret} onChange={e=>setForm(f=>({...f,secret:e.target.value}))} placeholder="Leave blank if not required" />
              </div>
              <div className="form-group">
                <label className="form-label required">Trigger Events</label>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:8, marginTop:8 }}>
                  {WEBHOOK_EVENTS.map(ev => (
                    <label key={ev.key} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px', background:'var(--bg-elevated)', borderRadius:'var(--radius-sm)', cursor:'pointer', border:`1px solid ${form.events.includes(ev.key)?'var(--accent-primary)':'var(--border-subtle)'}`, transition:'border-color var(--transition-fast)' }}>
                      <input type="checkbox" checked={form.events.includes(ev.key)} onChange={() => updateEvents(ev.key)} style={{ marginTop:2 }} />
                      <div>
                        <div style={{ fontWeight:600, fontSize:'0.8rem' }}>{ev.label}</div>
                        <div style={{ fontSize:'0.68rem', color:'var(--text-muted)' }}>{ev.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                <input type="checkbox" checked={form.enabled} onChange={e=>setForm(f=>({...f,enabled:e.target.checked}))} />
                <span style={{ fontSize:'0.82rem', fontWeight:600 }}>Enable immediately on save</span>
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addWebhook}> Save Webhook</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
