import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const API = '/api';

// ── Password strength checker ──────────────────────────────────
function PasswordStrength({ password }) {
  if (!password) return null;
  const checks = [
    { label: 'Length ≥8', ok: password.length >= 8 },
    { label: 'Uppercase', ok: /[A-Z]/.test(password) },
    { label: 'Number',    ok: /[0-9]/.test(password) },
    { label: 'Symbol',    ok: /[^a-zA-Z0-9]/.test(password) },
  ];
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {checks.map(c => (
          <div
            key={c.label}
            title={c.label}
            style={{
              flex: 1, height: 4, borderRadius: 2,
              background: c.ok ? '#22c55e' : 'var(--border-default)',
              transition: 'background 0.2s',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        {checks.map(c => (
          <span
            key={c.label}
            style={{
              fontSize: '0.62rem',
              color: c.ok ? '#22c55e' : 'var(--text-muted)',
              transition: 'color 0.2s',
            }}
          >
            {c.ok ? '✓' : '○'} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [newPassword, setNewPassword]   = useState('');
  const [confirmPw, setConfirmPw]       = useState('');
  const [showPw, setShowPw]             = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [tokenValid, setTokenValid]     = useState(null); // null=checking, true=valid, false=invalid
  const [userInfo, setUserInfo]         = useState(null); // { email, fullName }
  const [success, setSuccess]           = useState(false);

  const resetToken = new URLSearchParams(location.search).get('token');

  // ── Validate token on mount ────────────────────────────────
  useEffect(() => {
    const verify = async () => {
      if (!resetToken) {
        setTokenValid(false);
        setError('Reset link is invalid or expired.');
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`${API}/auth/verify-reset-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: resetToken }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Token verification failed');
        setTokenValid(true);
        setUserInfo({ email: data.email, fullName: data.fullName });
      } catch (err) {
        setTokenValid(false);
        setError(err.message || 'Reset link is invalid or expired.');
      } finally {
        setLoading(false);
      }
    };
    verify();
  }, [resetToken]);

  // ── Password validation helpers ────────────────────────────
  const passwordErrors = () => {
    const errs = [];
    if (newPassword.length < 8)         errs.push('at least 8 characters');
    if (!/[A-Z]/.test(newPassword))     errs.push('an uppercase letter');
    if (!/[0-9]/.test(newPassword))     errs.push('a number');
    return errs;
  };

  const isPasswordValid = passwordErrors().length === 0;
  const passwordsMatch  = newPassword === confirmPw;
  const canSubmit       = isPasswordValid && passwordsMatch && newPassword.length > 0 && !loading;

  // ── Submit ─────────────────────────────────────────────────
  const handleReset = async (e) => {
    e.preventDefault();
    setError('');

    if (!isPasswordValid) {
      setError(`Password must contain ${passwordErrors().join(', ')}.`);
      return;
    }
    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.message || 'Reset failed');
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Redirect to login with success flag ──────────────────
  const goToLogin = () => {
    navigate('/login', { state: { passwordReset: true } });
  };

  // ── Loading state ─────────────────────────────────────────
  if (tokenValid === null) {
    return (
      <div className="login-page">
        <div className="login-bg-grid" />
        <div className="login-bg-glow" />
        <div className="login-card">
          <div className="login-logo">
            <div className="login-logo-icon">⏳</div>
            <div className="login-app-name">Verifying Reset Link</div>
            <div className="login-tagline">Please wait…</div>
          </div>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div className="spinner spinner-lg" />
          </div>
        </div>
      </div>
    );
  }

  // ── Invalid token ─────────────────────────────────────────
  if (tokenValid === false) {
    return (
      <div className="login-page">
        <div className="login-bg-grid" />
        <div className="login-bg-glow" />
        <div className="login-card">
          <div className="login-logo">
            <div className="login-logo-icon">🔗</div>
            <div className="login-app-name">Link Expired</div>
            <div className="login-tagline">This reset link is no longer valid</div>
          </div>
          <div
            className="alert alert-danger"
            style={{ marginBottom: 20 }}
          >
            <span className="alert-icon">⚠</span>
            <div>{error || 'Reset link is invalid or expired.'}</div>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: 20 }}>
            Reset links expire after 60 minutes and can only be used once.
            Request a new link to continue.
          </p>
          <button
            className="btn btn-primary w-full btn-lg"
            onClick={() => navigate('/login')}
          >
            ← Back to Login
          </button>
        </div>
      </div>
    );
  }

  // ── Success state ─────────────────────────────────────────
  if (success) {
    return (
      <div className="login-page">
        <div className="login-bg-grid" />
        <div className="login-bg-glow" />
        <div className="login-card">
          <div className="login-logo">
            <div className="login-logo-icon">✅</div>
            <div className="login-app-name">Password Changed</div>
            <div className="login-tagline">Your password has been updated successfully</div>
          </div>
          <div
            style={{
              padding: '14px 16px',
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 20,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: '#22c55e', fontWeight: 600, marginBottom: 4 }}>
              Password changed successfully.
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Please login with your new password.
            </div>
          </div>
          <button
            className="btn btn-primary w-full btn-lg"
            onClick={goToLogin}
          >
            → Sign In Now
          </button>
        </div>
      </div>
    );
  }

  // ── Reset form ─────────────────────────────────────────────
  return (
    <div className="login-page">
      <div className="login-bg-grid" />
      <div className="login-bg-glow" />
      <div className="login-card" style={{ transition: 'all 0.3s ease' }}>
        <div className="login-logo">
          <div className="login-logo-icon">🔒</div>
          <div className="login-app-name">Set New Password</div>
          <div className="login-tagline">
            {userInfo?.fullName
              ? `Hi ${userInfo.fullName}, choose a secure new password`
              : 'Choose a new password for your account'}
          </div>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 16 }}>
            <span className="alert-icon">⚠</span>
            <div>{error}</div>
          </div>
        )}

        <form onSubmit={handleReset} noValidate>
          {/* New Password */}
          <div className="form-group">
            <label className="form-label required">New Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                className="form-input"
                placeholder="Min 8 chars, uppercase + number"
                value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setError(''); }}
                required
                autoFocus
                autoComplete="new-password"
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                style={{
                  position: 'absolute', right: 12, top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: '1rem',
                  color: 'var(--text-muted)',
                }}
                tabIndex={-1}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
            <PasswordStrength password={newPassword} />
          </div>

          {/* Confirm Password */}
          <div className="form-group">
            <label className="form-label required">Confirm New Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirm ? 'text' : 'password'}
                className="form-input"
                placeholder="Repeat new password"
                value={confirmPw}
                onChange={e => { setConfirmPw(e.target.value); setError(''); }}
                required
                autoComplete="new-password"
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(p => !p)}
                style={{
                  position: 'absolute', right: 12, top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: '1rem',
                  color: 'var(--text-muted)',
                }}
                tabIndex={-1}
                aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showConfirm ? '🙈' : '👁️'}
              </button>
            </div>
            {confirmPw && !passwordsMatch && (
              <div style={{ fontSize: '0.68rem', color: 'var(--status-danger)', marginTop: 4 }}>
                Passwords do not match
              </div>
            )}
            {confirmPw && passwordsMatch && newPassword.length > 0 && (
              <div style={{ fontSize: '0.68rem', color: '#22c55e', marginTop: 4 }}>
                ✓ Passwords match
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full btn-lg"
            disabled={!canSubmit}
            style={{ marginTop: 8 }}
          >
            {loading
              ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Updating…</>
              : '🔒 Change Password'}
          </button>

          <button
            type="button"
            className="btn btn-ghost w-full"
            style={{ marginTop: 8 }}
            onClick={() => navigate('/login')}
          >
            ← Back to Login
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 14, fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span>🔒</span> Secure single-use link · Expires after 60 minutes
        </div>
      </div>
    </div>
  );
}
