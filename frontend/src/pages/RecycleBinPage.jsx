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
    <div className="modal-overlay" onClick={onClose}>
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
    <div className="modal-overlay" onClick={onClose}>
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

export default function RecycleBinPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [binTab, setBinTab] = useState('cases'); // cases | inventory | media
  const [items, setItems] = useState([]);
  const [invItems, setInvItems] = useState([]);
  const [mediaItems, setMediaItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
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
        <div className="table-container">
          <table>
            <thead><tr><th>File</th><th>Type</th><th>Source</th><th>Location</th><th>Deleted By</th><th>Deleted</th><th>Actions</th></tr></thead>
            <tbody>
              {mediaItems.map(item => (
                <tr key={item.id}>
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
                  <td>
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
      ) : binTab === 'inventory' ? (
        <div className="table-container">
          <table>
            <thead><tr><th>Stock ID</th><th>Category</th><th>Model</th><th>PCB #</th><th>Deleted By</th><th>Deleted</th><th>Actions</th></tr></thead>
            <tbody>
              {invItems.map(item => {
                const cat = getCategoryMeta(item.ui_category || item.category);
                return (
                  <tr key={item.id}>
                    <td className="font-mono text-xs">{item.stock_number || item.sku || '—'}</td>
                    <td>{cat.icon} {cat.label}</td>
                    <td>{item.model || item.name || '—'}</td>
                    <td className="font-mono text-xs">{item.pcb_number || '—'}</td>
                    <td className="text-xs text-muted">{item.deleted_by_name || '—'}</td>
                    <td className="text-xs text-muted">{item.deleted_at ? daysAgo(item.deleted_at) : '—'}</td>
                    <td>
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
      ) : (
        <div className="table-container">
          <table>
            <thead><tr><th>Case #</th><th>Client</th><th>Device</th><th>Status at Deletion</th><th>Deleted By</th><th>Deleted</th></tr></thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ opacity:0.85 }}>
                  <td><span className="font-mono text-xs" style={{ color:'var(--text-muted)' }}>{item.case_number}</span></td>
                  <td><div style={{ fontWeight:600 }}>{item.client_name}</div></td>
                  <td className="text-xs">{[item.device_type,item.brand,item.model].filter(Boolean).join(' · ')}</td>
                  <td><span style={{ fontSize:'0.68rem',padding:'2px 7px',borderRadius:999,background:'rgba(100,116,139,0.12)',color:'#94a3b8',fontFamily:'var(--font-mono)' }}>{item.status}</span></td>
                  <td className="text-xs text-muted">{item.deleted_by_name || 'Admin'}</td>
                  <td className="text-xs text-muted" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span>{daysAgo(item.deleted_at)}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => triggerRestore(item, 'cases')}> Restore</button>
                      {isSuperAdmin && <button className="btn btn-danger btn-sm" onClick={() => triggerDelete(item, 'cases')} style={{ fontSize: '0.72rem' }}> Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {restoreTarget && (
        <ConfirmRestoreModal item={restoreTarget} onConfirm={executeRestore} onClose={() => setRestoreTarget(null)} />
      )}
      {deleteTarget && (
        <ConfirmDeleteModal item={deleteTarget} onConfirm={executePermanentDelete} onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
