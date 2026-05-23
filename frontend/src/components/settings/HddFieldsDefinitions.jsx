import React, { useState, useEffect, useCallback } from 'react';
import { fieldConfigApi } from '../../services/fieldConfigApi';

/** Settings → HDD Fields: add/edit/delete global HDD field definitions */
export default function HddFieldsDefinitions() {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('text');
  const [editing, setEditing] = useState(null);
  const [editLabel, setEditLabel] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fieldConfigApi.getHddFields();
      setFields(data.fields || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    try {
      await fieldConfigApi.addHddField(newLabel.trim(), newType);
      setNewLabel('');
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSaveEdit = async (fieldKey) => {
    try {
      await fieldConfigApi.updateHddField(fieldKey, { fieldLabel: editLabel.trim() });
      setEditing(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (fieldKey) => {
    if (!window.confirm(`Delete field "${fieldKey}"? This removes it from Field Config mappings.`)) return;
    try {
      await fieldConfigApi.deleteHddField(fieldKey);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
        Define all HDD fields used across cases and inventory. These appear automatically in Field Config for brand mapping.
      </p>
      {error && <div className="alert alert-danger"><span className="alert-icon">⚠</span> {error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fields.map(f => (
            <div key={f.field_key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
              {editing === f.field_key ? (
                <div style={{ display: 'flex', gap: 8, flex: 1 }}>
                  <input className="form-input" style={{ flex: 1 }} value={editLabel} onChange={e => setEditLabel(e.target.value)} />
                  <button className="btn btn-primary btn-sm" onClick={() => handleSaveEdit(f.field_key)}>Save</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : (
                <>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{f.field_label}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{f.field_key} · {f.field_type}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(f.field_key); setEditLabel(f.field_label); }}>✏️</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(f.field_key)}>🗑</button>
                  </div>
                </>
              )}
            </div>
          ))}
          {!fields.length && <div className="text-muted text-sm">No HDD fields defined yet.</div>}
        </div>
      )}

      <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)', padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 10 }}>➕ Add HDD Field</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="form-input" style={{ flex: 1, minWidth: 180 }} placeholder="Label e.g. RMA Number" value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          <select className="form-select" style={{ width: 120 }} value={newType} onChange={e => setNewType(e.target.value)}>
            {['text', 'textarea', 'date', 'number'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={handleAdd}>+ Add</button>
        </div>
      </div>
    </div>
  );
}
