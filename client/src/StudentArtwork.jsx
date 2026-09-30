import React from 'react';

const artwork = {
  welcome: ['shree-2026-students', 'Two students in blue school uniforms carrying books'],
  pattern: ['exam-pattern-students', 'Students reviewing exam questions beside books and a clock'],
  dates: ['important-dates-students', 'Students planning examination milestones on a calendar'],
  syllabus: ['syllabus-preparation-students', 'Students studying together with books and a laptop'],
  practice: ['sample-papers-students', 'Students practising questions on sample papers'],
  exam: ['exam-day-students', 'Students ready for examination day with their documents'],
  help: ['student-helpdesk-support', 'A school staff member helping students at a laptop'],
  awards: ['awards-achievement-students', 'Students celebrating achievement with a trophy and certificate'],
};
const pageArtwork = {
  '/eligibility':'welcome', '/exam-pattern':'pattern', '/important-dates':'dates',
  '/syllabus':'syllabus', '/sample-papers':'practice', '/information-bulletin':'welcome',
  '/downloads':'practice', '/faq':'help', '/notices':'dates', '/exam-guidelines':'exam',
  '/help':'help', '/awards':'awards', '/results':'awards', '/privacy':'help',
  '/terms':'help', '/refund':'help', '/payment-policy':'help',
};
export function StudentArtwork({type, path, className = ''}) {
  const [file, alt] = artwork[type || pageArtwork[path] || 'welcome'];
  return <div className={`student-artwork ${className}`}><img src={`/images/shree-2026/${file}.png`} alt={alt} width="1448" height="1086" loading="lazy" decoding="async"/></div>;
}
