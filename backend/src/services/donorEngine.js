const { query } = require('../config/database');

/**
 * DONOR ENGINE (Agent 3)
 * Automatically matches donor drives based on model, firmware, PCB compatibility
 */

async function findDonors(storageModelId, options = {}) {
  const { limit = 10, minScore = 30 } = options;

  // Get the target model's details
  const modelResult = await query(
    `SELECT sm.*, sb.name as brand_name 
     FROM storage_models sm
     JOIN storage_brands sb ON sm.brand_id = sb.id
     WHERE sm.id = $1`,
    [storageModelId]
  );

  if (!modelResult.rows.length) {
    return { donors: [], total: 0 };
  }

  const targetModel = modelResult.rows[0];

  // Find donors from database donor_matching table
  const dbDonors = await query(
    `SELECT dm.*, 
            sm.model_number, sm.series, sm.capacity_gb, sm.controller_chip,
            sm.pcb_number, sm.firmware_family, sm.head_map, sm.platter_count,
            sb.name as brand_name,
            ii.id as inventory_id, ii.quantity as stock_qty, ii.condition,
            ii.serial_number as donor_serial, ii.firmware_version as donor_firmware
     FROM donor_matching dm
     JOIN storage_models sm ON dm.donor_model_id = sm.id
     JOIN storage_brands sb ON sm.brand_id = sb.id
     LEFT JOIN inventory_items ii ON ii.storage_model_id = sm.id 
          AND ii.category = 'donor_drive' AND ii.is_available = true
     WHERE dm.model_id = $1 AND dm.compatibility_score >= $2
     ORDER BY dm.compatibility_score DESC, ii.quantity DESC NULLS LAST
     LIMIT $3`,
    [storageModelId, minScore, limit]
  );

  // Also find inventory donors by matching specs directly
  const inventoryDonors = await query(
    `SELECT ii.*, sm.model_number, sm.series, sm.capacity_gb, 
            sm.controller_chip, sm.pcb_number, sm.firmware_family,
            sm.head_map, sm.platter_count, sb.name as brand_name,
            NULL::decimal as compatibility_score
     FROM inventory_items ii
     JOIN storage_models sm ON ii.storage_model_id = sm.id
     JOIN storage_brands sb ON sm.brand_id = sb.id
     WHERE ii.category = 'donor_drive' 
       AND ii.is_available = true
       AND sm.brand_id = $1
       AND (
         sm.capacity_gb = $2 OR
         sm.pcb_number = $3 OR
         sm.firmware_family = $4
       )
     ORDER BY 
       (CASE WHEN sm.model_number = $5 THEN 100 ELSE 0 END) +
       (CASE WHEN sm.pcb_number = $3 THEN 40 ELSE 0 END) +
       (CASE WHEN sm.firmware_family = $4 THEN 30 ELSE 0 END) +
       (CASE WHEN sm.capacity_gb = $2 THEN 20 ELSE 0 END) DESC
     LIMIT $6`,
    [
      targetModel.brand_id,
      targetModel.capacity_gb,
      targetModel.pcb_number,
      targetModel.firmware_family,
      targetModel.model_number,
      limit
    ]
  );

  // Score and merge results
  const donorMap = new Map();

  // Add DB-matched donors
  for (const d of dbDonors.rows) {
    donorMap.set(d.donor_model_id || d.id, {
      ...d,
      matchType: 'database_matched',
      inStock: (d.stock_qty || 0) > 0,
    });
  }

  // Add inventory candidates not already in map
  for (const d of inventoryDonors.rows) {
    const key = d.storage_model_id;
    if (!donorMap.has(key)) {
      const score = calculateCompatibilityScore(targetModel, d);
      donorMap.set(key, {
        ...d,
        compatibility_score: score,
        matchType: 'auto_matched',
        inStock: d.quantity > 0,
      });
    }
  }

  const donors = Array.from(donorMap.values())
    .filter(d => d.compatibility_score >= minScore)
    .sort((a, b) => {
      // Prioritize in-stock, then highest score
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
      return b.compatibility_score - a.compatibility_score;
    });

  return {
    targetModel,
    donors: donors.slice(0, limit),
    total: donors.length,
  };
}

