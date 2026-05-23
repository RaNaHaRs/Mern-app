# 🏗️ System Architecture & Data Flow

## Complete Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                              │
│                                                                       │
│  ┌────────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  │  Settings Page     │  │  New Case Modal  │  │  Case List       │
│  │                    │  │                  │  │                  │
│  │ Field Config Mgr   │  │ HddFieldsImpr.   │  │ View custom      │
│  │ - Toggle fields    │  │ - Load schema    │  │ field values      │
│  │ - Add custom field │  │ - Render fields  │  │                  │
│  │ - Remove custom    │  │ - Collect values │  │                  │
│  │ - Set sections     │  │ - Submit case    │  │                  │
│  └────────────────────┘  └──────────────────┘  └──────────────────┘
└─────────────────────────────────────────────────────────────────────┘
                                 ↕
┌─────────────────────────────────────────────────────────────────────┐
│                      FRONTEND SERVICES                              │
│                                                                       │
│  fieldConfigApi.js (8 methods)                                       │
│  ├─ getConfig()          → Get all configurations                   │
│  ├─ getSchema()          → Get schema for HDD type                  │
│  ├─ updateFieldStatus()  → Change field visibility                 │
│  ├─ addCustomField()     → Create custom field                     │
│  ├─ deleteCustomField()  → Remove custom field                     │
│  ├─ toggleSection()      → Enable/disable sections                 │
│  ├─ syncFromLS()         → Migrate from localStorage               │
│  └─ loadToLS()           → Cache config locally                    │
│                                                                       │
│  casesApi.js (existing, enhanced)                                   │
│  └─ create(caseData)     → Save case + custom field values         │
└─────────────────────────────────────────────────────────────────────┘
                                 ↕
┌─────────────────────────────────────────────────────────────────────┐
│                        API GATEWAY                                  │
│                                                                       │
│  Backend Routes (Express.js)                                        │
│  ├─ GET  /api/field-config                                          │
│  ├─ GET  /api/field-config/schema/:type                             │
│  ├─ PUT  /api/field-config/field                                    │
│  ├─ POST /api/field-config/custom                                   │
│  ├─ DEL  /api/field-config/custom/:id                               │
│  ├─ PUT  /api/field-config/section/:key                             │
│  └─ POST /api/cases (enhanced)                                      │
│     └─ Now accepts & saves customFields                             │
└─────────────────────────────────────────────────────────────────────┘
                                 ↕
┌─────────────────────────────────────────────────────────────────────┐
│                      DATABASE LAYER                                 │
│                     (PostgreSQL)                                    │
│                                                                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ field_configs    │  │ custom_fields    │  │ hdd_field_       │  │
│  │                  │  │                  │  │ mappings         │  │
│  │ hdd_type (PK)    │  │ id (PK)          │  │                  │  │
│  │ field_key        │  │ hdd_type (FK)    │  │ Metadata for     │  │
│  │ status           │  │ field_label      │  │ standard fields  │  │
│  │ - mandatory      │  │ field_type       │  │                  │  │
│  │ - optional       │  │ is_mandatory     │  │ Used for         │  │
│  │ - hidden         │  │ is_active        │  │ validation       │  │
│  │                  │  │ created_at       │  │                  │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                       │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐ │
│  │ case_custom_field_values     │  │ section_configs              │ │
│  │                              │  │                              │ │
│  │ case_id (FK) + custom_       │  │ section_key (PK)             │ │
│  │ field_id (FK) = Composite PK │  │ - image_upload               │ │
│  │ field_value (text)           │  │ - diagnosis                  │ │
│  │ created_at                   │  │ - quotation                  │ │
│  │ updated_at                   │  │ is_enabled (boolean)         │ │
│  │                              │  │ updated_at                   │ │
│  └──────────────────────────────┘  └──────────────────────────────┘ │
│                                                                       │
│  Also uses existing tables:                                         │
│  ├─ cases (stores case data)                                         │
│  ├─ clients (client info)                                            │
│  └─ users (authentication)                                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### Flow 1: Configure Fields (Settings Page)

