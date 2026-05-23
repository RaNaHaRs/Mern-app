# TODO - HDD Dynamic Fields for Inventory + Transferred Items

## Phase 1 — Discovery & Contract Alignment
- [ ] Inspect existing Inventory backend routes (create/list/detail/update) to see current request/response payload shapes.
- [ ] Inspect frontend Inventory Add Item form UI and inventory detail/list rendering to find how HDD fields are currently displayed/saved.
- [ ] Inspect current field-config API usage (especially schema endpoint) and frontend component(s) that render `HddFieldsImproved`.

## Phase 2 — DB Schema for Inventory HDD Dynamic Fields
- [ ] Add DB migration for `inventory_custom_field_values` (or equivalent) and indexes.
- [ ] Ensure tenant isolation and connect to `inventory_items`.

## Phase 3 — Backend APIs for Dynamic Inventory Fields
- [ ] Update `routes/inventory.js` POST create (and update if exists) to accept `customFields` and persist them.
- [ ] Update inventory list/detail GET to include HDD dynamic field values for HDD-category items.

## Phase 4 — Frontend: Inventory Add Item + Listing/Details
- [ ] Update Inventory Add Item form to automatically show dynamic fields when `category === 'HDD`.
- [ ] Wire form state so dynamic values are posted as `customFields`.
- [ ] Update Inventory listing/cards and detail view to display saved dynamic fields.

## Phase 5 — Settings Adjustments
- [ ] Ensure Settings “HDD Fields tab” / “Field Config” drives the same backend schema used by inventory form.
- [ ] Confirm automatic “Show all HDD fields inside Field Config” requirement is satisfied (or extend UI if needed).

## Phase 6 — Transferred Items Feature
- [ ] Create DB table + migration for inventory transfers (transfers between locations; no new inventory records).
- [ ] Add backend model/controller/routes:
  - [ ] create transfer
  - [ ] list transfers (for sidebar)
  - [ ] transfer detail
- [ ] Frontend: add new “Transferred Items” sidebar section below Inventory.
- [ ] Optionally update inventory detail to show transfer history.

## Phase 7 — Fix Existing Inventory Save/Display Issues
- [ ] Identify failing/missing fields in inventory save/display paths.
- [ ] Patch while integrating dynamic fields.

## Phase 8 — Verification
- [ ] Create an HDD inventory item with multiple dynamic fields; verify persistence.
- [ ] Verify listing + detail show the saved dynamic fields.
- [ ] Create a transfer and verify sidebar + history.
- [ ] Run quick regression checks for non-HDD categories.

