// Frontend API Service for Field Configuration
// Handles communication with backend field configuration endpoints

import { authApi } from './api';

const BASE_URL = '/api';
const getToken = () => localStorage.getItem('accessToken');

export const fieldConfigApi = {
  // Get all field configurations
  getConfig: async () => {
    const res = await fetch(`${BASE_URL}/field-config`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch field config: ${res.statusText}`);
    return res.json();
  },

  // Get schema for brand name or legacy HDD type key
  getSchema: async (hddType) => {
    const encoded = encodeURIComponent(hddType);
    const res = await fetch(`${BASE_URL}/field-config/schema/${encoded}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch schema: ${res.statusText}`);
    return res.json();
  },

  getSchemaByBrand: async (brandName, querySuffix = '') => {
    const encoded = encodeURIComponent(brandName);
    const res = await fetch(`${BASE_URL}/field-config/schema/${encoded}${querySuffix}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch schema: ${res.statusText}`);
    return res.json();
  },

  // Update field status (mandatory/optional/hidden)
  updateFieldStatus: async (hddType, fieldKey, status) => {
    const res = await fetch(`${BASE_URL}/field-config/field`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hddType, fieldKey, status }),
    });
    if (!res.ok) throw new Error(`Failed to update field: ${res.statusText}`);
    return res.json();
  },

  // Add custom field
  addCustomField: async (hddType, fieldLabel, fieldType, isMandatory = false) => {
    const res = await fetch(`${BASE_URL}/field-config/custom`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hddType, fieldLabel, fieldType, isMandatory }),
    });
    if (!res.ok) throw new Error(`Failed to add custom field: ${res.statusText}`);
    return res.json();
  },

  // Delete custom field
  deleteCustomField: async (fieldId) => {
    const res = await fetch(`${BASE_URL}/field-config/custom/${fieldId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(`Failed to delete custom field: ${res.statusText}`);
    return res.json();
  },

  // Toggle section visibility
  toggleSection: async (sectionKey, isEnabled) => {
    const res = await fetch(`${BASE_URL}/field-config/section/${sectionKey}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isEnabled }),
    });
    if (!res.ok) throw new Error(`Failed to toggle section: ${res.statusText}`);
    return res.json();
  },

  // Sync local config to database (for migration purposes)
  syncFromLocalStorage: async () => {
    try {
      // Get localStorage config
      const config = JSON.parse(localStorage.getItem('crm_field_config') || '{}');
      const sections = JSON.parse(localStorage.getItem('crm_sections_config') || '{}');

      // Sync to database
      const promises = [];

      // Sync field statuses
      if (config.hdd_fields) {
        for (const [hddType, fields] of Object.entries(config.hdd_fields)) {
          for (const [fieldKey, status] of Object.entries(fields)) {
            promises.push(fieldConfigApi.updateFieldStatus(hddType, fieldKey, status));
          }
        }
      }

      // Sync custom fields
      if (config.custom_fields) {
        for (const [hddType, customFields] of Object.entries(config.custom_fields)) {
          for (const field of customFields) {
            promises.push(
              fieldConfigApi.addCustomField(hddType, field.label, 'text', false)
            );
          }
        }
      }

      // Sync sections
      for (const [sectionKey, isEnabled] of Object.entries(sections)) {
        promises.push(fieldConfigApi.toggleSection(sectionKey, isEnabled));
      }

      await Promise.all(promises);
      return { success: true, synced: promises.length };
    } catch (error) {
      console.error('Sync failed:', error);
      return { success: false, error: error.message };
    }
  },

  // Load config from database into localStorage for offline access
  loadToLocalStorage: async () => {
    try {
      const config = await fieldConfigApi.getConfig();
      const normalized = {
        hdd_fields: config.hdd_fields || config.hddFields || {},
        custom_fields: config.custom_fields || config.customFields || {},
        sections: config.sections || {},
      };
      localStorage.setItem('crm_field_config', JSON.stringify(normalized));
      return normalized;
    } catch (error) {
      console.error('Failed to load config:', error);
      return JSON.parse(localStorage.getItem('crm_field_config') || '{}');
    }
  },

  getHddFields: async () => {
    const res = await fetch(`${BASE_URL}/field-config/hdd-fields`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch HDD fields: ${res.statusText}`);
    return res.json();
  },

  addHddField: async (fieldLabel, fieldType = 'text') => {
    const res = await fetch(`${BASE_URL}/field-config/hdd-fields`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldLabel, fieldType }),
    });
    if (!res.ok) throw new Error(`Failed to add HDD field: ${res.statusText}`);
    return res.json();
  },

  updateHddField: async (fieldKey, data) => {
    const res = await fetch(`${BASE_URL}/field-config/hdd-fields/${fieldKey}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to update HDD field: ${res.statusText}`);
    return res.json();
  },

  deleteHddField: async (fieldKey) => {
    const res = await fetch(`${BASE_URL}/field-config/hdd-fields/${fieldKey}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(`Failed to delete HDD field: ${res.statusText}`);
    return res.json();
  },

  deleteFieldFromCategory: async (hddType, fieldKey) => {
    const res = await fetch(`${BASE_URL}/field-config/field/${encodeURIComponent(hddType)}/${encodeURIComponent(fieldKey)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(`Failed to delete field from category: ${res.statusText}`);
    return res.json();
  },
};

export default fieldConfigApi;
