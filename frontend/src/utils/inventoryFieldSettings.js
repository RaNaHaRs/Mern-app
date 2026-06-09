const DEFAULT_FIELDS = {
  hdd: [
    { key: 'capacity',    label: 'Capacity',              type: 'select', options: ['160GB', '250GB', '320GB', '500GB', '750GB', '1TB', '2TB', '3TB', '4TB', '6TB', '8TB', '10TB', '12TB', '14TB', '16TB', '18TB', '20TB'], required: true },
    { key: 'interface',   label: 'Interface',             type: 'select', options: ['SATA', 'SATA III', 'SAS', 'IDE/PATA', 'USB', 'PCIe', 'NVMe', 'NVMe M.2'], required: true },
    { key: 'form_factor', label: 'Form Factor',           type: 'select', options: ['3.5"', '2.5"', '1.8"'], required: false },
    { key: 'rpm',         label: 'RPM',                   type: 'select', options: ['5400', '7200', '10000', '15000'], required: false },
    { key: 'family',      label: 'ROM Family',            type: 'text',   options: [], required: false },
    { key: 'firmware',    label: 'Firmware / SW Rev',     type: 'text',   options: [], required: false },
    { key: 'head_map',    label: 'Head Map',              type: 'text',   options: [], required: false },
    { key: 'manufacture_country', label: 'Manufacturing Country', type: 'select', options: ['China', 'Thailand', 'Malaysia', 'Japan', 'USA', 'Philippines'], required: false },
    { key: 'manufacture_date',    label: 'Manufacture Date',      type: 'date',   options: [], required: false },
    { key: 'pcb_number',  label: 'PCB Number',            type: 'text',   options: [], required: false },
  ],
  ssd: [
    { key: 'capacity',    label: 'Capacity',              type: 'select', options: ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB', '4TB'], required: true },
    { key: 'ssd_type',    label: 'SSD Type',              type: 'select', options: ['SATA', 'NVMe M.2', 'mSATA', 'PCIe', 'U.2'], required: false },
    { key: 'interface',   label: 'Interface',             type: 'select', options: ['SATA III', 'PCIe 3.0', 'PCIe 4.0', 'PCIe 5.0'], required: false },
    { key: 'nand_type',   label: 'NAND Type',             type: 'select', options: ['TLC', 'MLC', 'QLC', 'SLC', '3D NAND'], required: false },
    { key: 'controller',  label: 'Controller',            type: 'text',   options: [], required: false },
    { key: 'firmware',    label: 'Firmware / SW Rev',     type: 'text',   options: [], required: false },
  ],
  pcb: [
    { key: 'pcb_name',      label: 'PCB Name',              type: 'text',     options: [], required: true },
    { key: 'model',         label: 'Model / Part No.',       type: 'text',     options: [], required: true },
    { key: 'pcb_number',    label: 'PCB Number',            type: 'text',     options: [], required: true },
    { key: 'pcb_problem',   label: 'PCB Problem',           type: 'select',   options: ['Burnt', 'Short Circuit', 'Missing Component', 'Capacitor Failure', 'TVS Diode Blown', 'Other'], required: false },
    { key: 'pcb_type',      label: 'PCB Type',              type: 'select',   options: ['HDD PCB', 'SSD Controller PCB', 'Donor PCB', 'Flash PCB'], required: false },
    { key: 'compatible_with', label: 'Compatible With',      type: 'text',     options: [], required: false },
    { key: 'mfg_country',   label: 'Manufacturing Country', type: 'select',   options: ['China', 'Thailand', 'Malaysia', 'Japan', 'USA'], required: false },
    { key: 'notes',         label: 'Problem / Notes',       type: 'textarea', options: [], required: true },
  ],
  other: [
    { key: 'item_type',     label: 'Item Type',             type: 'select', options: ['Tape', 'Flash Drive', 'Memory Card', 'RAID Controller', 'Cable', 'Adapter', 'Tool'], required: false },
    { key: 'capacity',      label: 'Capacity (if applicable)', type: 'text', options: [], required: false },
    { key: 'interface',     label: 'Interface',             type: 'select', options: ['USB', 'SATA', 'SAS', 'Thunderbolt', 'FireWire', 'Other'], required: false },
    { key: 'condition',     label: 'Condition',             type: 'select', options: ['New', 'Good', 'Refurbished', 'For Parts'], required: false },
  ],
};

const STORAGE_PREFIX = 'inv_fields_';

function normalizeField(field) {
  return {
    key: field.key,
    label: field.label || field.key,
    type: field.type || 'text',
    options: Array.isArray(field.options) ? field.options : [],
    required: !!field.required,
    hidden: !!field.hidden,
    custom: !!field.custom,
    status: field.status || (field.hidden ? 'hidden' : 'optional'),
  };
}

export function loadInventoryFields(deviceFamily) {
  if (!deviceFamily) return [];

  const saved = (() => {
    try {
      const value = localStorage.getItem(`${STORAGE_PREFIX}${deviceFamily}`);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  })();

  const defaults = (DEFAULT_FIELDS[deviceFamily] || []).map(normalizeField);
  if (!Array.isArray(saved) || !saved.length) return defaults;

  const savedByKey = new Map(saved.map(field => [field.key, normalizeField(field)]));
  const merged = defaults.map(def => ({ ...def, ...savedByKey.get(def.key) }));
  const extra = saved
    .map(normalizeField)
    .filter(field => !defaults.some(def => def.key === field.key));

  return [...merged, ...extra];
}

export function saveInventoryFields(deviceFamily, fields) {
  if (!deviceFamily) return;
  localStorage.setItem(`${STORAGE_PREFIX}${deviceFamily}`, JSON.stringify(fields.map(normalizeField)));
}

export function resetInventoryFields(deviceFamily) {
  if (!deviceFamily) return;
  localStorage.removeItem(`${STORAGE_PREFIX}${deviceFamily}`);
}

export { DEFAULT_FIELDS as INV_DEFAULTS };
