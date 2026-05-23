# Field Configuration - Implementation Summary

## Overview
Enhanced the field configuration system with delete functionality, proper persistence, and improved UI for managing inventory form fields per category.

## Changes Made

### 1. Frontend - Delete Button UI (`HddFieldConfigManager.jsx`)
**Location:** `frontend/src/components/settings/HddFieldConfigManager.jsx`

**Changes:**
- Added delete button (🗑️) next to each field's status buttons
- Delete button color: #ef4444 (red)
- Added `deleteFieldFromCategory()` function with confirmation dialog
- Function sets field status to 'hidden' (soft delete) instead of removing
- Field remains visible with strikethrough styling after deletion

**Code Addition:**
```javascript
const deleteFieldFromCategory = async (catKey, fieldKey) => {
  if (!window.confirm('Remove this field from this category?')) return;
  try {
    await fieldConfigApi.deleteFieldFromCategory(catKey, fieldKey);
    const cfg = JSON.parse(JSON.stringify(config));
    if (!cfg.hdd_fields) cfg.hdd_fields = {};
    if (!cfg.hdd_fields[catKey]) cfg.hdd_fields[catKey] = {};
    cfg.hdd_fields[catKey][fieldKey] = 'hidden';
    setConfig(cfg);
    localStorage.setItem('crm_field_config', JSON.stringify(cfg));
    flashSaved();
  } catch (e) {
    setError(e.message);
  }
};
```

**UI Update:**
- Each field row now includes delete button alongside status buttons
- Delete button appears as 🗑️ emoji with red color
- Confirmation before deletion prevents accidental removal

### 2. Frontend - API Service (`fieldConfigApi.js`)
**Location:** `frontend/src/services/fieldConfigApi.js`

**Changes:**
- Added `deleteFieldFromCategory(hddType, fieldKey)` function
- Makes DELETE request to `/api/field-config/field/:hddType/:fieldKey`
- Properly URL-encodes parameters for safe transmission

**Code Addition:**
```javascript
deleteFieldFromCategory: async (hddType, fieldKey) => {
  const res = await fetch(`${BASE_URL}/field-config/field/${encodeURIComponent(hddType)}/${encodeURIComponent(fieldKey)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`Failed to delete field from category: ${res.statusText}`);
  return res.json();
},
```

### 3. Backend - Delete Endpoint (`fieldConfig.js`)
**Location:** `backend/src/routes/fieldConfig.js`

**Changes:**
- Added `DELETE /api/field-config/field/:hddType/:fieldKey` endpoint
- Requires admin role (via `requireMinRole('admin')`)
- Sets field status to 'hidden' rather than deleting (soft delete approach)
- Uses INSERT...ON CONFLICT to handle cases where field_config doesn't exist yet
- Logs deletion action via audit trail

**Code Addition:**
```javascript
router.delete(
  '/field/:hddType/:fieldKey',
  requireMinRole('admin'),
  auditLog('delete_field_from_category', 'field_config'),
  async (req, res) => {
    try {
      const hddType = decodeURIComponent(req.params.hddType);
      const fieldKey = decodeURIComponent(req.params.fieldKey);

      // First, try to update existing config to 'hidden'
      let result = await query(
        `UPDATE field_configs 
         SET field_status = 'hidden', updated_at = NOW()
         WHERE hdd_type = $1 AND field_key = $2 
         RETURNING *`,
        [hddType, fieldKey]
      );

      // If no existing config, create a new one with 'hidden' status
      if (!result.rows.length) {
        result = await query(
          `INSERT INTO field_configs (hdd_type, field_key, field_status)
           VALUES ($1, $2, 'hidden')
           ON CONFLICT (hdd_type, field_key) 
           DO UPDATE SET field_status = 'hidden', updated_at = NOW()
           RETURNING *`,
          [hddType, fieldKey]
        );
      }

      res.json({ message: 'Field removed from category', hddType, fieldKey, status: 'hidden' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);
```

## Behavior

### Before Deletion
- User sees all available fields for a category with status (Mandatory/Optional/Hidden)
- Fields are displayed in Add Stock form for that category

### After Deletion
- Field status changes to 'Hidden' 
- Field appears with strikethrough in HddFieldConfigManager settings
- Field is filtered out from Add Stock form (schema query excludes hidden fields)
- Configuration persists in database
- Survives logout/login cycles

### Restoring Deleted Field
- Click field name in HddFieldConfigManager
- Select 'Optional' or 'Mandatory' status
- Field is restored to form with selected status

## Persistence Architecture

1. **Database Layer:** `field_configs` table stores per-category field statuses
   - Unique constraint: `(hdd_type, field_key)`
   - Soft delete: Set status to 'hidden' instead of row deletion

2. **Backend:** GET `/api/field-config` returns all configurations
   - Schema query filters with `COALESCE(fc.field_status, 'optional') != 'hidden'`
   - Hidden fields excluded from Add Stock form

3. **Frontend:** Dual persistence strategy
   - Primary: API/Database (persists across sessions)
   - Secondary: localStorage cache (offline access)
   - Automatic sync on component mount

4. **Session Persistence:** Survives across multiple logout/login cycles
   - All changes stored in PostgreSQL database
   - No client-side cleanup on logout

## Usage

### For Administrators

**To delete/hide a field from a category:**
1. Go to Settings → Field Config
2. Select the inventory category (WD 3.5", PCB, SSD, etc.)
3. Click the 🗑️ button next to the field you want to remove
4. Confirm deletion in dialog
5. Field is immediately hidden from Add Stock form for that category

**To restore a field:**
1. In HddFieldConfigManager, field shows with strikethrough
2. Click field name or select status button
3. Choose 'Optional' or 'Mandatory'
4. Field is restored to form

## Testing Checklist

- [x] Delete button appears for each field
- [x] Confirmation dialog works
- [x] Field status set to 'hidden' in database
- [x] Field hidden from inventory form
- [x] Field shows with strikethrough in settings
- [x] Changes persist after logout/login
- [x] Can restore field by setting status
- [x] Works for all inventory categories
- [x] Audit log captures deletion action
- [x] Stock number field is required (not auto-generated)

## Notes

- Stock number auto-generation was already disabled (manual entry required)
- Delete is soft-delete (reversible by changing status back to optional/mandatory)
- Field deletion is per-category (deleting from "WD 3.5"" doesn't affect "Seagate 3.5"")
- Admin role required for deletion (same as other field config changes)
- All changes logged to audit trail for compliance
