import React,{useEffect,useState,lazy,Suspense} from 'react';
import {Link,NavLink,Routes,Route,useLocation} from 'react-router-dom';
import {GraduationCap,Menu,X,MapPin,Phone,Mail,ShieldCheck,ArrowUpRight} from 'lucide-react';
import {api,img} from './api.js';
import {ThemeToggle} from './ThemeToggle.jsx';
import {Home} from './Home.jsx';
import {Footer} from './Footer.jsx';
import {RegistrationOffer} from './RegistrationOffer.jsx';
import {ExtraPage, PageMoreContent} from './ExtraPages.jsx';
import {AboutPage, PrizesPage, ScholarshipsPage} from './SchoolPages.jsx';
import {Register} from './Register.jsx';
import {Status} from './Status.jsx';
const HeroDesigns = lazy(() => import('./HeroDesigns.jsx').then(module => ({default: module.HeroDesigns})));
const Admin = lazy(() => import('./Admin.jsx').then(module => ({default: module.Admin})));
export const defaults={eventName:'SHREE 2026 OLYMPIAD',fee:149,registrationOpen:false,examDate:'',venue:'Shree Ram Public School, Kanhra-Badhra Road, Charkhi Dadri, Haryana 127306',paymentMode:'manual',contactPhone:'8199991081',contactEmail:'srpskanhra@gmail.com',scholarships:[]};
export function useSettings(){
  const [settings,setSettings]=useState(defaults);
  const [loading,setLoading]=useState(true);
  const [settingsError,setSettingsError]=useState('');
  const reload=()=>{
    setLoading(true); setSettingsError('');
    return api.get('/settings').then(r=>setSettings(r.data))
      .catch(()=>setSettingsError('Registration service is currently unavailable. Please retry shortly.'))
      .finally(()=>setLoading(false));
  };
  useEffect(()=>{reload();},[]);
  return {settings,loading,settingsError,reload};
}
function ScrollToPage(){const {pathname}=useLocation();useEffect(()=>{if(!window.location.hash)window.scrollTo(0,0);},[pathname]);return null;}
function Header(){const [open,setOpen]=useState(false);const location=useLocation();useEffect(()=>setOpen(false),[location]);const links=[['/','Home'],['/about','About'],['/prizes','Prizes'],['/scholarships','Scholarships'],['/status','Check Status']];return <header className="header"><div className="shell head-row"><Link to="/" className="brand"><img src={img('school-logo.png')} alt="School crest"/><span>SHREE RAM <b>PUBLIC SCHOOL</b><small>LEARN <i>|</i> GROW <i>|</i> ACHIEVE</small></span></Link><ThemeToggle/><button className="menu-toggle" onClick={()=>setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open} aria-controls="main-navigation">{open?<X/>:<Menu/>}</button><nav id="main-navigation" className={open?'nav open':'nav'}>{links.map(([url,label])=><NavLink key={url} to={url} end={url==='/'}>{label}</NavLink>)}<NavLink className="nav-register" to="/register">Register Now <ArrowUpRight size={16}/></NavLink></nav></div></header>}
export default function App(){const {pathname}=useLocation();const {settings,loading,settingsError,reload}=useSettings();return <><ScrollToPage/><Header/><RegistrationOffer settings={settings} loading={loading} pathname={pathname}/><Routes><Route path="/hero-designs" element={<Suspense fallback={<main className="shell"><p>Loading design studio...</p></main>}><HeroDesigns settings={settings}/></Suspense>}/><Route path="/" element={<Home settings={settings}/>}/><Route path="/about" element={<AboutPage settings={settings}/>}/><Route path="/prizes" element={<PrizesPage settings={settings}/>}/><Route path="/scholarships" element={<ScholarshipsPage settings={settings} loading={loading} settingsError={settingsError} reloadSettings={reload}/>}/><Route path="/exam-guide" element={<ExtraPage kind="guide" settings={settings}/>}/><Route path="/help" element={<ExtraPage kind="help" settings={settings}/>}/><Route path="/register" element={<Register settings={settings} loading={loading} settingsError={settingsError} reloadSettings={reload}/>}/><Route path="/status" element={<Status/>}/><Route path="/admin" element={<Suspense fallback={<main className="shell"><p>Loading admin portal...</p></main>}><Admin/></Suspense>}/><Route path="*" element={<main className="shell empty"><h1>Page not found</h1><Link className="btn primary" to="/">Back home</Link></main>}/></Routes><PageMoreContent pathname={pathname}/><Footer settings={settings}/></>}