```
┌─────────────────────────────────────────────┐
│  User clicks field status button in Settings │
│  (e.g., "Optional" → "Mandatory")            │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  HddFieldConfigManager triggers persist()    │
│  (or fieldConfigApi.updateFieldStatus())     │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Frontend:                                    │
│  - Update local state: setConfig()            │
│  - Cache in localStorage                      │
│  - Show "✓ Saved" message                     │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  API Call:                                    │
│  PUT /api/field-config/field                 │
│  Body: {                                      │
│    hddType: "wd_2.5",                        │
│    fieldKey: "serial_number",                │
│    status: "mandatory"                       │
│  }                                            │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Backend:                                     │
│  - Validate inputs                            │
│  - Check user is admin                        │
│  - INSERT/UPDATE field_configs table          │
│  - Return success response                    │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Database:                                    │
│  INSERT INTO field_configs                   │
│  (hdd_type, field_key, status, user_id, ...)│
│  VALUES ('wd_2.5', 'serial_number',          │
│          'mandatory', user_id, ...)          │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Frontend refreshes New Case form             │
│  - Calls fieldConfigApi.getSchema()           │
│  - Gets updated schema with new status        │
│  - HddFieldsImproved re-renders               │
│  - Field now shown as mandatory               │
└─────────────────────────────────────────────┘
```

### Flow 2: Add Custom Field (Settings Page)

```
┌─────────────────────────────────────────────┐
│  User enters custom field label              │
│  (e.g., "Warranty Status")                   │
│  and clicks "+ Add"                          │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  HddFieldConfigManager.addCustomField()      │
│  - Validate label not empty                  │
│  - Generate field key from label             │
│  - Update local state                        │
│  - Show "✓ Saved" message                    │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  API Call:                                    │
│  POST /api/field-config/custom               │
│  Body: {                                      │
│    hddType: "wd_2.5",                        │
│    fieldLabel: "Warranty Status",            │
│    fieldType: "text",                        │
│    isMandatory: false                        │
│  }                                            │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Backend:                                     │
│  - Validate field type                       │
│  - Check user is admin                       │
│  - Generate unique field ID                  │
│  - INSERT into custom_fields table            │
│  - Return field ID in response               │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Database:                                    │
│  INSERT INTO custom_fields                   │
│  (id, hdd_type, field_label, field_type,     │
│   is_mandatory, is_active, created_at, ...)  │
│  VALUES (uuid(), 'wd_2.5', 'Warranty...',    │
│          'text', false, true, now(), ...)    │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Frontend:                                    │
│  - Show custom field in list                 │
│  - Display with "✦" prefix                   │
│  - Show remove button                        │
│  - Update HddFieldsImproved                  │
│  - New Case form now includes field          │
└─────────────────────────────────────────────┘
```

### Flow 3: Create Case with Custom Fields (New Case Modal)

