import React, {useEffect, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {X, ArrowUpRight} from 'lucide-react';
import './registration-offer.css';

export function RegistrationOffer({settings,loading,pathname}) {
 const dialog=useRef(null);
 const [cycle,setCycle]=useState(0);
 const eligible=pathname==='/'&&!loading&&settings.registrationOpen&&Number(settings.fee)===149;
 const dismiss=()=>setCycle(value=>value+1);
 useEffect(()=>{
  const element=dialog.current;
  if(!eligible||!element)return;
  let previous;
  let overflow;
  let opened=false;
  const timer=setTimeout(()=>{
   previous=document.activeElement;
   overflow=document.body.style.overflow;
   element.showModal();
   opened=true;
   document.body.style.overflow='hidden';
  },cycle===0?7000:20000);
  return()=>{
   clearTimeout(timer);
   if(opened){element.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus?.();}
  };
 },[eligible,cycle]);
 return <dialog ref={dialog} className="registration-offer" aria-labelledby="offer-title" aria-describedby="offer-description" onCancel={dismiss} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dismiss();}}}>
  <button type="button" className="offer-close" aria-label="Close registration offer" onClick={dismiss} autoFocus><X size={21}/></button>
  <div className="offer-art"><img src="/images/srps-awareness.png" alt="Students discovering books, science and academic opportunities" width="1536" height="1024"/><span>SHREE 2026 OLYMPIAD</span></div>
  <div className="offer-copy"><span className="offer-kicker">REGISTRATIONS OPEN · CLASSES 1–12</span><h2 id="offer-title">Big opportunity.<br/><em>Small registration fee.</em></h2><p id="offer-description">Take your next step with Shree Ram Public School’s Exam of Excellence.</p><div className="offer-price"><del aria-label="Previous price 299 rupees">₹299</del><strong>₹{settings.fee}<small>only</small></strong><span>Registration fee</span></div><Link to="/register" className="offer-apply" onClick={dismiss}>Apply Now <ArrowUpRight size={20}/></Link><button type="button" className="offer-later" onClick={dismiss}>I’ll explore first</button></div>
 </dialog>;
}
