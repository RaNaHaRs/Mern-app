# Razorpay Payment Link Generation - Debugging Guide

## Error: "No order ID returned from server"

This error occurs when the backend cannot create a Razorpay order. Here are the most common causes and solutions.

---

## 🔴 **Common Causes**

### 1. **Razorpay Credentials Not Saved in Database** (Most Common)
- You added credentials in the UI, but they might not have been saved properly
- The backend is trying to use `.env` placeholders instead of your credentials

### 2. **Invalid or Placeholder Credentials**
- Credentials in `.env` or database still contain placeholder values
- Credentials haven't been updated since installation

### 3. **Wrong Environment (Production vs Test)**
- Using production credentials in test mode
- Using test credentials in production (should be fine for testing)

### 4. **Database Connection Issues**
- `saas_purchases` table not created
- Missing database columns

### 5. **Razorpay API Issues**
- Invalid API credentials
- Razorpay account not properly activated
- API rate limits exceeded

---

## ✅ **Step-by-Step Fix**

### Step 1: Verify Database Configuration

Run this diagnostic script:
```bash
cd backend
node check_razorpay_config.js
```

**Expected output:**
```
📋 Environment Variables:
  RAZORPAY_KEY_ID:        ✅ Set
  RAZORPAY_KEY_SECRET:    ✅ Set

💾 Database Settings:
  ✅ Company settings found
  ├─ razorpay_key_id:     ✅ Set
  ├─ razorpay_key_secret: ✅ Set
```

**If you see ❌ NOT SET:**
→ Go to **Step 2** (Save credentials via UI)

---

### Step 2: Save Razorpay Credentials via UI

1. **Login to Super Admin Dashboard**
2. Navigate to: **Super Admin → Email Deliverability** (or Settings tab)
3. Scroll to **Razorpay Configuration** section
4. Enter your credentials:
   - **Razorpay Key ID**: `rzp_test_xxxxx` (test mode) or `rzp_live_xxxxx` (production)
   - **Razorpay Key Secret**: Your actual secret key
   - **Webhook Secret**: Optional (for webhook verification)
5. Click **"Save SMTP Settings"** or **"Save Configuration"**
6. You should see a **✅ Green success message**

---

### Step 3: Verify Credentials Were Saved

Run the diagnostic again:
```bash
node check_razorpay_config.js
```

Check if credentials are now showing as **✅ Set** in the database section.

---

### Step 4: Check the Logs

After attempting to generate a payment link, check the server logs:

```bash
# Check recent errors
tail -f backend/logs/error-*.log

# Look for messages like:
# "Razorpay credentials not configured"
# "Invalid credentials"
# "Order creation failed"
```

---

## 🧪 **Testing the Fix**

### Quick Test (2 minutes):

1. Open Super Admin Dashboard
2. Go to **Tenants** tab
3. Click **"+ New Subscriber"** button
4. Fill in the form:
   - Company Name: `Test Company`
   - Admin Email: `test@example.com`
   - Plan: Select any plan
   - Subscription Months: `1`
5. Click **"Generate Razorpay Payment Link"**
6. Should see Razorpay modal appear (with test/payment options)

**✅ If you see the modal → FIX WORKED**
**❌ If you see "No order ID" error → Continue to Step 5**

---

### Full Diagnostic Test (5 minutes):

```bash
# 1. Start backend
cd backend
npm start

# 2. Run diagnostic
node check_razorpay_config.js

# 3. Check logs
tail -f logs/app-*.log

# 4. Try UI (in another terminal)
# Open frontend and test
```

---

## 🔍 **Detailed Troubleshooting**

### Issue: "Razorpay credentials not configured"

**Cause:** No credentials in database or environment

**Fix:**
```sql
-- Check what's in database
SELECT value FROM platform_settings WHERE key = 'company';

-- If empty, save via UI first (Step 2)
-- If not empty, check if keys exist:
SELECT value->>'razorpay_key_id' FROM platform_settings WHERE key = 'company';
```

---

### Issue: "Razorpay credentials are placeholder values"

**Cause:** Still using .env template values

**Fix:**
1. Edit `.env` file (backend folder):
```env
# BEFORE (placeholder):
RAZORPAY_KEY_ID=rzp_test_YOUR_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_RAZORPAY_KEY_SECRET

# AFTER (real values):
RAZORPAY_KEY_ID=rzp_test_abc123xyz
RAZORPAY_KEY_SECRET=wKxZyAbCd123EfG4h5I
```

