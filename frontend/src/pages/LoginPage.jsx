import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import MathCaptcha from '../components/MathCaptcha';

const API = '/api';

async function parseJson(res) {
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch { return text; }
}

// ── Animated step wrapper ──────────────────────────────────────
function StepPane({ children, visible }) {
  return (
    <div style={{
      animation: visible ? 'authStepIn 0.28s cubic-bezier(0.22,1,0.36,1) both' : 'none',
      display: visible ? 'block' : 'none',
    }}>
      {children}
    </div>
  );
}

export default function LoginPage() {
  const { setLoggedIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [passwordResetSuccess] = useState(() => !!(location.state?.passwordReset));
  const [sessionExpired] = useState(() => {
    const r = localStorage.getItem('logout_reason');
    if (r === 'inactivity') { localStorage.removeItem('logout_reason'); return true; }
    return false;
  });

  // Steps: 'login' | '2fa' | 'forgot' | 'forgot_sent'
  const [step, setStep] = useState('login');
  const [prevStep, setPrevStep] = useState(null);

  const [form, setForm] = useState({ username: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [captchaOk, setCaptchaOk] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 2FA
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  // Forgot password
  const [resetEmail, setResetEmail] = useState('');

  const goStep = (s) => { setPrevStep(step); setError(''); setStep(s); };

  // ── Login ──────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!captchaOk) { setError('Please solve the CAPTCHA first.'); setCaptchaReset(r => r + 1); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data?.error || data?.message || (typeof data === 'string' ? data : 'Login failed'));
      if (!data) throw new Error('Login failed: server returned an empty response.');
      if (data.twoFactorRequired && data.tempToken) {
        setTempToken(data.tempToken);
        goStep('2fa');
        return;
      }
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      setLoggedIn(data.user);
      if (data.user.role === 'super_admin') navigate('/super-admin');
      else navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.');
      setCaptchaOk(false);
      setCaptchaReset(r => r + 1);
    } finally {
      setLoading(false);
    }
  };

  // ── 2FA ────────────────────────────────────────────────────
  const handle2FA = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/2fa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: tempToken, totp_code: totpCode }),
      });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data?.error || data?.message || (typeof data === 'string' ? data : '2FA failed'));
      if (!data) throw new Error('2FA failed: empty server response.');
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      setLoggedIn(data.user);
      if (data.user?.role === 'super_admin') navigate('/super-admin');
      else navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot password ────────────────────────────────────────
  const handleForgot = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data?.error || data?.message || (typeof data === 'string' ? data : 'Request failed'));
      goStep('forgot_sent');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const stepMeta = {
    login:       { icon: '💾', title: 'RecoverLab CRM',   sub: 'Enterprise Data Recovery Platform' },
    '2fa':       { icon: '🔐', title: 'Two-Factor Auth',   sub: 'Enter your 6-digit authenticator code' },
    forgot:      { icon: '🔑', title: 'Forgot Password',   sub: "Enter your email — we'll send a reset link" },
    forgot_sent: { icon: '✉️', title: 'Check Your Email',  sub: 'A reset link has been sent to your inbox' },
  };
  const meta = stepMeta[step] || stepMeta.login;

  return (
    <>
      <style>{`
        @keyframes authStepIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes authCardIn {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.4; transform: translateX(-50%) scale(1); }
          50%       { opacity: 0.65; transform: translateX(-50%) scale(1.08); }
        }
        @keyframes iconBounce {
          0%   { transform: scale(0.85) rotate(-4deg); opacity: 0; }
          60%  { transform: scale(1.08) rotate(2deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        .auth-card-enter { animation: authCardIn 0.4s cubic-bezier(0.22,1,0.36,1) both; }
        .auth-icon-enter { animation: iconBounce 0.4s cubic-bezier(0.22,1,0.36,1) both; }
        .auth-glow-pulse { animation: glowPulse 4s ease-in-out infinite; }

        .auth-input:focus { border-color: var(--accent-primary) !important; box-shadow: 0 0 0 3px rgba(34,211,238,0.12) !important; }
        .auth-input { transition: border-color 0.18s, box-shadow 0.18s !important; }

        .auth-btn-primary {
          width: 100%; padding: 12px 20px;
          background: linear-gradient(135deg, #22d3ee 0%, #0891b2 100%);
          color: #fff; border: none; border-radius: var(--radius-md);
          font-weight: 700; font-size: 0.9rem; cursor: pointer;
          transition: filter 0.18s, transform 0.18s, box-shadow 0.18s, opacity 0.18s;
          box-shadow: 0 4px 18px rgba(34,211,238,0.25);
          display: flex; align-items: center; justify-content: center; gap: 8px;
          letter-spacing: 0.01em;
        }
        .auth-btn-primary:hover:not(:disabled) {
          filter: brightness(1.1);
          transform: translateY(-1px);
          box-shadow: 0 6px 26px rgba(34,211,238,0.38);
        }
        .auth-btn-primary:active:not(:disabled) { transform: translateY(0); filter: brightness(0.97); }
        .auth-btn-primary:disabled { opacity: 0.38; cursor: not-allowed; box-shadow: none; }

        .auth-btn-ghost {
          width: 100%; padding: 10px 20px;
          background: transparent;
          color: var(--text-muted); border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          font-size: 0.84rem; font-weight: 500; cursor: pointer;
          transition: background 0.18s, color 0.18s, border-color 0.18s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .auth-btn-ghost:hover { background: var(--bg-elevated); color: var(--text-primary); border-color: var(--border-default); }

        .auth-btn-outline {
          width: 100%; padding: 11px 20px;
          background: transparent;
          color: var(--accent-primary); border: 1.5px solid var(--accent-primary);
          border-radius: var(--radius-md);
          font-size: 0.86rem; font-weight: 600; cursor: pointer;
          transition: background 0.18s, box-shadow 0.18s, transform 0.15s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .auth-btn-outline:hover { background: rgba(34,211,238,0.06); box-shadow: 0 0 0 3px rgba(34,211,238,0.1); transform: translateY(-1px); }

        .auth-divider {
          display: flex; align-items: center; gap: 12px;
          margin: 18px 0; color: var(--text-muted); font-size: 0.7rem;
        }
        .auth-divider::before, .auth-divider::after {
          content: ''; flex: 1; height: 1px; background: var(--border-subtle);
        }

        .auth-field-group { margin-bottom: 16px; }
        .auth-label {
          display: block; font-size: 0.78rem; font-weight: 600;
          color: var(--text-secondary); margin-bottom: 6px;
        }
        .auth-required { color: var(--status-danger); margin-left: 2px; }

        .auth-pw-wrap { position: relative; }
        .auth-pw-toggle {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          font-size: 0.95rem; color: var(--text-muted);
          padding: 2px; line-height: 1;
          transition: color 0.15s;
        }
        .auth-pw-toggle:hover { color: var(--text-primary); }
      `}</style>

      <div className="login-page">
        <div className="login-bg-grid" />
        <div className="login-bg-glow auth-glow-pulse" />

        <div className="login-card auth-card-enter" style={{ maxWidth: 420, width: '100%' }}>

          {/* ── Header ─────────────────────────────────────── */}
          <div className="login-logo" style={{ marginBottom: 28 }}>
            <div className="login-logo-icon auth-icon-enter" key={step}>
              {meta.icon}
            </div>
            <div className="login-app-name">{meta.title}</div>
            <div className="login-tagline">{meta.sub}</div>
          </div>

          {/* ── Banners ─────────────────────────────────────── */}
          {sessionExpired && (
            <div style={{ marginBottom: 14, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-md)', padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', animation: 'authStepIn 0.3s both' }}>
              <span style={{ fontSize: '1rem' }}>⏱️</span>
              <span style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 600 }}>Session expired due to inactivity. Please sign in again.</span>
            </div>
          )}
          {passwordResetSuccess && (
            <div style={{ marginBottom: 14, background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.28)', borderRadius: 'var(--radius-md)', padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', animation: 'authStepIn 0.3s both' }}>
              <span style={{ fontSize: '1rem' }}>✅</span>
              <span style={{ fontSize: '0.78rem', color: '#22c55e', fontWeight: 600 }}>Password changed successfully. Please sign in with your new password.</span>
            </div>
          )}
          {error && (
            <div style={{ marginBottom: 14, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 'var(--radius-md)', padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', animation: 'authStepIn 0.25s both' }}>
              <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>⚠️</span>
              <span style={{ fontSize: '0.78rem', color: '#ef4444', fontWeight: 500 }}>{error}</span>
            </div>
          )}

          {/* ══ LOGIN ══════════════════════════════════════════ */}
          <StepPane visible={step === 'login'}>
            <form onSubmit={handleLogin} noValidate>

              <div className="auth-field-group">
                <label className="auth-label">Username or Email <span className="auth-required">*</span></label>
                <input
                  type="text"
                  className="form-input auth-input"
                  placeholder="Enter your username or email"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  autoComplete="username"
                  required
                  autoFocus
                />
              </div>

              <div className="auth-field-group">
                <label className="auth-label">Password <span className="auth-required">*</span></label>
                <div className="auth-pw-wrap">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="form-input auth-input"
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    autoComplete="current-password"
                    required
                    style={{ paddingRight: 42 }}
                  />
                  <button type="button" className="auth-pw-toggle" onClick={() => setShowPw(p => !p)} tabIndex={-1} aria-label={showPw ? 'Hide password' : 'Show password'}>
                    {showPw ? '🙈' : '👁️'}
                  </button>
                </div>
                {/* Forgot password sits below the input, right-aligned */}
                <div style={{ textAlign: 'right', marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={() => goStep('forgot')}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, padding: 0, transition: 'opacity 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              <div className="auth-field-group">
                <label className="auth-label">Verification <span className="auth-required">*</span></label>
                <MathCaptcha onVerify={setCaptchaOk} resetKey={captchaReset} />
              </div>

              <button type="submit" className="auth-btn-primary" disabled={loading || !captchaOk} style={{ marginTop: 4 }}>
                {loading
                  ? <><div className="spinner" style={{ width: 15, height: 15 }} /> Authenticating…</>
                  : <><span>→</span> Sign In to Platform</>}
              </button>
            </form>

            <div className="auth-divider">or</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link to="/signup" style={{ textDecoration: 'none' }}>
                <button className="auth-btn-outline" type="button">
                  🚀 Start Free Trial
                </button>
              </Link>
              <Link to="/client-portal" style={{ textDecoration: 'none' }}>
                <button className="auth-btn-ghost" type="button">
                  📋 Track Your Repair Case
                </button>
              </Link>
            </div>
          </StepPane>

          {/* ══ 2FA ════════════════════════════════════════════ */}
          <StepPane visible={step === '2fa'}>
            <form onSubmit={handle2FA} noValidate>
              <div style={{ textAlign: 'center', padding: '12px 0 20px', animation: 'authStepIn 0.3s both' }}>
                <div style={{ fontSize: '2.4rem', marginBottom: 8 }}>📱</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Open your authenticator app and enter the 6-digit code for <strong style={{ color: 'var(--text-primary)' }}>RecoverLab CRM</strong>
                </div>
              </div>
              <div className="auth-field-group">
                <label className="auth-label">6-Digit Code <span className="auth-required">*</span></label>
                <input
                  type="text"
                  className="form-input auth-input"
                  style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.45em', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                  placeholder="000000"
                  maxLength={8}
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  autoFocus
                  required
                />
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 5 }}>You can also enter a backup code</div>
              </div>
              <button type="submit" className="auth-btn-primary" disabled={loading || totpCode.length < 6}>
                {loading ? <><div className="spinner" style={{ width: 15, height: 15 }} /> Verifying…</> : '🔐 Verify Code'}
              </button>
              <button type="button" className="auth-btn-ghost" style={{ marginTop: 10 }} onClick={() => goStep('login')}>← Back to Login</button>
            </form>
          </StepPane>

          {/* ══ FORGOT ═════════════════════════════════════════ */}
          <StepPane visible={step === 'forgot'}>
            <form onSubmit={handleForgot} noValidate>
              <div className="auth-field-group">
                <label className="auth-label">Registered Email Address <span className="auth-required">*</span></label>
                <input
                  type="email"
                  className="form-input auth-input"
                  placeholder="admin@yourlab.com"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  autoFocus
                  required
                />
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6 }}>
                  We'll send a secure one-time reset link to this address.
                </div>
              </div>
              <button type="submit" className="auth-btn-primary" disabled={loading || !resetEmail.includes('@')}>
                {loading ? <><div className="spinner" style={{ width: 15, height: 15 }} /> Sending…</> : '📨 Send Reset Link'}
              </button>
              <button type="button" className="auth-btn-ghost" style={{ marginTop: 10 }} onClick={() => goStep('login')}>← Back to Login</button>
            </form>
          </StepPane>

          {/* ══ FORGOT SENT ════════════════════════════════════ */}
          <StepPane visible={step === 'forgot_sent'}>
            <div style={{ textAlign: 'center', padding: '8px 0 16px', animation: 'authStepIn 0.35s both' }}>
              <div style={{ fontSize: '3rem', marginBottom: 14, filter: 'drop-shadow(0 0 18px rgba(34,211,238,0.3))' }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: 8 }}>Reset link sent!</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
                Check your inbox at <strong style={{ color: 'var(--accent-primary)' }}>{resetEmail}</strong>.<br />
                The link expires in 60 minutes. Check your spam folder if you don't see it.
              </div>
              <button className="auth-btn-primary" type="button" onClick={() => goStep('login')}>← Back to Login</button>
            </div>
          </StepPane>

          {/* ── Footer ─────────────────────────────────────────── */}
          <div style={{ textAlign: 'center', marginTop: 20, fontSize: '0.63rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span>🔒</span> Encrypted · Rate-limited · 2FA available
          </div>
        </div>
      </div>
    </>
  );
}
