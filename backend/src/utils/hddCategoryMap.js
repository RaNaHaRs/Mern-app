/** Map inventory UI category keys to field-config HDD type keys */
const INV_TO_CONFIG = {
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
  return HDD_INV_KEYS.has(category);
}

const CATEGORY_ENUM_MAP = {
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

module.exports = {
  INV_TO_CONFIG,
  CONFIG_TO_INV,
  HDD_INV_KEYS,
  inventoryToConfigKey,
  configToInventoryKey,
  normalizeConfigKey,
  isInventoryHddCategory,
  toDbCategory,
  formatItemRow,
};
