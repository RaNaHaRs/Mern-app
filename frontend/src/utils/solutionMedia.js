export function formatSolutionTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

export function fileTypeIcon(item) {
  const m = (item?.mimeType || '').toLowerCase();
  const n = (item?.name || '').toLowerCase();
  if (m.startsWith('image/')) return '🖼️';
  if (m.startsWith('video/')) return '🎬';
  if (m.startsWith('audio/')) return '🎵';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return '📄';
  if (m.includes('zip') || m.includes('rar') || m.includes('7z') || /\.(zip|rar|7z)$/.test(n)) return '🗜️';
  if (m.includes('word') || n.endsWith('.doc') || n.endsWith('.docx')) return '📝';
  if (m.includes('sheet') || n.endsWith('.xls') || n.endsWith('.xlsx')) return '📊';
  return '📎';
}

export function canPreviewMedia(item) {
  const m = item?.mimeType || '';
  return m.startsWith('image/') || m.startsWith('video/');
}

export function downloadFile(item) {
  if (!item?.data) return;
  const a = document.createElement('a');
  a.href = item.data;
  a.download = item.name || 'download';
  a.rel = 'noopener';
  a.click();
}
