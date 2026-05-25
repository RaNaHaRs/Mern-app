import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyticsApi } from '../services/api';
import { useAuth } from '../store/AuthContext';
import NewCaseModal from '../components/NewCaseModal';

const STAGE_COLORS = {
  received:'#64748b',inspection:'#3b82f6',diagnosis:'#6366f1',quotation:'#f59e0b',
  approved:'#10b981',rejected:'#ef4444',recovery_in_progress:'#00d4ff',imaging:'#7c3aed',
  data_extraction:'#ec4899',verification:'#fbbf24',completed:'#10b981',delivered:'#00d4ff',failed:'#dc2626',
};
const PRI = {1:'CRITICAL',2:'HIGH',3:'MEDIUM',4:'LOW',5:'MINIMAL'};

// ── Dashboard Size Modes ──────────────────────────────────────────
const SIZE_MODES = [
  { key: 'compact',  label: '▤ Compact',   statCols: 'repeat(6,1fr)', cardPad: 14 },
  { key: 'normal',   label: '▦ Normal',    statCols: 'repeat(4,1fr)', cardPad: 20 },
  { key: 'spacious', label: '▩ Spacious',  statCols: 'repeat(3,1fr)', cardPad: 28 },
];

function StatCard({ icon, label, value, color, bg, onClick, size }) {
  const sz = size || 'normal';
  const pad = sz === 'compact' ? '14px 16px' : sz === 'spacious' ? '28px 24px' : '20px';
  const fnt = sz === 'compact' ? '1.2rem' : sz === 'spacious' ? '2rem' : '1.6rem';
  return (
    <div className="stat-card" style={{ '--stat-color': color, '--stat-bg': bg, cursor: onClick ? 'pointer' : 'default', padding: pad }}
      onClick={onClick}>
      <div className="stat-icon" style={{ fontSize: sz === 'compact' ? '1.3rem' : '1.6rem' }}>{icon}</div>
      <div className="stat-value" style={{ fontSize: fnt }}>{value ?? '—'}</div>
      <div className="stat-label" style={{ fontSize: sz === 'compact' ? '0.65rem' : '0.75rem' }}>{label}</div>
      {onClick && <div style={{ position: 'absolute', bottom: 8, right: 12, fontSize: '0.6rem', color, opacity: 0.6 }}>Click to view →</div>}
    </div>
  );
}

