import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { casesApi, paymentsApi, accountingApi } from '../services/api';
import { fieldConfigApi } from '../services/fieldConfigApi';
import { useAuth } from '../store/AuthContext';
import { buildInwardFormHtml } from '../components/NewCaseModal';
import { useInventoryConfig } from '../hooks/useInventoryConfig';
import { openPrintPreviewWindow } from '../utils/printPreview';
import { formatSolutionTime } from '../utils/solutionMedia';
import MediaFileGrid from '../components/MediaFileGrid';
import CaseInventoryPanel from '../components/CaseInventoryPanel';
import CaseExpensesPanel from '../components/CaseExpensesPanel';
import jsPDF from 'jspdf';
import 'jspdf-autotable';


const BASE_URL = '/api';
const getToken = () => localStorage.getItem('accessToken');

const STAGE_ICONS = {
  received:'', inspection:'', diagnosis:'', quotation:'',
  approved:'', rejected:'', recovery_in_progress:'', imaging:'',
  data_extraction:'', verification:'', completed:'', delivered:'', failed:'',
};

const ALL_STAGES = [
  'received', 'inspection', 'diagnosis', 'quotation',
  'approved', 'rejected', 'recovery_in_progress', 'imaging',
  'data_extraction', 'verification', 'completed', 'delivered', 'failed'
];

const getLocalList = (key, fallback) => {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) && value.length ? value : fallback;
  } catch {
    return fallback;
  }
};

const renderStageLabel = (stage) => {
  const icon = STAGE_ICONS[stage] || '';
  return `${icon} ${stage.replace(/_/g,' ').toUpperCase()}`;
};

const VALID_NEXT = {
  received: ALL_STAGES, inspection: ALL_STAGES,
  diagnosis: ALL_STAGES, quotation: ALL_STAGES,
  approved: ALL_STAGES, rejected: ALL_STAGES,
  recovery_in_progress: ALL_STAGES, imaging: ALL_STAGES,
  data_extraction: ALL_STAGES, verification: ALL_STAGES,
  completed: ALL_STAGES, delivered: ALL_STAGES, failed: ALL_STAGES,
};

