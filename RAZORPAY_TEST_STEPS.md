# Razorpay Payment Link - Complete Test Guide

---

## 📌 Quick Verification (5 minutes)

### Step 1: Check if Credentials are Saved
```
1. Open Super Admin Dashboard
2. Click on "Platform Settings" tab
3. Scroll down to "Email Deliverability Center"
4. Look for Razorpay section
5. Check if Key ID field has value (not empty)
   Expected: "rzp_test_xxxxx" or "rzp_live_xxxxx"
```

**If EMPTY → Go to Step 2**
**If FILLED → Go to Step 3**

---

### Step 2: Save Razorpay Credentials
```
1. In Razorpay section, fill:
   - Key ID: [your test key from Razorpay dashboard]
   - Key Secret: [your test secret]
   - Webhook Secret: [optional for testing]

2. Click "Save SMTP Settings" button
3. Should see green toast: "SMTP settings saved!"
4. Page reloads
5. Credentials should still show (not empty)
```

**⚠️ Important:**
- Use TEST credentials (rzp_test_xxxx) for testing
- NOT production credentials (rzp_live_xxxx)
- Keys are case-sensitive
- No spaces before or after

---

### Step 3: Test Payment Link Generation
```
1. Go to Super Admin → Tenants tab
2. Click "+ Add New Subscriber" button
3. Modal opens - fill form:

   Left side (Account Details):
   - Company/Lab Name: "Test Company XYZ"
   - Admin Name: "John Doe"
   - Admin Email: "john@testcompany.com" (must be valid format)
   - Initial Password: "TestPass123" (min 8 chars)
   - Phone: "+91 98765 43210" (optional)
   - City: "Mumbai" (optional)
   - GSTIN: "27AABCU1234H1Z0" (optional)

   Right side (Subscription Plan):
   - Plan: Select any plan (e.g., "Professional")
   - Duration: Select "1 Month"
   - Max Team Users: Should auto-fill

4. Amount should show: "₹2,499" for Professional
5. Click "Generate Razorpay Payment Link" button
6. SHOULD SEE: Razorpay checkout modal
```

**If modal appears → Payment system is working ✅**
**If error alert → Check troubleshooting below ⚠️**

---

## 🔍 Debugging: If Link Doesn't Generate

### Error Check 1: Browser Console
```
1. Press F12 to open Developer Tools
2. Click "Console" tab
3. Click "Generate Razorpay Payment Link" button
4. Look for error message in console
5. Common errors:
   - "Razorpay is not configured"
     → Save credentials in Email Deliverability
   
   - "Failed to load Razorpay script"
     → Check internet, Razorpay API might be down
   
   - "No order ID returned"
     → Backend error, check server logs
   
   - Validation error about email/password
     → Fill all required fields correctly
```

### Error Check 2: Network Tab
```
1. Open Developer Tools → Network tab
2. Click "Generate Razorpay" button
3. Look for POST request to: `/api/super-admin/razorpay/create-order`
4. Click the request
5. Check:
   - Status: Should be 200 (not 500, 422, etc.)
   - Response: Should have "order_id" field
   
   If Status 422 (Validation Error):
   → Check form fields are filled correctly
   
   If Status 500 (Server Error):
   → Check server logs for details
   → Run: tail -f backend/logs/app-*.log
```

### Error Check 3: Server Logs
```bash
# If on local machine
cd backend
npm run dev 2>&1 | tail -20

# If on server
tail -f /var/log/mern-app.log | grep -i razorpay

# Look for lines like:
# "Razorpay order created" → Success ✅
# "create-order error" → Failed ❌
# "Razorpay credentials not configured" → Setup needed
```

### Error Check 4: Database Check
```bash
# Access PostgreSQL
psql -U postgres -d mern_app

# Check if credentials are saved
SELECT key, value FROM platform_settings WHERE key = 'company';

# Should show JSON with razorpay fields
# If empty or no razorpay fields → Credentials not saved

# Check if payment table exists
SELECT * FROM saas_purchases LIMIT 1;

# If error: "table does not exist"
# → Run migrations: npm run migrate
```

---

## 🧪 Full End-to-End Test

### Scenario: Create subscriber with Razorpay payment

**Duration:** ~10 minutes  
**Prerequisites:**
- Test Razorpay credentials ready
- Browser with console access
- Backend running

### Test Steps:

#### 1️⃣ Prepare Test Data
```
Get from Razorpay Test Dashboard:
- Key ID (starts with rzp_test_)
- Key Secret

Test Payment Details:
- Card: 4111 1111 1111 1111
- CVV: 123
- Expiry: Any future date (e.g., 12/25)
- OTP: 000000 or 111111
```

#### 2️⃣ Save Credentials
```
1. Go to: Super Admin → Platform Settings
2. Scroll to: Email Deliverability → Razorpay
3. Paste Key ID
4. Paste Key Secret
5. Click Save
6. Verify saved (green toast)
```

#### 3️⃣ Create Subscriber with Payment
```
1. Go to: Super Admin → Tenants
2. Click: "+ Add New Subscriber"
3. Fill form:
   - Company: "Test XYZ"
   - Admin Name: "Test Admin"
   - Admin Email: "test@example.com"
   - Password: "Test@12345"
   - Plan: "Professional"
   - Duration: "1 Month"
4. Note amount shown: ₹2,499
5. Click: "Generate Razorpay Payment Link"
```

#### 4️⃣ Handle Payment Modal
```
Razorpay Modal should open with:
- Amount: 2,499 INR
- Description: Professional Plan
- Your name prefilled
- Your email prefilled

Tab in modal:
- If "Cards" → Good, modal loaded
```

