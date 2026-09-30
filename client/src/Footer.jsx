import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Facebook, Instagram, Youtube, Mail, MapPin, Phone } from 'lucide-react';
import './footer.css';
import {eventBrand} from './portalData.js';

const socials = [
  { label: 'YouTube', Icon: Youtube, href: 'https://www.youtube.com/@shreeramschoolkanhra' },
  { label: 'Facebook', Icon: Facebook, href: 'https://www.facebook.com/srpskanhra2014/' },
  { label: 'Instagram', Icon: Instagram, href: 'https://www.instagram.com/srpskanhracharkhidadri/' },
];

export function Footer({ settings }) {
  return (
    <footer className="school-footer">
      <div className="shell">
        <div className="school-footer-intro">
          <div><span className="school-footer-kicker">LEARN. GROW. ACHIEVE.</span><h2>Bright minds. Brighter futures.</h2></div>
          <a className="school-footer-visit" href="https://www.srpskanhra.com/" target="_blank" rel="noopener noreferrer">Explore our school <ArrowUpRight size={19}/></a>
        </div>
        <div className="school-footer-grid">
          <div className="school-footer-about">
            <Link to="/" className="school-footer-brand" aria-label="Shree Ram Public School home"><img src="/images/school-logo.png" alt="" width="64" height="76" loading="lazy"/><span>SHREE RAM<strong>PUBLIC SCHOOL</strong><small>EST. 2012 · KANHRA</small></span></Link>
            <p>A place for curiosity, confidence and possibility. Celebrating every student’s potential through {eventBrand(settings).eventName}.</p>
            <div className="school-footer-contact school-footer-contact-compact">
              <p><MapPin size={16}/><span>{settings.portal?.schoolAddress || settings.venue}</span></p>
              {settings.contactPhone && <a href={`tel:${settings.contactPhone.replace(/[^+\d]/g, '')}`}><Phone size={15}/>{settings.contactPhone}</a>}
              {settings.contactEmail && <a href={`mailto:${settings.contactEmail}`}><Mail size={15}/>{settings.contactEmail}</a>}
            </div>
          </div>
          <nav className="school-footer-links" aria-label="Footer navigation">
            <h3>EXAM INFORMATION</h3>
            <Link to="/about">About our school</Link>
            <Link to="/eligibility">Eligibility</Link><Link to="/exam-pattern">Exam pattern</Link><Link to="/syllabus">Syllabus</Link><Link to="/important-dates">Important dates</Link>
            <Link to="/exam-guidelines">Exam guidelines</Link>
          </nav>
          <nav className="school-footer-links" aria-label="Candidate services">
            <h3>CANDIDATE SERVICES</h3>
            <Link to="/register">Online registration <ArrowUpRight size={14}/></Link>
            <Link to="/status">Status & admit card <ArrowUpRight size={14}/></Link>
            <Link to="/prizes">Prizes & recognition</Link>
            <Link to="/scholarships">Scholarships</Link>
            <Link to="/help">Help desk</Link>
          </nav>
          <div className="school-footer-social">
            <h3>RESOURCES</h3><nav className="school-footer-links" aria-label="Resources and support"><Link to="/sample-papers">Sample papers</Link><Link to="/downloads">Downloads</Link><Link to="/information-bulletin">Information bulletin</Link><Link to="/notices">Notices</Link><Link to="/results">Results</Link><Link to="/faq">FAQs</Link></nav>
            <div className="school-footer-social-links">{socials.map(({ label, Icon, href }) => <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} — Shree Ram Public School (opens in a new tab)`} title={label}><Icon size={21}/><span>{label}</span></a>)}</div>
          </div>
        </div>
        <nav className="footer-portal-links" aria-label="School policies"><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms & Conditions</Link><Link to="/refund">Refund / Cancellation Policy</Link><Link to="/payment-policy">Payment Policy</Link></nav>
        <div className="school-footer-bottom"><span>© {new Date().getFullYear()} Shree Ram Public School. All rights reserved.</span><span>{eventBrand(settings).eventName} <i aria-hidden="true">/</i> <Link to="/admin">Staff login <ArrowUpRight size={12}/></Link></span></div>
      </div>
    </footer>
  );
}
