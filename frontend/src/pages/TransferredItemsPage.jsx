import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { transferredItemsApi } from '../services/api';

const INV_CAT_MAP = Object.fromEntries(
  [
    { key: 'wd_35', label: 'WD 3.5"', icon: '💿' },
    { key: 'wd_25', label: 'WD 2.5"', icon: '💽' },
    { key: 'seagate_35', label: 'Seagate 3.5"', icon: '💿' },
    { key: 'seagate_25', label: 'Seagate 2.5"', icon: '💽' },
    { key: 'others_35', label: 'Others 3.5"', icon: '💿' },
    { key: 'others_25', label: 'Others 2.5"', icon: '💽' },
  ].map(c => [c.key, c])
);

const TRANSFER_ROW_STYLE = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-subtle)',
};

function parseJson(val) {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return {};
  }
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function TransferredItemsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [revokingId, setRevokingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await transferredItemsApi.list({ page, limit: 40, search: search || undefined });
      setItems(d.items || []);
      setPagination(d.pagination || {});
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRevoke = async (row) => {
    if (!window.confirm(`Revoke transfer for "${row.stock_number || row.model || 'item'}"? This will move it back to normal stock.`)) return;
    setRevokingId(row.id);
    try {
      await transferredItemsApi.revoke(row.id);
      await load();
    } catch (err) {
      alert(`Revoke failed: ${err.message}`);
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div className="page-header-left">
          <h2>Transferred Items</h2>
          <p>Transferred stock records stored in the database · {pagination.total || 0} records</p>
        </div>
      </div>

      <div className="filters-bar" style={{ marginBottom: 16 }}>
        <div className="search-bar" style={{ width: '100%', maxWidth: 420 }}>
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder="Search stock#, serial, case#, model…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <div className="spinner" style={{ width: 28, height: 28 }} />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Case #</th>
                  <th>Stock #</th>
                  <th>Category</th>
                  <th>Company</th>
                  <th>Model</th>
                  <th>Serial</th>
                  <th>Transferred By</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(row => {
                  const cat = INV_CAT_MAP[row.ui_category] || { label: row.ui_category || '—', icon: '📦' };
                  const snap = parseJson(row.field_snapshot);
                  return (
                    <tr key={row.id} style={TRANSFER_ROW_STYLE}>
                      <td className="text-xs text-muted">{formatDate(row.created_at)}</td>
                      <td>
                        {row.case_id ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: 0, fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}
                            onClick={() => navigate(`/cases/${row.case_id}`)}
                          >
                            {row.case_number || row.case_id.slice(0, 8)}
                          </button>
                        ) : '—'}
                      </td>
                      <td className="font-mono text-accent" style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                        {row.stock_number || '—'}
                        <div style={{ marginTop: 4 }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: 'rgba(245, 158, 11, 0.14)',
                              color: '#f59e0b',
                              fontSize: '0.66rem',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                            }}
                          >
                            Transferred
                          </span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                          {cat.icon} {cat.label}
                        </span>
                      </td>
                      <td>{row.company || row.brand || '—'}</td>
                      <td className="font-mono text-xs">{row.model || snap.model || '—'}</td>
                      <td className="font-mono text-xs text-muted">{row.serial_number || snap.serial_number || '—'}</td>
                      <td className="text-xs">{row.transferred_by_name || '—'}</td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '3px 8px',
                            borderRadius: 999,
                            background: 'rgba(245, 158, 11, 0.12)',
                            color: '#f59e0b',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            textTransform: 'uppercase',
                          }}
                        >
                          Transferred
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {row.inventory_item_id && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => navigate(`/inventory/${row.inventory_item_id}`)}
                            >
                              → Stock
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={revokingId === row.id}
                            onClick={() => handleRevoke(row)}
                          >
                            {revokingId === row.id ? 'Revoking…' : 'Revoke'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!items.length && (
                  <tr>
                    <td colSpan={10}>
                      <div className="empty-state">
                        <div className="empty-icon">📤</div>
                        <div className="empty-title">No transferred items yet</div>
                        <div className="empty-desc">Transferred items will appear here after you click Transfer in Inventory.</div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagination.pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            ← Prev
          </button>
          <span className="text-sm text-muted">Page {page} of {pagination.pages}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
