import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import MathCaptcha from '../components/MathCaptcha';

const API = '/api';

function PwStrengthBar({ password }) {
  if (!password) return null;
  const checks = [
    { label: 'Length ≥8', ok: password.length >= 8 },
    { label: 'Uppercase', ok: /[A-Z]/.test(password) },
    { label: 'Number',    ok: /[0-9]/.test(password) },
    { label: 'Symbol',    ok: /[^a-zA-Z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const color = score <= 1 ? '#ef4444' : score === 2 ? '#f59e0b' : score === 3 ? '#3b82f6' : '#22c55e';
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {checks.map((c, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: c.ok ? color : 'var(--border-subtle)', transition: 'background 0.25s' }} title={c.label} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
        {checks.map(c => (
          <span key={c.label} style={{ fontSize: '0.62rem', color: c.ok ? color : 'var(--text-muted)', transition: 'color 0.2s' }}>
            {c.ok ? '✓' : '○'} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: plan, 2: details, 3: done
  const [plan, setPlan] = useState('');
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [form, setForm] = useState({ company_name: '', admin_name: '', admin_email: '', admin_password: '', confirm_password: '', phone: '', city: '' });
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [captchaOk, setCaptchaOk] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [branding, setBranding] = useState(window.__branding || null);
  useEffect(() => {
    setBranding(window.__branding || null);
    const handler = (ev) => setBranding(ev.detail);
    window.addEventListener('sa_branding_update', handler);
    return () => window.removeEventListener('sa_branding_update', handler);
  }, []);

  useEffect(() => {
    fetch(API + '/auth/plans')
      .then(r => r.json())
      .then(d => {
        const ps = d.plans || [];
        setPlans(ps);
        if (ps.length > 0) setPlan(ps[0].key);
        setLoadingPlans(false);
      })
      .catch(() => setLoadingPlans(false));
  }, []);

  const selPlan = plans.find(p => p.key === plan) || plans[0] || {};

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!captchaOk) { setError('Please solve the verification CAPTCHA.'); setCaptchaReset(r => r + 1); return; }
    if (form.admin_password !== form.confirm_password) { setError('Passwords do not match.'); return; }
    if (form.admin_password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Signup failed');
      setResult(data);
      setStep(3);
    } catch (err) {
      setError(err.message);
      setCaptchaOk(false);
      setCaptchaReset(r => r + 1);
    } finally {
      setLoading(false);
    }
  };

  const pwsMatch = form.admin_password && form.confirm_password && form.admin_password === form.confirm_password;
  const canSubmit = !loading && captchaOk && form.admin_password === form.confirm_password && form.admin_password.length >= 8;

  const trialEndDate = new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <>
      <style>{`
        @keyframes signupCardIn {
          from { opacity: 0; transform: translateY(22px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes signupStepIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.35; transform: translateX(-50%) scale(1); }
          50%       { opacity: 0.55; transform: translateX(-50%) scale(1.06); }
        }
        .signup-card-enter { animation: signupCardIn 0.42s cubic-bezier(0.22,1,0.36,1) both; }
        .signup-step-enter { animation: signupStepIn 0.3s cubic-bezier(0.22,1,0.36,1) both; }
        .signup-glow-pulse { animation: glowPulse 4s ease-in-out infinite; }

        .signup-input:focus { border-color: var(--accent-primary) !important; box-shadow: 0 0 0 3px rgba(34,211,238,0.12) !important; }
        .signup-input { transition: border-color 0.18s, box-shadow 0.18s !important; }

        .signup-btn-primary {
          padding: 12px 20px;
          background: linear-gradient(135deg, #22d3ee 0%, #0891b2 100%);
          color: #fff; border: none; border-radius: var(--radius-md);
          font-weight: 700; font-size: 0.9rem; cursor: pointer;
          transition: filter 0.18s, transform 0.15s, box-shadow 0.18s, opacity 0.18s;
          box-shadow: 0 4px 18px rgba(34,211,238,0.25);
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          letter-spacing: 0.01em;
        }
        .signup-btn-primary:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 6px 26px rgba(34,211,238,0.38); }
        .signup-btn-primary:active:not(:disabled) { transform: translateY(0); filter: brightness(0.97); }
        .signup-btn-primary:disabled { opacity: 0.38; cursor: not-allowed; box-shadow: none; }

        .signup-btn-ghost {
          padding: 10px 20px; background: transparent;
          color: var(--text-muted); border: 1px solid var(--border-default);
          border-radius: var(--radius-md); font-size: 0.84rem; font-weight: 500; cursor: pointer;
          transition: background 0.18s, color 0.18s;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .signup-btn-ghost:hover { background: var(--bg-elevated); color: var(--text-primary); }

        .plan-card {
          padding: 16px 14px; border-radius: var(--radius-md); cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
          position: relative;
        }
        .plan-card:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(0,0,0,0.18); }
        .plan-card.selected { transform: translateY(-2px); }

        .auth-field-group { margin-bottom: 14px; }
        .auth-label { display: block; font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
        .auth-required { color: var(--status-danger); margin-left: 2px; }
        .auth-pw-wrap { position: relative; }
        .auth-pw-toggle {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; font-size: 0.95rem; color: var(--text-muted);
          transition: color 0.15s;
        }
        .auth-pw-toggle:hover { color: var(--text-primary); }
      `}</style>

      <div className="login-page" style={{ alignItems: 'flex-start', paddingTop: '5vh', paddingBottom: '5vh' }}>
        <div className="login-bg-grid" />
        <div className="login-bg-glow signup-glow-pulse" />

        <div
          className="login-card signup-card-enter"
          style={{
            maxWidth: step === 1 ? 660 : 480,
            width: '100%',
            transition: 'max-width 0.35s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          {/* ── Logo ───────────────────────────────────────── */}
          <div className="login-logo" style={{ marginBottom: 24 }}>
            <div className="login-logo-icon" style={branding?.logo_url ? { background: `url(${branding.logo_url}) center/contain no-repeat`, boxShadow: 'none' } : {}}>
              {branding?.logo_url ? '' : '💾'}
            </div>
            <div className="login-app-name">{branding?.platform_name || 'RecoverLab CRM'}</div>
            <div className="login-tagline">
              {step === 1 ? 'Choose your plan — 14-day free trial, no card needed'
                : step === 2 ? 'Create your account'
                : 'Account created!'}
            </div>
          </div>

          {/* ── Progress steps ──────────────────────────────── */}
          {step < 3 && (
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
              {['Choose Plan', 'Your Details', 'Done'].map((s, i) => (
                <React.Fragment key={s}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: step > i + 1 ? '#10b981' : step === i + 1 ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                      border: `2px solid ${step > i + 1 ? '#10b981' : step === i + 1 ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                      color: step >= i + 1 ? '#000' : 'var(--text-muted)',
                      fontSize: '0.72rem', fontWeight: 800,
                      transition: 'all 0.3s',
                      boxShadow: step === i + 1 ? '0 0 14px rgba(34,211,238,0.35)' : 'none',
                    }}>
                      {step > i + 1 ? '✓' : i + 1}
                    </div>
                    <div style={{ fontSize: '0.6rem', marginTop: 5, fontWeight: step === i + 1 ? 700 : 400, color: step === i + 1 ? 'var(--accent-primary)' : 'var(--text-muted)', transition: 'color 0.2s' }}>{s}</div>
                  </div>
                  {i < 2 && (
                    <div style={{ flex: 2, height: 2, marginBottom: 20, background: step > i + 1 ? '#10b981' : 'var(--border-subtle)', transition: 'background 0.3s' }} />
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* ── Error banner ──────────────────────────────────── */}
          {error && (
            <div style={{ marginBottom: 14, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 'var(--radius-md)', padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', animation: 'signupStepIn 0.25s both' }}>
              <span>⚠️</span>
              <span style={{ fontSize: '0.78rem', color: '#ef4444', fontWeight: 500 }}>{error}</span>
            </div>
          )}

          {/* ══ STEP 1: Plan Selection ════════════════════════ */}
          {step === 1 && (
            <div className="signup-step-enter">
              {loadingPlans ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div className="spinner spinner-lg" />
                  <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Loading plans…</div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(plans.length, 3)}, 1fr)`, gap: 12, marginBottom: 20 }}>
                    {plans.map(p => (
                      <div
                        key={p.key}
                        className={`plan-card${plan === p.key ? ' selected' : ''}`}
                        onClick={() => setPlan(p.key)}
                        style={{
                          border: `2px solid ${plan === p.key ? p.color : 'var(--border-subtle)'}`,
                          background: plan === p.key ? `${p.color}0e` : 'var(--bg-elevated)',
                        }}
                      >
                        {plan === p.key && (
                          <div style={{ position: 'absolute', top: -9, right: 10, background: p.color, color: '#000', fontSize: '0.52rem', fontWeight: 800, padding: '2px 8px', borderRadius: 4, letterSpacing: '0.05em' }}>SELECTED</div>
                        )}
                        <div style={{ fontWeight: 800, fontSize: '0.88rem', color: p.color, marginBottom: 6 }}>{p.label}</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                          ₹{(p.price || 0).toLocaleString('en-IN')}
                          <span style={{ fontSize: '0.58rem', fontWeight: 400, color: 'var(--text-muted)' }}> /mo</span>
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 10, marginTop: 2 }}>{p.maxUsers} users</div>
                        {(p.features || []).map(f => (
                          <div key={f} style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', marginBottom: 3, display: 'flex', gap: 6, lineHeight: 1.3 }}>
                            <span style={{ color: p.color, flexShrink: 0 }}>✓</span>{f}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: '11px 14px', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.22)', borderRadius: 'var(--radius-md)', marginBottom: 20, fontSize: '0.78rem', color: '#10b981', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: '1.1rem' }}>🎁</span>
                    <div><strong>14-day free trial</strong> on all plans — no credit card required. Upgrade or cancel anytime.</div>
                  </div>

                  <button className="signup-btn-primary" style={{ width: '100%' }} onClick={() => { setError(''); setStep(2); }}>
                    Continue with {selPlan.label} →
                  </button>

                  <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <Link to="/login" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'none' }}>
                      Already have an account?{' '}
                      <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>Sign in →</span>
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ STEP 2: Account Details ══════════════════════════ */}
          {step === 2 && (
            <form className="signup-step-enter" onSubmit={handleSubmit} noValidate>

              {/* Selected plan badge */}
              <div style={{ padding: '9px 14px', background: `${selPlan.color || '#00d4ff'}0e`, border: `1px solid ${selPlan.color || '#00d4ff'}30`, borderRadius: 'var(--radius-md)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.78rem' }}>
                <span style={{ fontWeight: 700, color: selPlan.color || 'var(--accent-primary)' }}>💎 {selPlan.label} Plan</span>
                <span style={{ color: 'var(--border-default)' }}>·</span>
                <span style={{ color: 'var(--text-muted)' }}>₹{(selPlan.price || 0).toLocaleString('en-IN')}/mo after trial</span>
                <button type="button" onClick={() => { setStep(1); setError(''); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, padding: 0 }}>
                  Change
                </button>
              </div>

              <div className="auth-field-group">
                <label className="auth-label">Company / Lab Name <span className="auth-required">*</span></label>
                <input
                  className="form-input signup-input"
                  value={form.company_name}
                  onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                  placeholder="e.g. DataRescue Mumbai"
                  required
                  autoFocus
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="auth-field-group">
                  <label className="auth-label">Your Name <span className="auth-required">*</span></label>
                  <input
                    className="form-input signup-input"
                    value={form.admin_name}
                    onChange={e => setForm(f => ({ ...f, admin_name: e.target.value }))}
                    placeholder="Full name"
                    required
                  />
                </div>
                <div className="auth-field-group">
                  <label className="auth-label">Phone</label>
                  <input
                    className="form-input signup-input"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="auth-field-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="auth-label">Work Email (used to login) <span className="auth-required">*</span></label>
                  <input
                    type="email"
                    className="form-input signup-input"
                    value={form.admin_email}
                    onChange={e => setForm(f => ({ ...f, admin_email: e.target.value }))}
                    placeholder="admin@yourlab.com"
                    required
                  />
                </div>
              </div>

              <div className="auth-field-group">
                <label className="auth-label">Password <span className="auth-required">*</span></label>
                <div className="auth-pw-wrap">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="form-input signup-input"
                    value={form.admin_password}
                    onChange={e => setForm(f => ({ ...f, admin_password: e.target.value }))}
                    placeholder="Min 8 chars"
                    required
                    style={{ paddingRight: 42 }}
                  />
                  <button type="button" className="auth-pw-toggle" onClick={() => setShowPw(p => !p)} tabIndex={-1} aria-label={showPw ? 'Hide' : 'Show'}>
                    {showPw ? '🙈' : '👁️'}
                  </button>
                </div>
                <PwStrengthBar password={form.admin_password} />
              </div>

              <div className="auth-field-group">
                <label className="auth-label">Confirm Password <span className="auth-required">*</span></label>
                <div className="auth-pw-wrap">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    className="form-input signup-input"
                    value={form.confirm_password}
                    onChange={e => setForm(f => ({ ...f, confirm_password: e.target.value }))}
                    placeholder="Repeat password"
                    required
                    style={{ paddingRight: 42 }}
                  />
                  <button type="button" className="auth-pw-toggle" onClick={() => setShowConfirm(p => !p)} tabIndex={-1} aria-label={showConfirm ? 'Hide' : 'Show'}>
                    {showConfirm ? '🙈' : '👁️'}
                  </button>
                </div>
                {form.confirm_password && !pwsMatch && (
                  <div style={{ fontSize: '0.68rem', color: 'var(--status-danger)', marginTop: 4 }}>Passwords do not match</div>
                )}
                {pwsMatch && (
                  <div style={{ fontSize: '0.68rem', color: '#22c55e', marginTop: 4 }}>✓ Passwords match</div>
                )}
              </div>

              <div className="auth-field-group">
                <label className="auth-label">City</label>
                <input
                  className="form-input signup-input"
                  value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  placeholder="Mumbai"
                />
              </div>

              <div className="auth-field-group">
                <label className="auth-label">Verification <span className="auth-required">*</span></label>
                <MathCaptcha onVerify={setCaptchaOk} resetKey={captchaReset} />
              </div>

              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
                By creating an account you agree to our{' '}
                <span style={{ color: 'var(--accent-primary)', cursor: 'pointer' }}>Terms of Service</span>
                {' '}and{' '}
                <span style={{ color: 'var(--accent-primary)', cursor: 'pointer' }}>Privacy Policy</span>.
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="signup-btn-ghost" onClick={() => { setStep(1); setError(''); }}>
                  ← Back
                </button>
                <button type="submit" className="signup-btn-primary" style={{ flex: 1 }} disabled={!canSubmit}>
                  {loading
                    ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Creating account…</>
                    : '🚀 Create Free Account'}
                </button>
              </div>
            </form>
          )}

          {/* ══ STEP 3: Done ════════════════════════════════════ */}
          {step === 3 && result && (
            <div className="signup-step-enter" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3.5rem', marginBottom: 16, filter: 'drop-shadow(0 0 20px rgba(34,211,238,0.3))', animation: 'signupStepIn 0.5s both' }}>🎉</div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 8, color: 'var(--text-primary)' }}>Welcome to RecoverLab CRM!</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
                Your account is ready. You have a <strong style={{ color: '#10b981' }}>14-day free trial</strong> on the <strong style={{ color: selPlan.color || 'var(--accent-primary)' }}>{selPlan.label}</strong> plan.
              </div>

              <div style={{ padding: '16px 18px', background: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.18)', borderRadius: 'var(--radius-md)', marginBottom: 24, textAlign: 'left' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Your Account Details</div>
                {[
                  ['Email', form.admin_email, 'var(--accent-primary)'],
                  ['Plan', selPlan.label, selPlan.color || 'var(--accent-primary)'],
                  ['Trial ends', trialEndDate, '#10b981'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.77rem', color: 'var(--text-muted)' }}>{label}</span>
                    <span style={{ fontSize: '0.77rem', fontWeight: 700, color, fontFamily: label === 'Email' ? 'var(--font-mono)' : 'inherit' }}>{val}</span>
                  </div>
                ))}
              </div>

              <button className="signup-btn-primary" style={{ width: '100%' }} onClick={() => navigate('/login')}>
                → Sign In to Your Account
              </button>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 14, lineHeight: 1.5 }}>
                After sign-in, go to <strong>Settings → Email & Razorpay</strong> to configure your integrations.
              </div>
            </div>
          )}

          {/* ── Footer ─────────────────────────────────────────── */}
          {step < 3 && (
            <div style={{ textAlign: 'center', marginTop: 20, fontSize: '0.63rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span>🔒</span> All data encrypted · SOC2 compliant · 99.9% uptime
            </div>
          )}
          <footer style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>&copy; {new Date().getFullYear()} RecoverLab. All rights reserved.</span>
          </footer>
        </div>
      </div>
    </>
  );
}
