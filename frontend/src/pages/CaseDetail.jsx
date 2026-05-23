import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { casesApi, paymentsApi, accountingApi } from '../services/api';
import { useAuth } from '../store/AuthContext';
import { printInwardForm } from '../components/NewCaseModal';
import { useInventoryConfig } from '../hooks/useInventoryConfig';


const BASE_URL = '/api';
const getToken = () => localStorage.getItem('accessToken');

const STAGE_ICONS = {
  received:'📥', inspection:'🔍', diagnosis:'🧪', quotation:'💰',
  approved:'✅', rejected:'❌', recovery_in_progress:'⚙️', imaging:'💿',
  data_extraction:'📤', verification:'🔬', completed:'🏆', delivered:'📦', failed:'💔',
};

const VALID_NEXT = {
  received:['inspection','failed'], inspection:['diagnosis','received','failed'],
  diagnosis:['quotation','inspection','failed'], quotation:['approved','rejected','diagnosis'],
  approved:['recovery_in_progress','quotation'], rejected:['quotation'],
  recovery_in_progress:['imaging','data_extraction','failed'],
  imaging:['data_extraction','recovery_in_progress','failed'],
  data_extraction:['verification','imaging','failed'],
  verification:['completed','data_extraction','failed'],
  completed:['delivered'], delivered:[], failed:['received'],
};

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Media Lightbox ─────────────────────────────────────────────
function Lightbox({ item, onClose, onPrev, onNext, hasPrev, hasNext }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
      if (e.key === 'ArrowRight' && hasNext) onNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  if (!item) return null;
  const isVideo = item.mimeType?.startsWith('video/');

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.95)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}
      onClick={onClose}>
      <button onClick={onClose} style={{position:'absolute',top:20,right:24,background:'none',border:'none',color:'#fff',fontSize:'1.8rem',cursor:'pointer',zIndex:1001}}>✕</button>
      {hasPrev && (
        <button onClick={e=>{e.stopPropagation();onPrev();}}
          style={{position:'absolute',left:20,top:'50%',transform:'translateY(-50%)',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.2)',borderRadius:'50%',width:44,height:44,color:'#fff',fontSize:'1.2rem',cursor:'pointer',zIndex:1001}}>‹</button>
      )}
      {hasNext && (
        <button onClick={e=>{e.stopPropagation();onNext();}}
          style={{position:'absolute',right:20,top:'50%',transform:'translateY(-50%)',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.2)',borderRadius:'50%',width:44,height:44,color:'#fff',fontSize:'1.2rem',cursor:'pointer',zIndex:1001}}>›</button>
      )}
      <div onClick={e=>e.stopPropagation()} style={{maxWidth:'90vw',maxHeight:'90vh',display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
        {isVideo ? (
          <video src={item.data} controls autoPlay style={{maxWidth:'85vw',maxHeight:'80vh',borderRadius:8}} />
        ) : (
          <img src={item.data} alt={item.name} style={{maxWidth:'85vw',maxHeight:'80vh',objectFit:'contain',borderRadius:8}} />
        )}
        <div style={{color:'rgba(255,255,255,0.7)',fontSize:'0.78rem',textAlign:'center'}}>
          {item.name} · {formatSize(item.size)}
          {item.caption && <span style={{marginLeft:12,color:'rgba(255,255,255,0.5)'}}>— {item.caption}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Image/Video Grid ────────────────────────────────────────────
function MediaGrid({ items, onDelete, canDelete }) {
  const [lightboxIdx, setLightboxIdx] = useState(null);

  if (!items?.length) return null;

  return (
    <>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10,marginTop:12}}>
        {items.map((item, idx) => {
          const isVideo = item.mimeType?.startsWith('video/');
          return (
            <div key={item.id} style={{position:'relative',borderRadius:'var(--radius-md)',overflow:'hidden',border:'1px solid var(--border-default)',background:'var(--bg-elevated)',aspectRatio:'1',cursor:'pointer'}}
              onClick={()=>setLightboxIdx(idx)}>
              {isVideo ? (
                <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,background:'rgba(124,58,237,0.1)'}}>
                  <span style={{fontSize:'2rem'}}>🎬</span>
                  <span style={{fontSize:'0.65rem',color:'var(--text-muted)',textAlign:'center',padding:'0 6px',wordBreak:'break-all'}}>{item.name}</span>
                </div>
              ) : (
                <img src={item.data} alt={item.name} style={{width:'100%',height:'100%',objectFit:'cover'}} />
              )}
              <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0)',transition:'background 0.15s'}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(0,0,0,0.3)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(0,0,0,0)'}
              />
              <div style={{position:'absolute',bottom:4,left:4,right:4,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:'0.6rem',color:'rgba(255,255,255,0.7)',background:'rgba(0,0,0,0.6)',padding:'2px 5px',borderRadius:4,maxWidth:90,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{formatSize(item.size)}</span>
                {canDelete && (
                  <button onClick={e=>{e.stopPropagation();onDelete(item.id);}}
                    style={{background:'rgba(239,68,68,0.8)',border:'none',borderRadius:4,color:'#fff',width:20,height:20,fontSize:'0.65rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {lightboxIdx !== null && (
        <Lightbox item={items[lightboxIdx]} onClose={()=>setLightboxIdx(null)}
          hasPrev={lightboxIdx > 0} hasNext={lightboxIdx < items.length - 1}
          onPrev={()=>setLightboxIdx(i=>i-1)} onNext={()=>setLightboxIdx(i=>i+1)} />
      )}
    </>
  );
}

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
          <div style={{fontSize:'1.8rem',marginBottom:8}}>{dragging ? '📂' : '📎'}</div>
          <div style={{fontSize:'0.82rem',color:'var(--text-secondary)',fontWeight:600}}>{label}</div>
          <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:4}}>or click to browse</div>
        </>
      )}
    </div>
  );
}

// ─── Solution Panel ──────────────────────────────────────────────
function SolutionPanel({ caseId, caseStage }) {
  const { canAccess } = useAuth();
  const [solution, setSolution] = useState({ textNote: '', mediaFiles: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [textNote, setTextNote] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await casesApi.getSolution(caseId);
      setSolution(d);
      setTextNote(d.textNote || '');
    } catch {} finally { setLoading(false); }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const handleSaveNote = async () => {
    setSaving(true);
    try {
      await casesApi.saveSolutionNote(caseId, textNote);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await load();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleUploadMedia = async (files) => {
    setUploading(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      await casesApi.uploadSolutionMedia(caseId, fd);
      await load();
    } catch (err) { alert(err.message); }
    finally { setUploading(false); }
  };

  const handleDeleteMedia = async (fileId) => {
    if (!confirm('Remove this file from the solution?')) return;
    try {
      await casesApi.deleteSolutionMedia(caseId, fileId);
      await load();
    } catch (err) { alert(err.message); }
  };

  const isSolved = ['completed', 'delivered'].includes(caseStage);
  const canEdit = canAccess('junior_engineer');

  if (loading) return <div style={{display:'flex',justifyContent:'center',padding:40}}><div className="spinner" style={{width:24,height:24}} /></div>;

  return (
    <div>
      {!isSolved && (
        <div className="alert alert-warning" style={{marginBottom:20}}>
          <span className="alert-icon">ℹ️</span>
          <div>
            <div className="alert-title">Case not yet solved</div>
            <div>Solution documentation is available for cases in <strong>Completed</strong> or <strong>Delivered</strong> stage. You can still add notes for reference.</div>
          </div>
        </div>
      )}

      {isSolved && (
        <div className="alert alert-success" style={{marginBottom:20}}>
          <span className="alert-icon">🏆</span>
          <div>
            <div className="alert-title">Case Solved — Document the Solution</div>
            <div>Add text notes, photos, and videos to document exactly how this case was recovered. This knowledge helps engineers handle similar cases in future.</div>
          </div>
        </div>
      )}

      {/* Text Notes */}
      <div className="card" style={{marginBottom:16}}>
        <div className="card-header">
          <div className="card-title">📝 Solution Notes</div>
          {canEdit && (
            <button className={`btn btn-sm ${saved ? 'btn-secondary' : 'btn-primary'}`}
              disabled={saving} onClick={handleSaveNote}>
              {saving ? <><div className="spinner" style={{width:12,height:12}} /> Saving…</> : saved ? '✓ Saved' : '💾 Save Notes'}
            </button>
          )}
        </div>
        <textarea
          className="form-textarea"
          style={{minHeight:160,fontFamily:'var(--font-sans)',lineHeight:1.7}}
          placeholder="Describe the solution in detail:&#10;• What was the root cause?&#10;• What tools were used?&#10;• What specific steps were taken?&#10;• Any tips for similar cases in the future?"
          value={textNote}
          onChange={e=>setTextNote(e.target.value)}
          readOnly={!canEdit}
        />
        {!solution.textNote && !textNote && (
          <div style={{marginTop:8,fontSize:'0.72rem',color:'var(--text-muted)'}}>No solution notes added yet.</div>
        )}
      </div>

      {/* Media Upload */}
      <div className="card" style={{marginBottom:16}}>
        <div className="card-header">
          <div className="card-title">🎬 Solution Media</div>
          <span style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{solution.mediaFiles?.length || 0} file(s)</span>
        </div>
        <p style={{fontSize:'0.78rem',color:'var(--text-muted)',marginBottom:12}}>
          Attach photos (before/after), videos showing the procedure, or diagnostic screenshots.
        </p>

        {canEdit && (
          <DropZoneUpload
            onUpload={handleUploadMedia}
            uploading={uploading}
            accept="image/*,video/*"
            label="Drop solution photos or videos here (before/after shots, recovery screen recordings)"
          />
        )}

        <MediaGrid items={solution.mediaFiles} onDelete={handleDeleteMedia} canDelete={canEdit} />

        {!solution.mediaFiles?.length && !canEdit && (
          <div className="empty-state" style={{padding:24}}>
            <div className="empty-icon">🖼️</div>
            <div className="empty-title">No media attached</div>
          </div>
        )}
      </div>
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
        <div className="card-title">📷 Device Photos</div>
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
        <MediaGrid items={images} onDelete={handleDelete} canDelete={canAccess('junior_engineer')} />
      ) : (
        !uploading && (
          <div className="empty-state" style={{padding:30}}>
            <div className="empty-icon">📷</div>
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
          <span className="alert-icon">🚨</span>
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
              ✓ Verified
            </span>
          )}
          {d.isInStock ? (
            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
              ✅ In Stock ({d.quantity})
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
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: '0.85rem' }}>🔢 Search by Stock Number</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
            placeholder="Enter Stock Number (e.g. STK-042, WD-001)"
            value={manualStockNo} onChange={e => setManualStockNo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleManualSearch()} />
          <button className="btn btn-primary btn-sm" disabled={searching} onClick={handleManualSearch}>
            {searching ? <div className="spinner" style={{ width: 14, height: 14 }} /> : '🔍 Find'}
          </button>
        </div>
        {manualError && <div style={{ color: 'var(--status-danger)', fontSize: '0.78rem', marginTop: 6 }}>{manualError}</div>}
        {manualResult && <div style={{ marginTop: 10 }}><DonorCard d={{ ...manualResult, score: 100, reasons: ['Manual entry'], isInStock: (manualResult.status||'available') === 'available' && manualResult.quantity > 0, isVerified: true }} isManual /></div>}
      </div>

      {/* Auto-matched donors */}
      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        🤖 Auto-Matched from Stock — {loading ? '…' : `${donors.length} found`}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" /></div>
      ) : donors.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <div className="empty-icon">🔄</div>
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
    <div className="pdf-modal-overlay" onClick={onClose}>
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
  const [activeTab, setActiveTab] = useState('overview');
  const [showTransition, setShowTransition] = useState(false);
  const [transitionForm, setTransitionForm] = useState({ stage:'', notes:'', timeSpentMinutes:0 });
  const [transitioning, setTransitioning] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [viewPdf, setViewPdf] = useState(null);
  const [showEditCase, setShowEditCase] = useState(false);
  const [timelineNote, setTimelineNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [caseInvoices, setCaseInvoices] = useState([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef();
  const [stockTransferItem, setStockTransferItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editingLogId, setEditingLogId] = useState(null);
  const [editLogText, setEditLogText] = useState('');

  const companyData = (() => { try { return JSON.parse(localStorage.getItem('crm_company')) || {}; } catch { return {}; }})();

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
      .then(d => { setCaseData(d); setEditForm(d); })
      .catch(err => { if(err.status===404) navigate('/cases'); })
      .finally(() => setLoading(false));
    // Load invoices for this case
    fetch(`${BASE_URL}/accounting/invoices?case_number=${id}&limit=10`,{ headers:{ Authorization:`Bearer ${getToken()}` } })
      .then(r=>r.json()).then(d=>setCaseInvoices(d.invoices||[])).catch(()=>{});
  }, [id]);

  const handleAddTimelineNote = async () => {
    if (!timelineNote.trim()) return;
    setSavingNote(true);
    try {
      await fetch(`${BASE_URL}/cases/${id}/timeline-notes`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${getToken()}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ notes: timelineNote }),
      });
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
    <style>body{font-family:Inter,Arial,sans-serif;padding:30px;color:#111;max-width:800px;margin:0 auto}
    .header{display:flex;justify-content:space-between;border-bottom:3px solid #0284c7;padding-bottom:16px;margin-bottom:20px}
    .co-name{font-size:22px;font-weight:900;color:#0284c7}.inv-title{font-size:20px;font-weight:800;color:#0284c7;text-align:right}
    table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ddd;padding:8px 12px;font-size:12px}
    th{background:#f1f5f9;font-weight:700;text-transform:uppercase;font-size:10px}
    .total-row{font-weight:900;background:#0d1117;color:#00d4ff}.footer{margin-top:30px;padding-top:12px;border-top:1px solid #ddd;font-size:10px;color:#94a3b8;text-align:center}</style></head>
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
    const co = companyData;
    const coName = co.name || 'RecoverLab CRM';
    const coAddr = co.address || '';
    const coPhone = co.phone || '';
    const coEmail = co.email || '';
    const coGstin = co.gstin || '';
    const clientName = `${caseData.first_name} ${caseData.last_name}`;
    const failureTypes = ((caseData.failure_types?.length) ? caseData.failure_types : (caseData.failure_type ? [caseData.failure_type] : [])).join(', ').toUpperCase() || '—';
    const symptoms = (caseData.symptoms || []).join(', ') || '—';
    const caseDate = caseData.created_at ? new Date(caseData.created_at).toLocaleString('en-IN') : new Date().toLocaleString('en-IN');
    const savedTnc = co.tnc_image || '';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Inward Form</title>
    <style id="pageStyle">@page{size:A4 portrait;margin:0}</style>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      @media print{
        .controls,.cut-hint{display:none!important}
        body{background:#fff;padding:0}
        .page-wrap{padding:0}
        .page1{page-break-after:always}
        .page2{display:${savedTnc ? 'flex' : 'none'}!important;width:100vw;height:100vh;align-items:center;justify-content:center;page-break-before:always}
        .page2 img{max-width:100%;max-height:100vh;object-fit:contain}
        body{print-color-adjust:exact;-webkit-print-color-adjust:exact}
      }
      body{font-family:Arial,sans-serif;background:#e2e8f0;min-height:100vh}
      .controls{background:#1e293b;color:#f8fafc;padding:10px 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px;position:sticky;top:0;z-index:99}
      .controls strong{font-size:13px;color:#00d4ff}
      .controls label{display:flex;align-items:center;gap:5px;color:#cbd5e1;white-space:nowrap}
      .controls select{background:#334155;color:#f1f5f9;border:1px solid #475569;padding:5px 8px;border-radius:4px;font-size:11px;cursor:pointer}
      .tnc-label{background:#334155;color:#94a3b8;border:1px solid #475569;padding:5px 10px;border-radius:4px;font-size:11px;cursor:pointer;white-space:nowrap}
      .tnc-label:hover{background:#475569;color:#f1f5f9}
      .btn-print{background:#00d4ff;color:#0f172a;border:none;padding:7px 18px;border-radius:5px;font-weight:800;font-size:12px;cursor:pointer;margin-left:auto}
      .btn-close{background:rgba(255,255,255,0.08);color:#94a3b8;border:1px solid #475569;padding:6px 12px;border-radius:5px;font-size:11px;cursor:pointer}
      .btn-clear{background:rgba(239,68,68,0.18);color:#f87171;border:1px solid rgba(239,68,68,0.3);padding:5px 9px;border-radius:4px;font-size:11px;cursor:pointer}
      .tnc-badge{font-size:10px;color:#34d399;font-weight:700;white-space:nowrap}
      .page-wrap{padding:20px;display:flex;flex-direction:column;align-items:center;gap:20px}
      .page1{background:#fff;width:794px;max-width:100%;box-shadow:0 4px 20px rgba(0,0,0,0.15);padding:36px 44px}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0284c7;padding-bottom:14px;margin-bottom:20px}
      .co-name{font-size:21px;font-weight:900;color:#0284c7}
      .co-meta{font-size:10px;color:#64748b;margin-top:3px;line-height:1.5}
      .form-title{font-size:17px;font-weight:900;text-transform:uppercase;text-align:right;color:#111;letter-spacing:0.04em}
      .case-ref{font-size:13px;font-weight:800;text-align:right;margin-top:5px;font-family:'Courier New',monospace;color:#0284c7}
      .form-date{font-size:10px;color:#64748b;text-align:right;margin-top:3px}
      .sec-title{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.12em;background:#0f172a;color:#00d4ff;padding:3px 10px;display:inline-block;border-radius:3px;margin:14px 0 8px}
      table{width:100%;border-collapse:collapse;margin-bottom:4px}
      th,td{border:1px solid #ddd;padding:7px 11px;font-size:11px;text-align:left}
      th{background:#f1f5f9;font-weight:700;width:30%;color:#334155;font-size:10px;text-transform:uppercase;letter-spacing:0.04em}
      .disclaimer{font-size:9px;color:#64748b;line-height:1.5;margin-top:16px;padding:8px 10px;background:#f8fafc;border-left:3px solid #0284c7;border-radius:3px}
      .sig-row{display:flex;gap:20px;margin-top:28px}
      .sig-box{flex:1;text-align:center;font-size:10px;font-weight:700;color:#334155}
      .sig-line{border-top:1.5px solid #334155;margin-top:44px;padding-top:6px}
      .page2-screen{background:#fff;width:794px;max-width:100%;box-shadow:0 4px 20px rgba(0,0,0,0.15);min-height:200px;display:flex;align-items:center;justify-content:center;border:2px dashed #cbd5e1}
      .page2-screen img{max-width:100%;max-height:600px;object-fit:contain}
      .no-tnc{color:#94a3b8;font-size:13px;padding:40px;text-align:center}
      .cut-hint{text-align:center;font-size:10px;color:#94a3b8;margin-top:6px}
      .page2{display:none}
    </style></head>
    <body>
    <div class="controls">
      <strong>🖨 Inward Form</strong>
      <label>Paper:<select id="sz" onchange="upd()">
        <option value="A4">A4</option><option value="A3">A3</option>
        <option value="A5">A5</option><option value="letter">Letter</option>
      </select></label>
      <label>Orientation:<select id="or" onchange="upd()">
        <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
      </select></label>
      <label class="tnc-label" for="tncFile">📎 Upload T&amp;C Image (Page 2)</label>
      <input type="file" id="tncFile" accept="image/*" style="display:none" onchange="loadTnc(this)">
      <span class="tnc-badge" id="tncBadge" style="display:${savedTnc ? 'inline' : 'none'}">✓ T&amp;C loaded</span>
      <button class="btn-clear" id="tncClearBtn" style="display:${savedTnc ? 'inline' : 'none'}" onclick="clearTnc()">✕ Clear T&amp;C</button>
      <button class="btn-close" onclick="window.close()">✕ Close</button>
      <button class="btn-print" onclick="window.print()">🖨 Print</button>
    </div>
    <div class="page-wrap">
      <div class="page1">
        <div class="hdr">
          <div>
            <div class="co-name">${coName}</div>
            <div class="co-meta">${coAddr}${coPhone ? ' | ' + coPhone : ''}${coEmail ? ' | ' + coEmail : ''}${coGstin ? ' | GSTIN: ' + coGstin : ''}</div>
          </div>
          <div>
            <div class="form-title">📥 Inward Form / Receipt</div>
            <div class="case-ref">Case # ${caseData.case_number}</div>
            <div class="form-date">Date: ${caseDate}</div>
          </div>
        </div>
        <div class="sec-title">Client Information</div>
        <table><tbody>
          <tr><th>Name</th><td>${clientName}</td><th>Phone</th><td>${caseData.phone || '—'}</td></tr>
          <tr><th>Email</th><td colspan="3">${caseData.email || '—'}</td></tr>
          ${caseData.company ? `<tr><th>Company</th><td colspan="3">${caseData.company}</td></tr>` : ''}
        </tbody></table>
        <div class="sec-title">Device Details</div>
        <table><tbody>
          <tr><th>Brand</th><td>${caseData.device_brand || '—'}</td><th>Model</th><td>${caseData.device_model || '—'}</td></tr>
          <tr><th>Serial Number</th><td>${caseData.serial_number || '—'}</td><th>Capacity</th><td>${caseData.capacity_gb ? caseData.capacity_gb + ' GB' : '—'}</td></tr>
          <tr><th>Interface</th><td>${caseData.interface || '—'}</td><th>Form Factor</th><td>${caseData.form_factor || '—'}</td></tr>
        </tbody></table>
        <div class="sec-title">Problem Description</div>
        <table><tbody>
          <tr><th>Failure Type(s)</th><td>${failureTypes}</td></tr>
          <tr><th>Symptoms</th><td>${symptoms}</td></tr>
          <tr><th>Initial Assessment</th><td>${caseData.initial_diagnosis || 'None provided'}</td></tr>
        </tbody></table>
        <div class="disclaimer"><strong>Disclaimer:</strong> This inward receipt acknowledges submission of the device for data recovery evaluation. All devices are handled in controlled environments. We bear no responsibility for prior data loss, tampering, or physical damage pre-existing at the time of submission.</div>
        <div class="sig-row">
          <div class="sig-box"><div class="sig-line">Client Signature</div></div>
          <div class="sig-box"><div class="sig-line">Authorized Receiver</div></div>
        </div>
      </div>
      <!-- T&C page preview on screen -->
      <div class="page2-screen" id="tncScreen" style="display:${savedTnc ? 'flex' : 'none'}">
        <img id="tncScreenImg" src="${savedTnc}" alt="Terms & Conditions"/>
      </div>
      <div class="no-tnc" id="noTncMsg" style="display:${savedTnc ? 'none' : 'block'}">
        📄 Upload a T&amp;C image above → it will print as <strong>Page 2</strong>
      </div>
    </div>
    <div class="cut-hint">Page 2 (T&amp;C) prints automatically if image is uploaded</div>
    <!-- Print-only Page 2 -->
    <div class="page2" id="tncPrint"><img id="tncPrintImg" src="${savedTnc}" alt="Terms and Conditions"/></div>
    <script>
      function upd(){var s=document.getElementById('sz').value,o=document.getElementById('or').value;document.getElementById('pageStyle').textContent='@page{size:'+s+' '+o+';margin:0}'}
      function loadTnc(inp){
        var f=inp.files[0]; if(!f)return;
        var r=new FileReader();
        r.onload=function(e){
          var src=e.target.result;
          document.getElementById('tncScreenImg').src=src;
          document.getElementById('tncScreen').style.display='flex';
          document.getElementById('noTncMsg').style.display='none';
          document.getElementById('tncPrintImg').src=src;
          document.getElementById('tncPrint').style.cssText='display:flex!important;width:100vw;height:100vh;align-items:center;justify-content:center;page-break-before:always';
          document.getElementById('tncBadge').style.display='inline';
          document.getElementById('tncClearBtn').style.display='inline';
          try{var co=JSON.parse(localStorage.getItem('crm_company')||'{}');co.tnc_image=src;localStorage.setItem('crm_company',JSON.stringify(co));}catch(ex){}
        };
        r.readAsDataURL(f);
      }
      function clearTnc(){
        document.getElementById('tncScreen').style.display='none';
        document.getElementById('noTncMsg').style.display='block';
        document.getElementById('tncPrint').style.display='none';
        document.getElementById('tncBadge').style.display='none';
        document.getElementById('tncClearBtn').style.display='none';
        document.getElementById('tncPrintImg').src='';
        document.getElementById('tncScreenImg').src='';
        try{var co=JSON.parse(localStorage.getItem('crm_company')||'{}');delete co.tnc_image;localStorage.setItem('crm_company',JSON.stringify(co));}catch(ex){}
      }
    </script>
    </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
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
        <option value="10cm 10cm">Square 10×10 cm</option>
        <option value="15cm 15cm">Square 15×15 cm</option>
        <option value="10cm 15cm">Postcard 10×15 cm</option>
        <option value="letter landscape">Letter — Large</option>
        <option value="custom">Custom…</option>
      </select></label>
      <div class="custom-row" id="customRow">
        W:<input type="number" id="cw" value="148" min="50" max="500">mm ×
        H:<input type="number" id="ch" value="105" min="50" max="500">mm
        <button onclick="updCustom()" style="background:#00d4ff;color:#0f172a;border:none;padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer">Apply</button>
      </div>
      <button class="btn-close" onclick="window.close()">✕ Close</button>
      <button class="btn-print" onclick="window.print()">🖨 Print</button>
    </div>
    <div class="slip-wrap"><div class="slip">
      <div class="slip-header">
        <div>
          <div class="brand">📦 ${coName}</div>
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
        var cr=document.getElementById('customRow');
        if(v==='custom'){cr.style.display='flex';}
        else{cr.style.display='none';document.getElementById('pageStyle').textContent='@page{size:'+v+';margin:0}';}
      }
      function updCustom(){
        var w=document.getElementById('cw').value,h=document.getElementById('ch').value;
        document.getElementById('pageStyle').textContent='@page{size:'+w+'mm '+h+'mm;margin:0}';
      }
    </script>
    </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
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

  const allowedNext = VALID_NEXT[caseData.stage] || [];
  const isSolved = ['completed', 'delivered'].includes(caseData.stage);

  const TABS = [
    { key: 'overview',     label: '📊 Overview' },
    { key: 'photos',       label: '📷 Photos' },
    { key: 'solution',     label: isSolved ? '🏆 Solution' : '📋 Solution' },
    { key: 'smart-assist', label: '🧠 Smart Assist' },
    { key: 'comms',        label: '💬 Communication' },
    { key: 'donors',       label: '🔄 Donors' },
    { key: 'timeline',     label: '📋 Timeline' },
    { key: 'files',        label: '📁 Files' },
    { key: 'payments',     label: '💰 Payments' },
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
              {STAGE_ICONS[caseData.stage]} {caseData.stage?.replace(/_/g,' ')}
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
            <button className="btn btn-secondary btn-sm" onClick={() => { const t = prompt('Template: 1=Modern, 2=Classic, 3=Minimal','1'); const map={'1':'standard','2':'classic','3':'minimal'}; printInwardForm(caseData, map[t]||'standard'); }}>🖨 Inward Form</button>
            <button className="btn btn-secondary btn-sm" onClick={printCourierSlip}>🚚 Courier Slip</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setEditForm({...caseData}); setShowEditCase(true); }}>✏️ Edit</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPayment(true)}>💳 Payment</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setStockTransferItem(true)}>🔄 To Stock</button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowTransition(true)}>⚡ Advance Stage</button>
          </div>
        )}
        {!allowedNext.length && canAccess('junior_engineer') && (
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={printInwardForm}>🖨 Inward Form</button>
            <button className="btn btn-secondary btn-sm" onClick={printCourierSlip}>🚚 Courier Slip</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setEditForm({...caseData}); setShowEditCase(true); }}>✏️ Edit</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPayment(true)}>💳 Payment</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setStockTransferItem(true)}>🔄 To Stock</button>
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
              <div className="card-title" style={{marginBottom:14}}>🖥 Device Information</div>
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
              <div className="card-title" style={{marginBottom:14}}>🔍 Diagnosis</div>
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
              <div className="card-title" style={{marginBottom:14}}>⏱ Recovery Progress</div>
              <div style={{marginBottom:8}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem',marginBottom:6}}>
                  <span className="text-muted">Overall Progress</span>
                  <span className="font-mono" style={{color:'var(--accent-primary)'}}>{caseData.recovery_progress_pct||0}%</span>
                </div>
                <div className="progress-bar" style={{height:10}}>
                  <div className="progress-fill" style={{width:`${caseData.recovery_progress_pct||0}%`}} />
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
                    <div className="card-title" style={{marginBottom:2}}>💰 Payment Summary</div>
                    <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>
                      Collected: <strong style={{color:'var(--status-success)'}}>₹{parseFloat(caseData.total_paid||0).toLocaleString('en-IN')}</strong>
                      {caseData.balance_due > 0 && <> &nbsp;·&nbsp; <span style={{color:'var(--status-danger)'}}>₹{parseFloat(caseData.balance_due||0).toLocaleString('en-IN')} due</span></>}
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={()=>setShowPayment(true)}>💳 Collect Payment</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'photos' && <CasePhotosPanel caseId={id} />}

      {activeTab === 'solution' && <SolutionPanel caseId={id} caseStage={caseData.stage} />}

      {activeTab === 'smart-assist' && <SmartAssistPanel caseId={id} />}

      {activeTab === 'comms' && <CommunicationLogPanel caseId={id} caseData={caseData} />}

      {activeTab === 'donors' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>🔬 Compatible Donor Drives</div>
            <button className="btn btn-secondary btn-sm" onClick={() => window.open('/inventory', '_self')}>📦 Browse Inventory →</button>
          </div>
          <DonorPanel caseId={id} caseData={caseData} />
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="card">
          <div className="card-title" style={{marginBottom:16}}>📋 Workflow Timeline</div>
          {/* Add manual note */}
          <div style={{ marginBottom:20, padding:'14px 16px', background:'var(--bg-elevated)', borderRadius:'var(--radius-md)', border:'1px solid var(--border-subtle)' }}>
            <div className="form-label" style={{ marginBottom:8 }}>Add Timeline Note</div>
            <textarea className="form-textarea" style={{ minHeight:70, marginBottom:10 }}
              placeholder="Add a manual note, observation, or update to the timeline…"
              value={timelineNote} onChange={e => setTimelineNote(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={savingNote || !timelineNote.trim()} onClick={handleAddTimelineNote}>
              {savingNote?<><div className="spinner" style={{width:12,height:12}}/> Adding…</>:'➕ Add Note'}
            </button>
          </div>
          <div className="timeline">
            {(caseData.workflowLogs||[]).map((log, i) => (
              <div key={log.id} className="timeline-item">
                <div className={`timeline-dot ${log.to_stage==='completed'||log.to_stage==='delivered'?'success':log.to_stage==='failed'?'danger':i===caseData.workflowLogs.length-1?'active':''}`}>
                  {log.type==='note'?'📝':STAGE_ICONS[log.to_stage]||'📌'}
                </div>
                <div className="timeline-content" style={{flex:1}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                    <div>
                      <div className="timeline-stage">{log.type==='note'?'Manual Note':log.to_stage?.replace(/_/g,' ')}</div>
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
            ))}
            {!caseData.workflowLogs?.length && <div className="empty-state" style={{padding:30}}><div className="empty-desc">No workflow events recorded yet</div></div>}
          </div>
        </div>
      )}

      {activeTab === 'files' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">📁 Case Files</div>
            <div style={{ display:'flex',gap:8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingFiles}>
                {uploadingFiles?<><div className="spinner" style={{width:12,height:12}}/> Uploading…</>:'📎 Upload File'}
              </button>
              <input ref={fileInputRef} type="file" multiple style={{ display:'none' }} onChange={e=>handleUploadFiles(e.target.files)} />
            </div>
          </div>
          <div onDrop={e=>{e.preventDefault();handleUploadFiles(e.dataTransfer.files);}} onDragOver={e=>e.preventDefault()}
            style={{ border:'2px dashed var(--border-default)',borderRadius:'var(--radius-md)',padding:20,textAlign:'center',marginBottom:16,cursor:'pointer',fontSize:'0.8rem',color:'var(--text-muted)' }}
            onClick={() => fileInputRef.current?.click()}>
            📂 Drag & drop any files here (images, PDFs, logs, videos)
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
            <div className="empty-state"><div className="empty-icon">📁</div><div className="empty-title">No files uploaded</div><div className="empty-desc">Upload any relevant files for this case</div></div>
          )}
        </div>
      )}

      {activeTab === 'payments' && (
        <div>
          {/* Quick payment button */}
          <div style={{ display:'flex',justifyContent:'flex-end',marginBottom:16 }}>
            <button className="btn btn-primary" onClick={() => setShowPayment(true)}>💳 Collect Payment</button>
          </div>
          {caseInvoices.length > 0 && (
            <div className="card" style={{marginBottom:16}}>
              <div className="card-title" style={{marginBottom:14}}>🧾 Invoices</div>
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
                        🔗 Payment Link
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {caseData.quotations?.length > 0 && (
            <div className="card" style={{marginBottom:16}}>
              <div className="card-title" style={{marginBottom:14}}>💵 Quotations</div>
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
          <div className="card">
            <div className="card-title" style={{marginBottom:14}}>💳 Payments</div>
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
              <div className="empty-state" style={{padding:24}}><div className="empty-icon">💳</div><div className="empty-title">No payments recorded</div></div>
            )}
          </div>
        </div>
      )}

      {/* Stage Transition Modal */}
      {showTransition && (
        <div className="modal-overlay" onClick={() => setShowTransition(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">⚡ Advance Stage</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowTransition(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{marginBottom:16,padding:'10px 14px',background:'rgba(0,212,255,0.05)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-accent)'}}>
                <span className="text-xs text-muted">Current: </span>
                <span style={{fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--text-primary)'}}>{caseData.stage}</span>
              </div>

              <div className="form-group">
                <label className="form-label required">Next Stage</label>
                <select className="form-select" value={transitionForm.stage} onChange={e => setTransitionForm({...transitionForm, stage: e.target.value})}>
                  <option value="">Select next stage...</option>
                  {allowedNext.map(s => <option key={s} value={s}>{STAGE_ICONS[s]} {s.replace(/_/g,' ').toUpperCase()}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Work Notes</label>
                <textarea className="form-textarea" placeholder="What was done? Actions performed?" value={transitionForm.notes}
                  onChange={e => setTransitionForm({...transitionForm, notes: e.target.value})} />
              </div>

              <div className="form-group">
                <label className="form-label">Time Spent (minutes)</label>
                <input type="number" className="form-input" min="0" value={transitionForm.timeSpentMinutes}
                  onChange={e => setTransitionForm({...transitionForm, timeSpentMinutes: parseInt(e.target.value)||0})} />
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
                {transitioning ? <><div className="spinner" style={{width:14,height:14}}/> Updating…</> : '→ Advance Stage'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collect Payment Modal */}
      {showPayment && (
        <div className="modal-overlay" onClick={() => setShowPayment(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3 className="modal-title">💳 Collect Payment — {caseData.case_number}</h3><button className="btn btn-ghost btn-icon" onClick={() => setShowPayment(false)}>✕</button></div>
            <div className="modal-body">
              <CollectPaymentForm caseId={id} onClose={() => setShowPayment(false)} onDone={() => { casesApi.get(id).then(setCaseData); setShowPayment(false); }} />
            </div>
          </div>
        </div>
      )}

      {/* Edit Case Modal */}
      {showEditCase && (
        <div className="modal-overlay" onClick={() => setShowEditCase(false)}>
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
        <div className="modal-overlay" onClick={() => setStockTransferItem(null)}>
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
  { key:'call',      icon:'📞', label:'Phone Call', color:'#3b82f6' },
  { key:'whatsapp',  icon:'💬', label:'WhatsApp',   color:'#25d366' },
  { key:'email',     icon:'📧', label:'Email',       color:'#f59e0b' },
  { key:'visit',     icon:'🏢', label:'Walk-In Visit', color:'#8b5cf6' },
  { key:'sms',       icon:'💌', label:'SMS',         color:'#64748b' },
  { key:'note',      icon:'📝', label:'Internal Note', color:'#6366f1' },
];

function CommunicationLogPanel({ caseId, caseData }) {
  const storageKey = `case_comms_${caseId}`;
  const [comms, setComms] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) || []; } catch { return []; }
  });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ type:'call', direction:'outbound', summary:'', agent:'', duration:'', followUp:'' });
  const [filter, setFilter] = useState('all');

  const saveComms = (list) => { setComms(list); localStorage.setItem(storageKey, JSON.stringify(list)); };

  const handleAdd = () => {
    if (!form.summary.trim()) return;
    const entry = {
      id: Date.now().toString(),
      ...form,
      createdAt: new Date().toISOString(),
      caseNumber: caseData?.case_number,
      clientName: `${caseData?.first_name || ''} ${caseData?.last_name || ''}`.trim(),
    };
    saveComms([entry, ...comms]);
    setForm({ type:'call', direction:'outbound', summary:'', agent:'', duration:'', followUp:'' });
    setShowAdd(false);
  };

  const handleDelete = (id) => {
    if (!confirm('Delete this communication log entry?')) return;
    saveComms(comms.filter(c => c.id !== id));
  };

  const filtered = filter === 'all' ? comms : comms.filter(c => c.type === filter);
  const typeInfo = (key) => COMM_TYPES.find(t => t.key === key) || COMM_TYPES[0];

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div className="card-title">💬 Communication History</div>
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
        {filtered.map(entry => {
          const ti = typeInfo(entry.type);
          return (
            <div key={entry.id} style={{display:'flex',gap:12,padding:'12px 14px',background:'var(--bg-card)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',transition:'border-color 0.15s'}}
              onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border-default)'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-subtle)'}>
              <div style={{width:36,height:36,borderRadius:'50%',background:`${ti.color}18`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1rem',flexShrink:0,border:`1px solid ${ti.color}30`}}>
                {ti.icon}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:4}}>
                  <span style={{fontWeight:700,fontSize:'0.82rem',color:ti.color}}>{ti.label}</span>
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
              <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:'0.8rem',padding:4,alignSelf:'flex-start',opacity:0.6}}
                onClick={()=>handleDelete(entry.id)} title="Delete entry">✕</button>
            </div>
          );
        })}
        {!filtered.length && (
          <div className="empty-state" style={{padding:40}}>
            <div className="empty-icon">💬</div>
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
function CollectPaymentForm({ caseId, onClose, onDone }) {
  const [form, setForm] = useState({ amount:'', discount_type:'none', discount_value:'', method:'UPI', reference:'', notes:'' });
  const [loading, setLoading] = useState(false);
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

  const handle = async () => {
    if (!grossAmount) { alert('Enter amount'); return; }
    setLoading(true);
    try {
      await fetch(`${BASE_URL}/cases/${caseId}/payments`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${getToken()}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ ...form, amount: finalAmount, gross_amount: grossAmount, discount_amount: discountAmt }),
      });
      onDone();
    } catch(e){ alert(e.message); } finally{ setLoading(false); }
  };

  const generateLink = async () => {
    if (!finalAmount) { alert('Enter amount first'); return; }
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

  return (
    <div>
      {/* Amount + discount */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div className="form-group" style={{margin:0}}>
          <label className="form-label required">Gross Amount (₹)</label>
          <input type="number" className="form-input" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} placeholder="0.00" />
        </div>
        <div className="form-group" style={{margin:0}}>
          <label className="form-label">Discount</label>
          <div style={{ display:'flex', gap:6 }}>
            <select className="form-select" style={{width:110}} value={form.discount_type} onChange={e=>setForm(p=>({...p,discount_type:e.target.value,discount_value:''}))}>
              <option value="none">No Discount</option>
              <option value="flat">Flat (₹)</option>
              <option value="percent">Percent (%)</option>
            </select>
            {form.discount_type !== 'none' && (
              <input type="number" className="form-input" style={{flex:1}} placeholder={form.discount_type==='percent'?'0–100':'Amount'} value={form.discount_value} onChange={e=>setForm(p=>({...p,discount_value:e.target.value}))} />
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
          <select className="form-select" value={form.method} onChange={e=>setForm(p=>({...p,method:e.target.value}))}>
            {PAY_METHODS.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Reference / Transaction ID</label>
          <input className="form-input" value={form.reference} onChange={e=>setForm(p=>({...p,reference:e.target.value}))} placeholder="UPI ref, cheque no, transaction ID..." />
        </div>
      </div>
      <div className="form-group"><label className="form-label">Notes</label><input className="form-input" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} /></div>

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
        <button className="btn btn-primary" disabled={loading||!form.amount} onClick={handle}>{loading?<><div className="spinner" style={{width:14,height:14}}/> Recording…</>:'✅ Record Payment'}</button>
      </div>
    </div>
  );
}
