import React, { useState, useEffect } from 'react';


const BASE_URL = '/api';
const getToken = () => localStorage.getItem('accessToken');

export default function InventoryUsageHistoryPanel({ itemId }) {
  const [logs, setLogs] = useState([]);
  const [cases, setCases] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('timeline');

  useEffect(() => {
    loadData();
  }, [itemId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BASE_URL}/inventory/${itemId}/usage-history`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });

      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setCases(data.cases || []);
        setAnalytics(data.analytics || null);
      }
    } catch (err) {
      console.error('Error loading usage history:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="spinner" />;
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        gap: 8,
        borderBottom: '1px solid var(--border-default)',
        marginBottom: 16
      }}>
        {['timeline', 'table', 'cases', 'financials'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'transparent',
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === tab ? '2px solid var(--accent-primary)' : 'none',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? 600 : 400,
              textTransform: 'capitalize'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Timeline View */}
      {activeTab === 'timeline' && (
        <div>
          {logs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {logs.map((log, idx) => (
                <div
                  key={log.id}
                  style={{
                    display: 'flex',
                    gap: 16,
                    padding: 12,
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: '3px solid var(--accent-primary)'
                  }}
                >
                  <div style={{ minWidth: 100 }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      {log.log_type}
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: 4 }}>
                      {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                      <strong>Qty Change:</strong> <span style={{ color: log.quantity_change > 0 ? 'var(--status-success)' : 'var(--status-danger)' }}>
                        {log.quantity_change > 0 ? '+' : ''}{log.quantity_change}
                      </span>
                      {log.quantity_before !== null && log.quantity_after !== null && (
                        <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                          ({log.quantity_before} → {log.quantity_after})
                        </span>
                      )}
                    </div>

                    {log.unit_cost && (
                      <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                        <strong>Cost:</strong> ₹{parseFloat(log.unit_cost).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per unit
                      </div>
                    )}

                    {log.case_number && (
                      <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                        <strong>Case:</strong> <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>{log.case_number}</span>
                      </div>
                    )}

                    {log.user_name && (
                      <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
                        <strong>By:</strong> {log.user_name}
                      </div>
                    )}

                    {log.notes && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                        {log.notes}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
              No usage history yet
            </div>
          )}
        </div>
      )}

      {/* Table View */}
      {activeTab === 'table' && (
        <div style={{ overflowX: 'auto' }}>
          {logs.length > 0 ? (
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.8rem'
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <th style={{ padding: 8, textAlign: 'left' }}>Date</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>Type</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Qty Change</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>Before</th>
                  <th style={{ padding: 8, textAlign: 'center' }}>After</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Cost Impact</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>Case</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>User</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: 8 }}>
                      {new Date(log.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: 8 }}>
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '2px 6px',
                        background: 'rgba(168, 85, 247, 0.1)',
                        color: '#a855f7',
                        borderRadius: 3,
                        fontWeight: 600
                      }}>
                        {log.log_type}
                      </span>
                    </td>
                    <td style={{
                      padding: 8,
                      textAlign: 'center',
                      color: log.quantity_change > 0 ? 'var(--status-success)' : 'var(--status-danger)',
                      fontWeight: 600
                    }}>
                      {log.quantity_change > 0 ? '+' : ''}{log.quantity_change}
                    </td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      {log.quantity_before}
                    </td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      {log.quantity_after}
                    </td>
                    <td style={{ padding: 8, textAlign: 'right' }}>
                      {log.cost_impact !== null ? (
                        <span style={{ color: log.cost_impact < 0 ? 'var(--status-danger)' : 'var(--status-success)' }}>
                          {log.cost_impact < 0 ? '−' : '+'}₹{Math.abs(parseFloat(log.cost_impact)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: 8, fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>
                      {log.case_number || '—'}
                    </td>
                    <td style={{ padding: 8, color: 'var(--text-muted)' }}>
                      {log.user_name || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
              No usage history yet
            </div>
          )}
        </div>
      )}

      {/* Cases View */}
      {activeTab === 'cases' && (
        <div>
          {cases.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.8rem'
              }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                    <th style={{ padding: 8, textAlign: 'left' }}>Case Number</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Usage Type</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Qty Allocated</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Qty Used</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Qty Returned</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Total Cost</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Case Revenue</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((caseItem) => (
                    <tr key={caseItem.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: 8 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                          {caseItem.case_number}
                        </span>
                      </td>
                      <td style={{ padding: 8 }}>
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '2px 6px',
                          background: caseItem.usage_type === 'CONSUMED' ? 'rgba(239, 68, 68, 0.1)' :
                                    caseItem.usage_type === 'TEMPORARY_TOOL' ? 'rgba(59, 130, 246, 0.1)' :
                                    'rgba(34, 197, 94, 0.1)',
                          color: caseItem.usage_type === 'CONSUMED' ? '#ef4444' :
                                 caseItem.usage_type === 'TEMPORARY_TOOL' ? '#3b82f6' : '#22c55e',
                          borderRadius: 3,
                          fontWeight: 600
                        }}>
                          {caseItem.usage_type}
                        </span>
                      </td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        {caseItem.qty_allocated}
                      </td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        {caseItem.qty_used}
                      </td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        {caseItem.qty_returned}
                      </td>
                      <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>
                        ₹{parseFloat(caseItem.total_cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: 8, textAlign: 'right' }}>
                        ₹{parseFloat(caseItem.case_revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: 8 }}>
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '2px 6px',
                          background: 'rgba(168, 85, 247, 0.1)',
                          color: '#a855f7',
                          borderRadius: 3,
                          fontWeight: 600,
                          textTransform: 'capitalize'
                        }}>
                          {caseItem.stage}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
              Not used in any cases yet
            </div>
          )}
        </div>
      )}

      {/* Financials View */}
      {activeTab === 'financials' && analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div style={{
            padding: 16,
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-sm)',
            borderLeft: '3px solid #3b82f6'
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Total Purchased
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#3b82f6', marginTop: 8 }}>
              {analytics.total_purchased_qty || 0} units
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {analytics.purchase_count || 0} purchase{analytics.purchase_count !== 1 ? 's' : ''}
            </div>
          </div>

          <div style={{
            padding: 16,
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-sm)',
            borderLeft: '3px solid #ef4444'
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Total Consumed
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444', marginTop: 8 }}>
              {analytics.total_consumed_qty || 0} units
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Value: ₹{parseFloat(analytics.total_consumed_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div style={{
            padding: 16,
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-sm)',
            borderLeft: '3px solid #22c55e'
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Total Returned
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#22c55e', marginTop: 8 }}>
              {analytics.total_returned_qty || 0} units
            </div>
          </div>

          <div style={{
            padding: 16,
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-sm)',
            borderLeft: '3px solid #06b6d4'
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Utilization Rate
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#06b6d4', marginTop: 8 }}>
              {analytics.total_purchased_qty > 0
                ? Math.round((analytics.total_consumed_qty / analytics.total_purchased_qty) * 100)
                : 0}%
            </div>
          </div>

          {cases.length > 0 && (
            <div style={{
              padding: 16,
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-sm)',
              borderLeft: '3px solid #a855f7'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Cases Involved
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#a855f7', marginTop: 8 }}>
                {cases.length} case{cases.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
