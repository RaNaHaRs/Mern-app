# Razorpay Payment Link Generation - Troubleshooting Guide

**Date:** June 8, 2026

---

## 🔴 Issue: Payment Link Not Generating

### Symptoms:
- Button "Generate Razorpay Payment Link" doesn't respond
- No error message shown
- Payment link not created

---

## 🔍 Root Cause Analysis

### Issue #1: Missing/Invalid Razorpay Credentials ⚠️

**The Problem:**
- Razorpay credentials might not be saved properly in the database
- `loadSavedRazorpayCredentials()` returns undefined values
- Backend returns: "Razorpay is not configured"

**How to Check:**
1. Navigate to: **Super Admin → Email Deliverability**
2. Scroll to **Razorpay Section**
3. Check if Key ID and Key Secret are filled
4. Look for "Connected & Verified" status

**Fix:**
If credentials are not showing:
1. Enter credentials in Email Deliverability tab
2. For test mode, use:
   ```
   Key ID: rzp_test_xxxxxxxxxxxx
   Key Secret: xxxxxxxxxxxxxxxxxxxx
   Webhook Secret: whsec_xxxxxxxxxxxx
   ```
3. Click **Save SMTP Settings** button
4. You should see confirmation toast: "SMTP settings saved!"

**Database Check (Advanced):**
```sql
-- Check if Razorpay settings are saved
SELECT key, value FROM platform_settings WHERE key = 'company';

-- Should show JSON with razorpay fields:
-- { "razorpay_key_id": "rzp_test_xxx", "razorpay_key_secret": "xxx", ... }
```

---

### Issue #2: Form Validation Errors 🚫

**The Problem:**
- Form fields are empty or invalid
- Backend returns validation error (422)

**How to Check:**
1. Open browser **Developer Console** (F12)
2. Click "Generate Razorpay Payment Link"
3. Check for console errors
4. Look for network tab request to `/api/super-admin/razorpay/create-order`
5. Check response - should show validation errors

**Required Fields:**
- ✅ Admin Name (required)
- ✅ Admin Email (required, valid format)
- ✅ Company Name (required)
- ✅ Plan (required, selected)
- ✅ Subscription months (required, ≥1)

**Fix:**
Fill all required fields in the form:
1. Admin Name: Full name
2. Admin Email: Valid email address
3. Company Name: Company/Lab name
4. Initial Password: Min 8 characters
5. Plan: Select from dropdown
6. Duration: Select months

---

### Issue #3: Database Error 💾

**The Problem:**
- `saas_purchases` table missing columns
- Cannot insert payment record

**How to Check:**
1. Check server logs for error message
2. Look for SQL error about column

**Fix - Run Migration:**
```sql
-- Check if table exists
SELECT * FROM saas_purchases LIMIT 1;

-- If columns missing, add them:
ALTER TABLE saas_purchases ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE saas_purchases ADD COLUMN IF NOT EXISTS reference_number VARCHAR(255);
ALTER TABLE saas_purchases ADD COLUMN IF NOT EXISTS refund_id VARCHAR(255);
ALTER TABLE saas_purchases ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(12, 2);
ALTER TABLE saas_purchases ADD COLUMN IF NOT EXISTS refund_reason TEXT;
ALTER TABLE saas_purchases ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP;
ALTER TABLE saas_purchases ADD COLUMN IF NOT EXISTS created_by UUID;
```

---

### Issue #4: Razorpay API Error 🔌

**The Problem:**
- Error from Razorpay service (invalid credentials, API issue)
- "Failed to create payment: ..."

**How to Check:**
1. Server logs show exact Razorpay error
2. Browser alert shows error message
3. Network tab shows 500 response

**Common Razorpay Errors:**
```
"Invalid key_id"
→ Check credentials in settings

"Invalid key_secret"
→ Check credentials in settings

"Authentication failed"
→ Credentials don't match

"Bad Request"
→ Invalid amount or other parameter

"Service Unavailable"
→ Razorpay API is down (check status.razorpay.com)
```

**Fix:**
1. Verify credentials are 100% correct
2. Test credentials with curl:
   ```bash
   curl https://api.razorpay.com/v1/orders \
     -H "Authorization: Basic BASE64_ENCODED_CREDENTIALS" \
     -X POST
   ```
3. If still failing, contact Razorpay support

---

### Issue #5: Network/CORS Error 🌐

**The Problem:**
- Network request fails
- CORS error in console
- Request blocked

**How to Check:**
1. Open Developer Console → Network tab
2. Click "Generate Razorpay"
3. Look for failed request to `/api/super-admin/razorpay/create-order`
4. Check response status and headers

**Fix:**
1. Check server is running
2. Check API endpoint URL is correct
3. Verify authorization header is set (Bearer token)

---

## ✅ Step-by-Step Testing

### Step 1: Verify Backend is Running
```bash
# Test backend health
curl http://localhost:5000/health
# Should return 200 OK
```

### Step 2: Verify Razorpay Settings Are Saved
```bash
# Check settings
curl http://localhost:5000/api/super-admin/razorpay-settings \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "razorpay_key_id": "rzp_test_xxxxx",
  "razorpay_key_secret": "[REDACTED]",
  "razorpay_webhook_secret": "[REDACTED]"
}
```

