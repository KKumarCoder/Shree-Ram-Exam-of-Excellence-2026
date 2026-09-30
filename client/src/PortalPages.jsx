import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { portalRoutes, eventBrand } from './portalData.js';
import { ContentState, EmptyContent, ComingSoonCard, SamplePaperLibrary, ImportantDatesTimeline, ExamPatternSummary, ExamSectionBreakdown, Syllabus, ResourceCards, ClassSelector, useClassFilter, FAQList, EligibilityChecker, Notices, ExamDayJourney, AwardEligibilityFlow, Helpdesk } from './PortalComponents.jsx';
import { GuidanceCards, SectionCTA, PreparationChecklist, PageVisual, patternGuidance, practiceGuidance, dateGuidance, GeneralExamGuidance, DownloadGroups, ExamDayOverview } from './PublicGuidance.jsx';
function Downloads({
  settings,
  sample = false,
  bulletin = false
}) {
  const [studentClass, setClass] = useClassFilter(sample ? '1' : '');
  const [category, setCategory] = useState('');
  const resources = (settings.portal?.resources || []).filter(r => (!sample || r.category === 'sample-paper') && (!bulletin || r.category === 'bulletin') && (!studentClass || !r.studentClass || r.studentClass === studentClass) && (!category || r.category === category));
  return <>{!bulletin && <div className="portal-filters"><ClassSelector value={studentClass} onChange={setClass} all={!sample} />{!sample && <label className="portal-filter"><span>Document category</span><select value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{['syllabus', 'sample-paper', 'answer-key', 'bulletin', 'guideline', 'notice-attachment', 'download'].map(c => <option value={c} key={c}>{c.replaceAll('-', ' ')}</option>)}</select></label>}</div>}<section aria-label="Published documents">{resources.length ? <ResourceCards resources={resources}/> : <ComingSoonCard label={sample ? `Class ${studentClass}` : eventBrand(settings).eventName} title={bulletin ? "Official Information Bulletin" : sample ? "Sample Paper" : "Published documents"} copy={bulletin ? `Official ${eventBrand(settings).eventName} Information Bulletin PDF will be available here after publication.` : sample ? `Official sample paper for Class ${studentClass} will be published shortly.` : "No published documents match these filters yet."}/>}</section></>;
}
export function PortalPage({
  settings,
  loading,
  settingsError,
  reloadSettings
}) {
  const {
    pathname
  } = useLocation();
  const [title, copy] = portalRoutes[pathname] || [];
  let content;
  switch (pathname) {
    case '/eligibility':
      content = <><EligibilityChecker settings={settings} /><GuidanceCards title="Find information for your class" items={[["Class-wise preparation", "Explore the published syllabus and sample papers for your class."], ["Official eligibility", "Check the information bulletin and school notices for confirmed eligibility details."], ["Questions before applying", "Contact the school helpdesk if you need clarification before registration."]]}/><SectionCTA/></>;
      break;
    case '/exam-pattern':
      content = <><section><h2>Exam overview</h2><ExamPatternSummary settings={settings} /></section><GuidanceCards title="What this page will tell you" items={patternGuidance}/><section className="public-block"><h2>Section breakdown</h2>{settings.portal?.examPattern?.isPublished && settings.portal.examPattern.sections?.length ? <ExamSectionBreakdown sections={settings.portal.examPattern.sections}/> : <EmptyContent>Section-wise examination pattern will be published shortly.</EmptyContent>}</section><SectionCTA/></>;
      break;
    case '/important-dates':
      content = <><p>Key examination milestones will be updated here as soon as they are officially announced by Shree Ram Public School.</p><ImportantDatesTimeline settings={settings} /><GuidanceCards title="How to stay prepared" items={dateGuidance}/><SectionCTA title="Keep your next step in view" links={[["/status", "Check Application Status"], ["/exam-guidelines", "View Exam Guidelines"]]}/></>;
      break;
    case '/syllabus':
      content = <><Syllabus settings={settings} /><GuidanceCards title="Preparation guidance" items={[["Review your learning", "Review topics taught at your current class level."], ["Understand concepts", "Focus on concept clarity."], ["Apply what you know", "Practice application-based questions."], ["Practice when published", "Use sample papers when available."]]}/><SectionCTA links={[["/sample-papers", "View Sample Papers"], ["/register", "Registration Details"]]}/></>;
      break;
    case '/sample-papers':
      content = <><SamplePaperLibrary settings={settings} /><GuidanceCards title="Why practice with sample papers?" items={practiceGuidance}/><PreparationChecklist/><SectionCTA links={[["/syllabus", "View Syllabus"], ["/exam-pattern", "View Exam Pattern"]]}/></>;
      break;
    case '/information-bulletin':
      content = <><GuidanceCards title="What the bulletin will cover" items={[["Getting started", "Eligibility, registration and important dates."], ["Preparing for the exam", "Examination pattern and syllabus."], ["Your examination day", "Admit card and exam guidelines."], ["After the examination", "Results, awards and helpdesk information."]]}/><Downloads key={pathname} settings={settings} bulletin /><div className="portal-actions bulletin-links">{['/eligibility', '/exam-pattern', '/syllabus', '/important-dates', '/exam-guidelines', '/help'].map(url => <Link key={url} to={url}>{portalRoutes[url][0]} →</Link>)}</div></>;
      break;
    case '/downloads':
      content = <><DownloadGroups settings={settings}/><section className="public-block"><h2>Published documents</h2><Downloads key={pathname} settings={settings} /></section><SectionCTA title="Need help finding a document?" links={[["/help", "School Helpdesk"], ["/status", "Check Application Status"]]}/></>;
      break;
    case '/faq':
      content = <><FAQList settings={settings} /><GuidanceCards title="A clear next step" items={[["Preparation resources", "Choose your class on the syllabus and sample paper pages."], ["Application support", "Keep your application reference ready when contacting the school."], ["Protect your access", "Never share your OTP with anyone."]]}/><SectionCTA title="Still need a hand?" links={[["/help", "Contact the Helpdesk"], ["/notices", "School Notices"]]}/></>;
      break;
    case '/notices':
      content = <><Notices settings={settings} /><GuidanceCards title="Keep track of your next step" items={[["Examination schedule", "Check Important Dates for published milestones."], ["Preparation resources", "Class-wise documents appear when published by the school."], ["Application updates", "Use Check Status to access your private application information."]]}/><SectionCTA title="Explore official information" links={[["/important-dates", "Important Dates"], ["/downloads", "Download Centre"]]}/></>;
      break;
    case '/exam-guidelines':
      content = <><ExamDayOverview settings={settings}/><GeneralExamGuidance/>{(settings.portal?.guidelines?.length || settings.instructions?.length) > 0 && <section className="public-block"><h2>Published school instructions</h2><ExamDayJourney settings={settings} /></section>}<p><Link className="portal-text-link" to="/status">Access your admit card securely →</Link></p></>;
      break;
    case '/help':
      content = <><Helpdesk settings={settings} /><GuidanceCards title="Before you contact the school" items={[["Keep your reference ready", "Your application reference helps the school identify your enquiry."], ["Describe the issue", "Mention the page and the message you see, without sharing your OTP."], ["Check common questions", "The FAQ covers preparation resources and application access."]]}/></>;
      break;
    case '/awards':
      content = <><div className="portal-actions"><Link className="btn gold" to="/prizes">Prize categories</Link><Link className="btn light" to="/scholarships">Scholarships</Link></div><AwardEligibilityFlow settings={settings} /><GuidanceCards title="Understanding recognition" items={[["Prize categories", "Explore the school’s existing promotional prize categories."], ["Official award rules", "Rank rules, eligibility and allocation depend on published school information."], ["Scholarship information", "Confirm scholarship coverage and conditions with the school."]]}/><SectionCTA title="Stay informed" links={[["/notices", "School Notices"], ["/help", "School Helpdesk"]]}/></>;
      break;
    case '/results':
      content = <><EmptyContent>Results will be published after the examination. Follow school notices for publication details. Private result access is not yet available.</EmptyContent><GuidanceCards title="Stay ready for publication" items={[["Keep your reference", "Keep your application reference safely for future updates."], ["Follow official notices", "The school will publish result availability and access instructions."], ["Recognition", "Review award information when official details are announced."]]}/><SectionCTA title="Follow official updates" links={[["/notices", "School Notices"], ["/awards", "Awards & Recognition"]]}/></>;
      break;
    default:
      {
        const field = {
          '/privacy': 'privacy',
          '/terms': 'terms',
          '/refund': 'refund'
        }[pathname];
        const value = field ? settings[field] : settings.portal?.paymentPolicy;
        content = <>{value ? <article className="portal-card preserve-lines"><p>{value}</p></article> : <EmptyContent>This policy will be published shortly. Contact the school before registration.</EmptyContent>}<GuidanceCards title="Before you proceed" items={[["Read the published information", "Review the current school policy and the instructions shown in your application."], ["Ask for clarification", "Contact the school if a policy is unpublished or a condition is unclear."], ["Keep your reference", "Keep your application reference for any follow-up enquiry."]]}/><SectionCTA title="Find the information you need" links={[["/help", "Contact the Helpdesk"], ["/information-bulletin", "Information Bulletin"]]}/></>;
      }
  }
  return <main className="portal-page shell"><nav className="portal-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">{title}</span></nav><div className="public-heading-row"><header className="portal-page-heading"><span className="school-page-eyebrow">{pathname === '/important-dates' ? 'PLAN YOUR NEXT STEP' : eventBrand(settings).eventName}</span><h1>{title}</h1><p>{copy}</p></header><PageVisual path={pathname}/></div><ContentState loading={loading} error={settingsError} retry={reloadSettings}>{content}</ContentState></main>;
}
