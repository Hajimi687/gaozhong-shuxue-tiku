// Shared by the local API and the static reader. It only recognizes names already in the catalog.
export const PROVINCE_NAMES = ['北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
  '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南',
  '广东', '广西', '海南', '重庆', '四川', '贵州', '云南', '西藏', '陕西', '甘肃',
  '青海', '宁夏', '新疆', '香港', '澳门', '台湾'];

export function canonicalRegion(value) {
  const text = String(value || '').trim();
  if (PROVINCE_NAMES.includes(text)) return text;
  const special = {
    '内蒙古自治区': '内蒙古', '广西壮族自治区': '广西',
    '宁夏回族自治区': '宁夏', '新疆维吾尔自治区': '新疆',
    '西藏自治区': '西藏', '香港特别行政区': '香港', '澳门特别行政区': '澳门'
  };
  if (special[text]) return special[text];
  return PROVINCE_NAMES.find(name => [`${name}省`, `${name}市`, `${name}自治区`].includes(text)) || text;
}

export function canonicalExamType(value) {
  return ['一模', '二模', '三模'].includes(value) ? '模拟考试' : value;
}

export function parseSearchIntent(raw, { sources = [], topics = [] } = {}) {
  let remaining = String(raw || '').trim();
  const filters = {};
  const recognized = [];
  const take = (term, label, key, value) => {
    const at = remaining.indexOf(term);
    if (at < 0) return false;
    remaining = `${remaining.slice(0, at)} ${remaining.slice(at + term.length)}`;
    if (key) filters[key] = value;
    recognized.push({ label, value: String(value ?? term) });
    return true;
  };

  // Longer category names first, so “上海高考” does not also become a region token.
  for (const [term, category] of [
    ['上海高考', '上海高考'], ['上海卷', '上海高考'],
    ['全国高考', '全国高考'], ['全国卷', '全国高考'],
    ['教辅习题', '教辅习题'], ['教辅', '教辅习题'], ['学校试卷', '学校试卷']
  ]) if (take(term, `来源：${category}`, 'category', category)) break;

  const year = remaining.match(/(?:19|20)\d{2}\s*年?/);
  if (year) take(year[0], `年份：${year[0].match(/\d{4}/)[0]}`, 'year', Number(year[0].match(/\d{4}/)[0]));

  const schoolNames = [...new Set(sources.map(source => source.school).filter(Boolean))].sort((a, b) => b.length - a.length);
  for (const name of schoolNames) if (take(name, `学校：${name}`, 'school', name)) break;

  for (const tier of ['四校', '八大']) if (take(tier, `上海学校：${tier}`, 'schoolTier', tier)) break;
  for (const [term, type] of [
    ['模拟考试', '模拟考试'], ['一模', '模拟考试'], ['二模', '模拟考试'], ['三模', '模拟考试'],
    ['模拟卷', '模拟考试'], ['春考', '春考'], ['秋考', '秋考'], ['期中', '期中'],
    ['期末', '期末'], ['月考', '月考'], ['联考', '联考']
  ]) if (take(term, `考试：${type}`, 'examType', type)) break;

  const provinceTerms = PROVINCE_NAMES.flatMap(name => [
    [`${name}特别行政区`, name], [`${name}壮族自治区`, name], [`${name}回族自治区`, name],
    [`${name}维吾尔自治区`, name], [`${name}自治区`, name], [`${name}省`, name],
    [`${name}市`, name], [name, name]
  ]).sort((a, b) => b[0].length - a[0].length);
  for (const [term, name] of provinceTerms) if (take(term, `地区：${name}`, 'region', name)) break;

  const difficulty = remaining.match(/难度\s*[1-5]/);
  if (difficulty) take(difficulty[0], `难度：${difficulty[0].match(/[1-5]/)[0]}`, 'difficulty', Number(difficulty[0].match(/[1-5]/)[0]));
  else for (const [term, n] of [['压轴', 5], ['较难', 4], ['中等', 3], ['较易', 2], ['基础', 1]]) {
    if (take(term, `难度：${n}`, 'difficulty', n)) break;
  }

  for (const type of ['多选题', '选择题', '填空题', '解答题']) {
    if (take(type, `题型：${type}`, 'questionType', type)) break;
  }
  const number = remaining.match(/第\s*[0-9一二三四五六七八九十]+\s*题/);
  if (number) take(number[0], `题号：${number[0]}`, 'questionNumber', number[0].replace(/\s/g, ''));

  const topicHits = [];
  for (const topic of [...topics].sort((a, b) => b.name.length - a.name.length)) {
    if (topic.name.length < 2) continue;
    if (take(topic.name, `考点：${topic.name}`, null, topic.name)) topicHits.push(topic.id);
    if (topicHits.length >= 3) break;
  }
  if (topicHits.length) filters.topicIds = topicHits;
  return { filters, remaining: remaining.replace(/\s+/g, ' ').trim(), recognized };
}
