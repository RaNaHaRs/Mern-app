import React, { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import MathCaptcha from '../components/MathCaptcha';

const API = '/api';

export default function LoginPage() {
  const { login, setLoggedIn } = useAuth();
  const navigate = useNavigate();

  async function parseJsonResponse(res) {
    const text = await res.text();
    if (!text || !text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  // Steps: 'login' | '2fa' | 'forgot' | 'otp' | 'newpass' | 'done'
  const [step, setStep] = useState('login');
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Show session-expired banner if auto-logged out
  const [sessionExpired] = useState(() => {
    const reason = localStorage.getItem('logout_reason');
    if (reason === 'inactivity') { localStorage.removeItem('logout_reason'); return true; }
    return false;
  });
  const [showCreds, setShowCreds] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [captchaOk, setCaptchaOk] = useState(false);
  const [captchaReset, setCaptchaReset] = useState(0);

  // 2FA state
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  // Forgot password state
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetMethod, setResetMethod] = useState('email');
  const [resetOtp, setResetOtp] = useState('');
  const [demoOtp, setDemoOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);

  // ── Step 1: Login ──────────────────────────────────────────────
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
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || data?.message || (typeof data === 'string' ? data : 'Login failed'));
      if (!data) throw new Error('Login failed: server returned an empty response.');

      if (data.requires_2fa && data.temp_token) {
        setTempToken(data.temp_token);
        setStep('2fa');
        return;
      }
      // Normal login success
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

  // ── Step 2: 2FA Verify ─────────────────────────────────────────
  const handle2FA = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/2fa/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: tempToken, totp_code: totpCode }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || data?.message || (typeof data === 'string' ? data : '2FA verification failed'));
      if (!data) throw new Error('2FA verification failed: server returned an empty response.');
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

  // ── Forgot Step 1: Request OTP ────────────────────────────────
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/request-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: resetIdentifier, method: resetMethod }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || data?.message || (typeof data === 'string' ? data : 'Failed to send OTP'));
      if (data?.demo_otp) setDemoOtp(data.demo_otp); // Show in demo mode
      setStep('otp');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot Step 2: Verify OTP ─────────────────────────────────
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: resetIdentifier, otp: resetOtp }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || data?.message || (typeof data === 'string' ? data : 'OTP verification failed'));
      if (!data) throw new Error('OTP verification failed: server returned an empty response.');
      setResetToken(data.reset_token);
      setStep('newpass');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot Step 3: Set New Password ──────────────────────────
  const handleSetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_token: resetToken, new_password: newPassword }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || data?.message || (typeof data === 'string' ? data : 'Password reset failed'));
      setStep('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (u, p) => setForm({ username: u, password: p });

  const stepTitles = {
    login: { icon: '💾', title: 'RecoverLab CRM', sub: 'Enterprise Data Recovery Platform' },
    '2fa': { icon: '🔐', title: 'Two-Factor Auth', sub: 'Enter your 6-digit authenticator code' },
    forgot: { icon: '🔑', title: 'Reset Password', sub: 'We\'ll send a reset code to your email or WhatsApp' },
    otp: { icon: '📨', title: 'Enter OTP', sub: `Code sent via ${resetMethod} to ${resetIdentifier.slice(0,3)}***` },
    newpass: { icon: '🔒', title: 'New Password', sub: 'Choose a strong new password' },
    done: { icon: '✅', title: 'Password Reset!', sub: 'You can now log in with your new password' },
  };

  const current = stepTitles[step];

  return (
    <div className="login-page">
      <div className="login-bg-grid" />
      <div className="login-bg-glow" />

      <div className="login-card" style={{ transition: 'all 0.3s ease' }}>
        <div className="login-logo">
          <div className="login-logo-icon">{current.icon}</div>
          <div className="login-app-name">{current.title}</div>
          <div className="login-tagline">{current.sub}</div>
        </div>

        {/* Progress dots */}
        {(step === 'forgot' || step === 'otp' || step === 'newpass') && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 20 }}>
            {['forgot', 'otp', 'newpass'].map((s, i) => (
              <div key={s} style={{
                width: step === s ? 24 : 8, height: 8, borderRadius: 4,
                background: step === s ? 'var(--accent-primary)' : 'var(--border-default)',
                transition: 'all 0.3s',
              }} />
            ))}
          </div>
        )}

        {sessionExpired && (
          <div className="alert" style={{ marginBottom: 16, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span>⏱️</span>
            <div style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600 }}>Session expired due to 2 hours of inactivity. Please sign in again.</div>
          </div>
        )}

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 16 }}>
            <span className="alert-icon">⚠</span>
            <div>{error}</div>
          </div>
        )}

        {/* ── LOGIN FORM ── */}
        {step === 'login' && (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label required">Username or Email</label>
              <input type="text" className="form-input" placeholder="Enter your username"
                value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
                autoComplete="username" required autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label required" style={{ display: 'flex', justifyContent: 'space-between' }}>
                Password
                <button type="button" onClick={() => setStep('forgot')}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.72rem', padding: 0 }}>
                  Forgot password?
                </button>
              </label>
              <div style={{ position: 'relative' }}>
                <input type={showPw ? 'text' : 'password'} className="form-input" placeholder="Enter your password"
                  value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                  autoComplete="current-password" required style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--text-muted)' }}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 8 }}>
              <label className="form-label" style={{ marginBottom: 8 }}>Verification <span style={{ color: 'var(--status-danger)' }}>*</span></label>
              <MathCaptcha onVerify={setCaptchaOk} resetKey={captchaReset} />
            </div>
            <button type="submit" className="btn btn-primary w-full btn-lg" disabled={loading || !captchaOk} style={{ marginTop: 8 }}>
              {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Authenticating...</> : '→ Sign In to Platform'}
            </button>
          </form>
        )}

        {/* ── 2FA FORM ── */}
        {step === '2fa' && (
          <form onSubmit={handle2FA}>
            <div style={{ textAlign: 'center', padding: '16px 0', marginBottom: 16 }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📱</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Open your authenticator app and enter the 6-digit code for <strong>RecoverLab CRM</strong>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', marginTop: 8 }}>
                Demo: use code <code style={{ background: 'rgba(0,212,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>123456</code>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label required">6-Digit Code</label>
              <input type="text" className="form-input" style={{ textAlign: 'center', fontSize: '1.4rem', letterSpacing: '0.4em', fontFamily: 'var(--font-mono)' }}
                placeholder="000000" maxLength={8} value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 8))} autoFocus required />
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>You can also enter a backup code</div>
            </div>
            <button type="submit" className="btn btn-primary w-full btn-lg" disabled={loading || totpCode.length < 6}>
              {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Verifying...</> : '🔐 Verify Code'}
            </button>
            <button type="button" className="btn btn-ghost w-full" style={{ marginTop: 8 }} onClick={() => { setStep('login'); setError(''); }}>← Back to login</button>
          </form>
        )}

        {/* ── FORGOT: Enter email/phone ── */}
        {step === 'forgot' && (
          <form onSubmit={handleRequestOtp}>
            <div className="form-group">
              <label className="form-label required">Email or Phone Number</label>
              <input type="text" className="form-input" placeholder="admin@recoverlab.in or +91..."
                value={resetIdentifier} onChange={e => setResetIdentifier(e.target.value)} autoFocus required />
            </div>
            <div className="form-group">
              <label className="form-label">Send Code Via</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[{ v: 'email', icon: '📧', label: 'Email' }, { v: 'whatsapp', icon: '💬', label: 'WhatsApp' }].map(m => (
                  <button key={m.v} type="button" onClick={() => setResetMethod(m.v)}
                    style={{
                      flex: 1, padding: '10px 8px', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                      border: `2px solid ${resetMethod === m.v ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                      background: resetMethod === m.v ? 'rgba(0,212,255,0.08)' : 'var(--bg-elevated)',
                      color: resetMethod === m.v ? 'var(--accent-primary)' : 'var(--text-muted)',
                      transition: 'all 0.15s',
                    }}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-full btn-lg" disabled={loading || !resetIdentifier}>
              {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Sending...</> : `📨 Send Reset Code`}
            </button>
            <button type="button" className="btn btn-ghost w-full" style={{ marginTop: 8 }} onClick={() => { setStep('login'); setError(''); }}>← Back to login</button>
          </form>
        )}

        {/* ── OTP: Verify code ── */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            {demoOtp && (
              <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, marginBottom: 14, fontSize: '0.8rem', color: '#22c55e' }}>
                🧪 <strong>Demo mode:</strong> OTP is <code style={{ background: 'rgba(34,197,94,0.15)', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>{demoOtp}</code>
              </div>
            )}
            <div className="form-group">
              <label className="form-label required">Enter 6-Digit OTP</label>
              <input type="text" className="form-input" style={{ textAlign: 'center', fontSize: '1.4rem', letterSpacing: '0.4em', fontFamily: 'var(--font-mono)' }}
                placeholder="000000" maxLength={6} value={resetOtp}
                onChange={e => setResetOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus required />
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>Code expires in 15 minutes</div>
            </div>
            <button type="submit" className="btn btn-primary w-full btn-lg" disabled={loading || resetOtp.length < 6}>
              {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Verifying...</> : '✓ Verify OTP'}
            </button>
            <button type="button" className="btn btn-ghost w-full" style={{ marginTop: 8 }} onClick={() => { setStep('forgot'); setError(''); setDemoOtp(''); }}>← Resend code</button>
          </form>
        )}

        {/* ── NEW PASSWORD ── */}
        {step === 'newpass' && (
          <form onSubmit={handleSetPassword}>
            <div className="form-group">
              <label className="form-label required">New Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showNewPw ? 'text' : 'password'} className="form-input"
                  placeholder="Min 8 chars, uppercase + number" value={newPassword}
                  onChange={e => setNewPassword(e.target.value)} autoFocus required style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowNewPw(p => !p)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--text-muted)' }}>
                  {showNewPw ? '🙈' : '👁️'}
                </button>
              </div>
              {/* Strength indicator */}
              {newPassword && (
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  {['Length ≥8', 'Uppercase', 'Number', 'Symbol'].map((req, i) => {
                    const checks = [newPassword.length >= 8, /[A-Z]/.test(newPassword), /[0-9]/.test(newPassword), /[^a-zA-Z0-9]/.test(newPassword)];
                    return <div key={req} style={{ flex: 1, height: 4, borderRadius: 2, background: checks[i] ? '#22c55e' : 'var(--border-default)', transition: 'background 0.2s' }} title={req} />;
                  })}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label required">Confirm New Password</label>
              <input type="password" className="form-input" placeholder="Repeat new password"
                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
              {confirmPassword && newPassword !== confirmPassword && (
                <div style={{ fontSize: '0.68rem', color: 'var(--status-danger)', marginTop: 4 }}>Passwords do not match</div>
              )}
            </div>
            <button type="submit" className="btn btn-primary w-full btn-lg"
              disabled={loading || newPassword !== confirmPassword || newPassword.length < 8}>
              {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Resetting...</> : '🔒 Set New Password'}
            </button>
          </form>
        )}

        {/* ── DONE ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: 8 }}>Password reset successfully!</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 20 }}>You can now sign in with your new password.</div>
            <button className="btn btn-primary w-full btn-lg" onClick={() => { setStep('login'); setError(''); setNewPassword(''); setConfirmPassword(''); }}>
              → Sign In Now
            </button>
          </div>
        )}

        {/* Demo Credentials — only on login step */}
        {step === 'login' && (
          <>
            <div style={{ marginTop: 20, padding: 14, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setShowCreds(s => !s)}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>Demo Credentials</div>
                <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)' }}>{showCreds ? '▲ Hide' : '▼ Show'}</span>
              </div>
              {showCreds && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { u: 'superadmin', p: 'Admin@1234', label: 'Platform Owner', badge: '👑 Super Admin', color: '#f59e0b' },
                    { u: 'admin', p: 'Admin@1234', label: 'Administrator', badge: '👤 Admin', color: '#00d4ff' },
                    { u: 'john_eng', p: 'Engineer@1234', label: 'Senior Engineer', badge: '🔧 Engineer', color: '#7c3aed' },
                  ].map(c => (
                    <div key={c.u} onClick={() => quickLogin(c.u, c.p)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', cursor: 'pointer', transition: 'border-color 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = c.color}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-primary)' }}>{c.u}</div>
                      <span style={{ fontSize: '0.62rem', padding: '1px 7px', borderRadius: 99, background: `${c.color}18`, color: c.color, fontWeight: 700, border: `1px solid ${c.color}25` }}>{c.badge}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 2 }}>Click a row to auto-fill credentials</div>
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Link to="/signup" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                Don't have an account? <strong style={{ color: 'var(--accent-primary)' }}>Start free trial →</strong>
              </Link>
            </div>
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <Link to="/client-portal" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                📋 Track Your Case (Client Portal)
              </Link>
            </div>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 14, fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span>🔒</span> All sessions encrypted · Rate limited · 2FA available
        </div>
      </div>
    </div>
  );
}
