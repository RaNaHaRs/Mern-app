/**
 * Platform Settings Tabs Component
 * Replaces localStorage-based tabs with real API calls to backend
 * Fixes issues: Razorpay, SEO, Homepage, Invoice, 2FA settings
 */

import React, { useState, useEffect, useCallback } from 'react';
import settingsApi from '../services/platformSettingsService';

// ═════════════════════════════════════════════════════════════════
// RAZORPAY SETTINGS TAB
// ═════════════════════════════════════════════════════════════════

export function RazorpaySettingsTab() {
  const [settings, setSettings] = useState({
    razorpay_key_id: '',
    razorpay_key_secret: '',
    razorpay_webhook_secret: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState('test');
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setError(null);
      const data = await settingsApi.getRazorpaySettings();
      setSettings(data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      if (!settings.razorpay_key_id) {
        throw new Error('Razorpay Key ID is required');
      }
      await settingsApi.updateRazorpaySettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setSettings(s => ({ ...s, [field]: value }));
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} /></div>;
  }

  return (
    <div>
      <div style={{
        marginBottom: 18, padding: '14px 18px', borderRadius: 12,
        background: settings.razorpay_key_id ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
        border: `1px solid ${settings.razorpay_key_id ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: settings.razorpay_key_id ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem'
          }}>R</div>
          <div>
            <div style={{
              fontWeight: 700, fontSize: '0.9rem',
              color: settings.razorpay_key_id ? '#10b981' : '#f59e0b'
            }}>
              {settings.razorpay_key_id ? 'Razorpay — Connected' : 'Razorpay — Not Configured'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {settings.razorpay_key_id ? `Mode: ${mode.toUpperCase()}` : 'Enter credentials to enable payment collection'}
            </div>
          </div>
        </div>
        <span style={{
          padding: '3px 10px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 800, fontFamily: 'var(--font-mono)',
          background: mode === 'live' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
          color: mode === 'live' ? '#10b981' : '#3b82f6'
        }}>{mode.toUpperCase()} MODE</span>
      </div>

      {error && (
        <div style={{
          marginBottom: 16, padding: '12px 14px', borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#ef4444', fontSize: '0.82rem'
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>API Credentials</div>

          <div className="form-group">
            <label className="form-label">Mode</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {['test', 'live'].map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8,
                    border: `2px solid ${mode === m ? (m === 'live' ? '#10b981' : '#3b82f6') : 'var(--border-subtle)'}`,
                    background: mode === m ? (m === 'live' ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)') : 'transparent',
                    color: mode === m ? (m === 'live' ? '#10b981' : '#3b82f6') : 'var(--text-muted)',
                    fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit'
                  }}
                >
                  {m === 'live' ? '🔴 Live' : '🟢 Test'}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Key ID <span style={{ color: 'var(--text-muted)', fontSize: '0.67rem' }}>({mode === 'live' ? 'rzp_live_...' : 'rzp_test_...'})</span></label>
            <input
              className="form-input font-mono"
              placeholder={mode === 'live' ? 'rzp_live_...' : 'rzp_test_...'}
              value={settings.razorpay_key_id}
              onChange={e => handleChange('razorpay_key_id', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Key Secret</label>
            <input
              type="password"
              className="form-input font-mono"
              placeholder="Enter key secret"
              value={settings.razorpay_key_secret || ''}
              onChange={e => handleChange('razorpay_key_secret', e.target.value)}
            />
            {settings.razorpay_key_secret === '[REDACTED]' && (
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                ✓ Credentials already saved. Leave blank to keep existing secret.
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Webhook Signing Secret</label>
            <input
              className="form-input font-mono"
              placeholder="whsec_..."
              value={settings.razorpay_webhook_secret || ''}
              onChange={e => handleChange('razorpay_webhook_secret', e.target.value)}
            />
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Find this in Razorpay Dashboard → Webhooks
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 16 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '💾 Saving...' : '💾 Save Razorpay Settings'}
          </button>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>Webhook URL</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              Add this URL in Razorpay Dashboard → Webhooks:
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 8,
              border: '1px solid var(--border-subtle)'
            }}>
              <code style={{
                flex: 1, fontSize: '0.72rem', fontFamily: 'var(--font-mono)',
                color: 'var(--accent-primary)', wordBreak: 'break-all'
              }}>
                {`${window.location.origin}/api/razorpay/webhook`}
              </code>
              <button
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: '0.7rem', padding: 4, borderRadius: 4
                }}
                onClick={() => {
                  navigator.clipboard?.writeText(`${window.location.origin}/api/razorpay/webhook`);
                  alert('Copied to clipboard!');
                }}
              >
                📋
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Enable Events</div>
            {[
              'payment.captured',
              'payment.failed',
              'subscription.activated',
              'subscription.charged',
              'refund.created'
            ].map(ev => (
              <div key={ev} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 8px', borderRadius: 6, marginBottom: 4,
                background: 'var(--bg-elevated)'
              }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                <code style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{ev}</code>
              </div>
            ))}
          </div>
        </div>
      </div>

      {saved && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: '#10b981', color: '#fff',
          padding: '10px 18px', borderRadius: 8,
          fontWeight: 700, fontSize: '0.85rem', zIndex: 9999
        }}>
          ✅ Razorpay settings saved!
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// SEO SETTINGS TAB
// ═════════════════════════════════════════════════════════════════

export function SeoSettingsTab() {
  const [settings, setSettings] = useState({
    meta_title: '',
    meta_description: '',
    meta_keywords: '',
    og_image_url: '',
    canonical_url: '',
    robots: 'index, follow',
    google_analytics_id: '',
    google_tag_manager_id: '',
    facebook_pixel_id: '',
    sitemap_enabled: true,
    schema_org_enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setError(null);
      const data = await settingsApi.getSeoSettings();
      setSettings(data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await settingsApi.updateSeoSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setSettings(s => ({ ...s, [field]: value }));
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} /></div>;
  }

  const charCount = (text, max) => ({
    color: text.length > max ? '#ef4444' : text.length > max * 0.9 ? '#f59e0b' : 'var(--text-muted)',
    text: `${text.length}/${max}`
  });

  return (
    <div>
      {error && (
        <div style={{
          marginBottom: 16, padding: '12px 14px', borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#ef4444', fontSize: '0.82rem'
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>Meta Tags</div>

            <div className="form-group">
              <label className="form-label">Meta Title <span style={{ fontSize: '0.7rem', color: charCount(settings.meta_title, 60).color }}>{charCount(settings.meta_title, 60).text}</span></label>
              <input
                className="form-input"
                placeholder="Page title for search engines"
                value={settings.meta_title}
                maxLength="60"
                onChange={e => handleChange('meta_title', e.target.value)}
              />
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>Recommended: 50-60 characters</div>
            </div>

            <div className="form-group">
              <label className="form-label">Meta Description <span style={{ fontSize: '0.7rem', color: charCount(settings.meta_description, 160).color }}>{charCount(settings.meta_description, 160).text}</span></label>
              <textarea
                className="form-textarea"
                placeholder="Page description for search results"
                value={settings.meta_description}
                maxLength="160"
                style={{ minHeight: 60 }}
                onChange={e => handleChange('meta_description', e.target.value)}
              />
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>Recommended: 155-160 characters</div>
            </div>

            <div className="form-group">
              <label className="form-label">Meta Keywords</label>
              <input
                className="form-input"
                placeholder="Comma-separated keywords"
                value={settings.meta_keywords}
                onChange={e => handleChange('meta_keywords', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Robots Meta Tag</label>
              <select
                className="form-select"
                value={settings.robots}
                onChange={e => handleChange('robots', e.target.value)}
              >
                <option value="index, follow">index, follow (allow crawling)</option>
                <option value="noindex, follow">noindex, follow (hide from search)</option>
                <option value="index, nofollow">index, nofollow (hide links)</option>
                <option value="noindex, nofollow">noindex, nofollow (hide completely)</option>
              </select>
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Open Graph (Social Sharing)</div>

            <div className="form-group">
              <label className="form-label">OG Image URL</label>
              <input
                className="form-input"
                placeholder="https://example.com/image.jpg"
                value={settings.og_image_url}
                onChange={e => handleChange('og_image_url', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Canonical URL</label>
              <input
                className="form-input"
                placeholder="https://example.com"
                value={settings.canonical_url}
                onChange={e => handleChange('canonical_url', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>Analytics & Tracking</div>

            <div className="form-group">
              <label className="form-label">Google Analytics ID</label>
              <input
                className="form-input font-mono"
                placeholder="G-XXXXXXXXXX"
                value={settings.google_analytics_id}
                onChange={e => handleChange('google_analytics_id', e.target.value)}
              />
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>GA4 tracking ID</div>
            </div>

            <div className="form-group">
              <label className="form-label">Google Tag Manager ID</label>
              <input
                className="form-input font-mono"
                placeholder="GTM-XXXXXXX"
                value={settings.google_tag_manager_id}
                onChange={e => handleChange('google_tag_manager_id', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Facebook Pixel ID</label>
              <input
                className="form-input font-mono"
                placeholder="123456789"
                value={settings.facebook_pixel_id}
                onChange={e => handleChange('facebook_pixel_id', e.target.value)}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Indexing</div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.sitemap_enabled}
                onChange={e => handleChange('sitemap_enabled', e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem' }}>Enable XML Sitemap</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.schema_org_enabled}
                onChange={e => handleChange('schema_org_enabled', e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem' }}>Enable Schema.org Markup</span>
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '💾 Saving...' : '💾 Save SEO Settings'}
        </button>
      </div>

      {saved && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: '#10b981', color: '#fff',
          padding: '10px 18px', borderRadius: 8,
          fontWeight: 700, fontSize: '0.85rem', zIndex: 9999
        }}>
          ✅ SEO settings saved!
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// HOMEPAGE CMS SETTINGS TAB
// ═════════════════════════════════════════════════════════════════

export function HomepageSettingsTab() {
  const [settings, setSettings] = useState({
    hero_title: '',
    hero_subtitle: '',
    hero_cta_text: '',
    hero_cta_url: '',
    announcement_enabled: false,
    announcement_text: '',
    show_pricing_section: true,
    show_features_section: true,
    show_testimonials: true,
    show_faq: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setError(null);
      const data = await settingsApi.getHomepageSettings();
      setSettings(data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await settingsApi.updateHomepageSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setSettings(s => ({ ...s, [field]: value }));
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} /></div>;
  }

  return (
    <div>
      {error && (
        <div style={{
          marginBottom: 16, padding: '12px 14px', borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#ef4444', fontSize: '0.82rem'
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>Hero Section</div>

            <div className="form-group">
              <label className="form-label">Hero Title</label>
              <input
                className="form-input"
                placeholder="Main headline"
                value={settings.hero_title}
                onChange={e => handleChange('hero_title', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Hero Subtitle</label>
              <textarea
                className="form-textarea"
                placeholder="Subheadline or tagline"
                value={settings.hero_subtitle}
                style={{ minHeight: 60 }}
                onChange={e => handleChange('hero_subtitle', e.target.value)}
              />
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">CTA Button Text</label>
                <input
                  className="form-input"
                  placeholder="e.g. Start Free Trial"
                  value={settings.hero_cta_text}
                  onChange={e => handleChange('hero_cta_text', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">CTA Button URL</label>
                <input
                  className="form-input"
                  placeholder="/signup"
                  value={settings.hero_cta_url}
                  onChange={e => handleChange('hero_cta_url', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Announcement Banner</div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.announcement_enabled}
                onChange={e => handleChange('announcement_enabled', e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem' }}>Enable Announcement</span>
            </label>

            {settings.announcement_enabled && (
              <div className="form-group">
                <label className="form-label">Announcement Text</label>
                <textarea
                  className="form-textarea"
                  placeholder="e.g. We're currently offering 50% off all plans!"
                  value={settings.announcement_text}
                  style={{ minHeight: 60 }}
                  onChange={e => handleChange('announcement_text', e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Page Sections</div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.show_pricing_section}
                onChange={e => handleChange('show_pricing_section', e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem' }}>Show Pricing Section</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.show_features_section}
                onChange={e => handleChange('show_features_section', e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem' }}>Show Features Section</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.show_testimonials}
                onChange={e => handleChange('show_testimonials', e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem' }}>Show Testimonials</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.show_faq}
                onChange={e => handleChange('show_faq', e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem' }}>Show FAQ</span>
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '💾 Saving...' : '💾 Save Homepage Settings'}
        </button>
      </div>

      {saved && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: '#10b981', color: '#fff',
          padding: '10px 18px', borderRadius: 8,
          fontWeight: 700, fontSize: '0.85rem', zIndex: 9999
        }}>
          ✅ Homepage settings saved!
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// INVOICE SETTINGS TAB
// ═════════════════════════════════════════════════════════════════

export function InvoiceSettingsTab() {
  const [settings, setSettings] = useState({
    gst_percent: 18,
    invoice_prefix: 'INV',
    auto_send: true,
    auto_activate_tenant: true,
    from_email: 'billing@recoverlab.in',
    from_name: 'RecoverLab Billing',
    subject_template: 'Your {{plan_label}} Invoice — {{invoice_number}}',
    body_intro: 'Thank you for subscribing.',
    include_pdf: true,
    company_gstin: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setError(null);
      const data = await settingsApi.getInvoiceSettings();
      setSettings(data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await settingsApi.updateInvoiceSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setSettings(s => ({ ...s, [field]: value }));
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} /></div>;
  }

  return (
    <div>
      {error && (
        <div style={{
          marginBottom: 16, padding: '12px 14px', borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#ef4444', fontSize: '0.82rem'
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>Invoice Configuration</div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">GST % (for invoices)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="18"
                  value={settings.gst_percent}
                  min="0"
                  max="100"
                  onChange={e => handleChange('gst_percent', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Invoice Number Prefix</label>
                <input
                  className="form-input font-mono"
                  placeholder="INV"
                  value={settings.invoice_prefix}
                  onChange={e => handleChange('invoice_prefix', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Company GSTIN</label>
              <input
                className="form-input font-mono"
                placeholder="27AABCT..."
                value={settings.company_gstin}
                onChange={e => handleChange('company_gstin', e.target.value)}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Email Settings</div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">From Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="billing@example.com"
                  value={settings.from_email}
                  onChange={e => handleChange('from_email', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">From Name</label>
                <input
                  className="form-input"
                  placeholder="Company Name"
                  value={settings.from_name}
                  onChange={e => handleChange('from_name', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email Subject Template</label>
              <input
                className="form-input"
                placeholder="Your {{plan_label}} Invoice — {{invoice_number}}"
                value={settings.subject_template}
                onChange={e => handleChange('subject_template', e.target.value)}
              />
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Available variables: {'{{'}{`plan_label`}{'}}'}}, {'{{'}{`invoice_number`}{'}}'}}, {'{{'}{`amount`}{'}}'}}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email Body Intro</label>
              <textarea
                className="form-textarea"
                placeholder="Thank you for subscribing..."
                value={settings.body_intro}
                style={{ minHeight: 60 }}
                onChange={e => handleChange('body_intro', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Automation</div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.auto_send}
                onChange={e => handleChange('auto_send', e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem' }}>Auto-send invoice email on payment</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.include_pdf}
                onChange={e => handleChange('include_pdf', e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem' }}>Include PDF invoice as attachment</span>
            </label>

            <div style={{
              marginTop: 16, padding: 12, borderRadius: 8,
              background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)'
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981', marginBottom: 8 }}>✓ Invoice Generation</div>
              <ul style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, paddingLeft: 16 }}>
                <li>Invoices auto-generate after payment verification</li>
                <li>Unique invoice numbers per payment</li>
                <li>GST calculations included on PDF</li>
                <li>Payment & order details embedded</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '💾 Saving...' : '💾 Save Invoice Settings'}
        </button>
      </div>

      {saved && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: '#10b981', color: '#fff',
          padding: '10px 18px', borderRadius: 8,
          fontWeight: 700, fontSize: '0.85rem', zIndex: 9999
        }}>
          ✅ Invoice settings saved!
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// 2FA SETTINGS TAB
// ═════════════════════════════════════════════════════════════════

export function TwoFASettingsTab() {
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [secret, setSecret] = useState(null);
  const [verificationToken, setVerificationToken] = useState('');
  const [backupCodes, setBackupCodes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setting, setSetting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [enforced, setEnforced] = useState(false);
  const [loadingEnforcement, setLoadingEnforcement] = useState(true);

  useEffect(() => {
    loadStatus();
    loadEnforcementStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setError(null);
      const data = await settingsApi.get2FAStatus();
      setTwoFAEnabled(data.is_enabled);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const loadEnforcementStatus = async () => {
    try {
      const data = await settingsApi.get2FAEnforcementStatus();
      setEnforced(data.enforced);
      setLoadingEnforcement(false);
    } catch (err) {
      setLoadingEnforcement(false);
    }
  };

  const handleSetup2FA = async () => {
    try {
      setSetting(true);
      setError(null);
      const data = await settingsApi.setup2FA();
      setSecret(data.secret);
      setQrCode(data.qr_code);
    } catch (err) {
      setError(err.message);
    } finally {
      setSetting(false);
    }
  };

  const handleVerify2FA = async () => {
    try {
      if (!verificationToken || verificationToken.length !== 6) {
        throw new Error('Enter a valid 6-digit code');
      }
      setVerifying(true);
      setError(null);
      const data = await settingsApi.verify2FA(verificationToken);
      setTwoFAEnabled(true);
      setBackupCodes(data.backupCodes);
      setQrCode(null);
      setSecret(null);
      setVerificationToken('');
      setSuccess('2FA enabled successfully! Save your backup codes in a safe place.');
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!confirm('Are you sure? You will lose access if locked out.')) return;
    try {
      setDisabling(true);
      setError(null);
      await settingsApi.disable2FA();
      setTwoFAEnabled(false);
      setSuccess('2FA disabled');
      setBackupCodes(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDisabling(false);
    }
  };

  const handleSetEnforcement = async (value) => {
    try {
      setLoadingEnforcement(true);
      await settingsApi.set2FAEnforcement(value);
      setEnforced(value);
      setSuccess(value ? '2FA enforcement enabled' : '2FA enforcement disabled');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingEnforcement(false);
    }
  };

  if (loading || loadingEnforcement) {
    return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} /></div>;
  }

  return (
    <div>
      {error && (
        <div style={{
          marginBottom: 16, padding: '12px 14px', borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#ef4444', fontSize: '0.82rem'
        }}>
          ❌ {error}
        </div>
      )}

      {success && (
        <div style={{
          marginBottom: 16, padding: '12px 14px', borderRadius: 8,
          background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
          color: '#10b981', fontSize: '0.82rem'
        }}>
          ✅ {success}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>Your 2FA Status</div>

            <div style={{
              padding: 14, borderRadius: 8, marginBottom: 16,
              background: twoFAEnabled ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
              border: `1px solid ${twoFAEnabled ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`
            }}>
              <div style={{
                fontSize: '0.9rem', fontWeight: 700,
                color: twoFAEnabled ? '#10b981' : '#f59e0b'
              }}>
                {twoFAEnabled ? '✓ 2FA Enabled' : '⚠ 2FA Disabled'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                {twoFAEnabled
                  ? 'Your account is protected with two-factor authentication'
                  : 'Enable 2FA to protect your account with TOTP'}
              </div>
            </div>

            {!twoFAEnabled && !qrCode && (
              <button
                className="btn btn-primary"
                onClick={handleSetup2FA}
                disabled={setting}
                style={{ width: '100%' }}
              >
                {setting ? '⏳ Generating...' : '🔐 Enable 2FA'}
              </button>
            )}

            {qrCode && (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: 10 }}>Step 1: Scan QR Code</div>
                <div style={{
                  padding: 16, borderRadius: 8, background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)', textAlign: 'center', marginBottom: 14
                }}>
                  <img src={qrCode} alt="2FA QR Code" style={{ width: 180, height: 180 }} />
                </div>

                <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: 10 }}>Manual Entry (if QR doesn't work):</div>
                <input
                  type="text"
                  className="form-input font-mono"
                  value={secret}
                  readOnly
                  style={{ marginBottom: 14 }}
                />

                <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: 10 }}>Step 2: Enter 6-digit code</div>
                <input
                  type="text"
                  className="form-input"
                  placeholder="000000"
                  value={verificationToken}
                  onChange={e => setVerificationToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength="6"
                  style={{ marginBottom: 14, fontSize: '1.2rem', textAlign: 'center', letterSpacing: 2 }}
                />

                <button
                  className="btn btn-primary"
                  onClick={handleVerify2FA}
                  disabled={verifying || verificationToken.length !== 6}
                  style={{ width: '100%' }}
                >
                  {verifying ? '⏳ Verifying...' : '✓ Verify & Enable 2FA'}
                </button>
              </div>
            )}

            {twoFAEnabled && (
              <button
                className="btn btn-danger"
                onClick={handleDisable2FA}
                disabled={disabling}
                style={{ width: '100%' }}
              >
                {disabling ? '⏳ Disabling...' : '🔓 Disable 2FA'}
              </button>
            )}
          </div>

          {backupCodes && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>⚠️ Backup Codes (Save Now!)</div>
              <div style={{ fontSize: '0.72rem', color: '#ef4444', marginBottom: 12 }}>
                Save these codes in a secure location. You can use them if you lose access to your authenticator app.
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                padding: 12, background: 'var(--bg-subtle)', borderRadius: 8, marginBottom: 12,
                fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: 1
              }}>
                {backupCodes.map((code, i) => (
                  <div key={i} style={{ color: '#10b981' }}>{code}</div>
                ))}
              </div>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  navigator.clipboard?.writeText(backupCodes.join('\n'));
                  alert('Backup codes copied to clipboard');
                }}
              >
                📋 Copy All
              </button>
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Global 2FA Enforcement</div>

            <div style={{
              padding: 12, borderRadius: 8, marginBottom: 14,
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Require 2FA for all super admin accounts
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={enforced}
                onChange={e => handleSetEnforcement(e.target.checked)}
                disabled={loadingEnforcement}
              />
              <span style={{ fontSize: '0.85rem' }}>
                {enforced ? '✓ 2FA Enforced' : 'Enable 2FA requirement'}
              </span>
            </label>

            <div style={{
              padding: 12, borderRadius: 8,
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)'
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981', marginBottom: 8 }}>✓ Security Benefits</div>
              <ul style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0, paddingLeft: 16 }}>
                <li>Prevents unauthorized account access</li>
                <li>Protects sensitive platform settings</li>
                <li>Meets compliance requirements</li>
                <li>Works with any TOTP authenticator app</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
