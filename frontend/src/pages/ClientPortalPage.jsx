import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const BASE_URL = '/api';

export default function ClientPortalPage() {
  const navigate = useNavigate();
  const [caseNum, setCaseNum] = useState('');
  const [phone, setPhone] = useState('');
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [messageSent, setMessageSent] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);

  // Detect if an admin/staff is already authenticated
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setIsAdminLoggedIn(!!token);
  }, []);

  const STAGE_ICONS = {
    received: '📥', inspection: '🔍', diagnosis: '🔬', quotation: '💰', approved: '✅',
    rejected: '❌', recovery_in_progress: '⚙️', imaging: '💿', data_extraction: '📂',
    verification: '✔️', completed: '🏆', delivered: '🚚', failed: '❗',
  };

  const STAGE_COLORS = {
    received: '#64748b', inspection: '#3b82f6', diagnosis: '#6366f1', quotation: '#f59e0b',
    approved: '#10b981', rejected: '#ef4444', recovery_in_progress: '#00d4ff',
    imaging: '#7c3aed', data_extraction: '#ec4899', verification: '#fbbf24',
    completed: '#10b981', delivered: '#00d4ff', failed: '#dc2626',
  };

  const STAGE_MESSAGES = {
    received:               { msg: 'Your device has been received and is in our facility. Our team will begin inspection shortly.', next: 'Inspection & Initial Assessment' },
    inspection:             { msg: 'Our engineers are conducting a thorough physical inspection of your device.', next: 'Deep Diagnosis' },
    diagnosis:              { msg: 'Advanced diagnostics are being performed to identify the exact failure type and recovery path.', next: 'Quotation & Approval' },
    quotation:              { msg: 'A recovery quote has been prepared. Please check your email or call us for approval.', next: 'Recovery Work' },
    approved:               { msg: 'Your quote has been approved! Our engineers are preparing for recovery operations.', next: 'Active Recovery' },
    recovery_in_progress:   { msg: 'Recovery operations are actively underway. This is the core recovery phase.', next: 'Imaging & Data Extraction' },
    imaging:                { msg: 'We are creating a sector-by-sector image of your drive to safely extract data.', next: 'Data Extraction' },
    data_extraction:        { msg: 'Successfully extracted data is being organized and verified.', next: 'Final Verification' },
    verification:           { msg: 'Your recovered data is being verified for integrity and completeness.', next: 'Ready for Delivery' },
    completed:              { msg: '🏆 Recovery is complete! Your data has been successfully recovered.', next: 'Delivery' },
    delivered:              { msg: '🚚 Your recovered data has been delivered. Thank you for choosing us!', next: null },
    failed:                 { msg: '❗ Unfortunately, data recovery was not possible for your device due to the extent of damage.', next: null },
  };

  const getStageProgress = (stage) => {
    const order = ['received','inspection','diagnosis','quotation','approved','recovery_in_progress','imaging','data_extraction','verification','completed','delivered'];
    const idx = order.indexOf(stage);
    return idx === -1 ? 0 : Math.round((idx / (order.length - 1)) * 100);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!caseNum.trim()) return;
    setLoading(true);
    setError('');
    setCaseData(null);
    try {
      let res;
      try {
        res = await fetch(
          `${BASE_URL}/client-portal/case?case_number=${encodeURIComponent(caseNum.trim())}&phone=${encodeURIComponent(phone.trim())}`
        );
      } catch {
        throw new Error('Unable to reach server. Please try again shortly.');
      }
      const data = await res.json().catch(() => {
        throw new Error('Server error. Please try again shortly.');
      });
      if (!res.ok || data.error) throw new Error(data.error || 'Case not found');
      setCaseData(data);
    } catch (err) {
      setError(err.message || 'Case not found. Please check the case number and phone number.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !caseData) return;
    setSendingMsg(true);
    try {
      const res = await fetch(`${BASE_URL}/client-portal/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: caseData.id, case_number: caseData.case_number, message: message.trim(), phone }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to send');
      setMessageSent(true);
      setMessage('');
      setTimeout(() => setMessageSent(false), 5000);
    } catch (err) {
      alert(err.message);
    } finally {
      setSendingMsg(false);
    }
  };

  const company = (() => { try { return JSON.parse(localStorage.getItem('crm_company') || '{}'); } catch { return {}; } })();

  const stageInfo = caseData ? (STAGE_MESSAGES[caseData.stage] || { msg: 'Your case is being processed.', next: null }) : null;
  const progress = caseData ? (caseData.recovery_progress_pct || getStageProgress(caseData.stage)) : 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px', position: 'relative' }}>

      {/* Admin back-to-CRM bar */}
      {isAdminLoggedIn && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'rgba(0,212,255,0.1)', borderBottom: '1px solid rgba(0,212,255,0.2)', backdropFilter: 'blur(12px)', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            👁 You are viewing the <strong style={{ color: '#00d4ff' }}>Client Portal</strong> as a staff member
          </span>
          <button
            onClick={() => navigate('/cases')}
            style={{ background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.35)', color: '#00d4ff', padding: '5px 14px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
          >
            ← Back to CRM
          </button>
        </div>
      )}

      {/* Logo / Header */}
      <div style={{ textAlign: 'center', marginBottom: 40, marginTop: isAdminLoggedIn ? 48 : 0 }}>
        <div style={{ fontSize: '3rem', marginBottom: 8 }}>💾</div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', margin: '0 0 4px' }}>
          {company.name || 'RecoverLab'}
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: 0 }}>Client Case Tracking Portal</p>
      </div>

      {/* Search Card */}
      <div style={{ width: '100%', maxWidth: 520, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 28, marginBottom: 24 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          🔍 Track Your Case
        </h2>
        <form onSubmit={handleSearch}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Case Number *
            </label>
            <input
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#e2e8f0', fontSize: '0.9rem', fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none' }}
              value={caseNum}
              onChange={e => setCaseNum(e.target.value.toUpperCase())}
              placeholder="e.g. DR-2026-00001"
              autoFocus
              required
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Registered Phone / Last 4 digits
            </label>
            <input
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' }}
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 9876 or 9876543210"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !caseNum.trim()}
            style={{ width: '100%', padding: '11px 0', background: loading ? '#1e3a5f' : 'var(--accent-primary)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {loading ? '⌛ Searching...' : '🔎 Track Case'}
          </button>
        </form>

        {error && (
          <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: '#fca5a5', fontSize: '0.8rem' }}>
            ⚠ {error}
          </div>
        )}
      </div>

      {/* Case Result */}
      {caseData && (
        <div style={{ width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Case Header */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, backdropFilter: 'blur(12px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>CASE NUMBER</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#00d4ff', fontFamily: 'monospace' }}>{caseData.case_number}</div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 99, background: `${STAGE_COLORS[caseData.stage] || '#64748b'}20`, border: `1px solid ${STAGE_COLORS[caseData.stage] || '#64748b'}40`, color: STAGE_COLORS[caseData.stage] || '#94a3b8', fontWeight: 700, fontSize: '0.82rem' }}>
                {STAGE_ICONS[caseData.stage] || '📋'} {caseData.stage?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
            </div>

            {/* Progress Bar */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Recovery Progress</span>
                <span style={{ fontSize: '0.72rem', color: '#00d4ff', fontWeight: 700, fontFamily: 'monospace' }}>{progress}%</span>
              </div>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #0070f3, #00d4ff)', borderRadius: 4, transition: 'width 1.2s ease' }} />
              </div>
            </div>

            {/* Device Info Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {[
                { label: 'Device', value: [caseData.device_brand, caseData.device_model].filter(Boolean).join(' ') || '—' },
                { label: 'Failure Type', value: caseData.failure_type?.replace(/_/g, ' ') || '—' },
                { label: 'Priority', value: ['', 'Critical', 'High', 'Medium', 'Low', 'Minimal'][caseData.priority] || 'Normal' },
                { label: 'Date Received', value: caseData.created_at ? new Date(caseData.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
              ].map(f => (
                <div key={f.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{f.label}</div>
                  <div style={{ fontSize: '0.82rem', color: '#e2e8f0', fontWeight: 600 }}>{f.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* What's happening */}
          {stageInfo && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, backdropFilter: 'blur(12px)' }}>
              <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 14, fontSize: '0.88rem' }}>📋 What's Happening</div>
              <div style={{ padding: '12px 14px', background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 8, color: '#94a3b8', fontSize: '0.82rem', lineHeight: 1.7 }}>
                {stageInfo.msg}
              </div>
              {stageInfo.next && (
                <div style={{ marginTop: 10, fontSize: '0.75rem', color: '#64748b' }}>
                  ⟶ Next step: <span style={{ color: '#00d4ff' }}>{stageInfo.next}</span>
                </div>
              )}
            </div>
          )}

          {/* Send Message */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, backdropFilter: 'blur(12px)' }}>
            <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 14, fontSize: '0.88rem' }}>💬 Send a Message to Engineers</div>
            {messageSent && (
              <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8, color: '#6ee7b7', fontSize: '0.8rem' }}>
                ✅ Your message has been sent! Our team will respond soon.
              </div>
            )}
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type your question or message… e.g. 'What is the estimated recovery time?' or 'Has the quote been sent?'"
              style={{ width: '100%', minHeight: 90, padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', fontSize: '0.82rem', resize: 'vertical', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <span style={{ fontSize: '0.72rem', color: '#475569' }}>{message.length}/2000</span>
              <button
                onClick={handleSendMessage}
                disabled={sendingMsg || !message.trim()}
                style={{ padding: '9px 20px', background: message.trim() ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8, color: message.trim() ? '#fff' : '#64748b', fontWeight: 700, fontSize: '0.82rem', cursor: message.trim() ? 'pointer' : 'not-allowed' }}
              >
                {sendingMsg ? '⌛ Sending...' : '📩 Send Message'}
              </button>
            </div>
          </div>

          {/* Contact Info */}
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#64748b', fontSize: '0.75rem' }}>
            <div style={{ marginBottom: 6 }}>Need urgent help? Contact us directly:</div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              {company.phone && <span style={{ color: '#94a3b8' }}>📞 {company.phone}</span>}
              {company.email && <span style={{ color: '#94a3b8' }}>✉️ {company.email}</span>}
              {!company.phone && !company.email && <span>Contact your data recovery center</span>}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: 40, textAlign: 'center', color: '#374151', fontSize: '0.7rem' }}>
        <div>Powered by <strong style={{ color: '#64748b' }}>RecoverLab CRM</strong></div>
        <div style={{ marginTop: 4 }}>Your data privacy is our top priority — we never share your information.</div>
      </div>
    </div>
  );
}
