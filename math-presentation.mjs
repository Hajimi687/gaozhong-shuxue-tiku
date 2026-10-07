// Output formatting only. Never alter archived question/reference text.
export const SOLUTION_FORMAT_RULES = String.raw`解析排版：绝对值使用明确的 \lvert ...\rvert 边界，不用普通字母竖线，不在边界内添加 \quad、\qquad 或空白占位。条件概率与整除用 \mid，不混同绝对值。分析、详解、点睛、解法等短标签使用 \textbf{...}；不写Markdown的#标题。方程组各行左对齐，使用 cases 或左列 array{l}，不使用居中列 array{c}。按原题各小问独立分段，正文完整，避免空行占位。`;
const mathPattern = /(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$|(?<![\\$])\$(?!\$)[^$]*?(?<!\\)\$(?!\$)|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g;
function endGroup(text, start) {
  if (text[start] !== '{') return start;
  let depth = 1;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '{') depth++;
    if (text[i] === '}' && !--depth) return i + 1;
  }
  return text.length;
}
export function isEquationSystem(formula) {
  return /\\begin\{cases\}|\\left\s*\\\{\s*\\begin\{(?:array|aligned|gathered)\}/.test(formula);
}
export function normalizeFormula(value) {
  let text = String(value ?? '')
    .replace(/\\left\s*\|(?=[^|])/g, '\\left\\lvert ')
    .replace(/\\right\s*\|/g, '\\right\\rvert ')
    .replace(/(\\left\s*\\\{\s*\\begin\{array\}(?:\[[^\]]*\])?\s*)\{c\}/g, '$1{l}');
  const edits = []; let pending = null, depth = 0, previous = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) continue;
    if (c === '\\') {
      const command = text.slice(i).match(/^\\(?:[A-Za-z]+|.)/)[0];
      if (/^\\(?:text|mbox|operatorname|mathrm|begin|end)$/.test(command)) {
        let at = i + command.length;
        while (/\s/.test(text[at] || '') && at < text.length) at++;
        at = endGroup(text, at);
        if (command === '\\begin' && /\{array\}$/.test(text.slice(i, at))) {
          while (/\s/.test(text[at] || '') && at < text.length) at++;
          at = endGroup(text, at); // Column rules are not absolute values.
        }
        i = at - 1; previous = 'operand'; continue;
      }
      previous = /^\\(?:le|leq|ge|geq|ne|neq|in|notin|cdot|times|pm|mp|mid|colon|to|Rightarrow|Leftrightarrow)$/.test(command) ? 'operator' : 'operand';
      i += command.length - 1; continue;
    }
    if ('({['.includes(c)) { depth++; previous = 'operator'; continue; }
    if (')}]'.includes(c)) { depth--; previous = 'operand'; continue; }
    if (c === '|') {
      if (pending && pending.depth === depth) {
        const inside = text.slice(pending.index + 1, i);
        if (inside.trim() && !/\\\\|&/.test(inside)) {
          edits.push([pending.index, '\\lvert '], [i, '\\rvert ']);
        }
        pending = null; previous = 'absolute';
      } else if (!pending && (!previous || ['operator', 'absolute'].includes(previous))) {
        pending = { index: i, depth }; previous = 'operator';
      } else previous = 'operator'; // a|b, P(A|B), and set conditions keep their meaning.
      continue;
    }
    previous = /[=+\-<>:,;!^_]/.test(c) ? 'operator' : 'operand';
  }
  for (const [at, replacement] of edits.reverse()) text = text.slice(0, at) + replacement + text.slice(at + 1);
  return text;
}
export function normalizeMathText(value) {
  return String(value ?? '').replace(mathPattern, token => {
    const width = token.startsWith('$$') || token.startsWith('\\') ? 2 : 1;
    return token.slice(0, width) + normalizeFormula(token.slice(width, -width)) + token.slice(-width);
  });
}
export function emphasizeSolutionLabels(value) {
  const label = /^(?:\[(?:分析|详解|解答|解|证明|点睛|点评|思路|解法[一二三四五六七八九十\d]+)\]|【(?:分析|详解|解答|解|证明|点睛|点评|思路|解法[一二三四五六七八九十\d]+)】|(?:分析|详解|解答|证明|点睛|点评|思路|解法[一二三四五六七八九十\d]+)[:：])/;
  const text = String(value ?? ''), spans = [...text.matchAll(mathPattern)].map(m => [m.index, m.index + m[0].length]);
  let out = '', end = 0;
  for (let i = 0; i < text.length; i++) {
    const span = spans.find(([a]) => a === i);
    if (span) { i = span[1] - 1; continue; }
    if (text[i] === '\\') {
      const styled = text.slice(i).match(/^\\(?:textbf|textit|emph)\s*\{/);
      if (styled) { i = endGroup(text, i + styled[0].length - 1) - 1; continue; }
    }
    if (i && !/[\n\s.。;；)）]/.test(text[i - 1])) continue;
    const match = text.slice(i).match(label);
    if (!match) continue;
    out += text.slice(end, i) + `\\textbf{${match[0]}}`; end = i + match[0].length; i = end - 1;
  }
  return out + text.slice(end);
}
export function leftAlignedSystemsForTex(value) {
  return value.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, (token, a, b) =>
    isEquationSystem(a ?? b) ? `\n\\par\\noindent\\(\\displaystyle ${a ?? b}\\)\\par\n` : token);
}
export function alignRenderedSystems(root) {
  for (const display of root.querySelectorAll('.katex-display')) {
    const source = display.querySelector('annotation[encoding="application/x-tex"]')?.textContent || '';
    if (isEquationSystem(source)) display.classList.add('equation-system');
  }
}