// ─── Drop Zone Upload ────────────────────────────────────────────
function DropZoneUpload({ onUpload, accept = 'image/*,video/*', multiple = true, label = 'Drop images or videos here', uploading }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (uploading) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onUpload(files);
  };

  const handleChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length) onUpload(files);
    e.target.value = '';
  };

  return (
    <div
      style={{
        border: `2px dashed ${dragging ? 'var(--accent-primary)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '28px 20px',
        textAlign: 'center',
        cursor: uploading ? 'wait' : 'pointer',
        background: dragging ? 'rgba(0,212,255,0.04)' : 'var(--bg-elevated)',
        transition: 'all 0.15s',
        position: 'relative',
      }}
      onDragOver={e=>{e.preventDefault();setDragging(true);}}
      onDragLeave={()=>setDragging(false)}
      onDrop={handleDrop}
      onClick={()=>!uploading && inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} style={{display:'none'}} onChange={handleChange} />
      {uploading ? (
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
          <div className="spinner" style={{width:24,height:24,borderWidth:3}} />
          <span style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>Uploading…</span>
        </div>
      ) : (
        <>
          <div style={{fontSize:'1.8rem',marginBottom:8}}>{dragging ? '' : ''}</div>
          <div style={{fontSize:'0.82rem',color:'var(--text-secondary)',fontWeight:600}}>{label}</div>
          <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:4}}>or click to browse</div>
        </>
      )}
    </div>
  );
}

// ─── Solution notes timeline ─────────────────────────────────────
function SolutionNotesTimeline({ notes }) {
  if (!notes?.length) return null;
  const chronological = [...notes].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return (
    <div style={{ marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, minWidth: 'min-content', padding: '4px 2px' }}>
        {chronological.map((n, i) => (
          <React.Fragment key={n.id}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 88, maxWidth: 120, flexShrink: 0 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-primary)', border: '2px solid var(--bg-card)', boxShadow: '0 0 0 2px rgba(0,212,255,0.25)' }} />
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 6, textAlign: 'center', lineHeight: 1.3, fontFamily: 'var(--font-mono)' }}>
                {formatSolutionTime(n.createdAt)}
              </div>
            </div>
            {i < chronological.length - 1 && (
              <div style={{ flex: '1 0 24px', minWidth: 24, height: 2, background: 'var(--border-default)', marginTop: 4, alignSelf: 'flex-start' }} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── Solution Panel ──────────────────────────────────────────────
function SolutionPanel({ caseId, caseStage, caseData }) {
  const { canAccess } = useAuth();
  const [notes, setNotes] = useState([]);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);
  const [form, setForm] = useState({ heading: '', description: '', files: [] });
  const fileInputRef = useRef(null);

  const isSolved = ['completed', 'delivered'].includes(caseStage);
  const canEdit = canAccess('junior_engineer');

  const load = useCallback(async () => {
    try {
      const d = await casesApi.getSolution(caseId);
      const parsedNotes = d.notes?.length
        ? d.notes
        : (d.textNote ? [{ id: 'legacy', text: d.textNote, heading: 'Solution Note', createdAt: null, createdByName: null }] : []);
      setNotes(parsedNotes);
      setMediaFiles(d.mediaFiles || []);
    } catch {} finally { setLoading(false); }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    setForm(f => ({ ...f, files: [...f.files, ...selected] }));
    e.target.value = '';
  };

  const handleRemoveFile = (idx) => {
    setForm(f => ({ ...f, files: f.files.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) { alert('Description is required'); return; }
    setSaving(true);
    try {
      const res = await casesApi.saveSolutionNote(caseId, form.description.trim(), form.heading.trim() || 'Solution Note');
      if (form.files.length > 0) {
        setUploading(true);
        const fd = new FormData();
        form.files.forEach(f => fd.append('files', f));
        await casesApi.uploadSolutionMedia(caseId, fd);
        setUploading(false);
      }
      setForm({ heading: '', description: '', files: [] });
      setShowForm(false);
      await load();
      if (res?.note?.id) {
        const d = await casesApi.getSolution(caseId);
        const newNote = d.notes?.find(n => n.id === res.note.id);
        if (newNote) setSelectedNote(newNote);
      }
    } catch (err) { alert(err.message); }
    finally { setSaving(false); setUploading(false); }
  };

  const handleDeleteMedia = async (fileId) => {
    if (!confirm('Remove this file?')) return;
    try { await casesApi.deleteSolutionMedia(caseId, fileId); await load(); }
    catch (err) { alert(err.message); }
  };

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner" style={{width:24,height:24}} /></div>;

  const timelineNotes = [...notes].filter(n => n.createdAt).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));

  const deviceType = caseData?.device_type || 'HDD';
  const category = caseData?.failure_type || deviceType;
  const TYPE_ICONS = { HDD: '💽', SSD: '🖴', Phone: '📱', PCB: '📟', NAS: '🗄️', Server: '🖥️', 'Flash Drive': '🔌', RAID: '🏗️', Other: '⚙️' };
  const tags = [];
  if (caseData?.failure_type) tags.push(caseData.failure_type);
  if (Array.isArray(caseData?.symptoms)) {
    caseData.symptoms.slice(0, 5).forEach(s => { if (s && !tags.includes(s)) tags.push(s); });
  }

  return (
    <div>
      {/* Header bar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin:0, fontSize:'1.1rem', fontWeight:700, color:'var(--text-primary)' }}>
            🏆 Solution Documentation
          </h3>
          <p style={{ margin:'4px 0 0', fontSize:'0.78rem', color:'var(--text-muted)' }}>
            {notes.length > 0 ? `${notes.length} solution${notes.length > 1 ? 's' : ''} documented` : 'No solutions documented yet'}
          </p>
        </div>
        {canEdit && (
          <button
            className="btn btn-primary"
            onClick={() => setShowForm(v => !v)}
            style={{ display:'flex', alignItems:'center', gap:6 }}
          >
            {showForm ? '✕ Cancel' : '+ Add Solution'}
          </button>
        )}
      </div>

      {!isSolved && (
        <div className="alert alert-warning" style={{marginBottom:20}}>
          <span className="alert-icon">⚠️</span>
          <div>
            <div className="alert-title">Case not yet solved</div>
            <div>Solution documentation is for cases in <strong>Completed</strong> or <strong>Delivered</strong> stage. You can still add notes for reference.</div>
          </div>
        </div>
      )}

      {/* Add Solution Form */}
      {showForm && (
        <div className="card" style={{ marginBottom:20, border:'1px solid var(--border-accent)', background:'var(--bg-elevated)' }}>
          <div className="card-header" style={{ borderBottom:'1px solid var(--border-subtle)', paddingBottom:12, marginBottom:16 }}>
            <div className="card-title" style={{ color:'var(--accent-primary)' }}>📝 New Solution Entry</div>
          </div>
          <form onSubmit={handleSubmit} style={{ padding:'0 4px' }}>
            <div className="form-group" style={{ marginBottom:14 }}>
              <label className="form-label">Heading</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. Head swap — Donor PCB swap successful"
                value={form.heading}
                onChange={e => setForm(f => ({ ...f, heading: e.target.value }))}
                maxLength={200}
              />
            </div>

            <div className="form-group" style={{ marginBottom:14 }}>
              <label className="form-label">Description <span style={{color:'var(--status-danger)'}}>*</span></label>
              <textarea
                className="form-textarea"
                placeholder="Describe the solution: root cause, tools used, steps taken, tips for similar cases…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                style={{ minHeight: 130, lineHeight: 1.7 }}
              />
            </div>

            {/* Media upload */}
            <div className="form-group" style={{ marginBottom:18 }}>
              <label className="form-label">Attach Media (optional)</label>
              <div
                style={{
                  border: '2px dashed var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'var(--bg-secondary)',
                  transition: 'border-color 0.2s',
                }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const files = Array.from(e.dataTransfer.files); setForm(f => ({ ...f, files: [...f.files, ...files] })); }}
              >
                <div style={{ fontSize:'1.4rem', marginBottom:4 }}>📎</div>
                <div style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>Click or drag files — images, videos, PDFs</div>
                <input ref={fileInputRef} type="file" multiple style={{ display:'none' }} onChange={handleFileSelect} />
              </div>
              {form.files.length > 0 && (
                <div style={{ marginTop:10, display:'flex', flexWrap:'wrap', gap:8 }}>
                  {form.files.map((f, i) => (
                    <div key={i} style={{
                      display:'flex', alignItems:'center', gap:6,
                      padding:'4px 10px', background:'rgba(0,212,255,0.08)',
                      border:'1px solid rgba(0,212,255,0.2)', borderRadius: 20,
                      fontSize:'0.75rem', color:'var(--text-secondary)'
                    }}>
                      📄 {f.name}
                      <button type="button" onClick={() => handleRemoveFile(i)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0, lineHeight:1 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
                {saving ? <><div className="spinner" style={{width:13,height:13}} /> Saving…</> : uploading ? <><div className="spinner" style={{width:13,height:13}} /> Uploading…</> : '✓ Save Solution'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setForm({ heading:'', description:'', files:[] }); }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Horizontal Timeline */}
      {timelineNotes.length > 0 && (
        <div style={{ marginBottom: 30, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', padding: '20px 0', overflow: 'hidden' }}>
          <div style={{ padding: '0 20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>Solution Timeline</div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '40px 20px', overflowX: 'auto', minHeight: 180, gap: 150 }}>
            {/* Thick gray bar */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 16, background: '#e5e7eb', transform: 'translateY(-50%)', zIndex: 0 }} />
            {/* Triangle end of gray bar */}
            <div style={{ position: 'absolute', right: 0, top: '50%', width: 0, height: 0, borderTop: '16px solid transparent', borderBottom: '16px solid transparent', borderLeft: '16px solid #e5e7eb', transform: 'translateY(-50%)', zIndex: 1 }} />
            
            {timelineNotes.map((note, i) => {
              const isTop = i % 2 === 0;
              const color = ['#ec4899', '#3b82f6', '#f97316', '#eab308', '#8b5cf6', '#10b981'][i % 6];
              return (
                <div 
                  key={note.id} 
                  style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', minWidth: 2, cursor: 'pointer', transition: 'transform 0.2s' }}
                  onClick={() => setSelectedNote(note)}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  <div style={{ 
                    width: 2, height: 50, background: color, 
                    transform: isTop ? 'translateY(-25px)' : 'translateY(25px)',
                    position: 'relative'
                  }}>
                    {/* Dot on the gray bar */}
                    <div style={{ position: 'absolute', [isTop ? 'bottom' : 'top']: -5, left: -5, width: 12, height: 12, borderRadius: '50%', background: color }} />
                    
                    {/* Map Pin */}
                    <div style={{ 
                      position: 'absolute', [isTop ? 'top' : 'bottom']: -20, left: -12, 
                      width: 24, height: 24, borderRadius: '50% 50% 50% 0',
                      border: `4px solid ${color}`, background: '#fff',
                      transform: isTop ? 'rotate(-45deg)' : 'rotate(135deg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <div style={{ width: 6, height: 6, background: color, borderRadius: '50%', transform: isTop ? 'translate(2px, -2px)' : 'translate(-2px, 2px)' }} />
                    </div>

                    {/* Text block */}
                    <div style={{ 
                      position: 'absolute', left: 20, 
                      [isTop ? 'top' : 'bottom']: -16, 
                      width: 150 
                    }}>
                      <div style={{ color, fontWeight: 700, fontSize: '0.85rem', marginBottom: 2 }}>
                        {new Date(note.createdAt).toLocaleString('en-IN', { month:'short', day:'numeric', year:'numeric' })}
                      </div>
                      <div style={{ color, fontWeight: 600, fontSize: '0.75rem', marginBottom: 4 }}>
                        {new Date(note.createdAt).toLocaleString('en-IN', { hour:'2-digit', minute:'2-digit' })}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                        {note.heading || 'Solution Note'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Solution Cards */}
      {notes.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {notes.map((note, idx) => {
            const heading = note.heading || 'Solution Note';

            return (
              <div
                key={note.id}
                className="card"
                style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                onClick={() => setSelectedNote(note)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
              >
                {/* Header (always visible, styled like KB card) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <span style={{ fontSize: '1.5rem' }}>{TYPE_ICONS[deviceType] || '💽'}</span>
                  <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 999, background: 'rgba(0,212,255,0.1)', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                    {category}
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6, lineHeight: 1.4 }}>
                  {caseData?.device_brand} {caseData?.device_model} — {caseData?.case_number}
                </div>
                {heading && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {heading}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                  {tags.slice(0, 3).map(t => (
                    <span key={t} style={{ padding: '2px 6px', borderRadius: 999, fontSize: '0.62rem', background: 'rgba(124,58,237,0.1)', color: '#a78bfa', fontFamily: 'var(--font-mono)', textTransform: 'capitalize' }}>
                      {t.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  <span>1 case</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {note.createdAt && <span>{new Date(note.createdAt).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        !showForm && (
          <div style={{
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            padding:'60px 20px', color:'var(--text-muted)', textAlign:'center',
          }}>
            <div style={{ fontSize:'3rem', marginBottom:12, opacity:0.4 }}>🏆</div>
            <div style={{ fontWeight:600, fontSize:'1rem', marginBottom:6, color:'var(--text-secondary)' }}>No solutions documented yet</div>
            <div style={{ fontSize:'0.8rem' }}>
              {canEdit ? 'Click "Add Solution" to document how this case was resolved.' : 'No solution has been documented for this case yet.'}
            </div>
          </div>
        )
      )}

      {/* Selected Note Modal */}
      {selectedNote && (
        <div className="modal-overlay" style={{ animation: 'fadeIn 0.2s ease' }} onClick={() => setSelectedNote(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.4rem' }}>{TYPE_ICONS[deviceType]}</span>
                  {selectedNote.heading || 'Solution Note'}
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  {caseData?.device_brand} {caseData?.device_model} — {caseData?.case_number}
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelectedNote(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: '0.68rem', background: 'rgba(0,212,255,0.1)', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                  {category}
                </span>
                {tags.map(t => (
                  <span key={t} style={{ padding: '3px 8px', borderRadius: 999, fontSize: '0.68rem', background: 'rgba(124,58,237,0.12)', color: '#a78bfa', fontFamily: 'var(--font-mono)', textTransform: 'capitalize' }}>
                    {t.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>

              <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', padding: 16, border: '1px solid var(--border-subtle)' }}>
                <pre style={{
                  whiteSpace:'pre-wrap', fontFamily:'var(--font-sans)', fontSize:'0.9rem',
                  color:'var(--text-primary)', lineHeight:1.7, margin:0, padding:0,
                }}>
                  {selectedNote.text}
                </pre>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                  {selectedNote.createdByName && <div style={{ fontSize: '0.75rem', color:'var(--text-muted)' }}>👤 Documented by {selectedNote.createdByName}</div>}
                  {selectedNote.createdAt && <div style={{ fontSize: '0.75rem', color:'var(--text-muted)' }}>🕐 {new Date(selectedNote.createdAt).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>}
                </div>
              </div>

              {notes.findIndex(n => n.id === selectedNote.id) === 0 && mediaFiles.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div className="card-title" style={{ marginBottom: 12 }}>📎 Attached Media ({mediaFiles.length})</div>
                  <MediaFileGrid items={mediaFiles} onDelete={handleDeleteMedia} canDelete={canEdit} variant="gallery" />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedNote(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Case Photos Panel ───────────────────────────────────────────
function CasePhotosPanel({ caseId }) {
  const { canAccess } = useAuth();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await casesApi.getImages(caseId);
      setImages(d || []);
    } catch {} finally { setLoading(false); }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (files) => {
    setUploading(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('images', f));
      await casesApi.uploadImages(caseId, fd);
      await load();
    } catch (err) { alert(err.message); }
    finally { setUploading(false); }
  };

  const handleDelete = async (imgId) => {
    if (!confirm('Remove this image?')) return;
    try {
      await casesApi.deleteImage(caseId, imgId);
      await load();
    } catch (err) { alert(err.message); }
  };

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner" style={{width:24,height:24}} /></div>;

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title"> Device Photos</div>
        <span style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{images.length} photo(s)</span>
      </div>
      <p style={{fontSize:'0.78rem',color:'var(--text-muted)',marginBottom:12}}>
        Upload photos of the physical device — inspection images, PCB damage, head platter condition, etc.
      </p>

      {canAccess('junior_engineer') && (
        <div style={{marginBottom:16}}>
          <DropZoneUpload
            onUpload={handleUpload}
            uploading={uploading}
            accept="image/*"
            label="Drop device photos here (PCB damage, physical condition, internals)"
          />
        </div>
      )}

      {images.length > 0 ? (
        <MediaFileGrid items={images} onDelete={handleDelete} canDelete={canAccess('junior_engineer')} variant="square" style={{ marginTop: 12 }} />
      ) : (
        !uploading && (
          <div className="empty-state" style={{padding:30}}>
            <div className="empty-icon"></div>
            <div className="empty-title">No photos uploaded</div>
            <div className="empty-desc">Upload photos of the device to document its physical condition</div>
          </div>
        )
      )}
    </div>
  );
}

// ─── Smart Assist ────────────────────────────────────────────────
function SmartAssistPanel({ caseId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    casesApi.smartAssist(caseId).then(setData).catch(()=>{}).finally(()=>setLoading(false));
  }, [caseId]);

  if (loading) return <div style={{height:80,display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner" /></div>;
  if (!data) return null;

  return (
    <div className="smart-assist-panel">
      <div className="smart-assist-header">
        <span className="ai-badge">AI SmartAssist</span>
        <span className="text-xs text-muted">Confidence: <strong style={{color:'var(--accent-primary)'}}>{data.confidence}%</strong></span>
      </div>

      <div className="form-row form-row-3" style={{gap:10,marginBottom:12}}>
        <div>
          <div className="tech-data-label">Failure Type</div>
          <span className={`badge badge-${data.suggestedFailureType}`} style={{marginTop:4}}>{data.suggestedFailureType}</span>
        </div>
        <div>
          <div className="tech-data-label">Risk Level</div>
          <span className={`badge badge-risk-${data.riskLevel}`} style={{marginTop:4}}>{data.riskLevel?.toUpperCase()}</span>
        </div>
        <div>
          <div className="tech-data-label">Clean Room</div>
          <span style={{fontFamily:'var(--font-mono)',fontSize:'0.8rem',color:data.cleanRoomRequired?'var(--status-danger)':'var(--status-success)',marginTop:4,display:'block'}}>
            {data.cleanRoomRequired ? '⚠ REQUIRED' : '✓ Not Required'}
          </span>
        </div>
      </div>

      {data.strategy && (
        <div style={{marginBottom:12,padding:'8px 12px',background:'rgba(0,212,255,0.05)',borderRadius:'var(--radius-sm)',border:'1px solid rgba(0,212,255,0.15)'}}>
          <div className="tech-data-label" style={{marginBottom:4}}>Strategy</div>
          <div style={{fontSize:'0.82rem',color:'var(--text-primary)',fontWeight:600}}>{data.strategy}</div>
        </div>
      )}

      {data.warnings?.length > 0 && (
        <div className="alert alert-danger" style={{marginBottom:12}}>
          <span className="alert-icon"></span>
          <div>
            <div className="alert-title">WARNING</div>
            {data.warnings.map((w, i) => <div key={i} style={{marginTop:2}}>{w}</div>)}
          </div>
        </div>
      )}

      {data.steps?.length > 0 && (
        <div>
          <div className="tech-data-label" style={{marginBottom:8}}>Recovery Steps</div>
          <ol className="recovery-steps">
            {data.steps.map((step, i) => (
              <li key={i} className="recovery-step">
                <span className="step-num">{i+1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {(data.doNotes || data.dontNotes) && (
        <div className="form-row form-row-2" style={{marginTop:12}}>
          {data.doNotes && (
            <div style={{background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.15)',borderRadius:'var(--radius-sm)',padding:'10px 12px'}}>
              <div style={{fontSize:'0.65rem',fontWeight:700,color:'var(--status-success)',marginBottom:6,fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.1em'}}>✓ DO</div>
              <div style={{fontSize:'0.78rem',color:'var(--text-secondary)'}}>{data.doNotes}</div>
            </div>
          )}
          {data.dontNotes && (
            <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:'var(--radius-sm)',padding:'10px 12px'}}>
              <div style={{fontSize:'0.65rem',fontWeight:700,color:'var(--status-danger)',marginBottom:6,fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.1em'}}>✗ DON'T</div>
              <div style={{fontSize:'0.78rem',color:'var(--text-secondary)'}}>{data.dontNotes}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Donor Panel ─────────────────────────────────────────────────
function DonorPanel({ caseId, caseData }) {
  const navigate = useNavigate();
  const [donors, setDonors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [manualStockNo, setManualStockNo] = useState('');
  const [searching, setSearching] = useState(false);
  const [manualResult, setManualResult] = useState(null);
  const [manualError, setManualError] = useState('');

  // Search inventory for matching donors by PCB, serial, model, firmware
  useEffect(() => {
    if (!caseData) return;
    setLoading(true);
    const searchTerms = [caseData.pcb_number, caseData.serial_number, caseData.device_model, caseData.firmware].filter(Boolean);
    
    Promise.all(
      searchTerms.map(term =>
        fetch(`${BASE_URL}/inventory?search=${encodeURIComponent(term)}&limit=20`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        }).then(r => r.json()).then(d => d.items || [])
      )
    ).then(results => {
      const allItems = results.flat();
      const seen = new Set();
      const unique = allItems.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
      
      // Score each item
      const scored = unique.map(item => {
        let score = 0;
        const reasons = [];
        if (caseData.pcb_number && item.pcb_number && caseData.pcb_number.toLowerCase() === item.pcb_number.toLowerCase()) { score += 50; reasons.push('PCB match'); }
        if (caseData.serial_number && item.serial_number && caseData.serial_number.toLowerCase() === item.serial_number.toLowerCase()) { score += 40; reasons.push('Serial match'); }
        if (caseData.device_model && item.model && caseData.device_model.toLowerCase() === item.model.toLowerCase()) { score += 30; reasons.push('Model match'); }
        if (caseData.firmware && item.firmware && caseData.firmware.toLowerCase() === item.firmware.toLowerCase()) { score += 25; reasons.push('Firmware match'); }
        if (caseData.site_code && item.site_code && caseData.site_code.toLowerCase() === item.site_code.toLowerCase()) { score += 20; reasons.push('Site code match'); }
        if (caseData.device_brand && (item.company || item.brand) && caseData.device_brand.toLowerCase().includes((item.company || item.brand || '').toLowerCase().split(' ')[0])) { score += 10; reasons.push('Brand match'); }
        const isInStock = (item.status || 'available') === 'available' && item.quantity > 0;
        const isVerified = score >= 50;
        return { ...item, score, reasons, isInStock, isVerified };
      }).filter(i => i.score > 0).sort((a, b) => b.score - a.score);

      setDonors(scored);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [caseData]);

  const handleManualSearch = async () => {
    if (!manualStockNo.trim()) return;
    setSearching(true); setManualError(''); setManualResult(null);
    try {
      const res = await fetch(`${BASE_URL}/inventory?search=${encodeURIComponent(manualStockNo.trim())}&limit=5`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      const item = (data.items || []).find(i => i.stock_number === manualStockNo.trim() || i.sku === manualStockNo.trim());
      if (item) { setManualResult(item); }
      else { setManualError(`No item found with stock number "${manualStockNo}"`); }
    } catch { setManualError('Search failed'); } finally { setSearching(false); }
  };

  const openComparison = (donorItem) => {
    navigate(`/inventory/${donorItem.id}?compare=${caseId}`);
  };

  const DonorCard = ({ d, isManual }) => (
    <div
      className="card"
      style={{ padding: '14px 16px', cursor: 'pointer', border: d.isVerified ? '1px solid rgba(0,212,255,0.3)' : '1px solid var(--border-default)', background: d.isVerified ? 'rgba(0,212,255,0.03)' : 'var(--bg-elevated)', transition: 'all 0.15s' }}
      onClick={() => openComparison(d)}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = d.isVerified ? 'rgba(0,212,255,0.3)' : 'var(--border-default)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>{d.company || d.brand || '—'} {d.model || ''}</div>
          <div className="font-mono text-muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>
            {d.stock_number || d.sku}
            {d.serial_number && ` · S/N: ${d.serial_number}`}
            {d.pcb_number && ` · PCB: ${d.pcb_number}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {d.isVerified && (
            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(0,212,255,0.12)', color: 'var(--accent-primary)', border: '1px solid rgba(0,212,255,0.3)' }}>
               Verified
            </span>
          )}
          {d.isInStock ? (
            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
               In Stock ({d.quantity})
            </span>
          ) : (
            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              Out of Stock
            </span>
          )}
        </div>
      </div>

      {/* Match reasons */}
      {d.reasons?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {d.reasons.map(r => (
            <span key={r} style={{ fontSize: '0.62rem', padding: '2px 6px', background: 'var(--accent-glow)', borderRadius: 999, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
              {r}
            </span>
          ))}
        </div>
      )}

      {/* Compat bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Match</span>
        <div style={{ flex: 1, height: 4, background: 'var(--bg-main)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(d.score, 100)}%`, background: d.score >= 50 ? '#10b981' : d.score >= 25 ? '#f59e0b' : '#ef4444', borderRadius: 999, transition: 'width 0.4s' }} />
        </div>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{Math.min(d.score, 100)}%</span>
        <span style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', opacity: 0.7 }}>Click to compare →</span>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Manual stock number search */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: '0.85rem' }}> Search by Stock Number</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
            placeholder="Enter Stock Number (e.g. STK-042, WD-001)"
            value={manualStockNo} onChange={e => setManualStockNo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleManualSearch()} />
          <button className="btn btn-primary btn-sm" disabled={searching} onClick={handleManualSearch}>
            {searching ? <div className="spinner" style={{ width: 14, height: 14 }} /> : ' Find'}
          </button>
        </div>
        {manualError && <div style={{ color: 'var(--status-danger)', fontSize: '0.78rem', marginTop: 6 }}>{manualError}</div>}
        {manualResult && <div style={{ marginTop: 10 }}><DonorCard d={{ ...manualResult, score: 100, reasons: ['Manual entry'], isInStock: (manualResult.status||'available') === 'available' && manualResult.quantity > 0, isVerified: true }} isManual /></div>}
      </div>

      {/* Auto-matched donors */}
      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
         Auto-Matched from Stock — {loading ? '…' : `${donors.length} found`}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" /></div>
      ) : donors.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <div className="empty-icon"></div>
          <div className="empty-title">No matching donors found</div>
          <div className="empty-desc">Enter a stock number above, or add matching items to inventory</div>
        </div>
      ) : (
        donors.map(d => <DonorCard key={d.id} d={d} />)
      )}
    </div>
  );
}



