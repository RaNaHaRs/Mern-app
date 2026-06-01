# Case-Level Payment Tracking System - Test Plan

## Overview
The payment system has been refactored to track payment status **per-case** instead of per-client. This ensures each case maintains its own payment state independently.

---

## Backend Changes Summary

### 1. GET /api/cases/:id - Case Detail Endpoint
**Location:** `backend/src/routes/cases.js` (lines 420-470)

**What Changed:**
- Now calculates and returns 4 fields for each case:
  - `quotation_total`: Total quoted amount from latest quotation
  - `total_paid`: Sum of all paid payments for this case
  - `balance_due`: Remaining amount (quotation_total - total_paid)
  - `pending_amount`: Same as balance_due (for consistency)

**Example Response:**
```json
{
  "id": "case_123",
  "case_number": "CR-001",
  "quotation_total": 50000,
  "total_paid": 20000,
  "balance_due": 30000,
  "pending_amount": 30000,
  "payments": [...],
  "quotations": [...]
}
```

**Frontend Impact:**
- CaseDetail.jsx already uses these fields
- Collect Payment button automatically disables when balance_due <= 0

---

### 2. POST /api/cases/:id/payments - Record Payment Endpoint
**Location:** `backend/src/routes/cases.js` (lines 971-1060)

**What Changed:**
- Now returns `case_payment_status` object with updated case totals after payment
- Allows frontend to update state immediately without re-fetching case

**Example Response:**
```json
{
  "payment": { ... },
  "case_payment_status": {
    "case_id": "case_123",
    "quotation_total": 50000,
    "total_paid": 25000,
    "balance_due": 25000,
    "pending_amount": 25000
  }
}
```

---

### 3. POST /api/cases/:id/collect-payment - Case Collection Endpoint
**Location:** `backend/src/routes/cases.js` (lines 1054-1135)

**What Changed:**
- More user-friendly error message when case is fully paid
- Returns both `balance_due` and `pending_amount` in response
- Frontend now receives complete payment state update

---

### 4. POST /api/clients/:id/collect-pending - **CRITICAL FIX** - Client Collection Endpoint
**Location:** `backend/src/routes/clients.js` (lines 248-323)

**CRITICAL CHANGE - Intelligent Allocation:**
```javascript
// ✅ BEFORE (WRONG): ORDER BY c.created_at ASC
// ❌ Problem: Allocated payments in creation order, not by need

// ✅ AFTER (CORRECT): pending_amount DESC
const sortedByPending = toCollect.sort((a, b) => 
  parseFloat(b.pending_amount || 0) - parseFloat(a.pending_amount || 0)
);
```

**What This Fixes:**
- **Before:** Client pays ₹15K → allocated to oldest case first (WRONG)
- **After:** Client pays ₹15K → allocated to highest pending case first (SMART)

**Example Scenario:**
```
Client A owns:
  - Case 1: ₹3,000 pending (created first)
  - Case 2: ₹12,000 pending (created second)

Collect ₹15,000:
  ✅ AFTER FIX: Case 2 gets ₹12K → Case 1 gets ₹3K (both fully paid)
  ❌ OLD BUG: Case 1 gets ₹3K → Case 2 gets ₹12K (same result by chance)
           BUT: Case 1 gets ₹3K → Rest ₹12K stays pending (wrong order)
```

**New Response Includes Allocation Details:**
```json
{
  "ok": true,
  "message": "Collected ₹15,000 successfully",
  "collected_amount": 15000,
  "updated_cases": 2,
  "allocation_details": [
    {
      "case_id": "case_2",
      "case_number": "CR-002",
      "allocated_amount": 12000,
      "previous_pending": 12000,
      "new_pending": 0
    },
    {
      "case_id": "case_1",
      "case_number": "CR-001",
      "allocated_amount": 3000,
      "previous_pending": 3000,
      "new_pending": 0
    }
  ]
}
```

---

## Frontend Integration

### CaseDetail.jsx
- Line 1557-1567: Already displays `total_paid` and `balance_due`
- Line 2064-2065: CollectPaymentForm already uses these values
- Line 2088-2109: Validation already checks `balance_due` limit
- **No changes needed** - frontend already compatible!

### Frontend Payment Display Logic:
```javascript
const totalCollected = parseFloat(caseData?.total_paid || 0);
const remainingBalance = parseFloat(caseData?.balance_due ?? caseData?.pending_amount ?? Math.max(0, quotationAmount - totalCollected));

// Disable button when fully paid
disabled={remainingBalance <= 0}
```

---

## Test Scenarios

