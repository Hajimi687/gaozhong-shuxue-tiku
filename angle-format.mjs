// Convert explicit numeric angle measures only; never rewrite TikZ coordinates.
export function horizontalComparisons(value) {
  return String(value ?? '').replace(/\\(leqslant|geqslant)(?![A-Za-z])/g, (_, command) =>
    command === 'leqslant' ? '\\leq' : '\\geq').replaceAll('⩽', '≤').replaceAll('⩾', '≥');
}
export function radians(value) {
  const degreePattern = /(?<![\w.])(\d+(?:\.\d+)?)\s*(?:\^\s*(?:\{\s*\\circ\s*\}|\\circ)|°)(?!\s*(?:[CF℃℉]|\\(?:mathrm|text|mbox)\s*\{\s*[CF]\s*\}))/g;
  const angle = (token, degrees) => {
    const places = degrees.includes('.') ? degrees.split('.')[1].length : 0;
    if (places > 6) return token;
    let numerator = BigInt(degrees.replace('.', ''));
    let denominator = 180n * 10n ** BigInt(places);
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const divisor = gcd(numerator, denominator);
    numerator /= divisor; denominator /= divisor;
    if (!numerator) return '0';
    const top = `${numerator === 1n ? '' : numerator}\\pi`;
    const result = denominator === 1n ? top : `\\dfrac{${top}}{${denominator}}`;
    return result;
  };
  // Historical solutions use 1°, 2°, ... as case labels. A label starts a
  // paragraph/case and has a body; an angle in an equation (a=1°), a lone
  // measure, and an angle followed by an arithmetic operator are not labels.
  const caseLabel = (source, start, end, textLabel = false) => {
    const before = source.slice(0, start);
    if (!/(?:^|[\n:;])\s*(?:(?:\$\$?|\\\(|\\\[)\s*)?$/.test(before)) return false;
    const after = source.slice(end).replace(/^\s*(?:\$\$?|\\\)|\\\])/, '');
    if (textLabel && /^(?:\s+|\\(?:quad|qquad)\s*)(?:当|若|设|令|由|对于|如果|假设|考虑|在|有|\$|\\\(|[A-Za-z\\])/.test(after)) return true;
    return /^\s+(?:当|若|设|令|由|对于|如果|假设|考虑|在|有|\$(?!\s*[=+\-*/<>])|\\\()(?!\s*$)/.test(after);
  };
  const textCommand = /\\(text|mbox|textbf|textit|textnormal|textrm|textsf|texttt|emph)\s*\{/g;
  const convert = (text, wrap, source, offset) => {
    const ordinary = (part, at, replacement) => part.replace(degreePattern, (token, degrees, index) => {
      if (/^[1-9]\d*°$/.test(token) && caseLabel(source, at + index, at + index + token.length)) return token;
      const result = angle(token, degrees);
      return result === token ? token : replacement(result);
    });
    let output = '', cursor = 0;
    textCommand.lastIndex = 0;
    for (let match; (match = textCommand.exec(text));) {
      const bodyStart = textCommand.lastIndex;
      let depth = 1, end = bodyStart;
      for (; end < text.length && depth; end++) {
        if (text[end] === '\\') { end++; continue; }
        if (text[end] === '{') depth++;
        else if (text[end] === '}') depth--;
      }
      if (depth) break;
      output += ordinary(text.slice(cursor, match.index), offset + cursor, result => wrap ? `$${result}$` : result);
      const body = text.slice(bodyStart, end - 1), original = text.slice(match.index, end);
      if (/^\s*[1-9]\d*°\s*$/.test(body) && caseLabel(source, offset + match.index, offset + end, true)) output += original;
      else {
        const command = match[1];
        const formatted = ordinary(body, offset + bodyStart, result => wrap ? `$${result}$` : `}${result}\\${command}{`);
        // In math mode text arguments cannot contain dfrac. Place a genuine
        // angle outside the text group, retaining any surrounding prose/style.
        const converted = text.slice(match.index, bodyStart) + formatted + '}';
        output += formatted === body || wrap ? converted : converted.replace(new RegExp(String.raw`\\${command}\{\}`, 'g'), '');
      }
      cursor = end; textCommand.lastIndex = end;
    }
    return output + ordinary(text.slice(cursor), offset + cursor, result => wrap ? `$${result}$` : result);
  };
  return String(value ?? '').split(/(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})/g)
    .map(part => {
      if (part.startsWith('\\begin{tikzpicture}')) return part;
      let offset = 0;
      return part.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]*\$|\\\[[\s\S]*?\\\]|\\\([^\n]*?\\\))/g)
        .map((piece, index) => { const at = offset; offset += piece.length; return convert(piece, index % 2 === 0, part, at); }).join('');
    }).join('');
}