function calculateCompatibilityScore(target, candidate) {
  let score = 0;

  if (target.model_number === candidate.model_number) score += 100;
  else if (target.series && candidate.series && target.series === candidate.series) score += 60;

  if (target.pcb_number && candidate.pcb_number && target.pcb_number === candidate.pcb_number) score += 40;
  if (target.firmware_family && candidate.firmware_family && target.firmware_family === candidate.firmware_family) score += 30;
  if (target.controller_chip && candidate.controller_chip && target.controller_chip === candidate.controller_chip) score += 20;
  if (target.capacity_gb === candidate.capacity_gb) score += 20;
  if (target.platter_count && candidate.platter_count && target.platter_count === candidate.platter_count) score += 15;
  if (target.head_map && candidate.head_map && target.head_map === candidate.head_map) score += 25;

  return Math.min(score, 100);
}

async function reserveDonorForCase(inventoryItemId, caseId, userId) {
  await query(
    `UPDATE inventory_items SET 
       is_available = false, 
       reserved_for_case = $1,
       updated_at = NOW()
     WHERE id = $2`,
    [caseId, inventoryItemId]
  );

  await query(
    `INSERT INTO inventory_transactions (item_id, case_id, type, quantity, notes, performed_by)
     VALUES ($1, $2, 'reserved', 1, 'Reserved as donor for case', $3)`,
    [inventoryItemId, caseId, userId]
  );
}

/**
 * HELPER: Normalize capacity string/number to numeric GB value
 */
