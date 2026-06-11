import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { modelsApi } from '../services/api';
import { useAuth } from '../store/AuthContext';

const INTERFACES = ['SATA', 'NVMe', 'SAS', 'IDE', 'USB', 'PCIe', 'mSATA', 'M2'];
const FORM_FACTORS = ['3.5', '2.5', 'M.2', 'mSATA', 'U.2', 'PCIe_card'];
const RISK_LEVELS = ['low', 'medium', 'high', 'critical'];
const NAND_TYPES = ['SLC', 'MLC', 'TLC', 'QLC', 'PLC'];

function NewModelModal({ brands, onClose, onCreated }) {
  const [form, setForm] = useState({
    model_number: '',
    capacity_gb: '',
    interface: 'SATA',
    form_factor: '3.5',
    risk_level: 'medium',
    brand_id: brands[0]?.id || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Determine if it's SSD (no RPM) based on interface
  const isSSD = ['NVMe', 'PCIe', 'mSATA', 'M2'].includes(form.interface) ||
    ['M.2', 'mSATA', 'U.2', 'PCIe_card'].includes(form.form_factor);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.brand_id || !form.model_number || !form.capacity_gb) {
      setError('Brand, Model Number and Capacity are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = {
        ...form,
        capacity_gb: parseInt(form.capacity_gb),
        rpm: form.rpm ? parseInt(form.rpm) : null,
      };
      const created = await modelsApi.create(payload);
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create model');
    } finally {
      setLoading(false);
    }
  };

  const F = ({ label, required, children }) => (
    <div className="form-group">
      <label className="form-label" style={required ? { } : {}}>{label}{required && <span style={{ color: 'var(--status-danger)', marginLeft: 3 }}>*</span>}</label>
      {children}
    </div>
  );

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">💿 Add Storage Model</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && (
            <div className="alert alert-danger" style={{ marginBottom: 16 }}>
              <span className="alert-icon">⚠</span> {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            {/* Basic Info */}
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
              Basic Information
            </div>
            <div className="form-row form-row-2">
              <F label="Brand" required>
                <select className="form-select" value={form.brand_id} onChange={e => setForm({ ...form, brand_id: e.target.value })}>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </F>
              <F label="Model Number" required>
                <input
                  className="form-input"
                  placeholder="e.g. WD10EZEX, ST1000DM010, 860 EVO"
                  value={form.model_number}
                  onChange={e => setForm({ ...form, model_number: e.target.value })}
                />
              </F>
            </div>

            <div className="form-row form-row-3">
              <F label="Series">
                <input className="form-input" placeholder="e.g. Blue, Barracuda" value={form.series || ''} onChange={e => setForm({ ...form, series: e.target.value })} />
              </F>
              <F label="Capacity (GB)" required>
                <input type="number" className="form-input" placeholder="500, 1000, 2000..." min="1" value={form.capacity_gb} onChange={e => setForm({ ...form, capacity_gb: e.target.value })} />
              </F>
              <F label="RPM">
                <input type="number" className="form-input" placeholder="5400, 7200 (blank=SSD)" value={form.rpm || ''} onChange={e => setForm({ ...form, rpm: e.target.value })} disabled={isSSD} />
              </F>
            </div>

            <div className="form-row form-row-3">
              <F label="Interface" required>
                <select className="form-select" value={form.interface} onChange={e => setForm({ ...form, interface: e.target.value })}>
                  {INTERFACES.map(i => <option key={i}>{i}</option>)}
                </select>
              </F>
              <F label="Form Factor" required>
                <select className="form-select" value={form.form_factor} onChange={e => setForm({ ...form, form_factor: e.target.value })}>
                  {FORM_FACTORS.map(f => <option key={f}>{f}</option>)}
                </select>
              </F>
              <F label="NAND Type (SSD only)">
                <select className="form-select" value={form.nand_type || ''} onChange={e => setForm({ ...form, nand_type: e.target.value })} disabled={!isSSD}>
                  <option value="">— (HDD)</option>
                  {NAND_TYPES.map(n => <option key={n}>{n}</option>)}
                </select>
              </F>
            </div>

            {/* Engineering Data */}
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, marginTop: 8, paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
              🔧 Engineering Data
            </div>
            <div className="form-row form-row-2">
              <F label="Controller IC">
                <input className="form-input" placeholder="e.g. Marvell 88i9145, Seagate Moose" value={form.controller_chip || ''} onChange={e => setForm({ ...form, controller_chip: e.target.value })} />
              </F>
              <F label="PCB Number">
                <input className="form-input" placeholder="e.g. 2060-771824-003, 100724095" value={form.pcb_number || ''} onChange={e => setForm({ ...form, pcb_number: e.target.value })} />
              </F>
            </div>
            <div className="form-row form-row-2">
              <F label="Firmware Family">
                <input className="form-input" placeholder="e.g. ABCDE1, CC43, 01.01A01" value={form.firmware_family || ''} onChange={e => setForm({ ...form, firmware_family: e.target.value })} />
              </F>
              <F label="ROM Type">
                <input className="form-input" placeholder="e.g. SPI ROM MX25L1606" value={form.rom_type || ''} onChange={e => setForm({ ...form, rom_type: e.target.value })} />
              </F>
            </div>
            <div className="form-row form-row-2">
              <F label="Platter Count">
                <input type="number" className="form-input" placeholder="1, 2, 3..." min="1" max="10" value={form.platter_count || ''} onChange={e => setForm({ ...form, platter_count: parseInt(e.target.value) || '' })} disabled={isSSD} />
              </F>
              <F label="Risk Level">
                <select className="form-select" value={form.risk_level} onChange={e => setForm({ ...form, risk_level: e.target.value })}>
                  {RISK_LEVELS.map(r => <option key={r} value={r}>{r.toUpperCase()} - {r === 'low' ? 'Routine recovery' : r === 'medium' ? 'Standard care' : r === 'high' ? 'Clean room likely' : 'Critical — specialist only'}</option>)}
                </select>
              </F>
            </div>

            {/* Notes */}
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, marginTop: 8, paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
              📝 Engineer Notes
            </div>
            <div className="form-row form-row-2">
              <F label="✅ DO Notes">
                <textarea className="form-textarea" placeholder="Best practices for this model..." value={form.do_notes || ''} onChange={e => setForm({ ...form, do_notes: e.target.value })} />
              </F>
              <F label="🚫 DON'T Notes">
                <textarea className="form-textarea" placeholder="Avoid these mistakes with this model..." value={form.dont_notes || ''} onChange={e => setForm({ ...form, dont_notes: e.target.value })} />
              </F>
            </div>
            <F label="Common Failures (comma-separated)">
              <input className="form-input" placeholder="Head crash, Firmware corruption, PCB failure..." value={form.common_failures_text || ''} onChange={e => setForm({ ...form, common_failures_text: e.target.value })} />
            </F>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={loading || !form.brand_id || !form.model_number || !form.capacity_gb}
            onClick={handleSubmit}
          >
            {loading
              ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Adding...</>
              : '+ Add to Intelligence DB'
            }
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StorageModelsPage() {
  const navigate = useNavigate();
  const { canAccess } = useAuth();
  const [models, setModels] = useState([]);
  const [brands, setBrands] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', brand_id: '', interface: '', risk_level: '' });
  const [page, setPage] = useState(1);
  const [showNewModel, setShowNewModel] = useState(false);

  useEffect(() => { modelsApi.brands().then(setBrands).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 25, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
      const d = await modelsApi.list(params);
      setModels(d.models || []);
      setPagination(d.pagination || {});
    } catch {} finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const handleModelCreated = (newModel) => {
    // Add to top of list immediately
    setModels(prev => [newModel, ...prev]);
    setPagination(prev => ({ ...prev, total: (prev.total || 0) + 1 }));
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2>HDD / SSD Intelligence Database</h2>
          <p>Engineering-level storage device intelligence — {pagination.total || 0} models</p>
        </div>
        {canAccess('senior_engineer') && (
          <button className="btn btn-primary" onClick={() => setShowNewModel(true)}>+ Add Model</button>
        )}
      </div>

      <div className="filters-bar">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder="Search model, controller, firmware..."
            value={filters.search}
            onChange={e => { setFilters({ ...filters, search: e.target.value }); setPage(1); }}
          />
        </div>
        <select
          className="form-select"
          style={{ width: 'auto', fontSize: '0.8rem', padding: '7px 12px' }}
          value={filters.brand_id}
          onChange={e => { setFilters({ ...filters, brand_id: e.target.value }); setPage(1); }}
        >
          <option value="">All Brands</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select
          className="form-select"
          style={{ width: 'auto', fontSize: '0.8rem', padding: '7px 12px' }}
          value={filters.interface}
          onChange={e => { setFilters({ ...filters, interface: e.target.value }); setPage(1); }}
        >
          <option value="">All Interfaces</option>
          {INTERFACES.map(i => <option key={i}>{i}</option>)}
        </select>
        <select
          className="form-select"
          style={{ width: 'auto', fontSize: '0.8rem', padding: '7px 12px' }}
          value={filters.risk_level}
          onChange={e => { setFilters({ ...filters, risk_level: e.target.value }); setPage(1); }}
        >
          <option value="">All Risk Levels</option>
          {RISK_LEVELS.map(r => <option key={r}>{r}</option>)}
        </select>
        {(filters.search || filters.brand_id || filters.interface || filters.risk_level) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilters({ search: '', brand_id: '', interface: '', risk_level: '' }); setPage(1); }}>
            ✕ Clear
          </button>
        )}
      </div>

      <div className="table-container">
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Model Number</th>
                  <th>Capacity</th>
                  <th>Interface</th>
                  <th>Controller IC</th>
                  <th>PCB #</th>
                  <th>Firmware Family</th>
                  <th>Risk</th>
                  <th>Cases</th>
                  <th>Success %</th>
                </tr>
              </thead>
              <tbody>
                {models.map(m => (
                  <tr key={m.id} onClick={() => navigate(`/models/${m.id}`)}>
                    <td><span style={{ fontWeight: 700 }}>{m.brand_name}</span></td>
                    <td>
                      <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--accent-primary)' }}>
                        {m.model_number}
                      </span>
                    </td>
                    <td className="text-xs font-mono">{m.capacity_gb} GB</td>
                    <td><span className="badge badge-inspection">{m.interface}</span></td>
                    <td className="font-mono text-xs">{m.controller_chip || '—'}</td>
                    <td className="font-mono text-xs">{m.pcb_number || '—'}</td>
                    <td className="font-mono text-xs text-muted">{m.firmware_family || '—'}</td>
                    <td>
                      {m.risk_level && (
                        <span className={`badge badge-risk-${m.risk_level}`}>{m.risk_level}</span>
                      )}
                    </td>
                    <td className="font-mono text-xs text-muted">{m.case_count || 0}</td>
                    <td>
                      {m.success_rate != null && (
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700,
                          color: m.success_rate >= 80 ? 'var(--status-success)' : m.success_rate >= 50 ? 'var(--status-warning)' : 'var(--status-danger)'
                        }}>
                          {Math.round(m.success_rate)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {!models.length && (
                  <tr>
                    <td colSpan={10}>
                      <div className="empty-state">
                        <div className="empty-icon">💿</div>
                        <div className="empty-title">No models in database</div>
                        <div className="empty-desc">
                          {canAccess('senior_engineer')
                            ? 'Click "+ Add Model" to add storage models to your intelligence database'
                            : 'No storage models added yet'}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        {pagination.pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: 16, borderTop: '1px solid var(--border-subtle)' }}>
            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span className="text-xs text-muted font-mono">Page {page} of {pagination.pages}</span>
            <button className="btn btn-secondary btn-sm" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}
      </div>

      {showNewModel && brands.length > 0 && (
        <NewModelModal
          brands={brands}
          onClose={() => setShowNewModel(false)}
          onCreated={handleModelCreated}
        />
      )}
    </div>
  );
}