#### 5️⃣ Complete Test Payment
```
In Razorpay Modal:
1. Card section:
   - Number: 4111 1111 1111 1111
   - CVV: 123
   - Expiry: 12/25 (or any future)
   - Name: Your name
   - Email: Your email

2. Click: "Pay now" or "Complete Payment"
3. If asked for OTP: Enter 000000
4. Should see: "Processing Payment..."
```

#### 6️⃣ Verify Success
```
After payment:
You should see:
✅ "Payment successful!" alert
✅ Order ID shown
✅ Modal closes
✅ Subscriber created

Check in database:
- New user record in 'users' table
- Purchase record in 'saas_purchases'
- Payment status: 'paid'
- Razorpay order ID saved
```

#### 7️⃣ Check Activity Logs
```
1. Go to: Super Admin → Activity Logs
2. Search for: New subscriber email
3. Should see:
   - "tenant_created" entry
   - Timestamp
   - Amount
```

---

## ✅ Success Indicators

### In Browser (UI):
- ✅ Razorpay modal opens
- ✅ Amount shows correctly
- ✅ Payment processes
- ✅ Success alert appears
- ✅ No JavaScript errors in console

### In Database:
```sql
-- Check if subscriber created
SELECT * FROM users WHERE email = 'test@example.com';
-- Should show: role='admin', is_active=true

-- Check if payment recorded
SELECT * FROM saas_purchases 
WHERE tenant_user_id = (SELECT id FROM users WHERE email = 'test@example.com');
-- Should show: status='paid', razorpay_order_id=value
```

### In Email:
- ✅ Onboarding email sent (if SMTP configured)
- ✅ Invoice attachment (if SMTP configured)

### In Logs:
```
backend logs should show:
✅ "Razorpay order created"
✅ "Payment verified"
✅ "Tenant provisioned"
✅ "Invoice generated"
```

---

## ❌ Common Failures & Fixes

### Failure 1: "Razorpay is not configured"
```
Cause: Credentials not saved or empty

Fix:
1. Go to Email Deliverability
2. Paste Key ID (exactly as from Razorpay)
3. Paste Key Secret (exactly)
4. Click Save
5. Check green confirmation toast
6. Reload page
7. Try again
```

### Failure 2: "Invalid key_id"
```
Cause: Key ID is wrong or expired

Fix:
1. Go to Razorpay Dashboard
2. Copy Key ID again (verify no spaces)
3. Check if rzp_test_ or rzp_live_
4. Update in settings
5. Save and retry
```

### Failure 3: Modal doesn't open
```
Cause: Razorpay script not loading or form invalid

Check:
1. Console for error about Razorpay script
2. All form fields filled and valid
3. Internet connection working
4. Razorpay website not down (status.razorpay.com)

Fix:
1. Fill form completely
2. Hard refresh page (Ctrl+Shift+R)
3. Try again
```

### Failure 4: Payment fails in modal
```
Cause: Test card issue or Razorpay API error

Fix:
1. Use test card: 4111 1111 1111 1111
2. CVV: 123
3. Any future date
4. Enter 000000 for OTP if asked
5. If still fails, check Razorpay status
```

### Failure 5: Payment processed but subscriber not created
```
Cause: Verification endpoint error or database issue

Check:
1. Server logs for verification error
2. Database if payment record exists
3. If payment exists but subscriber doesn't:
   → Manual subscriber creation needed
   → Contact support

Fix:
1. Check server logs
2. Verify payment in saas_purchases table
3. Create subscriber manually if needed
```

---

## 🔐 Security Notes

### Production vs Test Mode:
```
ALWAYS use test credentials first:
✅ rzp_test_XXXXX (safe, for testing)
❌ rzp_live_XXXXX (real money, use carefully)

Switch to production only after:
- Testing complete
- All flows working
- Team trained
```

### Credentials Security:
```
NEVER share:
❌ Key Secret
❌ Webhook Secret
❌ API keys in code
❌ API keys in GitHub

Store in:
✅ .env file (backend only)
✅ Environment variables
✅ Secure vault
✅ Never in frontend code
```

### Payment Verification:
```
Always verify payments with:
✅ Razorpay signature validation
✅ Order amount check
✅ Receipt saved
✅ Audit log entry

Never trust:
❌ Frontend-only verification
❌ Unconfirmed payments
❌ No signature check
```

---

## 📊 Razorpay Webhook Setup (Optional)

For production, set up webhook:

1. **In Razorpay Dashboard:**
   - Settings → Webhooks
   - URL: `https://yourdomain.com/api/webhooks/razorpay`
   - Events: Select all payment events
   - Secret: Copy and save

2. **In App Settings:**
   - Email Deliverability → Razorpay
   - Webhook Secret: Paste
   - Save

3. **Test Webhook:**
   - Razorpay Dashboard → Webhooks
   - Test button
   - Should see delivery in logs

---

## 🎯 Testing Checklist

### Before Going to Production:
- [ ] Test credentials saved
- [ ] Subscriber creation works
- [ ] Payment processes
- [ ] Success alert appears
- [ ] Database record created
- [ ] Email sent (if SMTP configured)
- [ ] Activity logs recorded
- [ ] Refund endpoint works
- [ ] Manual payment works
- [ ] No errors in console

### Before Going Live:
- [ ] Switch to production credentials
- [ ] Test with real small amount
- [ ] Team trained
- [ ] Monitoring set up
- [ ] Error handling verified
- [ ] Webhook configured
- [ ] Support process documented

---

**Test Completed Successfully? 🎉**

If yes, you're ready to use Razorpay for payments!

If no, check troubleshooting section above or contact support with:
1. Error message from browser console
2. Server log excerpt
3. Screenshots of form/modal
4. Exact steps to reproduce
