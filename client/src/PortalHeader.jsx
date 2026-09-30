import {formatPublicDate} from './publicDisplay.js';
import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown, ArrowUpRight, BookOpen, Trophy, Library, ShieldCheck, ClipboardList, CalendarDays, GraduationCap, Gift, Sparkles, FileText, Download, Bell, CircleHelp, LifeBuoy, Medal } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle.jsx';
import { ResourceLink } from './PortalComponents.jsx';
const groups = [
  ['Exam Details', BookOpen, 'Everything you need to feel exam-ready.', [
    ['/eligibility', 'Eligibility', 'Find the right starting point', ShieldCheck],
    ['/exam-pattern', 'Exam Pattern', 'Know what to expect', ClipboardList],
    ['/syllabus', 'Syllabus', 'Explore your class topics', BookOpen],
    ['/important-dates', 'Important Dates', 'Keep every milestone in view', CalendarDays],
    ['/exam-guidelines', 'Exam Day Guidelines', 'Arrive prepared and confident', GraduationCap],
  ]],
  ['Awards', Trophy, 'Big dreams deserve a little inspiration.', [
    ['/prizes', 'Prizes', 'Discover the prize categories', Gift],
    ['/scholarships', 'Scholarships', 'Explore learning opportunities', Sparkles],
    ['/awards', 'Recognition & Rules', 'Understand award eligibility', Medal],
  ]],
  ['Resources', Library, 'A little guidance for every next step.', [
    ['/sample-papers', 'Sample Papers', 'Practise with published papers', FileText],
    ['/information-bulletin', 'Information Bulletin', 'Your examination reference', BookOpen],
    ['/downloads', 'Downloads', 'Useful documents in one place', Download],
    ['/notices', 'Notices', 'The latest school updates', Bell],
    ['/faq', 'FAQs', 'Clear answers to common questions', CircleHelp],
    ['/help', 'Help Desk', 'Connect with the school', LifeBuoy],
    ['/results', 'Results', 'Check publication updates', Medal],
  ]],
];
export function PortalHeader({
  settings
}) {
  const [open, setOpen] = useState(false),
    [group, setGroup] = useState(''),
    [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const root = useRef(null),
    menu = useRef(null);
  useEffect(() => {
    setOpen(false);
    setGroup('');
  }, [location]);
  useEffect(() => {
    function close(e) {
      if (root.current && !root.current.contains(e.target)) {
        setOpen(false);
        setGroup('');
      }
    }
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  function escape(e) {
    if (e.key === 'Escape') {
      if (group) {
        root.current.querySelector(`[data-group="${group}"]`)?.focus();
        setGroup('');
      } else {
        setOpen(false);
        menu.current?.focus();
      }
    }
  }
  const announcement = settings.portal?.announcement;
  return <>{announcement?.enabled && announcement.text && <div className="portal-announcement"><div className="shell">{announcement.isNew && <b>NEW</b>}<span>{announcement.text}</span>{announcement.date && <span>{formatPublicDate(announcement.date)}</span>}<ResourceLink href={announcement.link}>Read more →</ResourceLink></div></div>}<header className={`header portal-header${scrolled ? ' is-scrolled' : ''}`} ref={root} onKeyDown={escape} onBlur={e => {
      if (!e.currentTarget.contains(e.relatedTarget)) {
        setGroup('');
        setOpen(false);
      }
    }}><div className="shell head-row"><Link to="/" className="brand"><img src="/images/school-logo.png" alt="School crest" /><span>SHREE RAM <b>PUBLIC SCHOOL</b><small>LEARN <i>|</i> GROW <i>|</i> ACHIEVE</small></span></Link><ThemeToggle /><button ref={menu} className="menu-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="main-navigation">{open ? <X /> : <Menu />}</button><nav id="main-navigation" aria-label="Main navigation" className={open ? 'nav open' : 'nav'}><NavLink to="/" end>Home</NavLink><NavLink to="/about">About</NavLink>{groups.map(([label, GroupIcon, description, links], index) => <div className={`nav-group nav-tone-${index} ${links.some(([url])=>location.pathname===url)?'has-active-page':''}`} key={label}><button type="button" data-group={label} aria-expanded={group === label} aria-controls={`nav-group-${index}`} onClick={() => setGroup(group === label ? '' : label)}><GroupIcon className="nav-group-icon" size={15} aria-hidden="true"/>{label}<ChevronDown className="nav-chevron" size={14} aria-hidden="true"/></button><div id={`nav-group-${index}`} className="nav-dropdown" hidden={group !== label}><div className="nav-dropdown-intro"><span className="nav-intro-icon"><GroupIcon size={21} aria-hidden="true"/></span><span><strong>{label}</strong><small>{description}</small></span></div>{links.map(([url, text, copy, Icon],i) => <NavLink key={url} to={url} aria-label={text} style={{'--link-order':i}}><span className="nav-item-icon"><Icon size={18} aria-hidden="true"/></span><span className="nav-item-copy"><strong>{text}</strong><small>{copy}</small></span><ArrowUpRight className="nav-item-arrow" size={15} aria-hidden="true"/></NavLink>)}</div></div>)}<NavLink to="/status">Check Status</NavLink><NavLink className="nav-register" to="/register">Register Now <ArrowUpRight size={16} /></NavLink></nav></div></header></>;
}
