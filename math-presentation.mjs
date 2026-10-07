// Output formatting only. Never alter archived question/reference text.
export const SOLUTION_FORMAT_RULES = String.raw`解析排版：绝对值使用明确的 \lvert ...\rvert 边界，不用普通字母竖线，不在边界内添加 \quad、\qquad 或空白占位。条件概率与整除用 \mid，不混同绝对值。分析、详解、点睛、解法等短标签使用 \textbf{...}；不写Markdown的#标题。方程组各行左对齐，使用 cases 或左列 array{l}，不使用居中列 array{c}。按原题各小问独立分段，正文完整，避免空行占位。`;
export const MATH_FONT_RULES='题干、选项、解析中的数学数字和表达式均使用LaTeX公式包裹，包括0、8、18等纯数值选项；不把分数之外的整数留作正文文字。题号、小问编号、年份、分值等版面元数据保留正常文本。';
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
    .replace(/\\left\s*\\vert\b/g, '\\left\\lvert ')
    .replace(/\\right\s*\\vert\b/g, '\\right\\rvert ')
    .replace(/(\\left\s*\\\{\s*\\begin\{array\}(?:\[[^\]]*\])?\s*)\{c\}/g, '$1{l}');
  const edits = []; let pending = null, depth = 0, previous = ''; const contexts = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) continue;
    if (c === '\\') {
      const command = text.slice(i).match(/^\\(?:[A-Za-z]+|.)/)[0];
      if (command === '\\{') { depth++; contexts.push({ depth, kind: 'set' }); previous = 'operator'; i++; continue; }
      if (command === '\\}') { depth--; contexts.pop(); if (pending && pending.depth > depth) pending = null; previous = 'operand'; i++; continue; }
      if (/^\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle|quad|qquad|enspace|thinspace|medspace|thickspace|[ ,;!])$/.test(command)) {
        i += command.length - 1; continue;
      }
      if (/^\\(?:text|mbox|operatorname|mathrm|begin|end)$/.test(command)) {
        let at = i + command.length;
        while (/\s/.test(text[at] || '') && at < text.length) at++;
        at = endGroup(text, at);
        if (command === '\\begin' && /\{array\}$/.test(text.slice(i, at))) {
          while (/\s/.test(text[at] || '') && at < text.length) at++;
          if (text[at] === '[') { const end = text.indexOf(']', at); if (end >= at) at = end + 1; }
          while (/\s/.test(text[at] || '') && at < text.length) at++;
          at = endGroup(text, at); // Column rules are not absolute values.
        }
        i = at - 1; previous = command === '\\begin' ? 'operator' : 'operand'; continue;
      }
      previous = /^\\(?:le|leq|ge|geq|ne|neq|in|notin|cdot|times|pm|mp|mid|colon|to|Rightarrow|Leftrightarrow|because|therefore|sin|cos|tan|cot|log|ln|exp|max|min|\\)$/.test(command) ? 'operator' : 'operand';
      i += command.length - 1; continue;
    }
    if ('({['.includes(c)) { depth++; contexts.push({ depth, kind: c === '(' && /(?:\bP|\bPr|\\mathbb\s*\{P\})\s*$/.test(text.slice(0, i)) ? 'probability' : 'group' }); previous = 'operator'; continue; }
    if (')}]'.includes(c)) { depth--; contexts.pop(); if (pending && pending.depth > depth) pending = null; previous = 'operand'; continue; }
    if (c === '|') {
      if (pending && pending.depth === depth) {
        const inside = text.slice(pending.index + 1, i);
        const ambiguousChain = pending.previous === 'operand' && /^\s*[\p{L}\p{N}]/u.test(text.slice(i + 1));
        if (inside.trim() && !/\\\\|&/.test(inside) && !ambiguousChain) {
          edits.push([pending.index, '\\lvert '], [i, '\\rvert ']);
        }
        pending = null; previous = 'absolute';
      } else if (!pending && (previous !== 'operand' || !['set','probability'].includes(contexts.at(-1)?.kind))) {
        pending = { index: i, depth, previous }; previous = 'operator';
      } else previous = 'operator'; // a|b, P(A|B), and set conditions keep their meaning.
      continue;
    }
    previous = /[=+\-<>:,;!^_\/]/.test(c) ? 'operator' : 'operand';
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
