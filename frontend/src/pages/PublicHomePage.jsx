import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HOMEPAGE_THEMES, HOMEPAGE_LAYOUTS, getTheme, getLayout } from './HomepageThemes';

const API = 'http://localhost:5000/api';

/* ── Scroll reveal hook ─────────────────────────────────────────── */
function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

/* ── Animated counter ───────────────────────────────────────────── */
function AnimatedCount({ target, suffix = '' }) {
  const [val, setVal] = useState(0);
  const [ref, visible] = useReveal(0.5);
  useEffect(() => {
    if (!visible) return;
    const num = parseInt(target);
    if (isNaN(num)) { setVal(target); return; }
    let cur = 0;
    const step = Math.max(1, Math.ceil(num / 60));
    const t = setInterval(() => { cur = Math.min(cur + step, num); setVal(cur); if (cur >= num) clearInterval(t); }, 16);
    return () => clearInterval(t);
  }, [visible, target]);
  return <span ref={ref}>{val}{suffix}</span>;
}

/* ── Particle field ─────────────────────────────────────────────── */
function Particles({ theme }) {
  const pts = Array.from({ length: 25 }, (_, i) => ({
    id: i, x: Math.random() * 100, y: Math.random() * 100,
    size: Math.random() * 3 + 1, dur: Math.random() * 8 + 6, delay: Math.random() * 5,
    colorIdx: i % theme.particle_colors.length,
  }));
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {pts.map(p => (
        <div key={p.id} style={{
          position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
          width: p.size, height: p.size, borderRadius: '50%',
          background: theme.particle_colors[p.colorIdx],
          animation: `floatPt ${p.dur}s ${p.delay}s ease-in-out infinite`,
        }} />
      ))}
    </div>
  );
}

const defaultContent = {
  active_theme: 'cyber_cyan',
  active_layout: 'split_hero',
  app_name: 'RecoverLab CRM',
  app_tagline: 'Enterprise Data Recovery Platform',
  hero_title: 'Professional Data Recovery Management',
  hero_subtitle: 'Track cases, manage clients, handle billing — all in one powerful enterprise platform built for data recovery labs.',
  hero_badge: 'Enterprise Data Recovery CRM',
  cta_primary: '🚀 Launch Platform',
  cta_secondary: '📋 Track My Case',
  contact_phone: '+91 98765 43210',
  contact_email: 'support@recoverlab.in',
  contact_address: 'Mumbai, Maharashtra, India',
  footer_text: '© 2025 RecoverLab. All rights reserved.',
  primary_color: '#00d4ff',
  logo_emoji: '💾',
  show_client_portal: true,
  seo: {
    site_title: 'RecoverLab CRM — Enterprise Data Recovery Platform',
    meta_description: 'Professional CRM for data recovery labs. Track cases, manage clients, send invoices and handle payments — all in one platform.',
    meta_keywords: 'data recovery CRM, HDD recovery software, data recovery lab management, case tracking',
    og_title: 'RecoverLab CRM',
    og_description: 'Enterprise CRM for data recovery labs',
    og_image: '',
    robots: 'index,follow',
    canonical_url: '',
    analytics_id: '',
  },
  stats: [
    { value: '500', suffix: '+', label: 'Data Recovery Labs' },
    { value: '99', suffix: '.9%', label: 'Uptime SLA' },
    { value: '50000', suffix: '+', label: 'Cases Recovered' },
    { value: '24', suffix: '/7', label: 'Support Available' },
  ],
  how_it_works: [
    { step: '01', icon: '📥', title: 'Receive Device', desc: 'Log the faulty device into the CRM with client details, failure type, and priority. Auto-generate a case number.' },
    { step: '02', icon: '🔬', title: 'Diagnose & Quote', desc: 'Engineers assess the damage, update the case with diagnosis notes, and auto-send a quotation to the client.' },
    { step: '03', icon: '🔧', title: 'Perform Recovery', desc: 'Track the recovery process stage by stage. Attach photos, notes and evidence. Update status in real time.' },
    { step: '04', icon: '📦', title: 'Deliver & Invoice', desc: 'Generate a GST invoice, send a payment link, mark the case delivered. Auto-confirmation on payment.' },
  ],
  why_us: [
    { icon: '🛡️', title: 'Enterprise Security', desc: 'Per-user AES-256 encryption, 2FA authentication, OTP resets via Email/WhatsApp, and full audit logging.' },
    { icon: '⚡', title: 'Real-time Everything', desc: 'Live case updates, team chat, webhook events, and payment confirmations — all event-driven.' },
    { icon: '🔗', title: 'Integrates Anywhere', desc: 'Connect to n8n, Zapier, Slack, WhatsApp, or any HTTP endpoint with 20+ CRM event triggers.' },
    { icon: '📱', title: 'Mobile Responsive', desc: 'Full mobile support with adaptive layouts. Manage cases, chat with engineers, and track payments from any device.' },
    { icon: '💾', title: 'Data Never Lost', desc: 'Automated backups including all images, complete restore with Append or Full Replace mode, Google Drive integration.' },
    { icon: '🎯', title: 'Built for Recovery Labs', desc: 'HDD/SSD/RAID-specific workflows, inventory & donor matching, OCR photo analysis, and engineer performance analytics.' },
  ],
  testimonials: [
    { name: 'Rohit Mehta', role: 'Owner, DataFixPro Mumbai', text: 'RecoverLab CRM transformed how we manage 80+ cases per month. The webhook integration with our WhatsApp bot is incredible.', avatar: 'RM' },
    { name: 'Priya Sharma', role: 'Ops Manager, StorageHero Bangalore', text: 'The per-user encryption and 2FA gave our enterprise clients the confidence they needed. Best CRM for data recovery labs.', avatar: 'PS' },
    { name: 'Amit Verma', role: 'Lead Engineer, RecoverNow Delhi', text: 'Team chat + case updates in one place saves us hours. Payment links and auto-invoice is a game changer.', avatar: 'AV' },
  ],
  features: [
    { icon: '📂', title: 'Case Management', desc: 'Track every recovery job from intake to delivery with full status history, priority flagging, and engineer assignment.' },
    { icon: '👥', title: 'Client Management', desc: 'Manage client profiles, communication history, and case associations in one unified view with smart search.' },
    { icon: '💳', title: 'Invoicing & Payments', desc: 'Generate GST invoices, send payment links via email, and auto-confirm payments via gateway webhooks.' },
    { icon: '🔧', title: 'Team Management', desc: 'Assign engineers, track performance, set role-based permissions, and monitor workloads in real time.' },
    { icon: '🛡️', title: 'Security & Backup', desc: 'Per-user encryption, 2FA, OTP resets, full data backup including images — enterprise-grade protection.' },
    { icon: '💬', title: 'Team Chat', desc: 'Built-in real-time team chat with channels for Engineers, Billing, Case Updates — no external tools needed.' },
    { icon: '🔗', title: 'Webhook Integrations', desc: 'Connect to n8n, Zapier, Slack or any HTTP endpoint with 20+ event triggers, HMAC-signed.' },
    { icon: '📊', title: 'Analytics & Reports', desc: 'Stage distribution, engineer performance, revenue trends, and fully export-ready CSV/PDF reports.' },
  ],
};

