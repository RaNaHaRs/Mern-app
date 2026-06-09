import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { casesApi } from '../services/api';
import { fieldConfigApi } from '../services/fieldConfigApi';
import { useAuth } from '../store/AuthContext';
import NewCaseModal from '../components/NewCaseModal';
import KanbanBoard from './KanbanBoard';

const DEFAULT_STAGES = ['received','inspection','diagnosis','quotation','approved','rejected','recovery_in_progress','imaging','data_extraction','verification','completed','delivered','failed'];
const PRIORITIES = { 1:'CRITICAL', 2:'HIGH', 3:'MEDIUM', 4:'LOW', 5:'MINIMAL' };
const DEFAULT_FAILURE_TYPES = [
  'logical','firmware','electrical','mechanical','head_crash','pcb_damage',
  'motor_failure','bad_sectors','water_damage','fire_damage','unknown'
];

function getSettings(key, def) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v && v.length ? v : def; } catch { return def; }
}

function DeleteConfirmModal({ selectedCount, onConfirm, onCancel }) {
  const [loading, setLoading] = useState(false);
  const handleConfirm = async () => {
    setLoading(true);
    try { await onConfirm(); } finally { setLoading(false); }
  };
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Move {selectedCount} case{selectedCount > 1 ? 's' : ''} to Recycle Bin</h3>
          <button className="btn btn-ghost btn-icon" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: 16, color: 'var(--text-primary)' }}>
            This will soft-delete the selected case{selectedCount > 1 ? 's' : ''}. You can restore them from the Recycle Bin later.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="btn btn-danger" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Moving...' : `Move ${selectedCount} to Recycle Bin`}
          </button>
        </div>
      </div>
    </div>
  );
}

const EDIT_TABS = ['Client', 'Device', 'Problem', 'Commercial'];

const DEFAULT_SYMPTOMS = ['not_detected','clicking','slow','dead','beeping','grinding','pcb_burnt','corrupted','bad_sectors','head_crash','water_damage','not_spinning','read_errors'];

