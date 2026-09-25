import { PROVINCE_NAMES, canonicalExamType, canonicalRegion, parseSearchIntent } from './search-intent.js';
import { rankSimilar } from './similarity.js';

const $ = selector => document.querySelector(selector);
let data = { topics: [], sources: [], questions: [], options: {} };
let sourceById = new Map();
let topicById = new Map();
let questionById = new Map();
let currentVersion = '';
const DIFFICULTY = ['基础', '较易', '中等', '较难', '压轴'];
let currentPage = 1;
let selectedQuestion = null;

function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function displayMathText(value, question = false, choice = false, solution = false) {
  let text = String(value ?? '').replace(/[，。；：！？（）【】、“”‘’]/g, mark => ({
    '，': ',', '。': '.', '；': ';', '：': ':', '！': '!', '？': '?',
    '（': '(', '）': ')', '【': '[', '】': ']', '、': ',',
    '“': '"', '”': '"', '‘': "'", '’': "'"
  })[mark]);
  text = text.replace(/([,;:!?])(?=[\p{L}\p{N}$])/gu, '$1 ')
    .replace(/\.(?=[\p{L}$])/gu, '. ')
    .replace(/\)(?=[\u3400-\u9fff])/g, ') ');
  if (question) text = text.replace(/([.;!?])\s*(?=\([1-9]\d*\)\s*[\u3400-\u9fff])/g, '$1\n\n');
  if (choice) {
    text = text.replace(/\\quad\s*(?=\([A-D]\))/g, '');
    const labels = new Set([...text.matchAll(/\(([A-D])\)/g)].map(match => match[1]));
    if (['A', 'B', 'C', 'D'].every(label => labels.has(label)))
      text = text.replace(/\s*(\([A-D]\))\s*/g, (match, label) => `${label === '(A)' ? '\n\n' : '\n'}${label} `).trim();
  }
  if (solution) text = text.replace(/([.;])\s*(?=(?:由|又|故|因此|于是|综上|解得|代入|设|所以|首先|最后|再|检验))/g, '$1\n\n')
    .replace(/(?<!\$)\$([^$\n]{90,})\$(?!\$)/g, (match, formula) => `\n$$${formula}$$\n`);
  if (!question && !/\$|\\\(|\\\[|[\u3400-\u9fff]/.test(text) &&
    /\\(?:frac|dfrac|tfrac|sqrt|left|right|sum|prod|int|lim|cdot|times|vec|overrightarrow|pi|theta|alpha|beta|infty|pm|leq|geq|neq|perp|parallel|begin)\b/.test(text)) {
    text = `$${text}$`;
  }
  text = text.replace(/(?<!\$)\$([^$\r\n]+)\$(?!\$)/g, (_, formula) =>
    `$\\displaystyle ${formula.trim().replace(/^\\displaystyle\s*/, '')}$`)
    .replace(/\\\(([^\r\n]+?)\\\)/g, (_, formula) =>
      `\\(\\displaystyle ${formula.trim().replace(/^\\displaystyle\s*/, '')}\\)`);
  return escapeHtml(text);
}

const stripTikz = value => String(value || '').replace(/\\begin\{tikzpicture\}(?:\[[^\]]*\])?[\s\S]*?\\end\{tikzpicture\}/g, '').trim();

function renderMath(root) {
  if (typeof window.renderMathInElement !== 'function') return;
  for (const node of root.querySelectorAll('.card-stem, .latex-content, .similar-item strong')) {
    window.renderMathInElement(node, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false }
      ], throwOnError: false, strict: 'ignore'
    });
  }
}

function optionList(selector, items, label, getValue = item => item, getLabel = item => item) {
  const element = $(selector);
  element.innerHTML = `<option value="">${escapeHtml(label)}</option>` + items.map(item => `<option value="${escapeHtml(getValue(item))}">${escapeHtml(getLabel(item))}</option>`).join('');
}

function topicTree() {
  const children = new Map();
  for (const topic of data.topics) {
    const parent = topic.parentId || 'root';
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(topic);
  }
  function branch(parent, depth = 0) {
    return (children.get(parent) || []).map(topic => `<label class="topic-option level-${Math.min(depth, 2)}"><input type="checkbox" name="topicIds" value="${escapeHtml(topic.id)}"><span>${escapeHtml(topic.name)}</span></label>${branch(topic.id, depth + 1)}`).join('');
  }
  $('#filter-topics').innerHTML = branch('root');
}

