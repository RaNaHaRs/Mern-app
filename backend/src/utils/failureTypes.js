/** Canonical failure type slugs used in forms and API validation hints */
const KNOWN_FAILURE_TYPES = [
  'logical',
  'firmware',
  'electrical',
  'mechanical',
  'head_crash',
  'pcb_damage',
  'motor_failure',
  'motor_issue',
  'bad_sectors',
  'bad_sector',
  'water_damage',
  'fire_damage',
  'burnt_pcb',
  'clicking',
  'not_detecting',
  'unknown',
];

const ALIASES = {
  bad_sector: 'bad_sectors',
  motor_issue: 'motor_failure',
  burnt_pcb: 'pcb_damage',
};

function normalizeFailureType(value) {
  if (value === undefined || value === null || value === '') return 'unknown';
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  if (!slug) return 'unknown';
  return ALIASES[slug] || slug;
}

function isValidFailureType(value) {
  const normalized = normalizeFailureType(value);
  return normalized.length > 0 && normalized.length <= 100;
}

module.exports = {
  KNOWN_FAILURE_TYPES,
  normalizeFailureType,
  isValidFailureType,
};