function CaseRow({ c, onClick }) {
  const priority = c.priority || 3;
  const checkStale = (c) => {
    if (c.stage === 'delivered' || c.stage === 'failed' || c.stage === 'completed' || c.stage === 'rejected') return false;
    const thresh = c.reminder_days || 4;
    const lastUpdate = new Date(c.updated_at || c.created_at || Date.now());
    const diffDays = (Date.now() - lastUpdate.getTime()) / 86400000;
    return diffDays > thresh ? Math.floor(diffDays) : false;
  };
  const isStale = checkStale(c);
  return (
    <tr onClick={() => onClick(c.id)} style={{ cursor: 'pointer' }}>
      <td>
        <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
          <span className="font-mono text-xs text-accent">{c.case_number}</span>
          {isStale && <span className={`stale-badge ${isStale > 7 ? 'critical' : ''}`}>⚠️ {isStale}d old</span>}
        </div>
      </td>
      <td><div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{c.first_name} {c.last_name}</div>{c.company && <div className="text-xs text-muted">{c.company}</div>}</td>
      <td><div style={{ fontSize: '0.8rem' }}>{c.device_brand} {c.device_model}</div></td>
      <td><span className={`badge badge-${c.stage}`}>{c.stage?.replace(/_/g,' ')}</span></td>
      <td><span className={`badge badge-p${priority}`}>{PRI[priority]}</span></td>
      <td>{c.failure_type && <span className={`badge badge-${c.failure_type}`}>{c.failure_type}</span>}</td>
      <td>{c.ai_risk_level && <span className={`badge badge-risk-${c.ai_risk_level}`}>{c.ai_risk_level}</span>}</td>
      <td style={{ color:'var(--text-muted)',fontSize:'0.75rem',fontFamily:'var(--font-mono)' }}>{c.engineer_name||'—'}</td>
      <td style={{ color:'var(--text-muted)',fontSize:'0.72rem' }}>{new Date(c.created_at).toLocaleDateString('en-IN')}</td>
    </tr>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { canAccess } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState(() => localStorage.getItem('dash_size') || 'compact');
  const [showNewCase, setShowNewCase] = useState(false);

  useEffect(() => {
    analyticsApi.dashboard().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  const setDashSize = (s) => { setSize(s); localStorage.setItem('dash_size', s); };

  if (loading) return <div style={{ display:'flex',justifyContent:'center',paddingTop:80 }}><div className="spinner" style={{ width:32,height:32,borderWidth:3 }} /></div>;

  const c = data?.cases || {};
  const r = data?.revenue || {};
  const mode = SIZE_MODES.find(m => m.key === size) || SIZE_MODES[1];

  return (
    <div>
      {/* Dashboard Controls */}
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:12 }}>
        <div style={{ fontSize:'0.8rem',color:'var(--text-muted)' }}>
          {new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:12 }}>
          {canAccess('staff') && (
            <button className="btn btn-primary" onClick={() => setShowNewCase(true)} style={{ padding:'6px 14px',fontSize:'0.78rem',display:'flex',alignItems:'center',gap:6 }}>
              ✨ Create New Case
            </button>
          )}
          <div style={{ display:'flex',gap:6,background:'var(--bg-elevated)',padding:'4px 6px',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)' }}>
            {SIZE_MODES.map(m => (
              <button key={m.key} onClick={() => setDashSize(m.key)} style={{
                padding:'4px 10px',borderRadius:'var(--radius-sm)',border:'none',
                background:size===m.key?'var(--accent-primary)':'transparent',
                color:size===m.key?'#fff':'var(--text-muted)',cursor:'pointer',
                fontSize:'0.72rem',fontWeight:size===m.key?700:400,transition:'all 0.15s',
              }}>{m.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats — all clickable → navigate */}
      <div style={{ display:'grid',gridTemplateColumns:mode.statCols,gap:12,marginBottom:24 }}>
        <StatCard icon="📂" label="Active Cases"       value={c.active}   color="#00d4ff" bg="rgba(0,212,255,0.1)"  size={size} onClick={() => navigate('/cases?status=active')} />
        <StatCard icon="🔴" label="Critical Priority"  value={c.critical} color="#dc2626" bg="rgba(220,38,38,0.12)" size={size} onClick={() => navigate('/cases?priority=1')} />
        <StatCard icon="✅" label="Completed (Lifetime)" value={c.completed} color="#10b981" bg="rgba(16,185,129,0.1)" size={size} onClick={() => navigate('/cases?stage=completed')} />
        <StatCard icon="📅" label="Cases This Month"   value={c.this_month} color="#7c3aed" bg="rgba(124,58,237,0.1)" size={size} onClick={() => navigate('/cases')} />
        <StatCard icon="💰" label="Revenue (Month)"    value={`₹${parseFloat(r.revenue_month||0).toLocaleString('en-IN')}`} color="#f59e0b" bg="rgba(245,158,11,0.1)" size={size} onClick={() => navigate('/reports')} />
        <StatCard icon="⏳" label="Pending Payment"    value={`₹${parseFloat(r.pending_revenue||0).toLocaleString('en-IN')}`} color="#ef4444" bg="rgba(239,68,68,0.1)" size={size} onClick={() => navigate('/accounting')} />
      </div>

      <div style={{ marginBottom: 24 }}>
        {/* Stage Distribution — clickable stages */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">📊 Stage Distribution</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/cases')}>View All →</button>
          </div>
          <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
            {(data?.stageDistribution||[]).map(s => (
              <div key={s.stage} style={{ display:'flex',alignItems:'center',gap:10,cursor:'pointer' }}
                onClick={() => navigate(`/cases?stage=${s.stage}`)}>
                <span className={`badge badge-${s.stage}`} style={{ minWidth:140 }}>{s.stage?.replace(/_/g,' ')}</span>
                <div style={{ flex:1,height:6,background:'var(--border-subtle)',borderRadius:999,overflow:'hidden' }}>
                  <div style={{ height:'100%',width:`${Math.min(100,(s.count/Math.max(...(data?.stageDistribution||[]).map(x=>x.count)))*100)}%`,background:STAGE_COLORS[s.stage]||'var(--accent-primary)',borderRadius:999,transition:'width 0.8s ease' }} />
                </div>
                <span className="text-xs font-mono text-muted">{s.count}</span>
              </div>
            ))}
            {!data?.stageDistribution?.length && <div className="empty-state" style={{ padding:30 }}><div className="empty-desc">No cases yet</div></div>}
          </div>
        </div>
      </div>

      {/* Recent Cases */}
      <div className="table-container">
        <div className="table-header">
          <div className="card-title">🕐 Recent Cases</div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/cases')}>All Cases →</button>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table>
            <thead><tr><th>Case #</th><th>Client</th><th>Device</th><th>Stage</th><th>Priority</th><th>Failure</th><th>Risk</th><th>Engineer</th><th>Date</th></tr></thead>
            <tbody>
              {(data?.recentCases||[]).map(c => <CaseRow key={c.id} c={c} onClick={id => navigate(`/cases/${id}`)} />)}
              {!data?.recentCases?.length && <tr><td colSpan={9} style={{ textAlign:'center',padding:40,color:'var(--text-muted)' }}>No cases yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Failure Analytics — clickable → reports */}
      {data?.failureAnalytics?.length > 0 && (
        <div className="card" style={{ marginTop:24 }}>
          <div className="card-header">
            <div className="card-title">🔬 Top Failure Patterns (Last 90 Days)</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/reports')}>View Reports →</button>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:12 }}>
            {data.failureAnalytics.slice(0,6).map((f,i) => (
              <div key={i} onClick={() => navigate('/reports')} style={{ background:'var(--bg-elevated)',borderRadius:'var(--radius-md)',padding:'12px 14px',border:'1px solid var(--border-subtle)',cursor:'pointer',transition:'all 0.15s' }}
                onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent-primary)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-subtle)'}>
                <div style={{ fontSize:'0.7rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',marginBottom:4 }}>{f.device_brand}</div>
                <div style={{ fontWeight:700,fontSize:'0.9rem',color:'var(--text-primary)' }}>{f.count} cases</div>
                <span className={`badge badge-${f.failure_type}`} style={{ marginTop:6 }}>{f.failure_type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {showNewCase && (
        <NewCaseModal onClose={() => setShowNewCase(false)} onCreated={(newCase) => {
          if (newCase && newCase.id) navigate(`/cases/${newCase.id}`);
        }} />
      )}
    </div>
  );
}
