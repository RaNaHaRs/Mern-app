import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const BASE_URL = '/api';

// Messages Timeline Component - displays portal messages and staff replies
function MessagesTimeline({ caseId, clientId }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!caseId) {
      console.log('No caseId provided to MessagesTimeline');
      return;
    }
    
    const loadMessages = async () => {
      setLoading(true);
      try {
        // Use the public endpoint that doesn't require authentication
        const res = await fetch(`${BASE_URL}/client-portal/messages/${caseId}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: Failed to load messages`);
        }
        const data = await res.json();
        
        // Data is already filtered for portal messages and replies
        setMessages(data || []);
      } catch (err) {
        console.error('Failed to load messages:', err.message);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [caseId]);

  if (loading) {
    return <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Loading messages...</div>;
  }

  if (!messages.length) {
    return <div style={{ fontSize: '0.75rem', color: '#64748b', padding: '8px 0' }}>No messages yet. Send one to get started!</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14, maxHeight: '100%', minHeight: 200, overflowY: 'auto', paddingRight: 8, borderRadius: 8, background: 'var(--bg-elevated)', padding: '12px' }}>
      {messages.map(msg => {
        const isClientMessage = msg.type === 'portal_message';
        const isReply = msg.type === 'portal_reply';
        
        return (
          <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Original message or reply */}
            <div style={{
              padding: '12px 14px',
              background: isClientMessage ? 'rgba(99,102,241,0.08)' : 'rgba(139,92,246,0.08)',
              border: `2px solid ${isClientMessage ? 'rgba(99,102,241,0.25)' : 'rgba(139,92,246,0.25)'}`,
              borderRadius: 8,
              color: isClientMessage ? 'rgba(99,102,241,0.8)' : 'rgba(139,92,246,0.8)'
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: 6, color: isClientMessage ? 'rgba(99,102,241,1)' : 'rgba(139,92,246,1)' }}>
                {isClientMessage ? '👤 You' : '👨‍💼 Engineer Reply'}
              </div>
              <div style={{ fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>
                {msg.summary?.replace(/^\[.*?\]\s*/, '')}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6 }}>
                {new Date(msg.created_at).toLocaleString('en-IN')}
              </div>
            </div>
            
            {/* Show which message the reply is for */}
            {isReply && msg.reply_to_summary && (
              <div style={{
                marginLeft: 24,
                padding: '10px 12px',
                background: 'rgba(99,102,241,0.05)',
                border: '2px solid rgba(99,102,241,0.2)',
                borderLeft: '4px solid rgba(99,102,241,0.6)',
                borderRadius: 6
              }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(99,102,241,0.8)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>↩ Replying to your message:</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, background: 'var(--bg-elevated)', padding: '8px 10px', borderRadius: 4 }}>
                  "{msg.reply_to_summary?.replace(/^\[.*?\]\s*/, '')}"
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ClientPortalPage() {
  const navigate = useNavigate();
  const [caseNum, setCaseNum] = useState('');
  const [credential, setCredential] = useState(''); // full phone number OR email
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

  // Auto-load case if case_id is in URL (from email portal link)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const caseIdFromUrl = urlParams.get('case_id');
    
    if (caseIdFromUrl && !caseData) {
      // Auto-load case from email link
      const autoLoadCase = async () => {
        setLoading(true);
        setError('');
        try {
          const res = await fetch(`${BASE_URL}/client-portal/case?case_id=${encodeURIComponent(caseIdFromUrl)}`);
          const data = await res.json().catch(() => {
            throw new Error('Server error. Please try again shortly.');
          });
          if (!res.ok || data.error) throw new Error(data.error || 'Case not found');
          setCaseData(data);
        } catch (err) {
          setError(err.message || 'Case not found. Please check the link and try again.');
        } finally {
          setLoading(false);
        }
      };
      
      autoLoadCase();
    }
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
          `${BASE_URL}/client-portal/case?case_number=${encodeURIComponent(caseNum.trim())}&phone_or_email=${encodeURIComponent(credential.trim())}`
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
        body: JSON.stringify({ 
          case_id: caseData.id, 
          case_number: caseData.case_number, 
          message: message.trim(), 
          phone: credential 
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to send');
      setMessageSent(true);
      setMessage('');
      setTimeout(() => setMessageSent(false), 5000);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSendingMsg(false);
    }
  };

  const company = (() => { try { return JSON.parse(localStorage.getItem('crm_company') || '{}'); } catch { return {}; } })();

  const stageInfo = caseData ? (STAGE_MESSAGES[caseData.stage] || { msg: 'Your case is being processed.', next: null }) : null;
  
  // Calculate progress: use recovery_progress_pct if available, otherwise calculate from stage
  let progress = 0;
  if (caseData) {
    if (caseData.recovery_progress_pct && caseData.recovery_progress_pct > 0) {
      progress = caseData.recovery_progress_pct;
    } else {
      progress = getStageProgress(caseData.stage);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px', position: 'relative' }}>

      {/* Logo / Header */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: '3rem', marginBottom: 8 }}>💾</div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          {company.name || 'RecoverLab'}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>Client Case Tracking Portal</p>
      </div>

      {/* Search Card - hide if case already loaded from URL */}
      {!caseData && (
        <div style={{ width: '100%', maxWidth: 520, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 28, marginBottom: 24 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            🔍 Track Your Case
          </h2>
          <form onSubmit={handleSearch}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Case Number *
              </label>
              <input
                style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none' }}
                value={caseNum}
                onChange={e => setCaseNum(e.target.value.toUpperCase())}
                placeholder="e.g. DR-2026-00001"
                autoFocus
                required
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Phone Number or Email <span style={{ color: 'var(--status-danger,#ef4444)', marginLeft: 2 }}>*</span>
              </label>
              <input
                style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' }}
                value={credential}
                onChange={e => setCredential(e.target.value)}
                placeholder="e.g. 9876543210 or you@email.com"
                type="text"
                required
              />
              <div style={{ marginTop: 5, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Enter your full registered phone number or email address
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || !caseNum.trim() || !credential.trim()}
              style={{ width: '100%', padding: '11px 0', background: loading ? 'var(--bg-elevated)' : 'var(--accent-primary)', border: 'none', borderRadius: 8, color: loading ? 'var(--text-muted)' : '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {loading ? '⌛ Searching...' : '🔎 Track Case'}
            </button>
          </form>

          {error && (
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--status-error-bg)', border: '1px solid var(--status-error-border)', borderRadius: 8, color: 'var(--status-error-text)', fontSize: '0.8rem' }}>
              ⚠ {error}
            </div>
          )}
        </div>
      )}

      {/* Case Result */}
      {caseData && (
        <div style={{ width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Search for Different Case Button */}
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <button
              onClick={() => {
                setCaseData(null);
                setCaseNum('');
                setCredential('');
                setError('');
                setMessage('');
                setMessageSent(false);
                window.history.replaceState({}, document.title, window.location.pathname);
              }}
              style={{ padding: '8px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
            >
              🔍 Search for Different Case
            </button>
          </div>

          {/* Case Header */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 24, backdropFilter: 'blur(12px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>CASE NUMBER</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--accent-primary)', fontFamily: 'monospace' }}>{caseData.case_number}</div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 99, background: `${STAGE_COLORS[caseData.stage] || '#64748b'}20`, border: `1px solid ${STAGE_COLORS[caseData.stage] || '#64748b'}40`, color: STAGE_COLORS[caseData.stage] || 'var(--text-muted)', fontWeight: 700, fontSize: '0.82rem' }}>
                {STAGE_ICONS[caseData.stage] || '📋'} {caseData.stage?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
            </div>

            {/* Progress Bar */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Recovery Progress</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontWeight: 700, fontFamily: 'monospace' }}>{progress}%</span>
              </div>
              <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))', borderRadius: 4, transition: 'width 1.2s ease' }} />
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
                <div key={f.label} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{f.label}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600 }}>{f.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* What's happening */}
          {stageInfo && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 20, backdropFilter: 'blur(12px)' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, fontSize: '0.88rem' }}>📋 What's Happening</div>
              <div style={{ padding: '12px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.7 }}>
                {stageInfo.msg}
              </div>
              {stageInfo.next && (
                <div style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  ⟶ Next step: <span style={{ color: 'var(--accent-primary)' }}>{stageInfo.next}</span>
                </div>
              )}
            </div>
          )}

          {/* Assigned Engineer */}
          {caseData.engineer_name && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 20, backdropFilter: 'blur(12px)' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, fontSize: '0.88rem' }}>🔧 Assigned Engineer</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Engineer Name</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600 }}>{caseData.engineer_name}</div>
                </div>
                {caseData.engineer_email && (
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Contact</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                      <a href={`mailto:${caseData.engineer_email}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>{caseData.engineer_email}</a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Send Message */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 20, backdropFilter: 'blur(12px)' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, fontSize: '0.88rem' }}>💬 Messages & Replies</div>
            
            {/* Messages History */}
            {caseData?.id ? (
              <MessagesTimeline caseId={caseData.id} />
            ) : (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '8px 0' }}>Unable to load messages</div>
            )}
            
            {/* Send Message Form */}
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, fontSize: '0.8rem' }}>Send a New Message</div>
              {messageSent && (
                <div style={{ marginBottom: 12, padding: '10px 12px', background: 'var(--status-success-bg)', border: '1px solid var(--status-success-border)', borderRadius: 8, color: 'var(--status-success-text)', fontSize: '0.8rem' }}>
                  ✅ Your message has been sent! Our team will respond soon.
                </div>
              )}
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Type your question or message… e.g. 'What is the estimated recovery time?' or 'Has the quote been sent?'"
                style={{ width: '100%', minHeight: 90, padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.82rem', resize: 'vertical', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{message.length}/2000</span>
                <button
                  onClick={handleSendMessage}
                  disabled={sendingMsg || !message.trim()}
                  style={{ padding: '9px 20px', background: message.trim() ? 'var(--accent-primary)' : 'var(--bg-elevated)', border: 'none', borderRadius: 8, color: message.trim() ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.82rem', cursor: message.trim() ? 'pointer' : 'not-allowed' }}
                >
                  {sendingMsg ? '⌛ Sending...' : '📩 Send Message'}
                </button>
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            <div style={{ marginBottom: 6 }}>Need urgent help? Contact us directly:</div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              {company.phone && <span style={{ color: 'var(--text-secondary)' }}>📞 {company.phone}</span>}
              {company.email && <span style={{ color: 'var(--text-secondary)' }}>✉️ {company.email}</span>}
              {!company.phone && !company.email && <span>Contact your data recovery center</span>}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
        <div>Powered by <strong style={{ color: 'var(--text-secondary)' }}>RecoverLab CRM</strong></div>
        <div style={{ marginTop: 4 }}>Your data privacy is our top priority — we never share your information.</div>
        <footer style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>&copy; {new Date().getFullYear()} RecoverLab. All rights reserved.</span>
        </footer>
      </div>
    </div>
  );
}