// ─── Pdf Viewer Component ──────────────────────────────────────────
function PdfViewerModal({ invoice, companyData, caseData, onClose }) {
  const handlePrint = () => window.print();

  return (
    <div className="pdf-modal-overlay">
      <div className="pdf-modal" onClick={e => e.stopPropagation()}>
        <div className="pdf-modal-header">
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:'1.4rem' }}>📄</span>
            <div>
              <div style={{ fontWeight:700, fontSize:'1.1rem' }}>Invoice {invoice.invoice_number}</div>
              <div style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>{caseData?.first_name} {caseData?.last_name}</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-secondary btn-sm" onClick={handlePrint}>🖨 Print / Save PDF</button>
            <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="pdf-modal-body" id="printable-invoice">
          {/* Mocked PDF layout */}
          <div style={{ background:'white', color:'black', padding:'40px 50px', borderRadius:8, minHeight:750, margin:'0 auto', maxWidth:700, fontFamily:'Arial, sans-serif' }}>
            <div style={{ display:'flex', justifyContent:'space-between', borderBottom:'2px solid #ccc', paddingBottom:20, marginBottom:30 }}>
              <div>
                {companyData?.logo_data ? (
                  <img src={companyData.logo_data} alt="Company Logo" style={{ maxHeight:60, marginBottom:10 }} />
                ) : (
                  <h1 style={{ margin:0, color:'#333', fontSize:'24px' }}>{companyData?.name || 'RecoverLab CRM'}</h1>
                )}
                <div style={{ fontSize:'12px', color:'#666', marginTop:4 }}>{companyData?.address || '123 Data Recovery Way\nTech City'}</div>
                <div style={{ fontSize:'12px', color:'#666' }}>{companyData?.phone} | {companyData?.email}</div>
                {companyData?.gstin && <div style={{ fontSize:'12px', color:'#666', fontWeight:'bold', marginTop:4 }}>GSTIN: {companyData.gstin}</div>}
              </div>
              <div style={{ textAlign:'right' }}>
                <h2 style={{ margin:0, color:'#333', fontSize:'32px', letterSpacing:'0.05em' }}>INVOICE</h2>
                <div style={{ fontSize:'14px', marginTop:10 }}><strong>No:</strong> {invoice.invoice_number}</div>
                <div style={{ fontSize:'14px' }}><strong>Date:</strong> {new Date(invoice.created_at || Date.now()).toLocaleDateString('en-IN')}</div>
                {invoice.due_date && <div style={{ fontSize:'14px' }}><strong>Due:</strong> {new Date(invoice.due_date).toLocaleDateString('en-IN')}</div>}
              </div>
            </div>

            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:40 }}>
              <div>
                <div style={{ fontSize:'12px', color:'#666', textTransform:'uppercase', letterSpacing:'1px', marginBottom:4 }}>Bill To:</div>
                <div style={{ fontWeight:'bold', fontSize:'16px' }}>{caseData?.first_name} {caseData?.last_name}</div>
                {caseData?.company && <div style={{ fontSize:'14px' }}>{caseData.company}</div>}
                <div style={{ fontSize:'14px', color:'#444', marginTop:4 }}>{caseData?.phone}</div>
                <div style={{ fontSize:'14px', color:'#444' }}>{caseData?.email}</div>
                {caseData?.address && <div style={{ fontSize:'14px', color:'#444', marginTop:4 }}>{caseData.address}</div>}
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:'12px', color:'#666', textTransform:'uppercase', letterSpacing:'1px', marginBottom:4 }}>Case Details:</div>
                <div style={{ fontSize:'14px' }}><strong>Case No:</strong> {caseData?.case_number}</div>
                <div style={{ fontSize:'14px' }}><strong>Device:</strong> {caseData?.device_brand} {caseData?.device_model}</div>
                {caseData?.serial_number && <div style={{ fontSize:'14px' }}><strong>S/N:</strong> {caseData.serial_number}</div>}
              </div>
            </div>

            <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:30 }}>
              <thead>
                <tr style={{ background:'#f5f5f5', borderBottom:'2px solid #ddd' }}>
                  <th style={{ padding:10, textAlign:'left', fontSize:'14px' }}>Description</th>
                  <th style={{ padding:10, textAlign:'right', fontSize:'14px' }}>Qnty</th>
                  <th style={{ padding:10, textAlign:'right', fontSize:'14px' }}>Price</th>
                  <th style={{ padding:10, textAlign:'right', fontSize:'14px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom:'1px solid #eee' }}>
                  <td style={{ padding:10, fontSize:'14px' }}>Professional Data Recovery Service ({caseData?.failure_type} failure)</td>
                  <td style={{ padding:10, textAlign:'right', fontSize:'14px' }}>1</td>
                  <td style={{ padding:10, textAlign:'right', fontSize:'14px' }}>₹{parseFloat(invoice.total || 0).toLocaleString('en-IN')}</td>
                  <td style={{ padding:10, textAlign:'right', fontSize:'14px' }}>₹{parseFloat(invoice.total || 0).toLocaleString('en-IN')}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <div style={{ width:'40%', fontSize:'12px', color:'#555' }}>
                {companyData?.invoice_bank_name && (
                  <div style={{ background:'#f9f9f9', padding:10, borderRadius:4 }}>
                    <strong style={{ display:'block', marginBottom:4, color:'#333' }}>Bank Details</strong>
                    <div>{companyData.invoice_bank_name} - {companyData.invoice_bank_branch}</div>
                    <div>A/C: {companyData.invoice_bank_account}</div>
                    <div>IFSC: {companyData.invoice_bank_ifsc}</div>
                  </div>
                )}
              </div>
              <div style={{ width:'35%' }}>
                <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0' }}>
                  <strong style={{ fontSize:'14px' }}>Subtotal:</strong>
                  <span style={{ fontSize:'14px' }}>₹{parseFloat(invoice.total || 0).toLocaleString('en-IN')}</span>
                </div>
                {companyData?.gst_enabled && (
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0' }}>
                    <strong style={{ fontSize:'14px' }}>Tax ({companyData.gst_rate||18}%):</strong>
                    <span style={{ fontSize:'14px' }}>₹{(parseFloat(invoice.total||0) * ((companyData.gst_rate||18)/100)).toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderTop:'2px solid #ccc', marginTop:10 }}>
                  <strong style={{ fontSize:'18px' }}>Total:</strong>
                  <strong style={{ fontSize:'18px' }}>
                    ₹{(parseFloat(invoice.total||0) * (companyData?.gst_enabled ? (1 + (companyData.gst_rate||18)/100) : 1)).toLocaleString('en-IN')}
                  </strong>
                </div>
              </div>
            </div>

            {(companyData?.invoice_disclaimer || companyData?.invoice_footer) && (
              <div style={{ marginTop:60, borderTop:'1px solid #eee', paddingTop:20, fontSize:'11px', color:'#777', textAlign:'center' }}>
                {companyData?.invoice_disclaimer && <div style={{ marginBottom:6 }}>{companyData.invoice_disclaimer}</div>}
                {companyData?.invoice_footer && <div>{companyData.invoice_footer}</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Transfer to Stock Form ──────────────────────────────────────
const HDD_CAT_MAP = {
  'Western Digital': { '3.5': 'wd_35', '2.5': 'wd_25' },
  'WD': { '3.5': 'wd_35', '2.5': 'wd_25' },
  'Seagate': { '3.5': 'seagate_35', '2.5': 'seagate_25' },
};

function TransferToStockForm({ caseData, caseId, onDone, onClose }) {
  const { activeCategories } = useInventoryConfig();

  // Auto-detect category from brand + form factor
  const guessCategory = () => {
    const brand = (caseData?.device_brand || '').trim();
    const ff = (caseData?.form_factor || '3.5');
    const size = ff.includes('2.5') ? '2.5' : '3.5';
    for (const [key, map] of Object.entries(HDD_CAT_MAP)) {
      if (brand.toLowerCase().includes(key.toLowerCase())) return map[size];
    }
    return size === '2.5' ? 'others_25' : 'others_35';
  };

  const [form, setForm] = useState({
    stock_number: `STK-${caseData?.case_number || Date.now()}`,
    category: guessCategory(),
    company: caseData?.device_brand || '',
    brand: caseData?.device_brand || '',
    model: caseData?.device_model || '',
    serial_number: caseData?.serial_number || '',
    pcb_number: caseData?.pcb_number || '',
    firmware: caseData?.firmware || '',
    site_code: caseData?.site_code || '',
    date_code: caseData?.date_code || '',
    head_map: caseData?.head_map || '',
    family: caseData?.family || '',
    capacity: caseData?.capacity_gb ? `${caseData.capacity_gb}GB` : '',
    interface: caseData?.interface || 'SATA',
    form_factor: caseData?.form_factor || '3.5" HDD',
    condition: 'for_parts',
    status: 'available',
    quantity: 1,
    location: '',
    notes: `Transferred from case ${caseData?.case_number || ''}. Client: ${caseData?.first_name || ''} ${caseData?.last_name || ''}.`,
  });
  const [loading, setLoading] = useState(false);

  const INV_CATEGORIES = [
    { key: 'wd_35', label: 'WD 3.5"' }, { key: 'wd_25', label: 'WD 2.5"' },
    { key: 'seagate_35', label: 'Seagate 3.5"' }, { key: 'seagate_25', label: 'Seagate 2.5"' },
    { key: 'others_35', label: 'Others 3.5"' }, { key: 'others_25', label: 'Others 2.5"' },
    { key: 'pcb', label: 'PCB' }, { key: 'ssd', label: 'SSD' }, { key: 'phone', label: 'Phone' },
  ];

  const categoriesList = activeCategories?.length ? activeCategories : INV_CATEGORIES;

  const handle = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/inventory`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source_case_id: caseId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Transfer failed');
      alert(`✅ HDD transferred to stock!\nStock #: ${form.stock_number}`);
      onDone();
      onClose();
    } catch(e) { alert('Transfer failed: ' + e.message); }
    finally { setLoading(false); }
  };

  const F = ({ label, field, type = 'text', opts }) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {opts ? (
        <select className="form-select" value={form[field]||''} onChange={e => setForm(f => ({...f, [field]: e.target.value}))}>
          {opts.map(o => <option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
        </select>
      ) : (
        <input type={type} className="form-input" value={form[field]||''} onChange={e => setForm(f => ({...f, [field]: e.target.value}))} />
      )}
    </div>
  );

  return (
    <div>
      <div className="alert alert-info" style={{ marginBottom: 14 }}>
        <span className="alert-icon">💡</span>
        <div>Moving the <strong>{caseData?.device_brand} {caseData?.device_model}</strong> from case <strong>{caseData?.case_number}</strong> into the stock inventory. All HDD details are pre-filled.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <F label="Stock Number (Manual)" field="stock_number" />
        <div className="form-group">
          <label className="form-label">Category</label>
          <select className="form-select" value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))}>
            {categoriesList.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <F label="Company / Brand" field="company" />
        <F label="Model" field="model" />
        <F label="Serial Number" field="serial_number" />
        <F label="PCB Number" field="pcb_number" />
        <F label="Firmware / SW Rev" field="firmware" />
        <F label="Site Code / DCM" field="site_code" />
        <F label="Date Code" field="date_code" />
        <F label="Head Map" field="head_map" />
        <F label="Capacity" field="capacity" />
        <F label="Interface" field="interface" />
        <F label="Condition" field="condition" opts={[
          { value: 'for_parts', label: 'For Parts / Faulty' },
          { value: 'used', label: 'Used / Working' },
          { value: 'refurb', label: 'Refurbished' },
          { value: 'new', label: 'New (Unused)' },
        ]} />
        <F label="Status" field="status" opts={[
          { value: 'available', label: '✅ Available' },
          { value: 'reserved', label: '🔒 Reserved' },
          { value: 'damaged', label: '⚠️ Damaged' },
        ]} />
        <F label="Shelf / Location" field="location" />
        <F label="Quantity" field="quantity" type="number" />
      </div>
      <div className="form-group" style={{ marginTop: 4 }}>
        <label className="form-label">Notes</label>
        <textarea className="form-textarea" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} />
      </div>
      <div className="modal-footer" style={{ paddingTop: 0 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={loading || !form.stock_number} onClick={handle}>
          {loading ? <><div className="spinner" style={{width:14,height:14}}/> Transferring...</> : '📦 Transfer to Inventory'}
        </button>
      </div>
    </div>
  );
}

// ─── Main CaseDetail ─────────────────────────────────────────────
export default function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, canAccess } = useAuth();
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('activeTab_CaseDetail') || 'overview');
  useEffect(() => { sessionStorage.setItem('activeTab_CaseDetail', activeTab); }, [activeTab]);
  const [showTransition, setShowTransition] = useState(false);
  const [transitionForm, setTransitionForm] = useState({ stage:'', notes:'', timeSpentMinutes:0 });
  const [transitioning, setTransitioning] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [viewPdf, setViewPdf] = useState(null);
  const [showEditCase, setShowEditCase] = useState(false);
  const [customStages, setCustomStages] = useState(ALL_STAGES);
  const [timelineNote, setTimelineNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [caseInvoices, setCaseInvoices] = useState([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef();
  const [stockTransferItem, setStockTransferItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editingLogId, setEditingLogId] = useState(null);
  const [editLogText, setEditLogText] = useState('');
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [solutionNotes, setSolutionNotes] = useState([]);
  const [expandedTimelineSolutions, setExpandedTimelineSolutions] = useState({});

  const companyData = (() => { try { return JSON.parse(localStorage.getItem('crm_company')) || {}; } catch { return {}; }})();

  useEffect(() => {
    fieldConfigApi.loadCaseSettingsToLocalStorage()
      .then((settings) => {
        const nextStages = Array.isArray(settings?.stages) && settings.stages.length ? settings.stages : ALL_STAGES;
        setCustomStages(nextStages);
      })
      .catch(() => {
        setCustomStages(getLocalList('custom_stages', ALL_STAGES));
      });
  }, []);

  useEffect(() => {
    const refreshStages = () => setCustomStages(getLocalList('custom_stages', ALL_STAGES));

    const onCaseSettingsUpdated = (event) => {
      if (event?.detail?.stages && Array.isArray(event.detail.stages)) {
        setCustomStages(event.detail.stages);
      } else {
        refreshStages();
      }
    };

    const onStorage = (event) => {
      if (event?.key === 'custom_stages') {
        refreshStages();
      }
    };

    window.addEventListener('caseSettingsUpdated', onCaseSettingsUpdated);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('caseSettingsUpdated', onCaseSettingsUpdated);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const generatePaymentLink = async (invoice) => {
    const amount = parseFloat(invoice.total||0) * (companyData?.gst_enabled ? (1 + (companyData.gst_rate||18)/100) : 1);
    try {
      const res = await fetch(`${BASE_URL}/razorpay/payment-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          customer_name: `${caseData.first_name} ${caseData.last_name}`,
          customer_phone: caseData.phone || '',
          customer_email: caseData.email || '',
          description: `Data Recovery Service — ${caseData.case_number}`,
          invoice_id: invoice.invoice_number,
        }),
      });
      const data = await res.json();
      const url = data.payment_link || `https://rzp.io/l/demo_${Math.random().toString(36).substring(2,8)}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      alert(`✅ Payment Link${data.demo ? ' (Demo)' : ''} copied to clipboard!\n\n${url}\n\nAmount: ₹${amount.toLocaleString('en-IN')}\nSend this to ${caseData.first_name} via WhatsApp or Email.`);
    } catch {
      const url = `https://rzp.io/l/demo_${Math.random().toString(36).substring(2,8)}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      alert(`Payment Link (demo) copied:\n${url}`);
    }
  };

  useEffect(() => {
    casesApi.get(id)
      .then(d => {
        setCaseData(d);
        setEditForm(d);
        // Load solution notes for timeline
        casesApi.getSolution(id).then(sol => {
          const parsed = sol.notes?.length
            ? sol.notes
            : (sol.textNote ? [{ id: 'legacy', text: sol.textNote, heading: 'Solution Note', createdAt: null }] : []);
          setSolutionNotes(parsed);
        }).catch(() => {});
        // Load invoices for this case using case_id
        fetch(`${BASE_URL}/accounting/invoices?case_id=${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        })
            .then(r => r.json())
            .then(invData => setCaseInvoices(invData.invoices || []))
            .catch(() => {});
      })
      .catch(err => { if(err.status===404) navigate('/cases'); })
      .finally(() => setLoading(false));
  }, [id]);

  const handleAddTimelineNote = async () => {
    if (!timelineNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`${BASE_URL}/cases/${id}/timeline-notes`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${getToken()}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ notes: timelineNote }),
      });
      if (!res.ok) throw new Error('Failed to add timeline note');
      const updated = await casesApi.get(id);
      setCaseData(updated);
      setTimelineNote('');
    } catch(e){ alert(e.message); } finally{ setSavingNote(false); }
  };

  const handleEditLog = async (logId, currentText) => {
    setEditingLogId(logId);
    setEditLogText(currentText || '');
  };

  const handleSaveLogEdit = async () => {
    if (!editingLogId) return;
    try {
      await fetch(`${BASE_URL}/cases/${id}/timeline-notes/${editingLogId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: editLogText }),
      });
      const updated = await casesApi.get(id);
      setCaseData(updated);
      setEditingLogId(null);
      setEditLogText('');
    } catch (e) { alert('Failed to save: ' + e.message); }
  };

  const handleDeleteLog = async (logId) => {
    if (!confirm('Delete this timeline entry?')) return;
    try {
      await fetch(`${BASE_URL}/cases/${id}/timeline-notes/${logId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const updated = await casesApi.get(id);
      setCaseData(updated);
    } catch (e) { alert('Failed to delete: ' + e.message); }
  };

  const handleUploadFiles = async (files) => {
    setUploadingFiles(true);
    try {
      for (const file of Array.from(files)) {
        const reader = new FileReader();
        await new Promise(resolve => {
          reader.onload = async (e) => {
            await fetch(`${BASE_URL}/cases/${id}/files`, {
              method:'POST',
              headers:{ Authorization:`Bearer ${getToken()}`, 'Content-Type':'application/json' },
              body: JSON.stringify({ name: file.name, data: e.target.result, size: file.size, mimeType: file.type }),
            });
            resolve();
          };
          reader.readAsDataURL(file);
        });
      }
      const updated = await casesApi.get(id);
      setCaseData(updated);
    } catch(e){ alert(e.message); } finally{ setUploadingFiles(false); }
  };

  const handleTransferToStock = async () => {
    if (!confirm('Transfer this case HDD to inventory stock?')) return;
    try {
      await fetch(`${BASE_URL}/cases/${id}/transfer-to-stock`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${getToken()}`, 'Content-Type':'application/json' },
        body: JSON.stringify({}),
      });
      alert('✅ HDD transferred to inventory stock!');
    } catch(e){ alert(e.message || 'Transfer failed'); }
  };

  const handleTransferToClient = async () => {
    const newStatus = !caseData.transfer_to_client;
    const confirmMsg = newStatus 
      ? 'Are you sure you want to transfer this case to the client?' 
      : 'Are you sure you want to undo the transfer of this case to the client?';
    if (!confirm(confirmMsg)) return;
    try {
      await casesApi.transferToClient(id, newStatus);
      setCaseData(prev => ({ ...prev, transfer_to_client: newStatus }));
      alert(`✅ Case status updated: Transferred to Client = ${newStatus ? 'Yes' : 'No'}`);
    } catch(e){ alert(e.message || 'Failed to update transfer status'); }
  };

  const handleSaveEdit = async () => {
    try {
      await fetch(`${BASE_URL}/cases/${id}`, {
        method:'PUT',
        headers:{ Authorization:`Bearer ${getToken()}`, 'Content-Type':'application/json' },
        body: JSON.stringify(editForm),
      });
      const updated = await casesApi.get(id);
      setCaseData(updated);
      setShowEditCase(false);
    } catch(e){ alert(e.message); }
  };

  const downloadInvoicePDF = (inv) => {
    const html = `<!DOCTYPE html><html><head><title>Invoice ${inv.invoice_number}</title>
    <style>@page{margin:0}
    body{font-family:Inter,Arial,sans-serif;padding:20px;color:#111;max-width:800px;margin:0 auto}
    .header{display:flex;justify-content:space-between;border-bottom:3px solid #0284c7;padding-bottom:10px;margin-bottom:14px}
    .co-name{font-size:20px;font-weight:900;color:#0284c7}.inv-title{font-size:18px;font-weight:800;color:#0284c7;text-align:right}
    table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ddd;padding:5px 10px;font-size:10px}
    th{background:#f1f5f9;font-weight:700;text-transform:uppercase;font-size:9px}
    .total-row{font-weight:900;background:#0d1117;color:#00d4ff}.footer{margin-top:16px;padding-top:8px;border-top:1px solid #ddd;font-size:9px;color:#94a3b8;text-align:center}</style></head>
    <body>
    <div class="header"><div><div class="co-name">RecoverLab</div><div style="font-size:11px;color:#64748b">Data Recovery Services</div></div>
    <div><div class="inv-title">INVOICE</div><div style="font-size:13px;font-weight:700">${inv.invoice_number}</div>
    <div style="font-size:11px;color:#64748b">Date: ${inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-IN') : '—'}</div></div></div>
    <div style="margin-bottom:20px"><strong>Bill To:</strong> ${inv.client_name}${inv.company?'<br/>'+inv.company:''}${inv.client_address?'<br/>'+inv.client_address:''}</div>
    <table><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>
    ${(inv.line_items||[]).map(l=>`<tr><td>${l.description}</td><td style="text-align:center">${l.qty}</td><td style="text-align:right">₹${parseFloat(l.unit_price).toLocaleString('en-IN')}</td><td style="text-align:right">₹${((l.qty||1)*(l.unit_price||0)).toLocaleString('en-IN')}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="3" style="text-align:right;font-weight:700">Subtotal</td><td style="text-align:right">₹${parseFloat(inv.subtotal||0).toLocaleString('en-IN')}</td></tr>
    ${inv.discount_amt>0?`<tr><td colspan="3" style="text-align:right;color:#10b981">Discount</td><td style="text-align:right;color:#10b981">—₹${parseFloat(inv.discount_amt).toLocaleString('en-IN')}</td></tr>`:''}
    <tr><td colspan="3" style="text-align:right">GST (${inv.tax_pct}%)</td><td style="text-align:right">₹${parseFloat(inv.tax_amt||0).toLocaleString('en-IN')}</td></tr>
    <tr class="total-row"><td colspan="3" style="text-align:right;padding:10px">TOTAL</td><td style="text-align:right;padding:10px">₹${parseFloat(inv.total||0).toLocaleString('en-IN')}</td></tr></tfoot></table>
    <div class="footer">RecoverLab Data Recovery CRM — Thank you for your business.</div></body></html>`;
    const w = window.open('','_blank'); w.document.write(html); w.document.close(); setTimeout(()=>w.print(),400);
  };

  const printInwardForm = () => {
    const mappedData = {
      ...caseData,
      quotation_amount: caseData.quotation_total || 0,
      advance_amount: caseData.total_paid || 0,
    };
    const html = buildInwardFormHtml(mappedData, 'standard');
    openPrintPreviewWindow(html);
  };

  const printCourierSlip = () => {
    const co = companyData;
    const clientName = `${caseData.first_name} ${caseData.last_name}`;
    const clientPhone = caseData.phone || '';
    const clientEmail = caseData.email || '';
    const clientAddr = [caseData.address, caseData.city, caseData.pincode].filter(Boolean).join(', ') || 'Address not on file';
    const coAddr = co.address || 'Address not set';
    const coPhone = co.phone || '';
    const coName = co.name || 'RecoverLab CRM';
    const ref = caseData.case_number;
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
      .ref-no{font-family:'Courier New',monospace;font-size:13px;font-weight:800;background:rgba(0,212,255,0.14);padding:3px 10px;border-radius:4px;border:1px solid rgba(0,212,255,0.35)}
      .date-line{font-size:11px;color:rgba(0,212,255,0.7);margin-top:3px;font-family:'Courier New',monospace}
      .addr-row{display:grid;grid-template-columns:3fr 2fr}
      .to-cell{padding:16px 18px;border-right:2px dashed #cbd5e1;background:#fff}
      .from-cell{padding:12px 16px;background:#f8fafc}
      .lbl{font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.14em;color:#94a3b8;margin-bottom:6px}
      .to-name{font-size:22px;font-weight:900;color:#0f172a;margin-bottom:5px;line-height:1.15}
      .to-addr{font-size:12px;color:#334155;line-height:1.7}
      .to-phone{font-size:15px;font-weight:800;color:#0f172a;margin-top:5px}
      .to-email{font-size:11px;color:#64748b;margin-top:2px}
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
    </style></head>
    <body>
    <div class="controls">
      <strong>📦 Courier Slip</strong>
      <label>Size: <select id="sz" onchange="upd()">
        <option value="A5 landscape">A5 — Medium</option>
        <option value="A4 landscape">A4 — Large</option>
        <option value="A6 portrait">A6 — Small</option>
      </select></label>
      <button class="btn-close" onclick="window.close()">✕ Close</button>
      <button type="button" class="btn-print">🖨 Print</button>
    </div>
    <div class="slip-wrap"><div class="slip">
      <div class="slip-header">
        <div>
          <div class="brand"> ${coName}</div>
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
          ${clientEmail ? `<div class="to-email">${clientEmail}</div>` : ''}
        </div>
        <div class="from-cell">
          <div class="lbl">FROM — Sender</div>
          <div class="from-name">${coName}</div>
          <div class="from-addr">${coAddr}${coPhone ? '<br/>' + coPhone : ''}</div>
        </div>
      </div>
      <div class="bar-row">
        <div><div class="ref-lbl">Reference</div><div class="ref-text">${ref}</div></div>
        <div class="tags">
          <span class="s-tag">DATA RECOVERY</span>
          <span class="d-tag">${today}</span>
        </div>
      </div>
      <div class="warn">⚠ FRAGILE — Handle with care. Contains electronic storage media. Do NOT expose to magnets, heat, or static.</div>
    </div></div>
    <div class="cut-line">✂ Cut along this line — Affix to courier package</div>
    <script>
      function upd(){
        var v=document.getElementById('sz').value;
        document.getElementById('pageStyle').textContent='@page{size:'+v+';margin:0}';
      }
    </script>
    </body></html>`;
    openPrintPreviewWindow(html);
  };

  const handleTransition = async () => {
    setTransitioning(true);
    try {
      await casesApi.transition(id, transitionForm);
      const updated = await casesApi.get(id);
      setCaseData(updated);
      setShowTransition(false);
      setTransitionForm({ stage:'', notes:'', timeSpentMinutes:0 });
    } catch (err) { alert(err.message); }
    finally { setTransitioning(false); }
  };

  if (loading) return <div style={{display:'flex',justifyContent:'center',paddingTop:80}}><div className="spinner" style={{width:32,height:32,borderWidth:3}}/></div>;
  if (!caseData) return null;

  const availableStages = Array.isArray(customStages) ? customStages : ALL_STAGES;
  const allowedNext = availableStages.filter(s => s !== caseData.stage);
  const isSolved = ['completed', 'delivered'].includes(caseData.stage);
  const getStageProgress = (stage, stagesList) => {
    if (!stage || !stagesList || !stagesList.length) return 0;
    if (stage === 'failed') return 0;
    if (stage === 'delivered') return 100;
    const idx = stagesList.indexOf(stage);
    if (idx === -1) return 0;
    return Math.round((idx / (stagesList.length - 1)) * 100);
  };
  const stageProgress = getStageProgress(caseData.stage, availableStages);
  const isFailed = caseData.stage === 'failed';

  const TABS = [
    { key: 'overview',     label: ' Overview' },
    { key: 'inventory',    label: ' Inventory' },
    { key: 'photos',       label: ' Photos' },
    { key: 'solution',     label: isSolved ? ' Solution' : ' Solution' },
    { key: 'smart-assist', label: ' Smart Assist' },
    { key: 'comms',        label: ' Communication' },
    { key: 'donors',       label: ' Donors' },
    { key: 'timeline',     label: ' Timeline' },
    { key: 'files',        label: ' Files' },
    { key: 'payments',     label: ' Payments' },
  ];

  return (
    <div>
      {/* Case Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:6}}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/cases')}>← Back</button>
            <span className="font-mono text-accent" style={{fontSize:'1.1rem',fontWeight:700}}>{caseData.case_number}</span>
            <span className={`badge badge-${caseData.stage}`} style={{fontSize:'0.75rem'}}>
              {STAGE_ICONS[caseData.stage] || ''} {caseData.stage?.replace(/_/g,' ')}
            </span>
            {caseData.ai_risk_level && <span className={`badge badge-risk-${caseData.ai_risk_level}`}>{caseData.ai_risk_level?.toUpperCase()} RISK</span>}
            {isSolved && <span style={{fontSize:'0.68rem',padding:'3px 8px',background:'rgba(16,185,129,0.15)',borderRadius:999,color:'var(--status-success)',fontWeight:700,fontFamily:'var(--font-mono)'}}>✓ SOLVED</span>}
          </div>
          <h2 style={{marginBottom:4}}>{caseData.device_brand} — <span className="font-mono">{caseData.device_model}</span></h2>
          <div className="text-sm text-muted">
            Client: <strong style={{color:'var(--text-primary)'}}>{caseData.first_name} {caseData.last_name}</strong>
            {caseData.company && ` • ${caseData.company}`}
            {caseData.serial_number && <> • S/N: <span className="font-mono">{caseData.serial_number}</span></>}
          </div>
        </div>

        {allowedNext.length > 0 && canAccess('junior_engineer') && (
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={printInwardForm}> Inward Form</button>
            <button className="btn btn-secondary btn-sm" onClick={printCourierSlip}> Courier Slip</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setEditForm({...caseData}); setShowEditCase(true); }}> Edit</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPayment(true)}> Payment</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setStockTransferItem(true)}> To Stock</button>
            <button className={`btn btn-sm ${caseData.transfer_to_client ? 'btn-success' : 'btn-secondary'}`} onClick={handleTransferToClient}>
              {caseData.transfer_to_client ? '✓ Transferred to Client' : ' Transfer to Client'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowTransition(true)}>Stages</button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowInvoiceModal(true)}>🖨 Print Invoice</button>
          </div>
        )}
        {!allowedNext.length && canAccess('junior_engineer') && (
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={printInwardForm}> Inward Form</button>
            <button className="btn btn-secondary btn-sm" onClick={printCourierSlip}> Courier Slip</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setEditForm({...caseData}); setShowEditCase(true); }}>✏️ Edit</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPayment(true)}> Payment</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setStockTransferItem(true)}> To Stock</button>
            <button className={`btn btn-sm ${caseData.transfer_to_client ? 'btn-success' : 'btn-secondary'}`} onClick={handleTransferToClient}>
              {caseData.transfer_to_client ? '✓ Transferred to Client' : ' Transfer to Client'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowInvoiceModal(true)}>🖨 Print Invoice</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{marginBottom:20,flexWrap:'wrap',gap:4}}>
        {TABS.map(t => (
          <button key={t.key} className={`tab-btn ${activeTab===t.key?'active':''}`} onClick={()=>setActiveTab(t.key)}>
            {t.label}
            {t.key==='solution' && isSolved && activeTab!=='solution' && (
              <span style={{marginLeft:4,width:6,height:6,borderRadius:'50%',background:'var(--status-success)',display:'inline-block',verticalAlign:'middle'}} />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid-2">
          <div>
            <div className="card" style={{marginBottom:16}}>
              <div className="card-title" style={{marginBottom:14}}>Device Information</div>
              <div className="tech-data-table">
                <div className="tech-data-cell"><div className="tech-data-label">Brand</div><div className="tech-data-value">{caseData.device_brand||'—'}</div></div>
                <div className="tech-data-cell"><div className="tech-data-label">Model</div><div className="tech-data-value">{caseData.device_model||'—'}</div></div>
                <div className="tech-data-cell"><div className="tech-data-label">Serial Number</div><div className="tech-data-value">{caseData.serial_number||'—'}</div></div>
                <div className="tech-data-cell"><div className="tech-data-label">Capacity</div><div className="tech-data-value">{caseData.capacity_gb ? `${caseData.capacity_gb} GB` : '—'}</div></div>
                <div className="tech-data-cell"><div className="tech-data-label">Interface</div><div className="tech-data-value highlight">{caseData.interface||'—'}</div></div>
                <div className="tech-data-cell"><div className="tech-data-label">Form Factor</div><div className="tech-data-value">{caseData.form_factor||'—'}</div></div>
              </div>
            </div>
          </div>

          <div>
            <div className="card" style={{marginBottom:16}}>
              <div className="card-title" style={{marginBottom:14}}> Diagnosis</div>
              <div style={{marginBottom:10}}>
                <div className="tech-data-label">Failure Types</div>
                <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:4}}>
                  {((caseData.failure_types && caseData.failure_types.length) ? caseData.failure_types : (caseData.failure_type ? [caseData.failure_type] : [])).map(ft => (
                    <span key={ft} className={`badge badge-${ft}`}>{ft}</span>
                  ))}
                  {!(caseData.failure_types?.length) && !caseData.failure_type && <span className="text-xs text-muted">None expected</span>}
                </div>
              </div>
              <div style={{marginBottom:10}}>
                <div className="tech-data-label">Symptoms</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:4}}>
                  {(caseData.symptoms||[]).map(s => (
                    <span key={s} style={{fontSize:'0.72rem',padding:'3px 8px',background:'rgba(255,255,255,0.05)',borderRadius:999,color:'var(--text-secondary)',fontFamily:'var(--font-mono)'}}>{s.replace(/_/g,' ')}</span>
                  ))}
                  {!caseData.symptoms?.length && <span className="text-xs text-muted">None recorded</span>}
                </div>
              </div>
              {caseData.initial_diagnosis && (
                <div style={{marginBottom:10}}>
                  <div className="tech-data-label">Initial Diagnosis</div>
                  <div style={{fontSize:'0.8rem',color:'var(--text-secondary)',marginTop:4,lineHeight:1.6}}>{caseData.initial_diagnosis}</div>
                </div>
              )}
              {caseData.final_diagnosis && (
                <div>
                  <div className="tech-data-label">Final Diagnosis</div>
                  <div style={{fontSize:'0.8rem',color:'var(--text-primary)',marginTop:4,lineHeight:1.6}}>{caseData.final_diagnosis}</div>
                </div>
              )}
            </div>

            <div className="card" style={{marginBottom:16}}>
              <div className="card-title" style={{marginBottom:14}}> Recovery Progress</div>
              <div style={{marginBottom:8}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem',marginBottom:6}}>
                  <span className="text-muted">Stage Progress</span>
                  <span className="font-mono" style={{color: isFailed ? 'var(--danger)' : 'var(--accent-primary)'}}>{stageProgress}%</span>
                </div>
                {isFailed ? (
                  <div className="progress-bar" style={{height:10, background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)'}}>
                    <div className="progress-fill" style={{width:'100%', background:'var(--danger)', opacity:0.25}} />
                  </div>
                ) : (
                  <div className="progress-bar" style={{height:10}}>
                    <div className="progress-fill" style={{width:`${stageProgress}%`}} />
                  </div>
                )}
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.68rem',marginTop:4}}>
                  <span style={{color: isFailed ? 'var(--danger)' : 'var(--text-muted)'}}>{availableStages[0]?.replace(/_/g,' ') || 'Start'}</span>
                  <span style={{color: isFailed ? 'var(--danger)' : 'var(--text-muted)'}}>{isFailed ? 'Failed' : (availableStages[availableStages.length-1]?.replace(/_/g,' ') || 'Complete')}</span>
                </div>
              </div>
            </div>

            {/* Quick Solution Preview if solved */}
            {isSolved && (
              <div className="card" style={{marginBottom:16,border:'1px solid rgba(16,185,129,0.2)',background:'rgba(16,185,129,0.03)'}}>
                <div className="card-header">
                  <div className="card-title" style={{color:'var(--status-success)'}}>🏆 Case Solved</div>
                  <button className="btn btn-sm btn-secondary" onClick={()=>setActiveTab('solution')}>View Solution →</button>
                </div>
                <p style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>Solution notes, photos, and videos are documented in the Solution tab.</p>
              </div>
            )}
            {/* Quick Payment CTA if unpaid amount */}
            {caseData.total_paid !== undefined && (
              <div className="card" style={{marginBottom:16,border:'1px solid rgba(245,158,11,0.25)',background:'rgba(245,158,11,0.04)'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
                  <div>
                    <div className="card-title" style={{marginBottom:2}}> Payment Summary</div>
                    <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>
                      Collected: <strong style={{color:'var(--status-success)'}}>₹{parseFloat(caseData.total_paid||0).toLocaleString('en-IN')}</strong>
                      {caseData.balance_due > 0 && <> &nbsp;·&nbsp; <span style={{color:'var(--status-danger)'}}>₹{parseFloat(caseData.balance_due||0).toLocaleString('en-IN')} due</span></>}
                    </div>
                    {caseData.total_purchase_cost > 0 && (
                      <div style={{fontSize:'0.78rem',color:'var(--text-muted)',marginTop:4}}>
                        Purchase Cost: <strong style={{color:'#f472b6'}}>₹{parseFloat(caseData.total_purchase_cost||0).toLocaleString('en-IN')}</strong>
                        {caseData.profit !== undefined && <> &nbsp;·&nbsp; Profit: <strong style={{color:parseFloat(caseData.profit||0)>=0?'var(--status-success)':'var(--status-danger)'}}>₹{parseFloat(caseData.profit||0).toLocaleString('en-IN')}</strong></>}
                      </div>
                    )}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={()=>setShowPayment(true)}> Collect Payment</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'inventory' && <CaseInventoryPanel caseId={id} />}

      {activeTab === 'photos' && <CasePhotosPanel caseId={id} />}

      {activeTab === 'solution' && <SolutionPanel caseId={id} caseStage={caseData.stage} caseData={caseData} />}

      {activeTab === 'smart-assist' && <SmartAssistPanel caseId={id} />}

      {activeTab === 'comms' && <CommunicationLogPanel caseId={id} caseData={caseData} />}

      {activeTab === 'donors' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}> Compatible Donor Drives</div>
            <button className="btn btn-secondary btn-sm" onClick={() => window.open('/inventory', '_self')}> Browse Inventory →</button>
          </div>
          <DonorPanel caseId={id} caseData={caseData} />
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="card">
          <div className="card-title" style={{marginBottom:16}}>⏱ Workflow Timeline</div>
          {/* Add manual note */}
          <div style={{ marginBottom:20, padding:'14px 16px', background:'var(--bg-elevated)', borderRadius:'var(--radius-md)', border:'1px solid var(--border-subtle)' }}>
            <div className="form-label" style={{ marginBottom:8 }}>Add Timeline Note</div>
            <textarea className="form-textarea" style={{ minHeight:70, marginBottom:10 }}
              placeholder="Add a manual note, observation, or update to the timeline…"
              value={timelineNote} onChange={e => setTimelineNote(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={savingNote || !timelineNote.trim()} onClick={handleAddTimelineNote}>
              {savingNote?<><div className="spinner" style={{width:12,height:12}}/> Adding…</>:'Add Note'}
            </button>
          </div>

          {/* Merge workflow logs + solution notes into one sorted timeline */}
          {(() => {
            const workflowItems = (caseData.workflowLogs || []).map(log => ({ ...log, _type: 'workflow' }));
            const solutionItems = solutionNotes.map(note => ({
              id: note.id,
              _type: 'solution',
              created_at: note.createdAt,
              heading: note.heading || 'Solution Note',
              text: note.text,
              createdByName: note.createdByName,
            }));
            const merged = [...workflowItems, ...solutionItems]
              .filter(x => x.created_at)
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            if (!merged.length && !workflowItems.length) {
              return <div className="empty-state" style={{padding:30}}><div className="empty-desc">No workflow events recorded yet</div></div>;
            }
            const allItems = merged.length ? merged : workflowItems;
            return (
              <div className="timeline">
                {allItems.map((item, i) => {
                  if (item._type === 'solution') {
                    return (
                      <div key={`sol-${item.id}`} className="timeline-item">
                        <div className="timeline-dot success" style={{ background: 'rgba(0,212,255,0.15)', border:'1px solid rgba(0,212,255,0.4)', color:'var(--accent-primary)' }}>🏆</div>
                        <div className="timeline-content" style={{flex:1}}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                            <div>
                              <div className="timeline-stage" style={{ color:'var(--accent-primary)', display:'flex', alignItems:'center', gap:6 }}>
                                {item.heading}
                                <span style={{ fontSize:'0.6rem', padding:'1px 5px', background:'rgba(0,212,255,0.1)', border:'1px solid rgba(0,212,255,0.25)', borderRadius:999, color:'var(--accent-primary)' }}>Solution Documented</span>
                              </div>
                              <div className="timeline-meta">
                                {item.createdByName && `by ${item.createdByName}`}
                                {item.created_at && ` • ${new Date(item.created_at).toLocaleString('en-IN')}`}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  // Regular workflow log
                  const log = item;
                  return (
                    <div key={log.id} className="timeline-item">
                      <div className={`timeline-dot ${log.to_stage==='completed'||log.to_stage==='delivered'?'success':log.to_stage==='failed'?'danger':i===0?'active':''}`}>
                        {(log.type==='note'||log.to_stage==='note')?'📝':STAGE_ICONS[log.to_stage]||'📌'}
                      </div>
                      <div className="timeline-content" style={{flex:1}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                          <div>
                            <div className="timeline-stage">{(log.type==='note'||log.to_stage==='note')?'Manual Note':log.to_stage?.replace(/_/g,' ')}</div>
                            <div className="timeline-meta">
                              {log.engineer_name && `by ${log.engineer_name}`}
                              {log.time_spent_minutes > 0 && ` • ${log.time_spent_minutes}m`}
                              {' • '}{new Date(log.created_at).toLocaleString('en-IN')}
                            </div>
                          </div>
                          {log.notes && (
                            <div style={{ display:'flex', gap:6, marginTop:4, justifyContent:'flex-end' }}>
                              <button className="btn btn-ghost btn-sm" style={{ fontSize:'0.65rem', padding:'2px 6px' }}
                                onClick={() => handleEditLog(log.id, log.notes)}>✏️ Edit</button>
                              <button className="btn btn-ghost btn-sm" style={{ fontSize:'0.65rem', padding:'2px 6px', color:'var(--status-danger)' }}
                                onClick={() => handleDeleteLog(log.id)}>🗑️</button>
                            </div>
                          )}
                        </div>
                        {editingLogId === log.id ? (
                          <div style={{ marginTop:8, display:'flex', gap:6 }}>
                            <textarea className="form-textarea" value={editLogText} onChange={e => setEditLogText(e.target.value)} style={{ flex:1, minHeight:60, fontSize:'0.78rem' }} />
                            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                              <button className="btn btn-primary btn-sm" onClick={handleSaveLogEdit}>💾</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setEditingLogId(null)}>✕</button>
                            </div>
                          </div>
                        ) : (
                          log.notes && <div className="timeline-notes">{log.notes}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {activeTab === 'files' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title"> Case Files</div>
            <div style={{ display:'flex',gap:8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingFiles}>
                {uploadingFiles?<><div className="spinner" style={{width:12,height:12}}/> Uploading…</>:' Upload File'}
              </button>
              <input ref={fileInputRef} type="file" multiple style={{ display:'none' }} onChange={e=>handleUploadFiles(e.target.files)} />
            </div>
          </div>
          <div onDrop={e=>{e.preventDefault();handleUploadFiles(e.dataTransfer.files);}} onDragOver={e=>e.preventDefault()}
            style={{ border:'2px dashed var(--border-default)',borderRadius:'var(--radius-md)',padding:20,textAlign:'center',marginBottom:16,cursor:'pointer',fontSize:'0.8rem',color:'var(--text-muted)' }}
            onClick={() => fileInputRef.current?.click()}>
             Drag & drop any files here (images, PDFs, logs, videos)
          </div>
          {caseData.files?.length > 0 ? (
            <table>
              <thead><tr><th>File Name</th><th>Type</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
              <tbody>
                {caseData.files.map(f => (
                  <tr key={f.id}>
                    <td><span className="font-mono text-xs">{f.original_name||f.name}</span></td>
                    <td><span className={`badge badge-${f.file_type||'file'}`}>{(f.file_type||f.mimeType||'file').replace('_',' ')}</span></td>
                    <td className="text-xs text-muted">{f.file_size?((f.file_size/1024/1024).toFixed(2)+' MB'):((f.size/1024/1024).toFixed(2)+' MB')}</td>
                    <td className="text-xs text-muted">{new Date(f.created_at||Date.now()).toLocaleDateString()}</td>
                    <td><a href={`/api/files/${f.id}/download`} className="btn btn-secondary btn-sm" target="_blank" rel="noreferrer">↓ Download</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state"><div className="empty-icon"></div><div className="empty-title">No files uploaded</div><div className="empty-desc">Upload any relevant files for this case</div></div>
          )}
        </div>
      )}

      {activeTab === 'payments' && (
        <div>
          {/* Quick payment button */}
          <div style={{ display:'flex',justifyContent:'flex-end',marginBottom:16 }}>
            <button
              className="btn btn-primary"
              onClick={() => setShowPayment(true)}
              disabled={parseFloat(caseData?.balance_due ?? caseData?.pending_amount ?? 0) <= 0}
            >
              Collect Payment
            </button>
          </div>
          {caseInvoices.length > 0 && (
            <div className="card" style={{marginBottom:16}}>
              <div className="card-title" style={{marginBottom:14}}> Invoices</div>
              {caseInvoices.map(inv => (
                <div key={inv.id} style={{ padding:'12px',background:'var(--bg-elevated)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)',marginBottom:10,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                  <div>
                    <span className="font-mono text-xs text-accent">{inv.invoice_number}</span>
                    <div style={{ fontSize:'1.1rem',fontWeight:800,color:'var(--text-primary)',marginTop:4 }}>₹{parseFloat(inv.total||0).toLocaleString('en-IN')}</div>
                    <div className="text-xs text-muted">Due: {inv.due_date?new Date(inv.due_date).toLocaleDateString('en-IN'):'—'}</div>
                  </div>
                  <div style={{ display:'flex',gap:8,alignItems:'center' }}>
                    <span style={{ fontSize:'0.68rem',fontWeight:700,padding:'3px 8px',borderRadius:999,background:inv.status==='paid'?'rgba(16,185,129,0.15)':'rgba(245,158,11,0.15)',color:inv.status==='paid'?'var(--status-success)':'var(--status-warning)',fontFamily:'var(--font-mono)',textTransform:'uppercase' }}>{inv.status}</span>
                    <button className="btn btn-secondary btn-sm" onClick={() => setViewPdf(inv)}>👁 View PDF</button>
                    {inv.status !== 'paid' && (
                      <button className="btn btn-primary btn-sm" onClick={() => generatePaymentLink(inv)} style={{background:'rgba(0,212,255,0.1)',color:'var(--accent-primary)',borderColor:'rgba(0,212,255,0.3)'}}>
                         Payment Link
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {caseData.quotations?.length > 0 && (
            <div className="card" style={{marginBottom:16}}>
              <div className="card-title" style={{marginBottom:14}}> Quotations</div>
              {caseData.quotations.map(q => (
                <div key={q.id} style={{padding:'12px',background:'var(--bg-elevated)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)',marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span className="font-mono text-xs text-accent">{q.quote_number}</span>
                    <span className={`badge ${q.approved_by_client===true?'badge-approved':q.approved_by_client===false?'badge-rejected':'badge-quotation'}`}>
                      {q.approved_by_client===true?'Approved':q.approved_by_client===false?'Rejected':'Pending'}
                    </span>
                  </div>
                  <div style={{fontSize:'1.2rem',fontWeight:800,color:'var(--text-primary)',marginTop:8}}>
                    ₹{parseFloat(q.total_amount||0).toLocaleString('en-IN')}
                  </div>
                  <div className="text-xs text-muted">Estimate: ₹{q.estimated_cost} + {q.tax_pct}% GST</div>
                </div>
              ))}
            </div>
          )}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{marginBottom:14}}> Payments</div>
            {caseData.payments?.length > 0 ? (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {caseData.payments.map(p => (
                  <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',background:'var(--bg-elevated)',borderRadius:'var(--radius-sm)'}}>
                    <div>
                      <div style={{fontWeight:700,color:'var(--text-primary)'}}>₹{parseFloat(p.amount).toLocaleString('en-IN')}</div>
                      <div className="text-xs text-muted">{p.method} {p.reference_number && `• ${p.reference_number}`}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <span className={`badge ${p.status==='paid'?'badge-completed':'badge-quotation'}`}>{p.status}</span>
                      <div className="text-xs text-muted" style={{marginTop:2}}>{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{padding:24}}><div className="empty-icon"></div><div className="empty-title">No payments recorded</div></div>
            )}
          </div>

          {/* Purchases linked to this case */}
          {caseData.purchases?.length > 0 && (
            <div className="card" style={{marginBottom:16}}>
              <div className="card-title" style={{marginBottom:14}}> Purchases (Expenses)</div>
              {caseData.purchases.map(p => (
                <div key={p.id} style={{padding:'10px 12px',background:'var(--bg-elevated)',borderRadius:'var(--radius-sm)',border:'1px solid var(--border-subtle)',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:'0.82rem'}}>{p.description}</div>
                    <div className="text-xs text-muted">{p.vendor_name} · {p.purchase_number} · {fmtDate(p.purchase_date)}</div>
                  </div>
                  <span className="font-mono" style={{fontWeight:700,color:'#f472b6'}}>₹{parseFloat(p.total||0).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}

          {/* Case Expenses Panel */}
          <CaseExpensesPanel caseId={id} onExpenseAdded={() => casesApi.get(id).then(setCaseData)} />

          {/* Profit / Loss Summary */}
          {(caseData.total_purchase_cost > 0 || caseData.quotation_total > 0) && (
            <div className="card" style={{marginTop:16,border:'1px solid rgba(16,185,129,0.2)',background:'rgba(16,185,129,0.03)'}}>
              <div className="card-title" style={{marginBottom:14}}> Profit / Loss</div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:'var(--bg-elevated)',borderRadius:'var(--radius-sm)'}}>
                  <span style={{color:'var(--text-secondary)'}}>Purchase Cost (Expense)</span>
                  <span className="font-mono" style={{fontWeight:700,color:'#f472b6'}}>₹{parseFloat(caseData.total_purchase_cost||0).toLocaleString('en-IN')}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:'var(--bg-elevated)',borderRadius:'var(--radius-sm)'}}>
                  <span style={{color:'var(--text-secondary)'}}>Sale Amount (Quoted)</span>
                  <span className="font-mono" style={{fontWeight:700,color:'var(--status-success)'}}>₹{parseFloat(caseData.quotation_total||0).toLocaleString('en-IN')}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)',marginTop:4}}>
                  <span style={{fontWeight:700}}>Net Profit</span>
                  <span className="font-mono" style={{fontWeight:900,fontSize:'1.1rem',color:parseFloat(caseData.profit||0) >= 0 ? 'var(--status-success)' : 'var(--status-danger)'}}>
                    {parseFloat(caseData.profit||0) >= 0 ? '+' : ''}₹{parseFloat(caseData.profit||0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modals (outside all tab content so they always render) ── */}

      {/* Stage Transition Modal */}
      {showTransition && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Stages</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowTransition(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{marginBottom:16,padding:'10px 14px',background:'rgba(0,212,255,0.05)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-accent)'}}>
                <span className="text-xs text-muted">Current: </span>
                <span style={{fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--text-primary)'}}>{renderStageLabel(caseData.stage)}</span>
              </div>

              <div className="form-group">
                <label className="form-label required">Next Stage</label>
                <select className="form-select" value={transitionForm.stage} onChange={e => setTransitionForm({...transitionForm, stage: e.target.value})}>
                  <option value="">Select next stage...</option>
                  {allowedNext.map(s => <option key={s} value={s}>{renderStageLabel(s)}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Work Notes</label>
                <textarea className="form-textarea" placeholder="What was done? Actions performed?" value={transitionForm.notes}
                  onChange={e => setTransitionForm({...transitionForm, notes: e.target.value})} />
              </div>

              {transitionForm.stage === 'completed' && (
                <div className="alert alert-success" style={{marginTop:8}}>
                  <span className="alert-icon">🏆</span>
                  <div>After advancing to Completed, don't forget to add solution notes and media in the <strong>Solution</strong> tab!</div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowTransition(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!transitionForm.stage || transitioning} onClick={handleTransition}>
                {transitioning ? <><div className="spinner" style={{width:14,height:14}}/> Updating…</> : 'Update Stage'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInvoiceModal && (
        <InvoiceModal caseData={caseData} companyData={companyData} caseInvoices={caseInvoices} onClose={() => setShowInvoiceModal(false)} />
      )}

      {/* Collect Payment Modal */}
      {showPayment && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3 className="modal-title"> Collect Payment — {caseData.case_number}</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowPayment(false)}>✕</button></div>
            <div className="modal-body">
              <CollectPaymentForm
                caseId={id}
                caseData={caseData}
                onClose={() => setShowPayment(false)}
                onDone={() => { casesApi.get(id).then(setCaseData); setShowPayment(false); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit Case Modal */}
      {showEditCase && (
        <div className="modal-overlay">
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3 className="modal-title">✏️ Edit Case — {caseData.case_number}</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowEditCase(false)}>✕</button></div>
            <div className="modal-body">
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
                {[
                  ['Device Brand','device_brand'],['Device Model','device_model'],
                  ['Serial Number','serial_number'],['Capacity (GB)','capacity_gb'],
                  ['Interface','interface'],['Form Factor','form_factor'],
                  ['Initial Diagnosis','initial_diagnosis'],['Final Diagnosis','final_diagnosis'],
                ].map(([label,field]) => (
                  <div key={field} className="form-group">
                    <label className="form-label">{label}</label>
                    <input className="form-input" value={editForm[field]||''} onChange={e=>setEditForm(f=>({...f,[field]:e.target.value}))} />
                  </div>
                ))}
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select className="form-select" value={editForm.priority||3} onChange={e=>setEditForm(f=>({...f,priority:parseInt(e.target.value)}))}>
                    {[1,2,3,4,5].map(p=><option key={p} value={p}>{p} — {['Critical','High','Medium','Low','Minimal'][p-1]}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Clean Room Required</label>
                  <select className="form-select" value={editForm.cleanRoomRequired?'true':'false'} onChange={e=>setEditForm(f=>({...f,cleanRoomRequired:e.target.value==='true'}))}>
                    <option value="false">Not Required</option>
                    <option value="true">Required</option>
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Donor Match — Stock Item Number</label>
                  <input className="form-input font-mono" value={editForm.donor_stock_number||''} onChange={e=>setEditForm(f=>({...f,donor_stock_number:e.target.value}))} placeholder="Enter stock item SKU / serial number from inventory" />
                  <div style={{ fontSize:'0.68rem',color:'var(--text-muted)',marginTop:4 }}>Enter manually to link a donor drive from inventory for comparision</div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditCase(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveEdit}>💾 Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {viewPdf && <PdfViewerModal invoice={viewPdf} companyData={companyData} caseData={caseData} onClose={() => setViewPdf(null)} />}

      {/* Transfer to Stock Modal */}
      {stockTransferItem !== null && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">🔄 Transfer Drive to Stock Inventory</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setStockTransferItem(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info" style={{ marginBottom:16 }}>
                <span className="alert-icon">ℹ️</span>
                <div>Transfer the patient drive from <strong>{caseData?.case_number}</strong> into stock as a donor or spare part.</div>
              </div>
              <div className="tech-data-table" style={{ marginBottom:16 }}>
                <div className="tech-data-cell"><div className="tech-data-label">Brand</div><div className="tech-data-value">{caseData?.device_brand || '—'}</div></div>
                <div className="tech-data-cell"><div className="tech-data-label">Model</div><div className="tech-data-value font-mono">{caseData?.device_model || '—'}</div></div>
                <div className="tech-data-cell"><div className="tech-data-label">Serial #</div><div className="tech-data-value font-mono">{caseData?.serial_number || '—'}</div></div>
                <div className="tech-data-cell"><div className="tech-data-label">Capacity</div><div className="tech-data-value">{caseData?.capacity_gb ? caseData.capacity_gb + ' GB' : '—'}</div></div>
              </div>
              <TransferToStockForm caseData={caseData} caseId={id} onDone={() => { setStockTransferItem(null); alert('✅ Drive transferred to stock inventory!'); }} onClose={() => setStockTransferItem(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Communication Log Panel ──────────────────────────────────────
const COMM_TYPES = [
  { key:'call',      icon:'', label:'Phone Call', color:'#3b82f6' },
  { key:'whatsapp',  icon:'', label:'WhatsApp',   color:'#25d366' },
  { key:'email',     icon:'', label:'Email',       color:'#f59e0b' },
  { key:'visit',     icon:'', label:'Walk-In Visit', color:'#8b5cf6' },
  { key:'sms',       icon:'', label:'SMS',         color:'#64748b' },
  { key:'note',      icon:'', label:'Internal Note', color:'#6366f1' },
];

function CommunicationLogPanel({ caseId, caseData }) {
  const storageKey = `case_comms_${caseId}`;
  const [comms, setComms] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) || []; } catch { return []; }
  });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ type:'call', direction:'outbound', summary:'', agent:'', duration:'', followUp:'' });
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Fetch communications from backend on component mount
  const loadComms = useCallback(async () => {
    if (!caseData?.client_id) {
      setLoading(false);
      return;
    }
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(
        `${BASE_URL}/clients/${caseData.client_id}/communications`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Failed to load communications');
      const data = await res.json();
      
      // Convert backend format to frontend format
      const backendComms = (data || []).map(comm => ({
        id: comm.id,
        type: comm.type === 'portal_message' ? 'portal_message' : comm.type === 'portal_reply' ? 'portal_reply' : 'email',
        direction: comm.direction || 'inbound',
        summary: comm.summary || '',
        agent: comm.user_name || 'Client Portal',
        duration: '',
        followUp: '',
        createdAt: comm.created_at,
        caseNumber: caseData?.case_number,
        clientName: `${caseData?.first_name || ''} ${caseData?.last_name || ''}`.trim(),
        isFromPortal: comm.type === 'portal_message' || comm.type === 'portal_reply',
        isReply: comm.type === 'portal_reply',
        // Include original message info for replies
        replyToId: comm.reply_to_id,
        replyToSummary: comm.reply_to_summary,
        replyToCreatedAt: comm.reply_to_created_at,
        replyToUserName: comm.reply_to_user_name,
      }));
      
      // Merge with local storage (local takes precedence for new entries)
      const combined = [...backendComms, ...comms.filter(c => c.isNew)];
      // Remove duplicates by ID
      const unique = [];
      const seen = new Set();
      combined.forEach(c => {
        if (!seen.has(c.id)) {
          unique.push(c);
          seen.add(c.id);
        }
      });
      setComms(unique.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (err) {
      console.error('Failed to load communications:', err);
    } finally {
      setLoading(false);
    }
  }, [caseData?.client_id, caseData?.case_number, comms]);

  useEffect(() => {
    loadComms();
  }, [caseData?.client_id, caseData?.case_number]);

  const saveComms = (list) => { setComms(list); localStorage.setItem(storageKey, JSON.stringify(list)); };

  const handleAdd = () => {
    if (!form.summary.trim()) return;
    const entry = {
      id: Date.now().toString(),
      ...form,
      createdAt: new Date().toISOString(),
      caseNumber: caseData?.case_number,
      clientName: `${caseData?.first_name || ''} ${caseData?.last_name || ''}`.trim(),
      isNew: true, // Mark as locally created (not from backend)
      isFromPortal: false,
    };
    saveComms([entry, ...comms]);
    setForm({ type:'call', direction:'outbound', summary:'', agent:'', duration:'', followUp:'' });
    setShowAdd(false);
  };

  const handleDelete = (id) => {
    if (!confirm('Delete this communication log entry?')) return;
    saveComms(comms.filter(c => c.id !== id));
  };

  const handleReply = async () => {
    if (!replyText.trim() || !replyingTo) return;
    setSendingReply(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${BASE_URL}/client-portal/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          case_id: caseId,
          client_id: caseData?.client_id,
          message: replyText.trim(),
          reply_to_id: replyingTo, // Pass the ID of the message being replied to
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to send reply');
      
      // Reset reply form
      setReplyingTo(null);
      setReplyText('');
      
      // Reload communications from backend to get the latest data
      await loadComms();
    } catch (err) {
      console.error('Reply error:', err.message);
      alert('Error: ' + err.message);
    } finally {
      setSendingReply(false);
    }
  };

  const filtered = filter === 'all' ? comms : comms.filter(c => c.type === filter);
  const typeInfo = (key) => COMM_TYPES.find(t => t.key === key) || COMM_TYPES[0];

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div className="card-title"> Communication History</div>
        <div style={{display:'flex',gap:8}}>
          <select className="form-select" style={{width:'auto',fontSize:'0.78rem',padding:'5px 10px'}}
            value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="all">All Types</option>
            {COMM_TYPES.map(t=><option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowAdd(!showAdd)}>
            {showAdd ? '✕ Cancel' : '+ Log Communication'}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="card" style={{marginBottom:16,border:'1px solid var(--border-accent)',background:'rgba(0,212,255,0.03)'}}>
          <div className="card-title" style={{marginBottom:14}}>📝 New Communication Entry</div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                {COMM_TYPES.map(t=><option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Direction</label>
              <select className="form-select" value={form.direction} onChange={e=>setForm(f=>({...f,direction:e.target.value}))}>
                <option value="outbound">↗ Outbound (we called/reached out)</option>
                <option value="inbound">↙ Inbound (client called/came in)</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label required">Summary / Notes</label>
            <textarea className="form-textarea" style={{minHeight:80}}
              placeholder="What was discussed? Client update, price negotiation, delivery arrangements, complaint, query…"
              value={form.summary} onChange={e=>setForm(f=>({...f,summary:e.target.value}))} />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Agent / Handled By</label>
              <input className="form-input" value={form.agent} onChange={e=>setForm(f=>({...f,agent:e.target.value}))} placeholder="Your name or engineer name" />
            </div>
            <div className="form-group">
              <label className="form-label">Duration (mins) {form.type==='call'||form.type==='visit'?'':'(optional)'}</label>
              <input className="form-input" type="number" value={form.duration} onChange={e=>setForm(f=>({...f,duration:e.target.value}))} placeholder="e.g. 5" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Follow-Up Required</label>
            <input className="form-input" value={form.followUp} onChange={e=>setForm(f=>({...f,followUp:e.target.value}))} placeholder="e.g. Call back on 10th April with quote confirmation" />
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:4}}>
            <button className="btn btn-secondary" onClick={()=>setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={!form.summary.trim()} onClick={handleAdd}>✅ Save Entry</button>
          </div>
        </div>
      )}

      {/* Log Entries */}
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {loading && (
          <div style={{padding:40,textAlign:'center'}}>
            <div style={{display:'inline-block',width:24,height:24,borderRadius:'50%',border:'2px solid rgba(0,212,255,0.2)',borderTop:'2px solid rgba(0,212,255,1)',animation:'spin 0.6s linear infinite'}} />
            <div style={{marginTop:12,color:'var(--text-muted)',fontSize:'0.8rem'}}>Loading communications...</div>
          </div>
        )}
        {!loading && filtered.map(entry => {
          const ti = entry.isFromPortal ? { icon: '🌐', label: 'Portal Message', color: '#8b5cf6' } : typeInfo(entry.type);
          return (
            <div key={entry.id}>
              <div style={{display:'flex',gap:12,padding:'12px 14px',background:'var(--bg-card)',border:entry.isFromPortal?'1px solid rgba(139,92,246,0.3)':'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',transition:'border-color 0.15s'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border-default)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor=entry.isFromPortal?'rgba(139,92,246,0.3)':'var(--border-subtle)'}>
                <div style={{width:36,height:36,borderRadius:'50%',background:`${ti.color}18`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1rem',flexShrink:0,border:`1px solid ${ti.color}30`}}>
                  {ti.icon}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  {/* Show which message this reply is responding to */}
                  {entry.isReply && entry.replyToSummary && (
                    <div style={{fontSize:'0.75rem',padding:'10px 12px',background:'rgba(139,92,246,0.15)',border:'2px solid rgba(139,92,246,0.35)',borderRadius:8,marginBottom:12}}>
                      <div style={{color:'#d8b4fe',fontWeight:700,marginBottom:4,fontSize:'0.7rem',textTransform:'uppercase',letterSpacing:'0.5px'}}>↩ Replying to your message:</div>
                      <div style={{color:'#e9d5ff',lineHeight:1.5,background:'rgba(0,0,0,0.2)',padding:'8px 10px',borderRadius:4,fontSize:'0.8rem'}}>
                        "{entry.replyToSummary}"
                      </div>
                    </div>
                  )}
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:4}}>
                    <span style={{fontWeight:700,fontSize:'0.82rem',color:ti.color}}>{ti.label}</span>
                    {entry.isFromPortal && <span style={{fontSize:'0.68rem',padding:'1px 7px',borderRadius:999,background:'rgba(139,92,246,0.12)',color:'#8b5cf6',fontWeight:700}}>✓ Client Submitted</span>}
                    <span style={{fontSize:'0.68rem',padding:'1px 7px',borderRadius:999,background:entry.direction==='inbound'?'rgba(16,185,129,0.12)':'rgba(99,102,241,0.12)',color:entry.direction==='inbound'?'#10b981':'#6366f1',fontWeight:700}}>
                      {entry.direction === 'inbound' ? '↙ Inbound' : '↗ Outbound'}
                    </span>
                    {entry.duration && <span style={{fontSize:'0.68rem',color:'var(--text-muted)'}}>⏱ {entry.duration}m</span>}
                    <span style={{fontSize:'0.68rem',color:'var(--text-muted)',marginLeft:'auto',fontFamily:'var(--font-mono)'}}>
                      {new Date(entry.createdAt).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div style={{fontSize:'0.82rem',color:'var(--text-primary)',lineHeight:1.6,marginBottom:entry.followUp?6:0}}>
                    {entry.summary}
                  </div>
                  {entry.followUp && (
                    <div style={{fontSize:'0.72rem',padding:'4px 8px',background:'rgba(245,158,11,0.08)',borderRadius:4,border:'1px solid rgba(245,158,11,0.2)',color:'#f59e0b',marginTop:4}}>
                      📌 Follow-up: {entry.followUp}
                    </div>
                  )}
                  {entry.agent && <div style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:4}}>By: {entry.agent}</div>}
                </div>
                {!entry.isFromPortal && (
                  <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:'0.8rem',padding:4,alignSelf:'flex-start',opacity:0.6}}
                    onClick={()=>handleDelete(entry.id)} title="Delete entry">✕</button>
                )}
                {entry.isFromPortal && !entry.isReply && (
                  <button style={{background:'none',border:'none',cursor:'pointer',color:'#6366f1',fontSize:'0.8rem',padding:4,alignSelf:'flex-start',fontWeight:600}}
                    onClick={()=>setReplyingTo(entry.id)} title="Reply to client">💬 Reply</button>
                )}
              </div>
              
              {/* Reply Form */}
              {replyingTo === entry.id && (
                <div style={{marginTop:8,marginLeft:48,padding:12,background:'rgba(99,102,241,0.08)',borderRadius:8,border:'1px solid rgba(99,102,241,0.2)'}}>
                  <div style={{fontSize:'0.75rem',fontWeight:700,color:'#6366f1',marginBottom:8}}>📝 Send Reply to Client</div>
                  <textarea
                    value={replyText}
                    onChange={e=>setReplyText(e.target.value)}
                    placeholder="Type your reply here... (max 2000 characters)"
                    style={{width:'100%',minHeight:70,padding:'8px 10px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:6,color:'var(--text-primary)',fontSize:'0.8rem',resize:'vertical',boxSizing:'border-box',outline:'none',fontFamily:'inherit'}}
                  />
                  <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
                    <button
                      onClick={()=>{setReplyingTo(null);setReplyText('');}}
                      style={{padding:'6px 14px',background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:6,color:'var(--text-secondary)',fontSize:'0.75rem',fontWeight:600,cursor:'pointer'}}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReply}
                      disabled={sendingReply || !replyText.trim()}
                      style={{padding:'6px 14px',background:replyText.trim()&&!sendingReply?'linear-gradient(135deg,#6366f1,#8b5cf6)':'rgba(99,102,241,0.2)',border:'none',borderRadius:6,color:replyText.trim()&&!sendingReply?'#fff':'#64748b',fontSize:'0.75rem',fontWeight:600,cursor:replyText.trim()&&!sendingReply?'pointer':'not-allowed'}}
                    >
                      {sendingReply?'⌛ Sending...':'📤 Send Reply'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!loading && !filtered.length && (
          <div className="empty-state" style={{padding:40}}>
            <div className="empty-icon"></div>
            <div className="empty-title">No communication logs yet</div>
            <div className="empty-desc">Log calls, WhatsApp messages, emails, and walk-in visits with the client here for a complete history.</div>
            <button className="btn btn-primary" style={{marginTop:12}} onClick={()=>setShowAdd(true)}>+ Log First Entry</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Collect Payment Form
function CollectPaymentForm({ caseId, caseData, onClose, onDone }) {
  const quotationAmount = parseFloat(caseData?.quotations?.[0]?.total_amount || caseData?.quotations?.[0]?.estimated_cost || 0);
  const totalCollected = parseFloat(caseData?.total_paid || 0);
  const remainingBalance = parseFloat(caseData?.balance_due ?? caseData?.pending_amount ?? Math.max(0, quotationAmount - totalCollected));
  const defaultAmount = remainingBalance > 0 ? remainingBalance : quotationAmount || 0;

  const [form, setForm] = useState({
    amount: defaultAmount ? defaultAmount.toFixed(2) : '',
    discount_type:'none',
    discount_value:'',
    method:'UPI',
    reference:'',
    notes:'',
  });
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState('');
  const companyData = (() => { try { return JSON.parse(localStorage.getItem('crm_company')) || {}; } catch { return {}; }})();
  const PAY_METHODS = (() => {
    try { const c = JSON.parse(localStorage.getItem('custom_payment_methods')); if (c && c.length) return c; } catch {}
    return companyData.payment_methods || ['Cash','UPI','Card (Debit/Credit)','Bank Transfer','NEFT','RTGS','Cheque','Online (Razorpay)'];
  })();

  const grossAmount = parseFloat(form.amount) || 0;
  const discountAmt = form.discount_type === 'flat'
    ? Math.min(parseFloat(form.discount_value) || 0, grossAmount)
    : form.discount_type === 'percent'
      ? grossAmount * (Math.min(parseFloat(form.discount_value) || 0, 100) / 100)
      : 0;
  const finalAmount = Math.max(0, grossAmount - discountAmt);

  const formatCurrency = (value) => `₹${parseFloat(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const validateForm = () => {
    if (remainingBalance <= 0) {
      return 'This case is already fully paid. No payment can be collected.';
    }
    if (!form.amount || grossAmount <= 0) {
      return 'Enter a valid gross amount to collect.';
    }
    if (grossAmount < 0) {
      return 'Amount cannot be negative.';
    }
    if (finalAmount > remainingBalance) {
      return `Amount cannot exceed remaining balance of ${formatCurrency(remainingBalance)}.`;
    }
    return '';
  };

  const handle = async () => {
    const error = validateForm();
    setValidationError(error);
    if (error) return;

    setLoading(true);
    try {
      const discountPercentage = form.discount_type === 'percent' 
        ? Math.min(parseFloat(form.discount_value) || 0, 100)
        : form.discount_type === 'flat' && grossAmount > 0
          ? (discountAmt / grossAmount * 100).toFixed(2)
          : 0;

      const response = await fetch(`${BASE_URL}/payments`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${getToken()}`, 'Content-Type':'application/json' },
        body: JSON.stringify({
          ...form,
          case_id: caseId,
          amount: finalAmount,
          gross_amount: grossAmount,
          discount_amount: discountAmt,
          discount_percentage: discountPercentage,
        }),
      });
      
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to record payment');
      }
      
      // Show success message with payment details
      alert(`✅ Payment Recorded!\n\nGross: ₹${grossAmount.toLocaleString('en-IN')}\nDiscount: ${discountPercentage}%\nCollectable: ₹${finalAmount.toLocaleString('en-IN')}\n\nRemaining Pending: ₹${(result.remaining_pending || 0).toLocaleString('en-IN')}`);
      onDone();
    } catch(e) {
      setValidationError(e?.message || 'Unable to record payment for this case.');
    } finally {
      setLoading(false);
    }
  };

  const generateLink = async () => {
    const error = validateForm();
    if (error) { setValidationError(error); return; }
    try {
      const res = await fetch(`${BASE_URL}/razorpay/payment-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: finalAmount, description: `Data Recovery Service Payment`, case_id: caseId }),
      });
      const data = await res.json();
      const url = data.payment_link || `https://rzp.io/l/demo_${Math.random().toString(36).substring(2,8)}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      alert(`✅ Payment Link copied!\n\n${url}\n\nAmount: ₹${finalAmount.toLocaleString('en-IN')}${discountAmt>0?`\n(Incl. discount ₹${discountAmt.toLocaleString('en-IN')})`:''}` );
    } catch {
      const url = `https://rzp.io/l/demo_${Math.random().toString(36).substring(2,8)}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      alert(`Payment Link (demo) copied:\n${url}`);
    }
  };

  const clientName = `${caseData?.first_name || ''} ${caseData?.last_name || ''}`.trim() || 'Client';
  const formError = validationError || validateForm();

  return (
    <div>
      <div style={{ display:'grid', gap:12, marginBottom:16 }}>
        <div className="tech-data-table" style={{ padding:12, border:'1px solid var(--border-subtle)', borderRadius:'var(--radius-md)', background:'var(--bg-elevated)' }}>
          <div className="tech-data-cell"><div className="tech-data-label">Case</div><div className="tech-data-value font-mono">{caseData?.case_number || '—'}</div></div>
          <div className="tech-data-cell"><div className="tech-data-label">Client</div><div className="tech-data-value">{clientName}</div></div>
          <div className="tech-data-cell"><div className="tech-data-label">Quotation</div><div className="tech-data-value">{quotationAmount > 0 ? formatCurrency(quotationAmount) : '—'}</div></div>
          <div className="tech-data-cell"><div className="tech-data-label">Collected</div><div className="tech-data-value" style={{ color: 'var(--status-success)' }}>{formatCurrency(totalCollected)}</div></div>
          <div className="tech-data-cell"><div className="tech-data-label">Remaining</div><div className="tech-data-value" style={{ color: remainingBalance > 0 ? 'var(--status-danger)' : 'var(--status-success)' }}>{formatCurrency(remainingBalance)}</div></div>
        </div>

        {formError && (
          <div style={{ padding:12, borderRadius:'var(--radius-sm)', background: formError.startsWith('Unable') ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.08)', border: `1px solid ${formError.startsWith('Unable') ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`, color: formError.startsWith('Unable') ? 'var(--status-danger)' : 'var(--status-warning)', fontSize:'0.9rem' }}>
            {formError}
          </div>
        )}
      </div>

      {/* Amount + discount */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div className="form-group" style={{margin:0}}>
          <label className="form-label required">Gross Amount (₹)</label>
          <input type="number" className="form-input" value={form.amount} onChange={e => { setValidationError(''); setForm(p => ({ ...p, amount: e.target.value })); }} placeholder="0.00" />
        </div>
        <div className="form-group" style={{margin:0}}>
          <label className="form-label">Discount</label>
          <div style={{ display:'flex', gap:6 }}>
            <select className="form-select" style={{width:110}} value={form.discount_type} onChange={e => { setValidationError(''); setForm(p => ({ ...p, discount_type: e.target.value, discount_value: '' })); }}>
              <option value="none">No Discount</option>
              <option value="flat">Flat (₹)</option>
              <option value="percent">Percent (%)</option>
            </select>
            {form.discount_type !== 'none' && (
              <input type="number" className="form-input" style={{flex:1}} placeholder={form.discount_type==='percent'?'0–100':'Amount'} value={form.discount_value} onChange={e => { setValidationError(''); setForm(p => ({ ...p, discount_value: e.target.value })); }} />
            )}
          </div>
        </div>
      </div>

      {/* Summary row */}
      {grossAmount > 0 && (
        <div style={{ display:'flex', gap:16, padding:'10px 14px', background:'var(--bg-elevated)', borderRadius:8, margin:'10px 0', fontSize:'0.82rem', border:'1px solid var(--border-subtle)' }}>
          <div>Gross: <strong>₹{grossAmount.toLocaleString('en-IN')}</strong></div>
          {discountAmt > 0 && <div style={{color:'#22c55e'}}>Discount: −₹{discountAmt.toLocaleString('en-IN')}</div>}
          <div style={{marginLeft:'auto', fontWeight:800, color:'var(--accent-primary)', fontSize:'0.9rem'}}>
            To Collect: ₹{finalAmount.toLocaleString('en-IN')}
          </div>
        </div>
      )}

      <div className="form-row form-row-2" style={{marginTop:8}}>
        <div className="form-group"><label className="form-label">Payment Method</label>
          <select className="form-select" value={form.method} onChange={e => { setValidationError(''); setForm(p => ({ ...p, method: e.target.value })); }}>
            {PAY_METHODS.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Reference / Transaction ID</label>
          <input className="form-input" value={form.reference} onChange={e => { setValidationError(''); setForm(p => ({ ...p, reference: e.target.value })); }} placeholder="UPI ref, cheque no, transaction ID..." />
        </div>
      </div>
      <div className="form-group"><label className="form-label">Notes</label><input className="form-input" value={form.notes} onChange={e => { setValidationError(''); setForm(p => ({ ...p, notes: e.target.value })); }} /></div>

      <div className="payment-link-box" style={{ marginTop:12, display:'flex', gap:12, padding:'12px 14px', background:'rgba(0,212,255,0.05)', borderRadius:'var(--radius-sm)', border:'1px solid rgba(0,212,255,0.15)', alignItems:'center' }}>
        <div style={{ fontSize:'1.4rem' }}>🔗</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'0.8rem', fontWeight:600, color:'var(--text-primary)', marginBottom:2 }}>Generate Razorpay Link Instead</div>
          <div style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>Send a payment link to the client via WhatsApp/Email. Amount is locked server-side.</div>
        </div>
        <button className="btn btn-sm" style={{ background:'rgba(0,212,255,0.1)', color:'var(--accent-primary)', borderColor:'rgba(0,212,255,0.3)' }} onClick={generateLink}>Generate Link</button>
      </div>

      <div style={{ display:'flex',gap:10,justifyContent:'flex-end',marginTop:20 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={loading || !!formError} onClick={handle}>{loading?<><div className="spinner" style={{width:14,height:14}}/> Recording…</>:' Record Payment'}</button>
      </div>
    </div>
  );
}

function InvoiceModal({ caseData, companyData, caseInvoices, onClose }) {
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${caseData.case_number.replace('DR-', '')}-${new Date().getFullYear()}`);
  const [customerName, setCustomerName] = useState(`${caseData.first_name || ''} ${caseData.last_name || ''}`.trim());
  const [deviceDetails, setDeviceDetails] = useState(`${caseData.device_brand || ''} ${caseData.device_model || ''}${caseData.serial_number ? ' (S/N: ' + caseData.serial_number + ')' : ''}`.trim());
  const [serviceType, setServiceType] = useState(caseData.failure_type ? caseData.failure_type.toUpperCase() : 'DATA RECOVERY');
  const [diagnosisSummary, setDiagnosisSummary] = useState(caseData.final_diagnosis || caseData.initial_diagnosis || 'Successful recovery');
  
  const initialRecoveryCharges = caseData.quotations?.[0]?.estimated_cost || caseData.quotations?.[0]?.total_amount || 0;
  const [recoveryCharges, setRecoveryCharges] = useState(initialRecoveryCharges);
  const [additionalCharges, setAdditionalCharges] = useState(0);
  const [taxGst, setTaxGst] = useState(companyData?.gst_rate || 18);
  
  const initialPaid = caseInvoices?.reduce((acc, inv) => acc + (parseFloat(inv.amount_paid) || 0), 0) || caseData.total_paid || 0;
  const [paidAmount, setPaidAmount] = useState(initialPaid);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  
  const defaultCompanyDetails = `${companyData.name || 'RecoverLab'}\n${companyData.address || 'Address Not Set'}\nPhone: ${companyData.phone || ''} | Email: ${companyData.email || ''}\nGSTIN: ${companyData.gstin || ''}`;
  const [companyDetails, setCompanyDetails] = useState(defaultCompanyDetails);
  const [authorizedSignature, setAuthorizedSignature] = useState(companyData.name || 'RecoverLab');
  
  const defaultNotes = `1. Payment is due upon receipt of this invoice.\n2. Verify all recovered data within 7 days.\n3. All disputes are subject to local jurisdiction.`;
  const [notesTerms, setNotesTerms] = useState(defaultNotes);
  const [saving, setSaving] = useState(false);

  const subtotal = parseFloat(recoveryCharges || 0) + parseFloat(additionalCharges || 0);
  const taxAmount = (subtotal * parseFloat(taxGst || 0)) / 100;
  const totalAmount = subtotal + taxAmount;
  const pendingAmount = Math.max(0, totalAmount - parseFloat(paidAmount || 0));
  const invoiceExists = caseInvoices && caseInvoices.length > 0;

  const handleGeneratePdf = async () => {
    setSaving(true);
    const co = companyData;
    const clientName = customerName;
    const caseDate = new Date().toLocaleString('en-IN');
    
    const subtotalVal = parseFloat(recoveryCharges || 0) + parseFloat(additionalCharges || 0);
    const taxAmountVal = (subtotalVal * parseFloat(taxGst || 0)) / 100;
    const totalAmountVal = subtotalVal + taxAmountVal;
    const pendingAmountVal = Math.max(0, totalAmountVal - parseFloat(paidAmount || 0));

    // Save invoice to Accounting backend
    try {
      const line_items = [
        { description: serviceType, qty: 1, unit_price: parseFloat(recoveryCharges || 0) }
      ];
      if (parseFloat(additionalCharges || 0) > 0) {
        line_items.push({ description: 'Additional Charges', qty: 1, unit_price: parseFloat(additionalCharges || 0) });
      }
      await accountingApi.createInvoice({
        title: serviceType,
        client_name: customerName,
        company: caseData.company || '',
        case_number: caseData.case_number,
        line_items,
        tax_pct: parseFloat(taxGst || 0),
        due_date: deliveryDate,
        notes: notesTerms,
        case_id: caseData.id,
        client_id: caseData.client_id,
        invoice_date: new Date().toISOString(),
      });
    } catch (err) {
      alert('Failed to save invoice: ' + (err.data?.error || err.message));
      setSaving(false);
      return;
    }
    setSaving(false);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice - ${caseData.case_number}</title>
    <style id="pageStyle">@page{size:A4 portrait;margin:0}</style>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      @media print{
        @page{margin:0}
        .controls{display:none!important}
        body{background:#fff;padding:0;min-height:auto}
        .page-wrap{padding:0;box-shadow:none;min-height:auto}
        body{print-color-adjust:exact;-webkit-print-color-adjust:exact}
      }
      body{font-family:Arial,sans-serif;background:#e2e8f0;min-height:100vh;padding:20px}
      .controls{background:#1e293b;color:#f8fafc;padding:10px 18px;display:flex;align-items:center;gap:12px;width:794px;margin:0 auto 10px;border-radius:6px;font-size:12px}
      .btn-print{background:#0284c7;color:#fff;border:none;padding:7px 18px;border-radius:5px;font-weight:800;font-size:12px;cursor:pointer;margin-left:auto}
      .btn-close{background:rgba(255,255,255,0.08);color:#94a3b8;border:1px solid #475569;padding:6px 12px;border-radius:5px;font-size:11px;cursor:pointer}
      .page-wrap{background:#fff;width:794px;margin:0 auto;box-shadow:0 4px 20px rgba(0,0,0,0.15);padding:28px 36px;min-height:1123px}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0284c7;padding-bottom:10px;margin-bottom:14px}
      .co-name{font-size:22px;font-weight:900;color:#0284c7}
      .co-meta{font-size:9px;color:#64748b;margin-top:2px;line-height:1.4}
      .form-title{font-size:16px;font-weight:900;text-transform:uppercase;text-align:right;color:#111;letter-spacing:0.04em}
      .case-ref{font-size:12px;font-weight:800;text-align:right;margin-top:4px;font-family:'Courier New',monospace;color:#0284c7}
      .form-date{font-size:9px;color:#64748b;text-align:right;margin-top:2px}
      .sec-title{font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.12em;background:#0f172a;color:#00d4ff;padding:3px 8px;display:inline-block;border-radius:3px;margin:10px 0 4px}
      table{width:100%;border-collapse:collapse;margin-bottom:4px}
      th,td{border:1px solid #ddd;padding:5px 9px;font-size:10px;text-align:left}
      th{background:#f1f5f9;font-weight:700;width:25%;color:#334155;font-size:9px;text-transform:uppercase;letter-spacing:0.04em}
      .disclaimer{font-size:8px;color:#64748b;line-height:1.4;margin-top:10px;padding:6px 8px;background:#f8fafc;border-left:3px solid #0284c7;border-radius:3px}
      .sig-row{display:flex;gap:30px;margin-top:16px}
      .sig-box{flex:1;text-align:center;font-size:9px;font-weight:700;color:#334155}
      .sig-line{border-top:1.5px solid #334155;margin-top:25px;padding-top:5px}
    </style></head>
    <body>
    <div class="controls">
      <strong>🖨 Printable Invoice / Receipt</strong>
      <button class="btn-close" onclick="window.close()">✕ Close</button>
      <button type="button" class="btn-print">🖨 Print / PDF</button>
    </div>
    <div class="page-wrap">
      <div class="hdr">
        <div>
          <div class="co-name">${co.name || 'RecoverLab CRM'}</div>
          <div class="co-meta">${companyDetails.replace(/\n/g, '<br/>')}</div>
        </div>
        <div>
          <div class="form-title">INVOICE / RECEIPT</div>
          <div class="case-ref">Case # ${caseData.case_number}</div>
          <div class="form-date">Invoice No: ${invoiceNumber}<br/>Date: ${caseDate}</div>
        </div>
      </div>

      <div class="sec-title">Client Information</div>
      <table><tbody>
        <tr><th>Name</th><td>${clientName}</td><th>Phone</th><td>${caseData.phone || '—'}</td></tr>
        <tr><th>Email</th><td>${caseData.email || '—'}</td><th>Company</th><td>${caseData.company || '—'}</td></tr>
      </tbody></table>

      <div class="sec-title">Device Details</div>
      <table><tbody>
        <tr><th>Brand</th><td>${caseData.device_brand || '—'}</td><th>Model</th><td>${caseData.device_model || '—'}</td><th>Serial Number</th><td>${caseData.serial_number || '—'}</td></tr>
        <tr><th>Capacity</th><td>${caseData.capacity_gb ? caseData.capacity_gb + ' GB' : '—'}</td><th>Interface</th><td>${caseData.interface || '—'}</td><th>Form Factor</th><td>${caseData.form_factor || '—'}</td></tr>
      </tbody></table>

      <div class="sec-title">Problem Description</div>
      <table><tbody>
        <tr><th>Failure Type(s)</th><td>${serviceType}</td></tr>
        <tr><th>Symptoms</th><td>${(caseData.symptoms || []).join(', ') || '—'}</td></tr>
        <tr><th>Initial Assessment</th><td>${diagnosisSummary}</td></tr>
      </tbody></table>

      <div class="sec-title">Payment Details</div>
      <table><tbody>
        <tr><th>Recovery Charges</th><td>₹${parseFloat(recoveryCharges || 0).toLocaleString('en-IN')}</td><th>Additional Charges</th><td>₹${parseFloat(additionalCharges || 0).toLocaleString('en-IN')}</td></tr>
        <tr><th>Tax / GST Rate</th><td>${taxGst}%</td><th>Payment Method</th><td>${paymentMethod}</td></tr>
        <tr><th>Total Amount</th><td style="font-weight:700">₹${totalAmountVal.toLocaleString('en-IN')}</td><th>Paid Amount</th><td style="color:#16a34a;font-weight:700">₹${parseFloat(paidAmount || 0).toLocaleString('en-IN')}</td></tr>
        <tr><th>Pending Amount</th><td colspan="3" style="color:#dc2626;font-weight:700;font-size:12px">₹${pendingAmountVal.toLocaleString('en-IN')}</td></tr>
      </tbody></table>

      <div class="disclaimer"><strong>Disclaimer/Terms:</strong> ${notesTerms.replace(/\n/g, '<br/>')}</div>

      <div class="sig-row">
        <div class="sig-box"><div class="sig-line">Client Signature</div></div>
        <div class="sig-box"><div class="sig-line">Authorized Receiver<br/><small style="font-weight:normal;color:#666">${authorizedSignature}</small></div></div>
      </div>
    </div>
    </body></html>`;

    openPrintPreviewWindow(html, { autoPrint: true });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">🖨 Print Invoice</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label required">Invoice Number</label>
              <input className="form-input font-mono" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Case Number</label>
              <input className="form-input font-mono" value={caseData.case_number} disabled style={{ background: 'var(--bg-disabled)' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Customer Name</label>
              <input className="form-input" value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Device Details</label>
              <input className="form-input" value={deviceDetails} onChange={e => setDeviceDetails(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Service Type</label>
              <input className="form-input" value={serviceType} onChange={e => setServiceType(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Diagnosis Summary</label>
              <input className="form-input" value={diagnosisSummary} onChange={e => setDiagnosisSummary(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Recovery Charges (₹)</label>
              <input type="number" className="form-input" value={recoveryCharges} onChange={e => setRecoveryCharges(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="form-group">
              <label className="form-label">Additional Charges (₹)</label>
              <input type="number" className="form-input" value={additionalCharges} onChange={e => setAdditionalCharges(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="form-group">
              <label className="form-label">Tax / GST (%)</label>
              <input type="number" className="form-input" value={taxGst} onChange={e => setTaxGst(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="form-group">
              <label className="form-label">Total Amount (₹)</label>
              <input className="form-input font-mono" value={`₹ ${totalAmount.toLocaleString('en-IN')}`} disabled style={{ background: 'var(--bg-disabled)', fontWeight: 'bold' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Paid Amount (₹)</label>
              <input type="number" className="form-input" value={paidAmount} onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="form-group">
              <label className="form-label">Pending Amount (₹)</label>
              <input className="form-input font-mono" value={`₹ ${pendingAmount.toLocaleString('en-IN')}`} disabled style={{ background: 'var(--bg-disabled)', color: pendingAmount > 0 ? 'var(--status-danger)' : 'var(--status-success)', fontWeight: 'bold' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Method</label>
              <select className="form-select" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                <option value="UPI">UPI</option>
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Card">Card</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Delivery Date</label>
              <input type="date" className="form-input" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Company Details</label>
              <textarea className="form-textarea" rows="3" value={companyDetails} onChange={e => setCompanyDetails(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Authorized Signature (Name)</label>
              <input className="form-input" value={authorizedSignature} onChange={e => setAuthorizedSignature(e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Notes & Terms</label>
              <textarea className="form-textarea" rows="3" value={notesTerms} onChange={e => setNotesTerms(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          {invoiceExists && <div style={{ color: 'var(--status-warning)', fontSize: '0.8rem', fontWeight: 700, marginRight: 'auto' }}> Invoice already created for this case</div>}
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving || invoiceExists} onClick={handleGeneratePdf}>{saving ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : '⚡ Download PDF & Save'}</button>
        </div>
      </div>
    </div>
  );
}
