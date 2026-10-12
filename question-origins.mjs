// Only source metadata belongs in display labels and student snapshots.
export function questionOriginMetadata(question = {}) {
  const rows = Array.isArray(question.origins) && question.origins.length ? question.origins : [question];
  const seen = new Set();
  return rows.map(row => ({
    sourceId: row.sourceId ?? row.source_id ?? null,
    questionYear: row.questionYear || row.question_year || row.examYear || row.source_year || '',
    paperTitle: row.paperTitle || row.paper_title || row.sourceTitle || row.source_title || row.title || '',
    questionNumber: String(row.questionNumber || row.question_number || '').trim().replace(/^第\s*/, '').replace(/\s*题$/, ''),
    sourceTitle: row.sourceTitle || row.source_title || '',
    examYear: row.examYear || row.source_year || '',
    sourceCategory: row.sourceCategory || row.source_category || row.category || '',
    region: row.region || row.source_region || '',
    school: row.school || row.source_school || '',
    schoolTier: row.schoolTier || row.source_school_tier || '',
    examType: row.examType || row.source_exam_type || '',
    paperFamily: row.paperFamily || row.source_paper_family || ''
  })).filter(row => {
    const key = JSON.stringify([row.sourceId, row.questionYear, row.paperTitle, row.questionNumber]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function questionOriginLabels(question) {
  return [...new Set(questionOriginMetadata(question).map(origin => [
    origin.questionYear&&!(origin.paperTitle||origin.sourceTitle).includes(String(origin.questionYear))?origin.questionYear:'',
    origin.paperTitle || origin.sourceTitle || '个人录入',
    origin.questionNumber ? `第 ${origin.questionNumber} 题` : ''
  ].filter(Boolean).join(' · ')))];
}
