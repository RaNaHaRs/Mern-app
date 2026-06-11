import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { modelsApi } from '../services/api';
import { useAuth } from '../store/AuthContext';

export default function ModelDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canAccess } = useAuth();
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [showAddFailure, setShowAddFailure] = useState(false);
  const [failureForm, setFailureForm] = useState({});

  useEffect(() => {
    modelsApi.get(id)
      .then(d => { setModel(d); setEditForm(d); })
      .catch(() => navigate('/models'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await modelsApi.update(id, editForm);
      setModel(prev => ({ ...prev, ...updated }));
      setEditing(false);
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleAddFailure = async (e) => {
    e.preventDefault();
    try {
      const steps = failureForm.solution_steps_text
        ? failureForm.solution_steps_text.split('\n').filter(Boolean).map((s, i) => ({ step: i + 1, description: s.trim() }))
        : [];
      await modelsApi.addFailure(id, { ...failureForm, solution_steps: steps });
      const updated = await modelsApi.get(id);
      setModel(updated);
      setShowAddFailure(false);
      setFailureForm({});
    } catch (err) { alert(err.message); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} /></div>;
  if (!model) return null;

  const knownIssues = typeof model.known_issues === 'string' ? JSON.parse(model.known_issues || '{}') : (model.known_issues || {});
  const recoveryStrategy = typeof model.recovery_strategy === 'string' ? JSON.parse(model.recovery_strategy || 'null') : model.recovery_strategy;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/models')}>← Back</button>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
              {model.brand_name}
            </span>
            {model.risk_level && <span className={`badge badge-risk-${model.risk_level}`}>{model.risk_level?.toUpperCase()} RISK</span>}
            {model.is_verified && <span style={{ fontSize: '0.65rem', padding: '2px 8px', background: 'rgba(16,185,129,0.1)', borderRadius: 999, color: 'var(--status-success)', fontFamily: 'var(--font-mono)' }}>✓ VERIFIED</span>}
          </div>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem' }}>{model.model_number}</h2>
          <div className="text-sm text-muted">{model.series && `Series: ${model.series} • `}{model.capacity_gb} GB • {model.interface} • {model.form_factor}"</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {canAccess('senior_engineer') && !editing && (
            <button className="btn btn-secondary" onClick={() => setEditing(true)}>✏️ Edit</button>
          )}
          {editing && (
            <>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
                {saving ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving...</> : '💾 Save Changes'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {['overview', 'engineering', 'failures', 'donors', 'recovery'].map(t => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'overview' ? '📊 Overview' : t === 'engineering' ? '🔧 Engineering' : t === 'failures' ? '🔥 Failure Library' : t === 'donors' ? '🔄 Donors' : '⚕️ Recovery'}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>💿 Device Specifications</div>
            <div className="tech-data-table">
              {[
                ['Brand', model.brand_name],
                ['Model Number', model.model_number],
                ['Series', model.series || '—'],
                ['Capacity', `${model.capacity_gb} GB`],
                ['RPM', model.rpm ? `${model.rpm} RPM` : 'SSD'],
                ['NAND Type', model.nand_type || '—'],
                ['Interface', model.interface],
                ['Form Factor', model.form_factor + '"'],
              ].map(([l, v]) => (
                <div key={l} className="tech-data-cell">
                  <div className="tech-data-label">{l}</div>
                  <div className="tech-data-value">{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            {/* Risk & Stats */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ marginBottom: 14 }}>📈 Recovery Statistics</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { l: 'Total Cases', v: model.case_count || 0, col: 'var(--accent-primary)' },
                  { l: 'Success Rate', v: model.success_rate != null ? `${Math.round(model.success_rate)}%` : '—', col: parseFloat(model.success_rate) >= 80 ? 'var(--status-success)' : 'var(--status-warning)' },
                  { l: 'Risk Level', v: model.risk_level?.toUpperCase() || '—', col: `var(--risk-${model.risk_level})` },
                  { l: 'Verified', v: model.is_verified ? '✓ Yes' : '✗ No', col: model.is_verified ? 'var(--status-success)' : 'var(--text-muted)' },
                ].map(({ l, v, col }) => (
                  <div key={l} style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                    <div className="tech-data-label">{l}</div>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: col, marginTop: 4, fontFamily: 'var(--font-mono)' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Common Failures */}
            {model.common_failures?.length > 0 && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>⚠️ Common Failures</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {model.common_failures.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <span style={{ color: 'var(--status-danger)', fontSize: 12 }}>▸</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ENGINEERING TAB */}
      {tab === 'engineering' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>🔧 Low-Level Engineering Data</div>
            {editing ? (
              <div>
                {[
                  { key: 'controller_chip', label: 'Controller IC', placeholder: 'e.g. Marvell 88i9145' },
                  { key: 'pcb_number', label: 'PCB Number', placeholder: 'e.g. 2060-771824-000' },
                  { key: 'firmware_family', label: 'Firmware Family', placeholder: 'e.g. ABCDE1' },
                  { key: 'microcode_version', label: 'Microcode Version', placeholder: 'e.g. 01.01A01' },
                  { key: 'rom_type', label: 'ROM Type', placeholder: 'e.g. SPI ROM MX25L1606' },
                  { key: 'platter_count', label: 'Platter Count', placeholder: '1, 2, 3...' },
                ].map(({ key, label, placeholder }) => (
                  <div className="form-group" key={key}>
                    <label className="form-label">{label}</label>
                    <input className="form-input" placeholder={placeholder} value={editForm[key] || ''}
                      onChange={e => setEditForm({ ...editForm, [key]: e.target.value })} />
                  </div>
                ))}
                <div className="form-group">
                  <label className="form-label">Head Map</label>
                  <textarea className="form-textarea" placeholder="Head assignment map (JSON or text)" value={editForm.head_map || ''}
                    onChange={e => setEditForm({ ...editForm, head_map: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="tech-data-table">
                {[
                  ['Controller IC', model.controller_chip],
                  ['PCB Number', model.pcb_number],
                  ['Firmware Family', model.firmware_family],
                  ['Microcode Version', model.microcode_version],
                  ['ROM Type', model.rom_type],
                  ['Platter Count', model.platter_count],
                  ['Head Map', model.head_map],
                ].map(([l, v]) => (
                  <div key={l} className="tech-data-cell">
                    <div className="tech-data-label">{l}</div>
                    <div className={`tech-data-value ${l === 'Controller IC' || l === 'PCB Number' ? 'highlight' : ''}`}>{v || '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ marginBottom: 14 }}>🛠️ Tool Compatibility</div>
              {model.tool_compatibility?.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {model.tool_compatibility.map(t => (
                    <span key={t} style={{ padding: '5px 12px', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 999, fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>{t}</span>
                  ))}
                </div>
              ) : <div className="text-xs text-muted">No tool compatibility data</div>}
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>📝 Do & Don't Notes</div>
              {editing ? (
                <>
                  <div className="form-group">
                    <label className="form-label">✅ DO Notes</label>
                    <textarea className="form-textarea" value={editForm.do_notes || ''} onChange={e => setEditForm({ ...editForm, do_notes: e.target.value })} placeholder="What engineers SHOULD do..." />
                  </div>
                  <div className="form-group">
                    <label className="form-label">🚫 DON'T Notes</label>
                    <textarea className="form-textarea" value={editForm.dont_notes || ''} onChange={e => setEditForm({ ...editForm, dont_notes: e.target.value })} placeholder="What engineers MUST NOT do..." />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Risk Level</label>
                    <select className="form-select" value={editForm.risk_level || 'medium'} onChange={e => setEditForm({ ...editForm, risk_level: e.target.value })}>
                      {['low', 'medium', 'high', 'critical'].map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {model.do_notes && (
                    <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--status-success)', marginBottom: 4, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>✓ DO</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{model.do_notes}</div>
                    </div>
                  )}
                  {model.dont_notes && (
                    <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--status-danger)', marginBottom: 4, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>✗ DON'T</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{model.dont_notes}</div>
                    </div>
                  )}
                  {!model.do_notes && !model.dont_notes && <div className="text-xs text-muted">No notes added</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FAILURE LIBRARY TAB */}
      {tab === 'failures' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title">🔥 Known Failure Library ({model.failureLibrary?.length || 0})</div>
            {canAccess('junior_engineer') && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddFailure(true)}>+ Add Entry</button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {(model.failureLibrary || []).map(f => (
              <div key={f.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: 4 }}>{f.title}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span className={`badge badge-${f.failure_type}`}>{f.failure_type}</span>
                      {f.difficulty_level && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '2px 8px', background: 'var(--bg-elevated)', borderRadius: 999 }}>
                          Difficulty: {'★'.repeat(f.difficulty_level)}{'☆'.repeat(5 - f.difficulty_level)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {f.success_rate != null && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.1rem', color: f.success_rate >= 80 ? 'var(--status-success)' : 'var(--status-warning)' }}>
                        {f.success_rate}%
                      </div>
                    )}
                    <div className="text-xs text-muted">success rate</div>
                  </div>
                </div>

                {f.symptoms?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="tech-data-label" style={{ marginBottom: 6 }}>Symptoms</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {f.symptoms.map(s => (
                        <span key={s} style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 999, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {f.root_cause && (
                  <div style={{ marginBottom: 10, fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Root Cause:</strong> {f.root_cause}
                  </div>
                )}

                {f.solution_steps && (
                  <div>
                    <div className="tech-data-label" style={{ marginBottom: 8 }}>Solution Steps</div>
                    <ol className="recovery-steps">
                      {(typeof f.solution_steps === 'string' ? JSON.parse(f.solution_steps) : f.solution_steps).map((step, i) => (
                        <li key={i} className="recovery-step">
                          <span className="step-num">{step.step || i + 1}</span>
                          <span>{step.description || step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {f.tools_required?.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {f.tools_required.map(t => (
                      <span key={t} style={{ fontSize: '0.68rem', padding: '2px 8px', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 999, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>🔧 {t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {!model.failureLibrary?.length && (
              <div className="empty-state">
                <div className="empty-icon">🔥</div>
                <div className="empty-title">No failure entries yet</div>
                <div className="empty-desc">Add known failure patterns for this model to help engineers</div>
              </div>
            )}
          </div>

          {showAddFailure && (
            <div className="modal-overlay">
              <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3 className="modal-title">🔥 Add Failure Entry</h3>
                  <button className="btn btn-ghost btn-icon" onClick={() => setShowAddFailure(false)}>✕</button>
                </div>
                <div className="modal-body">
                  <form onSubmit={handleAddFailure}>
                    <div className="form-group">
                      <label className="form-label required">Title</label>
                      <input className="form-input" required placeholder="e.g. WD Slow Read — ROM Corruption" value={failureForm.title || ''} onChange={e => setFailureForm({ ...failureForm, title: e.target.value })} />
                    </div>
                    <div className="form-row form-row-2">
                      <div className="form-group">
                        <label className="form-label">Failure Type</label>
                        <select className="form-select" value={failureForm.failure_type || 'firmware'} onChange={e => setFailureForm({ ...failureForm, failure_type: e.target.value })}>
                          {['logical', 'firmware', 'electrical', 'mechanical'].map(f => <option key={f}>{f}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Success Rate (%)</label>
                        <input type="number" className="form-input" min="0" max="100" placeholder="0-100" value={failureForm.success_rate || ''} onChange={e => setFailureForm({ ...failureForm, success_rate: parseFloat(e.target.value) })} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Root Cause</label>
                      <textarea className="form-textarea" style={{ minHeight: 70 }} placeholder="What causes this failure?" value={failureForm.root_cause || ''} onChange={e => setFailureForm({ ...failureForm, root_cause: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Solution Steps (one per line)</label>
                      <textarea className="form-textarea" placeholder="Step 1&#10;Step 2&#10;Step 3..." value={failureForm.solution_steps_text || ''} onChange={e => setFailureForm({ ...failureForm, solution_steps_text: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Difficulty (1-5)</label>
                      <select className="form-select" value={failureForm.difficulty_level || 3} onChange={e => setFailureForm({ ...failureForm, difficulty_level: parseInt(e.target.value) })}>
                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} — {'★'.repeat(n)}</option>)}
                      </select>
                    </div>
                  </form>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setShowAddFailure(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleAddFailure} disabled={!failureForm.title}>+ Add Entry</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DONORS TAB */}
      {tab === 'donors' && (
        <div>
          <div className="card-title" style={{ marginBottom: 16 }}>🔄 Compatible Donor Drives</div>
          {model.donorMatches?.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {model.donorMatches.map(d => (
                <div key={d.id} className="donor-card" onClick={() => navigate(`/models/${d.donor_model_id}`)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{d.donor_brand} {d.donor_model}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        {d.head_compatible && <span style={{ fontSize: '0.62rem', padding: '1px 5px', background: 'rgba(16,185,129,0.1)', borderRadius: 999, color: 'var(--status-success)', fontFamily: 'var(--font-mono)' }}>HEADS ✓</span>}
                        {d.pcb_compatible && <span style={{ fontSize: '0.62rem', padding: '1px 5px', background: 'rgba(0,212,255,0.1)', borderRadius: 999, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>PCB ✓</span>}
                        {d.firmware_compatible && <span style={{ fontSize: '0.62rem', padding: '1px 5px', background: 'rgba(124,58,237,0.1)', borderRadius: 999, color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>FW ✓</span>}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.1rem', color: d.compatibility_score >= 80 ? 'var(--status-success)' : d.compatibility_score >= 50 ? 'var(--status-warning)' : 'var(--status-danger)' }}>
                      {Math.round(d.compatibility_score)}%
                    </div>
                  </div>
                  {d.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.notes}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">🔄</div>
              <div className="empty-title">No donor matches recorded</div>
              <div className="empty-desc">Compatible donors can be verified and added by senior engineers</div>
            </div>
          )}
        </div>
      )}

      {/* RECOVERY STRATEGY TAB */}
      {tab === 'recovery' && (
        <div>
          {recoveryStrategy ? (
            <div className="smart-assist-panel">
              <div className="smart-assist-header">
                <span className="ai-badge">Recovery Strategy</span>
                <span className="text-xs text-muted">Model-specific guidance</span>
              </div>
              <pre style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.7, fontFamily: 'var(--font-mono)' }}>
                {JSON.stringify(recoveryStrategy, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">⚕️</div>
              <div className="empty-title">No recovery strategy defined</div>
              <div className="empty-desc">Add recovery strategy data via the Engineering tab</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
