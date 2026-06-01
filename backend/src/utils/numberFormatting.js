function formatNumberSequence(format, sequence) {
  const pattern = String(format || '').trim();
  const seqText = String(sequence || 0);
  let result = pattern || seqText;
  const now = new Date();
  result = result
    .replace(/{YYYY}/g, String(now.getFullYear()))
    .replace(/{YY}/g, String(now.getFullYear()).slice(-2))
    .replace(/{MM}/g, String(now.getMonth() + 1).padStart(2, '0'));

  const tokenRegex = /\{(N+)\}/;
  let match = tokenRegex.exec(result);
  while (match) {
    const token = match[1];
    const padded = token.length > 1 ? seqText.padStart(token.length, '0') : seqText;
    result = result.replace(tokenRegex, padded);
    match = tokenRegex.exec(result);
  }

  return result;
}

function getCompanyNumberStart(settings, startKey) {
  const rawValue = settings && settings[startKey];
  const startValue = Number(rawValue);
  return Number.isFinite(startValue) && startValue > 0 ? startValue : 1;
}

function getCompanyNumberFormat(settings, formatKey, defaultFormat) {
  return (settings && settings[formatKey]) || defaultFormat;
}

module.exports = {
  formatNumberSequence,
  getCompanyNumberFormat,
  getCompanyNumberStart,
};
