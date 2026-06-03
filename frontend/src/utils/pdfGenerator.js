/**
 * RecoverLab CRM — PDF Generator Utility
 * Uses jsPDF + jsPDF-AutoTable for colorful professional PDFs
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const BRAND_COLORS = {
  primary: [0, 180, 220],       // cyan
  secondary: [124, 58, 237],    // purple
  success: [16, 185, 129],      // green
  danger: [239, 68, 68],        // red
  warning: [234, 179, 8],       // yellow
  dark: [15, 23, 42],           // bg
  darkElevated: [22, 33, 62],   // elevated
  text: [226, 232, 240],        // text primary light bg
  textDark: [15, 23, 42],       // text on white
  muted: [100, 116, 139],       // muted
  white: [255, 255, 255],
  lightGray: [248, 250, 252],
  borderGray: [226, 232, 240],
};

function getCompanySettings() {
  try {
    const saved = localStorage.getItem('crm_company_settings');
    if (saved) return JSON.parse(saved);
  } catch {}
  return {
    name: 'RecoverLab',
    tagline: 'Enterprise Data Recovery',
    phone: '',
    email: '',
    address: '',
    gstin: '',
    website: '',
    logo_data: null,
  };
}

function formatCurrency(amount, currency = 'INR') {
  if (amount == null) return '—';
  const num = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0 }).format(amount);
  return 'Rs. ' + num;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Draw a standard header on the PDF page
 */
function drawHeader(doc, company, title, subtitle, meta = []) {
  const pageW = doc.internal.pageSize.getWidth();
  
  // Background gradient bar
  doc.setFillColor(...BRAND_COLORS.dark);
  doc.rect(0, 0, pageW, 38, 'F');
  
  // Accent line
  doc.setFillColor(...BRAND_COLORS.primary);
  doc.rect(0, 38, pageW, 2, 'F');
  
  // Logo or company name
  let xStart = 14;
  if (company.logo_data) {
    try {
      doc.addImage(company.logo_data, 'PNG', 10, 6, 26, 26);
      xStart = 42;
    } catch {}
  } else {
    // Draw colored circle
    doc.setFillColor(...BRAND_COLORS.primary);
    doc.circle(22, 19, 10, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('RL', 22, 23, { align: 'center' });
    xStart = 38;
  }
  
  // Company name
  doc.setTextColor(...BRAND_COLORS.white);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(company.name || 'RecoverLab', xStart, 16);
  
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 200, 220);
  doc.text(company.tagline || 'Enterprise Data Recovery', xStart, 23);
  if (company.phone || company.email) {
    doc.text([company.phone, company.email].filter(Boolean).join('  |  '), xStart, 30);
  }
  
  // Right side: Document title
  doc.setTextColor(...BRAND_COLORS.white);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageW - 14, 18, { align: 'right' });
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 200, 220);
  if (subtitle) doc.text(subtitle, pageW - 14, 27, { align: 'right' });
  
  // Meta row (key-value badges)
  if (meta.length > 0) {
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 40, pageW, 18, 'F');
    let x = 14;
    doc.setFontSize(7);
    meta.forEach(([key, val]) => {
      doc.setTextColor(140, 160, 180);
      doc.setFont('helvetica', 'normal');
      doc.text(key + ':', x, 51);
      doc.setTextColor(...BRAND_COLORS.white);
      doc.setFont('helvetica', 'bold');
      doc.text(String(val || '—'), x + doc.getTextWidth(key + ':') + 2, 51);
      x += doc.getTextWidth(key + ': ' + (val || '—')) + 14;
    });
  }
  
  return meta.length > 0 ? 62 : 46;
}

/**
 * Draw standard footer
 */
function drawFooter(doc, pageNum, totalPages, company) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  
  doc.setFillColor(248, 250, 252);
  doc.rect(0, pageH - 18, pageW, 18, 'F');
  
  doc.setFillColor(...BRAND_COLORS.primary);
  doc.rect(0, pageH - 18, pageW, 0.5, 'F');
  
  doc.setFontSize(7);
  doc.setTextColor(...BRAND_COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.text(company.address || '', 14, pageH - 9);
  doc.text(`Page ${pageNum} of ${totalPages}`, pageW - 14, pageH - 9, { align: 'right' });
  
  if (company.invoice_footer) {
    doc.setFontSize(6.5);
    doc.text(company.invoice_footer, pageW / 2, pageH - 9, { align: 'center' });
  }
}

