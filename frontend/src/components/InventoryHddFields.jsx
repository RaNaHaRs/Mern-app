import React, { useState, useEffect } from 'react';
import { fieldConfigApi } from '../services/fieldConfigApi';
import { inventoryToConfigKey } from '../utils/hddCategoryMap';

const BUILTIN_LABELS = {
  serial_number: 'Serial Number',
  model: 'Model',
  capacity: 'Capacity',
  interface: 'Interface',
  firmware: 'Firmware / SW Rev',
  site_code: 'Site Code / DCM',
  date_code: 'Date Code',
  head_map: 'Head Map',
  family: 'ROM Family',
  form_factor: 'Form Factor',
  pcb_number: 'PCB Number',
  compatible_drives: 'Compatible Drives',
  voltage: 'Voltage',
  manufacture_country: 'Manufacturing Country',
  manufacture_date: 'Manufacture Date',
};

const SELECT_OPTIONS = {
  interface: ['SATA', 'IDE', 'SAS', 'USB', 'PCIe', 'NVMe', 'NVMe M.2', 'mSATA'],
  form_factor: ['3.5" HDD', '2.5" HDD', '1.8" HDD'],
};

const MANUFACTURING_COUNTRIES = ['Thailand', 'China', 'Malaysia', 'Philippines'];

/**
 * Dynamic fields for Add Stock — driven by Settings → Field Config per category (pcb, ssd, wd_35, …).
 */
export default function InventoryHddFields({
  category,
  form,
  setForm,
  customFieldValues,
  setCustomFieldValues,
}) {
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(false);

  const configKey = inventoryToConfigKey(category);
  const isSeagate = (category || '').includes('seagate');

  useEffect(() => {
    if (!configKey) {
      setSchema(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await fieldConfigApi.getSchema(configKey);
        if (!cancelled) setSchema(result);
      } catch (err) {
        console.warn('Schema load failed', err);
        if (!cancelled) setSchema({ standardFields: [], customFields: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [configKey]);

  const handleFieldChange = (fieldKey, value) => {
    setForm(prev => ({ ...prev, [fieldKey]: value }));
    if (fieldKey === 'date_code' && isSeagate && value) {
      const yr = parseInt(value.substring(0, 2), 10);
      const wk = parseInt(value.substring(2, 4), 10);
      if (!isNaN(yr) && !isNaN(wk)) {
        const d = new Date(2000 + yr, 0, 1 + (wk - 1) * 7);
        setForm(prev => ({ ...prev, manufacture_date: d.toISOString().split('T')[0] }));
      }
    }
  };

  if (!category) return null;

  if (loading) {
    return <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>⏳ Loading fields for this category…</div>;
  }

  if (!schema?.standardFields?.length && !schema?.customFields?.length) {
    return null;
  }

  const catLabel = category.replace(/_/g, ' ');

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 10 }}>
        Category fields — {catLabel}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {schema.standardFields?.map(field => {
          const label = BUILTIN_LABELS[field.field_key] || field.field_label;
          const isMandatory = field.status === 'mandatory';
          const val = form[field.field_key] ?? '';
          const selectOpts = SELECT_OPTIONS[field.field_key];

          if (selectOpts) {
            return (
              <div key={field.field_key} className="form-group" style={{ margin: 0 }}>
                <label className={`form-label${isMandatory ? ' required' : ''}`}>{label}</label>
                <select className="form-select" value={val} required={isMandatory}
                  onChange={e => handleFieldChange(field.field_key, e.target.value)}>
                  <option value="">Select…</option>
                  {selectOpts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            );
          }

          if (field.field_key === 'manufacture_country') {
            return (
              <div key={field.field_key} className="form-group" style={{ margin: 0 }}>
                <label className={`form-label${isMandatory ? ' required' : ''}`}>Manufacturing Country</label>
                <select
                  className="form-select"
                  value={val}
                  required={isMandatory}
                  onChange={e => handleFieldChange(field.field_key, e.target.value)}
                >
                  <option value="">Select Manufacturing Country...</option>
                  {MANUFACTURING_COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            );
          }

          if (field.field_key === 'manufacture_date') {
            return (
              <div key={field.field_key} className="form-group" style={{ margin: 0 }}>
                <label className={`form-label${isMandatory ? ' required' : ''}`}>{label}</label>
                <input
                  type="date"
                  className="form-input"
                  value={val}
                  required={isMandatory}
                  onChange={e => handleFieldChange(field.field_key, e.target.value)}
                />
              </div>
            );
          }

          return (
            <div key={field.field_key} className="form-group" style={{ margin: 0 }}>
              <label className={`form-label${isMandatory ? ' required' : ''}`}>{label}{isMandatory && ' *'}</label>
              <input
                type={field.field_type === 'date' ? 'date' : field.field_type === 'number' ? 'number' : 'text'}
                className="form-input"
                value={val}
                required={isMandatory}
                onChange={e => handleFieldChange(field.field_key, e.target.value)}
              />
            </div>
          );
        })}

        {schema.customFields?.map(cf => (
          <div key={cf.id} className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ color: 'var(--accent-secondary)' }}>
              ✦ {cf.field_label}{cf.is_mandatory && ' *'}
            </label>
            <input
              type="text"
              className="form-input"
              value={customFieldValues[cf.id] || ''}
              required={cf.is_mandatory}
              onChange={e => setCustomFieldValues(prev => ({ ...prev, [cf.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
