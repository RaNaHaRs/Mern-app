import React, { useState, useEffect, useCallback } from 'react';
import { Autocomplete } from './FormComponents';

/**
 * ImprovedStepProblemView - Enhanced with autocomplete for problems and diagnosis
 * Uses debounced API calls to fetch suggestions from backend
 */
export function ImprovedStepProblemView({
  form,
  setForm,
  toggle,
  SYMPTOMS,
  FAILURE_TYPES_LIST,
  stepErrors,
  apiBaseUrl = '/api'
}) {
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  
  const [problemError, setProblemError] = useState(null);
  const [diagnosisError, setDiagnosisError] = useState(null);
  const [problemTouched, setProblemTouched] = useState(false);
  const [diagnosisTouched, setDiagnosisTouched] = useState(false);

  // Fetch problem suggestions from backend
  const fetchProblemSuggestions = useCallback(async (searchText, limit = 10) => {
    try {
      const response = await fetch(
        `${apiBaseUrl}/suggestions/problems?search=${encodeURIComponent(searchText)}&limit=${limit}`
      );
      if (!response.ok) throw new Error('Failed to fetch suggestions');
      return await response.json();
    } catch (err) {
      console.error('Error fetching problems:', err);
      return [];
    }
  }, [apiBaseUrl]);

  // Fetch diagnosis suggestions from backend
  const fetchDiagnosisSuggestions = useCallback(async (searchText, limit = 10) => {
    try {
      const problemCategory = form.failure_types?.[0] || '';
      const response = await fetch(
        `${apiBaseUrl}/suggestions/diagnosis?search=${encodeURIComponent(searchText)}&problemCategory=${encodeURIComponent(problemCategory)}&limit=${limit}`
      );
      if (!response.ok) throw new Error('Failed to fetch suggestions');
      return await response.json();
    } catch (err) {
      console.error('Error fetching diagnosis:', err);
      return [];
    }
  }, [apiBaseUrl, form.failure_types]);

  // Record problem to history when problem field loses focus
  useEffect(() => {
    if (problemTouched && form.problem_description && form.problem_description.trim().length > 5) {
      recordProblem();
    }
  }, [problemTouched, form.problem_description]);

  // Record diagnosis to history when field loses focus
  useEffect(() => {
    if (diagnosisTouched && form.initial_diagnosis && form.initial_diagnosis.trim().length > 5) {
      recordDiagnosis();
    }
  }, [diagnosisTouched, form.initial_diagnosis]);

  const recordProblem = async () => {
    try {
      await fetch(`${apiBaseUrl}/suggestions/problems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: form.problem_description,
          category: form.failure_types?.[0] || null,
          severity: 'medium'
        })
      });
    } catch (err) {
      console.error('Error recording problem:', err);
    }
  };

  const recordDiagnosis = async () => {
    try {
      await fetch(`${apiBaseUrl}/suggestions/diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: form.initial_diagnosis,
          problemCategory: form.failure_types?.[0] || null
        })
      });
    } catch (err) {
      console.error('Error recording diagnosis:', err);
    }
  };

  const handleProblemSelect = (suggestion) => {
    set('problem_description', suggestion.text);
    setProblemError(null);
  };

  const handleDiagnosisSelect = (suggestion) => {
    set('initial_diagnosis', suggestion.text);
    setDiagnosisError(null);
  };

  const showDiagnosis = true; // Config can be added here
  const showImages = true;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Failure Types */}
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">
          Failure Types <span style={{ color: "#ef4444", marginLeft: 6 }}>*</span>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {FAILURE_TYPES_LIST.map((ft) => {
            const on = (form.failure_types || []).includes(ft);
            return (
              <label
                key={ft}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 12px",
                  border: `1px solid ${on ? "var(--accent-primary)" : "var(--border-default)"}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  background: on ? "var(--accent-glow)" : "transparent",
                  fontSize: "0.78rem",
                  fontWeight: on ? 700 : 400,
                  color: on ? "var(--accent-primary)" : "var(--text-secondary)",
                  userSelect: "none",
                  transition: "all 0.15s"
                }}
              >
                <input
                  type="checkbox"
                  style={{ display: "none" }}
                  checked={on}
                  onChange={() => toggle("failure_types", ft)}
                />
                {on ? "✓ " : ""}
                {ft.replace(/_/g, " ")}
              </label>
            );
          })}
        </div>
        {stepErrors?.failure_types && (
          <div style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
            <span>⚠</span>
            <span>{stepErrors.failure_types}</span>
          </div>
        )}
      </div>

      {/* Symptoms */}
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">
          Symptoms <span style={{ color: "#ef4444", marginLeft: 6 }}>*</span>
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {SYMPTOMS.map((s) => {
            const on = (form.symptoms || []).includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle("symptoms", s)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 20,
                  border: `1px solid ${on ? "var(--accent-primary)" : "var(--border-default)"}`,
                  background: on ? "var(--accent-glow)" : "transparent",
                  color: on ? "var(--accent-primary)" : "var(--text-muted)",
                  fontSize: "0.72rem",
                  cursor: "pointer",
                  fontWeight: on ? 700 : 400,
                  transition: "all 0.15s"
                }}
              >
                {s.replace(/_/g, " ")}
              </button>
            );
          })}
        </div>
        {stepErrors?.symptoms && (
          <div style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
            <span>⚠</span>
            <span>{stepErrors.symptoms}</span>
          </div>
        )}
      </div>

      {/* Problem Description with Autocomplete */}
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">
          Problem Description <span style={{ color: "#ef4444", marginLeft: 6 }}>*</span>
        </label>
        <Autocomplete
          value={form.problem_description || ""}
          onChange={(val) => set("problem_description", val)}
          onSelect={handleProblemSelect}
          placeholder="Describe the problem... (autocomplete enabled)"
          fetchSuggestions={fetchProblemSuggestions}
          renderSuggestion={(suggestion) => (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <span>{suggestion.text}</span>
              {suggestion.use_count > 1 && (
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginLeft: 8 }}>
                  Used {suggestion.use_count}x
                </span>
              )}
            </div>
          )}
          minChars={3}
          debounceMs={300}
          maxSuggestions={8}
          onError={(err) => setProblemError(err)}
          className="form-group"
        />
        {problemTouched && problemError && (
          <div style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
            <span>⚠</span>
            <span>{problemError}</span>
          </div>
        )}
        {problemTouched && !form.problem_description && (
          <div style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
            <span>⚠</span>
            <span>Problem description is required</span>
          </div>
        )}
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 6 }}>
          💡 Start typing to see suggestions from previous cases
        </div>
      </div>

      {/* Initial Diagnosis with Autocomplete */}
      {showDiagnosis && (
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Initial Diagnosis / Observation</label>
          <Autocomplete
            value={form.initial_diagnosis || ""}
            onChange={(val) => set("initial_diagnosis", val)}
            onSelect={handleDiagnosisSelect}
            placeholder="Engineer's initial observations... (autocomplete enabled)"
            fetchSuggestions={fetchDiagnosisSuggestions}
            renderSuggestion={(suggestion) => (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%", gap: 8 }}>
                <span style={{ flex: 1 }}>{suggestion.text}</span>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "right", whiteSpace: "nowrap" }}>
                  {suggestion.recovery_success_rate && (
                    <div>Success: {suggestion.recovery_success_rate}%</div>
                  )}
                  {suggestion.use_count > 1 && (
                    <div>Used {suggestion.use_count}x</div>
                  )}
                </div>
              </div>
            )}
            minChars={3}
            debounceMs={300}
            maxSuggestions={8}
            onError={(err) => setDiagnosisError(err)}
            className="form-group"
          />
          {diagnosisTouched && diagnosisError && (
            <div style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
              <span>⚠</span>
              <span>{diagnosisError}</span>
            </div>
          )}
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 6 }}>
            💡 Based on selected failure type, showing relevant previous diagnoses
          </div>
        </div>
      )}

      {/* File Attachments */}
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">📎 File Attachments</label>
        <div
          style={{
            border: "2px dashed var(--border-default)",
            borderRadius: 8,
            padding: "14px",
            textAlign: "center",
            cursor: "pointer",
            color: "var(--text-muted)",
            fontSize: "0.8rem",
            transition: "border-color 0.15s"
          }}
        >
          📎 Click to attach files (PDF, ZIP, DOC, etc.)
        </div>
      </div>
    </div>
  );
}

export default ImprovedStepProblemView;
