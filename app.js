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
  const query = String(values.q || '').trim().toLowerCase();
  const filtered = data.questions.filter(question => {
    const source = sourceById.get(question.sourceId) || {};
    if (query && ![question.stemLatex, question.answerLatex, source.title].some(value => String(value || '').toLowerCase().includes(query))) return false;
    if (values.sourceId && question.sourceId !== values.sourceId) return false;
    if (values.category && source.category !== values.category) return false;
    if (values.region && source.region !== values.region) return false;
    if (values.school && source.school !== values.school) return false;
    if (values.examType && source.examType !== values.examType) return false;
    if (values.questionType && question.questionType !== values.questionType) return false;
    if (values.yearFrom && Number(source.examYear || 0) < Number(values.yearFrom)) return false;
    if (values.yearTo && Number(source.examYear || 0) > Number(values.yearTo)) return false;
    if (values.difficultyMin && question.difficulty < Number(values.difficultyMin)) return false;
    if (values.difficultyMax && question.difficulty > Number(values.difficultyMax)) return false;
    if (topics.size && !question.topicIds.some(id => topics.has(id))) return false;
    return true;
  });
  const sort = values.sort || 'newest';
  filtered.sort((a, b) => {
    if (sort === 'easy') return a.difficulty - b.difficulty || b.updatedAt.localeCompare(a.updatedAt);
    if (sort === 'hard') return b.difficulty - a.difficulty || b.updatedAt.localeCompare(a.updatedAt);
    if (sort === 'year') return Number(sourceById.get(b.sourceId)?.examYear || 0) - Number(sourceById.get(a.sourceId)?.examYear || 0) || b.updatedAt.localeCompare(a.updatedAt);
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  return { items: filtered, values, topics };
}

function search(page = 1) {
  const { items, values, topics } = filteredQuestions();
  const pageSize = 20;
  const maxPage = Math.max(1, Math.ceil(items.length / pageSize));
  currentPage = Math.min(page, maxPage);
  const visible = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const filterCount = Object.entries(values).filter(([key, value]) => key !== 'sort' && key !== 'topicIds' && String(value).trim()).length + Number(topics.size > 0);
  $('#result-count').textContent = `${items.length} 道题`;
  $('#active-filter-summary').textContent = filterCount ? `已使用 ${filterCount} 类筛选` : '全部已发布题目';
  $('#question-list').innerHTML = visible.length ? visible.map(question => {
    const source = sourceById.get(question.sourceId) || {};
    const stem = String(question.stemLatex || '').replace(/\s+/g, ' ').trim();
    const topicsText = question.topicIds.map(id => topicById.get(id)?.name).filter(Boolean).join('、');
    return `<button class="question-card" type="button" data-question-id="${escapeHtml(question.id)}"><div class="card-top"><span class="source-chip">${escapeHtml(source.category || '未关联来源')}</span><span class="card-source">${escapeHtml(source.title || '个人录入')}${question.questionNumber ? ` · ${escapeHtml(question.questionNumber)}` : ''}</span></div><div class="card-stem">${escapeHtml(stem.length > 210 ? `${stem.slice(0, 210)}…` : stem)}</div><div class="card-footer"><span>${escapeHtml(topicsText || '未标考点')}</span><span class="difficulty-pill difficulty-${question.difficulty}">${DIFFICULTY[question.difficulty - 1]}</span><span>${escapeHtml(question.questionType)}</span></div></button>`;
  }).join('') : `<div class="empty-state"><div class="empty-icon">∅</div><h2>${data.questions.length ? '没有找到符合条件的题目' : '题库暂时没有已发布题目'}</h2><p>${data.questions.length ? '试试放宽年份、难度或考点条件。' : '老师录入并校对题目后，这里会自动显示。'}</p></div>`;
  $('#pagination').innerHTML = maxPage > 1 ? `<button type="button" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>上一页</button><span>第 ${currentPage} / ${maxPage} 页</span><button type="button" data-page="${currentPage + 1}" ${currentPage === maxPage ? 'disabled' : ''}>下一页</button>` : '';
  renderMath($('#question-list'));
}

function detailSection(title, value, empty = '尚未填写') {
  return `<section class="detail-section"><h3>${title}</h3><div class="latex-content">${value ? escapeHtml(value) : `<span class="muted">${empty}</span>`}</div></section>`;
}

function openDetail(id) {
  const question = questionById.get(id);
  if (!question) return;
  selectedQuestion = question;
  const source = sourceById.get(question.sourceId) || {};
  const tags = question.topicIds.map(topicId => topicById.get(topicId)?.name).filter(Boolean);
  $('#detail-body').innerHTML = `<div class="detail-meta"><span class="source-chip">${escapeHtml(source.category || '个人录入')}</span><span>${escapeHtml(source.title || '未关联试卷')}${question.questionNumber ? ` · ${escapeHtml(question.questionNumber)}` : ''}</span><span>难度 ${question.difficulty} · ${DIFFICULTY[question.difficulty - 1]}</span></div>${detailSection('题干 · LaTeX', question.stemLatex)}<div class="detail-tags">${tags.length ? tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('') : '<span>未标考点</span>'}</div>${detailSection('参考答案', question.answerLatex)}<div class="solution-grid">${detailSection('官方答案', question.officialAnswer, '暂未录入官方答案')}${detailSection('官方完整解析', question.officialSolution, '暂未录入官方解析')}</div>${question.officialSource ? `<p class="solution-source">解答出处：${escapeHtml(question.officialSource)}</p>` : ''}${detailSection('AI 参考解答', question.aiSolution, '尚未生成或录入 AI 解答')}<div id="similar-results"></div>`;
  renderMath($('#detail-body'));
  if (!$('#detail-dialog').open) $('#detail-dialog').showModal();
}

function showSimilar() {
  if (!selectedQuestion) return;
  const baseTopics = new Set(selectedQuestion.topicIds);
  const matches = data.questions.filter(question => question.id !== selectedQuestion.id).map(question => {
    const shared = question.topicIds.filter(id => baseTopics.has(id)).length;
    return { question, shared, score: shared * 10 - Math.abs(question.difficulty - selectedQuestion.difficulty) };
  }).filter(item => item.shared > 0).sort((a, b) => b.score - a.score).slice(0, 8);
  $('#similar-results').innerHTML = `<section class="detail-section"><h3>相似题 · 考点与难度</h3>${matches.length ? matches.map(({ question, shared }) => `<button type="button" class="similar-item" data-question-id="${escapeHtml(question.id)}"><strong>${escapeHtml(String(question.stemLatex).slice(0, 120))}</strong><span>${escapeHtml(sourceById.get(question.sourceId)?.title || '个人录入')} · 共有 ${shared} 个考点</span></button>`).join('') : '<p class="muted">暂无共享考点的其他题目。</p>'}</section>`;
  renderMath($('#similar-results'));
}

function init() {
  const values = Object.fromEntries(new FormData($('#filters')));
  const checkedTopics = new Set([...document.querySelectorAll('#filter-topics input:checked')].map(input => input.value));
  $('#sidebar-question-count').textContent = data.questions.length;
  $('#sidebar-source-count').textContent = data.sources.length;
  $('#source-count').textContent = `${data.sources.length} 份`;
  optionList('#filter-category', data.options.sourceCategories || [], '全部来源');
  optionList('#filter-region', [...new Set(data.sources.map(s => s.region).filter(Boolean))].sort(), '全部地区');
  optionList('#filter-school', [...new Set(data.sources.map(s => s.school).filter(Boolean))].sort(), '全部学校');
  optionList('#filter-exam-type', data.options.examTypes || [], '全部类型');
  optionList('#filter-source', data.sources, '全部试卷', source => source.id, source => source.title);
  optionList('#filter-question-type', data.options.questionTypes || [], '全部题型');
  for (const selector of ['#filter-difficulty-min', '#filter-difficulty-max']) optionList(selector, DIFFICULTY.map((name, i) => `${i + 1} · ${name}`), '不限', value => value[0]);
  topicTree();
  for (const [name, value] of Object.entries(values)) {
    if (name !== 'topicIds' && $('#filters').elements[name]) $('#filters').elements[name].value = value;
  }
  for (const input of document.querySelectorAll('#filter-topics input')) input.checked = checkedTopics.has(input.value);
  $('#source-list').innerHTML = data.sources.length ? data.sources.map(source => `<div class="source-card"><div class="source-card-icon">▤</div><div><strong>${escapeHtml(source.title)}</strong><p>${escapeHtml([source.region, source.school, source.examType, source.examYear, source.paper].filter(Boolean).join(' · ') || '尚未补充来源信息')}</p></div><span class="source-chip">${escapeHtml(source.category)}</span></div>`).join('') : '<div class="empty-state compact"><div class="empty-icon">▤</div><h2>暂无已发布试卷</h2><p>老师发布题目后，对应试卷会显示在这里。</p></div>';
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
$('#reset-filters').addEventListener('click', () => { $('#filters').reset(); document.querySelectorAll('#filter-topics input').forEach(input => input.checked = false); search(); });
let searchDelay;
$('#filter-query').addEventListener('input', () => { clearTimeout(searchDelay); searchDelay = setTimeout(() => search(), 250); });
$('#question-list').addEventListener('click', event => { const button = event.target.closest('[data-question-id]'); if (button) openDetail(button.dataset.questionId); });
$('#pagination').addEventListener('click', event => { const button = event.target.closest('[data-page]'); if (button) search(Number(button.dataset.page)); });
$('#close-detail').addEventListener('click', () => $('#detail-dialog').close());
$('#similar-button').addEventListener('click', showSimilar);
$('#detail-body').addEventListener('click', event => { const button = event.target.closest('[data-question-id]'); if (button) { $('#detail-dialog').close(); openDetail(button.dataset.questionId); } });
loadSnapshot().catch(error => {
  $('#question-list').innerHTML = `<div class="empty-state"><h2>暂时无法加载题库</h2><p>${escapeHtml(error.message)}</p></div>`;
});
setInterval(() => loadSnapshot().catch(console.error), 30_000);
