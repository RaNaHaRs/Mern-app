import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../store/AuthContext';

const API = '/api';
const token = () => localStorage.getItem('accessToken');
const headers = () => ({ Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' });
const get = (url) => fetch(`${API}${url}`, { headers: headers() }).then(r => r.json());
const post = (url, body) => fetch(`${API}${url}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) }).then(r => r.json());

//  Section Styles 
const BADGE = (color) => ({
  fontSize: '0.68rem', padding: '3px 10px', borderRadius: 999, fontWeight: 700,
  background: `${color}18`, color, border: `1px solid ${color}30`,
});

function SectionCard({ icon, title, subtitle, children, accent }) {
  return (
    <div className="card" style={{ marginBottom: 20, border: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: '1.5rem' }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{title}</div>
          {subtitle && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

//  2FA Settings Panel 
function TwoFactorPanel() {
  const [status, setStatus] = useState(null);
  const [setupData, setSetupData] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [disablePw, setDisablePw] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState('status'); // 'status' | 'setup' | 'disable'

  const loadStatus = useCallback(async () => {
    const d = await get('/2fa/status');
    setStatus(d);
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const start2FASetup = async () => {
    setLoading(true); setError('');
    const d = await post('/2fa/setup', {});
    setSetupData(d);
    setStep('setup');
    setLoading(false);
  };

  const verify2FA = async () => {
    setLoading(true); setError('');
    const d = await post('/2fa/verify-setup', { token: verifyCode });
    if (d.ok) { setMsg(d.message); setStep('status'); loadStatus(); }
    else setError(d.error || 'Verification failed');
    setLoading(false);
  };

  const disable2FA = async () => {
    setLoading(true); setError('');
    const d = await post('/2fa/disable', { password: disablePw });
    if (d.ok) { setMsg(d.message); setStep('status'); loadStatus(); setDisablePw(''); }
    else setError(d.error || 'Failed to disable');
    setLoading(false);
  };

  return (
    <SectionCard icon="" title="Two-Factor Authentication (2FA)" subtitle="Add an extra layer of security with TOTP-based authentication" accent="#7c3aed">
      {msg && <div className="alert" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', marginBottom: 14, color: '#22c55e', borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem' }}> {msg}</div>}
      {error && <div className="alert alert-danger" style={{ marginBottom: 14 }}><span className="alert-icon"></span> {error}</div>}

      {step === 'status' && status && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 8, marginBottom: 16 }}>
            <span style={{ fontSize: '1.8rem' }}>{status.enabled ? '' : ''}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                2FA is <span style={{ color: status.enabled ? '#22c55e' : '#f59e0b' }}>{status.enabled ? 'ENABLED' : 'DISABLED'}</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {status.enabled ? `${status.backup_codes_remaining} backup codes remaining` : 'Enable 2FA to protect your account from unauthorized access'}
              </div>
            </div>
          </div>
          {!status.enabled ? (
            <button className="btn btn-primary" onClick={start2FASetup} disabled={loading}>
              {loading ? 'Setting up...' : ' Enable Two-Factor Authentication'}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={() => setStep('disable')}>
               Disable 2FA
            </button>
          )}
        </div>
      )}

      {step === 'setup' && setupData && (
        <div>
          <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(0,212,255,0.06)', borderRadius: 8, border: '1px solid rgba(0,212,255,0.15)' }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.85rem' }}>Step 1: Scan this in your Authenticator App</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
              {setupData.qr_url ? (
                <img
                  src={setupData.qr_url}
                  alt="2FA QR code"
                  style={{ width: 160, height: 160, borderRadius: 12, background: '#ffffff', border: '1px solid rgba(15,23,42,0.08)' }}
                />
              ) : (
                <div style={{ width: 160, height: 160, background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.85rem', textAlign: 'center', borderRadius: 12 }}>QR code not available</div>
              )}
              <div style={{ minWidth: 260, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', wordBreak: 'break-all', background: 'var(--bg-elevated)', padding: '12px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.3)' }}>
                Manual Key: <strong>{setupData.secret}</strong>
              </div>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>App: Google Authenticator, Authy, Microsoft Authenticator</div>
          </div>

          {setupData.backup_codes && (
            <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(245,158,11,0.06)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.2)' }}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.85rem', color: '#f59e0b' }}> Save these Backup Codes (one-time use)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {setupData.backup_codes.map((c, i) => (
                  <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', padding: '4px 8px', background: 'var(--bg-elevated)', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>{c}</div>
                ))}
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label required">Step 2: Enter 6-digit code to activate</label>
            <input type="text" className="form-input" style={{ textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.4em' }}
              placeholder="000000" maxLength={6} value={verifyCode}
              onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>Demo: enter <strong>123456</strong> to activate</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={verify2FA} disabled={loading || verifyCode.length < 6}>
              {loading ? 'Activating...' : ' Activate 2FA'}
            </button>
            <button className="btn btn-ghost" onClick={() => setStep('status')}>Cancel</button>
          </div>
        </div>
      )}

      {step === 'disable' && (
        <div>
          <div className="alert alert-danger" style={{ marginBottom: 16 }}><span className="alert-icon"></span> Disabling 2FA will reduce your account security. Enter your login password to confirm.</div>
          <div className="form-group">
            <label className="form-label required">Login Password</label>
            <input type="password" className="form-input" value={disablePw} onChange={e => setDisablePw(e.target.value)} placeholder="Your current login password" autoFocus />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-danger" onClick={disable2FA} disabled={loading || !disablePw}>
              {loading ? 'Disabling...' : ' Confirm Disable 2FA'}
            </button>
            <button className="btn btn-ghost" onClick={() => setStep('status')}>Cancel</button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

//  Encryption Keys Panel 
function EncryptionPanel() {
  const [keyInfo, setKeyInfo] = useState(null);
  const [allKeys, setAllKeys] = useState([]);
  const [rotatePw, setRotatePw] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const { isAdmin } = useAuth();

  const loadKey = useCallback(async () => {
    const d = await get('/encryption/key');
    setKeyInfo(d.key_info);
  }, []);

  const loadAllKeys = useCallback(async () => {
    if (!isAdmin) return;
    const d = await get('/encryption/all-keys');
    setAllKeys(d.keys || []);
  }, [isAdmin]);

  useEffect(() => { loadKey(); loadAllKeys(); }, [loadKey, loadAllKeys]);

  const rotateKey = async () => {
    if (!rotatePw) { setError('Password required to rotate key'); return; }
    setLoading(true); setError('');
    const d = await post('/encryption/rotate', { password: rotatePw });
    if (d.ok) { setMsg('Encryption key rotated successfully'); setKeyInfo(d.key_info); loadAllKeys(); setRotatePw(''); }
    else setError(d.error || 'Failed to rotate key');
    setLoading(false);
  };

  return (
    <SectionCard icon="" title="Per-User Encryption Keys" subtitle="Each user has a unique AES-256-GCM encryption key derived from the master key" accent="#f59e0b">
      {msg && <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, marginBottom: 14, color: '#22c55e', fontSize: '0.82rem' }}> {msg}</div>}
      {error && <div className="alert alert-danger" style={{ marginBottom: 14 }}><span className="alert-icon"></span> {error}</div>}

      {keyInfo && (
        <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 8, marginBottom: 16, border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Key ID', val: keyInfo.key_id },
              { label: 'Algorithm', val: keyInfo.algorithm },
              { label: 'Created', val: new Date(keyInfo.created_at).toLocaleDateString('en-IN') },
              { label: 'Last Rotated', val: keyInfo.rotated_at ? new Date(keyInfo.rotated_at).toLocaleDateString('en-IN') : 'Never' },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600, marginTop: 2 }}>{f.val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">Rotate Key (requires your login password)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="password" className="form-input" value={rotatePw} onChange={e => setRotatePw(e.target.value)} placeholder="Your login password" />
          <button className="btn btn-secondary" onClick={rotateKey} disabled={loading || !rotatePw} style={{ whiteSpace: 'nowrap' }}>
            {loading ? '⟳ Rotating...' : ' Rotate Key'}
          </button>
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 6 }}> Rotate keys periodically for compliance. Rotation requires your password to prevent unauthorized key changes.</div>
      </div>

      {isAdmin && allKeys.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 8, color: 'var(--text-muted)' }}>All User Keys ({allKeys.length})</div>
          <div className="table-container">
            <table style={{ fontSize: '0.75rem' }}>
              <thead><tr><th>User ID</th><th>Key ID</th><th>Algorithm</th><th>Created</th><th>Rotated</th></tr></thead>
              <tbody>
                {allKeys.map(k => (
                  <tr key={k.key_id}>
                    <td className="font-mono text-muted">{k.user_id?.slice(0, 16)}...</td>
                    <td className="font-mono">{k.key_id}</td>
                    <td><span style={BADGE('#7c3aed')}>{k.algorithm}</span></td>
                    <td>{new Date(k.created_at).toLocaleDateString('en-IN')}</td>
                    <td style={{ color: k.rotated_at ? '#22c55e' : 'var(--text-muted)' }}>{k.rotated_at ? new Date(k.rotated_at).toLocaleDateString('en-IN') : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

//  Backup & Restore Panel 
function BackupRestorePanel() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [driveFiles, setDriveFiles] = useState([]);
  const [driveMsg, setDriveMsg] = useState('');
  const [driveAuth, setDriveAuth] = useState(null);
  const [driveConfigured, setDriveConfigured] = useState(false);
  const [backupName, setBackupName] = useState('');
  const [includeImages, setIncludeImages] = useState(true);
  const [confirmPw, setConfirmPw] = useState('');
  const [appendMode, setAppendMode] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef();

  const loadHistory = useCallback(async () => {
    const d = await get('/backup/history');
    setHistory(d.backups || []);
  }, []);

  const loadDrive = useCallback(async () => {
    const d = await get('/backup/google-drive/list');
    setDriveFiles(d.files || []);
    setDriveMsg(d.message || '');
  }, []);

  const loadDriveAuth = useCallback(async () => {
    const d = await get('/backup/google-drive/auth-url');
    setDriveAuth(d);
    setDriveConfigured(d?.ok && !d?.setup_required);
  }, []);

  useEffect(() => { loadHistory(); loadDrive(); loadDriveAuth(); }, [loadHistory, loadDrive, loadDriveAuth]);

  // Listen for postMessage from OAuth popup
  useEffect(() => {
    const handler = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'google-drive-connected') {
        setDriveMsg('Google Drive connected successfully');
        setDriveConfigured(true);
        loadDriveAuth(); loadDrive();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [loadDriveAuth, loadDrive]);

  // Handle Google OAuth callback (popup window contains ?code=...)
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (!code) return;
        const isPopup = !!window.opener;
        if (isPopup) setDriveMsg('Completing Google Drive authorization...');
        const redirect_uri = `${window.location.origin}/security`;
        const resp = await fetch(`${API}/backup/google-drive/exchange`, {
          method: 'POST', headers: headers(), body: JSON.stringify({ code, redirect_uri })
        });
        const d = await resp.json();
        if (!resp.ok) throw new Error(d.error || 'Authorization failed');
        // remove params from URL
        params.delete('code'); params.delete('scope'); params.delete('state');
        const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState({}, document.title, newUrl);

        if (isPopup) {
          // Notify main window - success
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ type: 'google-drive-connected' }, window.location.origin);
          }
          // Show success message instead of closing - let user close manually
          setDriveMsg('Google Drive connected successfully! You can close this window.');
        } else {
          setDriveMsg('Google Drive connected successfully');
          loadDriveAuth(); loadDrive();
        }
      } catch (e) {
        setDriveMsg('Google connect failed: ' + e.message);
      }
    })();
  }, []);

  const createBackup = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/backup/create`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name: backupName || undefined, include_images: includeImages }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Backup failed'); }
      // Download file
      const blob = await res.blob();
      const cdHeader = res.headers.get('Content-Disposition') || '';
      const fname = cdHeader.match(/filename="([^"]+)"/)?.[1] || `RecoverLab_Backup_${new Date().toISOString().slice(0,10)}.crm-backup`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fname; a.click(); URL.revokeObjectURL(url);
      setMsg(` Backup "${fname}" downloaded successfully`);
      loadHistory();
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleRestoreFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.crm-backup') && !file.name.endsWith('.json')) {
      setError('Invalid file type. Please select a .crm-backup file.'); return;
    }
    if (!window.confirm(`${appendMode ? 'Append' : 'FULL REPLACE'} restore from "${file.name}"?\n\n${appendMode ? 'New records will be added, existing ones kept.' : ' THIS WILL REPLACE ALL CURRENT DATA!'}`)) return;
    setRestoring(true); setError('');
    try {
      const formData = new FormData();
      formData.append('backup_file', file);
      if (confirmPw) formData.append('confirm_password', confirmPw);
      formData.append('append_mode', String(appendMode));
      const res = await fetch(`${API}/backup/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` }, // no Content-Type (multipart)
        body: formData,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Restore failed');
      setMsg(` ${d.message}`);
      loadHistory();
    } catch (e) { setError(e.message); }
    setRestoring(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const connectGoogleDrive = () => {
    if (driveAuth?.auth_url) window.open(driveAuth.auth_url, '_blank', 'width=500,height=600');
    else setDriveMsg('Configure GOOGLE_CLIENT_ID in backend .env file to enable Google Drive backup.');
  };

  const createDriveBackup = async () => {
    setLoading(true); setError(''); setMsg('');
    try {
      const res = await fetch(`${API}/backup/create-drive`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ include_images: includeImages })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Drive backup failed');
      setMsg('Backup uploaded to Google Drive');
      loadHistory(); loadDrive();
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <>
      {msg && <div style={{ padding: '12px 16px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, marginBottom: 16, color: '#22c55e', fontSize: '0.82rem' }}> {msg}</div>}
      {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}><span className="alert-icon"></span> {error}</div>}

      {/* Create Backup */}
      <SectionCard icon="" title="Create Backup" subtitle="Download a full backup including all case images and data" accent="#22c55e">
        <div className="form-group">
          <label className="form-label">Backup Name (optional)</label>
          <input type="text" className="form-input" value={backupName} onChange={e => setBackupName(e.target.value)} placeholder={`RecoverLab_Backup_${new Date().toISOString().slice(0,10)}`} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
          <input type="checkbox" id="inc_images" checked={includeImages} onChange={e => setIncludeImages(e.target.checked)} />
          <label htmlFor="inc_images" style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}> Include Case Images & Solution Media</label>
          <span style={{ marginLeft: 'auto', ...BADGE(includeImages ? '#22c55e' : '#94a3b8') }}>{includeImages ? 'Full Backup (with images)' : 'Data Only (no images)'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={createBackup} disabled={loading}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Creating...</> : ' Download Backup'}
          </button>
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 8 }}>Backup file format: <code>.crm-backup</code> (JSON with base64-encoded images)</div>
      </SectionCard>

      {/* Restore Backup */}
      <SectionCard icon="" title="Restore from Backup" subtitle="Upload a .crm-backup file to restore your data" accent="#f59e0b">
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[{ v: false, label: ' Full Replace', desc: 'Replaces all current data', color: '#ef4444' }, { v: true, label: ' Append Only', desc: 'Adds new records, keeps existing', color: '#22c55e' }].map(m => (
            <button key={String(m.v)} type="button" onClick={() => setAppendMode(m.v)}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, textAlign: 'left',
                border: `2px solid ${appendMode === m.v ? m.color : 'var(--border-default)'}`,
                background: appendMode === m.v ? `${m.color}0d` : 'var(--bg-elevated)', color: appendMode === m.v ? m.color : 'var(--text-muted)',
              }}>
              <div>{m.label}</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 400, marginTop: 2, opacity: 0.8 }}>{m.desc}</div>
            </button>
          ))}
        </div>
        <div className="form-group">
          <label className="form-label">Admin Password (to authorize restore)</label>
          <input type="password" className="form-input" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Your admin password (leave blank to skip in demo)" />
        </div>
        <div style={{ border: '2px dashed var(--border-default)', borderRadius: 8, padding: '20px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s', marginBottom: 8 }}
          onClick={() => fileInputRef.current?.click()}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-default)'}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}></div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>Click to select backup file</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>Accepts .crm-backup files</div>
          <input ref={fileInputRef} type="file" accept=".crm-backup,.json" style={{ display: 'none' }} onChange={handleRestoreFile} />
        </div>
        {restoring && <div style={{ textAlign: 'center', padding: '12px', color: 'var(--accent-primary)', fontSize: '0.82rem' }}><div className="spinner" style={{ width: 20, height: 20, display: 'inline-block', marginRight: 8 }} />Restoring data...</div>}
      </SectionCard>

      {/* Google Drive */}
      <SectionCard icon="" title="Google Drive Auto-Backup" subtitle="Connect your Google account to store backups in Drive" accent="#4285f4">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
          <span style={{ fontSize: '2rem' }}></span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Google Drive Integration</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {driveAuth?.setup_required ? ' Requires GOOGLE_CLIENT_ID in backend .env' : 'Login with Google to enable auto-backup'}
            </div>
          </div>
           <button className="btn btn-secondary" onClick={connectGoogleDrive} style={{ marginLeft: 'auto' }}>
              Connect Google Drive
           </button>
           <button className="btn btn-primary" onClick={createDriveBackup} disabled={loading || !driveConfigured} style={{ marginLeft: 8 }}>
              {loading ? 'Uploading...' : 'Create Backup to Drive'}
           </button>
        </div>

        {driveMsg && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '10px 14px', background: 'rgba(245,158,11,0.06)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.2)', marginBottom: 14 }}>
             {driveMsg}
          </div>
        )}

        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Setup Instructions:</div>
          <ol style={{ paddingLeft: 16, lineHeight: 2, margin: 0 }}>
            <li>Create a project at <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)' }}>Google Cloud Console</a></li>
            <li>Enable <strong>Google Drive API</strong></li>
            <li>Create OAuth2 credentials → Download client_id and client_secret</li>
            <li>Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to backend <code>.env</code></li>
            <li>Click "Connect Google Drive" above to authorize</li>
          </ol>
        </div>

        {driveFiles.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 8 }}>Drive Backups</div>
            {driveFiles.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 6, marginBottom: 6 }}>
                <span></span>
                <div style={{ flex: 1, fontSize: '0.8rem' }}><strong>{f.name}</strong></div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{f.size}</span>
                <button className="btn btn-secondary btn-sm"> Restore</button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Backup History */}
      {history.length > 0 && (
        <SectionCard icon="" title="Backup & Restore History" subtitle="Log of all backup and restore operations" accent="#64748b">
          <div className="table-container">
            <table style={{ fontSize: '0.78rem' }}>
              <thead><tr><th>Name</th><th>Type</th><th>Items</th><th>Size</th><th>Created By</th><th>Date</th></tr></thead>
              <tbody>
                {history.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600 }}>{b.name}</td>
                    <td><span style={BADGE(b.type === 'restore' ? '#f59e0b' : '#22c55e')}>{b.type === 'restore' ? ' Restore' : ' Backup'}</span></td>
                    <td className="text-muted">{b.items ? `${b.items.cases}C / ${b.items.clients}Cl / ${b.items.inventory}I` : '-'}</td>
                    <td className="text-muted">{b.size_kb ? `${b.size_kb} KB` : '-'}</td>
                    <td className="text-muted">{b.created_by || '-'}</td>
                    <td className="text-muted">{new Date(b.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </>
  );
}

//  Security Audit Panel 
function SecurityAuditPanel() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get('/security/audit').then(d => { setLogs(d.logs || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const getEventColor = (ev) => {
    if (!ev) return '#64748b';
    if (ev.includes('FAIL') || ev.includes('ERROR') || ev.includes('DENIED')) return '#ef4444';
    if (ev.includes('DELETE') || ev.includes('DISABLE')) return '#f59e0b';
    return '#22c55e';
  };

  return (
    <SectionCard icon="" title="Security Audit Log" subtitle="Login attempts, key rotations, and security events" accent="#ef4444">
      {loading ? <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" /></div> : (
        logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: '0.82rem' }}> No security events logged yet</div>
        ) : (
          <div className="table-container">
            <table style={{ fontSize: '0.75rem' }}>
              <thead><tr><th>Event</th><th>User/IP</th><th>Time</th></tr></thead>
              <tbody>
                {logs.map((l, i) => (
                  <tr key={i}>
                    <td><span style={{ ...BADGE(getEventColor(l.event)), fontFamily: 'var(--font-mono)' }}>{l.event}</span></td>
                    <td className="font-mono text-muted">{l.username || l.user_name || l.ip || '-'}</td>
                    <td className="text-muted">{new Date(l.at || l.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </SectionCard>
  );
}

//  Main Security & Backup Page 
const TABS = [
  { key: 'backup', icon: '', label: 'Backup & Restore' },
  { key: '2fa', icon: '', label: 'Two-Factor Auth' },
  { key: 'encryption', icon: '', label: 'Encryption' },
  { key: 'audit', icon: '', label: 'Audit Log' },
];

export default function SecurityBackupPage() {
  const [tab, setTab] = useState('backup');
  const { isAdmin } = useAuth();

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 4 }}> Security & Backup</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Two-factor authentication, per-user encryption, backup management, and security audit</p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg-elevated)', padding: 4, borderRadius: 'var(--radius-md)', width: 'fit-content', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
              background: tab === t.key ? 'var(--accent-primary)' : 'transparent',
              color: tab === t.key ? 'black' : 'var(--text-muted)',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'backup' && <BackupRestorePanel />}
      {tab === '2fa' && <TwoFactorPanel />}
      {tab === 'encryption' && <EncryptionPanel />}
      {tab === 'audit' && <SecurityAuditPanel />}
    </div>
  );
}
