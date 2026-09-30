import React,{useEffect,useState,lazy,Suspense} from 'react';
import {Link,Routes,Route,useLocation} from 'react-router-dom';
import {api} from './api.js';
import {mergePublicConfig} from './publicConfig.js';
import {Home} from './Home.jsx';
import {Footer} from './Footer.jsx';
import {RegistrationOffer} from './RegistrationOffer.jsx';
import {ExtraPage, PageMoreContent} from './ExtraPages.jsx';
import {AboutPage, PrizesPage, ScholarshipsPage} from './SchoolPages.jsx';
import {Register} from './Register.jsx';
import {Status} from './Status.jsx';
import {PortalMetadata} from './PortalMetadata.jsx';
import {PortalHeader} from './PortalHeader.jsx';
import {MotionEnhancements} from './MotionEnhancements.jsx';
import {portalRoutes,branding,supportedClasses} from './portalData.js';
const PortalPage = lazy(() => import('./PortalPages.jsx').then(m=>({default:m.PortalPage})));
const HeroDesigns = lazy(() => import('./HeroDesigns.jsx').then(module => ({default: module.HeroDesigns})));
const Admin = lazy(() => import('./Admin.jsx').then(module => ({default: module.Admin})));
export const defaults={eventName:branding.eventName,eligibleClasses:supportedClasses,portal:{},fee:149,registrationOpen:false,examDate:'',venue:'Shree Ram Public School, Kanhra-Badhra Road, Charkhi Dadri, Haryana 127306',paymentMode:'manual',contactPhone:'8199991081',contactEmail:'srpskanhra@gmail.com',scholarships:[]};
export function useSettings(){
  const [settings,setSettings]=useState(defaults);
  const [loading,setLoading]=useState(true);
  const [settingsError,setSettingsError]=useState('');
  const reload=()=>{
    setLoading(true); setSettingsError('');
    return api.get('/settings').then(r=>setSettings(mergePublicConfig(defaults,r.data)))
      .catch(()=>setSettingsError('Registration service is currently unavailable. Please retry shortly.'))
      .finally(()=>setLoading(false));
  };
  useEffect(()=>{reload();},[]);
  return {settings,loading,settingsError,reload};
}
function ScrollToPage(){const {pathname}=useLocation();useEffect(()=>{if(!window.location.hash)window.scrollTo(0,0);},[pathname]);return null;}
export default function App(){const {pathname}=useLocation();const {settings,loading,settingsError,reload}=useSettings();return <><ScrollToPage/><MotionEnhancements/><PortalMetadata settings={settings}/><a className="skip-link" href="#main-content">Skip to content</a><PortalHeader settings={settings}/><div id="main-content" tabIndex={-1}/><RegistrationOffer settings={settings} loading={loading} pathname={pathname}/><Routes>{Object.keys(portalRoutes).map(path=><Route key={path} path={path} element={<Suspense fallback={<main className="shell"><p role="status">Loading page…</p></main>}><PortalPage settings={settings} loading={loading} settingsError={settingsError} reloadSettings={reload}/></Suspense>}/>)}<Route path="/hero-designs" element={<Suspense fallback={<main className="shell"><p>Loading design studio...</p></main>}><HeroDesigns settings={settings}/></Suspense>}/><Route path="/" element={<Home settings={settings} loading={loading} settingsError={settingsError} reloadSettings={reload}/>}/><Route path="/about" element={<AboutPage settings={settings}/>}/><Route path="/prizes" element={<PrizesPage settings={settings}/>}/><Route path="/scholarships" element={<ScholarshipsPage settings={settings} loading={loading} settingsError={settingsError} reloadSettings={reload}/>}/><Route path="/exam-guide" element={<ExtraPage kind="guide" settings={settings}/>}/><Route path="/register" element={<Register settings={settings} loading={loading} settingsError={settingsError} reloadSettings={reload}/>}/><Route path="/status" element={<Status/>}/><Route path="/admin" element={<Suspense fallback={<main className="shell"><p>Loading admin portal...</p></main>}><Admin/></Suspense>}/><Route path="*" element={<main className="shell empty"><h1>Page not found</h1><Link className="btn primary" to="/">Back home</Link></main>}/></Routes><PageMoreContent pathname={pathname}/><Footer settings={settings}/></>}
