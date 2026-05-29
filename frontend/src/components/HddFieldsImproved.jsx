import React from 'react';
import { fieldConfigApi } from '../services/fieldConfigApi';
import { categoryToConfigKey } from '../constants/inventoryConfig';

function HddFieldsImproved({ hddKey, form, setForm, customFieldValues, setCustomFieldValues, caseSettings }) {
  const normKey = categoryToConfigKey(hddKey) || '';
  const [schema, setSchema] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  const getCaseSettingsList = (key, fallback) => {
    const list = caseSettings?.[key];
    if (Array.isArray(list) && list.length) return list;
    return fallback;
  };

  const FIELD_LABELS = {
    serial_number: "Serial Number",
    model: "Model",
    manufacture_country: "Manufacture Country",
    manufacture_date: "Manufacture Date",
    pcb_number: "PCB Number",
    pn_number: "PN Number",
    dcm: "DCM",
    dcx: "DCX (3.5 only)",
    date_code: "Date Code",
    site_code: "Site Code",
    firmware: "Firmware",
    company_name: "Company Name",
    mlc: "MLC",
    hdd_code: "HDD Code",
    four_code: "4 Code",
  };

  const LEGACY_CONFIG_KEY_MAP = {
    wd_3_5: 'wd_35',
    wd_2_5: 'wd_25',
    seagate_3_5: 'seagate_35',
    seagate_2_5: 'seagate_25',
    others_3_5: 'others_35',
    others_2_5: 'others_25',
    wd_35: 'wd_3_5',
    wd_25: 'wd_2_5',
    seagate_35: 'seagate_3_5',
    seagate_25: 'seagate_2_5',
    others_35: 'others_3_5',
    others_25: 'others_2_5',
  };

  // Load schema from database and refresh when the selected HDD key or case settings change.
  const loadSchema = React.useCallback(async (signal) => {
    if (!normKey) {
      setSchema(null);
      return;
    }

    setLoading(true);
    setSchema(null);
    try {
      const primary = await fieldConfigApi.getSchema(normKey);
      console.debug('[HddFieldsImproved] fetched primary schema for', normKey, primary);
      if (signal?.aborted) return;

      const legacyKey = LEGACY_CONFIG_KEY_MAP[normKey];
      if (legacyKey) {
          try {
            const alias = await fieldConfigApi.getSchema(legacyKey);
            console.debug('[HddFieldsImproved] fetched alias schema for', legacyKey, alias);
            if (!signal?.aborted && (alias.standardFields?.length || alias.customFields?.length)) {
              setSchema(alias);
              return;
            }
          } catch (aliasError) {
          // ignore alias error, fall back to primary result
        }
      }

      if ((!primary.customFields || !primary.customFields.length) && !primary.standardFields?.length) {
        const cfg = JSON.parse(localStorage.getItem('crm_field_config') || '{}');
        const localCustoms = cfg.custom_fields?.[normKey] || cfg.custom_fields?.[legacyKey] || [];
        const fallback = { standardFields: primary.standardFields || [], customFields: localCustoms };
        console.debug('[HddFieldsImproved] using local fallback for', normKey, fallback);
        setSchema(fallback);
      } else {
        setSchema(primary);
      }
      } catch (error) {
      if (signal?.aborted) return;
      console.warn('Failed to load schema, using fallback config:', error);
      const cfg = JSON.parse(localStorage.getItem('crm_field_config') || '{}');
      const legacyKey = LEGACY_CONFIG_KEY_MAP[normKey];
      const fallback2 = { standardFields: [], customFields: cfg.custom_fields?.[normKey] || cfg.custom_fields?.[legacyKey] || [] };
      console.debug('[HddFieldsImproved] fallback on error for', normKey, fallback2);
      setSchema(fallback2);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [normKey]);

  React.useEffect(() => {
    const controller = { aborted: false };
    loadSchema(controller);
    return () => { controller.aborted = true; };
  }, [loadSchema, caseSettings]);

  // Listen for settings changes (dispatched from settings manager) and reload schema
  React.useEffect(() => {
    const handler = async () => {
      try {
        // Refresh local storage from server so fallback data is authoritative
        await fieldConfigApi.loadToLocalStorage();
      } catch (e) {
        // ignore load errors — we'll still attempt to reload schema
      }
      loadSchema();
    };
    window.addEventListener('crm_field_config_updated', handler);
    return () => window.removeEventListener('crm_field_config_updated', handler);
  }, [loadSchema]);

  const isSeagate = hddKey.includes("seagate");

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Auto parse Seagate date code
    if (field === "date_code" && isSeagate) {
      parseDateCode(value);
    }
  };

  const parseDateCode = (code) => {
    if (!code || !isSeagate) return;

    const yr = parseInt(code.substring(0, 2));
    const wk = parseInt(code.substring(2, 4));

    if (!isNaN(yr) && !isNaN(wk)) {
      const d = new Date(2000 + yr, 0, 1 + (wk - 1) * 7);
      setForm((prev) => ({
        ...prev,
        manufacture_date: d.toISOString().split("T")[0],
      }));
    }
  };

  const handleCustomFieldChange = (fieldId, value) => {
    setCustomFieldValues((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  if (loading) {
    return (
      <div
        style={{
          padding: "14px",
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: "0.8rem",
        }}
      >
        ⏳ Loading field configuration...
      </div>
    );
  }

  if (!schema || (!schema.standardFields?.length && !schema.customFields?.length)) {
    return (
      <div
        style={{
          padding: "14px",
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: "0.8rem",
          background: "var(--bg-elevated)",
          borderRadius: 8,
        }}
      >
        All fields for this HDD type are hidden.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))",
          gap: 14,
        }}
      >
        {/* Standard Fields */}
        {schema.standardFields?.map((field) => {
          if (field.status === "hidden") return null;

          const isMandatory = field.status === "mandatory";

          return (
            <div
              key={field.field_key}
              className="form-group"
              style={{ margin: 0 }}
            >
              <label className="form-label">
                {FIELD_LABELS[field.field_key] || field.field_label}

                {isMandatory && (
                  <span
                    style={{
                      color: "var(--danger)",
                      marginLeft: 4,
                    }}
                  >
                    *
                  </span>
                )}

                {field.field_key === "date_code" && isSeagate && (
                  <a
                    href="https://seagate.com"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      marginLeft: 6,
                      fontSize: "0.62rem",
                      color: "var(--accent-primary)",
                      textDecoration: "none",
                    }}
                  >
                    📎 Decode Guide
                  </a>
                )}
              </label>

              {field.field_key === "manufacture_date" || field.field_type === "date" ? (
                <input
                  type="date"
                  className="form-input"
                  value={form[field.field_key] || ""}
                  onChange={(e) =>
                    handleFieldChange(field.field_key, e.target.value)
                  }
                  required={isMandatory}
                />
              ) : field.field_type === "textarea" ? (
                <textarea
                  className="form-textarea"
                  value={form[field.field_key] || ""}
                  onChange={(e) =>
                    handleFieldChange(field.field_key, e.target.value)
                  }
                  required={isMandatory}
                  style={{ minHeight: 90, resize: 'vertical' }}
                />
              ) : field.field_type === "checkbox" ? (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form[field.field_key] === 'true' || false}
                    onChange={(e) =>
                      handleFieldChange(field.field_key, e.target.checked ? 'true' : 'false')
                    }
                  />
                  <span style={{ fontSize: '0.9rem' }}>Yes / No</span>
                </label>
              ) : field.field_type === 'select' ? (
                (() => {
                  let options = [];
                  if (field.field_key === 'manufacture_country') {
                    options = getCaseSettingsList('manufacture_countries', ['Thailand', 'China', 'Malaysia', 'Philippines']);
                  } else if (field.field_key === 'interface') {
                    options = getCaseSettingsList('interfaces', ['SATA', 'NVMe', 'SAS', 'IDE', 'USB', 'PCIe', 'M.2', 'eSATA']);
                  } else if (field.field_key === 'capacity') {
                    options = getCaseSettingsList('capacities', ['160GB', '250GB', '320GB', '500GB', '750GB', '1TB', '2TB', '4TB']);
                  }
                  return options.length ? (
                    <select
                      className="form-select"
                      value={form[field.field_key] || ""}
                      onChange={(e) => handleFieldChange(field.field_key, e.target.value)}
                      required={isMandatory}
                    >
                      <option value="">Select {FIELD_LABELS[field.field_key] || field.field_label}...</option>
                      {options.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-input"
                      value={form[field.field_key] || ""}
                      onChange={(e) =>
                        handleFieldChange(field.field_key, e.target.value)
                      }
                      autoComplete="off"
                      spellCheck={false}
                      required={isMandatory}
                    />
                  );
                })()
              ) : (
                <input
                  type={field.field_type === "number" ? "number" : "text"}
                  className="form-input"
                  value={form[field.field_key] || ""}
                  onChange={(e) =>
                    handleFieldChange(field.field_key, e.target.value)
                  }
                  autoComplete="off"
                  spellCheck={false}
                  required={isMandatory}
                />
              )}
            </div>
          );
        })}

        {/* Custom Fields */}
        {schema.customFields?.map((cf) => (
          <div
            key={cf.id}
            className="form-group"
            style={{ margin: 0 }}
          >
            <label
              className="form-label"
              style={{
                color: "var(--accent-secondary)",
              }}
            >
              ✦ {cf.field_label}
              {cf.is_mandatory && (
                <span
                  style={{
                    color: "var(--danger)",
                    marginLeft: 4,
                  }}
                >
                  *
                </span>
              )}
            </label>

            {cf.field_type === "textarea" ? (
              <textarea
                className="form-textarea"
                value={customFieldValues[cf.id] || ""}
                onChange={(e) =>
                  handleCustomFieldChange(cf.id, e.target.value)
                }
                required={cf.is_mandatory}
                style={{
                  gridColumn: "1 / -1",
                  minHeight: "80px",
                }}
              />
            ) : cf.field_type === "date" ? (
              <input
                type="date"
                className="form-input"
                value={customFieldValues[cf.id] || ""}
                onChange={(e) =>
                  handleCustomFieldChange(cf.id, e.target.value)
                }
                required={cf.is_mandatory}
              />
            ) : cf.field_type === "number" ? (
              <input
                type="number"
                className="form-input"
                value={customFieldValues[cf.id] || ""}
                onChange={(e) =>
                  handleCustomFieldChange(cf.id, e.target.value)
                }
                required={cf.is_mandatory}
              />
            ) : cf.field_type === "checkbox" ? (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={customFieldValues[cf.id] === "true" || false}
                  onChange={(e) =>
                    handleCustomFieldChange(cf.id, e.target.checked ? "true" : "false")
                  }
                />
                <span style={{ fontSize: "0.8rem" }}>Enabled</span>
              </label>
            ) : cf.field_type === "select" ? (
              <input
                type="text"
                className="form-input"
                value={customFieldValues[cf.id] || ""}
                onChange={(e) =>
                  handleCustomFieldChange(cf.id, e.target.value)
                }
                required={cf.is_mandatory}
                placeholder="Select values are not configured yet"
              />
            ) : (
              <input
                type="text"
                className="form-input"
                value={customFieldValues[cf.id] || ""}
                onChange={(e) =>
                  handleCustomFieldChange(cf.id, e.target.value)
                }
                required={cf.is_mandatory}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export { HddFieldsImproved };
