import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { casesApi, clientsApi, accountingApi } from '../services/api';

const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN') : '—';
const fmt = n => `₹${parseFloat(n||0).toLocaleString('en-IN')}`;

//  Excel Export (xlsx) 
async function exportExcel(filename, headers, rows) {
  try {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    // Auto column widths
    ws['!cols'] = headers.map((h, i) => ({
      wch: Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length), 10)
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, filename + '.xlsx');
  } catch (e) {
    console.error('Excel export failed:', e);
    // Fallback to CSV
    exportCSV(filename, headers, rows);
    alert('Excel library not available, exported as CSV instead.');
  }
}

//  CSV Export Utility 
function exportCSV(filename, headers, rows) {
  const escape = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename + '.csv'; a.click();
  URL.revokeObjectURL(url);
}

//  PDF Export (proper colorful HTML → PDF) 
function exportPDF(title, headers, rows, summaryStats) {
  const styles = `
    @page { margin: 0; size: A4 landscape; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: white; margin: 0; padding: 0; }
    .header { background: linear-gradient(135deg, #0d1117 0%, #1e2a3a 100%); color: white; padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 800; color: #00d4ff; }
    .header .meta { font-size: 11px; color: #94a3b8; }
    .header .logo { font-size: 24px; }
    .summary { display: flex; gap: 12px; padding: 16px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; }
    .stat { flex: 1; min-width: 120px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
    .stat-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
    .stat-value { font-size: 16px; font-weight: 800; color: #00d4ff; margin-top: 2px; }
    .content { padding: 16px 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead tr { background: #0d1117; }
    thead th { color: #00d4ff; padding: 10px 10px; text-align: left; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; border: none; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody tr:hover { background: #e0f2fe; }
    tbody td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
    tbody td:first-child { font-family: monospace; color: #0284c7; font-weight: 600; }
    .footer { text-align: center; padding: 12px 24px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; margin-top: 16px; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  `;
  const summaryHtml = summaryStats ? `
    <div class="summary">
      ${summaryStats.map(([l,v]) => `<div class="stat"><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div>`).join('')}
    </div>` : '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${styles}</style></head>
  <body>
    <div class="header">
      <div>
        <h1>${title}</h1>
        <div class="meta">Generated: ${new Date().toLocaleString('en-IN')} | RecoverLab CRM</div>
      </div>
      <div class="logo"></div>
    </div>
    ${summaryHtml}
    <div class="content">
      <table>
        <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td>${c??''}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="footer">RecoverLab Data Recovery CRM — Confidential Report — ${new Date().toLocaleDateString('en-IN')}</div>
  </body></html>`;

  const w = window.open('', '_blank', 'width=1200,height=800');
  if (!w) { alert('Please allow popups to generate PDF'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 500);
}

const REPORT_TYPES = [
  { key: 'cases', icon: '', label: 'Case Report', desc: 'All cases with status, diagnosis, device, and financial summary' },
  { key: 'revenue', icon: '', label: 'Revenue Report', desc: 'Invoice & payment history, collected vs pending amounts' },
  { key: 'expenses', icon: '', label: 'Expense Report', desc: 'All expenses by category, vendor, and date range' },
  { key: 'inventory', icon: '', label: 'Inventory / Stock Report', desc: 'Full stock list with condition, status, and transfer info' },
  { key: 'clients', icon: '', label: 'Client Report', desc: 'Client list with contact info, status, and case count' },
];

export default function ReportsPage() {
  const navigate = useNavigate();
  const [activeReport, setActiveReport] = useState('cases');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ from: '', to: '', status: '', search: '' });
  const [generated, setGenerated] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setGenerated(false);
    try {
      let result = [];
      if (activeReport === 'cases') {
        const r = await casesApi.list({ search: filters.search, status: filters.status, limit: 1000 });
        result = (r.cases || []).filter(c => {
          if (filters.from && new Date(c.created_at) < new Date(filters.from)) return false;
          if (filters.to && new Date(c.created_at) > new Date(filters.to + 'T23:59:59')) return false;
          return true;
        });
      } else if (activeReport === 'revenue') {
        const r = await accountingApi.listInvoices({ status: filters.status, search: filters.search });
        result = (r.invoices || []).filter(i => {
          if (filters.from && new Date(i.created_at) < new Date(filters.from)) return false;
          if (filters.to && new Date(i.created_at) > new Date(filters.to + 'T23:59:59')) return false;
          return true;
        });
      } else if (activeReport === 'expenses') {
        const r = await accountingApi.listExpenses({ search: filters.search, limit: 1000 });
        result = (r.expenses || []).filter(e => {
          if (filters.from && new Date(e.date) < new Date(filters.from)) return false;
          if (filters.to && new Date(e.date) > new Date(filters.to + 'T23:59:59')) return false;
          return true;
        });
      } else if (activeReport === 'clients') {
        const r = await clientsApi.list({ search: filters.search, limit: 1000 });
        result = (r.clients || []).filter(c => {
          if (filters.from && new Date(c.created_at) < new Date(filters.from)) return false;
          if (filters.to && new Date(c.created_at) > new Date(filters.to + 'T23:59:59')) return false;
          return true;
        });
      } else if (activeReport === 'inventory') {
        const token = localStorage.getItem('accessToken');
        const r = await fetch(`/api/inventory?limit=1000`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        result = d.items || [];
      }
      setData(result);
      setGenerated(true);
    } catch (e) { alert('Error generating report: ' + e.message); } finally { setLoading(false); }
  }, [activeReport, filters]);

  useEffect(() => { setData([]); setGenerated(false); }, [activeReport]);

  const getTableConfig = () => {
    switch (activeReport) {
      case 'cases': return {
        headers: ['Case #', 'Client', 'Device Brand', 'Device Model', 'Stage', 'Failure Type', 'Priority', 'Engineer', 'Quotation', 'Received', 'Pending', 'Created Date'],
        row: c => [c.case_number, c.client_name || `${c.first_name||''} ${c.last_name||''}`.trim(), c.device_brand||c.brand||'—', c.device_model||c.model||'—', c.stage||c.status||'—', c.failure_type||'—', c.priority||'—', c.engineer_name||'—', fmt(c.quotation_amount), fmt(c.total_paid), fmt(Math.max(0,(c.quotation_amount||0)-(c.total_paid||0))), fmtDate(c.created_at)],
      };
      case 'revenue': return {
        headers: ['Invoice #', 'Client', 'Company', 'Case #', 'Subtotal', 'Tax', 'Discount', 'Total', 'Paid', 'Balance', 'Status', 'Due Date', 'Paid On'],
        row: i => [i.invoice_number, i.client_name, i.company||'—', i.case_number||'—', fmt(i.subtotal), fmt(i.tax_amt), fmt(i.discount_amt), fmt(i.total), fmt(i.amount_paid), fmt(Math.max(0,(i.total||0)-(i.amount_paid||0))), i.status, fmtDate(i.due_date), fmtDate(i.paid_at)],
      };
      case 'expenses': return {
        headers: ['Date', 'Category', 'Description', 'Vendor', 'Amount', 'Tax', 'Total'],
        row: e => [fmtDate(e.date), e.category, e.description, e.vendor||'—', fmt(e.amount), fmt(e.tax_amt), fmt(e.total)],
      };
      case 'inventory': return {
        headers: ['Code/SKU', 'Name', 'Type/Category', 'Brand', 'Model', 'Serial #', 'PCB #', 'Capacity', 'Condition', 'Status', 'Location', 'Added Date'],
        row: i => [i.item_code||i.sku||'—', i.name||'—', i.item_type||i.category||'—', i.brand||i.device_brand||'—', i.model||i.device_model||'—', i.serial_number||'—', i.pcb_number||'—', i.capacity||i.capacity_gb||'—', i.condition||'—', i.status||i.is_available?'Available':'Reserved', i.location||'—', fmtDate(i.created_at)],
      };
      case 'clients': return {
        headers: ['Client Code', 'Name', 'Phone', 'Alt Phone', 'Email', 'Company', 'City', 'Country', 'Reference', 'Total Cases', 'Total Paid', 'VIP', 'Corporate', 'Joined'],
        row: c => [c.client_code||'—', `${c.first_name||''} ${c.last_name||''}`.trim(), c.phone||'—', c.phone_alt||'—', c.email||'—', c.company||'—', c.city||'—', c.country||'—', c.referral_source||c.reference_source||'—', c.total_cases||0, fmt(c.total_paid||0), c.is_vip?'Yes':'No', c.is_corporate?'Yes':'No', fmtDate(c.created_at)],
      };
      default: return { headers: [], row: () => [] };
    }
  };

  const getSummary = () => {
    if (!generated || !data.length) return null;
    if (activeReport === 'cases') {
      const completed = data.filter(c=>['completed','delivered'].includes(c.stage||c.status)).length;
      const revenue = data.reduce((s,c)=>s+(c.total_paid||0),0);
      const pending = data.reduce((s,c)=>s+Math.max(0,(c.quotation_amount||0)-(c.total_paid||0)),0);
      return [['Total Cases', data.length], ['Completed', completed], ['Success Rate', `${data.length?Math.round(completed/data.length*100):0}%`], ['Collected', fmt(revenue)], ['Pending', fmt(pending)]];
    }
    if (activeReport === 'revenue') {
      const total = data.reduce((s,i)=>s+(i.total||0),0);
      const paid = data.filter(i=>i.status==='paid').reduce((s,i)=>s+(i.total||0),0);
      const pending = data.reduce((s,i)=>s+Math.max(0,(i.total||0)-(i.amount_paid||0)),0);
      const overdue = data.filter(i=>i.status==='overdue').length;
      return [['Invoices', data.length], ['Total Billed', fmt(total)], ['Collected', fmt(paid)], ['Outstanding', fmt(pending)], ['Overdue', overdue]];
    }
    if (activeReport === 'expenses') {
      const total = data.reduce((s,e)=>s+(e.total||e.amount||0),0);
      return [['Expenses', data.length], ['Total', fmt(total)], ['Avg', fmt(data.length?total/data.length:0)]];
    }
    if (activeReport === 'inventory') {
      const available = data.filter(i => i.status === 'available' || i.is_available).length;
      return [['Total Items', data.length], ['Available', available], ['Reserved', data.length - available]];
    }
    if (activeReport === 'clients') {
      const vip = data.filter(c=>c.is_vip).length;
      const corporate = data.filter(c=>c.is_corporate).length;
      return [['Total Clients', data.length], ['VIP', vip], ['Corporate', corporate]];
    }
    return [['Records', data.length]];
  };

  const cfg = getTableConfig();
  const rpt = REPORT_TYPES.find(r => r.key === activeReport);
  const stats = getSummary();

  const handleExportExcel = () => {
    exportExcel(`RecoverLab_${activeReport}_${new Date().toISOString().slice(0,10)}`, cfg.headers, data.map(cfg.row));
  };

  const handleExportCSV = () => {
    exportCSV(`RecoverLab_${activeReport}_${new Date().toISOString().slice(0,10)}`, cfg.headers, data.map(cfg.row));
  };

  const handleExportPDF = () => {
    exportPDF(
      `${rpt?.label || activeReport} — RecoverLab CRM`,
      cfg.headers, data.map(cfg.row), stats
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}> Reports & Export</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Generate, filter, and export all business reports as Excel, PDF, or CSV</p>
        </div>
        {generated && data.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}> CSV</button>
            <button className="btn btn-secondary btn-sm" onClick={handleExportExcel} style={{ background:'rgba(16,185,129,0.1)', color:'var(--status-success)', border:'1px solid rgba(16,185,129,0.2)' }}> Excel (.xlsx)</button>
            <button className="btn btn-secondary btn-sm" onClick={handleExportPDF} style={{ background:'rgba(0,212,255,0.1)', color:'var(--accent-primary)', border:'1px solid rgba(0,212,255,0.2)' }}> PDF (Colorful)</button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
        {/* Report type selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {REPORT_TYPES.map(rt => (
            <button key={rt.key} onClick={() => setActiveReport(rt.key)} style={{
              padding: '12px 14px', borderRadius: 'var(--radius-md)',
              border: `1px solid ${activeReport===rt.key ? 'var(--accent-primary)' : 'var(--border-default)'}`,
              background: activeReport===rt.key ? 'rgba(0,212,255,0.08)' : 'var(--bg-elevated)',
              cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}>
              <div style={{ fontSize: '1.1rem', marginBottom: 4 }}>{rt.icon}</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: activeReport===rt.key ? 'var(--accent-primary)' : 'var(--text-primary)' }}>{rt.label}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{rt.desc}</div>
            </button>
          ))}
        </div>

        {/* Report area */}
        <div style={{ minWidth: 0 }}>
          {/* Filters */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}>
                <label className="form-label">Search</label>
                <div className="search-bar"><span className="search-icon"></span><input className="search-input" placeholder="Search…" value={filters.search} onChange={e => setFilters(f=>({...f,search:e.target.value}))} /></div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">From Date</label>
                <input type="date" className="form-input" style={{ width: 150 }} value={filters.from} onChange={e=>setFilters(f=>({...f,from:e.target.value}))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">To Date</label>
                <input type="date" className="form-input" style={{ width: 150 }} value={filters.to} onChange={e=>setFilters(f=>({...f,to:e.target.value}))} />
              </div>
              {['cases','revenue'].includes(activeReport) && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Status Filter</label>
                  <select className="form-select" style={{ width: 140 }} value={filters.status} onChange={e=>setFilters(f=>({...f,status:e.target.value}))}>
                    <option value="">All Statuses</option>
                    {activeReport==='cases'
                      ? ['received','inspection','diagnosis','quotation','approved','recovery_in_progress','imaging','data_extraction','verification','completed','delivered','failed'].map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)
                      : ['unpaid','paid','overdue','partial','cancelled'].map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <button className="btn btn-primary" style={{ height: 38 }} disabled={loading} onClick={generate}>
                {loading ? <><div className="spinner" style={{width:14,height:14}}/> Generating…</> : ' Generate'}
              </button>
              {generated && <button className="btn btn-ghost btn-sm" onClick={()=>{setData([]);setGenerated(false);setFilters({from:'',to:'',status:'',search:''});}}> Clear</button>}
            </div>
          </div>

          {/* Summary stats */}
          {stats && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              {stats.map(([label, val]) => (
                <div key={label} style={{ flex: 1, minWidth: 100, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>{val}</div>
                </div>
              ))}
            </div>
          )}

          {/* Table or empty state */}
          {!generated ? (
            <div className="empty-state" style={{ padding: 60, border: '2px dashed var(--border-default)', borderRadius: 'var(--radius-xl)' }}>
              <div className="empty-icon">{rpt?.icon}</div>
              <div className="empty-title">Configure filters and click Generate</div>
              <div className="empty-desc">{rpt?.desc}</div>
            </div>
          ) : loading ? (
            <div style={{ display:'flex',justifyContent:'center',padding:60 }}><div className="spinner" style={{width:32,height:32}}/></div>
          ) : data.length === 0 ? (
            <div className="empty-state" style={{ padding: 40 }}>
              <div className="empty-icon"></div>
              <div className="empty-title">No records match your filters</div>
              <div className="empty-desc">Try adjusting your date range or status filter</div>
            </div>
          ) : (
            <div className="table-container">
              <div style={{ padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.75rem', flexWrap:'wrap', gap:8 }}>
                <span style={{ color: 'var(--text-muted)' }}>{rpt?.icon} {rpt?.label} — <strong style={{ color: 'var(--text-primary)' }}>{data.length} records</strong></span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}> CSV</button>
                  <button className="btn btn-sm" style={{ background:'rgba(16,185,129,0.1)',color:'var(--status-success)',border:'1px solid rgba(16,185,129,0.2)' }} onClick={handleExportExcel}> Excel</button>
                  <button className="btn btn-sm" style={{ background:'rgba(0,212,255,0.1)',color:'var(--accent-primary)',border:'1px solid rgba(0,212,255,0.2)' }} onClick={handleExportPDF}> PDF</button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr>{cfg.headers.map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.map((row, i) => (
                      <tr key={i}
                        style={{ cursor: ['cases','clients'].includes(activeReport) ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (activeReport==='cases' && row.id) navigate(`/cases/${row.id}`);
                          if (activeReport==='clients' && row.id) navigate(`/clients/${row.id}`);
                        }}>
                        {cfg.row(row).map((cell, j) => (
                          <td key={j} style={{ fontSize: '0.78rem' }}>
                            {j === 0 ? <span className="font-mono text-xs" style={{ color: 'var(--accent-primary)' }}>{cell}</span> : cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
