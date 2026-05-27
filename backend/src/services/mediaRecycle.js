const { query } = require('../config/database');

const SOURCE_LABELS = {
  case_solution_media: 'Case Solution',
  case_images: 'Case Device Photo',
  inventory_images: 'Inventory',
  knowledge_base: 'Knowledge Base',
};

async function getCaseLabel(caseId) {
  const r = await query('SELECT case_number FROM cases WHERE id = $1', [caseId]);
  return r.rows[0]?.case_number || String(caseId);
}

async function getInventoryLabel(itemId) {
  const r = await query(
    'SELECT stock_number, sku, model, name FROM inventory_items WHERE id = $1',
    [itemId]
  );
  const row = r.rows[0];
  if (!row) return String(itemId);
  return row.stock_number || row.sku || row.model || row.name || String(itemId);
}

async function archiveMediaRow({
  row,
  sourceModule,
  parentType,
  parentId,
  parentLabel,
  user,
  metadata = {},
}) {
  const sourceLabel = SOURCE_LABELS[sourceModule] || sourceModule;
  const tenantId = row.tenant_id || user?.tenant_id || user?.tenant_owner_id || (user?.role === 'super_admin' ? null : user?.id) || null;
  const result = await query(
    `INSERT INTO media_recycle_bin (
      tenant_id,
      original_id, source_module, source_label, parent_type, parent_id, parent_label,
      name, mime_type, data, size, caption, metadata, uploaded_by, deleted_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING id`,
    [
      tenantId,
      String(row.id),
      sourceModule,
      sourceLabel,
      parentType,
      String(parentId),
      parentLabel || null,
      row.name,
      row.mime_type || row.mimeType || null,
      row.data,
      row.size || null,
      row.caption || null,
      JSON.stringify(metadata),
      row.uploaded_by || null,
      user?.id || null,
    ]
  );
  return result.rows[0]?.id;
}

