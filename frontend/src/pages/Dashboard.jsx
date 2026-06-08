import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyticsApi } from '../services/api';
import { useAuth } from '../store/AuthContext';
import NewCaseModal from '../components/NewCaseModal';
import { StageDistributionChart } from '../components/Charts';

const STAGE_COLORS = {
  received:'#64748b',inspection:'#3b82f6',diagnosis:'#6366f1',quotation:'#f59e0b',
  approved:'#10b981',rejected:'#ef4444',recovery_in_progress:'#22d3ee',imaging:'#7c3aed',
  data_extraction:'#ec4899',verification:'#fbbf24',completed:'#10b981',delivered:'#22d3ee',failed:'#dc2626',
};
const PRI = {1:'CRITICAL',2:'HIGH',3:'MEDIUM',4:'LOW',5:'MINIMAL'};

const StatCard = ({ label, value, color, onClick, compact }) => (
  <div className={`stat-card${compact ? ' compact' : ''}`} style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
    <div>
      <div className="stat-value" style={{ fontSize: '1.15rem' }}>{value ?? '—'}</div>
      <div className="stat-label" style={{ fontSize: '0.72rem', marginTop: 4 }}>{label}</div>
    </div>
  </div>
);

const KPIStatCard = ({ label, value, color, icon, onClick }) => (
  <div className="card" onClick={onClick} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, padding: '16px' }}>
    <div style={{ padding: 10, borderRadius: 'var(--radius-md)', background: `${color}15`, color: color }}>{icon}</div>
    <div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
    </div>
  </div>
);

const CaseRow = ({ c, onClick }) => {
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
    <tr onClick={() => onClick(c.id)}>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-accent)' }}>{c.case_number}</span>
          {isStale && <span className={`stale-badge ${isStale > 7 ? 'critical' : ''}`}>{isStale}d old</span>}
        </div>
      </td>
      <td><div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{c.first_name} {c.last_name}</div>{c.company && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.company}</div>}</td>
      <td><div style={{ fontSize: '0.8rem' }}>{c.device_brand} {c.device_model}</div></td>
      <td><span className={`badge badge-${c.stage}`}>{c.stage?.replace(/_/g, ' ')}</span></td>
      <td><span className={`badge badge-p${priority}`}>{PRI[priority]}</span></td>
      <td>{c.failure_type && <span className={`badge badge-${c.failure_type}`}>{c.failure_type}</span>}</td>
      <td>{c.ai_risk_level && <span className={`badge badge-risk-${c.ai_risk_level}`}>{c.ai_risk_level}</span>}</td>
      <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>{c.engineer_name || '—'}</td>
      <td style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{new Date(c.created_at).toLocaleDateString('en-IN')}</td>
    </tr>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { canAccess, hasPermission } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewCase, setShowNewCase] = useState(false);

  useEffect(() => {
    analyticsApi.dashboard().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
    <div className="spinner spinner-lg" />
  </div>;

  const c = data?.cases || {};
  const r = data?.revenue || {};

  return (
    <div style={{ animation: 'page-enter 0.3s ease' }}>
      {/* Welcome row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 2 }}>Dashboard</h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {canAccess('staff') && hasPermission('cases', 'create') && (
            <button className="btn btn-primary" onClick={() => setShowNewCase(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Case
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      {hasPermission('cases', 'view') && (
        <div className="stats-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <KPIStatCard label="Active Cases" value={c.active} color="#22d3ee" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>} onClick={() => navigate('/cases?status=active')} />
          <KPIStatCard label="Critical Priority" value={c.critical} color="#ef4444" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>} onClick={() => navigate('/cases?priority=1')} />
          <KPIStatCard label="Completed (Lifetime)" value={c.completed} color="#22c55e" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>} onClick={() => navigate('/cases?stage=completed')} />
          <KPIStatCard label="Cases This Month" value={c.this_month} color="#a78bfa" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>} onClick={() => navigate('/cases')} />
          {hasPermission('accounting', 'view') && (
            <>
              <KPIStatCard label="Revenue (Month)" value={`₹${parseFloat(r.revenue_month || 0).toLocaleString('en-IN')}`} color="#f59e0b" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>} onClick={() => navigate('/reports')} />
              <KPIStatCard label="Pending Amount" value={`₹${parseFloat(r.pending_revenue || 0).toLocaleString('en-IN')}`} color="#ef4444" icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>} onClick={() => navigate('/accounting')} />
            </>
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasPermission('cases', 'view') && !hasPermission('accounting', 'view') && (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16, opacity: 0.5 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h3 style={{ marginBottom: 8 }}>Welcome to RecoverLab CRM</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: 400, margin: '0 auto' }}>
            You do not have permissions to view cases or financial metrics on the dashboard. Use the sidebar to navigate.
          </p>
        </div>
      )}

      {/* Stage Distribution + Recent Cases */}
      {hasPermission('cases', 'view') && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            {/* Stage Distribution Chart */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Stage Distribution</div>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/cases')}>View All</button>
              </div>
              <div style={{ position: 'relative', height: 220 }}>
                <StageDistributionChart data={data?.stageDistribution || []} />
              </div>
              {(data?.stageDistribution || []).length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
                  {(data?.stageDistribution || []).map(s => {
                    const total = (data?.stageDistribution || []).reduce((sum, x) => sum + parseInt(x.count), 0);
                    const pct = total > 0 ? ((parseInt(s.count) / total) * 100).toFixed(1) : 0;
                    return (
                      <div key={s.stage} onClick={() => navigate(`/cases?stage=${s.stage}`)}
                        style={{ cursor: 'pointer', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', textAlign: 'center', transition: 'all 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: STAGE_COLORS[s.stage] }}>{s.count}</div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.stage?.replace(/_/g, ' ')}</div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginTop: 2 }}>{pct}%</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Failure Analytics */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Top Failure Patterns</div>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Last 90 days</span>
              </div>
              {data?.failureAnalytics?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.failureAnalytics.slice(0, 8).map((f, i) => (
                    <div key={i} onClick={() => navigate('/reports')}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}>
                      <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                        {f.count}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>{f.device_brand}</div>
                        <span className={`badge badge-${f.failure_type}`} style={{ fontSize: '0.6rem' }}>{f.failure_type}</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{f.count} cases</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: '0.82rem' }}>No failure data available</div>
              )}
            </div>
          </div>

          {/* Recent Cases Table */}
          <div className="table-container">
            <div className="table-header">
              <div className="card-title">Recent Cases</div>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/cases')}>All Cases</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
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
                    <th>Engineer</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentCases || []).map(c => <CaseRow key={c.id} c={c} onClick={id => navigate(`/cases/${id}`)} />)}
                  {!data?.recentCases?.length && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No cases yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showNewCase && (
        <NewCaseModal onClose={() => setShowNewCase(false)} onCreated={(newCase) => {
          if (newCase && newCase.id) navigate(`/cases/${newCase.id}`);
        }} />
      )}
    </div>
  );
}
