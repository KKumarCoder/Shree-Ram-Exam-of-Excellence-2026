import {StudentArtwork} from './StudentArtwork.jsx';
import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, FileText, Clock3, Check, GraduationCap, CalendarDays, LifeBuoy, FolderOpen, MapPin, ClipboardCheck, LogIn, PencilLine, Flag, ArrowUpRight } from 'lucide-react';
import {formatPublicDate} from './publicDisplay.js';
import { Timeline, ResourceLink } from './PortalComponents.jsx';

export function GuidanceCards({ title, items }) {
  const icons = [BookOpen, Clock3, GraduationCap, FileText];
  return <section className="public-block"><h2>{title}</h2><div className={`portal-grid${items.length === 4 ? ' guidance-four' : ''}`}>{items.map(([heading, copy], i) => { const Icon = icons[i % icons.length]; return <article className="portal-card" key={heading}><Icon aria-hidden="true"/><h3>{heading}</h3><p>{copy}</p></article>; })}</div></section>;
}
export function SectionCTA({ title = 'Prepare with confidence', links = [['/syllabus', 'View Syllabus'], ['/sample-papers', 'Explore Sample Papers']] }) {
  return <section className="portal-card public-cta"><div><span className="school-page-eyebrow">YOUR NEXT STEP</span><h2>{title}</h2></div><div className="portal-actions">{links.map(([url, label], i) => <Link key={url} className={`btn ${i ? 'light' : 'gold'}`} to={url}>{label} →</Link>)}</div></section>;
}
export function PreparationChecklist() {
  return <section className="public-block"><h2>Your preparation checklist</h2><ol className="preparation-checklist">{['Review syllabus', 'Practice topic-wise', 'Attempt sample paper', 'Check mistakes', 'Revise weak areas', 'Prepare for exam day'].map((text, i) => <li key={text}><span>{String(i + 1).padStart(2, '0')}</span><Check size={18} aria-hidden="true"/>{text}</li>)}</ol></section>;
}
export function PageVisual({ path }) {
  return <StudentArtwork path={path} className="public-student-artwork"/>;
}
export const patternGuidance = [['Question Structure', 'The official question format and total number of questions will appear here after confirmation.'], ['Marking Scheme', 'Confirmed marks and marking instructions will help you understand how answers are assessed.'], ['Time Allocation', 'The official examination duration will appear here once published.'], ['Section Details', 'Published subject or skill-based sections will help you plan your preparation.']];
export const practiceGuidance = [['Know the Format', 'Understand how questions are presented.'], ['Practice Time Management', 'Learn to work within an examination setting.'], ['Identify Strengths', 'See which areas need more revision.'], ['Build Confidence', 'Become familiar with the examination experience.']];
export const dateGuidance = [['Registration', 'Complete your application early and keep your registration reference safely.'], ['Admit Card', 'Download your admit card after it is officially released.'], ['Exam Day', 'Check reporting instructions and examination guidelines before arriving.'], ['Result', 'Use the official status/result page when results are published.']];
export function ExamDayOverview({settings}) {
  return <dl className="portal-grid glance-grid exam-day-overview">{[[CalendarDays,'Exam Date',formatPublicDate(settings.examDate)],[Clock3,'Reporting Time',settings.reportingTime],[Clock3,'Exam Time',settings.examTime]].map(([Icon,label,value])=><div className="portal-card" key={label}><Icon size={21} aria-hidden="true"/><dt>{label}</dt><dd>{value || 'To be announced'}</dd></div>)}<div className="portal-card exam-venue"><MapPin size={25} aria-hidden="true"/><div><dt>Venue</dt><dd>{settings.venue || 'To be announced'}</dd></div><ResourceLink href={settings.portal?.locationUrl} target="_blank" rel="noopener noreferrer">View location <ArrowUpRight size={16}/></ResourceLink></div></dl>;
}
export function GeneralExamGuidance() {
  const items = [[CalendarDays,'Before Exam Day', 'Keep your admit card ready. Check official reporting instructions before travelling.'], [LogIn,'On Arrival', 'Follow directions given by examination staff.'], [ClipboardCheck,'Before Starting', 'Read the question paper instructions carefully.'], [PencilLine,'During the Examination', 'Manage your time appropriately and follow the published instructions.'], [Flag,'After the Examination', 'Follow the examination staff’s directions and check school notices for further updates.']];
  return <section className="public-block"><h2>Your exam-day checklist</h2><p>Official instructions will appear on the admit card / examination notice.</p><div className="exam-checklist-layout"><ol className="exam-checklist" aria-label="General examination preparation">{items.map(([Icon,title,copy],i)=><li key={title} className={i===0 || i===2 ? 'checklist-emphasis' : ''}><span className="exam-checklist-icon"><Icon size={21} aria-hidden="true"/></span><div><span className="portal-meta">STEP 0{i+1}</span><h3>{title}</h3><p>{copy}</p></div></li>)}</ol><figure className="exam-study-visual"><img src="/images/shree-2026/exam-day-students.png" alt="Students ready for examination day with their documents" width="1448" height="1086" loading="lazy"/><figcaption><span className="school-page-eyebrow">PREPARE WITH CONFIDENCE</span><h3>A little preparation. A calmer exam day.</h3><p>Review the school’s published instructions and keep your application reference handy.</p><Link to="/status">Check application status <ArrowUpRight size={16}/></Link></figcaption></figure></div></section>;
}
function hasPublishedResource(settings, category) {
  const resources = settings.portal?.resources || [];
  if (category === 'syllabus' && (settings.portal?.syllabus || []).some(s => s.fileUrl)) return true;
  if (category === 'answer-key' && resources.some(r => r.answerKeyUrl)) return true;
  return resources.some(r => r.category === category && (r.fileUrl || r.previewUrl));
}
export function DownloadGroups({ settings }) {
  const groups = [['Preparation', [['Syllabus', '/syllabus', 'syllabus'], ['Sample Papers', '/sample-papers', 'sample-paper'], ['Answer Keys', '', 'answer-key']]], ['Examination', [['Information Bulletin', '/information-bulletin', 'bulletin'], ['Exam Guidelines', '/exam-guidelines', 'guideline'], ['Admit Card Instructions', '', 'admit-card-instructions']]], ['Candidate Services', [['Application Receipt', '/status', 'service'], ['Admit Card', '/status', 'service'], ['Result / Certificate', '/results', 'result']]]];
  return <section className="public-block"><h2>Find your resources</h2><div className="portal-grid">{groups.map(([title, items]) => <article className="portal-card" key={title}><FolderOpen aria-hidden="true"/><h3>{title}</h3><ul className="download-group">{items.map(([name, url, category]) => <li key={name}>{url ? <Link to={url}>{name} →</Link> : <strong>{name}</strong>}<span className="portal-meta">{category === 'service' ? 'Check availability securely' : hasPublishedResource(settings, category) ? 'Published · see page or documents below' : 'Coming Soon'}</span></li>)}</ul></article>)}</div></section>;
}
