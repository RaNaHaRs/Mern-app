const fs = require('fs');

// Patch auth.js
let authContent = fs.readFileSync('backend/src/routes/auth.js', 'utf8').replace(/\r\n/g, '\n');
const target = `    } catch (err) {
      logger.error('Signup error', { error: err.message });
      res.status(500).json({ error: 'Signup failed' });
    }
  }
);`;

const replacement = `    } catch (err) {
      logger.error('Signup error', { error: err.message });
      res.status(500).json({ error: 'Signup failed' });
    }
  }
);

// ─── GET /api/auth/plans ──────────────────────────────────────────
router.get('/plans', async (req, res) => {
  try {
    const result = await query(
      'SELECT key, label, price_monthly::int AS price, max_users AS "maxUsers", color, features, true AS trial FROM subscription_plans WHERE is_active = true ORDER BY sort_order, created_at'
    );
    res.json({ plans: result.rows });
  } catch (err) {
    logger.error('Failed to fetch public plans', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});`;

if (authContent.includes(target) && !authContent.includes('/api/auth/plans')) {
  authContent = authContent.replace(target, replacement);
  fs.writeFileSync('backend/src/routes/auth.js', authContent, 'utf8');
  console.log('auth.js patched');
} else {
  console.log('auth.js skipped (already patched or target not found)');
}


// Patch SignupPage.jsx
let signupContent = fs.readFileSync('frontend/src/pages/SignupPage.jsx', 'utf8').replace(/\r\n/g, '\n');

const signupTarget1 = `const PLANS = [
  { key: 'starter',      label: 'Starter',      price: 999,  trial: true, maxUsers: 2,  color: '#64748b', features: ['2 team users', 'Basic reports', '5GB storage'] },
  { key: 'professional', label: 'Professional', price: 2499, trial: true, maxUsers: 5,  color: '#3b82f6', features: ['5 team users', 'Advanced reports', '20GB storage', 'WhatsApp integration'] },
  { key: 'business',     label: 'Business',     price: 4999, trial: true, maxUsers: 15, color: '#8b5cf6', features: ['15 team users', 'Full analytics', '100GB storage', 'API access', 'Priority support'] },
];

export default function SignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: plan, 2: details, 3: done
  const [plan, setPlan] = useState('starter');`;

const signupReplace1 = `import { useEffect } from 'react';

export default function SignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: plan, 2: details, 3: done
  const [plan, setPlan] = useState('starter');
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => {
    fetch('/api/auth/plans')
      .then(res => res.json())
      .then(d => {
        setPlans(d.plans || []);
        if (d.plans && d.plans.length > 0) {
          setPlan(d.plans[0].key);
        }
        setLoadingPlans(false);
      })
      .catch(() => setLoadingPlans(false));
  }, []);`;

// Need to replace the `import React, { useState } from 'react';` to avoid duplicate imports, or we can just leave it. The `import { useEffect } from 'react'` above is fine if we add it after imports, but actually React is already imported. Let's do it cleanly.

const importTarget = `import React, { useState } from 'react';`;
const importReplace = `import React, { useState, useEffect } from 'react';`;

const plansTarget = `const PLANS = [
  { key: 'starter',      label: 'Starter',      price: 999,  trial: true, maxUsers: 2,  color: '#64748b', features: ['2 team users', 'Basic reports', '5GB storage'] },
  { key: 'professional', label: 'Professional', price: 2499, trial: true, maxUsers: 5,  color: '#3b82f6', features: ['5 team users', 'Advanced reports', '20GB storage', 'WhatsApp integration'] },
  { key: 'business',     label: 'Business',     price: 4999, trial: true, maxUsers: 15, color: '#8b5cf6', features: ['15 team users', 'Full analytics', '100GB storage', 'API access', 'Priority support'] },
];`;

const stateTarget = `  const [plan, setPlan] = useState('starter');`;
const stateReplace = `  const [plan, setPlan] = useState('');
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => {
    fetch(API + '/auth/plans')
      .then(res => res.json())
      .then(d => {
        setPlans(d.plans || []);
        if (d.plans && d.plans.length > 0) {
          setPlan(d.plans[0].key);
        }
        setLoadingPlans(false);
      })
      .catch(() => setLoadingPlans(false));
  }, []);`;

const selPlanTarget = `  const selPlan = PLANS.find(p => p.key === plan) || PLANS[0];`;
const selPlanReplace = `  const selPlan = plans.find(p => p.key === plan) || plans[0] || {};`;

const mapTarget = `              {PLANS.map(p => (`;
const mapReplace = `              {plans.map(p => (`;

if (signupContent.includes(plansTarget)) {
  signupContent = signupContent.replace(importTarget, importReplace);
  signupContent = signupContent.replace(plansTarget, '');
  signupContent = signupContent.replace(stateTarget, stateReplace);
  signupContent = signupContent.replace(selPlanTarget, selPlanReplace);
  signupContent = signupContent.replace(mapTarget, mapReplace);
  
  // also add a loading state in the render step 1
  const step1Target = `{step === 1 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>`;
  const step1Replace = `{step === 1 && loadingPlans && <div style={{textAlign:'center', padding:40}}><div className="spinner"></div></div>}
        {step === 1 && !loadingPlans && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>`;
  
  signupContent = signupContent.replace(step1Target, step1Replace);

  fs.writeFileSync('frontend/src/pages/SignupPage.jsx', signupContent, 'utf8');
  console.log('SignupPage.jsx patched');
} else {
  console.log('SignupPage.jsx skipped');
}