function schoolOptions(region, current = '') {
  optionList('#filter-school', [...new Set(data.sources.filter(source => !region || canonicalRegion(source.region) === region)
    .map(source => source.school).filter(Boolean))].sort(), '全部学校');
  $('#filter-school').value = current;
  updateSourceFilterVisibility();
}

function updateSourceFilterVisibility() {
  const available = {
    school: $('#filter-school').options.length > 1,
    source: $('#filter-source').options.length > 1,
    'school-tier': data.sources.some(source => source.category === '学校试卷' && canonicalRegion(source.region) === '上海')
  };
  for (const [kind, show] of Object.entries(available)) {
    const select = $(`#filter-${kind}`);
    select.hidden = !show;
    $(`#filter-${kind}-label`).hidden = !show;
    if (!show) select.value = '';
  }
}

function sourceGroup(source) {
  if (source.category === '学校试卷' && canonicalRegion(source.region) === '上海') return `上海 · ${source.schoolTier || '其他'}`;
  if (source.category === '教辅习题') return '教辅习题';
  return `${source.region || '其他地区'} · ${source.category}`;
}

function setPage(page) {
  for (const section of document.querySelectorAll('.page')) section.classList.toggle('active', section.id === `page-${page}`);
  for (const button of document.querySelectorAll('.nav-link')) button.classList.toggle('active', button.dataset.page === page);
  $('#page-name').textContent = page === 'sources' ? '试卷来源' : '题目检索';
}

function selectedTopics() {
  const result = new Set([...document.querySelectorAll('#filter-topics input:checked')].map(input => input.value));
  let changed = true;
  while (changed) {
    changed = false;
    for (const topic of data.topics) {
      if (topic.parentId && result.has(topic.parentId) && !result.has(topic.id)) {
        result.add(topic.id);
        changed = true;
      }
    }
  }
  return result;
}

