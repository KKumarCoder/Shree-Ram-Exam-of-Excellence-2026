import React, {useEffect, useState} from 'react';
import {Sparkles} from 'lucide-react';
import './subject-carousel.css';
import {eventBrand} from './portalData.js';
const slides=[['mathematics','Mathematics','Think logically. Solve confidently.'],['science','Science','Ask questions. Explore possibilities.'],['english','English','Read, understand and express.'],['social-science','Social Science','Understand the world around you.'],['awareness','General Awareness','Stay curious. Keep discovering.']];
export function SubjectCarousel({settings={}, benefits=[]}){
 const [active,setActive]=useState(0);
 useEffect(()=>{const id=setInterval(()=>setActive(i=>(i+1)%slides.length),4000);return()=>clearInterval(id);},[]);
 return <div className="subject-experience">
 <div className="subject-carousel" role="region" aria-roledescription="carousel" aria-label="Explore five Olympiad subjects" aria-live="off">
 <div className="subject-carousel-stage">{slides.map(([key,title,copy],i)=>{const offset=(i-active+5)%5;const position=offset===0?'center':offset===1?'right':offset===4?'left':'hidden';return <div key={key} className={`subject-slide ${position} subject-color-${i}`} role="group" aria-roledescription="slide" aria-label={`${i+1} of 5: ${title}`} aria-hidden={i!==active}><img src={`/images/srps-${key}.png`} alt={`School students exploring ${title}`} width="1536" height="1024" loading="eager" decoding="async"/><div className="subject-slide-caption"><span><Sparkles size={13}/> {eventBrand(settings).eventName} · DISCOVER YOUR STRENGTH</span><h3>{title}</h3><p>{copy}</p></div><span className="subject-slide-number" aria-hidden="true">0{i+1} / 05</span></div>;})}</div>
 <div className="subject-auto-progress" aria-hidden="true"><span key={active}/></div><p className="subject-carousel-status">{String(active+1).padStart(2,'0')} / 05 · {slides[active][1]}</p>
 </div>
 <div className="benefit-marquee" role="region" aria-label="Benefits of participating">
 <div className="benefit-track">{[0,1].map(copy=><div className="benefit-group" key={copy} aria-hidden={copy===1?true:undefined}>{benefits.map(([Icon,title,description],i)=><article className={`benefit-card benefit-color-${i}`} key={title}><span className="benefit-number">0{i+1}</span><span className="benefit-icon"><Icon size={29}/></span><h3>{title}</h3><p>{description}</p><span className="benefit-spark" aria-hidden="true">✦</span></article>)}</div>)}</div>
 </div>
 </div>;
}
