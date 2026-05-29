import { categoryToConfigKey } from '../constants/inventoryConfig';

export const INV_TO_CONFIG = {
  wd_35: 'wd_3_5',
  wd_25: 'wd_2_5',
  seagate_35: 'seagate_3_5',
  seagate_25: 'seagate_2_5',
  others_35: 'others_3_5',
  others_25: 'others_2_5',
};

export const CONFIG_HDD_TYPES = [
  { key: 'wd_2_5', label: 'WD 2.5"' },
  { key: 'wd_3_5', label: 'WD 3.5"' },
  { key: 'seagate_2_5', label: 'Seagate 2.5"' },
  { key: 'seagate_3_5', label: 'Seagate 3.5"' },
  { key: 'others_2_5', label: 'Others 2.5"' },
  { key: 'others_3_5', label: 'Others 3.5"' },
];

export const HDD_INV_KEYS = new Set(Object.keys(INV_TO_CONFIG));

export function inventoryToConfigKey(uiCategory) {
  if (!uiCategory) return null;
  return INV_TO_CONFIG[uiCategory] || categoryToConfigKey(uiCategory);
}

export function isInventoryHddCategory(category) {
  return HDD_INV_KEYS.has(category);
}
