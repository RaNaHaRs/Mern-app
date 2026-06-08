const fs = require('fs');
const path = require('path');
const PDFDoc = require('pdfkit');

const INWARD_PDF_DIR = path.join(process.cwd(), 'uploads', 'inward-pdfs');
if (!fs.existsSync(INWARD_PDF_DIR)) {
  fs.mkdirSync(INWARD_PDF_DIR, { recursive: true });
}

function normalizeText(value) {
  if (value === undefined || value === null) return '—';
  if (value === 'undefined' || value === 'null') return '—';
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || '—';
  return String(value).trim() || '—';
}

function safeFilename(value) {
  if (value === 'undefined' || value === 'null') return 'case';
  return String(value || 'case').replace(/[^a-zA-Z0-9-_\.]/g, '_');
}

function buildAttachmentMetadata(filePath) {
  if (!filePath) return null;
  const fileName = path.basename(filePath);
  return {
    fileName: safeFilename(fileName),
    filePath: filePath,
    mimeType: 'application/pdf',
  };
}

function writePdfContent(doc, caseData = {}) {
  doc.fontSize(18).font('Helvetica-Bold').text('Inward Form / Job Card', { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(10).font('Helvetica');
  const companyName = normalizeText(caseData.company_name || caseData.company || caseData.client_name || caseData.name || 'RecoverLab');
  doc.text(`Company / Clinic: ${companyName}`);
  doc.text(`Created on: ${normalizeText(caseData.created_at ? new Date(caseData.created_at).toLocaleString() : '')}`);
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').text('Case Details', { underline: true });
  doc.moveDown(0.3);
  doc.font('Helvetica').text(`Case Number: ${normalizeText(caseData.case_number)}`);
  doc.text(`Client Name: ${normalizeText(caseData.client_name || [caseData.first_name, caseData.last_name].filter(Boolean).join(' '))}`);
  doc.text(`Client Email: ${normalizeText(caseData.email)}`);
  doc.text(`Client Phone: ${normalizeText(caseData.phone)}`);
  doc.text(`Device Brand: ${normalizeText(caseData.device_brand)}`);
  doc.text(`Device Model: ${normalizeText(caseData.device_model)}`);
  doc.text(`Serial Number: ${normalizeText(caseData.serial_number)}`);
  doc.text(`Failure Type: ${normalizeText(caseData.failure_type)}`);
  doc.text(`Priority: ${normalizeText(caseData.priority)}`);
  if (caseData.deadline_at) {
    const d = new Date(caseData.deadline_at);
    doc.text(`Deadline: ${isNaN(d.getTime()) ? '—' : d.toLocaleDateString()}`);
  }
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').text('Symptoms / Notes', { underline: true });
  doc.moveDown(0.3);
  doc.font('Helvetica').text(normalizeText(caseData.symptom_notes || caseData.problem_description || caseData.symptoms), { paragraphGap: 4 });
  doc.moveDown(0.5);

  if (caseData.quotation_amount !== undefined && caseData.quotation_amount !== null) {
    doc.font('Helvetica-Bold').text('Quotation Summary', { underline: true });
    doc.moveDown(0.3);
    doc.font('Helvetica').text(`Estimated Cost: ${normalizeText(caseData.quotation_amount)}`);
    doc.text(`Advance Paid: ${normalizeText(caseData.advance_amount)}`);
    doc.text(`Balance: ${normalizeText(caseData.balance_remaining)}`);
    doc.moveDown(0.5);
  }

  doc.font('Helvetica-Bold').text('Signature', { underline: true });
  doc.moveDown(1);
  doc.font('Helvetica').text('Customer Signature: _____________________________');
  doc.moveDown(0.5);
  doc.text('Authorized Technician: _____________________________');
}

async function generateCaseInwardPdf(caseData = {}) {
  const caseNumber = safeFilename(caseData.case_number || caseData.id || 'case');
  const fileName = `inward-${caseNumber}.pdf`;
  const filePath = path.join(INWARD_PDF_DIR, fileName);

  return new Promise((resolve, reject) => {
    const doc = new PDFDoc({ size: 'A4', margin: 40 });
    const stream = fs.createWriteStream(filePath);

    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
    doc.on('error', reject);

    doc.pipe(stream);
    writePdfContent(doc, caseData);
    doc.end();
  });
}

async function generateEmailSummaryPdf(caseData = {}) {
  const caseNumber = safeFilename(caseData.case_number || caseData.id || 'case');
  const fileName = `summary-${caseNumber}.pdf`;
  const filePath = path.join(INWARD_PDF_DIR, fileName);
  const companyName = normalizeText(caseData.company_name || caseData.company || caseData.client_name || caseData.name || 'RecoverLab');
  const clientName = normalizeText(caseData.client_name || [caseData.first_name, caseData.last_name].filter(Boolean).join(' '));

  return new Promise((resolve, reject) => {
    const doc = new PDFDoc({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);

    stream.on('finish', () => resolve({
      filePath,
      fileName: `summary-${caseNumber}.pdf`,
      mimeType: 'application/pdf',
    }));
    stream.on('error', reject);
    doc.on('error', reject);

    doc.pipe(stream);

    // ── Header bar ──
    doc.rect(0, 0, 595, 90).fill('#1a365d');
    doc.fillColor('#ffffff');
    doc.fontSize(22).font('Helvetica-Bold').text('CASE SUMMARY', 50, 28);
    doc.fontSize(9).font('Helvetica').text(companyName, 50, 58);
    doc.fontSize(8).text(new Date().toLocaleString(), 50, 73);

    // ── Case number badge ──
    const cn = normalizeText(caseData.case_number || '—');
    doc.fontSize(13).font('Helvetica-Bold');
    const cnWidth = doc.widthOfString(cn);
    const badgeX = 595 - 50 - cnWidth - 28;
    doc.roundedRect(badgeX, 30, cnWidth + 28, 32, 4).fill('#2b6cb0');
    doc.fillColor('#ffffff').fontSize(13).font('Helvetica-Bold').text(cn, badgeX + 14, 38);

    doc.y = 110;

    // ── Client & Device info in two columns ──
    const colX = 50;
    const col2X = 310;
    const labelW = 80;

    doc.fillColor('#1a365d').fontSize(9).font('Helvetica-Bold');
    doc.text('CLIENT INFORMATION', colX, doc.y);
    doc.fillColor('#000000').fontSize(9).font('Helvetica');

    const clientFields = [
      ['Name', clientName],
      ['Email', normalizeText(caseData.email)],
      ['Phone', normalizeText(caseData.phone)],
    ];
    let yPos = doc.y + 14;
    const rowH = 16;
    clientFields.forEach(([label, val]) => {
      doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text(label, colX, yPos + 3);
      doc.fillColor('#000000').fontSize(9).font('Helvetica').text(val, colX + labelW, yPos + 2);
      yPos += rowH;
    });

    doc.fillColor('#1a365d').fontSize(9).font('Helvetica-Bold');
    doc.text('DEVICE INFORMATION', col2X, 124);
    doc.fillColor('#000000').fontSize(9).font('Helvetica');

    const deviceFields = [
      ['Brand', normalizeText(caseData.device_brand)],
      ['Model', normalizeText(caseData.device_model)],
      ['Serial', normalizeText(caseData.serial_number)],
      ['Failure', normalizeText(caseData.failure_type)],
    ];
    let yDev = 124 + 14;
    deviceFields.forEach(([label, val]) => {
      doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text(label, col2X, yDev + 3);
      doc.fillColor('#000000').fontSize(9).font('Helvetica').text(val, col2X + labelW, yDev + 2);
      yDev += rowH;
    });

    // sync y to the taller column
    doc.y = Math.max(yPos, yDev) + 8;

    // ── Divider ──
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
    doc.y += 10;

    // ── Problem description ──
    if (caseData.problem_description || caseData.symptom_notes) {
      doc.fillColor('#1a365d').fontSize(9).font('Helvetica-Bold').text('PROBLEM DESCRIPTION');
      doc.y += 12;
      doc.fillColor('#000000').fontSize(9).font('Helvetica');
      doc.text(normalizeText(caseData.problem_description || caseData.symptom_notes), { paragraphGap: 4 });
      doc.y += 8;
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
      doc.y += 10;
    }

    // ── Quotation Summary (only shown when amount > 0) ──
    const total = parseFloat(caseData.quotation_amount || caseData.total_amount || 0);
    const advance = parseFloat(caseData.advance_amount || 0);
    if (total > 0) {
      const balance = Math.max(0, total - advance);

      doc.fillColor('#1a365d').fontSize(9).font('Helvetica-Bold').text('QUOTATION SUMMARY');
      doc.y += 10;

      // Draw a light table
      const tableTop = doc.y;
      const cols = [
        { x: 50,  w: 150, label: 'Description' },
        { x: 200, w: 110, label: 'Amount' },
      ];

      // Header row
      doc.rect(50, tableTop, 260, 20).fill('#f7fafc');
      doc.fillColor('#1a365d').fontSize(8).font('Helvetica-Bold');
      cols.forEach(c => doc.text(c.label, c.x + 6, tableTop + 5, { width: c.w }));
      doc.y = tableTop + 20;

      // Data rows
      const rows = [
        ['Total Amount', total.toFixed(2)],
        ['Advance Paid', advance.toFixed(2)],
        ['Balance', balance.toFixed(2)],
      ];
      rows.forEach(([desc, amt], i) => {
        const rY = doc.y;
        if (i % 2 === 0) doc.rect(50, rY, 260, 20).fill('#f7fafc');
        doc.fillColor('#000000').fontSize(9).font('Helvetica');
        doc.text(desc, 56, rY + 5, { width: 144 });
        doc.font('Helvetica-Bold').text(amt, 206, rY + 5, { width: 104, align: 'right' });
        doc.y = rY + 20;
      });

      // Table border
      doc.rect(50, tableTop, 260, doc.y - tableTop).strokeColor('#e2e8f0').stroke();
      doc.y += 8;
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
      doc.y += 10;
    }

    // ── Footer ──
    doc.fontSize(7).font('Helvetica').fillColor('#a0aec0');
    doc.text('This is a computer-generated document from RecoverLab CRM.', 50, 770, { align: 'center' });

    doc.end();
  });
}

module.exports = {
  generateCaseInwardPdf,
  generateEmailSummaryPdf,
  normalizeText,
  safeFilename,
  buildAttachmentMetadata,
};
