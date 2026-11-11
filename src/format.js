// Number display: no decimals.
// < 10,000          -> 8,500
// then 1000-steps   -> K, M, B, T, aa, ab, ... az, ba, ... (mantissa kept to 4 digits: 1,400K, 52aa)

const BASE_UNITS = ['', 'K', 'M', 'B', 'T'];

export function unitName(k) {
  if (k < BASE_UNITS.length) return BASE_UNITS[k];
  const i = k - BASE_UNITS.length;               // 0 -> aa
  const a = String.fromCharCode(97 + Math.floor(i / 26) % 26);
  const b = String.fromCharCode(97 + (i % 26));
  return a + b;
}

export function fmt(n) {
  n = Math.floor(Math.max(0, n));
  if (n < 10000) return n.toLocaleString('en-US');
  let k = 1;
  while (n / Math.pow(1000, k) >= 10000) k++;
  const m = Math.floor(n / Math.pow(1000, k));
  return m.toLocaleString('en-US') + unitName(k);
}
