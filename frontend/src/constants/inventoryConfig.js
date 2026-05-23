/** Shared inventory brands, categories, and field helpers (Add Stock + Settings) */

export const DEFAULT_INVENTORY_BRANDS = [
  'Western Digital', 'Seagate', 'Toshiba', 'Samsung', 'Hitachi (HGST)',
  'Fujitsu', 'IBM / HGST', 'Maxtor', 'Quantum', 'LaCie', 'Buffalo',
  'Transcend', 'SanDisk', 'Kingston', 'Crucial', 'Lexar', 'Corsair',
  'ADATA', 'SK Hynix', 'Micron', 'Intel', 'Other',
];

export const DEFAULT_INV_CATEGORIES = [
  { key: 'harddisk', label: 'Harddisk', icon: '💿', color: '#3b82f6', brand: '', isHdd: true },
  { key: 'pcb', label: 'PCB', icon: '🔌', color: '#10b981', brand: '', isHdd: false },
  { key: 'ssd', label: 'SSD', icon: '⚡', color: '#06b6d4', brand: '', isHdd: false },
  { key: 'stock_item', label: 'Stock Item', icon: '📦', color: '#f59e0b', brand: '', isHdd: false },
  { key: 'other', label: 'Other', icon: '📦', color: '#8b5cf6', brand: '', isHdd: false },
  { key: 'others', label: 'Others', icon: '📦', color: '#8b5cf6', brand: '', isHdd: false },
];

export const DEFAULT_STOCK_FIELD_KEYS = [
  'serial_number', 'model', 'pcb_number', 'capacity', 'interface', 'form_factor',
  'firmware', 'site_code', 'date_code', 'head_map', 'family',
  'manufacture_country', 'manufacture_date', 'pn_number', 'dcm', 'dcx',
  'company_name', 'mlc', 'hdd_code', 'four_code',
];

const LS_BRANDS = 'crm_inventory_brands';
const LS_CATEGORIES = 'crm_inventory_categories';

export function slugifyBrand(name) {
  if (!name || !String(name).trim()) return 'default';
  return String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** Config key for field_configs / custom_fields — matches Add Stock company/brand */
export function brandToConfigKey(company, customBrand = '') {
  if (company === 'Other') {
    return customBrand?.trim() ? slugifyBrand(customBrand) : 'other';
  }
  if (!company?.trim()) return null;
  return slugifyBrand(company);
}

export function loadBrands() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_BRANDS) || 'null');
    if (Array.isArray(v) && v.length) return v;
  } catch { /* ignore */ }
  return DEFAULT_INVENTORY_BRANDS.map((name, i) => ({
    id: `default_${i}`,
    name,
    config_key: slugifyBrand(name),
    is_system: ['Western Digital', 'Seagate', 'Other'].includes(name),
    active: true,
  }));
}

export function saveBrands(brands) {
  localStorage.setItem(LS_BRANDS, JSON.stringify(brands));
  localStorage.setItem('crm_hdd_companies', JSON.stringify(brands.filter(b => b.active !== false).map(b => b.name)));
}

export function loadCategories() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_CATEGORIES) || 'null');
    if (Array.isArray(v) && v.length) return v;
  } catch { /* ignore */ }
  return DEFAULT_INV_CATEGORIES.map((c, i) => ({ ...c, active: true, sort_order: i }));
}

export function saveCategories(categories) {
  localStorage.setItem(LS_CATEGORIES, JSON.stringify(categories));
}

export function getActiveBrands(brands) {
  return (brands || loadBrands()).filter(b => b.active !== false).map(b => b.name);
}

export function isHddCategoryKey(key, categories = loadCategories()) {
  const cat = categories.find(c => c.key === key);
  return cat ? cat.isHdd !== false : ['harddisk', 'wd_35', 'wd_25', 'seagate_35', 'seagate_25', 'others_35', 'others_25'].includes(key);
}

/** Field Config + dynamic form fields use inventory category key (wd_35, pcb, ssd, …) */
export function categoryToConfigKey(categoryKey) {
  if (!categoryKey) return null;
  return String(categoryKey).trim().replace(/\./g, '_').replace(/-/g, '_');
}
