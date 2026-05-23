# Dynamic HDD Field Configuration System - Implementation Guide

## Overview
This system allows you to dynamically configure which fields appear in the "New Case" form for each HDD type. Fields can be marked as mandatory, optional, or hidden, and you can add custom fields specific to your lab's needs.

## What's New

### 1. **Database Schema** (`add_field_config_schema.sql`)
New tables added to store field configurations persistently:
- `field_configs` - Track status of standard HDD fields (mandatory/optional/hidden)
- `custom_fields` - Store custom fields added for each HDD type
- `case_custom_field_values` - Store custom field values for each case
- `hdd_field_mappings` - Metadata for all standard HDD fields
- `section_configs` - Enable/disable form sections (Image Upload, Diagnosis, Quotation)

### 2. **Backend Routes** (`routes/fieldConfig.js`)
New API endpoints for managing field configurations:

```
GET /api/field-config
- Fetches all field configurations (standard + custom, sections)

PUT /api/field-config/field
- Update status of a standard field (mandatory/optional/hidden)
- Body: { hddType, fieldKey, status }

POST /api/field-config/custom
- Add a new custom field
- Body: { hddType, fieldLabel, fieldType, isMandatory }

DELETE /api/field-config/custom/:id
- Remove a custom field (soft delete)

PUT /api/field-config/section/:sectionKey
- Toggle section visibility
- Body: { isEnabled }

GET /api/field-config/schema/:hddType
- Get complete field schema for an HDD type
- Returns: { standardFields, customFields }
```

### 3. **Frontend Service** (`services/fieldConfigApi.js`)
JavaScript service layer for API communication with methods:
- `getConfig()` - Fetch all configurations
- `getSchema(hddType)` - Get schema for specific HDD type
- `updateFieldStatus(hddType, fieldKey, status)` - Update field visibility
- `addCustomField(hddType, fieldLabel, fieldType, isMandatory)` - Add custom field
- `deleteCustomField(fieldId)` - Remove custom field
- `toggleSection(sectionKey, isEnabled)` - Toggle section visibility
- `syncFromLocalStorage()` - Migrate localStorage config to database
- `loadToLocalStorage()` - Load config from database for offline access

### 4. **Improved HDD Fields Component** (`HddFieldsImproved.jsx`)
New React component that:
- Loads field configuration from database
- Respects mandatory/optional/hidden statuses
- Renders custom fields dynamically
- Handles different field types (text, textarea, date, number, checkbox, select)
- Falls back to localStorage if database is unavailable

### 5. **Updated Case Creation** (`routes/cases.js`)
Modified POST /api/cases endpoint to:
- Accept `customFields` object with field IDs and values
- Save custom field values to `case_custom_field_values` table after case creation
- Maintain backward compatibility with existing case fields

## Integration Steps

### Step 1: Update Database Schema
```bash
# Run the schema migration
psql -U postgres -d recoverlab_crm -f backend/src/db/add_field_config_schema.sql
```

### Step 2: Install Backend Route
Add to `backend/src/index.js` or main app file:
```javascript
const fieldConfigRouter = require('./routes/fieldConfig');
app.use('/api/field-config', fieldConfigRouter);
```

### Step 3: Update Frontend Service Imports
Make sure `fieldConfigApi` is imported in SettingsPage:
```javascript
import { fieldConfigApi } from '../services/fieldConfigApi';
```

### Step 4: Replace HDD Fields Component in NewCaseModal
Replace the old `HddFields` component with `HddFieldsImproved`:
```javascript
// OLD:
// import HddFields from './HddFields';
// <HddFields hddKey={form.hdd_type} form={form} setForm={setForm} />

// NEW:
import { HddFieldsImproved } from './HddFieldsImproved';
const [customFieldValues, setCustomFieldValues] = useState({});
// <HddFieldsImproved hddKey={form.hdd_type} form={form} setForm={setForm} 
//   customFieldValues={customFieldValues} setCustomFieldValues={setCustomFieldValues} />
```

### Step 5: Pass Custom Fields to Case Creation API
When submitting the new case form:
```javascript
const caseData = {
  client_id: form.client_id,
  device_brand: form.device_brand,
  // ... other fields ...
  customFields: customFieldValues,  // NEW: Include custom field values
};

const result = await casesApi.create(caseData);
```