// ─── INVOICE PDF ────────────────────────────────────────────────────────────
export function generateInvoicePDF(invoice, company = null) {
  company = company || getCompanySettings();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  
  // GST settings
  const gstEnabled = localStorage.getItem('crm_gst_enabled') !== 'false';
  
  const meta = [
    ['Invoice #', invoice.invoice_number],
    ['Date', formatDate(invoice.created_at)],
    ['Due', formatDate(invoice.due_date)],
    ['Status', (invoice.status || '').toUpperCase()],
  ];
  if (invoice.case_number) meta.push(['Case', invoice.case_number]);
  
  let y = drawHeader(doc, company, 'INVOICE', null, meta);
  y += 8;
  
  // Bill To + Company details section
  const col1X = 14, col2X = pageW / 2 + 5;
  
  // Bill To box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(col1X, y, (pageW / 2) - 20, 38, 2, 2, 'F');
  doc.setFillColor(...BRAND_COLORS.primary);
  doc.rect(col1X, y, 2, 38, 'F');
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_COLORS.primary);
  doc.text('BILL TO', col1X + 6, y + 8);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_COLORS.textDark);
  doc.text(invoice.client_name || '—', col1X + 6, y + 16);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BRAND_COLORS.muted);
  if (invoice.company) doc.text(invoice.company, col1X + 6, y + 23);
  if (invoice.client_address) doc.text(invoice.client_address, col1X + 6, y + 29, { maxWidth: (pageW / 2) - 28 });
  if (gstEnabled && invoice.client_gstin) doc.text('GSTIN: ' + invoice.client_gstin, col1X + 6, y + 36);
  
  // From box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(col2X, y, (pageW / 2) - 19, 38, 2, 2, 'F');
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_COLORS.secondary);
  doc.text('FROM', col2X + 6, y + 8);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_COLORS.textDark);
  doc.text(company.name || 'RecoverLab', col2X + 6, y + 16);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BRAND_COLORS.muted);
  if (company.address) doc.text(company.address, col2X + 6, y + 23, { maxWidth: (pageW / 2) - 18 });
  if (gstEnabled && company.gstin) doc.text('GSTIN: ' + company.gstin, col2X + 6, y + 36);
  
  y += 46;
  
  // Line items table
  const rows = (invoice.line_items || []).map((item, i) => [
    i + 1,
    item.description || item.name || '',
    item.qty || 1,
    formatCurrency(item.unit_price),
    gstEnabled ? `${item.tax_pct || invoice.tax_pct || 18}%` : '—',
    formatCurrency((item.qty || 1) * (item.unit_price || 0)),
  ]);
  
  const tableColumns = gstEnabled
    ? ['#', 'Description', 'Qty', 'Unit Price', 'GST %', 'Amount']
    : ['#', 'Description', 'Qty', 'Unit Price', 'Amount'];
    
  if (!gstEnabled) rows.forEach(r => r.splice(4, 1));
  
  autoTable(doc, {
    startY: y,
    head: [tableColumns],
    body: rows,
    theme: 'striped',
    headStyles: {
      fillColor: BRAND_COLORS.dark,
      textColor: BRAND_COLORS.white,
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, textColor: BRAND_COLORS.textDark },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      [tableColumns.length - 1]: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });
  
  y = doc.lastAutoTable.finalY + 6;
  
  // Totals section
  const totalsX = pageW - 70;
  const totals = [
    ['Subtotal', formatCurrency(invoice.subtotal)],
  ];
  if (invoice.discount_amt > 0) totals.push(['Discount', '- ' + formatCurrency(invoice.discount_amt)]);
  if (gstEnabled && invoice.tax_amt > 0) totals.push([`GST (${invoice.tax_pct || 18}%)`, formatCurrency(invoice.tax_amt)]);
  totals.push(['TOTAL', formatCurrency(invoice.total)]);
  
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(totalsX - 4, y - 2, pageW - totalsX - 10, totals.length * 7 + 8, 2, 2, 'F');
  
  totals.forEach(([label, value], i) => {
    const rowY = y + i * 7 + 4;
    const isTotal = label === 'TOTAL';
    
    if (isTotal) {
      doc.setFillColor(...BRAND_COLORS.primary);
      doc.rect(totalsX - 4, rowY - 5, pageW - totalsX - 10, 9, 'F');
      doc.setTextColor(...BRAND_COLORS.white);
    } else {
      doc.setTextColor(...BRAND_COLORS.muted);
    }
    
    doc.setFontSize(isTotal ? 9 : 8);
    doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
    doc.text(label, totalsX, rowY);
    doc.text(value, pageW - 14, rowY, { align: 'right' });
  });
  
  y += totals.length * 7 + 12;
  
  // Bank details
  if (company.invoice_bank_name) {
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(14, y, (pageW / 2) - 6, 28, 2, 2, 'F');
    doc.setFillColor(...BRAND_COLORS.success);
    doc.rect(14, y, 2, 28, 'F');
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND_COLORS.success);
    doc.text('BANK DETAILS', 20, y + 8);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BRAND_COLORS.textDark);
    doc.setFontSize(7.5);
    doc.text(`Bank: ${company.invoice_bank_name}`, 20, y + 15);
    doc.text(`A/c: ${company.invoice_bank_account || '—'}`, 20, y + 21);
    doc.text(`IFSC: ${company.invoice_bank_ifsc || '—'}  |  Branch: ${company.invoice_bank_branch || '—'}`, 20, y + 27);
  }
  
  // Disclaimer
  if (company.invoice_disclaimer) {
    doc.setFontSize(6.5);
    doc.setTextColor(...BRAND_COLORS.muted);
    doc.setFont('helvetica', 'italic');
    doc.text(company.invoice_disclaimer, pageW - 14, y + 8, { align: 'right', maxWidth: pageW / 2 - 10 });
  }
  
  // Stamp area
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(pageW - 60, y + 14, 46, 18, 2, 2, 'F');
  doc.setFontSize(6.5);
  doc.setTextColor(...BRAND_COLORS.muted);
  doc.text('Authorised Signatory', pageW - 37, y + 30, { align: 'center' });
  
  // Footer
  const totalPagesExp = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPagesExp; i++) {
    doc.setPage(i);
    drawFooter(doc, i, totalPagesExp, company);
  }
  
  return doc;
}

