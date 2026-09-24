import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Facebook, Instagram, Youtube, Mail, MapPin, Phone } from 'lucide-react';
import './footer.css';

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
            <p>A place for curiosity, confidence and possibility. Celebrating every student’s potential through the SHREE 2026 OLYMPIAD.</p>
          </div>
          <nav className="school-footer-links" aria-label="Footer navigation">
            <h3>YOUR NEXT STEP</h3>
            <Link to="/about">About our school</Link>
            <Link to="/exam-guide">Exam guide</Link>
            <Link to="/help">FAQs & help</Link>
            <Link to="/register">Online registration <ArrowUpRight size={14}/></Link>
            <Link to="/status">Status & admit card <ArrowUpRight size={14}/></Link>
            <Link to="/prizes">Prizes & recognition</Link>
            <Link to="/scholarships">Scholarships</Link>
          </nav>
          <div className="school-footer-contact">
            <h3>LET’S CONNECT</h3>
            <p><MapPin size={18}/><span>Kanhra-Badhra Road, Charkhi Dadri,<br/>Haryana 127306</span></p>
            {settings.contactPhone && <a href={`tel:${settings.contactPhone.replace(/[^+\d]/g, '')}`}><Phone size={17}/>{settings.contactPhone}</a>}
            {settings.contactEmail && <a href={`mailto:${settings.contactEmail}`}><Mail size={17}/>{settings.contactEmail}</a>}
          </div>
          <div className="school-footer-social">
            <h3>LIFE AT SHREE RAM</h3>
            <p>School moments, student achievements and our latest updates.</p>
            <div className="school-footer-social-links">{socials.map(({ label, Icon, href }) => <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} — Shree Ram Public School (opens in a new tab)`} title={label}><Icon size={21}/><span>{label}</span></a>)}</div>
          </div>
        </div>
        <div className="school-footer-bottom"><span>© {new Date().getFullYear()} Shree Ram Public School. All rights reserved.</span><span>SHREE 2026 OLYMPIAD <i aria-hidden="true">/</i> <Link to="/admin">Staff login <ArrowUpRight size={12}/></Link></span></div>
      </div>
    </footer>
  );
}