## Using the Field Configuration Manager

### In Settings > Field Config:

1. **Select HDD Type**: Choose which HDD type to configure (WD 2.5", WD 3.5", Seagate 2.5", etc.)

2. **Configure Standard Fields**:
   - Click buttons to change field status: Mandatory, Optional, Hidden
   - Mandatory fields: Required when creating a case
   - Optional fields: Can be left blank
   - Hidden fields: Won't appear in the form

3. **Add Custom Fields**:
   - Enter custom field label (e.g., "Warranty Status", "RMA Number")
   - Click "+ Add" to create
   - Custom fields appear as "✦ [Label]" in the form

4. **Remove Custom Fields**:
   - Click "✕ Remove" button next to the custom field
   - Removes the field definition (existing case data preserved)

5. **Toggle Form Sections**:
   - Enable/disable Image Upload section
   - Enable/disable Diagnosis field
   - Enable/disable Quotation section

## Configuration Persistence

### Local Storage (Legacy)
- Settings are cached in localStorage for offline access
- Key: `crm_field_config`
- Syncs automatically to database when changes are made

### Database (Recommended)
- All configurations stored in PostgreSQL
- Ensures consistency across team members
- Changes reflect immediately in new case form
- Custom field values stored per case

## Field Types for Custom Fields

When adding custom fields, available types are:
- `text` - Single line text input
- `textarea` - Multi-line text input
- `date` - Date picker
- `number` - Numeric input
- `checkbox` - True/false toggle
- `select` - Dropdown (extensible in future)

## Data Flow

```
Settings Page
    ↓
    └─→ HddFieldConfigManager
            ↓
            └─→ fieldConfigApi.updateFieldStatus()
                └─→ POST /api/field-config/field
                    └─→ Database: field_configs table

New Case Form
    ↓
    └─→ NewCaseModal
            ↓
            └─→ HddFieldsImproved (loads schema via fieldConfigApi)
                ├─→ GET /api/field-config/schema/:hddType
                └─→ Renders standard + custom fields based on status
                    ↓
                    └─→ User fills form with custom field values
                        ↓
                        └─→ Submit: POST /api/cases
                            ├─→ Save case in cases table
                            └─→ Save custom field values in case_custom_field_values table
```

## Backward Compatibility

- Old localStorage configuration continues to work
- `syncFromLocalStorage()` method migrates legacy config to database
- Both localStorage and database can coexist
- Frontend prefers database when available, falls back to localStorage

## Example Configuration

### WD 2.5" HDD Type Configuration:
```json
{
  "standardFields": [
    { "field_key": "serial_number", "status": "mandatory" },
    { "field_key": "model", "status": "mandatory" },
    { "field_key": "manufacture_date", "status": "optional" },
    { "field_key": "pcb_number", "status": "hidden" }
  ],
  "customFields": [
    { "id": "cf_warranty_status", "label": "Warranty Status", "type": "text" },
    { "id": "cf_rma_number", "label": "RMA Number", "type": "text", "isMandatory": true }
  ]
}
```

## Troubleshooting

### Fields not showing in New Case form?
1. Check if field status is set to "hidden"
2. Verify database permissions
3. Check browser console for errors
4. Try clearing localStorage and reloading

### Custom fields not saving?
1. Verify `case_custom_field_values` table exists
2. Check case_id and custom_field_id are valid UUIDs
3. Ensure user has 'staff' or higher role

### Configuration not syncing?
1. Verify database connection
2. Check `/api/field-config` endpoint is registered
3. Review network tab in browser DevTools
4. Check backend logs for errors

## Future Enhancements

- [ ] Reorder fields via drag-and-drop
- [ ] Field type templates (dropdown options)
- [ ] Export/import configurations
- [ ] Per-user field visibility preferences
- [ ] Field validation rules
- [ ] Conditional field display (show field A if field B = value)

## Support

For issues or questions, check:
- Backend logs: `npm run dev` output
- Browser console: F12 → Console tab
- Network tab: F12 → Network → field-config requests
- Database: Query `field_configs` and `custom_fields` tables directly
