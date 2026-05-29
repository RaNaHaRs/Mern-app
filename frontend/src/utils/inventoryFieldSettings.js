export const INV_DEFAULTS = {
  hdd: [
    { key: 'mfg_country',   label: 'Manufacturing Country', type: 'select', options: ['China', 'Thailand', 'Malaysia', 'Japan', 'USA', 'Philippines'] },
    { key: 'capacity',      label: 'Capacity',              type: 'select', options: ['160GB', '250GB', '320GB', '500GB', '750GB', '1TB', '2TB', '4TB'] },
    { key: 'interface',     label: 'Interface',             type: 'select', options: ['SATA', 'SAS', 'IDE/PATA', 'NVMe', 'USB'] },
    { key: 'form_factor',   label: 'Form Factor',           type: 'select', options: ['3.5"', '2.5"', '1.8"'] },
    { key: 'rpm',           label: 'RPM',                   type: 'select', options: ['5400', '7200', '10000', '15000'] },
    { key: 'rom_family',    label: 'ROM Family',            type: 'text',   options: [] },
    { key: 'firmware',      label: 'Firmware',              type: 'text',   options: [] },
    { key: 'heads',         label: 'Heads',                 type: 'text',   options: [] },
    { key: 'condition',     label: 'Condition',             type: 'select', options: ['New', 'Good', 'Refurbished', 'For Parts'] },
  ],
  ssd: [
    { key: 'capacity',      label: 'Capacity',              type: 'select', options: ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB', '4TB'] },
    { key: 'ssd_type',      label: 'SSD Type',              type: 'select', options: ['SATA', 'NVMe M.2', 'mSATA', 'PCIe', 'U.2'] },
    { key: 'interface',     label: 'Interface',             type: 'select', options: ['SATA III', 'PCIe 3.0', 'PCIe 4.0', 'PCIe 5.0'] },
    { key: 'nand_type',     label: 'NAND Type',             type: 'select', options: ['TLC', 'MLC', 'QLC', 'SLC', '3D NAND'] },
    { key: 'controller',    label: 'Controller',            type: 'text',   options: [] },
    { key: 'condition',     label: 'Condition',             type: 'select', options: ['New', 'Good', 'Refurbished', 'For Parts'] },
  ],
  pcb: [
    { key: 'pcb_name',      label: 'PCB Name',              type: 'text',   options: [] },
    { key: 'pcb_number',    label: 'PCB Number',            type: 'text',   options: [] },
    { key: 'pcb_problem',   label: 'PCB Problem',           type: 'select', options: ['Burnt', 'Short Circuit', 'Missing Component', 'Capacitor Failure', 'TVS Diode Blown', 'Other'] },
    { key: 'pcb_type',      label: 'PCB Type',              type: 'select', options: ['HDD PCB', 'SSD Controller PCB', 'Donor PCB', 'Flash PCB'] },
    { key: 'compatible_with', label: 'Compatible With',      type: 'text',   options: [] },
    { key: 'mfg_country',   label: 'Manufacturing Country', type: 'select', options: ['China', 'Thailand', 'Malaysia', 'Japan', 'USA'] },
    { key: 'condition',     label: 'Condition',             type: 'select', options: ['New', 'Used-Good', 'Faulty-For Parts'] },
  ],
  other: [
    { key: 'item_type',     label: 'Item Type',             type: 'select', options: ['Tape', 'Flash Drive', 'Memory Card', 'RAID Controller', 'Cable', 'Adapter', 'Tool'] },
    { key: 'capacity',      label: 'Capacity (if applicable)', type: 'text', options: [] },
    { key: 'interface',     label: 'Interface',             type: 'select', options: ['USB', 'SATA', 'SAS', 'Thunderbolt', 'FireWire', 'Other'] },
    { key: 'condition',     label: 'Condition',             type: 'select', options: ['New', 'Good', 'Refurbished', 'For Parts'] },
  ],
};

export function loadInventoryFields(deviceFamily) {
  if (!deviceFamily) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(`inv_fields_${deviceFamily}`));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {
    // ignore parse issues
  }
  return INV_DEFAULTS[deviceFamily] || [];
}

export function saveInventoryFields(deviceFamily, fields) {
  if (!deviceFamily) return;
  localStorage.setItem(`inv_fields_${deviceFamily}`, JSON.stringify(fields));
}
