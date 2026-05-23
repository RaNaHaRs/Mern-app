/** Map inventory UI category keys to field-config HDD type keys */
const INV_TO_CONFIG = {
  hdd: 'harddisk',
  harddisk: 'harddisk',
  wd_35: 'wd_3_5',
  wd_25: 'wd_2_5',
  seagate_35: 'seagate_3_5',
  seagate_25: 'seagate_2_5',
  others_35: 'others_3_5',
  others_25: 'others_2_5',
};

const CONFIG_TO_INV = Object.fromEntries(
  Object.entries(INV_TO_CONFIG).map(([k, v]) => [v, k])
);

const HDD_INV_KEYS = new Set(Object.keys(INV_TO_CONFIG));

function inventoryToConfigKey(uiCategory) {
  if (!uiCategory) return null;
  if (INV_TO_CONFIG[uiCategory]) return INV_TO_CONFIG[uiCategory];
  return uiCategory.replace(/\./g, '_').replace(/-/g, '_');
}

function configToInventoryKey(configKey) {
  if (!configKey) return null;
  if (CONFIG_TO_INV[configKey]) return CONFIG_TO_INV[configKey];
  return configKey;
}

function normalizeConfigKey(hddType) {
  if (!hddType) return null;
  const k = hddType.replace(/\./g, '_').replace(/-/g, '_');
  if (CONFIG_TO_INV[k] || INV_TO_CONFIG[k] || HDD_INV_KEYS.has(k)) return k;
  return k;
}

function isInventoryHddCategory(category) {
  if (!category) return false;
  if (HDD_INV_KEYS.has(category)) return true;
  const lower = category.toLowerCase().trim();
  return (
    lower.endsWith('_3_5') ||
    lower.endsWith('_2_5') ||
    lower.endsWith('_35') ||
    lower.endsWith('_25') ||
    lower.startsWith('wd_') ||
    lower.startsWith('seagate_') ||
    lower.startsWith('toshiba_') ||
    lower.includes('hdd') ||
    lower.includes('harddisk') ||
    lower === 'hdd'
  );
}

/** Normalize UI category to hdd | ssd | pcb | other */
function normalizeUiCategory(category) {
  if (!category) return 'hdd';
  const k = String(category).toLowerCase().trim();
  if (k === 'hdd' || k === 'harddisk' || k.startsWith('wd_') || k.startsWith('seagate_') || k.includes('hdd')) return 'hdd';
  if (k === 'ssd') return 'ssd';
  if (k === 'pcb') return 'pcb';
  return 'other';
}

const CATEGORY_ENUM_MAP = {
  hdd: 'donor_drive',
  harddisk: 'donor_drive',
  wd_35: 'donor_drive', wd_25: 'donor_drive',
  seagate_35: 'donor_drive', seagate_25: 'donor_drive',
  others_35: 'donor_drive', others_25: 'donor_drive',
  ssd: 'donor_drive', pcb: 'spare_part', phone: 'spare_part',
};

function toDbCategory(uiCategory) {
  return CATEGORY_ENUM_MAP[uiCategory] || 'spare_part';
}

function formatItemRow(row) {
  if (!row) return row;
  return {
    ...row,
    category: row.ui_category || row.category,
    firmware: row.firmware || row.firmware_version,
  };
}

function validatePcbPayload(body) {
  const cat = normalizeUiCategory(body.category || body.ui_category);
  if (cat !== 'pcb') return null;
  const model = String(body.model || '').trim();
  const name = String(body.name || '').trim();
  const pcbNumber = String(body.pcb_number || (body.dynamicFields && body.dynamicFields.pcb_number) || '').trim();
  const problem = String(body.notes || '').trim();
  if (!model) return 'Model is required for PCB items';
  if (!name) return 'PCB Name is required for PCB items';
  if (!pcbNumber) return 'PCB Number is required for PCB items';
  if (!problem) return 'Problem is required for PCB items';
  return null;
}

module.exports = {
  INV_TO_CONFIG,
  CONFIG_TO_INV,
  HDD_INV_KEYS,
  inventoryToConfigKey,
  configToInventoryKey,
  normalizeConfigKey,
  isInventoryHddCategory,
  normalizeUiCategory,
  validatePcbPayload,
  toDbCategory,
  formatItemRow,
};
