import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { openPrintPreviewWindow } from "../utils/printPreview";

// Simple ErrorBoundary to avoid leaving a blank/black overlay if a render
// error occurs inside the modal. Shows a friendly message and Close button.
class ModalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // console the error for diagnostics
    console.error("Modal render error:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, maxWidth: 720, color: 'var(--text-primary)' }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Something went wrong</div>
          <div style={{ marginBottom: 12 }}>There was an error rendering this dialog. You can close it and try again.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={this.props.onClose}>Close</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import { casesApi, clientsApi, usersApi, suggestionsApi } from "../services/api";
import { TextareaAutocomplete } from "./FormComponents";

function getCustomProblemDescriptions() {
  try {
    const raw = localStorage.getItem("custom_problem_descriptions");
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(Boolean) : [];
  } catch {
    return [];
  }
}

const fetchProblemSuggestions = async (searchText, limit = 8) => {
  const custom = getCustomProblemDescriptions();
  const params = {
    search: searchText,
    limit,
    ...(custom.length ? { customProblems: JSON.stringify(custom) } : {}),
  };
  return suggestionsApi.searchProblems(params);
};

const fetchDiagnosisSuggestions = async (searchText, limit = 8, problemCategory = "") => {
  return suggestionsApi.searchDiagnosis({
    search: searchText,
    limit,
    problemCategory,
  });
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function gs(key, def) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v && (Array.isArray(v) ? v.length : true) ? v : def;
  } catch {
    return def;
  }
}

function getFieldConfig() {
  try {
    return JSON.parse(localStorage.getItem("crm_field_config") || "{}");
  } catch {
    return {};
  }
}
function parseCapacityGb(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;

  const raw = value.trim().toUpperCase();
  if (!raw) return null;

  const cleaned = raw.replace(/GB$/i, "").replace(/TB$/i, "").trim();
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) return null;

  return raw.includes("TB") ? Math.round(parsed * 1000) : Math.round(parsed);
}
function fieldStatus(cfg, typeKey, fieldKey) {
  return cfg?.hdd_fields?.[typeKey]?.[fieldKey] || "optional";
}
function sectionEnabled(cfg, key) {
  return cfg?.sections?.[key] !== false;
}
function customFieldsFor(cfg, typeKey) {
  return cfg?.custom_fields?.[typeKey] || [];
}

// ── HDD Type Definitions ─────────────────────────────────────────────────────
const HDD_TYPES = [
  { key: "wd_2.5", label: 'WD 2.5"', brand: "Western Digital" },
  { key: "wd_3.5", label: 'WD 3.5"', brand: "Western Digital" },
  { key: "seagate_2.5", label: 'Seagate 2.5"', brand: "Seagate" },
  { key: "seagate_3.5", label: 'Seagate 3.5"', brand: "Seagate" },
  { key: "others_2.5", label: 'Others 2.5"', brand: "" },
  { key: "others_3.5", label: 'Others 3.5"', brand: "" },
];

const HDD_FIELDS = {
  wd_2_5: [
    "serial_number",
    "model",
    "manufacture_country",
    "manufacture_date",
    "pcb_number",
    "pn_number",
    "dcm",
  ],
  wd_3_5: [
    "serial_number",
    "model",
    "manufacture_country",
    "manufacture_date",
    "pcb_number",
    "pn_number",
    "dcm",
    "dcx",
  ],
  seagate_2_5: [
    "serial_number",
    "model",
    "manufacture_country",
    "manufacture_date",
    "pcb_number",
    "pn_number",
    "date_code",
    "site_code",
    "firmware",
  ],
  seagate_3_5: [
    "serial_number",
    "model",
    "manufacture_country",
    "manufacture_date",
    "pcb_number",
    "pn_number",
    "date_code",
    "site_code",
    "firmware",
  ],
  others_2_5: [
    "company_name",
    "serial_number",
    "model",
    "manufacture_country",
    "manufacture_date",
    "pcb_number",
    "pn_number",
    "mlc",
    "hdd_code",
    "four_code",
    "firmware",
    "dcm",
  ],
  others_3_5: [
    "company_name",
    "serial_number",
    "model",
    "manufacture_country",
    "manufacture_date",
    "pcb_number",
    "pn_number",
    "mlc",
    "hdd_code",
    "four_code",
    "firmware",
    "dcm",
  ],
};

/** HDD fields optional in Add Case (no step/submit blocking) */
const OPTIONAL_HDD_FIELD_KEYS = new Set([
  "model",
  "pn_number",
  "dcm",
  "dcx",
  "date_code",
]);

function isHddFieldRequired(fieldKey) {
  return !OPTIONAL_HDD_FIELD_KEYS.has(fieldKey);
}

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

const CAPACITY_OPTIONS = [
  "160GB",
  "250GB",
  "320GB",
  "500GB",
  "750GB",
  "1TB",
  "1.5TB",
  "2TB",
  "3TB",
  "4TB",
  "6TB",
  "8TB",
  "10TB",
  "12TB",
  "14TB",
  "16TB",
  "18TB",
  "20TB",
];
const PRIORITIES = {
  1: "⚡ Critical",
  2: "🔴 High",
  3: "🟡 Medium",
  4: "🟢 Low",
  5: "⬛ Minimal",
};
const FAILURE_TYPES = [
  "logical",
  "firmware",
  "electrical",
  "mechanical",
  "head_crash",
  "pcb_damage",
  "motor_failure",
  "bad_sectors",
  "water_damage",
  "fire_damage",
  "clicking",
  "not_detecting",
  "burnt_pcb",
  "motor_issue",
  "unknown",
];

