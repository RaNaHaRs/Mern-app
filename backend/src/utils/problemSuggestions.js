/** Default problem descriptions used when DB has few matches */
const DEFAULT_PROBLEM_SUGGESTIONS = [
  'Not detecting',
  'Not spinning',
  'Not accessible',
  'Not booting',
  'Clicking sound',
  'Clicking after drop',
  'Clicking and not detecting',
  'Drive not recognized by BIOS',
  'Slow read / bad sectors',
  'Burnt PCB smell',
  'Water damage',
  'Dropped drive',
];

function normalizeText(text) {
  return String(text || '').trim();
}

function rankScore(text, term) {
  const lower = text.toLowerCase();
  const q = term.toLowerCase();
  if (lower.startsWith(q)) return 0;
  const wordStart = lower.split(/\s+/).some((w) => w.startsWith(q));
  if (wordStart) return 1;
  if (lower.includes(q)) return 2;
  return 99;
}

/**
 * Merge DB rows with defaults and optional extras; dedupe case-insensitively.
 */
function mergeProblemSuggestions(rows, term, max, extras = []) {
  const seen = new Set();
  const merged = [];

  const push = (raw, meta = {}) => {
    const text = normalizeText(raw);
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    if (term && !text.toLowerCase().includes(term.toLowerCase())) return;
    seen.add(key);
    merged.push({
      id: meta.id || null,
      text,
      use_count: meta.use_count || 0,
      last_used_at: meta.last_used_at || null,
      _rank: rankScore(text, term),
    });
  };

  for (const row of rows || []) {
    push(row.text, row);
  }
  for (const text of extras) {
    push(text);
  }
  for (const text of DEFAULT_PROBLEM_SUGGESTIONS) {
    push(text, { use_count: 0 });
  }

  merged.sort((a, b) => {
    if (a._rank !== b._rank) return a._rank - b._rank;
    if ((b.use_count || 0) !== (a.use_count || 0)) return (b.use_count || 0) - (a.use_count || 0);
    return a.text.localeCompare(b.text);
  });

  return merged.slice(0, max).map(({ _rank, ...rest }) => rest);
}

module.exports = {
  DEFAULT_PROBLEM_SUGGESTIONS,
  mergeProblemSuggestions,
  rankScore,
};