function EditCaseModal({ caseData, onClose, onSaved }) {
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState({
    // Client / scheduling
    priority: caseData.priority || 3,
    deadline_at: caseData.deadline_at ? caseData.deadline_at.slice(0, 16) : '',
    received_at: caseData.received_at ? caseData.received_at.slice(0, 16) : '',
    reminder_days: caseData.reminder_days || 4,
    assigned_engineer: caseData.assigned_engineer || '',
    // Device
    device_brand: caseData.device_brand || '',
    device_model: caseData.device_model || '',
    serial_number: caseData.serial_number || '',
    capacity_gb: caseData.capacity_gb || '',
    interface: caseData.interface || '',
    form_factor: caseData.form_factor || '',
    // Problem
    failure_type: caseData.failure_type || '',
    symptoms: Array.isArray(caseData.symptoms) ? caseData.symptoms : [],
    symptom_notes: caseData.symptom_notes || '',
    initial_diagnosis: caseData.initial_diagnosis || '',
    final_diagnosis: caseData.final_diagnosis || '',
    internal_notes: caseData.internal_notes || '',
    // Recovery progress
    recovery_progress_pct: caseData.recovery_progress_pct || '',
    data_recovered_gb: caseData.data_recovered_gb || '',
    total_data_gb: caseData.total_data_gb || '',
    imaging_tool: caseData.imaging_tool || '',
    recovery_tool: caseData.recovery_tool || '',
    // Commercial
    transfer_to_client: caseData.transfer_to_client || false,
  });
  const [engineers, setEngineers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleSymptom = (s) => set('symptoms', form.symptoms.includes(s) ? form.symptoms.filter(x => x !== s) : [...form.symptoms, s]);

  useEffect(() => {
    import('../services/api').then(({ usersApi }) => {
      usersApi.list().then(d => setEngineers(d.users || (Array.isArray(d) ? d : []))).catch(() => {});
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        deadline_at: form.deadline_at || null,
        received_at: form.received_at || null,
        recovery_progress_pct: form.recovery_progress_pct !== '' ? Number(form.recovery_progress_pct) : null,
        data_recovered_gb: form.data_recovered_gb !== '' ? Number(form.data_recovered_gb) : null,
        total_data_gb: form.total_data_gb !== '' ? Number(form.total_data_gb) : null,
        capacity_gb: form.capacity_gb !== '' ? Number(form.capacity_gb) : null,
      };
      await casesApi.update(caseData.id, payload);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const failureTypes = getSettings('custom_failure_types', DEFAULT_FAILURE_TYPES);
  const symptoms = getSettings('custom_symptoms', DEFAULT_SYMPTOMS);
  const interfaces = getSettings('custom_interfaces', ['SATA','NVMe','SAS','IDE','USB','PCIe','M2','eSATA']);

  const inp = (label, key, type = 'text', props = {}) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label" style={{ fontSize: '0.78rem' }}>{label}</label>
      <input className="form-input" type={type} value={form[key]} onChange={e => set(key, e.target.value)} style={{ fontSize: '0.82rem' }} {...props} />
    </div>
  );

  const tabContent = [
    // Tab 0: Client / Scheduling
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)', fontSize: '0.82rem' }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{caseData.first_name} {caseData.last_name}</div>
        <div style={{ color: 'var(--text-muted)' }}>{caseData.phone} {caseData.email ? `· ${caseData.email}` : ''} {caseData.company ? `· ${caseData.company}` : ''}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>Client cannot be changed after case creation.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {inp('Received At', 'received_at', 'datetime-local')}
        {inp('Deadline / SLA', 'deadline_at', 'datetime-local')}
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: '0.78rem' }}>Priority</label>
          <select className="form-select" value={form.priority} onChange={e => set('priority', parseInt(e.target.value))} style={{ fontSize: '0.82rem' }}>
            {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {inp('Stale Reminder (days)', 'reminder_days', 'number', { min: 1, max: 90 })}
        <div className="form-group" style={{ margin: 0, gridColumn: '1/-1' }}>
          <label className="form-label" style={{ fontSize: '0.78rem' }}>Assigned Engineer</label>
          <select className="form-select" value={form.assigned_engineer} onChange={e => set('assigned_engineer', e.target.value)} style={{ fontSize: '0.82rem' }}>
            <option value="">Unassigned</option>
            {engineers.map(eng => <option key={eng.id} value={eng.id}>{eng.full_name || eng.username} ({(eng.role || '').replace(/_/g, ' ')})</option>)}
          </select>
        </div>
      </div>
    </div>,

    // Tab 1: Device
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {inp('Device Brand', 'device_brand')}
        {inp('Device Model', 'device_model')}
        {inp('Serial Number', 'serial_number')}
        {inp('Capacity (GB)', 'capacity_gb', 'number', { min: 0 })}
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: '0.78rem' }}>Interface</label>
          <select className="form-select" value={form.interface} onChange={e => set('interface', e.target.value)} style={{ fontSize: '0.82rem' }}>
            <option value="">Select...</option>
            {interfaces.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: '0.78rem' }}>Form Factor</label>
          <select className="form-select" value={form.form_factor} onChange={e => set('form_factor', e.target.value)} style={{ fontSize: '0.82rem' }}>
            <option value="">Select...</option>
            {['2.5"','3.5"','M.2','PCIe Card','Other'].map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10 }}>Recovery Progress</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {inp('Progress (%)', 'recovery_progress_pct', 'number', { min: 0, max: 100 })}
          {inp('Data Recovered (GB)', 'data_recovered_gb', 'number', { min: 0 })}
          {inp('Total Data (GB)', 'total_data_gb', 'number', { min: 0 })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          {inp('Imaging Tool', 'imaging_tool')}
          {inp('Recovery Tool', 'recovery_tool')}
        </div>
      </div>
    </div>,

    // Tab 2: Problem
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label" style={{ fontSize: '0.78rem' }}>Failure Type</label>
        <select className="form-select" value={form.failure_type} onChange={e => set('failure_type', e.target.value)} style={{ fontSize: '0.82rem' }}>
          <option value="">Select...</option>
          {failureTypes.map(f => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
        </select>
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label" style={{ fontSize: '0.78rem' }}>Symptoms</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {symptoms.map(s => {
            const on = form.symptoms.includes(s);
            return (
              <button key={s} type="button" onClick={() => toggleSymptom(s)}
                style={{ padding: '4px 10px', borderRadius: 20, border: `1px solid ${on ? 'var(--accent-primary)' : 'var(--border-default)'}`, background: on ? 'var(--accent-glow)' : 'transparent', color: on ? 'var(--accent-primary)' : 'var(--text-muted)', fontSize: '0.72rem', cursor: 'pointer', fontWeight: on ? 700 : 400 }}>
                {s.replace(/_/g, ' ')}
              </button>
            );
          })}
        </div>
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label" style={{ fontSize: '0.78rem' }}>Problem Description / Symptom Notes</label>
        <textarea className="form-input" rows={3} value={form.symptom_notes} onChange={e => set('symptom_notes', e.target.value)} style={{ resize: 'vertical', fontSize: '0.82rem' }} />
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label" style={{ fontSize: '0.78rem' }}>Initial Diagnosis</label>
        <textarea className="form-input" rows={2} value={form.initial_diagnosis} onChange={e => set('initial_diagnosis', e.target.value)} style={{ resize: 'vertical', fontSize: '0.82rem' }} />
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label" style={{ fontSize: '0.78rem' }}>Final Diagnosis</label>
        <textarea className="form-input" rows={2} value={form.final_diagnosis} onChange={e => set('final_diagnosis', e.target.value)} style={{ resize: 'vertical', fontSize: '0.82rem' }} />
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label" style={{ fontSize: '0.78rem' }}>Internal Notes</label>
        <textarea className="form-input" rows={2} value={form.internal_notes} onChange={e => set('internal_notes', e.target.value)} style={{ resize: 'vertical', fontSize: '0.82rem' }} />
      </div>
    </div>,

    // Tab 3: Commercial
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        Quotation and payment amounts are managed from the case detail page.
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label" style={{ fontSize: '0.78rem' }}>Transfer to Client</label>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          {[['Yes', true], ['No', false]].map(([label, val]) => (
            <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', border: `1px solid ${form.transfer_to_client === val ? 'var(--accent-primary)' : 'var(--border-default)'}`, borderRadius: 8, cursor: 'pointer', background: form.transfer_to_client === val ? 'var(--accent-glow)' : 'transparent', fontSize: '0.82rem', fontWeight: form.transfer_to_client === val ? 700 : 400, color: form.transfer_to_client === val ? 'var(--accent-primary)' : 'var(--text-secondary)', userSelect: 'none' }}>
              <input type="radio" style={{ display: 'none' }} checked={form.transfer_to_client === val} onChange={() => set('transfer_to_client', val)} />
              {label}
            </label>
          ))}
        </div>
      </div>
    </div>,
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Edit Case — {caseData.case_number}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', padding: '0 24px' }}>
          {EDIT_TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              style={{ padding: '10px 16px', fontSize: '0.8rem', fontWeight: tab === i ? 700 : 400, color: tab === i ? 'var(--accent-primary)' : 'var(--text-muted)', background: 'none', border: 'none', borderBottom: `2px solid ${tab === i ? 'var(--accent-primary)' : 'transparent'}`, cursor: 'pointer', marginBottom: -1 }}>
              {t}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ margin: '12px 24px 0', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: '0.82rem' }}>
            {error}
          </div>
        )}

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {tabContent[tab]}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CasesPage() {
  const navigate = useNavigate();
  const { canAccess, hasPermission, user } = useAuth();
  const [cases, setCases] = useState([]);
  const [viewMode, setViewMode] = useState('list');
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [showNewCase, setShowNewCase] = useState(false);
  const [filters, setFilters] = useState({ stage: '', search: '', priority: '', failure_type: '' });
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingCase, setEditingCase] = useState(null);
  const [singleDeleteId, setSingleDeleteId] = useState(null);

  const canDeleteCases = hasPermission('cases', 'delete');
  const canEditCases = hasPermission('cases', 'edit') || canAccess('staff');

  const checkStale = (c) => {
    if (['delivered','failed','completed','rejected'].includes(c.stage)) return false;
    const thresh = c.reminder_days || 4;
    const lastUpdate = new Date(c.updated_at || c.created_at || Date.now());
    const diffDays = (Date.now() - lastUpdate.getTime()) / 86400000;
    return diffDays > thresh ? Math.floor(diffDays) : false;
  };

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: viewMode === 'kanban' ? 1000 : 25, sort: sortField, order: sortOrder };
      if (filters.stage) params.stage = filters.stage;
      if (filters.search) params.search = filters.search;
      if (filters.priority) params.priority = filters.priority;
      if (filters.failure_type) params.failure_type = filters.failure_type;
      const data = await casesApi.list(params);
      setCases(data.cases || []);
      setPagination(data.pagination || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters, page, sortField, sortOrder, viewMode]);

  useEffect(() => { loadCases(); }, [loadCases]);
  useEffect(() => { setSelectedIds(new Set()); }, [cases]);
  useEffect(() => { fieldConfigApi.loadCaseSettingsToLocalStorage().catch(() => {}); }, []);

  const handleStageChange = async (caseId, newStage) => {
    try {
      await casesApi.transition(caseId, { stage: newStage });
      loadCases();
    } catch { alert('Failed to update stage'); }
  };

  const toggleSelect = (caseId) => {
    const s = new Set(selectedIds);
    s.has(caseId) ? s.delete(caseId) : s.add(caseId);
    setSelectedIds(s);
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === cases.length ? new Set() : new Set(cases.map(c => c.id)));
  };

  const handleBulkDelete = async () => {
    try {
      await casesApi.bulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
      await loadCases();
    } catch (err) {
      alert(err.message || 'Unable to delete selected cases.');
    }
  };

  const handleSingleDelete = async () => {
    if (!singleDeleteId) return;
    setDeletingIds(prev => new Set(prev).add(singleDeleteId));
    try {
      await casesApi.delete(singleDeleteId);
      setSingleDeleteId(null);
      await loadCases();
    } catch (err) {
      alert(err.message || 'Unable to delete case.');
    } finally {
      setDeletingIds(prev => { const n = new Set(prev); n.delete(singleDeleteId); return n; });
    }
  };

  const toggleSort = (field) => {
    setPage(1);
    if (sortField === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('asc'); }
  };

  const renderSortIcon = (field) => {
    if (sortField !== field) return ' ↕';
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  };

  const colCount = 1 + (canDeleteCases ? 1 : 0) + 9 + 1; // checkbox + cols + actions

  return (
    <div>
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 16 }}>
        <div className="page-header-left">
          <h2>Case Management</h2>
          <p>{`All recovery jobs — ${pagination.total || 0} total cases`}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {selectedIds.size > 0 && canDeleteCases && (
            <>
              <button className="btn btn-danger btn-sm" onClick={() => setShowDeleteConfirm(true)}>
                Delete ({selectedIds.size})
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>Clear</button>
            </>
          )}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elevated)', borderRadius: 6, padding: 3, border: '1px solid var(--border-subtle)' }}>
            <button className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '4px 12px', fontSize: '0.78rem' }} onClick={() => setViewMode('list')}>List</button>
            <button className={`btn btn-sm ${viewMode === 'kanban' ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '4px 12px', fontSize: '0.78rem' }} onClick={() => setViewMode('kanban')}>Kanban</button>
          </div>
          {canAccess('staff') && (
            <button className="btn btn-primary" onClick={() => setShowNewCase(true)}>+ New Case</button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-bar">
          <span className="search-icon"></span>
          <input className="search-input" placeholder="Search case#, client, serial..." value={filters.search}
            onChange={e => { setFilters({ ...filters, search: e.target.value }); setPage(1); }} />
        </div>
        <select className="form-select" style={{ width: 'auto', fontSize: '0.8rem', padding: '7px 12px' }} value={filters.stage}
          onChange={e => { setFilters({ ...filters, stage: e.target.value }); setPage(1); }}>
          <option value="">All Stages</option>
          {getSettings('custom_stages', DEFAULT_STAGES).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').toUpperCase()}</option>)}
        </select>
        <select className="form-select" style={{ width: 'auto', fontSize: '0.8rem', padding: '7px 12px' }} value={filters.failure_type}
          onChange={e => { setFilters({ ...filters, failure_type: e.target.value }); setPage(1); }}>
          <option value="">All Failures</option>
          {getSettings('custom_failure_types', DEFAULT_FAILURE_TYPES).map(f => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="form-select" style={{ width: 'auto', fontSize: '0.8rem', padding: '7px 12px' }} value={filters.priority}
          onChange={e => { setFilters({ ...filters, priority: e.target.value }); setPage(1); }}>
          <option value="">All Priorities</option>
          {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {(filters.stage || filters.failure_type || filters.priority || filters.search) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilters({ stage: '', search: '', priority: '', failure_type: '' }); setPage(1); }}>Clear Filters</button>
        )}
      </div>

      {viewMode === 'kanban' ? (
        <KanbanBoard cases={cases} onStageChange={handleStageChange} />
      ) : (
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
                    {canDeleteCases && (
                      <th style={{ width: 30 }}>
                        <input type="checkbox"
                          checked={selectedIds.size === cases.length && cases.length > 0}
                          onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                      </th>
                    )}
                    <th onClick={() => toggleSort('case_number')} style={{ cursor: 'pointer', userSelect: 'none' }}>Case #{renderSortIcon('case_number')}</th>
                    <th>Client</th>
                    <th>Device</th>
                    <th onClick={() => toggleSort('stage')} style={{ cursor: 'pointer', userSelect: 'none' }}>Stage{renderSortIcon('stage')}</th>
                    <th onClick={() => toggleSort('priority')} style={{ cursor: 'pointer', userSelect: 'none' }}>Priority{renderSortIcon('priority')}</th>
                    <th>Failure</th>
                    <th>Risk</th>
                    <th onClick={() => toggleSort('pending_amount')} style={{ cursor: 'pointer', userSelect: 'none' }}>Pending{renderSortIcon('pending_amount')}</th>
                    <th>Transfer</th>
                    <th>Engineer</th>
                    <th onClick={() => toggleSort('created_at')} style={{ cursor: 'pointer', userSelect: 'none' }}>Received{renderSortIcon('created_at')}</th>
                    <th style={{ textAlign: 'center', minWidth: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => (
                    <tr key={c.id} onClick={() => navigate(`/cases/${c.id}`)} style={{ cursor: 'pointer' }}>
                      {canDeleteCases && (
                        <td onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} style={{ cursor: 'pointer' }} />
                        </td>
                      )}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span className="font-mono text-xs text-accent">{c.case_number}</span>
                          {checkStale(c) && <span className={`stale-badge ${checkStale(c) > 7 ? 'critical' : ''}`}>⚠️ {checkStale(c)}d old</span>}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{c.first_name} {c.last_name}</div>
                        {c.company && <div className="text-xs text-muted">{c.company}</div>}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8rem' }}>{c.device_brand}</div>
                        <div className="text-xs text-muted font-mono">{c.device_model}</div>
                      </td>
                      <td><span className={`badge badge-${c.stage}`}>{c.stage?.replace(/_/g, ' ')}</span></td>
                      <td><span className={`badge badge-p${c.priority || 3}`}>{PRIORITIES[c.priority || 3]}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 150 }}>
                          {(c.failure_types || (c.failure_type ? [c.failure_type] : [])).map(ft => (
                            <span key={ft} className={`badge badge-${ft}`}>{ft}</span>
                          ))}
                        </div>
                      </td>
                      <td>{c.ai_risk_level && <span className={`badge badge-risk-${c.ai_risk_level}`}>{c.ai_risk_level}</span>}</td>
                      <td className="font-mono text-xs" style={{ fontWeight: 700, color: parseFloat(c.pending_amount || 0) > 0 ? 'var(--danger)' : 'var(--status-success)' }}>
                        ₹{parseFloat(c.pending_amount || 0).toLocaleString('en-IN')}
                      </td>
                      <td>
                        {c.transfer_to_client
                          ? <span className="badge badge-completed" style={{ minWidth: 50, textAlign: 'center', justifyContent: 'center' }}>Yes</span>
                          : <span className="badge badge-received" style={{ minWidth: 50, textAlign: 'center', justifyContent: 'center' }}>No</span>
                        }
                      </td>
                      <td className="text-xs text-muted">{c.engineer_name || '—'}</td>
                      <td className="text-xs text-muted font-mono">
                        {new Date(c.received_at || c.created_at).toLocaleDateString('en-IN')}
                      </td>
                      {/* Actions */}
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                          <button
                            title="View case"
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                            onClick={() => navigate(`/cases/${c.id}`)}
                          >
                            View
                          </button>
                          {canEditCases && (
                            <button
                              title="Edit case"
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                              onClick={() => setEditingCase(c)}
                            >
                              Edit
                            </button>
                          )}
                          {canDeleteCases && (
                            <button
                              title="Move to Recycle Bin"
                              className="btn btn-danger btn-sm"
                              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                              disabled={deletingIds.has(c.id)}
                              onClick={() => setSingleDeleteId(c.id)}
                            >
                              {deletingIds.has(c.id) ? 'Deleting...' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!cases.length && (
                    <tr><td colSpan={colCount}>
                      <div className="empty-state">
                        <div className="empty-title">No cases found</div>
                        <div className="empty-desc">Create a new case or adjust your filters.</div>
                      </div>
                    </td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          {pagination.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: 16, borderTop: '1px solid var(--border-subtle)' }}>
              <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span className="text-xs text-muted font-mono">Page {page} of {pagination.pages}</span>
              <button className="btn btn-secondary btn-sm" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showNewCase && (
        <NewCaseModal onClose={() => setShowNewCase(false)} onCreated={(newCase) => {
          loadCases();
          if (newCase?.id) navigate(`/cases/${newCase.id}`);
        }} />
      )}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          selectedCount={selectedIds.size}
          onConfirm={handleBulkDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {/* Single-row delete confirm */}
      {singleDeleteId && (
        <div className="modal-overlay" onClick={() => setSingleDeleteId(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Move to Recycle Bin</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setSingleDeleteId(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-primary)' }}>
                This case will be soft-deleted and moved to the Recycle Bin. You can restore it later.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSingleDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleSingleDelete}>Move to Recycle Bin</button>
            </div>
          </div>
        </div>
      )}
      {editingCase && (
        <EditCaseModal
          caseData={editingCase}
          onClose={() => setEditingCase(null)}
          onSaved={() => { setEditingCase(null); loadCases(); }}
        />
      )}
    </div>
  );
}
