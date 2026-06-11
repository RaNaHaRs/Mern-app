/**
 * Seagate Date Code Validator Hook
 * Validates YYWWD, YYWD, YWD formats
 */

import { useState, useCallback } from 'react';
import { api } from '../services/api';

export function useSeagateValidator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validation, setValidation] = useState(null);

  const validate = useCallback(async (dateCode) => {
    if (!dateCode) {
      setValidation(null);
      setError(null);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/cases/validate/seagate-date-code', {
        params: { dateCode }
      });
      
      const result = response.data;
      setValidation(result);
      
      if (!result.isValid) {
        setError(result.error || 'Invalid date code format');
      }
      
      return result;
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Validation failed';
      setError(errorMsg);
      setValidation(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    validate,
    loading,
    error,
    validation,
    isValid: validation?.isValid || false,
    perfectDate: validation?.perfectDate || null,
  };
}

export default useSeagateValidator;
