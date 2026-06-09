import { api } from './api';

export const fieldConfigApi = {
  getConfig: async () => api.get('/field-config'),

  getSchema: async (hddType) => {
    const encoded = encodeURIComponent(hddType);
    return api.get(`/field-config/schema/${encoded}`);
  },

  getSchemaByBrand: async (brandName, querySuffix = '') => {
    const encoded = encodeURIComponent(brandName);
    return api.get(`/field-config/schema/${encoded}${querySuffix}`);
  },

  updateFieldStatus: async (hddType, fieldKey, status) =>
    api.put('/field-config/field', { hddType, fieldKey, status }),

  addCustomField: async (hddType, fieldLabel, fieldType, isMandatory = false) =>
    api.post('/field-config/custom', { hddType, fieldLabel, fieldType, isMandatory }),

  updateCustomField: async (fieldId, data) =>
    api.put(`/field-config/custom/${fieldId}`, data),

  deleteCustomField: async (fieldId) =>
    api.delete(`/field-config/custom/${fieldId}`),

  toggleSection: async (sectionKey, isEnabled) =>
    api.put(`/field-config/section/${sectionKey}`, { isEnabled }),

  syncFromLocalStorage: async () => {
    try {
      const config = JSON.parse(localStorage.getItem('crm_field_config') || '{}');
      const sections = JSON.parse(localStorage.getItem('crm_sections_config') || '{}');
      const promises = [];
      if (config.hdd_fields) {
        for (const [hddType, fields] of Object.entries(config.hdd_fields)) {
          for (const [fieldKey, status] of Object.entries(fields)) {
            promises.push(fieldConfigApi.updateFieldStatus(hddType, fieldKey, status));
          }
        }
      }
      if (config.custom_fields) {
        for (const [hddType, customFields] of Object.entries(config.custom_fields)) {
          for (const field of customFields) {
            promises.push(fieldConfigApi.addCustomField(hddType, field.label, 'text', false));
          }
        }
      }
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

  loadToLocalStorage: async () => {
    try {
      const config = await fieldConfigApi.getConfig();
      const existing = JSON.parse(localStorage.getItem('crm_field_config') || '{}');
      const normalized = {
        hdd_fields: config.hdd_fields || config.hddFields || {},
        custom_fields: config.custom_fields || config.customFields || {},
        sections: config.sections || {},
        case_fields: existing.case_fields || {},
      };
      localStorage.setItem('crm_field_config', JSON.stringify(normalized));
      return normalized;
    } catch (error) {
      console.error('Failed to load config:', error);
      return JSON.parse(localStorage.getItem('crm_field_config') || '{}');
    }
  },

  getCaseSettings: async () => api.get('/field-config/settings'),

  saveCaseSettings: async (settings) =>
    api.put('/field-config/settings', settings),

  syncCaseSettingsToLocalStorage: (settings) => {
    if (!settings || typeof settings !== 'object') return;
    if (Array.isArray(settings.stages)) localStorage.setItem('custom_stages', JSON.stringify(settings.stages));
    if (Array.isArray(settings.symptoms)) localStorage.setItem('custom_symptoms', JSON.stringify(settings.symptoms));
    if (Array.isArray(settings.failure_types)) localStorage.setItem('custom_failure_types', JSON.stringify(settings.failure_types));
    if (Array.isArray(settings.brands)) localStorage.setItem('custom_brands', JSON.stringify(settings.brands));
    if (Array.isArray(settings.manufacture_countries)) localStorage.setItem('custom_manufacture_countries', JSON.stringify(settings.manufacture_countries));
    if (Array.isArray(settings.interfaces)) localStorage.setItem('custom_interfaces', JSON.stringify(settings.interfaces));
    if (Array.isArray(settings.capacities)) localStorage.setItem('custom_capacities', JSON.stringify(settings.capacities));
    if (Array.isArray(settings.hdd_types)) localStorage.setItem('custom_hdd_types', JSON.stringify(settings.hdd_types));
    if (Array.isArray(settings.payment_methods)) localStorage.setItem('custom_payment_methods', JSON.stringify(settings.payment_methods));
  },

  loadCaseSettingsToLocalStorage: async () => {
    try {
      const settings = await fieldConfigApi.getCaseSettings();
      fieldConfigApi.syncCaseSettingsToLocalStorage(settings);
      return settings;
    } catch (error) {
      console.error('Failed to load case settings:', error);
      return {
        stages: JSON.parse(localStorage.getItem('custom_stages') || 'null'),
        symptoms: JSON.parse(localStorage.getItem('custom_symptoms') || 'null'),
        failure_types: JSON.parse(localStorage.getItem('custom_failure_types') || 'null'),
        brands: JSON.parse(localStorage.getItem('custom_brands') || 'null'),
        manufacture_countries: JSON.parse(localStorage.getItem('custom_manufacture_countries') || 'null'),
        interfaces: JSON.parse(localStorage.getItem('custom_interfaces') || 'null'),
        capacities: JSON.parse(localStorage.getItem('custom_capacities') || 'null'),
        hdd_types: JSON.parse(localStorage.getItem('custom_hdd_types') || 'null'),
        payment_methods: JSON.parse(localStorage.getItem('custom_payment_methods') || 'null'),
      };
    }
  },

  getHddFields: async () => api.get('/field-config/hdd-fields'),

  addHddField: async (fieldLabel, fieldType = 'text') =>
    api.post('/field-config/hdd-fields', { fieldLabel, fieldType }),

  updateHddField: async (fieldKey, data) =>
    api.put(`/field-config/hdd-fields/${fieldKey}`, data),

  deleteHddField: async (fieldKey) =>
    api.delete(`/field-config/hdd-fields/${fieldKey}`),

  deleteFieldFromCategory: async (hddType, fieldKey) =>
    api.delete(`/field-config/field/${encodeURIComponent(hddType)}/${encodeURIComponent(fieldKey)}`),
};

export default fieldConfigApi;
