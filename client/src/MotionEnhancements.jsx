import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import './motion-enhancements.css';

const revealSelectors = [
  '.portal-section > *', '.portal-page > *', '.school-page > section',
  '.shree-home > section:not(.shree-hero)', '.services-grid .portal-card',
  '.school-prize-cards article', '.guidance-four .portal-card',
  '.important-dates-timeline', '.important-dates-timeline li', '.exam-checklist',
  '.exam-checklist li', '.school-footer > .shell'
].join(',');

export function MotionEnhancements(){
  const {pathname}=useLocation();
  useEffect(()=>{
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}
    }),{threshold:.08,rootMargin:'0px 0px -35px'});
    const scan=()=>[...document.querySelectorAll(revealSelectors)].forEach((node,index)=>{
      if(node.classList.contains('motion-reveal')) return;
      node.classList.add('motion-reveal');
      node.style.setProperty('--reveal-order',String(index%6));
      if(reduced) node.classList.add('is-revealed'); else observer.observe(node);
    });
    scan();
    const mutations=new MutationObserver(scan);
    mutations.observe(document.getElementById('root'),{childList:true,subtree:true});
    let frame=0;
    const parallax=()=>{
      if(frame) return;
      frame=requestAnimationFrame(()=>{
        const hero=document.querySelector('.shree-hero');
        if(hero && !reduced){
          const rect=hero.getBoundingClientRect();
          const shift=Math.max(-24,Math.min(24,-rect.top*.045));
          hero.style.setProperty('--hero-parallax',`${shift}px`);
        }
        frame=0;
      });
    };
    parallax();
    window.addEventListener('scroll',parallax,{passive:true});
    return()=>{observer.disconnect();mutations.disconnect();window.removeEventListener('scroll',parallax);if(frame)cancelAnimationFrame(frame);};
  },[pathname]);
  return null;
}