function normalizeCapacity(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim().toUpperCase();
  const num = parseFloat(str.replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return 0;
  if (str.includes('TB')) return Math.round(num * 1000);
  return Math.round(num);
}

/**
 * HELPER: Classify case or inventory item as HDD, SSD, or PCB
 */
function getMediaType(drive, isInventory = false) {
  if (isInventory) {
    const uiCat = String(drive.ui_category || drive.category || '').toLowerCase();
    if (uiCat.includes('pcb')) return 'PCB';
    if (uiCat.includes('ssd')) return 'SSD';
    return 'HDD';
  } else {
    const brand = String(drive.device_brand || '').toLowerCase();
    const model = String(drive.device_model || '').toLowerCase();
    const hddType = String(drive.hdd_type || '').toLowerCase();
    if (brand.includes('pcb') || model.includes('pcb') || hddType.includes('pcb')) return 'PCB';
    if (brand.includes('ssd') || model.includes('ssd') || hddType.includes('ssd') || String(drive.interface || '').toLowerCase() === 'nvme' || String(drive.interface || '').toLowerCase() === 'm2') return 'SSD';
    return 'HDD';
  }
}

/**
 * CORE: Core matching logic between a patient case and an inventory donor drive
 */
function matchCaseWithInventory(caseDrive, stockDrive) {
  const mediaType = getMediaType(caseDrive, false);
  let score = 0;
  const matchedFields = [];

  // Normalize fields for easy comparison
  const caseBrand = String(caseDrive.device_brand || '').trim().toLowerCase();
  const caseModel = String(caseDrive.device_model || '').trim().toLowerCase();
  const caseSn = String(caseDrive.serial_number || '').trim().toLowerCase();
  const casePcb = String(caseDrive.pcb_number || caseDrive.sm_pcb_number || '').trim().toLowerCase();
  const caseFirmware = String(caseDrive.firmware || caseDrive.sm_firmware_family || '').trim().toLowerCase();
  const caseCapacity = normalizeCapacity(caseDrive.capacity_gb);
  const caseInterface = String(caseDrive.interface || '').trim().toLowerCase();
  const caseFormFactor = String(caseDrive.form_factor || '').trim().toLowerCase();
  const caseSite = String(caseDrive.site_code || '').trim().toLowerCase();
  const casePn = String(caseDrive.pn_number || '').trim().toLowerCase();
  const caseCountry = String(caseDrive.manufacture_country || '').trim().toLowerCase();

  const stockBrand = String(stockDrive.company || stockDrive.brand || '').trim().toLowerCase();
  const stockModel = String(stockDrive.model || stockDrive.name || '').trim().toLowerCase();
  const stockSn = String(stockDrive.serial_number || '').trim().toLowerCase();
  const stockPcb = String(stockDrive.pcb_number || '').trim().toLowerCase();
  const stockFirmware = String(stockDrive.firmware || '').trim().toLowerCase();
  const stockCapacity = normalizeCapacity(stockDrive.capacity);
  const stockInterface = String(stockDrive.interface || '').trim().toLowerCase();
  const stockFormFactor = String(stockDrive.form_factor || '').trim().toLowerCase();
  const stockSite = String(stockDrive.site_code || '').trim().toLowerCase();
  const stockPn = String(stockDrive.pn_number || stockDrive.pn || '').trim().toLowerCase();
  const stockCountry = String(stockDrive.manufacture_country || stockDrive.country || '').trim().toLowerCase();

  // Extract custom fields if any
  const caseSsdNo = String(caseDrive.ssd_number || caseDrive.customFields?.ssd_number || '').trim().toLowerCase();
  const stockSsdNo = String(stockDrive.ssd_number || stockDrive.dynamic_fields?.ssd_number || '').trim().toLowerCase();

  // Helper brand matching (e.g. 'western digital' and 'wd' are same)
  const isBrandMatch = (b1, b2) => {
    if (!b1 || !b2) return false;
    if (b1 === b2) return true;
    if ((b1.includes('wd') || b1.includes('western')) && (b2.includes('wd') || b2.includes('western'))) return true;
    if (b1.split(' ')[0] === b2.split(' ')[0]) return true;
    return false;
  };

  const brandsMatch = isBrandMatch(caseBrand, stockBrand);

  if (mediaType === 'PCB') {
    // PCB matching: PCB number is priority
    if (!casePcb || !stockPcb) return null;

    if (casePcb === stockPcb) {
      score += 70;
      matchedFields.push('PCB Number matches exactly');
    } else {
      return null;
    }

    if (brandsMatch) {
      score += 10;
      matchedFields.push('Brand matches');
    }

    if (caseModel && stockModel && (caseModel === stockModel || caseModel.includes(stockModel) || stockModel.includes(caseModel))) {
      score += 10;
      matchedFields.push('Model matches');
    }

    const caseController = String(caseDrive.controller_chip || caseDrive.sm_controller_chip || '').toLowerCase();
    const stockController = String(stockDrive.controller_chip || '').toLowerCase();
    if (caseController && stockController && caseController === stockController) {
      score += 10;
      matchedFields.push('Controller chip matches');
    }
  } else if (mediaType === 'SSD') {
    // SSD matching: SSD number, then Brand, Model, Capacity
    const sNoMatch = caseSsdNo && stockSsdNo && caseSsdNo === stockSsdNo;
    const modelMatch = caseModel && stockModel && caseModel === stockModel;

    if (sNoMatch) {
      score += 50;
      matchedFields.push('SSD Number matches exactly');
    } else if (modelMatch) {
      score += 35;
      matchedFields.push('Model matches exactly');
    } else if (caseModel && stockModel && (caseModel.includes(stockModel) || stockModel.includes(caseModel))) {
      score += 15;
      matchedFields.push('Model partial match');
    }

    if (brandsMatch) {
      score += 20;
      matchedFields.push('Brand matches');
    }

    if (caseCapacity && stockCapacity && caseCapacity === stockCapacity) {
      score += 20;
      matchedFields.push('Capacity matches');
    }

    if (caseInterface && stockInterface && caseInterface === stockInterface) {
      score += 10;
      matchedFields.push('Interface matches');
    }
  } else {
    // HDD matching: Brand first, then Model, Capacity, Interface, S/N characters, Firmware, Site code, Country
    if (!brandsMatch) {
      return null;
    }

    score += 20;
    matchedFields.push('Brand matches');

    if (caseModel && stockModel) {
      if (caseModel === stockModel) {
        score += 25;
        matchedFields.push('Model number matches exactly');
      } else if (caseModel.includes(stockModel) || stockModel.includes(caseModel)) {
        score += 15;
        matchedFields.push('Model number partial match');
      }
    }

    if (caseCapacity && stockCapacity) {
      if (caseCapacity === stockCapacity) {
        score += 15;
        matchedFields.push('Capacity matches');
      } else if (Math.abs(caseCapacity - stockCapacity) / caseCapacity < 0.1) {
        score += 8;
        matchedFields.push('Capacity is close (compatible)');
      }
    }

    if (caseInterface && stockInterface && caseInterface === stockInterface) {
      score += 10;
      matchedFields.push('Interface matches');
    }

    if (casePcb && stockPcb && casePcb === stockPcb) {
      score += 10;
      matchedFields.push('PCB number matches exactly');
    }

    if (caseFirmware && stockFirmware && caseFirmware === stockFirmware) {
      score += 10;
      matchedFields.push('Firmware matches');
    }

    if (caseSite && stockSite && caseSite === stockSite) {
      score += 5;
      matchedFields.push('Site code matches');
    }

    if (casePn && stockPn && casePn === stockPn) {
      score += 5;
      matchedFields.push('Part number matches exactly');
    }

    if (caseSn && stockSn && caseSn.substring(0, 3) === stockSn.substring(0, 3)) {
      score += 5;
      matchedFields.push('First three characters of serial number match');
    }
  }

  return score > 0 ? { score: Math.min(score, 100), matchedFields } : null;
}

/**
 * FETCH AND COMPUTE ALL DONOR MATCHES FOR ACTIVE CASES
 */
async function getAllDonorMatches(options = {}) {
  const { minScore = 30, brandFilter = null, topCount = 6 } = options;
  const normalizedBrandFilter = brandFilter ? String(brandFilter).trim().toLowerCase() : null;

  const getBrandKey = (brandValue) => {
    const b = String(brandValue || '').toLowerCase();
    if (b.includes('seagate')) return 'seagate';
    if (b.includes('wd') || b.includes('western')) return 'wd';
    if (b.includes('toshiba')) return 'toshiba';
    if (b.includes('hitachi') || b.includes('hgst')) return 'hitachi';
    if (b.includes('samsung')) return 'samsung';
    return null;
  };

  // 1. Fetch all cases
  const casesResult = await query(
    `SELECT c.id, c.case_number, c.device_brand, c.device_model, c.serial_number, c.capacity_gb, c.interface, c.form_factor, c.stage,
            sm.pcb_number as sm_pcb_number, sm.firmware_family as sm_firmware_family, 
            sm.controller_chip as sm_controller_chip, sm.head_map as sm_head_map, sm.platter_count as sm_platter_count,
            cl.first_name, cl.last_name, cl.company as client_company
     FROM cases c
     LEFT JOIN storage_models sm ON c.storage_model_id = sm.id
     LEFT JOIN clients cl ON c.client_id = cl.id
     WHERE c.stage NOT IN ('completed', 'delivered', 'failed')
     ORDER BY c.case_number DESC`
  );

  const cases = casesResult.rows;

  // 2. Fetch case custom fields to extract extras like ssd_number or manual fields
  const customFieldsResult = await query(
    `SELECT ccfv.case_id, cf.field_key, ccfv.field_value
     FROM case_custom_field_values ccfv
     JOIN custom_fields cf ON ccfv.custom_field_id = cf.id`
  );

  const caseCustomFieldsMap = {};
  customFieldsResult.rows.forEach(row => {
    if (!caseCustomFieldsMap[row.case_id]) {
      caseCustomFieldsMap[row.case_id] = {};
    }
    caseCustomFieldsMap[row.case_id][row.field_key] = row.field_value;
  });

  // Attach custom fields to cases
  cases.forEach(c => {
    c.customFields = caseCustomFieldsMap[c.id] || {};
    // Extract manual standard fields if filled via custom field schema
    c.pcb_number = c.customFields.pcb_number || c.sm_pcb_number || null;
    c.firmware = c.customFields.firmware || c.sm_firmware_family || null;
    c.site_code = c.customFields.site_code || null;
    c.pn_number = c.customFields.pn_number || null;
    c.manufacture_country = c.customFields.manufacture_country || null;
  });

  // 3. Fetch all available inventory donor drives
  const stockResult = await query(
    `SELECT ii.*,
            sm.controller_chip as sm_controller_chip, sm.platter_count as sm_platter_count
     FROM inventory_items ii
     LEFT JOIN storage_models sm ON ii.storage_model_id = sm.id
     WHERE ii.deleted_at IS NULL AND ii.is_available = true AND ii.quantity > 0`
  );

  const stockItems = stockResult.rows;

  // 4. Also fetch any legacy donor drives from the donor_drive table for completeness
  let donorDriveItems = [];
  try {
    const ddResult = await query(`SELECT * FROM donor_drive WHERE status = 'available' AND quantity > 0`);
    donorDriveItems = ddResult.rows;
  } catch (err) {
    // donor_drive table might not be active, ignore
  }

  // Map legacy donor drives to inventory items format for matching
  const legacyItemsMapped = donorDriveItems.map(dd => ({
    id: `legacy-${dd.id}`,
    stock_number: dd.stock_number,
    category: dd.category,
    ui_category: dd.category,
    company: dd.company,
    brand: dd.brand,
    model: dd.model,
    serial_number: dd.serial_number,
    pcb_number: dd.pcb_number,
    ssd_number: dd.ssd_number,
    capacity: dd.capacity,
    interface: dd.interface,
    notes: dd.notes,
    quantity: dd.quantity,
    unit_cost: dd.unit_cost,
    location: dd.location,
    status: dd.status,
    is_legacy: true
  }));

  const allDonors = [...stockItems, ...legacyItemsMapped].filter(d => {
    if (!normalizedBrandFilter) return true;
    const donorBrand = String(d.company || d.brand || '').toLowerCase();
    return donorBrand.includes(normalizedBrandFilter);
  });

  // 5. Match every case with donors
  const caseMatches = [];
  const brandStats = {
    seagate: { donors: 0, cases: 0 },
    wd: { donors: 0, cases: 0 },
    toshiba: { donors: 0, cases: 0 },
    hitachi: { donors: 0, cases: 0 },
    samsung: { donors: 0, cases: 0 }
  };

  // Pre-calculate total donors by brand in stock
  allDonors.forEach(d => {
    const brandKey = getBrandKey(d.company || d.brand);
    if (!brandKey) return;
    brandStats[brandKey].donors += d.quantity || 1;
  });

  const matchedCasesBrandsSet = {
    seagate: new Set(),
    wd: new Set(),
    toshiba: new Set(),
    hitachi: new Set(),
    samsung: new Set()
  };

  const allMatchRows = [];

  cases.forEach(c => {
    const mediaType = getMediaType(c, false);
    const donorMatches = [];

    allDonors.forEach(d => {
      const match = matchCaseWithInventory(c, d);
      if (match && match.score >= minScore) {
        const donorMatch = {
          donorItem: d,
          score: match.score,
          matchedFields: match.matchedFields
        };
        donorMatches.push(donorMatch);
        allMatchRows.push({ caseDrive: c, mediaType, donorMatch });

        const brandKey = getBrandKey(c.device_brand);
        if (brandKey) matchedCasesBrandsSet[brandKey].add(c.id);
      }
    });

    if (donorMatches.length > 0) {
      // Sort matches by score descending
      donorMatches.sort((a, b) => b.score - a.score);

      caseMatches.push({
        caseDrive: c,
        mediaType,
        donorMatches
      });
    }
  });

  // Compile final brand-wise cases count
  Object.keys(matchedCasesBrandsSet).forEach(key => {
    brandStats[key].cases = matchedCasesBrandsSet[key].size;
  });

  const topMatches = allMatchRows
    .sort((a, b) => b.donorMatch.score - a.donorMatch.score)
    .slice(0, topCount)
    .map(({ caseDrive, donorMatch, mediaType }) => ({
      caseDrive,
      mediaType,
      ...donorMatch
    }));

  return {
    matches: caseMatches,
    stats: brandStats,
    summary: {
      totalCases: cases.length,
      casesWithMatches: caseMatches.length,
      totalDonorMatches: allMatchRows.length
    },
    topMatches
  };
}

module.exports = { findDonors, calculateCompatibilityScore, reserveDonorForCase, getAllDonorMatches };
