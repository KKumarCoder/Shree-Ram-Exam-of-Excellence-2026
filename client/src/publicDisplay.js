// Display-only helpers: never infer examination policy or candidate progress.
export function formatPublicDate(value) {
  if (!value || typeof value !== 'string') return 'To be announced';
  const text = value.trim();
  if (!text || /^(TBA|to be announced)$/i.test(text)) return 'To be announced';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  const local = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!iso && !local) return text; // Preserve school-written labels and date ranges.
  const [year, month, day] = iso ? iso.slice(1).map(Number) : [Number(local[3]), Number(local[2]), Number(local[1])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return 'To be announced';
  return new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(date);
}
export const publicLinkAvailable = value => typeof value === 'string' && (/^\/(?!\/)[^\\\s]*$/.test(value) || /^https:\/\/[^\s\\]+$/.test(value));
export function classResources(settings, studentClass, category) {
  const resources = (settings.portal?.resources || []).filter(r => r.category === category && (!r.studentClass || r.studentClass === studentClass));
  const syllabus = (settings.portal?.syllabus || []).filter(s => s.studentClass === studentClass);
  if (category === 'sample-paper') {
    for (const s of syllabus) if (publicLinkAvailable(s.samplePaperUrl) && !resources.some(r => r.fileUrl === s.samplePaperUrl || r.previewUrl === s.samplePaperUrl)) resources.push({title:'Sample Paper',studentClass,category,fileUrl:s.samplePaperUrl});
  }
  return resources;
}
export function preparationAvailability(settings, studentClass) {
  const publishedFile = r => publicLinkAvailable(r.fileUrl) || publicLinkAvailable(r.previewUrl);
  const syllabus = (settings.portal?.syllabus || []).some(s => s.studentClass === studentClass && (s.topics?.length || s.description || publicLinkAvailable(s.fileUrl))) || classResources(settings,studentClass,'syllabus').some(publishedFile);
  return {syllabus, samplePaper:classResources(settings,studentClass,'sample-paper').some(publishedFile), examPattern:!!settings.portal?.examPattern?.isPublished};
}
export function eligibleClassLabel(settings) {
  const classes = (settings.eligibleClasses || []).map(String);
  if (!classes.length) return 'To be announced';
  const numbers = [...new Set(classes.map(Number))].sort((a,b)=>a-b);
  return numbers.length > 1 && numbers.every((n,i)=>!i || n === numbers[i-1]+1) ? `${numbers[0]}–${numbers.at(-1)}` : classes.join(', ');
}
