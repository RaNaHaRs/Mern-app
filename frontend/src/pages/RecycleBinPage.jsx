import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { inventoryApi, mediaRecycleApi } from '../services/api';
import { fileTypeIcon, formatFileSize } from '../utils/solutionMedia';
import { getCategoryMeta } from '../constants/inventoryConfig';

const BASE_URL = '/api';
const getToken = () => localStorage.getItem('accessToken');

const binApi = {
  list: () => fetch(`${BASE_URL}/recycle-bin`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()),
  restore: (id) => fetch(`${BASE_URL}/recycle-bin/${id}/restore`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  }).then(r => r.json()),
  permanentDelete: (id) => fetch(`${BASE_URL}/recycle-bin/${id}/permanent-delete`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  }).then(r => r.json()),
};

const daysAgo = (d) => {
  const diff = Math.floor((Date.now() - new Date(d)) / 86400000);
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : `${diff} days ago`;
};

function ConfirmRestoreModal({ item, onConfirm, onClose }) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h3 className="modal-title">Restore Item</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', margin: '8px 0 16px 0' }}>
            Are you sure you want to restore this item?
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>No</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Restoring...' : 'Yes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({ item, onConfirm, onClose }) {
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (confirmText !== 'DELETE') return;
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, border: '1px solid rgba(239,68,68,0.3)' }}>
        <div className="modal-header" style={{ background: 'rgba(239,68,68,0.04)' }}>
          <h3 className="modal-title" style={{ color: 'var(--status-danger)' }}>Permanent Delete</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="alert alert-danger" style={{ marginBottom: 16 }}>
            <span className="alert-icon"></span>
            <div><strong>This action cannot be undone.</strong> The item and all related data will be permanently destroyed.</div>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', marginBottom: 12 }}>
            Type <strong>DELETE</strong> to permanently remove this item.
          </p>
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <input
                type="text"
                className="form-input"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                autoFocus
                style={{ textTransform: 'none' }}
                disabled={loading}
              />
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className="btn btn-danger"
            disabled={confirmText !== 'DELETE' || loading}
            onClick={handleSubmit}
          >
            {loading ? 'Deleting...' : 'Permanently Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Case Details Modal
// ═══════════════════════════════════════════════════════════════════════
function CaseDetailsModal({ item, onRestore, onDelete, onClose, isSuperAdmin }) {
  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">Case Details</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ paddingBottom: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', fontSize: '0.8rem' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Case Number</div>
              <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{item.case_number}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Priority</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.priority || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Client Name</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.client_name || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Engineer</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.engineer || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Device Type</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.device_type || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Brand</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.brand || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Model</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.model || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Capacity</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.capacity || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Failure Type</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.failure_type || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Stage at Deletion</div>
              <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 999, background: 'rgba(100,116,139,0.12)', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>{item.status || item.stage || '—'}</span>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Total Amount</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>₹{(item.total_amount || 0).toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Pending Amount</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>₹{(item.pending_amount || 0).toLocaleString('en-IN')}</div>
            </div>
          </div>
          {item.notes && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(100,116,139,0.2)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Notes</div>
              <div style={{ fontSize: '0.78rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{item.notes}</div>
            </div>
          )}
          {item.diagnosis && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(100,116,139,0.2)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Diagnosis</div>
              <div style={{ fontSize: '0.78rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{item.diagnosis}</div>
            </div>
          )}
          {item.solution_summary && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(100,116,139,0.2)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Solution Summary</div>
              <div style={{ fontSize: '0.78rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{item.solution_summary}</div>
            </div>
          )}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(100,116,139,0.2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.75rem' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Created Date</div>
              <div style={{ fontWeight: 600 }}>{item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN') : '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Deleted Date</div>
              <div style={{ fontWeight: 600 }}>{item.deleted_at ? new Date(item.deleted_at).toLocaleDateString('en-IN') : '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Deleted By</div>
              <div style={{ fontWeight: 600 }}>{item.deleted_by_name || '—'}</div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={onRestore}>Restore</button>
          {isSuperAdmin && (
            <button className="btn btn-danger" onClick={onDelete}>Permanent Delete</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Inventory Details Modal
// ═══════════════════════════════════════════════════════════════════════
function InventoryDetailsModal({ item, onRestore, onDelete, onClose, isSuperAdmin }) {
  const cat = getCategoryMeta(item.ui_category || item.category);
  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">Inventory Item Details</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ paddingBottom: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', fontSize: '0.8rem' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Item Number</div>
              <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{item.stock_number || item.sku || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Category</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{cat.icon} {cat.label}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Manufacturer</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.brand || item.manufacturer || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Model</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.model || item.name || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Capacity</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.capacity || item.size || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Quantity</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.quantity || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Status</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.status || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Location</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.location || item.storage_location || '—'}</div>
            </div>
            {item.pcb_number && (
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>PCB Number</div>
                <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{item.pcb_number}</div>
              </div>
            )}
            {item.purchase_date && (
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Purchase Date</div>
                <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{new Date(item.purchase_date).toLocaleDateString('en-IN')}</div>
              </div>
            )}
          </div>
          {item.notes && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(100,116,139,0.2)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Notes</div>
              <div style={{ fontSize: '0.78rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{item.notes}</div>
            </div>
          )}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(100,116,139,0.2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.75rem' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Created Date</div>
              <div style={{ fontWeight: 600 }}>{item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN') : '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Deleted Date</div>
              <div style={{ fontWeight: 600 }}>{item.deleted_at ? new Date(item.deleted_at).toLocaleDateString('en-IN') : '—'}</div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Deleted By</div>
              <div style={{ fontWeight: 600 }}>{item.deleted_by_name || '—'}</div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={onRestore}>Restore</button>
          {isSuperAdmin && (
            <button className="btn btn-danger" onClick={onDelete}>Permanent Delete</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Media Details Modal
// ═══════════════════════════════════════════════════════════════════════
function MediaDetailsModal({ item, onRestore, onDelete, onClose, isSuperAdmin }) {
  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">Media File Details</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ paddingBottom: 0 }}>
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(100,116,139,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: '2rem' }}>{fileTypeIcon(item)}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', wordBreak: 'break-word' }}>{item.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatFileSize(item.size)}</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', fontSize: '0.8rem' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>File Type</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.mime_type || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>File Size</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{formatFileSize(item.size)}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Source Module</div>
              <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 999, background: 'rgba(0,212,255,0.1)', color: 'var(--accent-primary)' }}>{item.source_label || '—'}</span>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Related To</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.parent_label || item.parent_id || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Uploaded By</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.uploaded_by_name || '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Uploaded Date</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN') : '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Deleted Date</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.deleted_at ? new Date(item.deleted_at).toLocaleDateString('en-IN') : '—'}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Deleted By</div>
              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.deleted_by_name || '—'}</div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={onRestore}>Restore</button>
          {isSuperAdmin && (
            <button className="btn btn-danger" onClick={onDelete}>Permanent Delete</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RecycleBinPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [binTab, setBinTab] = useState(() => sessionStorage.getItem('activeTab_RecycleBin') || 'cases'); // cases | inventory | media
  useEffect(() => { sessionStorage.setItem('activeTab_RecycleBin', binTab); }, [binTab]);
  const [items, setItems] = useState([]);
  const [invItems, setInvItems] = useState([]);
  const [mediaItems, setMediaItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailsModal, setDetailsModal] = useState(null); // { type: 'cases'|'inventory'|'media', item: {...} }
  
  // Pagination states
  const [casesPage, setCasesPage] = useState(1);
  const [invPage, setInvPage] = useState(1);
  const [mediaPage, setMediaPage] = useState(1);
  const itemsPerPage = 15;
  
  const isSuperAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const loadCases = useCallback(async () => {
    try { const d = await binApi.list(); setItems(d.items || []); }
    catch { setItems([]); }
  }, []);

  const loadInventory = useCallback(async () => {
    try {
      const d = await inventoryApi.listRecycleBin({ limit: 200 });
      setInvItems(d.items || []);
    } catch { setInvItems([]); }
  }, []);

  const loadMedia = useCallback(async () => {
    try {
      const d = await mediaRecycleApi.list({ limit: 200 });
      setMediaItems(d.items || []);
    } catch { setMediaItems([]); }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    if (binTab === 'cases') await loadCases();
    else if (binTab === 'inventory') await loadInventory();
    else await loadMedia();
    setLoading(false);
  }, [binTab, loadCases, loadInventory, loadMedia]);

  useEffect(() => { load(); }, [load]);

  const triggerRestore = (item, type) => {
    setRestoreTarget({
      id: item.id,
      name: item.case_number || item.model || item.name || 'item',
      type
    });
  };

  const triggerDelete = (item, type) => {
    setDeleteTarget({
      id: item.id,
      name: item.case_number || item.model || item.name || 'item',
      type
    });
  };

  const showDetails = (item, type) => {
    setDetailsModal({ type, item });
  };

  const handleDetailsRestore = () => {
    if (!detailsModal) return;
    triggerRestore(detailsModal.item, detailsModal.type);
    setDetailsModal(null);
  };

  const handleDetailsDelete = () => {
    if (!detailsModal) return;
    triggerDelete(detailsModal.item, detailsModal.type);
    setDetailsModal(null);
  };

  const executeRestore = async () => {
    if (!restoreTarget) return;
    const { id, type } = restoreTarget;
    try {
      if (type === 'cases') {
        const result = await binApi.restore(id);
        if (result?.error) throw new Error(result.error);
        if (!result?.message) throw new Error('Failed to restore case');
        alert('Case restored successfully.');
      } else if (type === 'inventory') {
        const result = await inventoryApi.restore(id);
        if (result?.error) throw new Error(result.error);
        alert('Stock item restored.');
      } else if (type === 'media') {
        const result = await mediaRecycleApi.restore(id);
        if (result?.error) throw new Error(result.error);
        alert('Media restored to original location.');
      }
      setRestoreTarget(null);
      await load();
    } catch (e) {
      alert(e.message || 'Failed to restore item');
      setRestoreTarget(null);
    }
  };

  const executePermanentDelete = async () => {
    if (!deleteTarget) return;
    const { id, type } = deleteTarget;
    try {
      if (type === 'cases') {
        const result = await binApi.permanentDelete(id);
        if (result?.error) throw new Error(result.error);
        if (!result?.message && !result?.deleted_id) throw new Error('Failed to delete case');
        alert('Case permanently deleted.');
      } else if (type === 'inventory') {
        const result = await inventoryApi.permanentDelete(id);
        if (result?.error) throw new Error(result.error);
        alert('Stock item permanently deleted.');
      } else if (type === 'media') {
        const result = await mediaRecycleApi.permanentDelete(id);
        if (result?.error) throw new Error(result.error);
        alert('Media permanently deleted.');
      }
      setDeleteTarget(null);
      await load();
    } catch (e) {
      alert(e.message || 'Failed to delete item');
      setDeleteTarget(null);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div className="page-header-left">
          <h2>Recycle Bin</h2>
          <p>Soft-deleted cases, inventory stock, and media files — restore or permanently remove.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/inventory')}>Inventory</button>
      </div>

      <div className="tabs" style={{ marginBottom: 16, flexShrink: 0 }}>
        <button type="button" className={`tab-btn ${binTab === 'cases' ? 'active' : ''}`} onClick={() => setBinTab('cases')}>Cases</button>
        <button type="button" className={`tab-btn ${binTab === 'inventory' ? 'active' : ''}`} onClick={() => setBinTab('inventory')}>Inventory Stock</button>
        <button type="button" className={`tab-btn ${binTab === 'media' ? 'active' : ''}`} onClick={() => setBinTab('media')}>Media{mediaItems.length ? ` (${mediaItems.length})` : ''}</button>
      </div>

      {binTab === 'cases' && (
      <div className="alert alert-info" style={{ marginBottom: 16, flexShrink: 0 }}>
        <span className="alert-icon"></span>
        <span>Restore items to return them to active workflows. Permanent deletion requires admin confirmation.</span>
      </div>
      )}

      {loading ? (
        <div style={{ display:'flex',justifyContent:'center',padding:60 }}><div className="spinner" style={{ width:32,height:32 }} /></div>
      ) : binTab === 'cases' && items.length === 0 ? (
        <div className="empty-state" style={{ padding:80 }}>
          <div className="empty-icon"></div>
          <div className="empty-title">No deleted cases</div>
          <div className="empty-desc">Deleted cases appear here and can be restored easily.</div>
        </div>
      ) : binTab === 'inventory' && invItems.length === 0 ? (
        <div className="empty-state" style={{ padding:80 }}>
          <div className="empty-icon"></div>
          <div className="empty-title">No deleted stock items</div>
          <div className="empty-desc">Delete items from Inventory → Stock to move them here. Manage fully in Inventory → Recycle Bin tab.</div>
        </div>
      ) : binTab === 'media' && mediaItems.length === 0 ? (
        <div className="empty-state" style={{ padding:80 }}>
          <div className="empty-icon"></div>
          <div className="empty-title">No deleted media</div>
          <div className="empty-desc">Deleted files from cases, solutions, and inventory appear here for recovery.</div>
        </div>
      ) : binTab === 'media' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
          <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>File</th><th>Type</th><th>Source</th><th>Location</th><th>Deleted By</th><th>Deleted</th><th>Actions</th></tr></thead>
              <tbody>
                {mediaItems.slice((mediaPage - 1) * itemsPerPage, mediaPage * itemsPerPage).map(item => (
                  <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => showDetails(item, 'media')}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{fileTypeIcon(item)}</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{item.name}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{formatFileSize(item.size)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-xs text-muted">{item.mime_type || '—'}</td>
                    <td><span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 999, background: 'rgba(0,212,255,0.1)', color: 'var(--accent-primary)' }}>{item.source_label}</span></td>
                    <td className="text-xs">{item.parent_label || item.parent_id}</td>
                    <td className="text-xs text-muted">{item.deleted_by_name || '—'}</td>
                    <td className="text-xs text-muted">{daysAgo(item.deleted_at)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => triggerRestore(item, 'media')}>Restore</button>
                        {isSuperAdmin && (
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => triggerDelete(item, 'media')}>Delete Permanently</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {mediaItems.length > itemsPerPage && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <button 
                className="btn btn-sm btn-ghost" 
                onClick={() => setMediaPage(p => Math.max(1, p - 1))} 
                disabled={mediaPage === 1}
              >← Previous</button>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Page {mediaPage} of {Math.ceil(mediaItems.length / itemsPerPage)} ({mediaItems.length} items)
              </span>
              <button 
                className="btn btn-sm btn-ghost" 
                onClick={() => setMediaPage(p => Math.min(Math.ceil(mediaItems.length / itemsPerPage), p + 1))} 
                disabled={mediaPage >= Math.ceil(mediaItems.length / itemsPerPage)}
              >Next →</button>
            </div>
          )}
        </div>
      ) : binTab === 'inventory' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
          <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Stock ID</th><th>Category</th><th>Model</th><th>PCB #</th><th>Deleted By</th><th>Deleted</th><th>Actions</th></tr></thead>
              <tbody>
                {invItems.slice((invPage - 1) * itemsPerPage, invPage * itemsPerPage).map(item => {
                  const cat = getCategoryMeta(item.ui_category || item.category);
                  return (
                    <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => showDetails(item, 'inventory')}>
                      <td className="font-mono text-xs">{item.stock_number || item.sku || '—'}</td>
                      <td>{cat.icon} {cat.label}</td>
                      <td>{item.model || item.name || '—'}</td>
                      <td className="font-mono text-xs">{item.pcb_number || '—'}</td>
                      <td className="text-xs text-muted">{item.deleted_by_name || '—'}</td>
                      <td className="text-xs text-muted">{item.deleted_at ? daysAgo(item.deleted_at) : '—'}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => triggerRestore(item, 'inventory')}>Restore</button>
                          {isSuperAdmin && (
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => triggerDelete(item, 'inventory')}>Delete Permanently</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {invItems.length > itemsPerPage && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <button 
                className="btn btn-sm btn-ghost" 
                onClick={() => setInvPage(p => Math.max(1, p - 1))} 
                disabled={invPage === 1}
              >← Previous</button>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Page {invPage} of {Math.ceil(invItems.length / itemsPerPage)} ({invItems.length} items)
              </span>
              <button 
                className="btn btn-sm btn-ghost" 
                onClick={() => setInvPage(p => Math.min(Math.ceil(invItems.length / itemsPerPage), p + 1))} 
                disabled={invPage >= Math.ceil(invItems.length / itemsPerPage)}
              >Next →</button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
          <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Case #</th><th>Client</th><th>Device</th><th>Stage</th><th>Status</th><th>Deleted By</th><th>Deleted</th><th>Actions</th></tr></thead>
              <tbody>
                {items.slice((casesPage - 1) * itemsPerPage, casesPage * itemsPerPage).map(item => (
                  <tr key={item.id} style={{ cursor: 'pointer', opacity: 0.85 }} onClick={() => showDetails(item, 'cases')}>
                    <td><span className="font-mono text-xs" style={{ color:'var(--text-muted)' }}>{item.case_number}</span></td>
                    <td><div style={{ fontWeight:600 }}>{item.client_name}</div></td>
                    <td className="text-xs">{[item.device_type,item.brand,item.model].filter(Boolean).join(' · ') || '—'}</td>
                    <td><span style={{ fontSize:'0.68rem',padding:'2px 7px',borderRadius:999,background:'rgba(100,116,139,0.12)',color:'#94a3b8',fontFamily:'var(--font-mono)' }}>{item.stage || 'unknown'}</span></td>
                    <td><span style={{ fontSize:'0.68rem',padding:'2px 7px',borderRadius:999,background:'rgba(100,116,139,0.12)',color:'#94a3b8',fontFamily:'var(--font-mono)' }}>{item.status || 'unknown'}</span></td>
                    <td className="text-xs text-muted">{item.deleted_by_name || 'Admin'}</td>
                    <td className="text-xs text-muted">{daysAgo(item.deleted_at)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => triggerRestore(item, 'cases')}> Restore</button>
                        {isSuperAdmin && <button className="btn btn-danger btn-sm" onClick={() => triggerDelete(item, 'cases')} style={{ fontSize: '0.72rem' }}> Delete</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {items.length > itemsPerPage && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <button 
                className="btn btn-sm btn-ghost" 
                onClick={() => setCasesPage(p => Math.max(1, p - 1))} 
                disabled={casesPage === 1}
              >← Previous</button>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Page {casesPage} of {Math.ceil(items.length / itemsPerPage)} ({items.length} items)
              </span>
              <button 
                className="btn btn-sm btn-ghost" 
                onClick={() => setCasesPage(p => Math.min(Math.ceil(items.length / itemsPerPage), p + 1))} 
                disabled={casesPage >= Math.ceil(items.length / itemsPerPage)}
              >Next →</button>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 24, borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '1.5rem' }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--status-danger)', marginBottom: 4 }}>Permanent Deletion Policy</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Permanent deletion is available to <strong>Admin</strong> and <strong>Super Admin</strong> accounts only.
              This action cannot be undone — you must type DELETE to confirm.
              This policy ensures audit trails and prevents accidental data loss.
            </div>
          </div>
        </div>
      </div>

      {detailsModal && detailsModal.type === 'cases' && (
        <CaseDetailsModal
          item={detailsModal.item}
          onRestore={handleDetailsRestore}
          onDelete={handleDetailsDelete}
          onClose={() => setDetailsModal(null)}
          isSuperAdmin={isSuperAdmin}
        />
      )}
      {detailsModal && detailsModal.type === 'inventory' && (
        <InventoryDetailsModal
          item={detailsModal.item}
          onRestore={handleDetailsRestore}
          onDelete={handleDetailsDelete}
          onClose={() => setDetailsModal(null)}
          isSuperAdmin={isSuperAdmin}
        />
      )}
      {detailsModal && detailsModal.type === 'media' && (
        <MediaDetailsModal
          item={detailsModal.item}
          onRestore={handleDetailsRestore}
          onDelete={handleDetailsDelete}
          onClose={() => setDetailsModal(null)}
          isSuperAdmin={isSuperAdmin}
        />
      )}

      {restoreTarget && (
        <ConfirmRestoreModal item={restoreTarget} onConfirm={executeRestore} onClose={() => setRestoreTarget(null)} />
      )}
      {deleteTarget && (
        <ConfirmDeleteModal item={deleteTarget} onConfirm={executePermanentDelete} onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
