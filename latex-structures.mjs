// Presentation only: archived LaTeX is never rewritten by this parser.
const mathRanges = text => [...text.matchAll(/(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$|(?<![\\$])\$(?!\$)[^$]*?(?<!\\)\$(?!\$)|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g)]
  .map(match => [match.index, match.index + match[0].length]);
const known = new Set(['tabular', 'tabular*', 'enumerate', 'itemize', 'align', 'align*', 'aligned',
  'equation', 'equation*', 'gather', 'gather*', 'gathered', 'cases', 'array', 'matrix', 'pmatrix', 'bmatrix']);
const inMath = (ranges, index) => ranges.some(([start, end]) => index >= start && index < end);
function group(text, start, open = '{', close = '}') {
  while (/\s/.test(text[start] || '') && start < text.length) start++;
  if (text[start] !== open) return null;
  let depth = 1;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === open) depth++;
    if (text[i] === close && --depth === 0) return { value: text.slice(start + 1, i), end: i + 1 };
  }
  return null;
}
function topLevelMatches(text, pattern) {
  const ranges = mathRanges(text), result = [];
  let braces = 0, environments = 0;
  for (let i = 0; i < text.length; i++) {
    const range = ranges.find(([start]) => start === i);
    if (range) { i = range[1] - 1; continue; }
    if (text[i] === '\\') {
      const env = text.slice(i).match(/^\\(begin|end)\{([^}]+)\}/);
      if (env) { environments += env[1] === 'begin' ? 1 : -1; i += env[0].length - 1; continue; }
      if (!braces && !environments) {
        const match = text.slice(i).match(pattern);
        if (match) { result.push({ index: i, text: match[0], label: match[1] }); i += match[0].length - 1; continue; }
      }
      i++; continue;
    }
    if (text[i] === '{') braces++;
    else if (text[i] === '}') braces--;
    else if (!braces && !environments) {
      const match = text.slice(i).match(pattern);
      if (match) { result.push({ index: i, text: match[0] }); i += match[0].length - 1; }
    }
  }
  return result;
}
function splitTopLevel(text, pattern) {
  const matches = topLevelMatches(text, pattern), result = []; let end = 0;
  for (const match of matches) { result.push(text.slice(end, match.index)); end = match.index + match.text.length; }
  result.push(text.slice(end)); return result;
}
function tableCell(value) {
  const content = value.trim();
  if (content.startsWith('\\multicolumn')) {
    const count = group(content, '\\multicolumn'.length), alignment = count && group(content, count.end);
    const text = alignment && group(content, alignment.end);
    if (text && /^\d+$/.test(count.value) && Number(count.value) >= 1 && Number(count.value) <= 20)
      return { content: text.value, colspan: Number(count.value) };
  }
  return { content, colspan: 1 };
}
function structure(env, inner, source) {
  if (env.startsWith('tabular')) {
    let start = 0;
    if (env === 'tabular*') { const width = group(inner, 0); if (width) start = width.end; }
    const position = group(inner, start, '[', ']'); if (position) start = position.end;
    const columns = group(inner, start); if (!columns) return null;
    const body = inner.slice(columns.end).replace(/\\(?:hline|toprule|midrule|bottomrule)\b|\\cline\{[^}]*\}/g, '');
    const rows = splitTopLevel(body, /^\\\\(?:\s*\[[^\]]*\])?/).filter(row => row.trim()).map(row => splitTopLevel(row, /^&/).map(tableCell));
    if (!rows.length) return null;
    return { type: 'table', rows, source, inner };
  }
  if (env === 'enumerate' || env === 'itemize') {
    const items = topLevelMatches(inner, /^\\item\b(?:\s*\[([^\]]*)\])?\s*/);
    if (!items.length) return null;
    return { type: 'list', ordered: env === 'enumerate', items: items.map((item, index) => ({
      label: item.label || (env === 'enumerate' ? `(${index + 1})` : '•'),
      blocks: parseLatexBlocks(inner.slice(item.index + item.text.length, items[index + 1]?.index ?? inner.length))
    })), source, inner };
  }
  const name = /^align/.test(env) ? 'aligned' : /^gather/.test(env) ? 'gathered' : env;
  const body = inner.replace(/\\label\{[^}]*\}/g, '');
  const latex = /^equation/.test(env) ? `\\[${body}\\]` : `\\[\\begin{${name}}${body}\\end{${name}}\\]`;
  return { type: 'math', latex, source };
}
export function parseLatexBlocks(value) {
  const text = String(value ?? ''), ranges = mathRanges(text), result = []; let end = 0;
  const starts = /\\begin\{([^}]+)\}/g;
  for (let match; (match = starts.exec(text));) {
    if (!known.has(match[1]) || inMath(ranges, match.index)) continue;
    const env = match[1], tokens = /\\(begin|end)\{([^}]+)\}/g; tokens.lastIndex = starts.lastIndex;
    let depth = 1, finish;
    for (let token; (token = tokens.exec(text));) {
      if (token[2] !== env) continue;
      depth += token[1] === 'begin' ? 1 : -1;
      if (!depth) { finish = token; break; }
    }
    if (!finish) continue; // Leave incomplete code visible; never drop content.
    const source = text.slice(match.index, tokens.lastIndex);
    const block = structure(env, text.slice(starts.lastIndex, finish.index), source);
    if (!block) continue;
    if (match.index > end) result.push({ type: 'text', content: text.slice(end, match.index) });
    result.push(block); end = tokens.lastIndex; starts.lastIndex = end;
  }
  if (end < text.length) result.push({ type: 'text', content: text.slice(end) });
  return result;
}
export function splitLatexParagraphs(value) {
  const text = String(value ?? '').trim(), ranges = mathRanges(text), stack = [];
  for (const token of text.matchAll(/\\(begin|end)\{([^}]+)\}/g)) {
    if (token[1] === 'begin') stack.push({ index: token.index, name: token[2] });
    else if (stack.at(-1)?.name === token[2]) {
      const start = stack.pop();
      if (!stack.length) ranges.push([start.index, token.index + token[0].length]);
    }
  }
  if (stack.length) ranges.push([stack[0].index, text.length]);
  const paragraphs = []; let end = 0;
  for (const gap of text.matchAll(/\r?\n\s*\r?\n/g)) {
    if (inMath(ranges, gap.index)) continue;
    const part = text.slice(end, gap.index).trim(); if (part) paragraphs.push(part);
    end = gap.index + gap[0].length;
  }
  const last = text.slice(end).trim(); if (last) paragraphs.push(last);
  return paragraphs;
}
export function standaloneMathForTex(value) {
  return parseLatexBlocks(value).map(block => {
    if (block.type === 'text') return block.content;
    if (block.type === 'math') return /^\\begin\{(?:align\*?|equation\*?|gather\*?)\}/.test(block.source) ? block.source : block.latex;
    const start = block.source.indexOf('}') + 1;
    return block.source.slice(0, start) + standaloneMathForTex(block.inner) + block.source.slice(start + block.inner.length);
  }).join('');
}
export function latexTextRuns(value, style = {}) {
  const text = String(value ?? ''), ranges = mathRanges(text), runs = []; let buffer = '';
  const flush = () => { if (buffer) runs.push({ text: buffer, ...style }); buffer = ''; };
  for (let i = 0; i < text.length; i++) {
    const range = ranges.find(([start]) => start === i);
    if (range) { buffer += text.slice(i, range[1]); i = range[1] - 1; continue; }
    const mark = text.slice(i).match(/^\\(textbf|textit|emph)\s*/);
    const argument = mark && group(text, i + mark[0].length);
    if (argument) {
      flush(); runs.push(...latexTextRuns(argument.value, { ...style, [mark[1] === 'textbf' ? 'bold' : 'italic']: true }));
      i = argument.end - 1;
    } else if (text[i] === '\\' && /[&%_#{}]/.test(text[i + 1] || '')) buffer += text[++i];
    else buffer += text[i];
  }
  flush(); return runs;
}
export function renderLatexTextHtml(value, renderText) {
  const runs = latexTextRuns(value);
  if (runs.length === 1 && !runs[0].bold && !runs[0].italic && runs[0].text === String(value ?? '')) return null;
  if (!runs.length) return null;
  return runs.map(run => {
    let html = renderText(run.text);
    if (run.bold) html = `<strong class="latex-emphasis">${html}</strong>`;
    if (run.italic) html = `<em class="latex-emphasis">${html}</em>`;
    return html;
  }).join('');
}
export function renderLatexBlocksHtml(value, renderText) {
  const blocks = parseLatexBlocks(value);
  if (!blocks.some(block => block.type !== 'text')) return null;
  const render = items => items.map(block => {
    if (block.type === 'text') return renderText(block.content);
    if (block.type === 'math') return renderText(block.latex);
    if (block.type === 'table') return `<div class="latex-table-wrap"><table class="latex-table"><tbody>${block.rows.map(row => `<tr>${row.map(cell => `<td colspan="${cell.colspan}">${renderText(cell.content)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    return `<ul class="latex-list">${block.items.map(item => `<li><span class="latex-list-label">${renderText(item.label)}</span><div>${render(item.blocks)}</div></li>`).join('')}</ul>`;
  }).join('');
  return render(blocks);
}
