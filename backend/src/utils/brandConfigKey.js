function slugifyBrand(name) {
  if (!name || !String(name).trim()) return 'default';
  return String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function brandToConfigKey(company, customBrand = '') {
  if (company === 'Other') {
    return customBrand?.trim() ? slugifyBrand(customBrand) : 'other';
  }
  if (!company?.trim()) return null;
  return slugifyBrand(company);
}

/** Inventory Add Stock category keys — field config maps by these directly */
const INVENTORY_CATEGORY_KEYS = new Set([
  'harddisk',
  'wd_35', 'wd_25', 'seagate_35', 'seagate_25', 'others_35', 'others_25',
  'pcb', 'ssd', 'phone',
  'wd_3_5', 'wd_2_5', 'seagate_3_5', 'seagate_2_5', 'others_3_5', 'others_2_5',
]);

const LEGACY_CATEGORY_KEYS = {
  wd_35: 'western_digital',
  wd_25: 'western_digital',
  seagate_35: 'seagate',
  seagate_25: 'seagate',
  others_35: 'other',
  others_25: 'other',
  wd_3_5: 'western_digital',
  wd_2_5: 'western_digital',
  seagate_3_5: 'seagate',
  seagate_2_5: 'seagate',
};

function categoryToConfigKey(categoryKey) {
  if (!categoryKey) return null;
  const k = String(categoryKey).trim().replace(/\./g, '_').replace(/-/g, '_');
  if (INVENTORY_CATEGORY_KEYS.has(k)) return k;
  return k;
}

function resolveConfigKey(input, customBrand = '') {
  if (!input) return null;
  const trimmed = String(input).trim();
  const norm = trimmed.replace(/\./g, '_').replace(/-/g, '_');

  if (INVENTORY_CATEGORY_KEYS.has(trimmed) || INVENTORY_CATEGORY_KEYS.has(norm)) {
    return norm;
  }

  if (trimmed.includes(' ') || trimmed.includes('/')) {
    return brandToConfigKey(trimmed, customBrand);
  }

  if (LEGACY_CATEGORY_KEYS[norm]) return LEGACY_CATEGORY_KEYS[norm];
  return norm;
}

module.exports = {
  slugifyBrand,
  brandToConfigKey,
  categoryToConfigKey,
  resolveConfigKey,
  INVENTORY_CATEGORY_KEYS,
  LEGACY_CATEGORY_KEYS,
};