// ─── QUOTE PDF ───────────────────────────────────────────────────────────────
export function generateQuotePDF(quote, company = null, appendImages = []) {
  company = company || getCompanySettings();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const gstEnabled = localStorage.getItem('crm_gst_enabled') !== 'false';
  
  const meta = [
    ['Quote #', quote.quote_number],
    ['Date', formatDate(quote.created_at)],
    ['Valid Until', formatDate(quote.valid_until)],
    ['Status', (quote.status || '').toUpperCase()],
  ];
  if (quote.case_number) meta.push(['Case', quote.case_number]);
  
  let y = drawHeader(doc, company, 'QUOTATION', quote.title || '', meta);
  y += 8;
  
  // Bill To
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y, pageW - 28, 22, 2, 2, 'F');
  doc.setFillColor(...BRAND_COLORS.secondary);
  doc.rect(14, y, 2, 22, 'F');
  
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_COLORS.secondary);
  doc.text('PREPARED FOR', 20, y + 8);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_COLORS.textDark);
  doc.text([quote.client_name, quote.company].filter(Boolean).join(' — '), 20, y + 16);
  
  y += 30;
  
  // Line items
  const rows = (quote.line_items || []).map((item, i) => [
    i + 1,
    item.description || '',
    item.qty || 1,
    formatCurrency(item.unit_price),
    formatCurrency((item.qty || 1) * (item.unit_price || 0)),
  ]);
  
  autoTable(doc, {
    startY: y,
    head: [['#', 'Description', 'Qty', 'Unit Price', 'Amount']],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: BRAND_COLORS.secondary,
      textColor: BRAND_COLORS.white,
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, textColor: BRAND_COLORS.textDark },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      4: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });
  
  y = doc.lastAutoTable.finalY + 6;
  
  // Totals
  const totalsX = pageW - 70;
  const totals = [['Subtotal', formatCurrency(quote.subtotal)]];
  if (quote.discount_amt > 0) totals.push(['Discount', '- ' + formatCurrency(quote.discount_amt)]);
  if (gstEnabled && quote.tax_amt > 0) totals.push([`GST (${quote.tax_pct || 18}%)`, formatCurrency(quote.tax_amt)]);
  totals.push(['TOTAL', formatCurrency(quote.total)]);
  
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(totalsX - 4, y - 2, pageW - totalsX - 10, totals.length * 7 + 8, 2, 2, 'F');
  
  totals.forEach(([label, value], i) => {
    const rowY = y + i * 7 + 4;
    const isTotal = label === 'TOTAL';
    if (isTotal) {
      doc.setFillColor(...BRAND_COLORS.secondary);
      doc.rect(totalsX - 4, rowY - 5, pageW - totalsX - 10, 9, 'F');
      doc.setTextColor(...BRAND_COLORS.white);
    } else {
      doc.setTextColor(...BRAND_COLORS.muted);
    }
    doc.setFontSize(isTotal ? 9 : 8);
    doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
    doc.text(label, totalsX, rowY);
    doc.text(value, pageW - 14, rowY, { align: 'right' });
  });
  
  y += totals.length * 7 + 14;
  
  // Notes
  if (quote.notes) {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BRAND_COLORS.muted);
    doc.text('Notes: ' + quote.notes, 14, y, { maxWidth: pageW - 28 });
    y += 14;
  }
  
  // Append images (from settings)
  if (appendImages && appendImages.length > 0) {
    appendImages.forEach(imgData => {
      try {
        doc.addPage();
        doc.addImage(imgData, 'JPEG', 14, 14, pageW - 28, doc.internal.pageSize.getHeight() - 28);
      } catch {}
    });
  }
  
  const totalPagesExp = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPagesExp; i++) {
    doc.setPage(i);
    drawFooter(doc, i, totalPagesExp, company);
  }
  
  return doc;
}