async function listMediaRecycle({ page = 1, limit = 50, source, user } = {}) {
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const params = [];
  let where = 'WHERE 1=1';
  if (user?.role !== 'super_admin') {
    params.push(user?.tenant_id || user?.tenant_owner_id || user?.id || null);
    where += ` AND mrb.tenant_id = $${params.length}`;
  }
  if (source) {
    params.push(source);
    where += ` AND mrb.source_module = $${params.length}`;
  }
  const countRes = await query(`SELECT COUNT(*) FROM media_recycle_bin mrb ${where}`, params);
  params.push(parseInt(limit, 10), offset);
  const result = await query(
    `SELECT mrb.*, u.username AS deleted_by_name
     FROM media_recycle_bin mrb
     LEFT JOIN users u ON u.id = mrb.deleted_by
     ${where}
     ORDER BY mrb.deleted_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return {
    items: result.rows.map(mapRecycleRow),
    total: parseInt(countRes.rows[0].count, 10),
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };
}

function mapRecycleRow(row) {
  return {
    id: row.id,
    original_id: row.original_id,
    source_module: row.source_module,
    source_label: row.source_label,
    parent_type: row.parent_type,
    parent_id: row.parent_id,
    parent_label: row.parent_label,
    name: row.name,
    mime_type: row.mime_type,
    mimeType: row.mime_type,
    size: row.size,
    caption: row.caption,
    data: row.data,
    deleted_at: row.deleted_at,
    deleted_by: row.deleted_by,
    deleted_by_name: row.deleted_by_name,
  };
}

async function restoreMediaRecycleItem(id, user) {
  const res = await query(
    `SELECT * FROM media_recycle_bin WHERE id = $1${user?.role !== 'super_admin' ? ' AND tenant_id = $2' : ''}`,
    user?.role !== 'super_admin' ? [id, user?.tenant_id || user?.tenant_owner_id || user?.id || null] : [id]
  );
  const row = res.rows[0];
  if (!row) return null;

  const meta = row.metadata || {};
  let restoredId = row.original_id;

  if (row.source_module === 'case_solution_media') {
    const ins = await query(
      `INSERT INTO case_solution_media (id, case_id, tenant_id, name, mime_type, data, size, caption, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        row.original_id,
        row.parent_id,
        row.tenant_id,
        row.name,
        row.mime_type,
        row.data,
        row.size,
        row.caption,
        row.uploaded_by,
      ]
    );
    restoredId = ins.rows[0]?.id || row.original_id;
  } else if (row.source_module === 'case_images') {
    const ins = await query(
      `INSERT INTO case_images (id, case_id, tenant_id, name, mime_type, data, size, caption, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        row.original_id,
        row.parent_id,
        row.tenant_id,
        row.name,
        row.mime_type,
        row.data,
        row.size,
        row.caption,
        row.uploaded_by,
      ]
    );
    restoredId = ins.rows[0]?.id || row.original_id;
  } else if (row.source_module === 'inventory_images') {
    const ins = await query(
      `INSERT INTO inventory_images (id, item_id, tenant_id, name, mime_type, data, size, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [row.original_id, row.parent_id, row.tenant_id, row.name, row.mime_type, row.data, row.size, row.uploaded_by]
    );
    restoredId = ins.rows[0]?.id || row.original_id;
  } else if (row.source_module === 'knowledge_base') {
    const kbId = meta.kb_entry_id || row.parent_id;
    const fileId = meta.file_id || row.original_id;
    const kbRes = await query(
      `SELECT files FROM knowledge_base_entries WHERE id = $1${user?.role !== 'super_admin' ? ' AND tenant_id = $2' : ''}`,
      user?.role !== 'super_admin' ? [kbId, row.tenant_id] : [kbId]
    );
    if (!kbRes.rows.length) throw new Error('Knowledge base entry not found');
    const files = kbRes.rows[0].files || [];
    if (!files.some(f => String(f.id) === String(fileId))) {
      files.push({
        id: fileId,
        name: row.name,
        mimeType: row.mime_type,
        data: row.data,
        size: row.size,
        uploadedAt: meta.uploaded_at || row.deleted_at,
      });
      await query(
        `UPDATE knowledge_base_entries
         SET files = $2::jsonb, updated_at = NOW()
         WHERE id = $1${user?.role !== 'super_admin' ? ' AND tenant_id = $3' : ''}`,
        user?.role !== 'super_admin' ? [kbId, JSON.stringify(files), row.tenant_id] : [kbId, JSON.stringify(files)]
      );
    }
    restoredId = fileId;
  } else {
    throw new Error(`Unsupported media source: ${row.source_module}`);
  }

  await query(
    `DELETE FROM media_recycle_bin WHERE id = $1${user?.role !== 'super_admin' ? ' AND tenant_id = $2' : ''}`,
    user?.role !== 'super_admin' ? [id, row.tenant_id] : [id]
  );

  if (row.source_module === 'case_solution_media') {
    try {
      const solutionsRouter = require('../routes/solutions');
      await solutionsRouter.syncCaseToKnowledgeBase(row.parent_id, { id: row.deleted_by, tenant_id: row.tenant_id });
    } catch (syncErr) {
      console.warn('KB sync after media restore:', syncErr.message);
    }
  }

  return { restored_id: restoredId, source_module: row.source_module, parent_id: row.parent_id };
}

async function permanentDeleteMediaRecycleItem(id, user) {
  const result = await query(
    `DELETE FROM media_recycle_bin WHERE id = $1${user?.role !== 'super_admin' ? ' AND tenant_id = $2' : ''} RETURNING id`,
    user?.role !== 'super_admin' ? [id, user?.tenant_id || user?.tenant_owner_id || user?.id || null] : [id]
  );
  return result.rows[0]?.id || null;
}

module.exports = {
  SOURCE_LABELS,
  getCaseLabel,
  getInventoryLabel,
  archiveMediaRow,
  listMediaRecycle,
  restoreMediaRecycleItem,
  permanentDeleteMediaRecycleItem,
};
