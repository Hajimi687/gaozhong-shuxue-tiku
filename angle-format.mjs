// Convert explicit numeric angle measures only; never rewrite TikZ coordinates.
export function horizontalComparisons(value) {
  return String(value ?? '').replace(/\\(leqslant|geqslant)(?![A-Za-z])/g, (_, command) =>
    command === 'leqslant' ? '\\leq' : '\\geq').replaceAll('⩽', '≤').replaceAll('⩾', '≥');
}
export function radians(value) {
  const convert = (text, wrap) => text.replace(/(?<![\w.])(\d+(?:\.\d+)?)\s*(?:\^\s*(?:\{\s*\\circ\s*\}|\\circ)|°)(?!\s*[CF℃℉])/g, (_, degrees) => {
    const places = degrees.includes('.') ? degrees.split('.')[1].length : 0;
    if (places > 6) return _;
    let numerator = BigInt(degrees.replace('.', ''));
    let denominator = 180n * 10n ** BigInt(places);
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const divisor = gcd(numerator, denominator);
    numerator /= divisor; denominator /= divisor;
    if (!numerator) return wrap ? '$0$' : '0';
    const top = `${numerator === 1n ? '' : numerator}\\pi`;
    const result = denominator === 1n ? top : `\\dfrac{${top}}{${denominator}}`;
    return wrap ? `$${result}$` : result;
  });
  return String(value ?? '').split(/(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})/g)
    .map(part => part.startsWith('\\begin{tikzpicture}') ? part : part
      .split(/(\$\$[\s\S]*?\$\$|\$[^$\n]*\$|\\\[[\s\S]*?\\\]|\\\([^\n]*?\\\))/g)
      .map((piece, index) => convert(piece, index % 2 === 0)).join('')).join('');
}
