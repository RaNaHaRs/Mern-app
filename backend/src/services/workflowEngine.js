const { query, transaction } = require('../config/database');

/**
 * WORKFLOW ENGINE (Agent 3)
 * Enforces valid stage transitions and logs every action
 */

const ALL_STAGES = [
  'received', 'inspection', 'diagnosis', 'quotation',
  'approved', 'rejected', 'recovery_in_progress', 'imaging',
  'data_extraction', 'verification', 'completed', 'delivered', 'failed'
];

// Valid stage transitions (any stage can go to any stage now)
const STAGE_TRANSITIONS = {
  received: ALL_STAGES,
  inspection: ALL_STAGES,
  diagnosis: ALL_STAGES,
  quotation: ALL_STAGES,
  approved: ALL_STAGES,
  rejected: ALL_STAGES,
  recovery_in_progress: ALL_STAGES,
  imaging: ALL_STAGES,
  data_extraction: ALL_STAGES,
  verification: ALL_STAGES,
  completed: ALL_STAGES,
  delivered: ALL_STAGES,
  failed: ALL_STAGES,
};

// Roles required for each transition
const TRANSITION_PERMISSIONS = {
  received: ['admin', 'senior_engineer', 'junior_engineer', 'staff'],
  inspection: ['admin', 'senior_engineer', 'junior_engineer'],
  diagnosis: ['admin', 'senior_engineer', 'junior_engineer'],
  quotation: ['admin', 'senior_engineer', 'staff'],
  approved: ['admin', 'senior_engineer', 'staff'],
  rejected: ['admin', 'senior_engineer', 'staff'],
  recovery_in_progress: ['admin', 'senior_engineer', 'junior_engineer'],
  imaging: ['admin', 'senior_engineer', 'junior_engineer'],
  data_extraction: ['admin', 'senior_engineer', 'junior_engineer'],
  verification: ['admin', 'senior_engineer'],
  completed: ['admin', 'senior_engineer'],
  delivered: ['admin', 'senior_engineer', 'staff'],
  failed: ['admin', 'senior_engineer'],
};

async function transitionCase(caseId, toStage, engineerId, userRole, options = {}) {
  const { notes = '', timeSpentMinutes = 0, actionsPerformed = [], toolsUsed = [] } = options;

  return transaction(async (client) => {
    // Lock the row
    const caseResult = await client.query(
      'SELECT id, stage, case_number FROM cases WHERE id = $1 FOR UPDATE',
      [caseId]
    );

    if (!caseResult.rows.length) {
      throw Object.assign(new Error('Case not found'), { status: 404 });
    }

    const currentCase = caseResult.rows[0];
    const fromStage = currentCase.stage;

    // Validate transition
    const allowed = STAGE_TRANSITIONS[fromStage] || [];
    if (!allowed.includes(toStage)) {
      throw Object.assign(
        new Error(`Invalid transition: ${fromStage} → ${toStage}. Allowed: ${allowed.join(', ')}`),
        { status: 422 }
      );
    }

    // Check permissions
    const allowedRoles = TRANSITION_PERMISSIONS[toStage] || [];
    if (!allowedRoles.includes(userRole)) {
      throw Object.assign(
        new Error(`Role '${userRole}' cannot move case to stage '${toStage}'`),
        { status: 403 }
      );
    }

    // Build update object
    const updateFields = { stage: toStage };
    if (toStage === 'completed' || toStage === 'delivered') {
      updateFields.completed_at = new Date();
    }
    if (toStage === 'recovery_in_progress' || toStage === 'imaging') {
      // Assign engineer if not already assigned
      updateFields.assigned_engineer = engineerId;
    }

    // Update case
    await client.query(
      `UPDATE cases SET stage = $1, assigned_engineer = COALESCE(assigned_engineer, $2),
       completed_at = $3, updated_at = NOW()
       WHERE id = $4`,
      [toStage, engineerId, updateFields.completed_at || null, caseId]
    );

    // Log the transition
    await client.query(
      `INSERT INTO case_workflow_logs 
         (case_id, from_stage, to_stage, engineer_id, notes, time_spent_minutes, actions_performed, tools_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [caseId, fromStage, toStage, engineerId, notes, timeSpentMinutes, actionsPerformed, toolsUsed]
    );

    return {
      caseId,
      caseNumber: currentCase.case_number,
      fromStage,
      toStage,
    };
  });
}

function getAllowedTransitions(currentStage, userRole) {
  const transitions = STAGE_TRANSITIONS[currentStage] || [];
  return transitions.filter(stage => {
    const allowedRoles = TRANSITION_PERMISSIONS[stage] || [];
    return allowedRoles.includes(userRole);
  });
}

module.exports = { transitionCase, getAllowedTransitions, STAGE_TRANSITIONS };
