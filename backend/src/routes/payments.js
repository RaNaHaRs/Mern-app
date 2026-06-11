const express = require('express');
const { query, transaction } = require('../config/database');
const { authenticate, requireMinRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../config/logger');
const automationService = require('../services/automationService');
const emailService = require('../services/emailService');
const { logActivity } = require('../utils/activityLogger');
const { isSuperAdmin, tenantAdminId, verifyCaseAccess, syncInvoiceFromCasePayment } = require('../utils/tenantAccess');
const { loadCompanySettings } = require('./settings');
const { formatNumberSequence, getCompanyNumberFormat, getCompanyNumberStart } = require('../utils/numberFormatting');

const router = express.Router();
router.use(authenticate);

// Payments routes
router.get('/case/:case_id', async (req, res) => {
  try {
    if (!isSuperAdmin(req.user) && !(await verifyCaseAccess(req.params.case_id, req.user))) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const result = await query(
      `SELECT p.*, q.estimated_cost, q.parts_cost, q.service_cost, q.total_amount as quoted_total, u.full_name as recorded_by_name
       FROM payments p
       LEFT JOIN quotations q ON p.quotation_id = q.id
       LEFT JOIN users u ON p.recorded_by = u.id
       WHERE p.case_id = $1 ORDER BY p.created_at DESC`,
      [req.params.case_id]
    );
    const summary = await query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE status='paid'),0) as total_paid, COALESCE(SUM(amount) FILTER (WHERE status='pending'),0) as pending FROM payments WHERE case_id = $1`,
      [req.params.case_id]
    );
    res.json({ payments: result.rows, summary: summary.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/quotations', requireMinRole('staff'), auditLog('create_quotation', 'payment'), async (req, res) => {
  try {
    const { case_id, estimated_cost, parts_cost, service_cost, tax_pct, valid_until, notes } = req.body;
    if (!isSuperAdmin(req.user) && !(await verifyCaseAccess(case_id, req.user))) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const total = parseFloat(estimated_cost || 0) * (1 + parseFloat(tax_pct || 18) / 100);
    const companySettings = await loadCompanySettings();
    const qNumResult = await query('SELECT COUNT(*) FROM quotations');
    const qCount = parseInt(qNumResult.rows[0].count, 10) || 0;
    const qStart = getCompanyNumberStart(companySettings, 'quote_number_start');
    const qSequence = qCount + qStart;
    const qNum = formatNumberSequence(
      getCompanyNumberFormat(companySettings, 'quote_number_format', 'QT-{YYYY}-{NNNN}'),
      qSequence
    );

    const result = await query(
      `INSERT INTO quotations (case_id, quote_number, estimated_cost, parts_cost, service_cost, tax_pct, total_amount, valid_until, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [case_id, qNum, estimated_cost, parts_cost||0, service_cost||0, tax_pct||18, total.toFixed(2), valid_until||null, notes||null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requireMinRole('staff'), auditLog('record_payment', 'payment'), async (req, res) => {
  try {
    const { 
      case_id, 
      quotation_id, 
      amount, 
      method, 
      reference_number, 
      notes, 
      status = 'paid', 
      gross_amount, 
      discount_amount, 
      discount_percentage,
      is_100_percent_discount = false 
    } = req.body;
    
    const parsedAmount = parseFloat(amount || 0);
    const parsedGrossAmount = parseFloat(gross_amount || 0);
    const parsedDiscountAmount = parseFloat(discount_amount || 0);
    const parsedDiscountPercentage = parseFloat(discount_percentage || 0);
    
    // Validate inputs
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ error: 'Payment amount must be a valid non-negative number' });
    }
    
    // If gross_amount provided, calculate collectable amount
    let calculatedCollectableAmount = parsedAmount;
    let finalGrossAmount = parsedGrossAmount || parsedAmount;
    let finalDiscountAmount = parsedDiscountAmount;
    let finalDiscountPercentage = parsedDiscountPercentage;
    
    // Calculate discount if gross_amount and discount provided
    if (parsedGrossAmount > 0) {
      if (parsedDiscountAmount > 0) {
        // Discount amount provided
        finalDiscountAmount = Math.min(parsedDiscountAmount, parsedGrossAmount);
        calculatedCollectableAmount = Math.max(0, parsedGrossAmount - parseFloat(finalDiscountAmount));
        finalDiscountPercentage = (finalDiscountAmount / parsedGrossAmount * 100).toFixed(2);
      } else if (parsedDiscountPercentage > 0) {
        // Discount percentage provided
        finalDiscountPercentage = Math.min(parsedDiscountPercentage, 100);
        finalDiscountAmount = parsedGrossAmount * finalDiscountPercentage / 100;
        calculatedCollectableAmount = Math.max(0, parsedGrossAmount - finalDiscountAmount);
      }
    }
    
    // Convert to proper numbers for calculations
    finalDiscountAmount = parseFloat(finalDiscountAmount || 0);
    finalDiscountPercentage = parseFloat(finalDiscountPercentage || 0);
    calculatedCollectableAmount = Math.max(0, parseFloat(calculatedCollectableAmount || 0));
    
    // Round collectable amount to 2 decimal places to avoid floating point issues
    calculatedCollectableAmount = Math.round(calculatedCollectableAmount * 100) / 100;
    
    // Check if it's 100% discount
    const isFullDiscount = finalDiscountPercentage >= 100 || calculatedCollectableAmount === 0;
    
    // Validate discount range (but allow 0 payments for 100% discount)
    if (finalDiscountPercentage > 100) {
      return res.status(400).json({ 
        error: 'Discount cannot exceed 100%',
        provided: finalDiscountPercentage,
        max: 100
      });
    }
    
    if (finalDiscountPercentage < 0) {
      return res.status(400).json({ error: 'Discount cannot be negative' });
    }
    
    if (!isSuperAdmin(req.user) && !(await verifyCaseAccess(case_id, req.user))) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    let caseInfo = {};
    let caseRow = {};
    
    const result = await transaction(async (client) => {
      // Prepare payment record values
      const recordedAmount = calculatedCollectableAmount >= 0 ? calculatedCollectableAmount : 0;
      const recordedMethod = isFullDiscount ? '100% Discount' : (method || 'cash');
      const recordedNotes = isFullDiscount 
        ? `100% discount applied (₹${parsedGrossAmount} - ₹${finalDiscountAmount}). ${notes || ''}` 
        : (notes || null);
      
      // Insert payment with all discount details
      const pay = await client.query(
        `INSERT INTO payments (
          case_id, quotation_id, amount, gross_amount, discount_amount, 
          discount_percentage, collectable_amount, method, reference_number, 
          status, paid_at, notes, recorded_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,${status === 'paid' ? 'NOW()' : 'NULL'},$11,$12) 
        RETURNING *`,
        [
          case_id, 
          quotation_id || null, 
          recordedAmount, 
          finalGrossAmount || 0,
          finalDiscountAmount || 0,
          finalDiscountPercentage || 0,
          calculatedCollectableAmount >= 0 ? calculatedCollectableAmount : 0,
          recordedMethod, 
          reference_number || null, 
          status, 
          recordedNotes, 
          req.user.id
        ]
      );
      
      // Update accounting and pending amounts
      if (status === 'paid') {
        // Set pending_amount to 0 for 100% discount or when fully paid
        if (isFullDiscount || calculatedCollectableAmount === 0) {
          await client.query(
            `UPDATE cases SET pending_amount = 0, updated_at = NOW() WHERE id = $1`,
            [case_id]
          );
          
          // Mark invoice as paid without adding to total_paid
          await client.query(
            `UPDATE accounting_invoices 
             SET amount_paid = total, status = 'paid', updated_at = NOW()
             WHERE case_id = $1`,
            [case_id]
          );
        } else {
          // Normal payment - deduct from pending_amount and add to client total_paid
          await client.query(
            `UPDATE cases 
             SET pending_amount = GREATEST(0, pending_amount - $1), updated_at = NOW()
             WHERE id = $2`,
            [calculatedCollectableAmount, case_id]
          );
          
          await client.query(
            'UPDATE clients SET total_paid = COALESCE(total_paid,0) + $1 WHERE id = (SELECT client_id FROM cases WHERE id = $2)',
            [calculatedCollectableAmount, case_id]
          );
        }
        
        await syncInvoiceFromCasePayment(client, case_id);
      }
      
      return pay.rows[0];
    });
    
    try {
      caseInfo = await query(
        `SELECT c.case_number, c.pending_amount, cl.email, cl.first_name, cl.company
         FROM cases c
         LEFT JOIN clients cl ON c.client_id = cl.id
         WHERE c.id = $1`,
        [case_id]
      );
      caseRow = caseInfo.rows[0] || {};
      
      // Send payment received email if client email exists
      if (status === 'paid' && caseRow.email) {
        try {
          const emailResult = await emailService.sendPaymentReceivedEmail({
            to: caseRow.email,
            clientName: caseRow.first_name || 'Valued Client',
            caseNumber: caseRow.case_number || 'N/A',
            amount: finalGrossAmount,
            paymentMethod: recordedMethod,
            discount: finalDiscountPercentage > 0 ? `${finalDiscountPercentage}%` : null,
            finalAmount: calculatedCollectableAmount,
          });

          if (emailResult.success) {
            await logActivity({
              user: req.user,
              action: 'PAYMENT_CONFIRMATION_EMAIL_SENT',
              module: 'payments',
              resourceType: 'payment',
              resourceId: result.id,
              title: 'Payment Confirmation Email Sent',
              description: `Payment confirmation email sent to ${caseRow.email}`,
              metadata: {
                case_id,
                case_number: caseRow.case_number,
                recipient_email: caseRow.email,
                gross_amount: finalGrossAmount,
                discount_amount: finalDiscountAmount,
                collectable_amount: calculatedCollectableAmount,
                remaining_pending: caseRow.pending_amount - calculatedCollectableAmount,
              },
            });
          }
        } catch (emailErr) {
          logger.warn('Failed to send payment confirmation email', {
            case_id,
            email: caseRow.email,
            error: emailErr.message
          });
        }
      }
      
      // Emit automation event
      const eventType = status === 'paid' ? 'PAYMENT_RECEIVED'
                      : status === 'pending' ? 'PAYMENT_PENDING'
                      : status === 'overdue' ? 'PAYMENT_OVERDUE'
                      : null;
      
      if (eventType) {
        await automationService.handleEvent(eventType, {
          case_id,
          case_number: caseRow.case_number || '',
          name: caseRow.first_name || 'Client',
          email: caseRow.email || '',
          amount: calculatedCollectableAmount,
          gross_amount: finalGrossAmount,
          discount_amount: finalDiscountAmount,
          discount_percentage: finalDiscountPercentage,
          payment_method: recordedMethod,
          payment_status: status,
          is_100_percent_discount: isFullDiscount,
          remaining_pending: Math.max(0, (caseRow.pending_amount || 0) - calculatedCollectableAmount)
        });
      }
    } catch (eventErr) {
      logger.warn('Payment event emission failed:', eventErr.message);
    }
    
    res.status(201).json({
      ...result,
      gross_amount: finalGrossAmount,
      discount_amount: finalDiscountAmount,
      discount_percentage: finalDiscountPercentage,
      collectable_amount: calculatedCollectableAmount,
      is_100_percent_discount: isFullDiscount,
      remaining_pending: Math.max(0, (caseRow.pending_amount || 0) - calculatedCollectableAmount)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/quotations/:id/approve', requireMinRole('staff'), async (req, res) => {
  try {
    const { approved } = req.body;
    if (!isSuperAdmin(req.user)) {
      const access = await query(
        `SELECT q.id FROM quotations q
         WHERE q.id = $1 AND q.tenant_id = $2`,
        [req.params.id, tenantAdminId(req.user)]
      );
      if (!access.rows.length) return res.status(404).json({ error: 'Quotation not found' });
    }
    const result = await query(
      `UPDATE quotations SET approved_by_client = $1, approved_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *`,
      [approved, req.params.id]
    );
    if (approved) {
      // Auto-transition case to approved
      await query(`UPDATE cases SET stage = 'approved', updated_at = NOW() WHERE id = (SELECT case_id FROM quotations WHERE id = $1) AND stage = 'quotation'`, [req.params.id]);
    }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