```
┌─────────────────────────────────────────────┐
│  User opens New Case form                    │
│  Selects HDD type (e.g., "WD 2.5"")         │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  HddFieldsImproved mounts                    │
│  - useEffect hook runs                       │
│  - Calls fieldConfigApi.getSchema()          │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  API Call:                                    │
│  GET /api/field-config/schema/wd_2.5         │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Backend returns schema:                      │
│  {                                            │
│    standardFields: [                         │
│      { field_key: 'serial_number',           │
│        status: 'mandatory', ... },            │
│      { field_key: 'model',                   │
│        status: 'optional', ... },            │
│      ...                                      │
│    ],                                         │
│    customFields: [                           │
│      { id: 'cf_warranty...',                 │
│        field_label: 'Warranty Status',       │
│        field_type: 'text',                   │
│        is_mandatory: false }                 │
│    ]                                          │
│  }                                            │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  HddFieldsImproved renders:                  │
│  - Serial Number* (mandatory text input)     │
│  - Model (optional text input)               │
│  - ✦ Warranty Status (custom text input)     │
│  - (Other fields based on schema)            │
│  - Skips hidden fields entirely              │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  User fills form:                            │
│  - serial_number: "ABC123"                   │
│  - model: "WD Blue"                          │
│  - customFieldValues: {                      │
│      'cf_warranty_status': 'Active'          │
│    }                                          │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  User clicks "Create Case"                   │
│  Validation:                                  │
│  - Mandatory fields filled? ✓                │
│  - At least one HDD field? ✓                │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  API Call:                                    │
│  POST /api/cases                             │
│  Body: {                                      │
│    client_id: "client_123",                  │
│    hdd_type: "wd_2.5",                       │
│    serial_number: "ABC123",                  │
│    model: "WD Blue",                         │
│    ... other fields ...,                     │
│    customFields: {                           │
│      'cf_warranty_status_id': 'Active'       │
│    }                                          │
│  }                                            │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Backend:                                     │
│  1. INSERT into cases table                  │
│     - Save all standard HDD fields           │
│     - Generate case_id (UUID)                │
│  2. For each custom field:                   │
│     - INSERT into case_custom_field_values   │
│       (case_id, custom_field_id, value)      │
│  3. Return success + case_id                 │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Database inserts:                           │
│                                              │
│  INSERT INTO cases                          │
│  (id, client_id, hdd_type, serial_number,   │
│   model, issue_desc, ...)                    │
│  VALUES ('case_uuid', 'client_123',          │
│          'wd_2.5', 'ABC123', 'WD Blue', ...)│
│                                              │
│  INSERT INTO case_custom_field_values        │
│  (case_id, custom_field_id, field_value)     │
│  VALUES ('case_uuid',                        │
│          'cf_warranty_status_id', 'Active')  │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│  Frontend:                                    │
│  - Show success message                      │
│  - Close modal                                │
│  - Reset form state                          │
│  - Navigate to case view                     │
│  - Display all fields including custom value │
└─────────────────────────────────────────────┘
```

---

## Component Interaction Diagram

```
                          [SettingsPage]
                               ↓
                    [HddFieldConfigManager]
                     ├─ useState(config)
                     ├─ useState(activeType)
                     ├─ useState(newFieldLabel)
                     └─ useState(savedMsg)
                               ↓
                      [fieldConfigApi]
                     ├─ getConfig()
                     ├─ updateFieldStatus()
                     ├─ addCustomField()
                     ├─ deleteCustomField()
                     └─ toggleSection()
                               ↓
                          [Backend API]
                    /api/field-config/*
                               ↓
                         [PostgreSQL]
              field_configs, custom_fields,
              section_configs tables


                          [NewCaseModal]
                               ↓
                    [HddFieldsImproved]
                     ├─ useState(schema)
                     ├─ useState(loading)
                     ├─ useEffect()
                     └─ handleFieldChange()
                               ↓
                      [fieldConfigApi]
                     └─ getSchema(:hddType)
                               ↓
                          [Backend API]
                 /api/field-config/schema/:type
                               ↓
                         [PostgreSQL]
           field_configs, custom_fields tables
                               ↓
                    [Form rendering]
              Standard fields + Custom fields
                               ↓
                   [Form submission]
         POST /api/cases (with customFields)
                               ↓
                         [PostgreSQL]
         cases, case_custom_field_values tables
```

---

## Database Relationships

