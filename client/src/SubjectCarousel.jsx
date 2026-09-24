import React, {useEffect, useState} from 'react';
import './subject-carousel.css';
const slides=[['mathematics','Mathematics','Think logically. Solve confidently.'],['science','Science','Ask questions. Explore possibilities.'],['english','English','Read, understand and express.'],['social-science','Social Science','Understand the world around you.'],['awareness','General Awareness','Stay curious. Keep discovering.']];
export function SubjectCarousel(){
 const [active,setActive]=useState(0);
 useEffect(()=>{const id=setInterval(()=>setActive(i=>(i+1)%slides.length),2000);return()=>clearInterval(id);},[]);
 return <div className="subject-carousel" role="region" aria-roledescription="carousel" aria-label="Explore five Olympiad subjects" aria-live="off">
 <div className="subject-carousel-stage">{slides.map(([key,title,copy],i)=>{const offset=(i-active+5)%5;const position=offset===0?'center':offset===1?'right':offset===4?'left':'hidden';return <div key={key} className={`subject-slide ${position}`} role="group" aria-roledescription="slide" aria-label={`${i+1} of 5: ${title}`} aria-hidden={i!==active}><img src={`/images/srps-${key}.png`} alt={`Creative school illustration exploring ${title}`} width="1536" height="1024" loading={i===0?'eager':'lazy'}/><div className="subject-slide-caption"><span>SHREE 2026 OLYMPIAD · DISCOVER YOUR STRENGTH</span><h3>{title}</h3><p>{copy}</p></div></div>;})}</div>

 </div>;
}
