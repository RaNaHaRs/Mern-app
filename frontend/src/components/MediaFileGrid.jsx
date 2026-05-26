import React, { useState } from 'react';
import MediaLightbox from './MediaLightbox';
import { fileTypeIcon, formatFileSize, formatSolutionTime } from '../utils/solutionMedia';

function isVideoItem(item) {
  const m = item?.mimeType || item?.mime_type || '';
  return m.startsWith('video/') || (item?.name || '').match(/\.(mp4|webm|ogg|mov)$/i);
}

function isImageItem(item) {
  const m = item?.mimeType || item?.mime_type || '';
  return m.startsWith('image/') && item?.data;
}

/**
 * Shared media grid — click opens MediaLightbox (preview first, download in lightbox).
 * variant: 'square' | 'card' | 'gallery'
 */
export default function MediaFileGrid({
  items,
  onDelete,
  canDelete = false,
  variant = 'gallery',
  minColumnWidth,
  style,
}) {
  const [previewIdx, setPreviewIdx] = useState(null);
  if (!items?.length) return null;

  const colWidth = minColumnWidth || (variant === 'card' ? 200 : variant === 'square' ? 140 : 160);

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${colWidth}px, 1fr))`,
          gap: variant === 'card' ? 10 : 12,
          marginTop: variant === 'card' ? 12 : 0,
          ...style,
        }}
      >
        {items.map((item, idx) => {
          if (variant === 'card') {
            return (
              <div
                key={item.id || idx}
                className="card"
                style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' }}
                onClick={() => setPreviewIdx(idx)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.2rem' }}>{fileTypeIcon(item)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>{item.name}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {formatSolutionTime(item.uploadedAt || item.createdAt)} · {formatFileSize(item.size)}
                    </div>
                  </div>
                  {canDelete && onDelete && (
                    <button type="button" className="btn btn-ghost btn-icon" style={{ width: 24, height: 24, fontSize: '0.7rem' }}
                      onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}>✕</button>
                  )}
                </div>
                {isImageItem(item) && (
                  <img src={item.data} alt={item.name} style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                )}
                <span style={{ fontSize: '0.68rem', color: 'var(--accent-primary)' }}>Click to preview</span>
              </div>
            );
          }

          if (variant === 'square') {
            const isVideo = isVideoItem(item);
            return (
              <div
                key={item.id || idx}
                style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', aspectRatio: '1', cursor: 'pointer' }}
                onClick={() => setPreviewIdx(idx)}
              >
                {isVideo ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(124,58,237,0.1)' }}>
                    <span style={{ fontSize: '2rem' }}>🎬</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0 6px', wordBreak: 'break-all' }}>{item.name}</span>
                  </div>
                ) : isImageItem(item) ? (
                  <img src={item.data} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <span style={{ fontSize: '2rem' }}>{fileTypeIcon(item)}</span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0 6px' }}>{item.name}</span>
                  </div>
                )}
                <div style={{ position: 'absolute', bottom: 4, left: 4, right: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.7)', background: 'rgba(0,0,0,0.6)', padding: '2px 5px', borderRadius: 4, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatFileSize(item.size)}</span>
                  {canDelete && onDelete && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                      style={{ background: 'rgba(239,68,68,0.8)', border: 'none', borderRadius: 4, color: '#fff', width: 20, height: 20, fontSize: '0.65rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  )}
                </div>
              </div>
            );
          }

          // gallery (inventory-style)
          const isVideo = isVideoItem(item);
          return (
            <div key={item.id || idx} style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', cursor: 'pointer' }}
              onClick={() => setPreviewIdx(idx)}>
              {isVideo ? (
                <video src={item.data} style={{ width: '100%', height: 140, objectFit: 'cover', pointerEvents: 'none' }} />
              ) : isImageItem(item) ? (
                <img src={item.data} alt={item.name} style={{ width: '100%', height: 140, objectFit: 'cover' }} />
              ) : (
                <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', background: 'var(--bg-elevated)' }}>{fileTypeIcon(item)}</div>
              )}
              <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '2px 5px', fontSize: '0.6rem', color: '#fff' }}>
                {isVideo ? '🎬' : isImageItem(item) ? '🖼️' : '📎'} {formatFileSize(item.size)}
              </div>
              <div style={{ padding: '6px 8px', fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
              {canDelete && onDelete && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                  style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: 'rgba(239,68,68,0.9)', border: 'none', color: '#fff', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              )}
            </div>
          );
        })}
      </div>
      {previewIdx !== null && (
        <MediaLightbox items={items} startIdx={previewIdx} onClose={() => setPreviewIdx(null)} />
      )}
    </>
  );
}
