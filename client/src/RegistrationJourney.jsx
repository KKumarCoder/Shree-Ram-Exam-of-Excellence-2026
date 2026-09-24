import React, {useState} from 'react';
import {Link} from 'react-router-dom';
import {FileText, ShieldCheck, IndianRupee, Download, ArrowRight, Check, Sparkles} from 'lucide-react';
import './registration-journey.css';

export function RegistrationJourney({settings}) {
  const [active, setActive] = useState(0);
  const steps = [
    {Icon:FileText, title:'Fill your application', label:'START WITH YOU', copy:'Your next achievement starts with a few simple details.', items:['Student name, date of birth and class','Current school and address','Parent / guardian contact details'], color:'blue'},
    {Icon:ShieldCheck, title:'Verify & upload', label:'MAKE IT YOURS', copy:'Keep your guardian’s mobile handy and your photograph ready.', items:['Verify the guardian mobile with OTP','Upload a clear student photograph','Review your details before continuing'], color:'purple'},
    {Icon:IndianRupee, title:'Complete payment', label:'ONE STEP CLOSER', copy:`Registration fee: ₹${settings.fee}. Follow the payment instructions in the portal.`, items:['Use the payment details shown in the portal','Submit the required payment information','Save your application reference and receipt'], color:'orange'},
    {Icon:Download, title:'Get exam-ready', label:'READY FOR YOUR MOMENT', copy:'Once the school confirms payment, your admit card will be available.', items:['Open Check Status with your application reference','Verify your registered guardian mobile by OTP','Download and keep your admit card for exam day'], color:'teal'},
  ];
  const step = steps[active];
  const Icon = step.Icon;
  return <section className="journey-section" id="how-to-register" aria-labelledby="journey-heading">
    <div className="shell">
      <div className="shree-section-heading"><span className="journey-eyebrow"><Sparkles size={16}/> YOUR JOURNEY, MADE SIMPLE</span><h2 id="journey-heading">Four steps.<br className="journey-mobile-break"/> <span>One exciting opportunity.</span></h2><p>Select a step and see how to get started.</p></div>
      <div className="journey-picker" aria-label="Explore registration steps">{steps.map(({Icon,title,color},i)=><button type="button" key={title} className={`journey-choice ${color} ${active===i?'is-active':''}`} aria-pressed={active===i} aria-controls="journey-detail" onClick={()=>setActive(i)}><span className="journey-choice-top"><span className="journey-icon"><Icon size={27}/></span><span className="journey-number">0{i+1}</span></span><strong>{title}</strong><span className="journey-choice-bottom">{active===i?'Viewing step':'Explore step'}<ArrowRight size={17}/></span></button>)}</div>
      <div id="journey-detail" className={`journey-detail ${step.color}`} aria-live="polite" aria-atomic="true">
        <div className="journey-art" aria-hidden="true"><span className="journey-orbit"/><span className="journey-spark">✦</span><div className="journey-art-card"><Icon size={72} strokeWidth={1.4}/><span>STEP 0{active+1}</span><i/><i/><i/></div><span className="journey-art-badge"><Check size={19}/> {['Your potential starts here','A little care. A confident start.','Keep your reference safe','Your next challenge awaits'][active]}</span></div>
        <div className="journey-detail-copy" key={active}><span className="journey-eyebrow">{step.label}</span><h3>{step.title}</h3><p>{step.copy}</p><ul>{step.items.map(item=><li key={item}><Check size={16}/>{item}</li>)}</ul><Link className="journey-action" to={active===3?'/status':'/register'}>{active===3?'Check status & admit card':settings.registrationOpen?'Start your application':'View registration details'}<ArrowRight size={18}/></Link></div>
      </div>
      <div className="journey-footnote"><ShieldCheck size={17}/><span>Guardian mobile verification required · Admit card after payment confirmation</span></div>
    </div>
  </section>;
}
