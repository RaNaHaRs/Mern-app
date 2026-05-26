import React, { useEffect, useState } from 'react';
import { downloadFile, formatFileSize } from '../utils/solutionMedia';

function getMime(item) {
  return item?.mimeType || item?.mime_type || '';
}

function getMediaKinds(item) {
  const mime = getMime(item);
  const name = (item?.name || '').toLowerCase();
  const isVideo = mime.startsWith('video/') || /\.(mp4|webm|ogg|mov|mkv)$/.test(name);
  const isAudio = mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)$/.test(name);
  const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');
  const isImage = mime.startsWith('image/') && !isVideo && !isAudio && !isPdf;
  return { isVideo, isAudio, isPdf, isImage };
}

export default function MediaLightbox({ items, startIdx, startIndex = 0, onClose }) {
  const initial = startIdx ?? startIndex ?? 0;
  const [idx, setIdx] = useState(initial);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    setIdx(initial);
  }, [initial]);

  useEffect(() => {
    setScale(1);
    setRotation(0);
  }, [idx]);

  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(i + 1, items.length - 1));
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(i - 1, 0));
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(4, s + 0.25));
      if (e.key === '-') setScale((s) => Math.max(0.5, s - 0.25));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [items.length, onClose]);

  if (!items?.length) return null;

  const item = items[idx];
  const { isVideo, isAudio, isPdf, isImage } = getMediaKinds(item);

  const toolBtn = {
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.25)',
    color: '#fff',
    borderRadius: 8,
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontWeight: 600,
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.97)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}
      onClick={onClose}
      onWheel={(e) => {
        if (!isImage) return;
        e.preventDefault();
        e.stopPropagation();
        setScale((s) => Math.min(4, Math.max(0.5, s + (e.deltaY < 0 ? 0.1 : -0.1))));
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(rgba(0,0,0,0.8),transparent)' }}>
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>{item?.name} · {formatFileSize(item?.size)}</span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="button" style={toolBtn} onClick={(e) => { e.stopPropagation(); downloadFile(item); }}>⬇ Download</button>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>{idx + 1}/{items.length}</span>
          <button type="button" onClick={onClose} style={{ ...toolBtn, fontSize: '1.1rem' }}>✕</button>
        </div>
      </div>

      {idx > 0 && (
        <button type="button" onClick={(e) => { e.stopPropagation(); setIdx((i) => i - 1); }} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', ...toolBtn, width: 48, height: 48, borderRadius: '50%', fontSize: '1.4rem' }}>‹</button>
      )}
      {idx < items.length - 1 && (
        <button type="button" onClick={(e) => { e.stopPropagation(); setIdx((i) => i + 1); }} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', ...toolBtn, width: 48, height: 48, borderRadius: '50%', fontSize: '1.4rem' }}>›</button>
      )}

      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '88vw', maxHeight: '78vh', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isVideo ? (
          <video src={item.data} controls style={{ maxWidth: '100%', maxHeight: '78vh', borderRadius: 8 }} />
        ) : isAudio ? (
          <audio src={item.data} controls autoPlay style={{ width: 'min(88vw, 480px)' }} />
        ) : isPdf ? (
          <iframe title={item.name} src={item.data} style={{ width: 'min(88vw, 900px)', height: '78vh', border: 'none', borderRadius: 8, background: '#fff' }} />
        ) : isImage ? (
          <img
            src={item.data}
            alt={item.name}
            style={{
              maxWidth: '88vw',
              maxHeight: '78vh',
              objectFit: 'contain',
              borderRadius: 8,
              transform: `rotate(${rotation}deg) scale(${scale})`,
              transition: 'transform 0.15s ease',
              cursor: scale > 1 ? 'grab' : 'default',
            }}
            draggable={false}
          />
        ) : (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.85)', padding: 24 }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📎</div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{item.name}</div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)' }}>Preview not available — use Download</div>
          </div>
        )}
      </div>

      {isImage && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: 'center',
            padding: '10px 14px',
            background: 'rgba(0,0,0,0.65)',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <button type="button" style={toolBtn} onClick={() => setScale((s) => Math.min(4, s + 0.25))} title="Zoom in">🔍 Zoom in</button>
          <button type="button" style={toolBtn} onClick={() => setScale((s) => Math.max(0.5, s - 0.25))} title="Zoom out">🔍 Zoom out</button>
          <button type="button" style={toolBtn} onClick={() => setRotation((r) => r - 90)} title="Rotate left">🔄 Rotate left</button>
          <button type="button" style={toolBtn} onClick={() => setRotation((r) => r + 90)} title="Rotate right">🔄 Rotate right</button>
          <button type="button" style={toolBtn} onClick={() => { setScale(1); setRotation(0); }} title="Reset">↺ Reset</button>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', alignSelf: 'center', padding: '0 6px' }}>
            {Math.round(scale * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
