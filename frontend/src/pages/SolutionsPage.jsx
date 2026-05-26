import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { solutionsApi } from '../services/api';
import { formatSolutionTime, fileTypeIcon, canPreviewMedia, downloadFile } from '../utils/solutionMedia';

const DEVICE_TYPES = ['HDD', 'SSD', 'Phone', 'PCB', 'NAS', 'Server', 'Flash Drive', 'RAID', 'Other'];
const PROB_TAGS = ['Head Crash', 'Firmware Corruption', 'Logical Error', 'PCB Damage', 'BSY Error', 'Bad Sectors', 'Motor Seized', 'Not Detected', 'Water Damage', 'Fire Damage', 'Encrypted', 'RAID Rebuild', 'Deleted Files'];
const TYPE_ICONS = { HDD: '💿', SSD: '⚡', Phone: '📱', PCB: '🔌', NAS: '🖥️', Server: '🖧', 'Flash Drive': '🔌', RAID: '🗃️', Other: '🔧' };

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function notePreview(sol) {
  const hist = sol.note_history || [];
  if (hist[0]?.text) return hist[0].text;
  return sol.notes || '';
}

function SolutionFormModal({ title, initial, onClose, onDone }) {
  const [form, setForm] = useState(initial);
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef();

  const handleFiles = (newFiles) => {
    setFiles(prev => [...prev, ...Array.from(newFiles).map(f => ({ file: f, id: `f_${Date.now()}_${Math.random()}` }))]);
  };

  const toggleTag = (tag) => setForm(f => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag] }));

  const handle = async () => {
    if (!form.title || !form.device_type) return;
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, Array.isArray(v) ? JSON.stringify(v) : v));
      files.forEach(({ file }) => fd.append('files', file));
      if (initial.id) await solutionsApi.update(initial.id, fd);
      else await solutionsApi.create(fd);
      onDone();
      onClose();
    } catch (err) { alert(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Solution Title</label>
              <input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Category / Company</label>
              <input className="form-input" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Category or client" />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Device Type</label>
              <select className="form-select" value={form.device_type} onChange={e => setForm({ ...form, device_type: e.target.value })}>
                {DEVICE_TYPES.map(d => <option key={d} value={d}>{TYPE_ICONS[d]} {d}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Problem Summary</label>
              <input className="form-input" value={form.problem} onChange={e => setForm({ ...form, problem: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Problem Tags</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PROB_TAGS.map(tag => (
                <button key={tag} type="button" onClick={() => toggleTag(tag)}
                  style={{ padding: '4px 10px', borderRadius: 999, fontSize: '0.72rem', cursor: 'pointer', border: `1px solid ${form.tags.includes(tag) ? 'var(--accent-primary)' : 'var(--border-default)'}`, background: form.tags.includes(tag) ? 'rgba(0,212,255,0.12)' : 'var(--bg-elevated)', color: form.tags.includes(tag) ? 'var(--accent-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes / Procedure</label>
            <textarea className="form-textarea" style={{ minHeight: 140, fontFamily: 'var(--font-sans)', lineHeight: 1.7 }}
              value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder={initial.id ? 'Add updated procedure notes…' : 'Step-by-step recovery procedure…'} />
          </div>
          <div className="form-group">
            <label className="form-label">Attachments (all file types)</label>
            <div style={{ border: `2px dashed ${dragging ? 'var(--accent-primary)' : 'var(--border-default)'}`, borderRadius: 'var(--radius-md)', padding: '16px', textAlign: 'center', cursor: 'pointer', background: dragging ? 'rgba(0,212,255,0.04)' : 'var(--bg-elevated)' }}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}>
              <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Drop files or click to browse</div>
            </div>
            {files.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {files.map(({ file, id }) => (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
                    <span>{fileTypeIcon({ mimeType: file.type, name: file.name })}</span>
                    <span style={{ flex: 1, fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                    <button type="button" onClick={() => setFiles(prev => prev.filter(f => f.id !== id))} style={{ background: 'none', border: 'none', color: 'var(--status-danger)', cursor: 'pointer' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={loading || !form.title} onClick={handle}>
            {loading ? 'Saving…' : initial.id ? 'Update Solution' : 'Save Solution'}
          </button>
        </div>
      </div>
    </div>
  );
}

function KbNotesTimeline({ noteHistory }) {
  if (!noteHistory?.length) return null;
  const chronological = [...noteHistory].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return (
    <div style={{ marginBottom: 16, overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: 'min-content', gap: 0 }}>
        {chronological.map((n, i) => (
          <React.Fragment key={n.id || i}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 90, flexShrink: 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-primary)' }} />
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{formatSolutionTime(n.createdAt)}</div>
            </div>
            {i < chronological.length - 1 && <div style={{ flex: '1 0 20px', height: 2, background: 'var(--border-default)', marginTop: 3 }} />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function SolutionDetailModal({ sol, onClose, onDelete, onEdit, canDelete, canEdit }) {
  const noteHistory = sol.note_history?.length ? sol.note_history : (sol.notes ? [{ id: 'legacy', text: sol.notes, createdAt: sol.created_at }] : []);
  const caseRefs = sol.case_refs || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">{TYPE_ICONS[sol.device_type]} {sol.title}</h3>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {sol.category || sol.device_type} · {sol.source === 'case' ? 'From case' : 'Manual'} · {formatSolutionTime(sol.created_at)}
              {sol.created_by_name && ` · ${sol.created_by_name}`}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {sol.problem && (
            <div style={{ padding: '10px 14px', background: 'rgba(0,212,255,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-accent)', marginBottom: 16 }}>
              <div className="tech-data-label" style={{ marginBottom: 4 }}>Problem</div>
              <div style={{ fontSize: '0.85rem' }}>{sol.problem}</div>
            </div>
          )}

          {sol.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {sol.tags.map(t => <span key={t} style={{ padding: '3px 8px', borderRadius: 999, fontSize: '0.68rem', background: 'rgba(124,58,237,0.12)', color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>{t}</span>)}
            </div>
          )}

          <KbNotesTimeline noteHistory={noteHistory} />

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>📝 Solution Notes</div>
            {noteHistory.length ? noteHistory.map((n, i) => (
              <div key={n.id || i} style={{ marginBottom: i < noteHistory.length - 1 ? 12 : 0, paddingBottom: i < noteHistory.length - 1 ? 12 : 0, borderBottom: i < noteHistory.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
                  {formatSolutionTime(n.createdAt)}{n.createdByName ? ` · ${n.createdByName}` : ''}
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)', fontSize: '0.82rem', lineHeight: 1.8, margin: 0 }}>{n.text}</pre>
              </div>
            )) : <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No notes</div>}
          </div>

          {caseRefs.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>📂 Related Cases ({caseRefs.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {caseRefs.map(ref => (
                  <Link key={ref.case_id} to={`/cases/${ref.case_id}`} className="btn btn-sm btn-secondary" onClick={e => e.stopPropagation()}>
                    {ref.case_number || ref.case_id}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {sol.files?.length > 0 && (
            <div>
              <div className="card-title" style={{ marginBottom: 12 }}>📎 Attachments ({sol.files.length})</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
                {sol.files.map((f, i) => (
                  <div key={f.id || i} className="card" style={{ padding: 8, cursor: 'pointer' }} onClick={() => downloadFile(f)}>
                    {canPreviewMedia(f) && f.mimeType?.startsWith('image/') ? (
                      <img src={f.data} alt={f.name} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                    ) : (
                      <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>{fileTypeIcon(f)}</div>
                    )}
                    <div style={{ fontSize: '0.7rem', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{formatSize(f.size)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          {canEdit && <button className="btn btn-primary" onClick={() => { onEdit(sol); onClose(); }}>✏️ Edit Solution</button>}
          {canDelete && <button className="btn btn-danger" onClick={() => { if (confirm('Delete this solution?')) { onDelete(sol.id); onClose(); } }}>🗑 Delete</button>}
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function SolutionsPage() {
  const { canAccess } = useAuth();
  const [solutions, setSolutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [editSol, setEditSol] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await solutionsApi.list({ search, device_type: deviceFilter, tag: tagFilter });
      setSolutions(data.solutions || []);
    } catch { } finally { setLoading(false); }
  }, [search, deviceFilter, tagFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    try { await solutionsApi.delete(id); load(); } catch (e) { alert(e.message); }
  };

  const emptyForm = { title: '', company: '', device_type: 'HDD', problem: '', notes: '', tags: [] };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Knowledge Base</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Recovery solutions synced from cases and manual entries</p>
        </div>
        {canAccess('junior_engineer') && (
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Add Solution</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
          <span className="search-icon">🔍</span>
          <input className="search-input" placeholder="Search solutions…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={deviceFilter} onChange={e => setDeviceFilter(e.target.value)}>
          <option value="">All Devices</option>
          {DEVICE_TYPES.map(d => <option key={d} value={d}>{TYPE_ICONS[d]} {d}</option>)}
        </select>
        <select className="form-select" style={{ width: 'auto' }} value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
          <option value="">All Tags</option>
          {PROB_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {['HDD', 'SSD', 'Phone', 'PCB'].map(type => {
          const count = solutions.filter(s => s.device_type === type).length;
          return (
            <button key={type} type="button" onClick={() => setDeviceFilter(deviceFilter === type ? '' : type)}
              style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', border: `1px solid ${deviceFilter === type ? 'var(--accent-primary)' : 'var(--border-default)'}`, background: deviceFilter === type ? 'rgba(0,212,255,0.1)' : 'var(--bg-elevated)', color: deviceFilter === type ? 'var(--accent-primary)' : 'var(--text-muted)', cursor: 'pointer' }}>
              {TYPE_ICONS[type]} {type} ({count})
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)', alignSelf: 'center' }}>{solutions.length} solution(s)</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
      ) : solutions.length === 0 ? (
        <div className="empty-state" style={{ padding: 60 }}>
          <div className="empty-icon">📚</div>
          <div className="empty-title">No solutions found</div>
          <div className="empty-desc">Save solution notes on completed cases or add entries manually</div>
          {canAccess('junior_engineer') && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowNew(true)}>+ Add First Solution</button>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {solutions.map(sol => {
            const preview = notePreview(sol);
            const caseCount = sol.related_case_count ?? (sol.case_refs?.length || 0);
            return (
              <div key={sol.id} className="card" style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                onClick={() => setSelected(sol)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = ''; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <span style={{ fontSize: '1.5rem' }}>{TYPE_ICONS[sol.device_type] || '🔧'}</span>
                  <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 999, background: 'rgba(0,212,255,0.1)', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                    {sol.category || sol.device_type}
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6, lineHeight: 1.4 }}>{sol.title}</div>
                {preview && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{preview}</div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                  {(sol.tags || []).slice(0, 3).map(t => <span key={t} style={{ padding: '2px 6px', borderRadius: 999, fontSize: '0.62rem', background: 'rgba(124,58,237,0.1)', color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>{t}</span>)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  <span>{caseCount} case{caseCount !== 1 ? 's' : ''}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {(sol.has_media || sol.files?.length > 0) && <span>📎</span>}
                    <span>{formatSolutionTime(sol.created_at)}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew && (
        <SolutionFormModal title="📚 Add Solution / Knowledge Entry" initial={emptyForm} onClose={() => setShowNew(false)} onDone={load} />
      )}
      {editSol && (
        <SolutionFormModal
          title="✏️ Edit Solution"
          initial={{
            id: editSol.id,
            title: editSol.title,
            company: editSol.company || editSol.category || '',
            device_type: editSol.device_type || 'Other',
            problem: editSol.problem || '',
            notes: notePreview(editSol),
            tags: editSol.tags || [],
          }}
          onClose={() => setEditSol(null)}
          onDone={load}
        />
      )}
      {selected && (
        <SolutionDetailModal
          sol={selected}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
          onEdit={setEditSol}
          canDelete={canAccess('admin')}
          canEdit={canAccess('junior_engineer')}
        />
      )}
    </div>
  );
}