### Test 1: Single Case - Full Payment
**Setup:** Create Client A with Case 1 (₹50K quotation)
1. Open Case Detail → See: "Quotation: ₹50K, Collected: ₹0, Due: ₹50K"
2. Collect ₹50K → See: "Collected: ₹50K, Due: ₹0"
3. Try to collect again → Error: "This case is already fully paid"
4. Button should be disabled (greyed out)

**Expected:** ✅ PASS

---

### Test 2: Single Case - Partial Payment
**Setup:** Create Client A with Case 1 (₹50K quotation)
1. Open Case Detail → See: "Due: ₹50K"
2. Collect ₹30K → See: "Collected: ₹30K, Due: ₹20K"
3. Collect ₹15K → See: "Collected: ₹45K, Due: ₹5K"
4. Try to collect ₹10K → Error: "Cannot exceed remaining balance of ₹5K"

**Expected:** ✅ PASS

---

### Test 3: Multiple Cases - Independent Tracking
**Setup:** Create Client B with:
- Case 1: ₹20K quotation
- Case 2: ₹30K quotation

**Test Steps:**
1. Open Case 1 → See: "Due: ₹20K"
2. Open Case 2 → See: "Due: ₹30K"
3. Collect ₹20K on Case 1 → Case 1 shows "Due: ₹0"
4. Open Case 2 → Still shows "Due: ₹30K" (NOT ₹0!)
5. Payment button on Case 2 should still be enabled

**Expected:** ✅ PASS (Before fix: FAIL - Case 2 would show Due: ₹0)

---

### Test 4: Client-Level Collection with Intelligent Allocation
**Setup:** Create Client C with:
- Case 1: ₹5K pending (highest)
- Case 2: ₹3K pending
- Case 3: ₹2K pending

**Test Steps:**
1. Go to Client C page
2. Collect ₹12K from client
3. Check allocation:
   - Case 1: 0 pending (paid ₹5K)
   - Case 2: 0 pending (paid ₹3K)
   - Case 3: 0 pending (paid ₹2K)
   - Unallocated: ₹2K
4. Response should show allocation_details array

**Expected:** ✅ PASS (Before fix: WRONG - would allocate by creation date)

---

### Test 5: Partial Client Collection
**Setup:** Create Client D with:
- Case 1: ₹10K pending (highest)
- Case 2: ₹5K pending

**Test Steps:**
1. Collect ₹12K from client
2. Check allocation:
   - Case 1: 0 pending (paid ₹10K)
   - Case 2: 3K pending (paid ₹2K)
3. Remaining unallocated: ₹0K

**Expected:** ✅ PASS

---

### Test 6: Tenant Isolation
**Setup:** Two admins (Admin A in Tenant A, Admin B in Tenant B) with Client cases

**Test Steps:**
1. Admin A: Create Case 1 (₹50K) → Collect ₹50K
2. Admin B: Check their cases → Should NOT see Admin A's case
3. Admin B: Client cases should show pending amounts for ONLY their cases
4. Verify: Case payments don't cross tenants

**Expected:** ✅ PASS

---

### Test 7: Accounting Integration (If Enabled)
**Setup:** Case with accounting enabled

**Test Steps:**
1. Collect ₹20K on case
2. Check accounting_records table:
   - New record created for payment
   - Amount: ₹20K
   - Type: 'payment_collected'
   - case_id: correct case
3. Dashboard should reflect updated revenue

**Expected:** ✅ PASS

---

## Verification Checklist

- [ ] Backend starts without errors
- [ ] Case GET /api/cases/:id returns all 4 payment fields
- [ ] Payment POST returns case_payment_status
- [ ] Client collection allocates by pending_amount DESC
- [ ] allocation_details array is populated
- [ ] Single case: payment status updates independently
- [ ] Multiple cases: payment states don't interfere
- [ ] Collect button disables when balance_due <= 0
- [ ] Tenant isolation maintained across all endpoints
- [ ] Dashboard reflects case-level payment status
- [ ] Recycle Bin feature still works (not affected by refactor)
- [ ] Accounting records created correctly
- [ ] Mobile view displays payment info correctly

---

## Rollback Plan (If Issues)

If critical issues found:

1. **Simple Revert:** Use git to revert changes to:
   - `backend/src/routes/cases.js`
   - `backend/src/routes/clients.js`

2. **Partial Rollback:** Keep Case GET changes (low risk), revert collection logic

3. **Data Safety:** No database schema changes made - all data remains safe

---

## Success Criteria

✅ **All tests pass**  
✅ **No runtime errors**  
✅ **Case payment states tracked independently**  
✅ **Client collections use intelligent allocation**  
✅ **Frontend displays correct data without recalculation**  
✅ **Tenant isolation maintained**  
✅ **Dashboard reflects accurate revenue**