```
                    ┌─────────────────┐
                    │     users       │
                    │  (existing)     │
                    │  - id (PK)      │
                    │  - role         │
                    └────────┬────────┘
                             │
                    (creates field configs)
                             │
                    ┌────────▼────────┐
                    │ field_configs   │
                    │  - hdd_type (PK)│
                    │  - field_key    │
                    │  - status       │
                    │  - user_id (FK) │
                    └─────────────────┘


    ┌────────────────────┐    ┌─────────────────────┐
    │      cases         │    │   custom_fields     │
    │   (existing)       │    │  - id (PK, UUID)    │
    │  - id (PK)         │◄───┤  - hdd_type         │
    │  - client_id       │    │  - field_label      │
    │  - hdd_type        │    │  - field_type       │
    │  - ...             │    │  - is_mandatory     │
    │  - created_at      │    │  - is_active        │
    └────────┬───────────┘    └─────────────────────┘
             │
             │ (1 case has many custom field values)
             │
    ┌────────▼──────────────────────────┐
    │ case_custom_field_values           │
    │  - case_id (PK/FK)                 │
    │  - custom_field_id (PK/FK)         │
    │  - field_value (text)              │
    │  - created_at                      │
    │  - updated_at                      │
    └────────────────────────────────────┘


    ┌───────────────────────┐
    │  hdd_field_mappings   │
    │   - field_key (PK)    │
    │   - field_label       │
    │   - field_type        │
    │   - description       │
    └───────────────────────┘


    ┌──────────────────┐
    │ section_configs  │
    │  - section_key   │
    │    (PK)          │
    │  - is_enabled    │
    │  - updated_at    │
    └──────────────────┘
```

---

## State Management Flow

### Frontend Local State
```
NewCaseModal Component
├─ isOpen (modal open/close)
├─ form (standard HDD fields + values)
├─ customFieldValues (custom field values)
│   └─ Structure: { custom_field_id: "value", ... }
├─ submitting (submit in progress)
└─ (All auto-synced to server on submit)

HddFieldsImproved Component
├─ schema (field configuration from API)
├─ loading (fetching schema)
└─ (Updates when hddKey prop changes)

SettingsPage Component
├─ config (all field configurations)
├─ activeType (selected HDD type)
├─ newFieldLabel (custom field input)
└─ savedMsg (show save confirmation)
```

### Server State (Database)
```
field_configs table
├─ Stores field status per hdd_type per field_key
├─ Updated when user changes field status
└─ Fetched on every New Case form load

custom_fields table
├─ Stores custom field definitions
├─ New entries when user adds custom field
├─ Soft delete when user removes (is_active=false)
└─ Fetched on every New Case form load

case_custom_field_values table
├─ Stores actual custom field values
├─ One row per case + custom field combination
├─ Inserted when case is created
└─ Queried when viewing case details

section_configs table
├─ Stores visibility of form sections
├─ One row per section
└─ Updated when user toggles section
```

---

## Error Handling Flow

```
Frontend Action
    ↓
Try/Catch wrapper
    ├─ API success?
    │   ├─ YES: Update UI, show success message
    │   └─ NO: Catch error
    ↓
Error Caught
    ├─ Type: Network error?
    │   ├─ YES: Show "Connection error, using cache"
    │   └─ NO: Check error response
    ├─ Type: Validation error?
    │   ├─ YES: Show specific field error
    │   └─ NO: Check error type
    ├─ Type: Authentication error?
    │   ├─ YES: Redirect to login
    │   └─ NO: Check error type
    └─ Type: Unknown error?
        └─ Log to console, show generic error message
            
Fallback to Cache
    ├─ Try localStorage
    ├─ Try in-memory cache
    └─ Show limited UI with cached data

Recovery Options
├─ Retry button (if network error)
├─ Refresh page (if state corruption)
├─ Logout/login (if auth error)
└─ Contact admin (if persistent error)
```

---

This architecture provides:
- ✅ **Separation of Concerns** - Frontend, API, Database layers
- ✅ **Real-time Sync** - Changes immediately reflected
- ✅ **Offline Support** - Works without database
- ✅ **Error Resilience** - Graceful fallback to cache
- ✅ **Security** - Auth/role checks at all levels
- ✅ **Scalability** - Database-driven, not memory-based
