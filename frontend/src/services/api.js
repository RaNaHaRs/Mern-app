const BASE_URL = '/api';

function getToken() {
  return localStorage.getItem('accessToken');
}

async function parseJsonResponse(res) {
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Try to refresh
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshRes.ok) {
        const refreshData = await parseJsonResponse(refreshRes);
        const accessToken = refreshData?.accessToken;
        if (accessToken) {
          localStorage.setItem('accessToken', accessToken);
          // Retry
          headers.Authorization = `Bearer ${accessToken}`;
          const retryRes = await fetch(`${BASE_URL}${path}`, { ...options, headers });
          if (!retryRes.ok) {
            const err = await parseJsonResponse(retryRes);
            throw Object.assign(new Error(err?.error || 'Request failed'), { status: retryRes.status, data: err });
          }
          if (retryRes.status === 204) return null;
          return parseJsonResponse(retryRes);
        }
      }
    }
    localStorage.clear();
    window.location.href = '/login';
    return;
  }

  if (!res.ok) {
    const err = await parseJsonResponse(res);
    throw Object.assign(new Error(err?.error || err?.message || 'Request failed'), { status: res.status, data: err });
  }

  if (res.status === 204) return null;
  return parseJsonResponse(res);
}

export const api = {
  get: (path, params) => {
    const url = params ? `${path}?${new URLSearchParams(params)}` : path;
    return request(url, { method: 'GET' });
  },
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),

  upload: async (path, formData) => {
    const token = getToken();
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.error || 'Upload failed'), { status: res.status });
    }
    return res.json();
  },

  uploadPut: async (path, formData) => {
    const token = getToken();
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PUT',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.error || 'Upload failed'), { status: res.status });
    }
    return res.json();
  },
};

// Auth
export const authApi = {
  login: (creds) => api.post('/auth/login', creds),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/change-password', data),
};

export const chatApi = {
  getContacts: () => api.get('/chat/contacts'),
  getConversation: (peerId) => api.get(`/chat/conversations/${peerId}`),
  sendMessage: (peerId, body) => api.post(`/chat/conversations/${peerId}/messages`, body),
  markRead: (peerId) => api.patch(`/chat/conversations/${peerId}/read`),
};

// Cases
export const casesApi = {
  list: (params) => api.get('/cases', params),
  get: (id) => api.get(`/cases/${id}`),
  create: (data) => api.post('/cases', data),
  update: (id, data) => api.put(`/cases/${id}`, data),
  delete: (id) => api.delete(`/cases/${id}`),
  transition: (id, data) => api.patch(`/cases/${id}/stage`, data),
  smartAssist: (id) => api.get(`/cases/${id}/smart-assist`),
  donors: (id) => api.get(`/cases/${id}/donors`),
  collectPayment: (id) => api.post(`/cases/${id}/collect-payment`, {}),
  // Solution
  getSolution: (id) => api.get(`/cases/${id}/solution`),
  saveSolutionNote: (id, textNote) => api.put(`/cases/${id}/solution`, { textNote }),
  uploadSolutionMedia: (id, formData) => api.upload(`/cases/${id}/solution/media`, formData),
  deleteSolutionMedia: (id, fileId) => api.delete(`/cases/${id}/solution/media/${fileId}`),
  // Device images
  getImages: (id) => api.get(`/cases/${id}/images`),
  uploadImages: (id, formData) => api.upload(`/cases/${id}/images`, formData),
  deleteImage: (id, imgId) => api.delete(`/cases/${id}/images/${imgId}`),
  transferToClient: (id, transfer_to_client) => api.patch(`/cases/${id}/transfer-to-client`, { transfer_to_client }),
};

export const solutionsApi = {
  list: (params) => api.get('/solutions', params),
  get: (id) => api.get(`/solutions/${id}`),
  create: (formData) => api.upload('/solutions', formData),
  update: (id, formData) => api.uploadPut(`/solutions/${id}`, formData),
  delete: (id) => api.delete(`/solutions/${id}`),
};

export const mediaRecycleApi = {
  list: (params) => api.get('/media-recycle-bin', params),
  restore: (id) => api.post(`/media-recycle-bin/${id}/restore`),
  permanentDelete: (id) => api.delete(`/media-recycle-bin/${id}/permanent-delete`),
};

export const suggestionsApi = {
  searchProblems: (params) => api.get('/suggestions/problems', params),
  searchDiagnosis: (params) => api.get('/suggestions/diagnosis', params),
  saveProblem: (data) => api.post('/suggestions/problems', data),
  saveDiagnosis: (data) => api.post('/suggestions/diagnosis', data),
};

// Clients
export const clientsApi = {
  list: (params) => api.get('/clients', params),
  get: (id) => api.get(`/clients/${id}`),
  create: (data) => api.post('/clients', data),
  update: (id, data) => api.put(`/clients/${id}`, data),
  addComm: (id, data) => api.post(`/clients/${id}/communications`, data),
  collectPending: (id) => api.post(`/clients/${id}/collect-pending`, {}),
};

