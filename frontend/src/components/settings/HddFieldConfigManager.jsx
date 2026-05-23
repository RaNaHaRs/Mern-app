import React, { useState, useEffect, useCallback } from 'react';
import { fieldConfigApi } from '../../services/fieldConfigApi';
import { useInventoryConfig } from '../../hooks/useInventoryConfig';
import { categoryToConfigKey } from '../../constants/inventoryConfig';

const STATUS_OPTIONS = [
  { key: 'mandatory', label: 'Mandatory', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  { key: 'optional', label: 'Optional', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  { key: 'hidden', label: 'Hidden', color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
];

function readFieldStatus(hddFields, categoryKey, fieldKey) {
  if (hddFields?.[categoryKey]?.[fieldKey]) return hddFields[categoryKey][fieldKey];
  return 'optional';
}

function readCustomFields(customFields, categoryKey) {
  return customFields?.[categoryKey] || [];
}

/** Settings → Field Config: map fields per inventory category (WD 3.5", PCB, SSD, Phone, …) */
export default function HddFieldConfigManager() {
  const { activeCategories, loading: catsLoading } = useInventoryConfig();
  const [config, setConfig] = useState({ hdd_fields: {}, custom_fields: {}, sections: {} });
  const [fieldDefs, setFieldDefs] = useState([]);
  const [activeCategory, setActiveCategory] = useState('wd_35');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [savedMsg, setSavedMsg] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const activeConfigKey = categoryToConfigKey(activeCategory);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fieldConfigApi.getConfig();
      const cfg = {
        hdd_fields: data.hdd_fields || data.hddFields || {},
        custom_fields: data.custom_fields || data.customFields || {},
        sections: data.sections || {},
      };
      setConfig(cfg);
      setFieldDefs(data.fieldDefinitions || []);
      localStorage.setItem('crm_field_config', JSON.stringify(cfg));
    } catch (e) {
      setError(e.message);
      try {
        const cached = JSON.parse(localStorage.getItem('crm_field_config') || '{}');
        setConfig({
          hdd_fields: cached.hdd_fields || cached.hddFields || {},
          custom_fields: cached.custom_fields || cached.customFields || {},
          sections: cached.sections || {},
        });
      } catch { /* ignore */ }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (activeCategories.length && !activeCategories.find(c => c.key === activeCategory)) {
      setActiveCategory(activeCategories[0].key);
    }
  }, [activeCategories, activeCategory]);

  const flashSaved = () => {
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  };

  const getField = (catKey, fieldKey) => readFieldStatus(config.hdd_fields, catKey, fieldKey);

  const setField = async (catKey, fieldKey, status) => {
    try {
      await fieldConfigApi.updateFieldStatus(catKey, fieldKey, status);
      const cfg = JSON.parse(JSON.stringify(config));
      if (!cfg.hdd_fields) cfg.hdd_fields = {};
      if (!cfg.hdd_fields[catKey]) cfg.hdd_fields[catKey] = {};
      cfg.hdd_fields[catKey][fieldKey] = status;
      setConfig(cfg);
      localStorage.setItem('crm_field_config', JSON.stringify(cfg));
      flashSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  const getSec = (k) => config?.sections?.[k] !== false;
  const toggleSec = async (k) => {
    const next = !getSec(k);
    try {
      await fieldConfigApi.toggleSection(k, next);
      const cfg = JSON.parse(JSON.stringify(config));
      if (!cfg.sections) cfg.sections = {};
      cfg.sections[k] = next;
      setConfig(cfg);
      localStorage.setItem('crm_field_config', JSON.stringify(cfg));
      flashSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  const customFields = (catKey) => readCustomFields(config.custom_fields, catKey);

  const addCustomField = async () => {
    if (!newFieldLabel.trim() || !activeConfigKey) return;
    try {
      const created = await fieldConfigApi.addCustomField(activeConfigKey, newFieldLabel.trim(), 'text', false);
      const cfg = JSON.parse(JSON.stringify(config));
      if (!cfg.custom_fields) cfg.custom_fields = {};
      if (!cfg.custom_fields[activeConfigKey]) cfg.custom_fields[activeConfigKey] = [];
      cfg.custom_fields[activeConfigKey].push({
        key: created.field_key,
        id: created.id,
        label: created.field_label,
      });
      setConfig(cfg);
      localStorage.setItem('crm_field_config', JSON.stringify(cfg));
      setNewFieldLabel('');
      flashSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  const removeCustomField = async (catKey, cf) => {
    try {
      if (cf.id) await fieldConfigApi.deleteCustomField(cf.id);
      const cfg = JSON.parse(JSON.stringify(config));
      if (cfg.custom_fields?.[catKey]) {
        cfg.custom_fields[catKey] = cfg.custom_fields[catKey].filter(
          f => (f.id || f.key) !== (cf.id || cf.key)
        );
      }
      setConfig(cfg);
      localStorage.setItem('crm_field_config', JSON.stringify(cfg));
      flashSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteFieldFromCategory = async (catKey, fieldKey) => {
    if (!window.confirm('Remove this field from this category?')) return;
    try {
      await fieldConfigApi.deleteFieldFromCategory(catKey, fieldKey);
      const cfg = JSON.parse(JSON.stringify(config));
      if (!cfg.hdd_fields) cfg.hdd_fields = {};
      if (!cfg.hdd_fields[catKey]) cfg.hdd_fields[catKey] = {};
      cfg.hdd_fields[catKey][fieldKey] = 'hidden';
      setConfig(cfg);
      localStorage.setItem('crm_field_config', JSON.stringify(cfg));
      flashSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  const allFieldKeys = fieldDefs.map(f => ({ key: f.field_key, label: f.field_label }));
  const activeCatLabel = activeCategories.find(c => c.key === activeCategory)?.label || activeCategory;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && <div className="alert alert-warning"><span className="alert-icon">⚠</span> {error}</div>}
      {(loading || catsLoading) && <div className="text-muted text-sm">Loading…</div>}

      <div className="alert alert-info" style={{ marginBottom: 0 }}>
        <span className="alert-icon">💡</span>
        Map fields per <strong>inventory category</strong> (same options as Add Stock Item → Category: WD 3.5", PCB, SSD, Phone, etc.).
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>⚙️ Section Visibility (New Case form)</div>
        {[
          ['image_upload', '📷 Image Upload'],
          ['diagnosis', '🔍 Diagnosis'],
          ['quotation', '💰 Quotation'],
        ].map(([k, label]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{label}</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={getSec(k)} onChange={() => toggleSec(k)} />
              <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{getSec(k) ? 'On' : 'Off'}</span>
            </label>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>📂 Field mapping per category</div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {activeCategories.map(c => (
            <button key={c.key} type="button" onClick={() => setActiveCategory(c.key)}
              style={{
                padding: '6px 14px', borderRadius: 6, border: '1px solid', fontSize: '0.78rem', cursor: 'pointer',
                borderColor: activeCategory === c.key ? (c.color || 'var(--accent-primary)') : 'var(--border-default)',
                background: activeCategory === c.key ? `${c.color || 'var(--accent-primary)'}18` : 'transparent',
                color: activeCategory === c.key ? (c.color || 'var(--accent-primary)') : 'var(--text-secondary)',
                fontWeight: activeCategory === c.key ? 700 : 400,
              }}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          {STATUS_OPTIONS.map(s => (
            <span key={s.key} style={{ padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.color, fontWeight: 700 }}>{s.label}</span>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {allFieldKeys.map(({ key, label }) => {
            const status = getField(activeConfigKey, key);
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 500, textDecoration: status === 'hidden' ? 'line-through' : 'none', color: status === 'hidden' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                  {label}
                </span>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  {STATUS_OPTIONS.map(s => (
                    <button key={s.key} type="button" onClick={() => setField(activeConfigKey, key, s.key)}
                      style={{ padding: '3px 9px', borderRadius: 5, border: `1px solid ${status === s.key ? s.color : 'var(--border-default)'}`,
                        background: status === s.key ? s.bg : 'transparent', color: status === s.key ? s.color : 'var(--text-muted)',
                        fontSize: '0.7rem', fontWeight: status === s.key ? 700 : 400, cursor: 'pointer' }}>
                      {s.label}
                    </button>
                  ))}
                  <button 
                    type="button" 
                    onClick={() => deleteFieldFromCategory(activeConfigKey, key)}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: '#ef4444', 
                      cursor: 'pointer', 
                      fontSize: '1.1rem',
                      padding: '2px 6px',
                      fontWeight: 700,
                      transition: 'opacity 0.2s'
                    }}
                    title="Delete field from this category">
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
          {!allFieldKeys.length && !loading && (
            <div className="text-muted text-sm">Add fields under HDD Types → Stock Form Fields first.</div>
          )}
        </div>

        <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)', padding: 14 }}>
          <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 10 }}>
            ➕ Custom fields for {activeCatLabel}
          </div>
          {customFields(activeConfigKey).map(cf => (
            <div key={cf.id || cf.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', background: 'rgba(99,102,241,0.08)', borderRadius: 6, marginBottom: 6 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-secondary)' }}>✦ {cf.label}</span>
              <button type="button" onClick={() => removeCustomField(activeConfigKey, cf)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 11 }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" style={{ flex: 1 }} placeholder='e.g. "Voltage", "IMEI"'
              value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCustomField(); }} />
            <button type="button" className="btn btn-primary btn-sm" onClick={addCustomField} disabled={!activeConfigKey}>+ Add</button>
          </div>
        </div>
      </div>

      {savedMsg && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#22c55e', color: '#fff', padding: '10px 18px', borderRadius: 8, fontWeight: 700, zIndex: 9999 }}>
          ✓ Saved for {activeCatLabel}
        </div>
      )}
    </div>
  );
}