function filteredQuestions() {
  const values = Object.fromEntries(new FormData($('#filters')));
  const topics = selectedTopics();
  const intent = parseSearchIntent(values.smart, data);
  const effective = { ...intent.filters };
  for (const [key, value] of Object.entries(values)) if (value) effective[key] = value;
  const query = [effective.q, intent.remaining].filter(Boolean).join(' ').trim().toLowerCase();
  const hasSmartTopic = id => {
    const ancestors = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const topic of data.topics) if (ancestors.has(topic.parentId) && !ancestors.has(topic.id)) {
        ancestors.add(topic.id); changed = true;
      }
    }
    return ancestors;
  };
  const smartTopics = (intent.filters.topicIds || []).map(hasSmartTopic);
  const filtered = data.questions.filter(question => {
    const source = sourceById.get(question.sourceId) || {};
    const year = Number(question.questionYear || source.examYear || 0);
    if (query && ![question.stemLatex, question.answerLatex, question.paperTitle, source.title,
      ...question.topicIds.map(id => topicById.get(id)?.name)].some(value => String(value || '').toLowerCase().includes(query))) return false;
    if (effective.sourceId && question.sourceId !== effective.sourceId) return false;
    if (effective.category && source.category !== effective.category) return false;
    if (effective.region && canonicalRegion(source.region) !== canonicalRegion(effective.region)) return false;
    if (effective.school && source.school !== effective.school) return false;
    if (effective.schoolTier && source.schoolTier !== effective.schoolTier) return false;
    if (effective.examType && canonicalExamType(source.examType) !== canonicalExamType(effective.examType)) return false;
    if (effective.questionType && question.questionType !== effective.questionType) return false;
    if (effective.questionNumber && !String(question.questionNumber || '').includes(effective.questionNumber.replace(/\D/g, ''))) return false;
    if (effective.year && year !== Number(effective.year)) return false;
    if (effective.yearFrom && year < Number(effective.yearFrom)) return false;
    if (effective.yearTo && year > Number(effective.yearTo)) return false;
    if (effective.difficulty && question.difficulty !== Number(effective.difficulty)) return false;
    if (effective.difficultyMin && question.difficulty < Number(effective.difficultyMin)) return false;
    if (effective.difficultyMax && question.difficulty > Number(effective.difficultyMax)) return false;
    if (topics.size && !question.topicIds.some(id => topics.has(id))) return false;
    if (smartTopics.length && !smartTopics.every(set => question.topicIds.some(id => set.has(id)))) return false;
    return true;
  });
  const sort = values.sort || 'newest';
  filtered.sort((a, b) => {
    if (sort === 'easy') return a.difficulty - b.difficulty || b.updatedAt.localeCompare(a.updatedAt);
    if (sort === 'hard') return b.difficulty - a.difficulty || b.updatedAt.localeCompare(a.updatedAt);
    if (sort === 'year') return Number(b.questionYear || sourceById.get(b.sourceId)?.examYear || 0) - Number(a.questionYear || sourceById.get(a.sourceId)?.examYear || 0) || b.updatedAt.localeCompare(a.updatedAt);
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  return { items: filtered, values, topics, recognized: intent.recognized };
}

function search(page = 1) {
  const { items, values, topics, recognized } = filteredQuestions();
  const pageSize = 20;
  const maxPage = Math.max(1, Math.ceil(items.length / pageSize));
  currentPage = Math.min(page, maxPage);
  const visible = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const filterCount = Object.entries(values).filter(([key, value]) => key !== 'sort' && key !== 'topicIds' && String(value).trim()).length + Number(topics.size > 0);
  $('#result-count').textContent = `${items.length} 道题`;
  $('#smart-recognized').innerHTML = recognized.map(item => `<span>${escapeHtml(item.label)}</span>`).join('');
  $('#active-filter-summary').textContent = filterCount ? `已使用 ${filterCount} 类筛选` : '全部已发布题目';
  $('#question-list').innerHTML = visible.length ? visible.map(question => {
    const source = sourceById.get(question.sourceId) || {};
    const stem = (question.tikzRenderFailed ? String(question.stemLatex || '') : stripTikz(question.stemLatex)).replace(/\s+/g, ' ').trim();
    const topicsText = question.topicIds.map(id => topicById.get(id)?.name).filter(Boolean).join('、');
    return `<button class="question-card" type="button" data-question-id="${escapeHtml(question.id)}"><div class="card-top"><span class="source-chip">${escapeHtml(source.category || '未关联来源')}</span><span class="card-source">${escapeHtml([question.questionYear || source.examYear, question.paperTitle || source.title || '个人录入', question.questionNumber].filter(Boolean).join(' · '))}</span></div><div class="card-stem">${escapeHtml(stem.length > 210 ? `${stem.slice(0, 210)}…` : stem)}</div><div class="card-footer"><span>${escapeHtml(topicsText || '未标考点')}</span><span class="difficulty-pill difficulty-${question.difficulty}">${DIFFICULTY[question.difficulty - 1]}</span><span>${escapeHtml(question.questionType)}</span></div></button>`;
  }).join('') : `<div class="empty-state"><div class="empty-icon">∅</div><h2>${data.questions.length ? '没有找到符合条件的题目' : '题库暂时没有已发布题目'}</h2><p>${data.questions.length ? '试试放宽年份、难度或考点条件。' : '老师录入并校对题目后，这里会自动显示。'}</p></div>`;
  $('#pagination').innerHTML = maxPage > 1 ? `<button type="button" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>上一页</button><span>第 ${currentPage} / ${maxPage} 页</span><button type="button" data-page="${currentPage + 1}" ${currentPage === maxPage ? 'disabled' : ''}>下一页</button>` : '';
  renderMath($('#question-list'));
}

function detailSection(title, value, empty = '尚未填写', question = false, choice = false, solution = false) {
  const text = title === 'AI 详细解析' ? stripTikz(value) : value;
  const figures = title === 'AI 详细解析' ? (selectedQuestion?.solutionTikzUrls || []).map(url =>
    `<figure class="question-asset"><img src="${escapeHtml(url)}" alt="参考作图" loading="lazy"></figure>`).join('') : '';
  return `<section class="detail-section"><h3>${title}</h3><div class="latex-content">${text ? displayMathText(text, question, choice, solution) : `<span class="muted">${empty}</span>`}</div>${figures}</section>`;
}

function openDetail(id) {
  const question = questionById.get(id);
  if (!question) return;
  selectedQuestion = question;
  const source = sourceById.get(question.sourceId) || {};
  const tags = question.topicIds.map(topicId => topicById.get(topicId)?.name).filter(Boolean);
  $('#detail-body').innerHTML = `<div class="detail-meta"><span class="source-chip">${escapeHtml(source.category || '个人录入')}</span><span>${escapeHtml([question.questionYear || source.examYear, question.paperTitle || source.title || '未关联来源', question.questionNumber].filter(Boolean).join(' · '))}</span><span>${escapeHtml([source.region, source.schoolTier, source.school].filter(Boolean).join(' · '))}</span><span>难度 ${question.difficulty} · ${DIFFICULTY[question.difficulty - 1]}</span></div>${detailSection('题干', question.tikzRenderFailed ? question.stemLatex : stripTikz(question.stemLatex), '尚未填写', true, question.questionType === '选择题')}${question.assetUrl ? `<figure class="question-asset"><img src="${escapeHtml(question.assetUrl)}" alt="题目配图" loading="lazy"></figure>` : ''}${(question.tikzUrls || []).map(url => `<figure class="question-asset"><img src="${escapeHtml(url)}" alt="TikZ 几何图" loading="lazy"></figure>`).join('')}<div class="detail-tags">${tags.length ? tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('') : '<span>未标考点</span>'}</div><section class="detail-section official-solution"><h3>参考答案与官方解析</h3><div class="solution-part"><b>参考答案</b><div class="latex-content">${question.answerLatex || question.officialAnswer ? displayMathText(question.officialAnswer || question.answerLatex) : '<span class="muted">暂未录入</span>'}</div></div><div class="solution-part"><b>官方解析</b><div class="latex-content">${question.officialSolution ? displayMathText(question.officialSolution, false, false, true) : '<span class="muted">原件未提供官方解析</span>'}</div></div></section>${question.officialSource ? `<p class="solution-source">解答出处：${escapeHtml(question.officialSource)}</p>` : ''}${detailSection('AI 详细解析', question.aiSolution, '尚未生成或录入 AI 解答', false, false, true)}<div id="similar-results"></div>`;
  renderMath($('#detail-body'));
  if (!$('#detail-dialog').open) $('#detail-dialog').showModal();
}

function showSimilar() {
  if (!selectedQuestion) return;
  const matches = rankSimilar(selectedQuestion.stemLatex, data.questions,
    { topicIds: selectedQuestion.topicIds, difficulty: selectedQuestion.difficulty,
      questionType: selectedQuestion.questionType, excludeId: selectedQuestion.id });
  $('#similar-results').innerHTML = `<section class="detail-section"><h3>相似题 · 题干与考点</h3>${matches.length ? matches.map(question => `<button type="button" class="similar-item" data-question-id="${escapeHtml(question.id)}"><strong>${escapeHtml(String(question.stemLatex).slice(0, 120))}</strong><span>${escapeHtml(sourceById.get(question.sourceId)?.title || '个人录入')} · ${escapeHtml(question.reason)}</span></button>`).join('') : '<p class="muted">题库里暂时没有足够相近的题目。</p>'}</section>`;
  renderMath($('#similar-results'));
}

function init() {
  const values = Object.fromEntries(new FormData($('#filters')));
  const checkedTopics = new Set([...document.querySelectorAll('#filter-topics input:checked')].map(input => input.value));
  $('#sidebar-question-count').textContent = data.questions.length;
  $('#sidebar-source-count').textContent = data.sources.length;
  $('#source-count').textContent = `${data.sources.length} 份`;
  optionList('#filter-category', data.options.sourceCategories || [], '全部来源');
  optionList('#filter-region', data.options.provinces || PROVINCE_NAMES, '全部地区');
  optionList('#filter-school-tier', data.options.schoolTiers || ['四校', '八大', '其他'], '全部分组');
  schoolOptions(values.region, values.school);
  optionList('#filter-exam-type', data.options.examTypes || [], '全部类型');
  optionList('#filter-source', data.sources, '全部试卷', source => source.id, source => source.title);
  optionList('#filter-question-type', data.options.questionTypes || [], '全部题型');
  for (const selector of ['#filter-difficulty-min', '#filter-difficulty-max']) optionList(selector, DIFFICULTY.map((name, i) => `${i + 1} · ${name}`), '不限', value => value[0]);
  topicTree();
  for (const [name, value] of Object.entries(values)) {
    if (name !== 'topicIds' && $('#filters').elements[name]) $('#filters').elements[name].value = value;
  }
  updateSourceFilterVisibility();
  for (const input of document.querySelectorAll('#filter-topics input')) input.checked = checkedTopics.has(input.value);
  const groups = new Map();
  for (const source of data.sources) {
    const group = sourceGroup(source);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(source);
  }
  $('#source-list').innerHTML = data.sources.length ? [...groups].map(([group, items]) => `<div class="source-group-heading">${escapeHtml(group)} · ${items.length}</div>${items.map(source => `<div class="source-card"><div class="source-card-icon">▤</div><div><strong>${escapeHtml(source.title)}</strong><p>${escapeHtml([source.region, source.school, source.examType, source.examYear, source.paper].filter(Boolean).join(' · ') || '尚未补充来源信息')}</p></div><span class="source-chip">${escapeHtml(source.category)}</span></div>`).join('')}`).join('') : '<div class="empty-state compact"><div class="empty-icon">▤</div><h2>暂无已发布来源</h2><p>老师发布题目后，对应的试卷或教辅会显示在这里。</p></div>';
  search(currentPage);
  if (selectedQuestion && $('#detail-dialog').open) {
    const selectedId = selectedQuestion.id;
    if (questionById.has(selectedId)) openDetail(selectedId);
    else $('#detail-dialog').close();
  }
}

async function loadSnapshot() {
  const response = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('无法读取题库版本');
  const version = await response.json();
  if (version.exportedAt === currentVersion) return;
  const snapshotResponse = await fetch(`snapshot.json?v=${encodeURIComponent(version.exportedAt)}`, { cache: 'no-store' });
  if (!snapshotResponse.ok) throw new Error('无法读取题库数据');
  const snapshot = await snapshotResponse.json();
  if (snapshot.exportedAt !== version.exportedAt) throw new Error('题库数据正在同步，请稍后重试');
  data = snapshot;
  sourceById = new Map(data.sources.map(source => [source.id, source]));
  topicById = new Map(data.topics.map(topic => [topic.id, topic]));
  questionById = new Map(data.questions.map(question => [question.id, question]));
  currentVersion = version.exportedAt;
  init();
}

document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => setPage(button.dataset.page)));
$('#filters').addEventListener('submit', event => { event.preventDefault(); search(); });
$('#filters').addEventListener('change', () => search());
$('#filter-region').addEventListener('change', () => schoolOptions($('#filter-region').value));
$('#reset-filters').addEventListener('click', () => { $('#filters').reset(); document.querySelectorAll('#filter-topics input').forEach(input => input.checked = false); search(); });
let searchDelay;
for (const selector of ['#filter-query', '#filter-smart']) $(selector).addEventListener('input', () => {
  clearTimeout(searchDelay); searchDelay = setTimeout(() => search(), 250);
});
document.querySelectorAll('[data-topic-search]').forEach(input => input.addEventListener('input', () => {
  const needle = input.value.trim().toLowerCase();
  for (const label of document.getElementById(input.dataset.topicSearch).querySelectorAll('.topic-option')) {
    label.hidden = !!needle && !label.textContent.toLowerCase().includes(needle) && !label.querySelector('input:checked');
  }
}));
$('#question-list').addEventListener('click', event => { const button = event.target.closest('[data-question-id]'); if (button) openDetail(button.dataset.questionId); });
$('#pagination').addEventListener('click', event => { const button = event.target.closest('[data-page]'); if (button) search(Number(button.dataset.page)); });
$('#close-detail').addEventListener('click', () => $('#detail-dialog').close());
$('#similar-button').addEventListener('click', showSimilar);
$('#similar-search-button').addEventListener('click', () => {
  const root = $('#similar-search-results');
  const query = $('#similar-query').value.trim();
  if (query.length < 5) { root.textContent = '请粘贴至少 5 个字的题干。'; return; }
  const topicIds = data.topics.filter(topic => topic.name.length >= 2 && query.includes(topic.name)).map(topic => topic.id);
  const matches = rankSimilar(query, data.questions, { topicIds, limit: 20 });
  root.innerHTML = matches.length ? matches.map(question => `<button type="button" class="similar-item" data-question-id="${escapeHtml(question.id)}"><strong>${escapeHtml(String(question.stemLatex).slice(0, 150))}</strong><span>${escapeHtml(sourceById.get(question.sourceId)?.title || '个人录入')} · ${escapeHtml(question.reason)}</span></button>`).join('') : '<p class="muted">题库里暂时没有足够相近的题目。</p>';
  renderMath(root);
});
$('#similar-search-results').addEventListener('click', event => {
  const button = event.target.closest('[data-question-id]');
  if (button) openDetail(button.dataset.questionId);
});
$('#detail-body').addEventListener('click', event => { const button = event.target.closest('[data-question-id]'); if (button) { $('#detail-dialog').close(); openDetail(button.dataset.questionId); } });
loadSnapshot().catch(error => {
  $('#question-list').innerHTML = `<div class="empty-state"><h2>暂时无法加载题库</h2><p>${escapeHtml(error.message)}</p></div>`;
});
setInterval(() => loadSnapshot().catch(console.error), 30_000);