// ─── CASES REPORT PDF ─────────────────────────────────────────────────────
export function generateCasesReportPDF(cases, filters = {}, company = null) {
  company = company || getCompanySettings();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  
  let y = drawHeader(doc, company, 'CASES REPORT', `Generated ${formatDate(new Date().toISOString())}`, [
    ['Total', cases.length],
    ['Period', filters.period || 'All Time'],
  ]);
  y += 6;
  
  const rows = cases.map(c => [
    c.case_number || '—',
    [c.first_name, c.last_name].filter(Boolean).join(' '),
    c.device_brand || '—',
    c.device_model || '—',
    c.failure_type || '—',
    (c.stage || '—').replace(/_/g, ' '),
    c.priority === 1 ? 'Critical' : c.priority === 2 ? 'High' : 'Normal',
    c.engineer_name || 'Unassigned',
    formatDate(c.received_at || c.created_at),
  ]);
  
  autoTable(doc, {
    startY: y,
    head: [['Case #', 'Client', 'Brand', 'Model', 'Failure', 'Stage', 'Priority', 'Engineer', 'Date']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: BRAND_COLORS.dark, textColor: BRAND_COLORS.white, fontSize: 7.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 12, right: 12 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        const priority = data.cell.raw;
        if (priority === 'Critical') data.cell.styles.textColor = BRAND_COLORS.danger;
        else if (priority === 'High') data.cell.styles.textColor = BRAND_COLORS.warning;
      }
    },
  });
  
  const totalPagesExp = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPagesExp; i++) {
    doc.setPage(i);
    drawFooter(doc, i, totalPagesExp, company);
  }
  
  return doc;
}

