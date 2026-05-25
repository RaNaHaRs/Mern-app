import React, { useState, useCallback, useEffect } from 'react';

function generateChallenge() {
  const ops = ['+', '-', '×'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a, b, answer;
  if (op === '+') {
    a = Math.floor(Math.random() * 20) + 1;
    b = Math.floor(Math.random() * 20) + 1;
    answer = a + b;
  } else if (op === '-') {
    a = Math.floor(Math.random() * 20) + 10;
    b = Math.floor(Math.random() * a) + 1;
    answer = a - b;
  } else {
    a = Math.floor(Math.random() * 9) + 2;
    b = Math.floor(Math.random() * 9) + 2;
    answer = a * b;
  }
  return { a, b, op, answer };
}

/**
 * MathCaptcha — a reusable simple CAPTCHA component.
 * Props:
 *   onVerify(isValid: boolean) — called whenever input changes
 *   resetKey — change this value to force a new challenge
 */
export default function MathCaptcha({ onVerify, resetKey }) {
  const [challenge, setChallenge] = useState(generateChallenge);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('idle'); // idle | correct | wrong

  const refresh = useCallback(() => {
    setChallenge(generateChallenge());
    setInput('');
    setStatus('idle');
    onVerify(false);
  }, [onVerify]);

  // Regenerate when parent resets (e.g. after failed submit)
  useEffect(() => { if (resetKey) refresh(); }, [resetKey]); // eslint-disable-line

  const handleChange = (e) => {
    const val = e.target.value.replace(/[^0-9-]/g, '');
    setInput(val);
    const num = parseInt(val, 10);
    if (val === '' || isNaN(num)) {
      setStatus('idle');
      onVerify(false);
    } else if (num === challenge.answer) {
      setStatus('correct');
      onVerify(true);
    } else {
      setStatus('wrong');
      onVerify(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* Challenge box */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '8px 16px', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-default)',
        fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 800,
        color: 'var(--text-primary)', letterSpacing: '0.08em', flexShrink: 0,
        minWidth: 110, userSelect: 'none',
        background: 'repeating-linear-gradient(45deg, var(--bg-elevated) 0, var(--bg-elevated) 4px, var(--bg-card) 4px, var(--bg-card) 8px)',
      }}>
        {challenge.a} {challenge.op} {challenge.b} = ?
      </div>

      {/* Answer input */}
      <input
        type="text"
        inputMode="numeric"
        className="form-input"
        value={input}
        onChange={handleChange}
        placeholder="Answer"
        maxLength={4}
        style={{
          flex: 1,
          borderColor: status === 'correct' ? '#22c55e' : status === 'wrong' ? '#ef4444' : undefined,
          textAlign: 'center',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          fontSize: '1rem',
        }}
      />

      {/* Status icon */}
      <div style={{ width: 22, flexShrink: 0, textAlign: 'center', fontSize: '1.1rem' }}>
        {status === 'correct' && '✅'}
        {status === 'wrong' && '❌'}
      </div>

      {/* Refresh button */}
      <button
        type="button"
        onClick={refresh}
        title="New challenge"
        style={{
          background: 'none', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
          color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: '6px 8px', flexShrink: 0,
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.color = 'var(--accent-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        🔄
      </button>
    </div>
  );
}