### Step 3: Test Create Order Endpoint
```bash
curl -X POST http://localhost:5000/api/super-admin/razorpay/create-order \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 2499,
    "plan_key": "professional",
    "plan_label": "Professional",
    "months": 1,
    "coupon_code": null,
    "discount_amount": 0
  }'
```

**Expected Response:**
```json
{
  "order_id": "order_XXXXX",
  "purchase_id": "uuid",
  "amount": 249900,
  "currency": "INR",
  "key_id": "rzp_test_xxxxx"
}
```

### Step 4: Test Form in UI
1. Open Super Admin → Tenants tab
2. Click "Add New Subscriber"
3. Fill all required fields
4. Select plan
5. Click "Generate Razorpay Payment Link"
6. Should see Razorpay checkout modal

---

## 📋 Comprehensive Checklist

### Configuration:
- [ ] Razorpay account created and API keys obtained
- [ ] Keys entered in Email Deliverability → Razorpay section
- [ ] Settings saved (green toast shown)
- [ ] Database has 'company' record in platform_settings

### Form:
- [ ] Admin Name filled
- [ ] Admin Email valid
- [ ] Company Name filled
- [ ] Initial Password min 8 chars
- [ ] Plan selected
- [ ] Duration selected

### Backend:
- [ ] Server running (port 5000 or configured port)
- [ ] Database connected
- [ ] razorpayService.js updated with createRefund method
- [ ] super-admin.js has create-order endpoint

### Frontend:
- [ ] PaymentManagement.jsx component created
- [ ] SuperAdminPage.jsx has updated handleRazorpay function
- [ ] Browser console has no errors
- [ ] Network tab shows successful API calls

---

## 🛠️ Advanced Debugging

### Enable Debug Logging:

**Backend (.env):**
```
LOG_LEVEL=debug
DEBUG=razorpay:*
```

**Frontend (console):**
```javascript
// Paste in browser console to enable debug logs
localStorage.setItem('DEBUG', 'razorpay:*');
location.reload();
```

### Check Database Records:

```sql
-- Check if purchase was created
SELECT id, tenant_user_id, amount, months, status, razorpay_order_id 
FROM saas_purchases 
ORDER BY created_at DESC 
LIMIT 5;

-- Check if order has razorpay_order_id
SELECT * FROM saas_purchases 
WHERE razorpay_order_id IS NOT NULL 
ORDER BY created_at DESC;
```

### Check Server Logs:

```bash
# For development
npm run dev 2>&1 | grep -i razorpay

# For production
tail -f /var/log/mern-app.log | grep -i razorpay
```

---

## 🔧 Recent Fixes Applied

### Fixed Issues:
1. ✅ **Optional tenant_user_id** - Can now create orders without tenant yet
2. ✅ **Better error messages** - Shows what's wrong
3. ✅ **Razorpay validation** - Checks credentials before attempting order
4. ✅ **Script loading** - Better handling of Razorpay script loading
5. ✅ **Error handling** - Proper try-catch with console logging

### Code Changes:
- Backend: `/razorpay/create-order` - Made `tenant_user_id` optional
- Frontend: `handleRazorpay()` - Added better error messages and validation
- Both: Better logging for debugging

---

## 📞 Quick Support Checklist

**Before contacting support, verify:**

1. **Is Razorpay configured?**
   - [ ] Go to Email Deliverability
   - [ ] Check Razorpay section
   - [ ] Credentials are filled and saved

2. **Are credentials correct?**
   - [ ] Copy from Razorpay dashboard
   - [ ] No extra spaces
   - [ ] In test mode (rzp_test_xxxx)

3. **Database okay?**
   - [ ] Can login to super admin
   - [ ] Can view settings

4. **Browser console clear?**
   - [ ] No JavaScript errors
   - [ ] No network errors

5. **Test Razorpay API?**
   - [ ] Try test credentials
   - [ ] Contact Razorpay if API down

---

## 🚀 Test Payment Instructions

### Using Razorpay Test Mode:

1. **Use test credentials** (provided by Razorpay):
   ```
   Key ID: rzp_test_xxxxx
   Key Secret: test_xxxxx
   ```

2. **Test payment cards:**
   - Visa: 4111 1111 1111 1111
   - CVV: 123
   - Expiry: Any future date
   - OTP: 000000 (or 111111)

3. **Payment will succeed** and activate subscription

4. **Payment is not charged** in test mode

---

## 📊 Expected Flow

```
User clicks "Generate Razorpay Payment Link"
        ↓
Frontend validates form
        ↓
POST /api/super-admin/razorpay/create-order
        ↓
Backend creates purchase record (pending)
        ↓
Razorpay API creates order
        ↓
Returns order_id and key_id
        ↓
Frontend loads Razorpay script
        ↓
Opens Razorpay checkout modal
        ↓
User completes payment
        ↓
Frontend verifies signature
        ↓
Subscription activated
        ↓
Invoice generated
        ↓
Email sent (if SMTP configured)
```

---

## ✨ If Everything Works:

After payment completion, you should see:
1. ✅ Success alert with order ID
2. ✅ Modal closes
3. ✅ Tenant created in database
4. ✅ Payment status: 'paid'
5. ✅ Subscription active
6. ✅ Invoice in email (if SMTP configured)
7. ✅ Activity log entry created

---

**Last Updated:** June 8, 2026

For more help, check server logs:
```bash
tail -f backend/logs/app-*.log
```
