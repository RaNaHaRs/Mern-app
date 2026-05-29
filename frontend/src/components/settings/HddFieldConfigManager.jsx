import React, { useState, useEffect, useCallback } from 'react';
import { fieldConfigApi } from '../../services/fieldConfigApi';
import { categoryToConfigKey } from '../../constants/inventoryConfig';

const STATUS_OPTIONS = [
  { key: 'mandatory', label: 'Mandatory', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  { key: 'optional', label: 'Optional', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  { key: 'hidden', label: 'Hidden', color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
];

const DEFAULT_HDD_DEVICE_TYPES = ['WD 2.5"','WD 3.5"','Seagate 2.5"','Seagate 3.5"','Others 2.5"','Others 3.5"'];

// Builtin field definitions for HDD, SSD, PCB, and other categories
const BUILTIN_FIELD_DEFINITIONS = [
  // HDD Fields
  { field_key: 'capacity', field_label: 'Capacity', field_type: 'select' },
  { field_key: 'interface', field_label: 'Interface', field_type: 'select' },
  { field_key: 'form_factor', field_label: 'Form Factor', field_type: 'select' },
  { field_key: 'rpm', field_label: 'RPM', field_type: 'select' },
  { field_key: 'rom_family', field_label: 'ROM Family', field_type: 'text' },
  { field_key: 'firmware', field_label: 'Firmware', field_type: 'text' },
  { field_key: 'heads', field_label: 'Heads', field_type: 'text' },
  { field_key: 'condition', field_label: 'Condition', field_type: 'select' },
  { field_key: 'mfg_country', field_label: 'Manufacturing Country', field_type: 'select' },
  // SSD Fields
  { field_key: 'ssd_type', field_label: 'SSD Type', field_type: 'select' },
  { field_key: 'nand_type', field_label: 'NAND Type', field_type: 'select' },
  { field_key: 'controller', field_label: 'Controller', field_type: 'text' },
  // PCB Fields
  { field_key: 'pcb_name', field_label: 'PCB Name', field_type: 'text' },
  { field_key: 'pcb_number', field_label: 'PCB Number', field_type: 'text' },
  { field_key: 'pcb_problem', field_label: 'PCB Problem', field_type: 'select' },
  { field_key: 'pcb_type', field_label: 'PCB Type', field_type: 'select' },
  { field_key: 'compatible_with', field_label: 'Compatible With', field_type: 'text' },
  // Other Fields
  { field_key: 'item_type', field_label: 'Item Type', field_type: 'select' },
  { field_key: 'voltage', field_label: 'Voltage', field_type: 'text' },
  { field_key: 'serial_number', field_label: 'Serial Number', field_type: 'text' },
  { field_key: 'model', field_label: 'Model', field_type: 'text' },
  { field_key: 'date_code', field_label: 'Date Code', field_type: 'text' },
];

function readFieldStatus(hddFields, categoryKey, fieldKey) {
  if (hddFields?.[categoryKey]?.[fieldKey]) return hddFields[categoryKey][fieldKey];
  return 'optional';
}

function readCustomFields(customFields, categoryKey) {
  return customFields?.[categoryKey] || [];
}

/** Settings → Field Config: map fields per inventory category (WD 3.5", PCB, SSD, Phone, …) */
export default function HddFieldConfigManager({ deviceTypes = [] }) {
  const [config, setConfig] = useState({ hdd_fields: {}, custom_fields: {}, sections: {} });
  const [fieldDefs, setFieldDefs] = useState([]);
  const [activeDeviceType, setActiveDeviceType] = useState(null);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [savedMsg, setSavedMsg] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const resolvedDeviceTypes = [
    ...DEFAULT_HDD_DEVICE_TYPES,
    ...((deviceTypes || []).filter((type) => !DEFAULT_HDD_DEVICE_TYPES.includes(type))),
  ];
  const activeConfigKey = categoryToConfigKey(activeDeviceType);

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

      let defs = data.fieldDefinitions || data.fields || [];
      if (!defs.length) {
        try {
          const fallback = await fieldConfigApi.getHddFields();
          defs = fallback.fields || [];
        } catch (fallbackErr) {
          console.warn('[HddFieldConfigManager] failed to load HDD field definitions fallback', fallbackErr);
        }
      }
      // If still empty, use builtin defaults
      if (!defs.length) {
        defs = BUILTIN_FIELD_DEFINITIONS;
      }
      setFieldDefs(defs);
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
    if (!resolvedDeviceTypes || !resolvedDeviceTypes.length) {
      setActiveDeviceType(null);
      return;
    }
    if (!activeDeviceType || !resolvedDeviceTypes.includes(activeDeviceType)) {
      setActiveDeviceType(resolvedDeviceTypes[0]);
    }
  }, [resolvedDeviceTypes, activeDeviceType]);

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

  const allFieldKeys = (() => {
    const standard = fieldDefs.map((f) => {
      const key = f.field_key || f.key;
      return { key, label: f.field_label || f.label || key };
    }).filter((f) => f.key);
    const mapped = Object.keys(config.hdd_fields?.[activeConfigKey] || {}).map((key) => ({ key, label: key }));
    const combined = [...standard];
    mapped.forEach((entry) => {
      if (!combined.find((item) => item.key === entry.key)) combined.push(entry);
    });
    return combined;
  })();

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
      // Refresh authoritative config from server into localStorage and state
      const refreshed = await fieldConfigApi.loadToLocalStorage();
      console.debug('[HddFieldConfigManager] refreshed config from server:', refreshed);
      const normalized = {
        hdd_fields: refreshed.hdd_fields || refreshed.hddFields || {},
        custom_fields: refreshed.custom_fields || refreshed.customFields || {},
        sections: refreshed.sections || {},
      };
      setConfig(normalized);
      localStorage.setItem('crm_field_config', JSON.stringify(normalized));
      // Notify other components (Add Case form) to reload schema/cache
      try { window.dispatchEvent(new Event('crm_field_config_updated')); } catch (e) { /* ignore */ }
      flashSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteFieldFromCategory = async (catKey, fieldKey) => {
    if (!window.confirm('Remove this field from this category?')) return;
    try {
      await fieldConfigApi.deleteFieldFromCategory(catKey, fieldKey);
      const refreshed = await fieldConfigApi.loadToLocalStorage();
      console.debug('[HddFieldConfigManager] refreshed config from server:', refreshed);
      const normalized = {
        hdd_fields: refreshed.hdd_fields || refreshed.hddFields || {},
        custom_fields: refreshed.custom_fields || refreshed.customFields || {},
        sections: refreshed.sections || {},
      };
      setConfig(normalized);
      localStorage.setItem('crm_field_config', JSON.stringify(normalized));
      // Notify other components to reload schema/cache
      try { window.dispatchEvent(new Event('crm_field_config_updated')); } catch (e) { /* ignore */ }
      flashSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  const activeDeviceTypeLabel = activeDeviceType || 'No device type selected';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && <div className="alert alert-warning"><span className="alert-icon">⚠</span> {error}</div>}
      {loading && <div className="text-muted text-sm">Loading…</div>}

      <div className="alert alert-info" style={{ marginBottom: 0 }}>
        <span className="alert-icon">💡</span>
        Map fields per <strong>device type</strong> (same options as Case Settings → Devices → HDD / Device Types).
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
        <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>📂 Field mapping per device type</div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(resolvedDeviceTypes || []).map((type) => (
            <button key={type} type="button" onClick={() => setActiveDeviceType(type)}
              style={{
                padding: '6px 14px', borderRadius: 6, border: '1px solid', fontSize: '0.78rem', cursor: 'pointer',
                borderColor: activeDeviceType === type ? 'var(--accent-primary)' : 'var(--border-default)',
                background: activeDeviceType === type ? 'rgba(59,130,246,0.12)' : 'transparent',
                color: activeDeviceType === type ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: activeDeviceType === type ? 700 : 400,
              }}>
              {type}
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
            <div className="text-muted text-sm">No fields available for this device type. Add custom fields to configure this category.</div>
          )}
        </div>

        <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)', padding: 14 }}>
          <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 10 }}>
            ➕ Custom fields for {activeDeviceTypeLabel}
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
          ✓ Saved for {activeDeviceTypeLabel}
        </div>
      )}
    </div>
  );
}
