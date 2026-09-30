import {StudentArtwork} from './StudentArtwork.jsx';
import React, {useState} from 'react';
import {Link} from 'react-router-dom';
import {CalendarDays, BellRing, Sparkles, FileText, BookOpen, GraduationCap, Trophy, ArrowUpRight} from 'lucide-react';
import './home-updates.css';

export function SectionArtwork({type}) {
  return <StudentArtwork type={type === "dates" ? "dates" : "welcome"} className="home-student-artwork"/>;
}

const phases = [
  {title:'Apply', Icon:FileText, copy:'Register, verify your guardian’s mobile and complete the payment steps. Keep your application reference safe.', link:'/register', action:'Registration details'},
  {title:'Prepare', Icon:BookOpen, copy:'Explore your class syllabus and published practice resources. Check your application for admit-card availability.', link:'/syllabus', action:'Explore your syllabus'},
  {title:'Participate', Icon:GraduationCap, copy:'Read the school’s exam-day instructions and check the details printed on your admit card.', link:'/exam-guidelines', action:'Exam-day guidance'},
  {title:'Celebrate', Icon:Trophy, copy:'Discover the school’s published recognition opportunities and award eligibility rules.', link:'/awards', action:'Explore recognition'},
];
export function JourneyMap() {
  const [active,setActive] = useState(0);
  const phase = phases[active];
  const Icon = phase.Icon;
  return <div className="journey-map">
    <div className="journey-map-graph">
      <div className="map-caption"><Sparkles size={15}/> YOUR PATH TO POSSIBILITY <span>Select a stage</span></div>
      <div className="map-stages">
        <svg className="map-connector" viewBox="0 0 600 100" preserveAspectRatio="none" aria-hidden="true"><path d="M 75 65 C 150 65 150 25 225 25 S 300 65 375 65 S 450 25 525 25"/><path className="map-travel" d="M 75 65 C 150 65 150 25 225 25 S 300 65 375 65 S 450 25 525 25"/></svg>
        {phases.map(({title,Icon},i)=><button type="button" className={`map-stage map-stage-${i} ${active===i?'is-selected':''}`} key={title} onClick={()=>setActive(i)} aria-pressed={active===i} aria-controls="home-journey-insight"><span className="map-node"><Icon size={26}/></span><strong>{title}</strong><small>0{i+1}</small></button>)}
      </div>
      <p className="map-note">Explore the stages · Your application status is available in Check Status.</p>
    </div>
    <div className={`map-insight map-stage-${active}`} id="home-journey-insight" aria-live="polite" aria-atomic="true"><div key={active} className="map-insight-content"><span className="map-insight-icon"><Icon size={26}/></span><small>THE NEXT CHAPTER</small><h3>{phase.title} with confidence.</h3><p>{phase.copy}</p><Link to={phase.link}>{phase.action}<ArrowUpRight size={17}/></Link></div></div>
  </div>;
}
