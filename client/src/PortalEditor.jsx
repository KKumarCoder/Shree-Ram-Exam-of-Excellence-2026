import { notify } from "./notifications.js";
import React, { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { branding, supportedClasses } from './portalData.js';
const resourceCategories = ['syllabus', 'sample-paper', 'answer-key', 'bulletin', 'guideline', 'notice-attachment', 'download'];
const publication = [['isPublished', 'Published', 'boolean'], ['sortOrder', 'Display order', 'number']];
const collections = {
  importantDates: {
    title: 'Important dates',
    fields: [['title', 'Milestone'], ['date', 'Date / announcement'], ['description', 'Description', 'long'], ['status', 'Status', ['TBA', 'upcoming', 'active', 'completed']]]
  },
  syllabus: {
    title: 'Class-wise syllabus',
    fields: [['studentClass', 'Class', supportedClasses], ['title', 'Title'], ['description', 'Description', 'long'], ['topics', 'Topics (one per line)', 'lines'], ['fileUrl', 'Syllabus PDF URL'], ['samplePaperUrl', 'Sample paper URL']]
  },
  resources: {
    title: 'Documents & sample papers',
    fields: [['title', 'Title'], ['category', 'Category', resourceCategories], ['studentClass', 'Class (blank for all)', ['', ...supportedClasses]], ['description', 'Description', 'long'], ['fileUrl', 'Download URL'], ['previewUrl', 'Preview URL'], ['answerKeyUrl', 'Answer key URL'], ['fileType', 'File type'], ['pages', 'Pages'], ['fileSize', 'File size'], ['year', 'Year / version'], ['publishedAt', 'Publication date']]
  },
  faq: {
    title: 'FAQs',
    fields: [['question', 'Question'], ['answer', 'Answer', 'long'], ['category', 'Category']]
  },
  notices: {
    title: 'Notices',
    fields: [['title', 'Title'], ['date', 'Date'], ['category', 'Category'], ['description', 'Description', 'long'], ['link', 'Attachment or link'], ['isNew', 'Show NEW badge', 'boolean'], ['pinned', 'Pin notice', 'boolean']]
  },
  guidelines: {
    title: 'Exam-day guidelines',
    fields: [['title', 'Step / heading'], ['description', 'Instruction', 'long']]
  },
  journey: {
    title: 'Candidate journey',
    fields: [['title', 'Step'], ['description', 'Description', 'long'], ['link', 'Optional link']]
  },
  awardRules: {
    title: 'Award rules & recognition',
    fields: [['title', 'Title'], ['description', 'Official rule', 'long'], ['link', 'Supporting document URL']]
  }
};
const emptyItem = fields => Object.fromEntries(fields.map(([key,, type]) => [key, type === 'boolean' ? false : type === 'number' ? 0 : type === 'lines' ? [] : Array.isArray(type) ? type[0] : '']));
function Fields({
  fields,
  value,
  onChange
}) {
  return <div className="form-grid">{fields.map(([key, label, type]) => <label key={key} data-field={key}><span>{label}</span>{type === 'boolean' ? <input type="checkbox" checked={!!value[key]} onChange={e => onChange(key, e.target.checked)} /> : Array.isArray(type) ? <select value={value[key] ?? type[0]} onChange={e => onChange(key, e.target.value)}>{type.map(v => <option value={v} key={v}>{v || 'All classes'}</option>)}</select> : type === 'long' || type === 'lines' ? <textarea value={type === 'lines' ? (value[key] || []).join('\n') : value[key] || ''} onChange={e => onChange(key, type === 'lines' ? e.target.value.split('\n') : e.target.value)} /> : <input type={type === 'number' ? 'number' : 'text'} min={type === 'number' ? 0 : undefined} value={value[key] ?? ''} onChange={e => onChange(key, type === 'number' ? Number(e.target.value) : e.target.value)} />}</label>)}</div>;
}
export function PortalEditor({
  settings,
  onSaved
}) {
  const editorRef = useRef(null);
  const [invalidField, setInvalidField] = useState(null);
  const [content, setContent] = useState(() => structuredClone(settings.portal || {}));
  const [name, setName] = useState(settings.eventName || branding.eventName);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (busy || !invalidField) return;
    const section = editorRef.current?.querySelector(`[data-collection="${invalidField.collection}"]`);
    if (!section) return;
    section.open = true;
    const row = section.querySelectorAll('.portal-editor-row')[invalidField.index];
    const field = row?.querySelector(`[data-field="${invalidField.field}"] input, [data-field="${invalidField.field}"] textarea, [data-field="${invalidField.field}"] select`);
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [invalidField, busy]);
  const change = (key, value) => setContent(prev => ({
    ...prev,
    [key]: value
  }));
  async function save() {
    setBusy(true);
    setInvalidField(null);
    try {
      const cleaned = structuredClone(content);
      cleaned.syllabus = cleaned.syllabus?.map(s => ({
        ...s,
        topics: s.topics?.map(t => t.trim()).filter(Boolean)
      }));
      const r = await api.put('/admin/portal', {
        eventName: name,
        portal: cleaned
      });
      setContent(r.data.portal);
      onSaved(r.data);
      notify.success('Public content saved. Only entries marked Published are visible on the website.');
    } catch (e) {
      const match = e.message?.match(/^portal\.(\w+)\.(\d+)\.(\w+): (.*)$/s);
      const collection = match && collections[match[1]];
      const field = collection?.fields.find(([key]) => key === match[3]);
      if (field) {
        const index = Number(match[2]);
        const detail = match[4].startsWith('String must contain at least 1 character(s)')
          ? `Enter ${field[1]} or remove this entry if it was added by mistake.`
          : match[4];
        notify.error(`${collection.title} — entry ${index + 1} — ${field[1]}: ${detail}`);
        setInvalidField({ collection: match[1], index, field: match[3] });
      } else {
        notify.error(e.message);
      }
    } finally {
      setBusy(false);
    }
  }
  return <section className="portal-editor" ref={editorRef}><h2>Public portal content</h2><p>Add official information below. Leave unknown values blank. Mark individual entries Published when ready. This saves public content separately from event and payment settings.</p><p>Document links must use HTTPS or a local public path. Upload official PDFs to your public website or document host first; student uploads remain private.</p><fieldset disabled={busy} style={{
      border: 0,
      padding: 0,
      minWidth: 0
    }}><details><summary>Branding, support & announcement</summary><label><span>Official event display name</span><input value={name} onChange={e => setName(e.target.value)} /></label><Fields fields={[["eventShortName", "Short name"], ["eventYear", "Year"], ["eventSubtitle", "Event subtitle"], ["examMode", "Exam mode"], ["schoolAddress", "School address", "long"], ["officeHours", "Helpdesk office hours"], ["eligibilityNotes", "Additional eligibility information", "long"], ["paymentPolicy", "Official payment policy", "long"]]} value={{
          ...branding,
          ...content
        }} onChange={change} /><h3>Announcement bar</h3><Fields fields={[["enabled", "Enable announcement", "boolean"], ["text", "Announcement"], ["date", "Date"], ["isNew", "Show NEW badge", "boolean"], ["link", "Optional link"]]} value={content.announcement || {}} onChange={(key, value) => change('announcement', {
          ...content.announcement,
          [key]: value
        })} /></details>
  <details><summary>Exam pattern</summary><Fields fields={[["isPublished", "Publish exam pattern", "boolean"], ["totalQuestions", "Total questions"], ["totalMarks", "Total marks"], ["duration", "Duration"], ["questionType", "Question type"], ["medium", "Medium / language"], ["negativeMarking", "Negative marking"]]} value={content.examPattern || {}} onChange={(key, value) => change('examPattern', {
          ...content.examPattern,
          [key]: value
        })} />{(content.examPattern?.sections || []).map((row, index) => <div className="portal-editor-row" key={index}><h3>Section {index + 1}</h3><Fields fields={[["title", "Section name"], ["questions", "Questions"], ["marks", "Marks"], ["description", "Description", "long"]]} value={row} onChange={(key, value) => change('examPattern', {
            ...content.examPattern,
            sections: content.examPattern.sections.map((s, i) => i === index ? {
              ...s,
              [key]: value
            } : s)
          })} /><button className="btn light remove-content" onClick={() => change('examPattern', {
            ...content.examPattern,
            sections: content.examPattern.sections.filter((_, i) => i !== index)
          })}>Remove section</button></div>)}<button className="btn light" onClick={() => change('examPattern', {
          ...content.examPattern,
          sections: [...(content.examPattern?.sections || []), {
            title: '',
            questions: '',
            marks: '',
            description: ''
          }]
        })}>Add section</button></details>
  {Object.entries(collections).map(([key, {
        title,
        fields
      }]) => <details key={key} data-collection={key}><summary>{title} ({(content[key] || []).length})</summary>{(content[key] || []).map((row, index) => <div className="portal-editor-row" key={index}><h3>{title} · {index + 1}</h3><Fields fields={[...fields, ...publication]} value={row} onChange={(field, value) => change(key, content[key].map((r, i) => i === index ? {
            ...r,
            [field]: value
          } : r))} /><button className="btn light remove-content" onClick={() => change(key, content[key].filter((_, i) => i !== index))}>Remove entry {index + 1}</button></div>)}<button className="btn light" onClick={() => change(key, [...(content[key] || []), emptyItem([...fields, ...publication])])}>Add {title.toLowerCase()} entry</button></details>)}<button className="btn gold" onClick={save}>{busy ? 'Saving…' : 'Save public content'}</button></fieldset></section>;
}
