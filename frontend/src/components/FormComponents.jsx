import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * FormField - Modern SaaS-style form field component with validation
 */
export function FormField({
  label,
  required,
  error,
  touched,
  children,
  helpText,
  variant = 'default'
}) {
  return (
    <div className="form-field-container">
      <div className="form-field-header">
        <label className="form-field-label">
          {label}
          {required && <span className="form-required-indicator">*</span>}
        </label>
        {helpText && <span className="form-help-text">{helpText}</span>}
      </div>
      <div className="form-field-input-wrapper">
        {children}
      </div>
      {touched && error && (
        <div className="form-field-error">
          <span className="error-icon">⚠</span>
          <span className="error-text">{error}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Autocomplete - Smart autocomplete component with debouncing
 */
export function Autocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  fetchSuggestions,
  renderSuggestion,
  minChars = 2,
  debounceMs = 300,
  className = '',
  disabled = false,
  maxSuggestions = 10,
  onError = () => {}
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  // Debounced fetch suggestions
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value && value.length >= minChars) {
      setIsLoading(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const results = await fetchSuggestions(value, maxSuggestions);
          setSuggestions(results || []);
          setIsOpen(true);
          setActiveIndex(-1);
        } catch (err) {
          console.error('Error fetching suggestions:', err);
          setSuggestions([]);
          onError(err.message || 'Failed to fetch suggestions');
        } finally {
          setIsLoading(false);
        }
      }, debounceMs);
    } else {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, minChars, debounceMs, fetchSuggestions, maxSuggestions, onError]);

  // Close on escape or outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0) {
          handleSelectSuggestion(suggestions[activeIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  const handleSelectSuggestion = (suggestion) => {
    onChange(suggestion.text);
    onSelect?.(suggestion);
    setIsOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }} className={className}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => value && suggestions.length > 0 && setIsOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="form-input autocomplete-input"
        style={{
          position: 'relative',
          zIndex: 1
        }}
        aria-label="Autocomplete input"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls="autocomplete-suggestions"
      />

      {isLoading && (
        <div
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '12px',
            color: 'var(--text-muted)'
          }}
        >
          ⟳
        </div>
      )}

      {isOpen && suggestions.length > 0 && (
        <div
          id="autocomplete-suggestions"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            maxHeight: 320,
            overflowY: 'auto',
            zIndex: 1000,
            listStyle: 'none',
            margin: 0,
            padding: 4
          }}
          role="listbox"
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              onClick={() => handleSelectSuggestion(suggestion)}
              role="option"
              aria-selected={index === activeIndex}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                background: index === activeIndex ? 'var(--accent-glow)' : 'transparent',
                borderRadius: 6,
                fontSize: '0.85rem',
                transition: 'background 0.15s',
                marginBottom: 2,
                color: 'var(--text-primary)',
                border: index === activeIndex ? '1px solid var(--accent-primary)' : '1px solid transparent'
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              {renderSuggestion ? renderSuggestion(suggestion) : suggestion.text}
            </div>
          ))}
        </div>
      )}

      {isOpen && suggestions.length === 0 && !isLoading && value.length >= minChars && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            padding: '12px',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
            zIndex: 1000
          }}
        >
          No suggestions found
        </div>
      )}
    </div>
  );
}

/**
 * useFormField - Hook to manage field state and validation
 */
export function useFormField(initialValue = '') {
  const [value, setValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (newValue) => {
    setValue(newValue);
    // Clear error when user starts typing
    if (error) setError(null);
  };

  const handleBlur = () => {
    setTouched(true);
  };

  const validate = (validator) => {
    if (typeof validator === 'function') {
      const result = validator(value);
      const isValid = result === true || result === null || result === undefined;
      setError(isValid ? null : result || 'Invalid value');
      return isValid;
    }
    return true;
  };

  const reset = () => {
    setValue(initialValue);
    setTouched(false);
    setError(null);
  };

  return {
    value,
    setValue,
    touched,
    setTouched,
    error,
    setError,
    handleChange,
    handleBlur,
    validate,
    reset,
    isDirty: value !== initialValue
  };
}

/**
 * Validation utilities
 */
export const validators = {
  required: (value, fieldName = 'This field') => {
    return (value && String(value).trim().length > 0) || `${fieldName} is required`;
  },

  email: (value) => {
    if (!value) return true;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value) || 'Invalid email format';
  },

  phone: (value, minLength = 10) => {
    if (!value) return true;
    const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
    const isValid = phoneRegex.test(value.replace(/\s/g, ''));
    return isValid && value.replace(/\D/g, '').length >= minLength
      ? true
      : `Invalid phone number (minimum ${minLength} digits)`;
  },

  minLength: (minLen) => (value) => {
    return (!value || value.length >= minLen) || `Minimum ${minLen} characters required`;
  },

  maxLength: (maxLen) => (value) => {
    return (!value || value.length <= maxLen) || `Maximum ${maxLen} characters allowed`;
  },

  numeric: (value) => {
    return (!value || /^-?\d+\.?\d*$/.test(value)) || 'Must be a valid number';
  },

  custom: (fn) => fn
};

export default {
  FormField,
  Autocomplete,
  useFormField,
  validators
};