// ─── STOCK REPORT PDF ──────────────────────────────────────────────────────
export function generateStockReportPDF(items, company = null) {
  company = company || getCompanySettings();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  let y = drawHeader(doc, company, 'STOCK REPORT', `Generated ${formatDate(new Date().toISOString())}`, [
    ['Total Items', items.length],
    ['Low Stock', items.filter(i => i.quantity <= (i.min_quantity || 0)).length],
  ]);
  y += 6;
  
  const rows = items.map(i => [
    i.sku || i.item_code || '—',
    i.name || '—',
    (i.category || i.item_type || '—').replace(/_/g, ' '),
    i.brand || i.device_brand || '—',
    i.quantity ?? 0,
    i.min_quantity ?? 0,
    formatCurrency(i.unit_cost || 0),
    i.location || '—',
    (i.condition || '—').toUpperCase(),
    i.quantity <= (i.min_quantity || 0) ? 'LOW' : 'OK',
  ]);
  
  autoTable(doc, {
    startY: y,
    head: [['SKU', 'Name', 'Category', 'Brand', 'Qty', 'Min', 'Unit Cost', 'Location', 'Condition', 'Status']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: BRAND_COLORS.dark, textColor: BRAND_COLORS.white, fontSize: 7.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 12, right: 12 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 9) {
        data.cell.styles.textColor = data.cell.raw === 'LOW' ? BRAND_COLORS.danger : BRAND_COLORS.success;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  
  const totalPagesExp = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPagesExp; i++) {
    doc.setPage(i);
    drawFooter(doc, i, totalPagesExp, company);
  }
  
  return doc;
}

// ─── ACCOUNTING REPORT PDF ─────────────────────────────────────────────────
export function generateAccountingReportPDF(data, company = null) {
  company = company || getCompanySettings();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  
  let y = drawHeader(doc, company, 'ACCOUNTING REPORT', `Generated ${formatDate(new Date().toISOString())}`, [
    ['Revenue', formatCurrency(data.totalRevenue)],
    ['Expenses', formatCurrency(data.totalExpenses)],
    ['Net Profit', formatCurrency(data.netProfit)],
  ]);
  y += 8;
  
  // Summary cards
  const cards = [
    ['Revenue', data.totalRevenue, BRAND_COLORS.success],
    ['Pending', data.pendingRevenue, BRAND_COLORS.warning],
    ['Expenses', data.totalExpenses, BRAND_COLORS.danger],
    ['Net Profit', data.netProfit, data.netProfit >= 0 ? BRAND_COLORS.primary : BRAND_COLORS.danger],
  ];
  
  cards.forEach(([label, value, color], i) => {
    const x = 14 + i * (pageW - 28) / 4;
    const w = (pageW - 28) / 4 - 4;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, w, 20, 2, 2, 'F');
    doc.setFillColor(...color);
    doc.rect(x, y, w, 1.5, 'F');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BRAND_COLORS.muted);
    doc.text(label, x + w / 2, y + 9, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...color);
    doc.text(formatCurrency(Math.abs(value)), x + w / 2, y + 17, { align: 'center' });
  });
  
  y += 28;
  
  if (data.invoices && data.invoices.length > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND_COLORS.textDark);
    doc.text('Invoices', 14, y);
    y += 4;
    
    autoTable(doc, {
      startY: y,
      head: [['Invoice #', 'Client', 'Amount', 'Status', 'Date']],
      body: data.invoices.map(inv => [
        inv.invoice_number,
        inv.client_name,
        formatCurrency(inv.total),
        (inv.status || '').toUpperCase(),
        formatDate(inv.created_at),
      ]),
      theme: 'striped',
      headStyles: { fillColor: BRAND_COLORS.dark, textColor: BRAND_COLORS.white, fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }
  
  const totalPagesExp = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPagesExp; i++) {
    doc.setPage(i);
    drawFooter(doc, i, totalPagesExp, company);
  }
  
  return doc;
}

// ─── COURIER SLIP PDF ──────────────────────────────────────────────────────
export function generateCourierSlipPDF(caseData, client, company = null) {
  company = company || getCompanySettings();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  
  // Border
  doc.setDrawColor(...BRAND_COLORS.primary);
  doc.setLineWidth(1.5);
  doc.rect(6, 6, pageW - 12, pageH - 12);
  
  // Header
  doc.setFillColor(...BRAND_COLORS.dark);
  doc.rect(6, 6, pageW - 12, 22, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_COLORS.white);
  doc.text('COURIER SLIP', pageW / 2, 16, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(180, 200, 220);
  doc.text(company.name || 'RecoverLab', pageW / 2, 22, { align: 'center' });
  
  let y = 36;
  
  // From
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(10, y, pageW - 20, 32, 2, 2, 'F');
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_COLORS.success);
  doc.text('FROM:', 14, y + 8);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(company.name || 'RecoverLab', 14, y + 16);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BRAND_COLORS.muted);
  if (company.address) doc.text(company.address, 14, y + 23, { maxWidth: pageW - 30 });
  if (company.phone) doc.text('Ph: ' + company.phone, 14, y + 30);
  
  y += 40;
  
  // To
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(10, y, pageW - 20, 36, 2, 2, 'F');
  doc.setFillColor(...BRAND_COLORS.primary);
  doc.rect(10, y, 2, 36, 'F');
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_COLORS.primary);
  doc.text('TO:', 16, y + 8);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text([client.first_name, client.last_name].filter(Boolean).join(' '), 16, y + 16);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BRAND_COLORS.muted);
  if (client.company) doc.text(client.company, 16, y + 23);
  const clientAddr = [client.address, client.city, client.state, client.pincode].filter(Boolean).join(', ');
  if (clientAddr) doc.text(clientAddr, 16, y + 30, { maxWidth: pageW - 28 });
  if (client.phone) doc.text('Ph: ' + client.phone, 16, y + 37);
  
  y += 44;
  
  // Case details
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(10, y, pageW - 20, 22, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BRAND_COLORS.muted);
  doc.text(`Case: ${caseData.case_number || '—'}`, 14, y + 8);
  doc.text(`Device: ${[caseData.device_brand, caseData.device_model].filter(Boolean).join(' ')}`, 14, y + 15);
  doc.text(`S/N: ${caseData.serial_number || '—'}`, 14, y + 22);
  
  y += 30;
  
  // Barcode-like dashes
  doc.setDrawColor(...BRAND_COLORS.primary);
  doc.setLineWidth(0.3);
  for (let i = 0; i < 30; i++) {
    const x = 14 + i * 5;
    doc.line(x, y, x, y + (i % 3 === 0 ? 10 : 6));
  }
  doc.setFontSize(7);
  doc.setTextColor(...BRAND_COLORS.muted);
  doc.text(caseData.case_number || '', pageW / 2, y + 14, { align: 'center' });
  
  return doc;
}

