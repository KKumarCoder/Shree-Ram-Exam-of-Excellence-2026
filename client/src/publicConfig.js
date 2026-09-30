// Only public content structure is normalised here. Official values are never invented.
const collections = ['importantDates', 'syllabus', 'resources', 'faq', 'notices', 'guidelines', 'journey', 'awardRules'];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function mergePublicConfig(defaults, response) {
  // A misconfigured proxy can return index.html with HTTP 200 instead of JSON.
  if (!isObject(response)) throw new Error('Invalid public configuration response');
  const portal = isObject(response.portal) ? {...response.portal} : {};
  for (const key of collections) portal[key] = Array.isArray(portal[key]) ? portal[key].filter(isObject) : [];
  portal.examPattern = isObject(portal.examPattern) ? {...portal.examPattern} : {};
  portal.examPattern.sections = Array.isArray(portal.examPattern.sections) ? portal.examPattern.sections.filter(isObject) : [];
  portal.syllabus = portal.syllabus.map(item => ({...item, topics:Array.isArray(item.topics) ? item.topics : []}));
  const examDate = response.examDate || portal.importantDates.find(item => /^(examination day|exam(?:ination)? date|examination)$/i.test(item.title || ''))?.date || defaults.examDate;
  return {...defaults, ...response, examDate, portal};
}
