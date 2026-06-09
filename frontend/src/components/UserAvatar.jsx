/**
 * UserAvatar — centralized avatar component.
 * Shows uploaded profile image if available, falls back to initials.
 *
 * Props:
 *   name       {string}  full name or username
 *   avatarUrl  {string}  URL of uploaded image (optional)
 *   size       {number}  pixel diameter (default 36)
 *   fontSize   {string}  CSS font-size override (optional)
 *   style      {object}  extra inline styles (optional)
 *   className  {string}  extra class names (optional)
 */

import React, { useState } from 'react';

/** Derive initials from a name string. */
export function getInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Pick a consistent gradient background from a name (stable across renders). */
const GRADIENTS = [
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#0ea5e9,#0369a1)',
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#f59e0b,#d97706)',
  'linear-gradient(135deg,#ef4444,#dc2626)',
  'linear-gradient(135deg,#ec4899,#db2777)',
  'linear-gradient(135deg,#8b5cf6,#7c3aed)',
  'linear-gradient(135deg,#14b8a6,#0d9488)',
];

export function getAvatarGradient(name) {
  if (!name) return GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

export default function UserAvatar({
  name,
  avatarUrl,
  size = 36,
  fontSize,
  style = {},
  className = '',
}) {
  const [imgError, setImgError] = useState(false);

  const initials = getInitials(name);
  const gradient = getAvatarGradient(name);
  const computedFontSize = fontSize || `${Math.max(10, Math.floor(size * 0.38))}px`;

  const baseStyle = {
    width: size,
    height: size,
    minWidth: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: computedFontSize,
    color: '#fff',
    background: gradient,
    overflow: 'hidden',
    flexShrink: 0,
    userSelect: 'none',
    ...style,
  };

  const showImage = avatarUrl && !imgError;

  return (
    <div className={`user-avatar-component ${className}`} style={baseStyle}>
      {showImage ? (
        <img
          src={avatarUrl}
          alt={initials}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
        />
      ) : (
        <span style={{ lineHeight: 1 }}>{initials}</span>
      )}
    </div>
  );
}
