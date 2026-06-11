-- Verification script for custom fields setup
-- Run this in psql to check if everything is configured correctly

-- 1. Check if custom_fields table exists and has data
SELECT 'Custom Fields Table' as check_name, COUNT(*) as count FROM custom_fields;

-- 2. List all active custom fields
SELECT 'Active Custom Fields' as check_name;
SELECT id, field_label, field_key, hdd_type, field_type, is_mandatory, tenant_id, created_at
FROM custom_fields
WHERE is_active = true
ORDER BY created_at DESC;

-- 3. Check if case_custom_field_values table exists
SELECT 'Case Custom Field Values Table' as check_name, COUNT(*) as count FROM case_custom_field_values;

-- 4. Show recent case custom field values (last 10)
SELECT 'Recent Case Custom Field Values' as check_name;
SELECT ccfv.id, ccfv.case_id, cf.field_label, ccfv.field_value, ccfv.created_at
FROM case_custom_field_values ccfv
JOIN custom_fields cf ON ccfv.custom_field_id = cf.id
ORDER BY ccfv.created_at DESC
LIMIT 10;

-- 5. Check custom fields by HDD type
SELECT 'Custom Fields by HDD Type' as check_name;
SELECT hdd_type, COUNT(*) as field_count, STRING_AGG(field_label, ', ' ORDER BY field_label) as field_names
FROM custom_fields
WHERE is_active = true
GROUP BY hdd_type
ORDER BY hdd_type;

-- 6. Verify foreign key constraints
SELECT 'Foreign Key Constraints' as check_name;
SELECT constraint_name, table_name, column_name
FROM information_schema.key_column_usage
WHERE table_name IN ('case_custom_field_values', 'custom_fields')
AND constraint_name LIKE '%fk%' OR constraint_name LIKE '%references%'
ORDER BY table_name, constraint_name;

-- 7. Check for any custom fields that might have orphaned values
SELECT 'Orphaned Custom Field Values (field deleted but values remain)' as check_name;
SELECT ccfv.id, ccfv.custom_field_id, ccfv.case_id, ccfv.field_value
FROM case_custom_field_values ccfv
LEFT JOIN custom_fields cf ON ccfv.custom_field_id = cf.id
WHERE cf.id IS NULL
LIMIT 10;

-- 8. Summary statistics
SELECT 'Summary Statistics' as check_name;
SELECT 
  (SELECT COUNT(*) FROM custom_fields WHERE is_active = true) as total_active_custom_fields,
  (SELECT COUNT(*) FROM case_custom_field_values) as total_case_field_values,
  (SELECT COUNT(DISTINCT hdd_type) FROM custom_fields) as hdd_types_with_custom_fields;

-- 9. Check if tenant_id column exists on custom_fields (for multi-tenant support)
SELECT 'Tenant ID Column Check' as check_name;
SELECT 
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='custom_fields' AND column_name='tenant_id')
    THEN 'tenant_id column EXISTS'
    ELSE 'tenant_id column MISSING'
  END as status;

-- 10. Show custom fields grouped by tenant
SELECT 'Custom Fields by Tenant' as check_name;
SELECT 
  COALESCE(tenant_id::text, '(shared)') as tenant_id,
  COUNT(*) as field_count,
  STRING_AGG(DISTINCT hdd_type, ', ') as hdd_types
FROM custom_fields
WHERE is_active = true
GROUP BY tenant_id
ORDER BY tenant_id;
