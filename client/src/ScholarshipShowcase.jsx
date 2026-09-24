import React from 'react';
import {Link} from 'react-router-dom';
import {ArrowUpRight, Trophy, BookOpen, Target, Sparkles} from 'lucide-react';
import './scholarship-showcase.css';

export function ScholarshipShowcase({settings}) {
 const slabs = settings.scholarships || [];
 return <section className="scholarship-showcase" id="scholarship" aria-labelledby="scholarship-title"><div className="shell">
  <div className="scholarship-intro"><span className="shree-eyebrow">TURN EFFORT INTO OPPORTUNITY</span><h2 id="scholarship-title">Your hard work.<br/><em>A brighter tomorrow.</em></h2><p>Big possibilities begin with everyday effort. Explore how your Olympiad performance could support your next chapter of learning.</p></div>
  <div className="scholarship-feature-grid">
   <div className="scholarship-photo-card"><img src="/images/srps-scholarships.png" alt="Students in Shree Ram school uniform learning together beside a trophy" width="1536" height="1024" loading="lazy" decoding="async"/><span className="scholarship-photo-badge"><Sparkles size={17}/> SMALL STEPS. BIG POSSIBILITIES.</span><div className="scholarship-photo-caption"><span className="scholarship-trophy"><Trophy size={28}/></span><div><small>YOUR NEXT CHAPTER</small><h3>Let your effort shine.</h3><p>Learn with purpose. Grow with confidence.</p></div></div></div>
   <div className="scholarship-chart"><div className="scholarship-chart-heading"><span><Trophy size={24}/></span><div><small>PERFORMANCE MEETS OPPORTUNITY</small><h3>Scholarship opportunities</h3></div></div><div className="scholarship-chart-labels"><span>Olympiad marks</span><span>Proposed scholarship</span></div>
    <ul className="scholarship-bars">{slabs.map((item,i)=>{const raw=String(item.benefit).trim();const value=/^\d+(?:\.\d+)?%$/.test(raw)?Number.parseFloat(raw):null;return <li key={`${item.marks}-${i}`} style={{'--bar-color':['#117eab','#7858cb','#008878','#d58620','#dc647b','#6078ba'][i%6]}}><div className="scholarship-bar-label"><span>{item.marks}</span><strong>{item.benefit}</strong></div>{value!==null&&<div className="scholarship-bar-track" aria-hidden="true"><span style={{width:`${Math.min(100,Math.max(0,value))}%`}}/></div>}</li>;})}</ul>
    {!slabs.length&&<p>Scholarship details will be announced by the school.</p>}
    <p className="scholarship-chart-note">Proposed benefits based on Olympiad performance. Final coverage, eligibility and duration are confirmed by the school.</p><Link className="btn gold" to="/scholarships">Explore scholarship details <ArrowUpRight size={18}/></Link>
   </div>
  </div>
  <div className="scholarship-milestones">{[[BookOpen,'01','Build your foundation','Stay curious. Make time to learn.'],[Target,'02','Give your best','Prepare with focus for the Olympiad.'],[Trophy,'03','Explore opportunities','Review your performance and applicable benefits.']].map(([Icon,n,title,copy])=><article key={n}><span className="scholarship-milestone-icon"><Icon size={25}/></span><div><small>STEP {n}</small><h3>{title}</h3><p>{copy}</p></div></article>)}</div>
 </div></section>;
}