2. **OR** delete .env values and save via UI:
```env
# Remove or set to empty
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

3. Restart backend:
```bash
npm start
```

---

### Issue: "Failed to load Razorpay script"

**Cause:** Network issue loading Razorpay checkout script

**Fix:**
1. Check internet connection
2. Check if Razorpay CDN is accessible:
   - Open browser console (F12)
   - Go to Network tab
   - Try payment link again
   - Look for `checkout.razorpay.com`
3. If blocked, may need to add to firewall whitelist

---

### Issue: "Payment failed - Invalid key"

**Cause:** Invalid or expired credentials

**Fix:**
1. Login to Razorpay dashboard: https://dashboard.razorpay.com
2. Go to Settings → API Keys
3. Copy your actual **Key ID** and **Key Secret** (test mode)
4. Re-save in Super Admin UI
5. Retry

---

## 📋 **Razorpay Credentials Checklist**

- [ ] Have you created a Razorpay account?
- [ ] Have you verified your email on Razorpay?
- [ ] Did you navigate to API Keys section in Razorpay dashboard?
- [ ] Did you copy the **TEST** mode keys (not live)?
- [ ] Did you save them in Super Admin → Email Deliverability?
- [ ] Did you see a **✅ green success message** after saving?
- [ ] Did you restart the backend after saving?
- [ ] Did you try generating a link again after restart?

---

## 🔧 **Advanced Debugging**

### Check Razorpay API Directly

```bash
# Test if credentials work with Razorpay API
node << 'EOF'
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: 'rzp_test_YOUR_KEY_ID',
  key_secret: 'YOUR_KEY_SECRET'
});

razorpay.orders.create({
  amount: 10000,  // 100 rupees in paise
  currency: 'INR',
  receipt: 'test-123'
}).then(order => {
  console.log('✅ Order created:', order.id);
}).catch(err => {
  console.log('❌ Error:', err.message);
});
EOF
```

---

### Check Database Directly

```sql
-- See all company settings
SELECT key, value FROM platform_settings WHERE key = 'company';

-- Check if credentials are there
SELECT 
  value->>'razorpay_key_id' as key_id,
  (value->>'razorpay_key_secret' != '' AND value->>'razorpay_key_secret' IS NOT NULL) as has_secret
FROM platform_settings 
WHERE key = 'company';

-- Check recent orders
SELECT id, plan_key, status, razorpay_order_id, created_at 
FROM saas_purchases 
ORDER BY created_at DESC 
LIMIT 10;
```

---

### Check Backend Logs

```bash
# View all errors
grep -i "razorpay\|create-order\|order" backend/logs/error-*.log

# Watch logs in real-time
tail -f backend/logs/app-*.log | grep -i razorpay
```

---

## 🚀 **After Fix - Verification**

1. **Restart backend:**
   ```bash
   cd backend
   npm start
   ```

2. **Run diagnostic:**
   ```bash
   node check_razorpay_config.js
   ```

3. **Test in UI:**
   - Create new subscriber
   - Generate payment link
   - Should see Razorpay modal

4. **Check logs:**
   - Should see "Razorpay order created" message
   - No error messages

---

## 📞 **Still Not Working?**

### Collect Information

Run this to gather diagnostic info:
```bash
# Create diagnostic report
node check_razorpay_config.js > razorpay_diagnostic.txt 2>&1
tail -50 backend/logs/error-*.log >> razorpay_diagnostic.txt
```

### Check These:

1. **Environment:**
   - Node version: `node -v`
   - npm version: `npm -v`
   - Database: PostgreSQL running?

2. **Credentials:**
   - Are they test keys (rzp_test_) or live (rzp_live_)?
   - Do they match between `.env` and database?

3. **Network:**
   - Is backend running on correct port?
   - Is frontend connecting to backend correctly?
   - Can you access https://checkout.razorpay.com?

---

## 💡 **Pro Tips**

1. **Always use TEST credentials first** - You can't lose real money
2. **Test cards for Razorpay:**
   - Card: `4111111111111111`
   - CVV: Any 3 digits
   - Date: Any future date
3. **Save credentials via UI** - It's more reliable than .env
4. **Restart backend after changing credentials** - Changes need to be reloaded
5. **Check logs first** - Backend logs tell you exactly what's wrong

---

## 📖 **Related Docs**

- `RAZORPAY_TEST_STEPS.md` - How to test Razorpay
- `RAZORPAY_LINK_GENERATION_FIX.md` - Root cause analysis
- `QUICK_REFERENCE.md` - Quick fixes

---

**Last Updated:** June 8, 2026  
**Status:** Production Ready