export default function PublicHomePage() {
  const navigate = useNavigate();
  const [cmsData, setCmsData] = useState(defaultContent);
  const [navSolid, setNavSolid] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [heroRef, heroVisible]   = useReveal(0.1);
  const [howRef, howVisible]     = useReveal(0.2);
  const [whyRef, whyVisible]     = useReveal(0.2);
  const [featRef, featVisible]   = useReveal(0.1);
  const [testRef, testVisible]   = useReveal(0.2);
  const [ctaRef, ctaVisible]     = useReveal(0.3);

  // Decode HTML entities (e.g. &#x1F4BE; → 💾)
  const decodeHtml = (str) => {
    if (!str || typeof str !== 'string') return str;
    const el = document.createElement('textarea');
    el.innerHTML = str;
    return el.value;
  };

  useEffect(() => {
    fetch(`${API}/settings/homepage`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
    }).then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          if (d.logo_emoji) d.logo_emoji = decodeHtml(d.logo_emoji);
          setCmsData(c => ({ ...c, ...d }));
        }
      })
      .catch(() => {});
    fetch(`${API}/settings/seo`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
    }).then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCmsData(c => ({ ...c, seo: { ...c.seo, ...d } })); })
      .catch(() => {});
  }, []);

  // Listen for live updates from Super Admin console (local edits)
  useEffect(() => {
    const onHomepage = (ev) => {
      const h = ev.detail || {};
      setCmsData(c => ({ ...c, ...h }));
    };
    const onSeo = (ev) => {
      const s = ev.detail || {};
      setCmsData(c => ({ ...c, seo: { ...c.seo, ...s } }));
      try { if (s.site_title || s.meta_title) document.title = s.site_title || s.meta_title; } catch (e) {}
      try {
        if (s.meta_description) {
          let el = document.querySelector("meta[name='description']"); if (!el) { el = document.createElement('meta'); el.name = 'description'; document.head.appendChild(el); } el.content = s.meta_description;
        }
        if (s.meta_keywords) {
          let el = document.querySelector("meta[name='keywords']"); if (!el) { el = document.createElement('meta'); el.name = 'keywords'; document.head.appendChild(el); } el.content = s.meta_keywords;
        }
      } catch (e) {}
    };
    window.addEventListener('sa_homepage_update', onHomepage);
    window.addEventListener('sa_seo_update', onSeo);
    return () => { window.removeEventListener('sa_homepage_update', onHomepage); window.removeEventListener('sa_seo_update', onSeo); };
  }, []);

  useEffect(() => {
    const h = () => setNavSolid(window.scrollY > 60);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  const c = cmsData;
  const theme = getTheme(c.active_theme);
  const layout = c.active_layout || 'split_hero';
  const isLight = theme.id === 'slate_pro';
  const isReversed = layout === 'reversed_hero';
  const isCentered = layout === 'centered_hero';

  const seo = c.seo || defaultContent.seo;

  return (
    <div style={{ fontFamily: "'Inter','Outfit',system-ui,sans-serif", background: theme.bg_primary, minHeight: '100vh', color: theme.text_primary, overflowX: 'hidden' }}>

      {/* SEO Meta */}
      {seo.site_title && <title>{seo.site_title}</title>}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes floatPt{0%,100%{transform:translateY(0) scale(1);opacity:0.4;}50%{transform:translateY(-28px) translateX(8px) scale(1.2);opacity:0.9;}}
        @keyframes heroFloat{0%,100%{transform:translateY(0) rotate(0);}50%{transform:translateY(-16px) rotate(1deg);}}
        @keyframes gradshift{0%,100%{background-position:0% 50%;}50%{background-position:100% 50%;}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 ${theme.glow_primary};}50%{box-shadow:0 0 0 10px transparent;}}
        @keyframes shimmer{0%{transform:translateX(-100%);}100%{transform:translateX(100%);}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
        @keyframes slideLeft{from{opacity:0;transform:translateX(-40px);}to{opacity:1;transform:translateX(0);}}
        @keyframes slideRight{from{opacity:0;transform:translateX(40px);}to{opacity:1;transform:translateX(0);}}
        @keyframes slideUp{from{opacity:0;transform:translateY(32px);}to{opacity:1;transform:translateY(0);}}
        @keyframes borderPulse{0%,100%{border-color:${theme.border_accent};}50%{border-color:${theme.accent};}}

        .rl-card{background:${theme.bg_card};border:1px solid ${theme.border};border-radius:18px;transition:all 0.3s cubic-bezier(.4,0,.2,1);}
        .rl-card:hover{background:${theme.bg_card_hover};border-color:${theme.border_accent};transform:translateY(-6px);box-shadow:0 20px 48px rgba(0,0,0,0.35),0 0 20px ${theme.glow_primary};}
        .rl-btn-primary{background:${theme.gradient_btn};background-size:200% 200%;animation:gradshift 4s ease infinite;border:none;cursor:pointer;color:#fff;font-weight:800;transition:all 0.2s;box-shadow:0 0 24px ${theme.glow_primary};}
        .rl-btn-primary:hover{transform:translateY(-3px) scale(1.03);box-shadow:0 8px 40px ${theme.glow_primary};}
        .rl-btn-secondary{border:1px solid ${theme.border};color:${theme.text_secondary};background:transparent;cursor:pointer;font-weight:700;transition:all 0.2s;}
        .rl-btn-secondary:hover{border-color:${theme.accent};color:${theme.accent};background:${theme.glow_primary};}
        .rl-nav-link{color:${theme.text_secondary};text-decoration:none;font-weight:500;font-size:.85rem;transition:color 0.15s;}
        .rl-nav-link:hover{color:${theme.accent};}
        .rl-badge{background:${theme.step_icon_bg};border:1px solid ${theme.border_accent};animation:borderPulse 3s infinite;}
        .rl-progress{background:linear-gradient(90deg,${theme.accent},${theme.accent2});border-radius:999px;}
        .reveal{opacity:0;transform:translateY(28px);transition:opacity 0.7s ease,transform 0.7s ease;}
        .reveal.in{opacity:1;transform:translateY(0);}
        .reveal-l{opacity:0;transform:translateX(-36px);transition:opacity 0.7s ease,transform 0.7s ease;}
        .reveal-l.in{opacity:1;transform:translateX(0);}
        .reveal-r{opacity:0;transform:translateX(36px);transition:opacity 0.7s ease,transform 0.7s ease;}
        .reveal-r.in{opacity:1;transform:translateX(0);}
        .stag>*:nth-child(1){transition-delay:.05s}.stag>*:nth-child(2){transition-delay:.15s}.stag>*:nth-child(3){transition-delay:.25s}.stag>*:nth-child(4){transition-delay:.35s}.stag>*:nth-child(5){transition-delay:.45s}.stag>*:nth-child(6){transition-delay:.55s}.stag>*:nth-child(7){transition-delay:.65s}.stag>*:nth-child(8){transition-delay:.75s}
        .glow-sep{height:1px;background:linear-gradient(90deg,transparent,${theme.accent}55,${theme.accent2}44,transparent);}
        .rl-img-wrap{animation:heroFloat 8s ease-in-out infinite;}
        .rl-img-wrap-rev{animation:heroFloat 10s ease-in-out infinite reverse;}
        /* ── Hero title gradient text fix — use CSS class not inline to avoid React shorthand conflict ── */
        .rl-hero-title{
          font-size:clamp(2.4rem,5vw,4.8rem);font-weight:900;line-height:1.08;
          background-image:${theme.gradient_hero};background-size:200% 200%;
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;
          background-clip:text;color:transparent;
          animation:gradshift 6s ease infinite;
          margin-bottom:24px;letter-spacing:-0.04em;font-family:'Outfit',sans-serif;
        }
        @media(max-width:900px){.hero-cols{flex-direction:column!important;}.feat-grid{grid-template-columns:1fr 1fr!important;}.step-grid{grid-template-columns:1fr 1fr!important;}.why-grid-inner{grid-template-columns:1fr!important;}}
        @media(max-width:540px){.feat-grid{grid-template-columns:1fr!important;}.step-grid{grid-template-columns:1fr!important;}.test-grid{grid-template-columns:1fr!important;}}
      `}</style>

      {/* ── NAVBAR ──────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        background: navSolid ? theme.navbar_blur : 'rgba(0,0,0,0)',
        backdropFilter: navSolid ? 'blur(20px)' : 'none',
        borderBottom: navSolid ? `1px solid ${theme.border_accent}` : '1px solid transparent',
        padding: '0 clamp(16px,5vw,56px)', height: 68,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: 'all 0.3s ease',
        boxShadow: navSolid ? `0 4px 32px rgba(0,0,0,0.3), 0 0 20px ${theme.glow_primary}` : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: theme.gradient_cta,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, boxShadow: `0 0 20px ${theme.glow_primary}`, animation: 'pulse 3s infinite',
          }}>{c.logo_emoji}</div>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.05rem', letterSpacing: '-0.03em', color: theme.text_primary, fontFamily: "'Outfit',sans-serif" }}>{c.app_name}</div>
            <div style={{ fontSize: '0.58rem', color: theme.text_muted, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.12em' }}>CRM PLATFORM</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }} className="rl-desktop-nav">
          {[['#features','Features'],['#process','How It Works'],['#why','Why Us'],['#reviews','Reviews'],['#contact','Contact']].map(([h,l]) => (
            <a key={h} href={h} className="rl-nav-link">{l}</a>
          ))}
          {c.show_client_portal && (
            <Link to="/client-portal" style={{ fontSize: '0.82rem', padding: '7px 16px', borderRadius: 8, border: `1px solid ${theme.border}`, color: theme.text_secondary, textDecoration: 'none', fontWeight: 600, transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = theme.accent; e.currentTarget.style.color = theme.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.color = theme.text_secondary; }}>
              📋 Track Case
            </Link>
          )}
          <button onClick={() => navigate('/login')} className="rl-btn-primary" style={{ padding: '9px 22px', borderRadius: 10, fontSize: '0.87rem' }}>Sign In →</button>
        </div>

        <button onClick={() => setMenuOpen(!menuOpen)} style={{ display: 'none', background: 'none', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 12px', color: theme.text_secondary, cursor: 'pointer', fontSize: '1.1rem' }}>☰</button>
      </nav>

      {menuOpen && (
        <div style={{ position: 'fixed', top: 68, left: 0, right: 0, zIndex: 999, background: theme.bg_secondary, backdropFilter: 'blur(20px)', padding: '20px 24px', borderBottom: `1px solid ${theme.border_accent}`, animation: 'fadeIn 0.2s ease' }}>
          {[['#features','Features'],['#process','How It Works'],['#why','Why Us'],['#reviews','Reviews'],['#contact','Contact']].map(([h,l]) => (
            <a key={h} href={h} onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '12px 0', color: theme.text_secondary, textDecoration: 'none', fontSize: '0.95rem', borderBottom: `1px solid ${theme.border}` }}>{l}</a>
          ))}
          <button onClick={() => navigate('/login')} className="rl-btn-primary" style={{ width: '100%', padding: 12, borderRadius: 10, fontSize: '0.95rem', marginTop: 16 }}>Sign In →</button>
        </div>
      )}

      {/* ── HERO ────────────────────────────────────────────────────── */}
      <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '100px clamp(16px,5vw,72px) 60px', position: 'relative', overflow: 'hidden' }}>
        <Particles theme={theme} />
        <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 900, height: 700, background: `radial-gradient(ellipse, ${theme.glow_primary} 0%, transparent 65%)`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '-5%', width: 500, height: 500, background: `radial-gradient(ellipse, ${theme.glow_secondary} 0%, transparent 65%)`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${theme.border_accent}22 1px, transparent 1px), linear-gradient(90deg, ${theme.border_accent}22 1px, transparent 1px)`, backgroundSize: '48px 48px', pointerEvents: 'none' }} />

        <div ref={heroRef} className="hero-cols" style={{
          display: 'flex', gap: 56, alignItems: 'center',
          flexDirection: isCentered ? 'column' : isReversed ? 'row-reverse' : 'row',
          maxWidth: 1320, margin: '0 auto', width: '100%', zIndex: 1, position: 'relative',
          textAlign: isCentered ? 'center' : 'left',
        }}>
          {/* Copy */}
          <div style={{ flex: '1 1 500px', animation: heroVisible ? (isCentered ? 'slideUp 0.9s ease both' : isReversed ? 'slideRight 0.9s ease both' : 'slideLeft 0.9s ease both') : 'none' }}>
            {/* Badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 18px', borderRadius: 999, marginBottom: 28 }} className="rl-badge">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: theme.accent, display: 'inline-block', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: '0.78rem', color: theme.badge_text_color, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.05em' }}>{c.hero_badge || c.app_tagline}</span>
            </div>

            <h1 className="rl-hero-title">{c.hero_title}</h1>

            <p style={{ fontSize: 'clamp(0.95rem,1.5vw,1.18rem)', color: theme.text_secondary, lineHeight: 1.78, marginBottom: 40, maxWidth: isCentered ? 560 : 520, margin: isCentered ? '0 auto 40px' : '0 0 40px' }}>{c.hero_subtitle}</p>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: isCentered ? 'center' : 'flex-start', marginBottom: 52 }}>
              <button onClick={() => navigate('/login')} className="rl-btn-primary" style={{ padding: '14px 36px', borderRadius: 12, fontSize: '1.05rem' }}>
                {c.cta_primary || '🚀 Launch Platform'}
              </button>
              {c.show_client_portal && (
                <Link to="/client-portal" className="rl-btn-secondary" style={{ padding: '14px 36px', borderRadius: 12, fontSize: '1.05rem', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                  {c.cta_secondary || '📋 Track My Case'}
                </Link>
              )}
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap', justifyContent: isCentered ? 'center' : 'flex-start' }}>
              {(c.stats || defaultContent.stats).map((s, i) => (
                <div key={i} style={{ textAlign: isCentered ? 'center' : 'left' }}>
                  <div style={{ fontSize: '2.2rem', fontWeight: 900, color: theme.stat_color, fontFamily: "'Outfit',sans-serif", lineHeight: 1 }}>
                    <AnimatedCount target={s.value} suffix={s.suffix} />
                  </div>
                  <div style={{ fontSize: '0.68rem', color: theme.text_muted, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 5 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero image (not shown in centered layout full-width below) */}
          {!isCentered && (
            <div style={{ flex: '1 1 460px', position: 'relative', animation: heroVisible ? (isReversed ? 'slideLeft 0.9s ease both' : 'slideRight 0.9s ease both') : 'none' }}>
              <div className="rl-img-wrap" style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', inset: -40, background: `radial-gradient(ellipse, ${theme.glow_primary} 0%, transparent 70%)`, borderRadius: 32, pointerEvents: 'none' }} />
                <img src={theme.hero_image} alt={`${c.app_name} Dashboard`}
                  style={{ width: '100%', maxWidth: 560, borderRadius: 24, border: `1px solid ${theme.border_accent}`, boxShadow: `0 32px 80px rgba(0,0,0,0.5), 0 0 40px ${theme.glow_primary}`, display: 'block' }}
                  onError={e => { e.target.style.display = 'none'; }} />
                {/* Floating notification badges */}
                <div style={{ position: 'absolute', top: 20, right: -18, background: `rgba(16,185,129,0.15)`, border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, padding: '10px 16px', backdropFilter: 'blur(10px)', animation: 'heroFloat 5s ease-in-out infinite' }}>
                  <div style={{ fontSize: '0.62rem', color: '#10b981', fontFamily: 'monospace', fontWeight: 700 }}>✓ CASE RECOVERED</div>
                  <div style={{ fontSize: '0.75rem', color: theme.text_primary, fontWeight: 700, marginTop: 2 }}>DR-2025-00847</div>
                </div>
                <div style={{ position: 'absolute', bottom: 24, left: -20, background: `${theme.step_icon_bg}`, border: `1px solid ${theme.border_accent}`, borderRadius: 12, padding: '10px 16px', backdropFilter: 'blur(10px)', animation: 'heroFloat 8s ease-in-out infinite reverse' }}>
                  <div style={{ fontSize: '0.62rem', color: theme.accent, fontFamily: 'monospace', fontWeight: 700 }}>NEW PAYMENT</div>
                  <div style={{ fontSize: '0.75rem', color: theme.text_primary, fontWeight: 700, marginTop: 2 }}>₹ 22,500 received</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Centered hero image */}
        {isCentered && (
          <div style={{ maxWidth: 900, margin: '60px auto 0', width: '100%', position: 'relative', zIndex: 1, animation: heroVisible ? 'slideUp 1.1s ease 0.3s both' : 'none' }}>
            <div className="rl-img-wrap" style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', inset: -30, background: `radial-gradient(ellipse, ${theme.glow_primary} 0%, transparent 70%)`, borderRadius: 32, pointerEvents: 'none' }} />
              <img src={theme.hero_image} alt={`${c.app_name} Dashboard`}
                style={{ width: '100%', borderRadius: 24, border: `1px solid ${theme.border_accent}`, boxShadow: `0 32px 80px rgba(0,0,0,0.5), 0 0 48px ${theme.glow_primary}`, display: 'block' }}
                onError={e => { e.target.style.display = 'none'; }} />
            </div>
          </div>
        )}
      </section>

      <div className="glow-sep" />

      {/* ── HOW IT WORKS ────────────────────────────────────────────── */}
      <section id="process" style={{ padding: 'clamp(60px,8vw,100px) clamp(16px,5vw,72px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div ref={howRef} style={{ textAlign: 'center', marginBottom: 56, animation: howVisible ? 'slideUp 0.7s ease both' : 'none' }}>
            <div style={{ fontSize: '0.7rem', color: theme.accent, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 12, fontFamily: 'monospace' }}>THE PROCESS</div>
            <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 900, color: theme.text_primary, fontFamily: "'Outfit',sans-serif", marginBottom: 14 }}>From Intake to Invoice in 4 Steps</h2>
            <p style={{ color: theme.text_secondary, fontSize: '1rem', maxWidth: 480, margin: '0 auto' }}>A clear, trackable workflow keeps your team aligned and clients informed.</p>
          </div>
          <div className="step-grid stag" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18 }}>
            {(c.how_it_works || defaultContent.how_it_works).map((st, i) => (
              <div key={i} className={`rl-card reveal stag ${howVisible ? 'in' : ''}`} style={{ padding: '28px 22px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 12, right: 14, fontSize: '3.5rem', fontWeight: 900, color: `${theme.accent}08`, fontFamily: "'Outfit',sans-serif", lineHeight: 1 }}>{st.step}</div>
                <div style={{ width: 50, height: 50, borderRadius: 13, background: theme.step_icon_bg, border: `1px solid ${theme.step_icon_border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', marginBottom: 18 }}>{st.icon}</div>
                <div style={{ fontSize: '0.65rem', color: theme.accent, fontFamily: 'monospace', fontWeight: 700, marginBottom: 7, letterSpacing: '0.1em' }}>STEP {st.step}</div>
                <h3 style={{ fontSize: '0.97rem', fontWeight: 800, color: theme.text_primary, marginBottom: 10, fontFamily: "'Outfit',sans-serif" }}>{st.title}</h3>
                <p style={{ fontSize: '0.8rem', color: theme.text_secondary, lineHeight: 1.72 }}>{st.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="glow-sep" />

      {/* ── ANALYTICS SPLIT ─────────────────────────────────────────── */}
      <section style={{ padding: 'clamp(60px,8vw,100px) clamp(16px,5vw,72px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', gap: 56, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="rl-img-wrap-rev" style={{ flex: '1 1 420px', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: -24, background: `radial-gradient(ellipse, ${theme.glow_secondary} 0%, transparent 70%)`, borderRadius: 24 }} />
            <img src="/analytics-preview.png" alt="Analytics Dashboard"
              style={{ width: '100%', borderRadius: 20, border: `1px solid ${theme.border_accent}`, boxShadow: `0 24px 60px rgba(0,0,0,0.4), 0 0 32px ${theme.glow_secondary}`, display: 'block' }}
              onError={e => { e.target.style.display = 'none'; }} />
          </div>
          <div style={{ flex: '1 1 380px' }}>
            <div style={{ fontSize: '0.7rem', color: theme.accent2, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 12, fontFamily: 'monospace' }}>ANALYTICS & INSIGHTS</div>
            <h2 style={{ fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', fontWeight: 900, color: theme.text_primary, marginBottom: 18, fontFamily: "'Outfit',sans-serif" }}>See every metric that matters</h2>
            <p style={{ color: theme.text_secondary, lineHeight: 1.8, marginBottom: 30, fontSize: '0.93rem' }}>Track engineer performance, case volume trends, revenue per month, recovery success rates — all in real-time dashboards with export-ready reports.</p>
            {[{ label: 'Case Recovery Rate', val: 94, c: theme.accent }, { label: 'On-Time Delivery', val: 87, c: theme.accent2 }, { label: 'Client Satisfaction', val: 96, c: theme.accent3 }].map(b => (
              <div key={b.label} style={{ marginBottom: 15 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.82rem', color: theme.text_secondary }}>{b.label}</span>
                  <span style={{ fontSize: '0.82rem', color: b.c, fontWeight: 700 }}>{b.val}%</span>
                </div>
                <div style={{ height: 6, background: theme.border, borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${b.val}%`, background: `linear-gradient(90deg,${b.c},${b.c}88)`, borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ───────────────────────────────────────────── */}
      <section id="features" style={{ padding: 'clamp(60px,8vw,100px) clamp(16px,5vw,72px)', background: `${theme.glow_primary}30` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div ref={featRef} style={{ textAlign: 'center', marginBottom: 56, animation: featVisible ? 'slideUp 0.7s ease both' : 'none' }}>
            <div style={{ fontSize: '0.7rem', color: theme.accent, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 12, fontFamily: 'monospace' }}>EVERYTHING YOU NEED</div>
            <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 900, color: theme.text_primary, fontFamily: "'Outfit',sans-serif", marginBottom: 14 }}>Built for Data Recovery Professionals</h2>
            <p style={{ color: theme.text_secondary, maxWidth: 500, margin: '0 auto', fontSize: '1rem' }}>One platform to manage your entire data recovery operation.</p>
          </div>
          <div className="feat-grid stag" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
            {(c.features || defaultContent.features).map((f, i) => (
              <div key={i} className={`rl-card reveal stag ${featVisible ? 'in' : ''}`} style={{ padding: '26px 20px' }}>
                <div style={{ fontSize: '2rem', marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: theme.text_primary, marginBottom: 10, fontFamily: "'Outfit',sans-serif" }}>{f.title}</h3>
                <p style={{ fontSize: '0.79rem', color: theme.text_secondary, lineHeight: 1.72 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="glow-sep" />

      {/* ── WHY RECOVERLAB ──────────────────────────────────────────── */}
      <section id="why" style={{ padding: 'clamp(60px,8vw,100px) clamp(16px,5vw,72px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', gap: 56, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div ref={whyRef} style={{ flex: '0 0 320px', animation: whyVisible ? 'slideLeft 0.7s ease both' : 'none' }}>
            <div style={{ fontSize: '0.7rem', color: theme.accent, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 14, fontFamily: 'monospace' }}>WHY RECOVERLAB</div>
            <h2 style={{ fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', fontWeight: 900, color: theme.text_primary, marginBottom: 18, fontFamily: "'Outfit',sans-serif" }}>The only CRM built for data recovery</h2>
            <p style={{ color: theme.text_secondary, lineHeight: 1.8, marginBottom: 28, fontSize: '0.9rem' }}>Most CRMs are generic. RecoverLab is designed from the ground up for the unique workflow of data recovery labs — from donor matching to clean room documentation.</p>
            <button onClick={() => navigate('/login')} className="rl-btn-primary" style={{ padding: '12px 28px', borderRadius: 10, fontSize: '0.9rem' }}>Get Started →</button>
            <div style={{ marginTop: 28 }}>
              <img src="/data-recovery-process.png" alt="Recovery Lab" style={{ width: '100%', borderRadius: 16, border: `1px solid ${theme.border_accent}`, boxShadow: `0 16px 40px rgba(0,0,0,0.4)` }} onError={e => e.target.style.display = 'none'} />
            </div>
          </div>
          <div className="why-grid-inner stag" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {(c.why_us || defaultContent.why_us).map((w, i) => (
              <div key={i} className={`rl-card reveal ${whyVisible ? 'in' : ''}`} style={{ padding: '20px 18px', transitionDelay: `${i * 0.08}s` }}>
                <div style={{ fontSize: '1.7rem', marginBottom: 10 }}>{w.icon}</div>
                <h3 style={{ fontSize: '0.88rem', fontWeight: 800, color: theme.text_primary, marginBottom: 7, fontFamily: "'Outfit',sans-serif" }}>{w.title}</h3>
                <p style={{ fontSize: '0.76rem', color: theme.text_secondary, lineHeight: 1.7 }}>{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="glow-sep" />

      {/* ── TESTIMONIALS ─────────────────────────────────────────────── */}
      <section id="reviews" style={{ padding: 'clamp(60px,8vw,100px) clamp(16px,5vw,72px)', background: `${theme.glow_primary}20` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div ref={testRef} style={{ textAlign: 'center', marginBottom: 52, animation: testVisible ? 'slideUp 0.7s ease both' : 'none' }}>
            <div style={{ fontSize: '0.7rem', color: theme.accent, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, marginBottom: 12, fontFamily: 'monospace' }}>TESTIMONIALS</div>
            <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)', fontWeight: 900, color: theme.text_primary, fontFamily: "'Outfit',sans-serif" }}>Trusted by Recovery Labs Across India</h2>
          </div>
          <div className="test-grid stag" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
            {(c.testimonials || defaultContent.testimonials).map((t, i) => (
              <div key={i} className={`rl-card reveal ${testVisible ? 'in' : ''}`} style={{ padding: '26px 22px', transitionDelay: `${i * 0.12}s` }}>
                <div style={{ fontSize: '2.4rem', color: theme.accent, opacity: 0.25, fontFamily: 'serif', lineHeight: 1, marginBottom: 10 }}>"</div>
                <p style={{ fontSize: '0.85rem', color: theme.text_secondary, lineHeight: 1.77, marginBottom: 22, fontStyle: 'italic' }}>{t.text}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: theme.gradient_cta, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: '#fff' }}>{t.avatar}</div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme.text_primary }}>{t.name}</div>
                    <div style={{ fontSize: '0.7rem', color: theme.text_muted, marginTop: 2 }}>{t.role}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', color: '#f59e0b', fontSize: '0.78rem' }}>★★★★★</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <section style={{ padding: 'clamp(60px,8vw,100px) clamp(16px,5vw,72px)', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${theme.glow_primary} 0%, ${theme.glow_secondary} 40%, transparent 70%)`, pointerEvents: 'none' }} />
        <div ref={ctaRef} style={{ maxWidth: 640, margin: '0 auto', position: 'relative', zIndex: 1, animation: ctaVisible ? 'slideUp 0.8s ease both' : 'none' }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: theme.gradient_cta, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.2rem', margin: '0 auto 24px', boxShadow: `0 0 48px ${theme.glow_primary}`, animation: 'heroFloat 6s ease-in-out infinite' }}>{c.logo_emoji}</div>
          <h2 style={{ fontSize: 'clamp(2rem,5vw,3rem)', fontWeight: 900, color: theme.text_primary, marginBottom: 14, fontFamily: "'Outfit',sans-serif" }}>Ready to streamline your lab?</h2>
          <p style={{ color: theme.text_secondary, marginBottom: 36, fontSize: '1rem', lineHeight: 1.7 }}>Join hundreds of data recovery labs using RecoverLab CRM to manage cases, clients, and billing from one beautiful platform.</p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/login')} className="rl-btn-primary" style={{ padding: '15px 40px', borderRadius: 12, fontSize: '1.05rem' }}>→ Get Started Now</button>
            {c.show_client_portal && <Link to="/client-portal" className="rl-btn-secondary" style={{ padding: '15px 40px', borderRadius: 12, textDecoration: 'none', fontSize: '1.05rem', display: 'flex', alignItems: 'center' }}>📋 Track My Case</Link>}
          </div>
        </div>
      </section>

      <div className="glow-sep" />

      {/* ── CONTACT ─────────────────────────────────────────────────── */}
      <section id="contact" style={{ padding: 'clamp(40px,6vw,72px) clamp(16px,5vw,72px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 40, background: theme.bg_card, border: `1px solid ${theme.border}`, borderRadius: 24, padding: 'clamp(24px,4vw,44px)', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: theme.gradient_cta, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{c.logo_emoji}</div>
                <span style={{ fontSize: '1.05rem', fontWeight: 900, color: theme.text_primary, fontFamily: "'Outfit',sans-serif" }}>{c.app_name}</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: theme.text_secondary, maxWidth: 280 }}>{c.app_tagline}</div>
            </div>
            <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap' }}>
              {[{ l: 'PHONE', v: c.contact_phone, icon: '📞' }, { l: 'EMAIL', v: c.contact_email, icon: '📧' }, { l: 'LOCATION', v: c.contact_address, icon: '📍' }].map(item => (
                <div key={item.l}>
                  <div style={{ fontSize: '0.6rem', color: theme.text_muted, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4, fontFamily: 'monospace', fontWeight: 700 }}>{item.l}</div>
                  <div style={{ fontSize: '0.84rem', color: theme.text_secondary }}>{item.icon} {item.v}</div>
                </div>
              ))}
            </div>
            <button onClick={() => navigate('/login')} className="rl-btn-primary" style={{ padding: '11px 26px', borderRadius: 10, fontSize: '0.88rem' }}>Sign In →</button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <footer style={{ padding: `22px clamp(16px,5vw,72px)`, borderTop: `1px solid ${theme.border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: '0.75rem', color: theme.text_muted }}>{c.footer_text}</span>
          <div style={{ display: 'flex', gap: 20 }}>
            <button onClick={() => navigate('/login')} style={{ fontSize: '0.75rem', color: theme.text_muted, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }} onMouseEnter={e => e.target.style.color = theme.accent} onMouseLeave={e => e.target.style.color = theme.text_muted}>Admin Login</button>
            {c.show_client_portal && <Link to="/client-portal" style={{ fontSize: '0.75rem', color: theme.text_muted, textDecoration: 'none' }}>Client Portal</Link>}
          </div>
        </div>
      </footer>
    </div>
  );
}
