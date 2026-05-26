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

    </div>
  );
}

/** Highlight the matched portion of a suggestion label */
export function highlightMatch(text, query) {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <strong style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>
        {text.slice(idx, idx + query.length)}
      </strong>
      {text.slice(idx + query.length)}
    </>
  );
}

/**
 * TextareaAutocomplete — debounced suggestions for multi-line problem descriptions.
 * Dropdown only appears while typing; click or Enter fills the field; custom text allowed.
 */
export function TextareaAutocomplete({
  value,
  onChange,
  placeholder,
  fetchSuggestions,
  minChars = 1,
  debounceMs = 250,
  maxSuggestions = 8,
  className = '',
  inputClassName = 'form-textarea',
  disabled = false,
  hasError = false,
  style = {},
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = (value || '').trim();
    if (!trimmed || trimmed.length < minChars) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      return undefined;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await fetchSuggestions(trimmed, maxSuggestions);
        const list = (results || [])
          .map((item) => (typeof item === 'string' ? { text: item } : item))
          .filter((item) => item?.text);
        setSuggestions(list);
        setIsOpen(list.length > 0);
        setActiveIndex(-1);
      } catch (err) {
        console.error('TextareaAutocomplete fetch error:', err);
        setSuggestions([]);
        setIsOpen(false);
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, minChars, debounceMs, fetchSuggestions, maxSuggestions]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const selectSuggestion = (item) => {
    onChange(item.text || item);
    setIsOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Enter':
        if (activeIndex >= 0) {
          e.preventDefault();
          selectSuggestion(suggestions[activeIndex]);
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

  const inputStyle = hasError
    ? {
        borderColor: 'var(--danger)',
        boxShadow: '0 0 0 2px rgba(239, 68, 68, 0.12)',
        ...style,
      }
    : style;

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative' }}>
      <textarea
        className={inputClassName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setIsOpen(true);
        }}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          minHeight: 70,
          fontSize: '0.82rem',
          width: '100%',
          ...inputStyle,
        }}
        aria-autocomplete="list"
        aria-expanded={isOpen}
      />
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            right: 14,
            top: 14,
            color: 'var(--text-muted)',
            fontSize: '12px',
            pointerEvents: 'none',
          }}
        >
          ⟳
        </div>
      )}
      {isOpen && suggestions.length > 0 && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            maxHeight: 240,
            overflowY: 'auto',
            zIndex: 1000,
            padding: 4,
          }}
        >
          {suggestions.map((item, index) => (
            <div
              key={`${item.text}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(item)}
              onMouseEnter={() => setActiveIndex(index)}
              style={{
                padding: '9px 12px',
                cursor: 'pointer',
                borderRadius: 6,
                fontSize: '0.82rem',
                color: 'var(--text-primary)',
                background:
                  index === activeIndex ? 'var(--accent-glow)' : 'transparent',
                border:
                  index === activeIndex
                    ? '1px solid var(--accent-primary)'
                    : '1px solid transparent',
              }}
            >
              {highlightMatch(item.text, (value || '').trim())}
            </div>
          ))}
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
  TextareaAutocomplete,
  highlightMatch,
  useFormField,
  validators,
};
