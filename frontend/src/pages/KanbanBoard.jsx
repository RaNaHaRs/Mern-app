import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { casesApi } from '../services/api';
import { useAuth } from '../store/AuthContext';
import './KanbanBoard.css';

const STAGES = ['received', 'in_progress', 'completed', 'delivered'];

const STAGE_LABELS = {
  received: 'Received',
  in_progress: 'In Progress',
  completed: 'Completed',
  delivered: 'Delivered',
};

const STAGE_MAP = {
  received: 'received',
  in_progress: 'recovery_in_progress',
  completed: 'completed',
  delivered: 'delivered',
};

const REVERSE_STAGE_MAP = {
  received: 'received',
  inspection: 'in_progress',
  diagnosis: 'in_progress',
  quotation: 'in_progress',
  approved: 'in_progress',
  recovery_in_progress: 'in_progress',
  imaging: 'in_progress',
  data_extraction: 'in_progress',
  verification: 'in_progress',
  completed: 'completed',
  delivered: 'delivered',
  failed: 'completed',
  rejected: 'in_progress',
};

const STAGE_COLORS = {
  received: '#3b82f6',
  in_progress: '#f59e0b',
  completed: '#22c55e',
  delivered: '#8b5cf6',
};

function StageTag({ stage }) {
  const label = stage?.replace(/_/g, ' ');
  return (
    <span style={{
      fontSize: '0.6rem',
      padding: '2px 6px',
      borderRadius: 4,
      background: 'rgba(255,255,255,0.08)',
      color: 'var(--text-muted)',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }}>
      {label}
    </span>
  );
}

// Standalone Kanban used at /kanban route — fetches its own data
export default function KanbanBoard({ cases: propCases, onStageChange: propOnStageChange }) {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const isStandalone = !propCases;

  const [cases, setCases] = useState(propCases || []);
  const [loading, setLoading] = useState(isStandalone);
  const [dragOverStage, setDragOverStage] = useState(null);

  const fetchCases = useCallback(async () => {
    if (!isStandalone) return;
    setLoading(true);
    try {
      const data = await casesApi.list({ limit: 1000, sort: 'created_at', order: 'desc' });
      setCases(data.cases || []);
    } catch (err) {
      console.error('KanbanBoard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [isStandalone]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  // Keep in sync when propCases changes (embedded in CasesPage)
  useEffect(() => {
    if (!isStandalone) setCases(propCases || []);
  }, [propCases, isStandalone]);

  const handleDragStart = (e, caseId) => {
    e.dataTransfer.setData('caseId', caseId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e, stage) => {
    e.preventDefault();
    setDragOverStage(null);
    const caseId = e.dataTransfer.getData('caseId');
    if (!caseId) return;
    const targetStage = STAGE_MAP[stage];

    if (propOnStageChange) {
      propOnStageChange(caseId, targetStage);
    } else {
      const prevCases = cases;
      // Optimistic update
      setCases(prev =>
        prev.map(c => c.id === caseId ? { ...c, stage: targetStage } : c)
      );
      try {
        await casesApi.transition(caseId, { stage: targetStage });
        fetchCases();
      } catch (err) {
        // Roll back optimistic update
        setCases(prevCases);
        const msg = err?.data?.error || err?.message || 'Failed to update stage';
        alert(msg);
      }
    }
  };

  const handleDragOver = (e, stage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  // Backend already filters to assigned cases for engineers — trust the API result
  const isEngineer = !isAdmin && user?.role !== 'admin' && user?.role !== 'super_admin';
  const visibleCases = cases;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 80 }}>
        <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
      </div>
    );
  }

  return (
    <div>
      {isStandalone && (
        <div className="page-header">
          <div className="page-header-left">
            <h2>Cases Progress</h2>
            <p>
              {visibleCases.length === 0
                ? isEngineer ? 'No cases assigned to you yet' : 'No cases found'
                : `${visibleCases.length} ${isEngineer ? 'assigned' : 'total'} case${visibleCases.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
      )}
      <div className="kanban-board">
        {STAGES.map(stage => {
          const stageCases = visibleCases.filter(c => REVERSE_STAGE_MAP[c.stage] === stage);
          const isDragTarget = dragOverStage === stage;
          return (
            <div
              key={stage}
              className="kanban-column"
              onDragOver={(e) => handleDragOver(e, stage)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage)}
              style={{
                border: isDragTarget
                  ? `2px solid ${STAGE_COLORS[stage]}`
                  : '2px solid transparent',
                transition: 'border-color 0.15s',
                borderRadius: 8,
              }}
            >
              <div className="kanban-column-header" style={{ borderBottom: `2px solid ${STAGE_COLORS[stage]}`, marginBottom: 10, paddingBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {STAGE_LABELS[stage]}
                </span>
                <span style={{ marginLeft: 8, background: STAGE_COLORS[stage] + '22', color: STAGE_COLORS[stage], borderRadius: 999, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                  {stageCases.length}
                </span>
              </div>
              <div className="kanban-cases">
                {stageCases.map(c => (
                  <div
                    key={c.id}
                    className="kanban-card"
                    draggable
                    onDragStart={(e) => handleDragStart(e, c.id)}
                    onClick={() => navigate(`/cases/${c.id}`)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <strong style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>{c.case_number}</strong>
                      <StageTag stage={c.stage} />
                    </div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 4 }}>
                      {c.device_brand} {c.device_model}
                    </div>
                    {c.first_name && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                        {c.first_name} {c.last_name}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                      {c.priority && (
                        <span className={`badge badge-p${c.priority}`} style={{ fontSize: '0.6rem' }}>
                          P{c.priority}
                        </span>
                      )}
                      {c.engineer_name && (
                        <div style={{
                          fontSize: '0.65rem',
                          color: 'var(--accent-primary)',
                          background: 'rgba(0,212,255,0.08)',
                          border: '1px solid rgba(0,212,255,0.2)',
                          padding: '1px 6px',
                          borderRadius: 4,
                          fontWeight: 600,
                        }}>
                          {c.engineer_name}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {stageCases.length === 0 && (
                  <div style={{
                    textAlign: 'center',
                    padding: '20px 10px',
                    color: 'var(--text-muted)',
                    fontSize: '0.72rem',
                    border: '1px dashed var(--border-subtle)',
                    borderRadius: 6,
                    opacity: 0.6,
                  }}>
                    Drop cases here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
