import React from 'react';
import { fieldConfigApi } from '../services/fieldConfigApi';
import { inventoryToConfigKey } from '../utils/hddCategoryMap';

function HddFieldsImproved({ hddKey, form, setForm, customFieldValues, setCustomFieldValues }) {
  const normKey = inventoryToConfigKey(hddKey) || hddKey.replace(/\./g, '_').replace(/-/g, '_');
  const [schema, setSchema] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

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

  // Load schema from database
  React.useEffect(() => {
    const loadSchema = async () => {
      setLoading(true);
      try {
        const result = await fieldConfigApi.getSchema(normKey);
        setSchema(result);
      } catch (error) {
        console.warn('Failed to load schema, using fallback config:', error);
        // Fallback to localStorage
        const cfg = JSON.parse(localStorage.getItem('crm_field_config') || '{}');
        setSchema({
          standardFields: [],
          customFields: cfg.custom_fields?.[normKey] || [],
        });
      } finally {
        setLoading(false);
      }
    };
    loadSchema();
  }, [normKey]);

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

              {field.field_key === "manufacture_date" ? (
                <input
                  type="date"
                  className="form-input"
                  value={form[field.field_key] || ""}
                  onChange={(e) =>
                    handleFieldChange(field.field_key, e.target.value)
                  }
                  required={isMandatory}
                />
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
