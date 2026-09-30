// Only strict, curriculum-specific paraphrases. This supplements lexical search;
// it never rewrites the archived stem or claims a model-derived similarity score.
const EQUIVALENT_TERMS = [
  [/图像|图象/g, '图像'],
  [/充分必要条件|充要条件/g, '充要关系'],
  [/单调递增|严格递增|增函数/g, '单调递增'],
  [/单调递减|严格递减|减函数/g, '单调递减'],
  [/最大公约数|最大公因数/g, '最大公因数'],
  [/函数表达式|函数解析式/g, '函数解析式']
];

function terms(value) {
  const text = String(value || '').normalize('NFKC').toLowerCase()
    .replace(/\\(?:left|right|displaystyle|textstyle|quad|qquad|,|;|!)/g, ' ')
    .replace(/[{}()[\]，。；：、\s]+/g, ' ');
  const result = new Set();
  for (const word of text.match(/[a-z]+|\d+(?:\.\d+)?/g) || []) {
    if (word.length > 1 || /^[a-z]$/.test(word)) result.add(word);
  }
  const han = (text.match(/[\p{Script=Han}]+/gu) || []).join('');
  for (let i = 0; i < han.length - 1; i++) result.add(han.slice(i, i + 2));
  for (const [pattern, canonical] of EQUIVALENT_TERMS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) result.add(`同义:${canonical}`);
  }
  return result;
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const term of a) if (b.has(term)) intersection++;
  return intersection / Math.sqrt(a.size * b.size);
}

export function rankSimilar(query, candidates, { topicIds = [], difficulty, questionType, excludeId, limit = 8 } = {}) {
  const queryTerms = terms(query);
  const topicSet = new Set(topicIds);
  return candidates.filter(item => item.id !== excludeId).map(item => {
    const textScore = overlap(queryTerms, terms(item.searchText ?? item.stemLatex ?? item.stem_latex));
    const shared = (item.topicIds || []).filter(id => topicSet.has(id)).length;
    const sameType = questionType && item.questionType === questionType;
    const difficultyScore = Number.isInteger(difficulty) ? Math.max(0, 4 - Math.abs(item.difficulty - difficulty)) / 4 : 0;
    const score = textScore * 72 + Math.min(shared, 3) * 10 + difficultyScore * 6 + (sameType ? 2 : 0);
    const signals = [textScore > 0.08 ? `题干相近 ${Math.round(textScore * 100)}%` : '',
      shared ? `共有 ${shared} 个考点` : '',
      difficultyScore ? `难度 ${item.difficulty}` : ''].filter(Boolean);
    return { ...item, score: Number(score.toFixed(2)), sharedTopicCount: shared,
      textSimilarity: textScore,
      reason: signals.join('，') || '文本相关' };
  }).filter(item => item.sharedTopicCount > 0 || item.textSimilarity >= 0.12)
    .sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)))
    .slice(0, limit);
}