// ── Inward Print (exported so CasesPage can use too) ────────────────────────
export function printInwardForm(caseData, template = "standard") {
  const co = (() => {
    try {
      return JSON.parse(
        localStorage.getItem("crm_company_settings") ||
          localStorage.getItem("crm_company") ||
          "{}",
      );
    } catch {
      return {};
    }
  })();
  const gstOn = localStorage.getItem("crm_gst_enabled") !== "false";
  const adv = caseData.advance_amount || 0;
  const total = caseData.quotation_amount || 0;
  const remaining = Math.max(0, total - adv);
  const hddKey = (caseData.hdd_type || "").replace(".", "_").replace("-", "_");
  const fields = HDD_FIELDS[hddKey] || [];

  const hddRows = fields
    .map((f) => {
      const val = caseData[f] || "";
      return val
        ? `<tr><td class="fl">${FIELD_LABELS[f] || f}</td><td class="fv">${val}</td></tr>`
        : "";
    })
    .join("");

  const logoHtml = co.logo_data
    ? `<img src="${co.logo_data}" style="height:48px;object-fit:contain;" />`
    : `<div style="font-size:28px;font-weight:900;letter-spacing:2px;">${co.name || "RecoverLab"}</div>`;

  const themeMap = {
    standard: { hdr: "#1e293b", acc: "#0ea5e9", text: "#fff" },
    classic: { hdr: "#000", acc: "#000", text: "#fff" },
    minimal: { hdr: "#f8fafc", acc: "#334155", text: "#1e293b" },
  };
  const th = themeMap[template] || themeMap.standard;

  const savedTnc = co.tnc_image || "";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Inward Form</title>
<style id="pageStyle">@page{size:A4 portrait;margin:0}</style>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  @media print{
    .controls,.cut-hint{display:none!important}
    body{background:#fff;padding:0}
    .page-wrap{padding:0}
    .page1{page-break-after:always}
    .page2{display:${savedTnc ? "flex" : "none"}!important;width:100vw;height:100vh;align-items:center;justify-content:center;page-break-before:always}
    .page2 img{max-width:100%;max-height:100vh;object-fit:contain}
    body{print-color-adjust:exact;-webkit-print-color-adjust:exact;}
  }
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1e293b;background:#e2e8f0;min-height:100vh;}
  .controls{background:#1e293b;color:#f8fafc;padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;position:sticky;top:0;z-index:99}
  .controls strong{font-size:13px;color:#00d4ff}
  .controls label{display:flex;align-items:center;gap:4px;color:#cbd5e1;white-space:nowrap;font-size:11px}
  .controls select{background:#334155;color:#f1f5f9;border:1px solid #475569;padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer}
  .tnc-label{background:#334155;color:#94a3b8;border:1px solid #475569;padding:5px 10px;border-radius:4px;font-size:11px;cursor:pointer;white-space:nowrap}
  .tnc-label:hover{background:#475569;color:#f1f5f9}
  .btn-print{background:#00d4ff;color:#0f172a;border:none;padding:6px 16px;border-radius:5px;font-weight:800;font-size:12px;cursor:pointer;margin-left:auto}
  .btn-close{background:rgba(255,255,255,0.08);color:#94a3b8;border:1px solid #475569;padding:5px 10px;border-radius:5px;font-size:11px;cursor:pointer}
  .btn-clear{background:rgba(239,68,68,0.18);color:#f87171;border:1px solid rgba(239,68,68,0.3);padding:5px 9px;border-radius:4px;font-size:11px;cursor:pointer}
  .tnc-badge{font-size:10px;color:#34d399;font-weight:700;white-space:nowrap}
  .page-wrap{padding:20px;display:flex;flex-direction:column;align-items:center;gap:16px}
  .page1{background:#fff;width:794px;max-width:100%;box-shadow:0 4px 20px rgba(0,0,0,0.15)}
  .wrap{padding:8px;}
  .hdr{background:${th.hdr};color:${th.text};padding:14px 16px;display:flex;justify-content:space-between;align-items:center;}
  .hdr .co{font-size:20px;font-weight:900;}
  .hdr .meta{text-align:right;font-size:10px;opacity:0.85;line-height:1.6;}
  .acc-bar{height:4px;background:${th.acc};}
  .case-box{background:${th.acc};color:#fff;padding:6px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
  .case-num{font-size:22px;font-weight:900;font-family:monospace;letter-spacing:1px;}
  .case-meta{font-size:10px;opacity:0.9;text-align:right;line-height:1.7;}
  .sections{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;}
  .section{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;}
  .section.full{grid-column:1/-1;}
  .sec-title{background:${th.acc};color:#fff;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;padding:4px 10px;}
  table.fields{width:100%;border-collapse:collapse;}
  table.fields td{padding:5px 10px;border-bottom:1px solid #e2e8f0;font-size:10.5px;}
  table.fields td.fl{color:#64748b;font-weight:600;white-space:nowrap;width:40%;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;}
  table.fields td.fv{font-weight:700;color:#0f172a;}
  .chip{display:inline-block;background:#1e293b;color:#fff;padding:1px 7px;border-radius:10px;font-size:9px;margin:1px;}
  .commercial{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;}
  .comm-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;text-align:center;}
  .comm-label{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;}
  .comm-val{font-size:18px;font-weight:900;color:#0f172a;}
  .comm-val.green{color:#059669;} .comm-val.orange{color:#d97706;} .comm-val.red{color:#dc2626;}
  .sigs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin:16px 0 10px;}
  .sig-box{border-top:2px solid #1e293b;padding-top:8px;text-align:center;font-size:10px;}
  .terms{border-top:1px solid #e2e8f0;padding-top:6px;font-size:8.5px;color:#64748b;line-height:1.6;}
  .blank-line{border-bottom:1px solid #999;height:20px;margin:2px 0;}
  .page2-screen{background:#fff;width:794px;max-width:100%;box-shadow:0 4px 20px rgba(0,0,0,0.15);min-height:200px;display:flex;align-items:center;justify-content:center;border:2px dashed #cbd5e1}
  .page2-screen img{max-width:100%;max-height:600px;object-fit:contain}
  .no-tnc{color:#94a3b8;font-size:12px;padding:32px;text-align:center}
  .cut-hint{text-align:center;font-size:10px;color:#94a3b8;margin-top:4px}
  .page2{display:none}
</style></head>
<body>
<div class="controls">
  <strong>🖨 Inward Form</strong>
  <label>Paper:<select id="sz" onchange="upd()">
    <option value="A4">A4</option><option value="A3">A3</option>
    <option value="A5">A5</option><option value="letter">Letter</option>
  </select></label>
  <label>Orientation:<select id="or" onchange="upd()">
    <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
  </select></label>
  <label class="tnc-label" for="tncFile">📎 T&amp;C Image (Page 2)</label>
  <input type="file" id="tncFile" accept="image/*" style="display:none" onchange="loadTnc(this)">
  <span class="tnc-badge" id="tncBadge" style="display:${savedTnc ? "inline" : "none"}">✓ T&amp;C loaded</span>
  <button class="btn-clear" id="tncClearBtn" style="display:${savedTnc ? "inline" : "none"}" onclick="clearTnc()">✕ Clear</button>
  <button class="btn-close" onclick="window.close()">✕ Close</button>
  <button type="button" class="btn-print">🖨 Print</button>
</div>
<div class="page-wrap">
<div class="page1"><div class="wrap">
  <div class="hdr">
    <div>${logoHtml}<div style="font-size:10px;margin-top:4px;opacity:.8;">${co.address || ""}</div><div style="font-size:10px;opacity:.8;">${[co.phone, co.email].filter(Boolean).join(" | ")}</div>${gstOn && co.gstin ? `<div style="font-size:9px;opacity:.7;">GSTIN: ${co.gstin}</div>` : ""}</div>
    <div class="meta"><div style="font-size:13px;font-weight:800;letter-spacing:1px;">INWARD / JOB CARD</div><div>Date: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div><div>Time: ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div></div>
  </div>
  <div class="acc-bar"></div>
  <div class="case-box">
    <div class="case-num">📋 ${caseData.case_number || "—"}</div>
    <div class="case-meta">
      <div>Priority: ${["—", "CRITICAL", "HIGH", "MEDIUM", "LOW", "MINIMAL"][caseData.priority || 3]}</div>
      <div>Deadline: ${caseData.deadline_at ? new Date(caseData.deadline_at).toLocaleDateString("en-IN") : "—"}</div>
    </div>
  </div>

  <div class="sections">
    <div class="section">
      <div class="sec-title">👤 Client Information</div>
      <table class="fields">
        <tr><td class="fl">Name</td><td class="fv">${caseData.client_name || [caseData.first_name, caseData.last_name].filter(Boolean).join(" ") || "—"}</td></tr>
        <tr><td class="fl">Phone</td><td class="fv">${caseData.phone || "—"}</td></tr>
        <tr><td class="fl">Email</td><td class="fv">${caseData.email || "—"}</td></tr>
        <tr><td class="fl">Company</td><td class="fv">${caseData.company || "—"}</td></tr>
      </table>
    </div>
    <div class="section">
      <div class="sec-title">💾 Device Information</div>
      <table class="fields">
        <tr><td class="fl">Type</td><td class="fv">${caseData.hdd_type ? HDD_TYPES.find((h) => h.key === caseData.hdd_type)?.label || caseData.hdd_type : caseData.device_brand || "—"}</td></tr>
        <tr><td class="fl">Case Number</td><td class="fv">${caseData.case_number || "—"}</td></tr>
        <tr><td class="fl">Model</td><td class="fv">${caseData.device_model || caseData.model || "—"}</td></tr>
        <tr><td class="fl">Capacity</td><td class="fv">${caseData.capacity || (caseData.capacity_gb ? caseData.capacity_gb + "GB" : "—")}</td></tr>
        <tr><td class="fl">S/N</td><td class="fv">${caseData.serial_number || "—"}</td></tr>
      </table>
    </div>
    ${hddRows ? `<div class="section full"><div class="sec-title">🔧 HDD Technical Details</div><table class="fields">${hddRows}</table></div>` : ""}
    <div class="section full">
      <div class="sec-title">⚠️ Problem & Failure</div>
      <table class="fields">
        <tr><td class="fl">Failure Types</td><td class="fv">${(Array.isArray(caseData.failure_types) ? caseData.failure_types : caseData.failure_type ? [caseData.failure_type] : []).map((f) => `<span class="chip">${f.replace(/_/g, " ")}</span>`).join("") || "—"}</td></tr>
        <tr><td class="fl">Symptoms</td><td class="fv">${(caseData.symptoms || []).map((s) => `<span class="chip">${s.replace(/_/g, " ")}</span>`).join("") || "—"}</td></tr>
        <tr><td class="fl">Problem</td><td class="fv">${caseData.problem_description || caseData.initial_diagnosis || ""}&nbsp;<div class="blank-line"></div></td></tr>
        <tr><td class="fl">Diagnosis</td><td class="fv"><div class="blank-line"></div></td></tr>
      </table>
    </div>
  </div>

  ${
    total > 0 || adv > 0
      ? `
  <div class="commercial">
    <div class="comm-box"><div class="comm-label">Quotation Amount</div><div class="comm-val">${total > 0 ? "₹" + total.toLocaleString("en-IN") : "—"}</div></div>
    <div class="comm-box"><div class="comm-label">Advance Received</div><div class="comm-val green">${adv > 0 ? "₹" + adv.toLocaleString("en-IN") : "—"}</div></div>
    <div class="comm-box"><div class="comm-label">Balance Remaining</div><div class="comm-val ${remaining > 0 ? "red" : "green"}">${remaining > 0 ? "₹" + remaining.toLocaleString("en-IN") : "✓ Paid"}</div></div>
  </div>`
      : ""
  }

  <div class="sigs">
    <div class="sig-box">Client Signature<br><small style="color:#888">I agree to T&amp;C below</small></div>
    <div class="sig-box">Received By<br><small style="color:#888">Name: _______________</small></div>
    <div class="sig-box">Engineer Assigned<br><small style="color:#888">Name: _______________</small></div>
  </div>
  <div class="terms">
    <strong>Terms &amp; Conditions:</strong> 1) Data recovery success is not guaranteed. 2) Device must be collected within 30 days of notification. 3) ${co.name || "RecoverLab"} is not liable for data lost during transit. 4) Quotation must be approved before work begins. 5) Payment is due upon delivery.${co.invoice_disclaimer ? " 6) " + co.invoice_disclaimer : ""}
  </div>
</div></div></div>
<!-- T&C preview on screen -->
<div class="page2-screen" id="tncScreen" style="display:${savedTnc ? "flex" : "none"}">
  <img id="tncScreenImg" src="${savedTnc}" alt="Terms & Conditions"/>
</div>
<div class="no-tnc" id="noTncMsg" style="display:${savedTnc ? "none" : "block"}">
  📄 Upload a T&amp;C image above → it will print as <strong>Page 2</strong>
</div>
</div>
<div class="cut-hint">Page 2 (T&amp;C) prints automatically when image is uploaded</div>
<!-- Print-only page 2 -->
<div class="page2" id="tncPrint"><img id="tncPrintImg" src="${savedTnc}" alt="Terms and Conditions"/></div>
<script>
  function upd(){var s=document.getElementById('sz').value,o=document.getElementById('or').value;document.getElementById('pageStyle').textContent='@page{size:'+s+' '+o+';margin:0}'}
  function loadTnc(inp){
    var f=inp.files[0];if(!f)return;
    var r=new FileReader();
    r.onload=function(e){
      var src=e.target.result;
      document.getElementById('tncScreenImg').src=src;
      document.getElementById('tncScreen').style.display='flex';
      document.getElementById('noTncMsg').style.display='none';
      document.getElementById('tncPrintImg').src=src;
      document.getElementById('tncPrint').style.cssText='display:flex!important;width:100vw;height:100vh;align-items:center;justify-content:center;page-break-before:always';
      document.getElementById('tncBadge').style.display='inline';
      document.getElementById('tncClearBtn').style.display='inline';
      try{var co=JSON.parse(localStorage.getItem('crm_company')||'{}');co.tnc_image=src;localStorage.setItem('crm_company',JSON.stringify(co));}catch(ex){}
    };
    r.readAsDataURL(f);
  }
  function clearTnc(){
    document.getElementById('tncScreen').style.display='none';
    document.getElementById('noTncMsg').style.display='block';
    document.getElementById('tncPrint').style.display='none';
    document.getElementById('tncBadge').style.display='none';
    document.getElementById('tncClearBtn').style.display='none';
    document.getElementById('tncPrintImg').src='';
    document.getElementById('tncScreenImg').src='';
    try{var co=JSON.parse(localStorage.getItem('crm_company')||'{}');delete co.tnc_image;localStorage.setItem('crm_company',JSON.stringify(co));}catch(ex){}
  }
</script>
</body></html>`;

  openPrintPreviewWindow(html);
}

// ── Step indicator ─────────────────────────────────────────────────────────
function Steps({ current, steps }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        padding: "0 24px 16px",
        borderBottom: "1px solid var(--border-subtle)",
        marginBottom: 20,
      }}
    >
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              minWidth: 72,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
                fontWeight: 700,
                background:
                  i < current
                    ? "var(--accent-primary)"
                    : i === current
                      ? "var(--accent-secondary)"
                      : "var(--bg-elevated)",
                color: i <= current ? "#fff" : "var(--text-muted)",
                border:
                  i === current
                    ? "2px solid var(--accent-primary)"
                    : "2px solid transparent",
                transition: "all 0.2s",
              }}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <div
              style={{
                fontSize: "0.6rem",
                color:
                  i === current ? "var(--accent-primary)" : "var(--text-muted)",
                marginTop: 3,
                fontWeight: i === current ? 700 : 400,
                whiteSpace: "nowrap",
              }}
            >
              {s}
            </div>
          </div>
          {i < steps.length - 1 && (
            <div
              style={{
                flex: 1,
                height: 2,
                background:
                  i < current
                    ? "var(--accent-primary)"
                    : "var(--border-subtle)",
                margin: "0 4px",
                minWidth: 16,
                marginBottom: 16,
                transition: "all 0.3s",
              }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Inline image preview ──────────────────────────────────────────────────
function ImageUploadArea({ images, onChange }) {
  const fileRef = useRef();
  const addImages = (files) => {
    const newImgs = [];
    let count = 0;
    Array.from(files)
      .filter((f) => f.type.match(/image\/(jpeg|png|webp)/))
      .forEach((f) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          newImgs.push({ name: f.name, data: e.target.result, size: f.size });
          count++;
          if (
            count ===
            Array.from(files).filter((f) =>
              f.type.match(/image\/(jpeg|png|webp)/),
            ).length
          )
            onChange([...images, ...newImgs]);
        };
        reader.readAsDataURL(f);
      });
  };
  return (
    <div>
      <div
        onClick={() => fileRef.current?.click()}
        style={{
          border: "2px dashed var(--border-default)",
          borderRadius: 8,
          padding: "20px",
          textAlign: "center",
          cursor: "pointer",
          color: "var(--text-muted)",
          fontSize: "0.8rem",
          transition: "border-color 0.15s",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.style.borderColor = "var(--accent-primary)";
        }}
        onDragLeave={(e) =>
          (e.currentTarget.style.borderColor = "var(--border-default)")
        }
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.style.borderColor = "var(--border-default)";
          addImages(e.dataTransfer.files);
        }}
      >
        📷 Click or drag JPG/PNG images here
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => addImages(e.target.files)}
        />
      </div>
      {images.length > 0 && (
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}
        >
          {images.map((img, i) => (
            <div
              key={i}
              style={{
                position: "relative",
                width: 72,
                height: 72,
                borderRadius: 6,
                overflow: "hidden",
                border: "1px solid var(--border-default)",
              }}
            >
              <img
                src={img.data}
                alt={img.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <button
                onClick={() => onChange(images.filter((_, j) => j !== i))}
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  background: "rgba(0,0,0,0.6)",
                  border: "none",
                  color: "#fff",
                  borderRadius: "50%",
                  width: 16,
                  height: 16,
                  fontSize: 9,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── File upload area ──────────────────────────────────────────────────────
function FileUploadArea({ files, onChange }) {
  const fileRef = useRef();
  const addFiles = (newFiles) => {
    const added = Array.from(newFiles).map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
    }));
    onChange([...files, ...added]);
  };
  return (
    <div>
      <div
        onClick={() => fileRef.current?.click()}
        style={{
          border: "2px dashed var(--border-default)",
          borderRadius: 8,
          padding: "14px",
          textAlign: "center",
          cursor: "pointer",
          color: "var(--text-muted)",
          fontSize: "0.8rem",
        }}
      >
        📎 Click to attach files (PDF, ZIP, DOC, etc.)
        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>
      {files.length > 0 && (
        <div
          style={{
            marginTop: 8,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {files.map((f, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "5px 10px",
                background: "var(--bg-elevated)",
                borderRadius: 6,
                fontSize: "0.75rem",
              }}
            >
              <span>
                📎 {f.name}{" "}
                <span style={{ color: "var(--text-muted)" }}>
                  ({(f.size / 1024).toFixed(0)}KB)
                </span>
              </span>
              <button
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── HDD Dynamic Fields ─────────────────────────────────────────────────────
// ── HDD Dynamic Fields ─────────────────────────────────────────────────────
function HddFields({ hddKey, form, setForm, stepErrors, showStepErrors }) {
  const normKey = hddKey.replace(/\./g, "_").replace(/-/g, "_");

  const fields = useMemo(() => {
    return HDD_FIELDS[normKey] || [];
  }, [normKey]);

  const isSeagate = useMemo(() => {
    return hddKey.includes("seagate");
  }, [hddKey]);

  const cfg = getFieldConfig();

  const customs = useMemo(() => {
    return customFieldsFor(cfg, normKey);
  }, [cfg, normKey]);

  const visibleFields = useMemo(() => {
    return fields.filter(
      (f) => fieldStatus(cfg, normKey, f) !== "hidden",
    );
  }, [fields, cfg, normKey]);

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

  const invalidFieldStyle = (field) =>
    stepErrors?.[field]
      ? {
          borderColor: "var(--danger)",
          boxShadow: "0 0 0 2px rgba(239,68,68,0.12)",
        }
      : {};

  if (!visibleFields.length && !customs.length) {
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
        {visibleFields.map((field) => {
          const isMandatory = isHddFieldRequired(field);

          return (
            <div
              key={field}
              className="form-group"
              style={{ margin: 0 }}
            >
              <label className="form-label">
                {FIELD_LABELS[field] || field}

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

                {field === "date_code" && isSeagate && (
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

              {field === "manufacture_date" ? (
                <input
                  type="date"
                  className="form-input"
                  value={form[field] || ""}
                  onChange={(e) =>
                    handleFieldChange(field, e.target.value)
                  }
                  style={{ ...invalidFieldStyle(field) }}
                  aria-invalid={!!stepErrors?.[field]}
                />
              ) : field === "manufacture_country" ? (
                <select
                  className="form-select"
                  value={form[field] || ""}
                  onChange={(e) => handleFieldChange(field, e.target.value)}
                  style={{ ...invalidFieldStyle(field) }}
                  aria-invalid={!!stepErrors?.[field]}
                >
                  <option value="">Select Manufacturing Country...</option>
                  { ["Thailand","China","Malaysia","Philippines"].map(c => <option key={c} value={c}>{c}</option>) }
                </select>
              ) : (
                <input
                  type="text"
                  className="form-input"
                  value={form[field] || ""}
                  onChange={(e) =>
                    handleFieldChange(field, e.target.value)
                  }
                  style={{ ...invalidFieldStyle(field) }}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={!!stepErrors?.[field]}
                />
              )}
              {showStepErrors && stepErrors && stepErrors[field] && (
                <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 6 }}>
                  {stepErrors[field]}
                </div>
              )}
            </div>
          );
        })}

        {/* Custom Fields */}
        {customs.map((cf) => (
          <div
            key={cf.key}
            className="form-group"
            style={{ margin: 0 }}
          >
            <label
              className="form-label"
              style={{
                color: "var(--accent-secondary)",
              }}
            >
              ✦ {cf.label}
            </label>

            <input
              type="text"
              className="form-input"
              value={form[cf.key] || ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  [cf.key]: e.target.value,
                }))
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
// ── Inline New Client Mini Form ────────────────────────────────────────────
function NewClientForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    company: "",
  });
  const [loading, setLoading] = useState(false);
  const handleSave = async () => {
    if (!form.first_name || !form.phone)
      return alert("Name and phone are required");
    setLoading(true);
    try {
      const res = await clientsApi.create(form);
      onCreated(res.client || res);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };
  const inp = (label, key, type = "text", req = false) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label" style={{ fontSize: "0.72rem" }}>
        {label}
        {req && <span style={{ color: "var(--danger)" }}>*</span>}
      </label>
      <input
        type={type}
        className="form-input"
        value={form[key] || ""}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        style={{ fontSize: "0.8rem", padding: "7px 10px" }}
      />
    </div>
  );
  return (
    <div
      style={{
        padding: "14px",
        background: "var(--bg-elevated)",
        borderRadius: 8,
        border: "1px solid var(--accent-primary)",
        marginTop: 8,
      }}
    >
      <div
        style={{
          fontSize: "0.78rem",
          fontWeight: 700,
          color: "var(--accent-primary)",
          marginBottom: 10,
        }}
      >
        ➕ Add New Client
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 8,
        }}
      >
        {inp("First Name", "first_name", "text", true)}
        {inp("Last Name", "last_name")}
        {inp("Phone", "phone", "tel", true)}
        {inp("Email", "email", "email")}
      </div>
      {inp("Company / Organisation", "company")}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? "..." : "✓ Save Client"}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Stable Step Views (defined outside main render to preserve identity) ──
function StepClient({
  form,
  setForm,
  clients,
  clientSearch,
  setClientSearch,
  selectedClient,
  setSelectedClient,
  showNewClient,
  setShowNewClient,
  engineers,
  stepErrors,
}) {
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const inputStyle = { fontSize: "0.82rem", padding: "8px 10px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!showNewClient ? (
        <>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">
              Search Existing Client <span style={{ color: "var(--danger)", marginLeft: 6 }}>*</span>
            </label>
            <input
              className="form-input"
              placeholder="Type name, phone, email..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              style={inputStyle}
              autoFocus
            />
            {clients.length > 0 && (
              <div
                style={{
                  border: "1px solid var(--border-default)",
                  borderRadius: 6,
                  overflow: "hidden",
                  maxHeight: 160,
                  overflowY: "auto",
                  marginTop: 4,
                  background: "var(--bg-card)",
                }}
              >
                {clients.map((cl) => (
                  <div
                    key={cl.id}
                    onClick={() => {
                      setSelectedClient(cl);
                      setForm((f) => ({ ...f, client_id: cl.id }));
                      setClientSearch(
                        `${cl.first_name} ${cl.last_name} — ${cl.phone}`
                      );
                      setClients([]);
                    }}
                    style={{
                      padding: "9px 14px",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border-subtle)",
                      fontSize: "0.8rem",
                      background:
                        form.client_id === cl.id
                          ? "var(--accent-glow)"
                          : "transparent",
                    }}
                  >
                    <strong style={{ color: "var(--text-primary)" }}>
                      {cl.first_name} {cl.last_name}
                    </strong>
                    <span
                      style={{
                        color: "var(--text-muted)",
                        marginLeft: 8,
                        fontSize: "0.72rem",
                      }}
                    >
                      {cl.phone}
                    </span>
                    {cl.company && (
                      <span
                        style={{
                          color: "var(--text-muted)",
                          marginLeft: 6,
                          fontSize: "0.7rem",
                        }}
                      >
                        · {cl.company}
                      </span>
                    )}
                    {form.client_id === cl.id && (
                      <span
                        style={{
                          color: "var(--accent-primary)",
                          marginLeft: 8,
                        }}
                      >
                        ✓
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {stepErrors.client && (
              <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 6 }}>
                {stepErrors.client}
              </div>
            )}
          </div>
          {selectedClient && (
            <div
              style={{
                padding: "10px 14px",
                background: "var(--accent-glow)",
                border: "1px solid var(--accent-primary)",
                borderRadius: 8,
                fontSize: "0.8rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>
                ✅{" "}
                <strong>
                  {selectedClient.first_name} {selectedClient.last_name}
                </strong>{" "}
                — {selectedClient.phone}
              </span>
              <button
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  fontSize: 12,
                }}
                onClick={() => {
                  setSelectedClient(null);
                  set("client_id", "");
                  setClientSearch("");
                }}
              >
                ✕
              </button>
            </div>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ alignSelf: "flex-start" }}
            onClick={() => setShowNewClient(true)}
          >
            ➕ Client not found? Add New
          </button>
        </>
      ) : (
        <NewClientForm
          onCreated={(cl) => {
            setSelectedClient(cl);
            setForm((f) => ({ ...f, client_id: cl.id }));
            setShowNewClient(false);
            setClientSearch(`${cl.first_name} ${cl.last_name} — ${cl.phone}`);
          }}
          onCancel={() => setShowNewClient(false)}
        />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">
            Received At <span style={{ color: "var(--danger)", marginLeft: 6 }}>*</span>
          </label>
          <input
            type="datetime-local"
            className="form-input"
            value={form.received_at || ""}
            onChange={(e) => set("received_at", e.target.value)}
            style={inputStyle}
          />
          {stepErrors.received_at && (
            <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 6 }}>
              {stepErrors.received_at}
            </div>
          )}
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">
            Deadline / SLA <span style={{ color: "var(--danger)", marginLeft: 6 }}>*</span>
          </label>
          <input
            type="datetime-local"
            className="form-input"
            value={form.deadline_at || ""}
            onChange={(e) => set("deadline_at", e.target.value)}
            style={inputStyle}
          />
          {stepErrors.deadline_at && (
            <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 6 }}>
              {stepErrors.deadline_at}
            </div>
          )}
          <div
            style={{
              fontSize: "0.65rem",
              color: "var(--text-muted)",
              marginTop: 3,
            }}
          >
            Default: 4 days from now
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">
            Priority <span style={{ color: "var(--danger)", marginLeft: 6 }}>*</span>
          </label>
          <select
            className="form-select"
            value={form.priority}
            onChange={(e) => set("priority", parseInt(e.target.value))}
            style={inputStyle}
          >
            {Object.entries(PRIORITIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {stepErrors.priority && (
            <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 6 }}>
              {stepErrors.priority}
            </div>
          )}
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">
            Stale Reminder (days) <span style={{ color: "var(--danger)", marginLeft: 6 }}>*</span>
          </label>
          <input
            type="number"
            min="1"
            max="90"
            className="form-input"
            value={form.reminder_days}
            onChange={(e) => set("reminder_days", parseInt(e.target.value))}
            style={inputStyle}
          />
          {stepErrors.reminder_days && (
            <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 6 }}>
              {stepErrors.reminder_days}
            </div>
          )}
        </div>
        <div className="form-group" style={{ margin: 0, gridColumn: "1/-1" }}>
          <label className="form-label">
            Assigned Engineer <span style={{ color: "var(--danger)", marginLeft: 6 }}>*</span>
          </label>
          <select
            className="form-select"
            value={form.assigned_engineer || ""}
            onChange={(e) => set("assigned_engineer", e.target.value)}
            style={inputStyle}
          >
            <option value="">Select Engineer...</option>
            {engineers.map((eng) => (
              <option key={eng.id} value={eng.id}>
                {eng.full_name || eng.username} (
                {(eng.role || "").replace(/_/g, " ")})
              </option>
            ))}
          </select>
          {stepErrors.assigned_engineer && (
            <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 6 }}>
              {stepErrors.assigned_engineer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepDevice({ form, setForm, capacities, stepErrors }) {
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const inputStyle = { fontSize: "0.82rem", padding: "8px 10px", minHeight: 44 };
  const invalidStyle = (field) =>
    stepErrors[field]
      ? {
          borderColor: "var(--danger)",
          boxShadow: "0 0 0 2px rgba(239,68,68,0.12)",
        }
      : {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label required">
            HDD / Device Type
            <span style={{ color: "var(--danger)", marginLeft: 6 }}>*</span>
          </label>
          <select
            className="form-select"
            value={form.hdd_type || ""}
            onChange={(e) => set("hdd_type", e.target.value)}
            style={{ ...inputStyle, ...invalidStyle("hdd_type") }}
            aria-invalid={!!stepErrors.hdd_type}
          >
            <option value="">Select HDD Type...</option>
            {HDD_TYPES.map((h) => (
              <option key={h.key} value={h.key}>
                {h.label}
              </option>
            ))}
          </select>
          {stepErrors.hdd_type && (
            <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 6 }}>
              {stepErrors.hdd_type}
            </div>
          )}
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label required">
            Case Number (Manual)
            <span style={{ color: "var(--danger)", marginLeft: 6 }}>*</span>
          </label>
          <input
            className="form-input"
            placeholder="Case number / job tag"
            value={form.case_number || ""}
            onChange={(e) => set("case_number", e.target.value)}
            style={{ ...inputStyle, ...invalidStyle("case_number") }}
            aria-invalid={!!stepErrors.case_number}
          />
          {stepErrors.case_number && (
            <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 6 }}>
              {stepErrors.case_number}
            </div>
          )}
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Capacity</label>
          <select
            className="form-select"
            value={form.capacity || ""}
            onChange={(e) => {
              const value = e.target.value;
              set("capacity", value);
              if (value !== "__others__") {
                set("selected_custom_capacity", "");
              }
            }}
            style={inputStyle}
          >
            <option value="">Select Capacity...</option>
            {capacities
              .filter((c) => c !== "1.5TB")
              .map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            {form.selected_custom_capacity && !capacities.includes(form.selected_custom_capacity) && (
              <option key={form.selected_custom_capacity} value={form.selected_custom_capacity}>
                {form.selected_custom_capacity}
              </option>
            )}
            <option value="__others__">Others (add custom)</option>
          </select>
          {form.capacity === "__others__" && (
            <StepDeviceCustomInput
              form={form}
              setForm={set}
              inputStyle={inputStyle}
              stepErrors={{}}
            />
          )}
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label required">
            Interface
            <span style={{ color: "var(--danger)", marginLeft: 6 }}>*</span>
          </label>
          <select
            className="form-select"
            value={form.interface || ""}
            onChange={(e) => set("interface", e.target.value)}
            style={{ ...inputStyle, ...invalidStyle("interface") }}
            aria-invalid={!!stepErrors.interface}
          >
            <option value="">Select...</option>
            {["SATA", "NVMe", "SAS", "IDE", "USB", "PCIe", "M.2", "eSATA"].map(
              (i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              )
            )}
          </select>
          {stepErrors.interface && (
            <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 6 }}>
              {stepErrors.interface}
            </div>
          )}
        </div>
      </div>
      {!form.hdd_type && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: 8,
            fontSize: "0.78rem",
            color: "var(--text-muted)",
          }}
        >
          💡 Select an HDD Type above to load dynamic fields (WD, Seagate, or Others)
        </div>
      )}
    </div>
  );
}

function StepDeviceCustomInput({ form, setForm, inputStyle, stepErrors }) {
  const ref = useRef(null);
  useEffect(() => {
    try {
      ref.current && ref.current.focus();
    } catch {}
  }, []);

  const addCustom = (v) => {
    if (!v) return;
    const list = Array.isArray(form.custom_hdds) ? form.custom_hdds : [];
    if (!list.includes(v)) setForm("custom_hdds", [...list, v]);
    setForm("selected_custom_capacity", v);
    setForm("capacity", v);
    setForm("_custom_hdd_input", "");
  };

  const invalidStyle = stepErrors.selected_custom_capacity
    ? {
        borderColor: "var(--danger)",
        boxShadow: "0 0 0 2px rgba(239,68,68,0.12)",
      }
    : {};

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          ref={ref}
          className="form-input"
          placeholder="Type custom capacity and press Enter"
          value={form._custom_hdd_input || ""}
          onChange={(e) => setForm("_custom_hdd_input", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const v = (form._custom_hdd_input || "").trim();
              addCustom(v);
            }
          }}
          style={{ flex: 1, ...inputStyle, ...invalidStyle }}
          aria-invalid={!!stepErrors.selected_custom_capacity}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => addCustom((form._custom_hdd_input || "").trim())}
        >
          Add
        </button>
      </div>

      {stepErrors.selected_custom_capacity && (
        <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 6 }}>
          {stepErrors.selected_custom_capacity}
        </div>
      )}

      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(form.custom_hdds || []).map((ch, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              setForm("selected_custom_capacity", ch);
              setForm("capacity", ch);
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 16,
              border: "1px solid var(--border-default)",
              background: form.selected_custom_capacity === ch ? "var(--accent-glow)" : "transparent",
              cursor: "pointer",
            }}
          >
            {ch}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepHddFieldsView({ form, setForm, stepErrors, showStepErrors }) {
  return (
    <div>
      {form.hdd_type ? (
        <>
          <div style={{ marginBottom: 12, padding: "8px 12px", background: "var(--accent-glow)", borderRadius: 6, fontSize: "0.8rem", color: "var(--accent-primary)", fontWeight: 600 }}>
            🔧 Fields for: {HDD_TYPES.find((h) => h.key === form.hdd_type)?.label}
          </div>
          <HddFields hddKey={form.hdd_type} form={form} setForm={setForm} stepErrors={stepErrors} showStepErrors={showStepErrors} />
        </>
      ) : (
        <div style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
          ⚠️ Go back to <strong>Device</strong> step and select an HDD Type first.
        </div>
      )}
    </div>
  );
}

function StepProblemView({ form, setForm, toggle, SYMPTOMS, FAILURE_TYPES_LIST, stepErrors, showStepErrors }) {
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const showDiagnosis = sectionEnabled(getFieldConfig(), "diagnosis");
  const showImages = sectionEnabled(getFieldConfig(), "image_upload");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">
          Failure Types <span style={{ color: "var(--danger)", marginLeft: 6 }}>*</span>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {FAILURE_TYPES_LIST.map((ft) => {
            const on = (form.failure_types || []).includes(ft);
            return (
              <label key={ft} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", border: `1px solid ${on ? "var(--accent-primary)" : "var(--border-default)"}`, borderRadius: 8, cursor: "pointer", background: on ? "var(--accent-glow)" : "transparent", fontSize: "0.78rem", fontWeight: on ? 700 : 400, color: on ? "var(--accent-primary)" : "var(--text-secondary)", userSelect: "none" }}>
                <input type="checkbox" style={{ display: "none" }} checked={on} onChange={() => toggle("failure_types", ft)} />
                {on ? "✓ " : ""}
                {ft.replace(/_/g, " ")}
              </label>
            );
          })}
        </div>
        {stepErrors.failure_types && (
          <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 6 }}>
            {stepErrors.failure_types}
          </div>
        )}
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">
          Symptoms <span style={{ color: "var(--danger)", marginLeft: 6 }}>*</span>
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {SYMPTOMS.map((s) => {
            const on = (form.symptoms || []).includes(s);
            return (
              <button key={s} type="button" onClick={() => toggle("symptoms", s)} style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${on ? "var(--accent-primary)" : "var(--border-default)"}`, background: on ? "var(--accent-glow)" : "transparent", color: on ? "var(--accent-primary)" : "var(--text-muted)", fontSize: "0.72rem", cursor: "pointer", fontWeight: on ? 700 : 400 }}>
                {s.replace(/_/g, " ")}
              </button>
            );
          })}
        </div>
        {stepErrors.symptoms && (
          <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 6 }}>
            {stepErrors.symptoms}
          </div>
        )}
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">
          Problem Description <span style={{ color: "var(--danger)", marginLeft: 6 }}>*</span>
        </label>
        <TextareaAutocomplete
          value={form.problem_description || ""}
          onChange={(val) => set("problem_description", val)}
          placeholder="Client's description of the problem..."
          fetchSuggestions={fetchProblemSuggestions}
          hasError={showStepErrors && !!stepErrors.problem_description}
        />
        {showStepErrors && stepErrors.problem_description && (
          <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 6 }}>
            {stepErrors.problem_description}
          </div>
        )}
      </div>
      {showDiagnosis && (
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">
            Initial Diagnosis / Observation
          </label>
          <TextareaAutocomplete
            value={form.initial_diagnosis || ""}
            onChange={(val) => set("initial_diagnosis", val)}
            placeholder="Engineer's initial observations..."
            fetchSuggestions={(text, limit) =>
              fetchDiagnosisSuggestions(text, limit, form.failure_types?.[0] || "")
            }
          />
        </div>
      )}
      {showImages && (
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">📷 Device Images</label>
          <ImageUploadArea images={form.images || []} onChange={(imgs) => setForm((p) => ({ ...p, images: imgs }))} />
        </div>
      )}
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">📎 File Attachments</label>
        <FileUploadArea files={form.attachments || []} onChange={(files) => setForm((p) => ({ ...p, attachments: files }))} />
      </div>
    </div>
  );
}

function StepCommercialView({ form, setForm, printTemplate, setPrintTemplate, remaining, stepErrors }) {
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Quotation Amount (₹)</label>
          <input type="number" className="form-input" placeholder="0" value={form.quotation_amount || ""} onChange={(e) => set("quotation_amount", e.target.value)} style={{ fontSize: "0.82rem", padding: "8px 10px" }} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Advance Received (₹)</label>
          <input type="number" className="form-input" placeholder="0" value={form.advance_amount || ""} onChange={(e) => set("advance_amount", e.target.value)} style={{ fontSize: "0.82rem", padding: "8px 10px" }} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Balance Remaining</label>
          <div style={{ padding: "8px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8, fontSize: "0.9rem", fontWeight: 700, color: remaining > 0 ? "var(--danger)" : "var(--success)" }}>
            {remaining > 0 ? `₹${remaining.toLocaleString("en-IN")}` : "✓ Fully Paid"}
          </div>
        </div>
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">Reference / Notes</label>
        <input className="form-input" placeholder="Reference number, courier, etc." value={form.reference || ""} onChange={(e) => set("reference", e.target.value)} style={{ fontSize: "0.82rem", padding: "8px 10px" }} />
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">🖨️ Inward Form Print Template</label>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          {[ ["standard", "🎨 Modern (Default)"], ["classic", "📄 Classic (B&W)"], ["minimal", "⬜ Minimal"] ].map(([k, l]) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", border: `1px solid ${printTemplate === k ? "var(--accent-primary)" : "var(--border-default)"}`, borderRadius: 8, cursor: "pointer", background: printTemplate === k ? "var(--accent-glow)" : "transparent", fontSize: "0.78rem", fontWeight: printTemplate === k ? 700 : 400, color: printTemplate === k ? "var(--accent-primary)" : "var(--text-secondary)", userSelect: "none" }}>
              <input type="radio" name="template" value={k} checked={printTemplate === k} onChange={() => setPrintTemplate(k)} style={{ display: "none" }} />
              {l}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────
export default function NewCaseModal({ onClose, onCreated }) {
  const STEPS = [
    "👤 Client",
    "💾 Device",
    "🔧 HDD Fields",
    "📸 Problem",
    "💰 Commercial",
  ];
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    priority: 3,
    failure_types: [],
    symptoms: [],
    reminder_days: 4,
    hdd_type: "",
    case_number: "",
    capacity: "",
    images: [],
    attachments: [],
    quotation_amount: "",
    advance_amount: "",
    reference: "",
  });
  const [stepErrors, setStepErrors] = useState({});
  const [stepValid, setStepValid] = useState(false);
  const [showStepErrors, setShowStepErrors] = useState(false);

  const validateStepIndex = (idx) => {
    const errs = {};
    // Step 0: Client
    if (idx === 0) {
      if (!form.client_id) errs.client = "Please select or create a client";
      if (!form.received_at) errs.received_at = "Received At is required";
      if (!form.deadline_at) errs.deadline_at = "Deadline / SLA is required";
      if (!form.priority) errs.priority = "Priority is required";
      if (!form.reminder_days && form.reminder_days !== 0) errs.reminder_days = "Reminder days required";
    }

    // Step 1: Device
    if (idx === 1) {
      if (!form.hdd_type) errs.hdd_type = "HDD / Device Type is required";
      if (!form.case_number) errs.case_number = "Case number is required";
      if (!form.interface) errs.interface = "Interface is required";
    }

    // Step 2: HDD fields (require all defined fields for the selected type)
    if (idx === 2) {
      if (!form.hdd_type) {
        errs.hdd_type = "Select HDD Type in Device step";
      } else {
        const normKey = (form.hdd_type || "").replace(/\./g, "_").replace(/-/g, "_");
        const fields = HDD_FIELDS[normKey] || [];
        fields.forEach((f) => {
          if (!isHddFieldRequired(f)) return;
          if (!form[f] && form[f] !== 0) errs[f] = `${FIELD_LABELS[f] || f} is required`;
        });
      }
    }

    // Step 3: Problem
    if (idx === 3) {
      const fCfg = getFieldConfig();
      const showDiagnosis = sectionEnabled(fCfg, "diagnosis");
      
      if (!(form.failure_types || []).length) errs.failure_types = "Select at least one failure type";
      if (!(form.symptoms || []).length) errs.symptoms = "Select at least one symptom";
      if (!form.problem_description?.trim()) errs.problem_description = "Problem description is required";
    }

    // Step 4: Commercial — all fields optional

    return errs;
  };

  useEffect(() => {
    const errs = validateStepIndex(step);
    setStepErrors(errs);
    setStepValid(Object.keys(errs).length === 0);
  }, [form, step]);

  useEffect(() => {
    setShowStepErrors(false);
  }, [step]);

  const [engineers, setEngineers] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [printTemplate, setPrintTemplate] = useState("standard");

  // Default deadline = 4 days from now
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 4);
    d.setHours(18, 0, 0, 0);
    const iso = d.toISOString().slice(0, 16);
    setForm((f) => ({
      ...f,
      deadline_at: iso,
      received_at: new Date().toISOString().slice(0, 16),
    }));
    usersApi
      .list()
      .then((d) => setEngineers(d.users || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (clientSearch.length >= 2) {
      clientsApi
        .list({ search: clientSearch, limit: 8 })
        .then((d) => setClients(d.clients || []));
    } else {
      setClients([]);
    }
  }, [clientSearch]);

  const SYMPTOMS = gs("custom_symptoms", [
    "not_detected",
    "clicking",
    "slow",
    "dead",
    "beeping",
    "grinding",
    "pcb_burnt",
    "corrupted",
    "bad_sectors",
    "head_crash",
    "water_damage",
    "not_spinning",
    "read_errors",
  ]);
  const FAILURE_TYPES_LIST = gs("custom_failure_types", FAILURE_TYPES);
  const CAPACITIES = gs("custom_capacities", CAPACITY_OPTIONS);
  const ALL_HDD_TYPES = gs(
    "custom_hdd_types",
    HDD_TYPES.map((h) => h.label),
  );

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const toggle = (key, val) =>
    setForm((f) => ({
      ...f,
      [key]: (f[key] || []).includes(val)
        ? f[key].filter((x) => x !== val)
        : [...(f[key] || []), val],
    }));

  const handleSubmit = async () => {
    if (!form.client_id && !selectedClient) {
      setError("Please select or create a client");
      setStep(0);
      return;
    }
    // Validate mandatory HDD fields
    if (form.hdd_type) {
      const fCfg = getFieldConfig();
      const normKey = form.hdd_type.replace(/\./g, "_").replace(/-/g, "_");
      const fields = HDD_FIELDS[normKey] || [];
      const missingMandatory = fields.filter(
        (f) =>
          isHddFieldRequired(f) &&
          fieldStatus(fCfg, normKey, f) === "mandatory" &&
          !form[f],
      );
      if (missingMandatory.length > 0) {
        const labels = missingMandatory
          .map((f) => FIELD_LABELS[f] || f)
          .join(", ");
        setError(`Mandatory fields missing: ${labels}`);
        setStep(2);
        return;
      }
    }
    setLoading(true);
    setError("");
    try {
      const payload = {
        ...form,
        client_id: form.client_id || selectedClient?.id,
        client_name: selectedClient
          ? `${selectedClient.first_name} ${selectedClient.last_name}`
          : form.client_name,
        phone: selectedClient?.phone || form.phone,
        email: selectedClient?.email || form.email,
        company: selectedClient?.company || form.company,
        device_model: form.model || form.device_model || "",
        device_brand: form.hdd_type
          ? HDD_TYPES.find((h) => h.key === form.hdd_type)?.brand ||
            form.hdd_type
          : form.device_brand,
        capacity_gb: parseCapacityGb(form.capacity_gb ?? form.capacity),
        failure_type: form.failure_type || (form.failure_types?.[0] ?? "unknown"),
        symptom_notes: form.problem_description?.trim() || undefined,
      };
      if (payload.capacity === "__others__" && form.selected_custom_capacity) {
        payload.capacity = form.selected_custom_capacity;
      }
      delete payload.model;
      delete payload.capacity;
      delete payload.failure_types;
      // Don't send raw image data to backend (too heavy), store reference
      const images = form.images || [];
      const attachments = form.attachments || [];
      delete payload.images;
      delete payload.attachments;

      const newCase = await casesApi.create(payload);

      // Persist the problem and diagnosis into suggestion history for future autocomplete
      try {
        const problemText = form.problem_description?.trim();
        if (problemText) {
          await suggestionsApi.saveProblem({
            text: problemText,
            category: form.failure_types?.[0] || null,
          });
        }
        if (payload.initial_diagnosis) {
          await suggestionsApi.saveDiagnosis({ text: payload.initial_diagnosis });
        }
      } catch (e) {
        console.warn('Failed to save suggestion history:', e);
      }

      // Store images in localStorage keyed by case id (demo mode)
      if (images.length > 0) {
        try {
          localStorage.setItem(
            `case_images_${newCase.id}`,
            JSON.stringify(images.map((i) => ({ name: i.name, data: i.data }))),
          );
        } catch {}
      }
      if (attachments.length > 0) {
        try {
          localStorage.setItem(
            `case_files_${newCase.id}`,
            JSON.stringify(attachments),
          );
        } catch {}
      }

      onCreated(newCase);
      onClose();
      printInwardForm({ ...newCase, ...payload, images }, printTemplate);
    } catch (err) {
      setError(err.message || "Failed to create case");
    } finally {
      setLoading(false);
    }
  };

  const remaining = Math.max(
    0,
    (parseFloat(form.quotation_amount) || 0) -
      (parseFloat(form.advance_amount) || 0),
  );

  const STEP_COMPONENTS = [
    <StepClient
      form={form}
      setForm={setForm}
      clients={clients}
      clientSearch={clientSearch}
      setClientSearch={setClientSearch}
      selectedClient={selectedClient}
      setSelectedClient={setSelectedClient}
      showNewClient={showNewClient}
      setShowNewClient={setShowNewClient}
      engineers={engineers}
      stepErrors={stepErrors}
    />,
    <StepDevice
      form={form}
      setForm={setForm}
      capacities={CAPACITIES}
      stepErrors={stepErrors}
      showStepErrors={showStepErrors}
    />,
    <StepHddFieldsView
      form={form}
      setForm={setForm}
      stepErrors={stepErrors}
      showStepErrors={showStepErrors}
    />,
    <StepProblemView
      form={form}
      setForm={setForm}
      toggle={toggle}
      SYMPTOMS={SYMPTOMS}
      FAILURE_TYPES_LIST={FAILURE_TYPES_LIST}
      stepErrors={stepErrors}
      showStepErrors={showStepErrors}
    />,
    <StepCommercialView
      form={form}
      setForm={setForm}
      printTemplate={printTemplate}
      setPrintTemplate={setPrintTemplate}
      remaining={remaining}
      stepErrors={stepErrors}
    />,
  ];

  return (
    <div className="modal-overlay" style={{ zIndex: 10000, backgroundColor: 'rgba(15,23,42,0.6)' }}>
      <ModalErrorBoundary onClose={onClose}>
        <div
          className="modal modal-xl"
          onClick={(e) => e.stopPropagation()}
          style={{
            zIndex: 10001,
            maxWidth: 760,
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div className="modal-header">
            <h3 className="modal-title">📂 Create New Case</h3>
            <button className="btn btn-ghost btn-icon" onClick={onClose}>
              ✕
            </button>
          </div>

          <div style={{ padding: "16px 24px 0" }}>
            <Steps current={step} steps={STEPS} />
            {error && (
              <div className="alert alert-danger" style={{ marginBottom: 12 }}>
                <span className="alert-icon">⚠</span>
                {error}
              </div>
            )}
          </div>

          <div
            className="modal-body"
            style={{ flex: 1, overflowY: "auto", padding: "0 24px 16px" }}
          >
            {STEP_COMPONENTS[step]}
          </div>

          <div
            className="modal-footer"
            style={{ justifyContent: "space-between" }}
          >
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <div style={{ display: "flex", gap: 10 }}>
              {step > 0 && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setStep((s) => s - 1)}
                >
                  ← Back
                </button>
              )}
              {step < STEPS.length - 1 ? (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const errs = validateStepIndex(step);
                    setStepErrors(errs);
                    setShowStepErrors(true);
                    if (Object.keys(errs).length === 0) setStep((s) => s + 1);
                  }}
                >
                  Next → {STEPS[step + 1]}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    const errs = validateStepIndex(step);
                    setStepErrors(errs);
                    setShowStepErrors(true);
                    if (Object.keys(errs).length === 0) await handleSubmit();
                  }}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <div
                        className="spinner"
                        style={{ width: 14, height: 14 }}
                      />{" "}
                      Creating...
                    </>
                  ) : (
                    "🖨️ Create & Print Inward"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </ModalErrorBoundary>
    </div>
  );
}
