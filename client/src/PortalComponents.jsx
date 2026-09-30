import React, { useState } from 'react';
import './candidate-services.css';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, FileText, Search, Download, BookOpen, LifeBuoy, CalendarDays, Check, Clock3 } from 'lucide-react';
import { applicationStages, currentFaq, eventBrand, supportedClasses, portalRoutes } from './portalData.js';
import {formatPublicDate, preparationAvailability, eligibleClassLabel, classResources, publicLinkAvailable} from './publicDisplay.js';
// Public content stays mounted while live information loads or fails.
export function PublicDataNotice({ loading, error, retry }) {
  if (!loading && !error) return null;
  return <div className="public-data-notice" role="status"><span>{loading ? 'Updating live examination details…' : 'Some live examination details are temporarily unavailable. General information is still available below.'}</span>{error && <button className="btn outlined-dark" onClick={retry}>Retry</button>}</div>;
}
export function ContentState({ loading, error, retry, children }) {
  return <><PublicDataNotice loading={loading} error={error} retry={retry}/>{children}</>;
}
export function EmptyContent({
  children
}) {
  return <div className="portal-state"><Clock3 size={24} aria-hidden="true" /><p>{children || 'Details will be announced shortly.'}</p><Link to="/notices">View school updates →</Link></div>;
}
export function PortalHeading({
  eyebrow = 'OFFICIAL EXAMINATION PORTAL',
  title,
  copy
}) {
  return <div className="portal-heading"><span className="school-page-eyebrow">{eyebrow}</span><h2>{title}</h2>{copy && <p>{copy}</p>}</div>;
}
export function CandidateServices() {
  const services = [['/register', FileText, 'Apply Online', 'Start your application.'], ['/status', Search, 'Check Status', 'View your verified application.'], ['/status', Download, 'Download Admit Card', 'Access after payment confirmation.'], ['/syllabus', BookOpen, 'View Syllabus', 'Find information for your class.'], ['/sample-papers', FileText, 'Sample Papers', 'Explore published practice resources.'], ['/help', LifeBuoy, 'Help Desk', 'Get support from the school.']];
  return <section className="portal-section shell candidate-services"><PortalHeading eyebrow="YOUR NEXT STEP" title="Candidate Services" /><div className="portal-grid services-grid">{services.map(([url, Icon, title, copy], index) => <Link className={`portal-card service-card service-tone-${index}`} key={title} to={url}><span className="service-icon"><Icon size={27} aria-hidden="true" /></span><span className="service-number" aria-hidden="true">0{index + 1}</span><h3>{title}</h3><p>{copy}</p><span className="service-action" aria-hidden="true">Explore service <ArrowUpRight size={17}/></span><ArrowUpRight className="service-arrow" size={19} aria-hidden="true" /></Link>)}</div></section>;
}
export function AtAGlance({
  settings
}) {
  return <dl className="portal-grid glance-grid">{[['Eligible classes', eligibleClassLabel(settings)], ['Registration fee', `₹${settings.fee}`], ['Exam date', formatPublicDate(settings.examDate)], ['Exam mode', settings.portal?.examMode], ['Venue', settings.venue], ['Registration', settings.registrationOpen ? 'Open' : 'Currently closed']].map(([title, value]) => <div className="portal-card" key={title}><dt>{title}</dt><dd>{value || 'To be announced'}</dd></div>)}</dl>;
}
export function Timeline({
  items,
  vertical = false,
  label,
  className = ''
}) {
  return <ol aria-label={label} className={`portal-timeline${vertical ? ' vertical' : ''} ${className}`}>{items.map((item, index) => <li key={`${item.title}-${index}`} className={`stage-${item.status || 'upcoming'}`}><span className="timeline-dot" aria-hidden="true">{item.status === 'completed' ? <Check size={16} /> : String(index + 1).padStart(2, '0')}</span><div><h3>{item.title}</h3>{item.date && <strong>{formatPublicDate(item.date)}</strong>}{item.status && <span className="portal-badge">{item.status === 'TBA' ? 'To be announced' : item.status}</span>}{item.description && <p>{item.description}</p>}{item.link && <ResourceLink href={item.link}>Explore →</ResourceLink>}</div></li>)}</ol>;
}
export function ImportantDatesTimeline({
  settings
}) {
  const dates = settings.portal?.importantDates || [];
  const names = ['Registration Opens', 'Registration Deadline', 'Application / Verification Window', 'Admit Card Release', 'Examination Day', 'Result Declaration', 'Awards / Recognition'];
  const aliases = [/registration opens?/i, /registration deadline/i, /application|verification|correction/i, /admit card/i, /exam/i, /result/i, /award|recognition/i];
  const used = new Set();
  const milestones = names.map((title, index) => {
    const match = dates.find(d => aliases[index].test(d.title));
    if (match) used.add(match);
    const date = index === 4 ? settings.examDate : match?.date;
    const matchingDate = index !== 4 || formatPublicDate(match?.date) === formatPublicDate(date);
    return { ...match, title, date: date || 'To be announced', status: formatPublicDate(date) !== 'To be announced' && matchingDate && ['completed','active','upcoming'].includes(match?.status) ? match.status : undefined };
  });
  return <Timeline items={[...milestones, ...dates.filter(d => !used.has(d))]} vertical className="important-dates-timeline" label="Important examination dates" />;
}
export function ExamSectionBreakdown({
  sections = []
}) {
  return sections.length > 0 && <div className="portal-table"><table><caption>Published examination sections</caption><thead><tr><th scope="col">Section</th><th scope="col">Questions</th><th scope="col">Marks</th><th scope="col">Details</th></tr></thead><tbody>{sections.map((s, i) => <tr key={i}><th scope="row">{s.title}</th><td>{s.questions ?? 'TBA'}</td><td>{s.marks ?? 'TBA'}</td><td>{s.description || 'To be announced'}</td></tr>)}</tbody></table></div>;
}
export function ExamPatternSummary({
  settings
}) {
  const pattern = settings.portal?.examPattern?.isPublished ? settings.portal.examPattern : {};
  return <dl className="portal-grid glance-grid">{[['Question Format', pattern.questionType], ['Total Questions', pattern.totalQuestions], ['Duration', pattern.duration], ['Total Marks', pattern.totalMarks], ['Medium', pattern.medium], ['Negative Marking', pattern.negativeMarking], ['Exam Mode', settings.portal?.examMode]].map(([label, value]) => <div className="portal-card" key={label}><dt>{label}</dt><dd>{value === 0 ? 0 : value || 'To be announced'}</dd></div>)}</dl>;
}
export function useClassFilter(fallback='') {
  const [params,setParams]=useSearchParams();
  const selected=params.get('class');
  const value=supportedClasses.includes(selected)?selected:fallback;
  const setValue=next=>{const copy=new URLSearchParams(params);if(next)copy.set('class',next);else copy.delete('class');setParams(copy,{replace:true});};
  return [value,setValue];
}
export function ClassSelector({
  value,
  onChange,
  all = false,
  id = 'portal-class'
}) {
  return <label className="portal-filter" htmlFor={id}><span>Choose class</span><select id={id} value={value} onChange={e => onChange(e.target.value)}>{all && <option value="">All classes</option>}{supportedClasses.map(c => <option key={c} value={c}>Class {c}</option>)}</select></label>;
}
export function ResourceLink({
  href,
  children,
  ...props
}) {
  if (!href || !(/^\/(?!\/)[^\\\s]*$/.test(href) || /^https:\/\/[^\s\\]+$/.test(href))) return null;
  return props.download === undefined && (portalRoutes[href.split('?')[0]] || ['/', '/register', '/status', '/prizes', '/scholarships'].includes(href)) ? <Link to={href} {...props}>{children}</Link> : <a href={href} {...props}>{children}</a>;
}
export function ComingSoonCard({title, copy, label}) {
  return <article className="portal-card coming-soon-card"><span className="coming-soon-icon"><FileText size={30} aria-hidden="true"/></span><div>{label && <span className="portal-meta">{label}</span>}<h3>{title}</h3><p>{copy}</p><span className="portal-badge"><Clock3 size={13} aria-hidden="true"/> Coming Soon</span></div></article>;
}
export function ResourceCards({
  resources = [],
  empty = 'Resources will be published shortly.'
}) {
  return resources.length ? <div className="portal-grid">{resources.map((r, i) => <article className="portal-card resource-card" key={i}><FileText aria-hidden="true" /><span className="portal-badge">{r.studentClass ? `Class ${r.studentClass}` : 'All classes'} · {r.fileType || 'Document'}</span><h3>{r.title}</h3><p>{r.description}</p><p className="portal-meta">{[r.category?.replaceAll('-', ' '), r.year, r.pages && `${r.pages} pages`, r.fileSize, r.publishedAt && formatPublicDate(r.publishedAt)].filter(Boolean).join(' · ')}</p><div className="portal-actions"><ResourceLink href={r.previewUrl || r.fileUrl} target="_blank" rel="noopener noreferrer">Preview →</ResourceLink><ResourceLink href={r.fileUrl} className="btn light" download>Download <Download size={16} /></ResourceLink><ResourceLink href={r.answerKeyUrl}>Answer key →</ResourceLink>{!r.fileUrl && !r.previewUrl && <span>Document coming soon</span>}</div></article>)}</div> : <EmptyContent>{empty}</EmptyContent>;
}
export function SamplePaperLibrary({settings}) {
  const [selected,setSelected] = useClassFilter('');
  const classes = selected ? [selected] : supportedClasses;
  return <><ClassSelector value={selected} onChange={setSelected} all/><div className="portal-grid sample-library">{classes.map(studentClass=>{
    const resources = classResources(settings,studentClass,'sample-paper');
    return <article className="portal-card resource-card" key={studentClass}><FileText aria-hidden="true"/><span className="portal-badge">Class {studentClass}</span><h3>{eventBrand(settings).eventShortName} {eventBrand(settings).eventYear} Sample Paper</h3>{resources.length ? resources.map((r,i)=><div className="sample-document" key={i}><h4>{r.title}</h4>{r.description && <p>{r.description}</p>}<div className="portal-actions"><ResourceLink href={r.previewUrl || r.fileUrl} target="_blank" rel="noopener noreferrer">Preview →</ResourceLink><ResourceLink href={r.fileUrl} download>Download <Download size={15}/></ResourceLink>{!publicLinkAvailable(r.previewUrl) && !publicLinkAvailable(r.fileUrl) && <span className="portal-badge">Coming Soon</span>}</div></div>) : <><p>Official sample paper for Class {studentClass} will be published shortly.</p><span className="portal-badge">Coming Soon</span></>}</article>;
  })}</div></>;
}
export function Syllabus({
  settings
}) {
  const [studentClass, setClass] = useClassFilter('1');
  const entries = (settings.portal?.syllabus || []).filter(s => s.studentClass === studentClass);
  const resources = (settings.portal?.resources || []).filter(r => r.category === 'syllabus' && r.studentClass === studentClass);
  return <><ClassSelector value={studentClass} onChange={setClass} /><div className="syllabus-switch" key={studentClass}>{entries.map((s, i) => <article className="portal-card syllabus-card" key={i}><span className="portal-badge">Class {studentClass}</span><h2>{s.title || `Class ${studentClass} syllabus`}</h2><p>{s.description}</p>{s.topics?.length > 0 && <ul>{s.topics.map((t, j) => <li key={j}>{t}</li>)}</ul>}<div className="portal-actions"><ResourceLink href={s.fileUrl} className="btn light" download>Download syllabus PDF</ResourceLink><ResourceLink href={s.samplePaperUrl}>Sample paper →</ResourceLink></div></article>)}{resources.length > 0 && <ResourceCards resources={resources} />} {!entries.length && !resources.length && <article className="portal-card syllabus-card"><BookOpen aria-hidden="true"/><span className="portal-badge">Class {studentClass} · Coming Soon</span><h2>Official syllabus</h2><p>Syllabus for Class {studentClass} will be published shortly.</p></article>}<p><Link className="portal-text-link" to={`/sample-papers?class=${studentClass}`}>Browse Class {studentClass} sample papers →</Link></p></div></>;
}
export function FAQList({
  settings,
  preview = false
}) {
  const [category, setCategory] = useState('All');
  const items = currentFaq(settings);
  const filtered = preview ? items.slice(0, 4) : items.filter(f => category === 'All' || f.category === category);
  return <>{!preview && <label className="portal-filter"><span>Question category</span><select value={category} onChange={e => setCategory(e.target.value)}>{['All', ...new Set(items.map(f => f.category || 'General'))].map(c => <option key={c}>{c}</option>)}</select></label>}<div className="portal-faq">{filtered.map((f, i) => <details key={i}><summary>{f.question}</summary><p>{f.answer}</p></details>)}</div>{preview && <Link className="portal-text-link" to="/faq">All questions & answers →</Link>}</>;
}
export function EligibilityChecker({
  settings
}) {
  const [studentClass, setClass] = useState('1');
  const configured = Array.isArray(settings.eligibleClasses);
  const eligible = configured && settings.eligibleClasses.map(String).includes(studentClass);
  const availability = preparationAvailability(settings,studentClass);
  const rows = [['Eligibility',configured ? eligible ? 'Eligible' : 'Not eligible' : 'To be announced'],['Registration Fee',settings.fee == null ? 'To be announced' : `₹${settings.fee}`],['Syllabus',availability.syllabus ? 'Available' : 'Coming Soon'],['Sample Paper',availability.samplePaper ? 'Available' : 'Coming Soon'],['Exam Pattern',availability.examPattern ? 'Published' : 'To be announced']];
  return <div className="portal-card preparation-card"><h3>Find your {eventBrand(settings).eventName} information</h3><ClassSelector value={studentClass} onChange={setClass} id="eligibility-class"/><div aria-live="polite"><span className="school-page-eyebrow">CLASS {studentClass}</span><p>{eligible ? `Class ${studentClass} is eligible for ${eventBrand(settings).eventShortName} ${eventBrand(settings).eventYear}.` : configured ? `Class ${studentClass} is not currently eligible.` : 'Eligibility will be announced shortly.'}</p><dl className="class-summary">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{settings.portal?.eligibilityNotes && <p>{settings.portal.eligibilityNotes}</p>}</div><div className="preparation-links">{[[BookOpen,`/syllabus?class=${studentClass}`,'Syllabus'],[FileText,`/sample-papers?class=${studentClass}`,'Sample papers'],[CalendarDays,'/exam-pattern','Exam pattern']].map(([Icon,url,label])=><Link key={url} to={url}><Icon size={17} aria-hidden="true"/><span>{label}</span><ArrowUpRight size={14} aria-hidden="true"/></Link>)}</div><Link className="btn gold" to="/register">{settings.registrationOpen ? 'Start registration' : 'Registration details'}</Link></div>;
}
export function Notices({
  settings,
  preview = false
}) {
  const notices = [...(settings.portal?.notices || [])].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.sortOrder || 0) - (b.sortOrder || 0) || (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  return notices.length ? <div className="portal-grid">{(preview ? notices.slice(0, 3) : notices).map((n, i) => <article className="portal-card" key={i}><span className="portal-meta">{n.category} {n.date && `· ${formatPublicDate(n.date)}`}</span>{n.isNew && <span className="portal-badge">NEW</span>}{n.pinned && <span className="portal-badge">Pinned</span>}<h3>{n.title}</h3><p className="preserve-lines">{n.description}</p><ResourceLink href={n.link}>Read notice / attachment →</ResourceLink></article>)}</div> : <EmptyContent>School updates will appear here when published.</EmptyContent>;
}
export function CandidateJourney({
  settings
}) {
  const configured = settings.portal?.journey || [];
  const fallback = [['Register', 'Enter student details.', '/register'], ['Verify guardian', 'Complete email OTP verification.', ''], ['Complete payment', 'Follow the instructions in your application.', ''], ['Application receipt', 'Keep your reference for follow-up.', '/status'], ['Admit card', 'Available after payment confirmation.', '/status'], ['Examination', 'Follow the published exam-day instructions.', '/exam-guidelines'], ['Results', 'Publication details will be announced.', '/results'], ['Recognition', 'Review published award rules.', '/awards']].map(([title, description, link]) => ({
    title,
    description,
    link
  }));
  return <Timeline items={configured.length ? configured : fallback} label="Candidate journey" />;
}
export function ExamDayJourney({
  settings
}) {
  const guidelines = settings.portal?.guidelines || [];
  return guidelines.length ? <Timeline items={guidelines} label="Exam-day instructions" /> : (settings.instructions || []).length ? <Timeline items={settings.instructions.map((description, index) => ({
    title: `Instruction ${index + 1}`,
    description
  }))} label="School examination instructions" /> : <EmptyContent>Exam-day guidelines will be announced shortly.</EmptyContent>;
}
export function ApplicationStatusTimeline({
  record
}) {
  return <section className="application-timeline"><h3>Your application progress</h3><Timeline items={applicationStages(record)} vertical label="Verified application progress" /></section>;
}
export function AwardEligibilityFlow({
  settings
}) {
  const rules = settings.portal?.awardRules || [];
  return rules.length ? <Timeline items={rules} label="Published award information" /> : <EmptyContent>Detailed award rules will be published shortly. Contact the school for final eligibility and allocation.</EmptyContent>;
}
export function Helpdesk({
  settings
}) {
  return <><div className="portal-grid">{[['Registration help', '/register', 'Student details and application steps'], ['OTP & application status', '/status', 'Access your application with guardian verification'], ['Payment & admit card help', '/faq', 'Understand review status and documents']].map(([title, url, description]) => <Link className="portal-card" to={url} key={title}><h3>{title}</h3><p>{description}</p><span>Get help →</span></Link>)}</div><div className="portal-card helpdesk-contact"><h2>Contact the school</h2><p>For corrections or technical support, keep your application reference ready. Never share your OTP.</p><div className="portal-actions">{settings.contactPhone && <a className="btn gold" href={`tel:${settings.contactPhone.replace(/[^+\d]/g, '')}`}>Call {settings.contactPhone}</a>}{settings.contactEmail && <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>}</div><p>{settings.portal?.schoolAddress || settings.venue}</p>{settings.portal?.officeHours && <p>Office hours: {settings.portal.officeHours}</p>}</div></>;
}