// Storage Models
export const modelsApi = {
  list: (params) => api.get('/storage-models', params),
  get: (id) => api.get(`/storage-models/${id}`),
  create: (data) => api.post('/storage-models', data),
  update: (id, data) => api.put(`/storage-models/${id}`, data),
  brands: () => api.get('/storage-models/brands'),
  addFailure: (id, data) => api.post(`/storage-models/${id}/failure-entries`, data),
};

// Inventory
export const inventoryApi = {
  list: (params) => api.get('/inventory', params),
  get: (id) => api.get(`/inventory/${id}`),
  create: (data) => api.post('/inventory', data),
  update: (id, data) => api.put(`/inventory/${id}`, data),
  adjust: (id, data) => api.patch(`/inventory/${id}/quantity`, data),
  donors: () => api.get('/inventory/donors'),
  getNotes: (id) => api.get(`/inventory/${id}/notes`),
  addNote: (id, text) => api.post(`/inventory/${id}/notes`, { text }),
  getImages: (id) => api.get(`/inventory/${id}/images`),
  uploadImages: (id, formData) => api.upload(`/inventory/${id}/images`, formData),
  deleteImage: (id, imgId) => api.delete(`/inventory/${id}/images/${imgId}`),
  transfer: (id, notes) => api.post(`/inventory/${id}/transfer`, { notes }),
  transferToClient: (id, isTransferred) => api.patch(`/inventory/${id}/transfer-to-client`, { is_transferred_to_client: !!isTransferred }),
  bulkSoftDelete: (ids) => api.post('/inventory/bulk-delete', { ids }),
  listRecycleBin: (params) => api.get('/inventory/recycle-bin', params),
  restore: (id) => api.post(`/inventory/recycle-bin/${id}/restore`),
  permanentDelete: (id) => api.delete(`/inventory/recycle-bin/${id}/permanent-delete`),
  bulkPermanentDelete: (ids) => api.post('/inventory/bulk-permanent-delete', { ids }),
  revokeTransfer: (id) => api.post(`/inventory/${id}/revoke-transfer`),
};

export const transferredItemsApi = {
  list: (params) => api.get('/transferred-items', params),
  get: (id) => api.get(`/transferred-items/${id}`),
  create: (data) => api.post('/transferred-items', data),
  delete: (id) => api.delete(`/transferred-items/${id}`),
  revoke: (id) => api.post(`/transferred-items/${id}/revoke`),
};

// Payments
export const paymentsApi = {
  list: (case_id) => api.get(`/payments/case/${case_id}`),
  createQuotation: (data) => api.post('/payments/quotations', data),
  recordPayment: (data) => api.post('/payments', data),
  approveQuote: (id, approved) => api.patch(`/payments/quotations/${id}/approve`, { approved }),
};

// Analytics
export const analyticsApi = {
  dashboard: () => api.get('/analytics/dashboard'),
  failureTrends: (days) => api.get('/analytics/failure-trends', { days }),
  modelFailures: () => api.get('/analytics/model-failures'),
  revenueTrend: () => api.get('/analytics/revenue-trend'),
};

// Files
export const filesApi = {
  upload: (formData) => api.upload('/files/upload', formData),
  download: (id) => `${BASE_URL}/files/${id}/download`,
  delete: (id) => api.delete(`/files/${id}`),
};

// Users
export const usersApi = {
  list: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  auditLogs: (params) => api.get('/users/audit-logs', params),
};

// Accounting
export const accountingApi = {
  // Summary / P&L
  summary: () => api.get('/accounting/summary'),
  // Quotes
  listQuotes: (params) => api.get('/accounting/quotes', params),
  getQuote: (id) => api.get(`/accounting/quotes/${id}`),
  createQuote: (data) => api.post('/accounting/quotes', data),
  updateQuote: (id, data) => api.put(`/accounting/quotes/${id}`, data),
  updateQuoteStatus: (id, status) => api.patch(`/accounting/quotes/${id}/status`, { status }),
  deleteQuote: (id) => api.delete(`/accounting/quotes/${id}`),
  convertToInvoice: (id, data) => api.post(`/accounting/quotes/${id}/invoice`, data),
  // Invoices
  listInvoices: (params) => api.get('/accounting/invoices', params),
  getInvoice: (id) => api.get(`/accounting/invoices/${id}`),
  createInvoice: (data) => api.post('/accounting/invoices', data),
  updateInvoiceStatus: (id, status) => api.patch(`/accounting/invoices/${id}/status`, { status }),
  deleteInvoice: (id) => api.delete(`/accounting/invoices/${id}`),
  recordPayment: (id, data) => api.post(`/accounting/invoices/${id}/payments`, data),
  // Expenses
  listExpenses: (params) => api.get('/accounting/expenses', params),
  createExpense: (data) => api.post('/accounting/expenses', data),
  deleteExpense: (id) => api.delete(`/accounting/expenses/${id}`),
};
