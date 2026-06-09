/**
 * Platform Settings Service
 * Handles all API calls for super admin platform settings (Razorpay, SEO, Homepage, Invoices, 2FA)
 * These are persisted to the backend database, not localStorage.
 */

const BASE_URL = '/api/super-admin';

const getToken = () => localStorage.getItem('accessToken');

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getToken()}`,
};

const api = {
  // ──────────────────────────────────────────────────────────────
  // RAZORPAY SETTINGS
  // ──────────────────────────────────────────────────────────────
  
  async getRazorpaySettings() {
    const res = await fetch(`${BASE_URL}/razorpay-settings`, { headers });
    if (!res.ok) throw new Error(`Failed to load Razorpay settings: ${res.statusText}`);
    return res.json();
  },

  async updateRazorpaySettings(settings) {
    const res = await fetch(`${BASE_URL}/razorpay-settings`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error(`Failed to save Razorpay settings: ${res.statusText}`);
    return res.json();
  },

  // ──────────────────────────────────────────────────────────────
  // INVOICE SETTINGS
  // ──────────────────────────────────────────────────────────────
  
  async getInvoiceSettings() {
    const res = await fetch(`${BASE_URL}/invoice-settings`, { headers });
    if (!res.ok) throw new Error(`Failed to load invoice settings: ${res.statusText}`);
    return res.json();
  },

  async updateInvoiceSettings(settings) {
    const res = await fetch(`${BASE_URL}/invoice-settings`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error(`Failed to save invoice settings: ${res.statusText}`);
    return res.json();
  },

  // ──────────────────────────────────────────────────────────────
  // SEO SETTINGS
  // ──────────────────────────────────────────────────────────────
  
  async getSeoSettings() {
    const res = await fetch(`${BASE_URL}/seo-settings`, { headers });
    if (!res.ok) throw new Error(`Failed to load SEO settings: ${res.statusText}`);
    return res.json();
  },

  async updateSeoSettings(settings) {
    const res = await fetch(`${BASE_URL}/seo-settings`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error(`Failed to save SEO settings: ${res.statusText}`);
    return res.json();
  },

  // ──────────────────────────────────────────────────────────────
  // HOMEPAGE CMS SETTINGS
  // ──────────────────────────────────────────────────────────────
  
  async getHomepageSettings() {
    const res = await fetch(`${BASE_URL}/homepage-settings`, { headers });
    if (!res.ok) throw new Error(`Failed to load homepage settings: ${res.statusText}`);
    return res.json();
  },

  async updateHomepageSettings(settings) {
    const res = await fetch(`${BASE_URL}/homepage-settings`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error(`Failed to save homepage settings: ${res.statusText}`);
    return res.json();
  },

  // ──────────────────────────────────────────────────────────────
  // 2FA SETTINGS
  // ──────────────────────────────────────────────────────────────
  
  async get2FAStatus() {
    const res = await fetch(`${BASE_URL}/2fa/status`, { headers });
    if (!res.ok) throw new Error(`Failed to load 2FA status: ${res.statusText}`);
    return res.json();
  },

  async setup2FA() {
    const res = await fetch(`${BASE_URL}/2fa/setup`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) throw new Error(`Failed to setup 2FA: ${res.statusText}`);
    return res.json();
  },

  async verify2FA(token) {
    const res = await fetch(`${BASE_URL}/2fa/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ token }),
    });
    if (!res.ok) throw new Error(`Failed to verify 2FA: ${res.statusText}`);
    return res.json();
  },

  async disable2FA() {
    const res = await fetch(`${BASE_URL}/2fa/disable`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error(`Failed to disable 2FA: ${res.statusText}`);
    return res.json();
  },

  async get2FAEnforcementStatus() {
    const res = await fetch(`${BASE_URL}/2fa/enforcement-status`, { headers });
    if (!res.ok) throw new Error(`Failed to load 2FA enforcement status: ${res.statusText}`);
    return res.json();
  },

  async set2FAEnforcement(enforced) {
    const res = await fetch(`${BASE_URL}/2fa/enforce`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ enforced }),
    });
    if (!res.ok) throw new Error(`Failed to set 2FA enforcement: ${res.statusText}`);
    return res.json();
  },

  // ──────────────────────────────────────────────────────────────
  // PLATFORM UPTIME STATS
  // ──────────────────────────────────────────────────────────────
  
  async getPlatformUptime() {
    const res = await fetch(`${BASE_URL}/super-admin/platform-uptime`, { headers });
    if (!res.ok) throw new Error(`Failed to load uptime stats: ${res.statusText}`);
    return res.json();
  },
};

export default api;