// ─── EXCEL EXPORT ─────────────────────────────────────────────────────────
export function exportToExcel(data, sheetName = 'Data', filename = 'export') {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportCasesToExcel(cases) {
  const data = cases.map(c => ({
    'Case Number': c.case_number,
    'Client': [c.first_name, c.last_name].filter(Boolean).join(' '),
    'Company': c.company || '',
    'Device Brand': c.device_brand || '',
    'Device Model': c.device_model || '',
    'Serial Number': c.serial_number || '',
    'Failure Type': c.failure_type || '',
    'Symptoms': (c.symptoms || []).join(', '),
    'Stage': c.stage || '',
    'Priority': c.priority === 1 ? 'Critical' : c.priority === 2 ? 'High' : 'Normal',
    'Engineer': c.engineer_name || '',
    'Progress %': c.recovery_progress_pct || 0,
    'Received At': formatDate(c.received_at),
    'Created At': formatDate(c.created_at),
  }));
  exportToExcel(data, 'Cases', 'cases_report');
}

export function exportStockToExcel(items) {
  const data = items.map(i => ({
    'SKU': i.sku || i.item_code || '',
    'Name': i.name || '',
    'Category': i.category || i.item_type || '',
    'Brand': i.brand || '',
    'Model': i.model || '',
    'Serial Number': i.serial_number || '',
    'PCB Number': i.pcb_number || '',
    'Quantity': i.quantity ?? 0,
    'Min Quantity': i.min_quantity ?? 0,
    'Unit Cost': i.unit_cost || 0,
    'Location': i.location || '',
    'Condition': i.condition || '',
    'Status': i.quantity <= (i.min_quantity || 0) ? 'Low Stock' : 'In Stock',
  }));
  exportToExcel(data, 'Stock', 'stock_report');
}

export function exportAccountingToExcel(invoices, expenses) {
  const wb = XLSX.utils.book_new();
  
  const invData = (invoices || []).map(i => ({
    'Invoice #': i.invoice_number,
    'Client': i.client_name,
    'Company': i.company || '',
    'Case #': i.case_number || '',
    'Subtotal': i.subtotal || 0,
    'Discount': i.discount_amt || 0,
    'GST': i.tax_amt || 0,
    'Total': i.total || 0,
    'Status': i.status,
    'Due Date': formatDate(i.due_date),
    'Created': formatDate(i.created_at),
    'Paid At': i.paid_at ? formatDate(i.paid_at) : '',
  }));
  
  const expData = (expenses || []).map(e => ({
    'Date': formatDate(e.date),
    'Category': e.category,
    'Description': e.description,
    'Vendor': e.vendor || '',
    'Amount': e.amount || 0,
    'Tax': e.tax_amt || 0,
    'Total': e.total || 0,
    'Status': e.status,
  }));
  
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invData), 'Invoices');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expData), 'Expenses');
  XLSX.writeFile(wb, `accounting_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Utility: save and open PDF
export function savePDF(doc, filename) {
  doc.save(`${filename}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function openPDFPreview(doc) {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
