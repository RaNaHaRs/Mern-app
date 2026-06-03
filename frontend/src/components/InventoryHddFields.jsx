import React, { useState, useEffect } from 'react';
import { loadInventoryFields } from '../utils/inventoryFieldSettings';

export default function InventoryHddFields({ category, form, setForm, skipKeys = [] }) {
  const [fields, setFields] = useState([]);

  useEffect(() => {
    if (!category) {
      setFields([]);
      return;
    }
    setFields(loadInventoryFields(category));
  }, [category]);

  if (!category || !fields.length) return null;

  const visibleFields = fields.filter(field => !field.hidden && !skipKeys.includes(field.key));
  if (!visibleFields.length) return null;

  const handleFieldChange = (fieldKey, value) => {
    setForm(prev => ({ ...prev, [fieldKey]: value }));
  };

  const formatLabel = (field) => field.label || field.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 10 }}>
        Inventory Settings Fields — {category?.replace(/_/g, ' ')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {visibleFields.map((field) => {
          const value = form[field.key] ?? '';
          const required = field.required;

          if (field.type === 'select') {
            return (
              <div key={field.key} className="form-group" style={{ margin: 0 }}>
                <label className={`form-label${required ? ' required' : ''}`}>{formatLabel(field)}</label>
                <select
                  className="form-select"
                  value={value}
                  required={required}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                >
                  <option value="">Select…</option>
                  {(field.options || []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            );
          }

          if (field.type === 'textarea') {
            return (
              <div key={field.key} className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label className={`form-label${required ? ' required' : ''}`}>{formatLabel(field)}</label>
                <textarea
                  className="form-textarea"
                  style={{ minHeight: 72 }}
                  value={value}
                  required={required}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                />
              </div>
            );
          }

          if (field.type === 'checkbox') {
            return (
              <div key={field.key} className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!value}
                  onChange={(e) => handleFieldChange(field.key, e.target.checked)}
                />
                <label className={`form-label${required ? ' required' : ''}`} style={{ margin: 0 }}>{formatLabel(field)}</label>
              </div>
            );
          }

          return (
            <div key={field.key} className="form-group" style={{ margin: 0 }}>
              <label className={`form-label${required ? ' required' : ''}`}>{formatLabel(field)}</label>
              <input
                type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                className="form-input"
                value={value}
                required={required}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
