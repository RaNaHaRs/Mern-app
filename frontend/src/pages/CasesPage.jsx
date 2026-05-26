import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { casesApi } from '../services/api';
import { useAuth } from '../store/AuthContext';
import NewCaseModal from '../components/NewCaseModal';

const DEFAULT_STAGES = ['received','inspection','diagnosis','quotation','approved','rejected','recovery_in_progress','imaging','data_extraction','verification','completed','delivered','failed'];
const PRIORITIES = { 1:'CRITICAL', 2:'HIGH', 3:'MEDIUM', 4:'LOW', 5:'MINIMAL' };
const DEFAULT_FAILURE_TYPES = [
  'logical','firmware','electrical','mechanical','head_crash','pcb_damage',
  'motor_failure','bad_sectors','water_damage','fire_damage','unknown'
];

function getSettings(key, def) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v && v.length ? v : def; } catch { return def; }
}

export default function CasesPage() {
  const navigate = useNavigate();
  const { canAccess } = useAuth();
  const [cases, setCases] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [showNewCase, setShowNewCase] = useState(false);
  const [filters, setFilters] = useState({ stage: '', search: '', priority: '', failure_type: '' });
  const [page, setPage] = useState(1);

  const checkStale = (c) => {
    if (c.stage === 'delivered' || c.stage === 'failed' || c.stage === 'completed' || c.stage === 'rejected') return false;
    const thresh = c.reminder_days || 4;
    const lastUpdate = new Date(c.updated_at || c.created_at || Date.now());
    const diffDays = (Date.now() - lastUpdate.getTime()) / 86400000;
    return diffDays > thresh ? Math.floor(diffDays) : false;
  };

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 25 };
      if (filters.stage) params.stage = filters.stage;
      if (filters.search) params.search = filters.search;
      if (filters.priority) params.priority = filters.priority;
      if (filters.failure_type) params.failure_type = filters.failure_type;

      const data = await casesApi.list(params);
      setCases(data.cases || []);
      setPagination(data.pagination || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { loadCases(); }, [loadCases]);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>Case Management</h2>
          <p>All recovery jobs — {pagination.total || 0} total cases</p>
        </div>
        {canAccess('staff') && (
          <button className="btn btn-primary" onClick={() => setShowNewCase(true)}>
            + New Case
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input className="search-input" placeholder="Search case#, client, serial..." value={filters.search}
            onChange={e => { setFilters({...filters, search: e.target.value}); setPage(1); }} />
        </div>

        <select className="form-select" style={{width:'auto', fontSize:'0.8rem', padding:'7px 12px'}} value={filters.stage}
          onChange={e => { setFilters({...filters, stage: e.target.value}); setPage(1); }}>
          <option value="">All Stages</option>
          {getSettings('custom_stages', DEFAULT_STAGES).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</option>)}
        </select>

        <select className="form-select" style={{width:'auto', fontSize:'0.8rem', padding:'7px 12px'}} value={filters.failure_type}
          onChange={e => { setFilters({...filters, failure_type: e.target.value}); setPage(1); }}>
          <option value="">All Failures</option>
          {getSettings('custom_failure_types', DEFAULT_FAILURE_TYPES).map(f => <option key={f} value={f}>{f.replace(/_/g,' ')}</option>)}
        </select>

        <select className="form-select" style={{width:'auto', fontSize:'0.8rem', padding:'7px 12px'}} value={filters.priority}
          onChange={e => { setFilters({...filters, priority: e.target.value}); setPage(1); }}>
          <option value="">All Priorities</option>
          {Object.entries(PRIORITIES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        {(filters.stage || filters.failure_type || filters.priority) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilters({stage:'',search:'',priority:'',failure_type:''}); setPage(1); }}>
            ✕ Clear
          </button>
        )}
      </div>

      <div className="table-container">
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <div className="spinner" style={{ width:28, height:28, borderWidth:3 }} />
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Case #</th>
                  <th>Client</th>
                  <th>Device</th>
                  <th>Stage</th>
                  <th>Priority</th>
                  <th>Failure</th>
                  <th>Risk</th>
                  <th>Transfer to Client</th>
                  <th>Engineer</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {cases.map(c => (
                  <tr key={c.id} onClick={() => navigate(`/cases/${c.id}`)}>
                    <td>
                      <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
                        <span className="font-mono text-xs text-accent">{c.case_number}</span>
                        {checkStale(c) && <span className={`stale-badge ${checkStale(c) > 7 ? 'critical' : ''}`}>⚠️ {checkStale(c)}d old</span>}
                      </div>
                    </td>
                    <td>
                      <div style={{fontWeight:600,fontSize:'0.82rem'}}>{c.first_name} {c.last_name}</div>
                      {c.company && <div className="text-xs text-muted">{c.company}</div>}
                    </td>
                    <td>
                      <div style={{fontSize:'0.8rem'}}>{c.device_brand}</div>
                      <div className="text-xs text-muted font-mono">{c.device_model}</div>
                    </td>
                    <td><span className={`badge badge-${c.stage}`}>{c.stage?.replace(/_/g,' ')}</span></td>
                    <td><span className={`badge badge-p${c.priority||3}`}>{PRIORITIES[c.priority||3]}</span></td>
                    <td>
                      <div style={{display:'flex',gap:4,flexWrap:'wrap',maxWidth:150}}>
                        {(c.failure_types || (c.failure_type?[c.failure_type]:[])).map(ft => (
                          <span key={ft} className={`badge badge-${ft}`}>{ft}</span>
                        ))}
                      </div>
                    </td>
                    <td>{c.ai_risk_level && <span className={`badge badge-risk-${c.ai_risk_level}`}>{c.ai_risk_level}</span>}</td>
                    <td>
                      {c.transfer_to_client ? (
                        <span className="badge badge-completed" style={{ minWidth: 50, textAlign: 'center', justifyContent: 'center' }}>Yes</span>
                      ) : (
                        <span className="badge badge-received" style={{ minWidth: 50, textAlign: 'center', justifyContent: 'center' }}>No</span>
                      )}
                    </td>
                    <td className="text-xs text-muted">{c.engineer_name || '—'}</td>
                    <td className="text-xs text-muted font-mono">{new Date(c.received_at||c.created_at).toLocaleDateString('en-IN')}</td>
                  </tr>
                ))}
                {!cases.length && (
                  <tr><td colSpan={10}>
                    <div className="empty-state">
                      <div className="empty-icon">📂</div>
                      <div className="empty-title">No cases found</div>
                      <div className="empty-desc">Create a new case or adjust your filters</div>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        {pagination.pages > 1 && (
          <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:12,padding:16,borderTop:'1px solid var(--border-subtle)'}}>
            <button className="btn btn-secondary btn-sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← Prev</button>
            <span className="text-xs text-muted font-mono">Page {page} of {pagination.pages}</span>
            <button className="btn btn-secondary btn-sm" disabled={page>=pagination.pages} onClick={()=>setPage(p=>p+1)}>Next →</button>
          </div>
        )}
      </div>

      {showNewCase && (
        <NewCaseModal onClose={() => setShowNewCase(false)} onCreated={(newCase) => {
          loadCases();
          if(newCase && newCase.id) navigate(`/cases/${newCase.id}`);
        }} />
      )}
    </div>
  );
}
