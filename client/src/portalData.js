import {eligibleClassLabel} from './publicDisplay.js';
import { branding, supportedClasses, prizeCategories } from '../../shared/branding.mjs';
export { branding, supportedClasses, prizeCategories };
export const eventBrand = settings => ({
  ...branding,
  ...Object.fromEntries(Object.entries(settings.portal || {}).filter(([key, value]) => ['eventShortName', 'eventYear', 'eventSubtitle'].includes(key) && value)),
  eventName: settings.eventName || branding.eventName
});
export const portalRoutes = {
  '/eligibility': ['Eligibility', 'Find the information for your class.'],
  '/exam-pattern': ['Exam Pattern', 'Understand how the SHREE 2026 examination will be structured.'],
  '/syllabus': ['Class-wise Syllabus', 'Select your class to view available preparation information.'],
  '/sample-papers': ['Sample Papers', 'Prepare with official practice resources and understand the examination format.'],
  '/important-dates': ['Important Dates', 'Stay informed about every stage of SHREE 2026.'],
  '/exam-guidelines': ['Exam Day Guidelines', 'Check the official instructions before exam day.'],
  '/information-bulletin': ['Information Bulletin', 'Your guide to the examination and application process.'],
  '/downloads': ['Download Centre', 'Official documents, organised by class and category.'],
  '/notices': ['Notices & Updates', 'The latest published updates from the school.'],
  '/faq': ['Frequently Asked Questions', 'Clear answers to help you take the next step.'],
  '/help': ['School Helpdesk', 'Support for students and guardians, from application to exam day.'],
  '/results': ['Results', 'Results will be published after the examination.'],
  '/awards': ['Awards & Recognition', 'Review the school’s published award information.'],
  '/privacy': ['Privacy Policy', 'How the school handles registration information.'],
  '/terms': ['Terms & Conditions', 'Review the school’s current registration terms.'],
  '/refund': ['Refund / Cancellation Policy', 'Review the current school policy before making a payment.'],
  '/payment-policy': ['Payment Policy', 'Use the payment instructions in the official registration portal.']
};
export function currentFaq(settings) {
  if (settings.portal?.faq?.length) return settings.portal.faq;
  return [{
    category: 'Registration',
    question: 'Who can participate?',
    answer: `Eligible classes for ${eventBrand(settings).eventName}: ${eligibleClassLabel(settings)}. Enter accurate student and school details.`
  }, {
    category: 'Payment',
    question: 'What is the registration fee?',
    answer: `The registration fee is ₹${settings.fee}. Follow the payment instructions displayed in registration.`
  }, {
    category: 'OTP',
    question: 'Why do I need an email address?',
    answer: 'Email OTP verification protects registration and access to private application information. Never share your OTP.'
  }, {
    category: 'Application',
    question: 'Can I correct my application?',
    answer: 'Contact the school with your application reference to discuss a correction.'
  }, {
    category: 'Admit Card',
    question: 'How do I access my documents?',
    answer: 'Open Check Status with your application reference and registered guardian mobile, then verify the email OTP. The application receipt is available during payment review; the admit card is available after payment confirmation.'
  }, {
    category: 'Payment',
    question: 'What if my payment status is still pending?',
    answer: 'Check Status for the latest review outcome. Contact the school with your application reference and payment reference if you need help.'
  }, {
    category: 'Exam',
    question: 'Where are the syllabus and sample papers?',
    answer: 'Open Syllabus or Sample Papers and choose your class. Documents appear when published by the school.'
  }, {
    category: 'Prizes',
    question: 'How are awards determined?',
    answer: 'Check Awards & Recognition for published rules. The school confirms final prize eligibility and scholarship coverage.'
  }];
}
export function applicationStages(record) {
  const confirmed = record.status === 'CONFIRMED';
  const paid = confirmed || record.status === 'CONFIRMING';
  const payment = {
    PAYMENT_PENDING: 'Payment pending',
    PAYMENT_UNDER_VERIFICATION: 'Payment under review',
    PAYMENT_REJECTED: 'Payment rejected',
    CANCELLED: 'Application cancelled',
    CONFIRMING: 'Payment confirmed; preparing registration',
    CONFIRMED: 'Payment confirmed'
  }[record.status] || 'Payment not completed';
  return [{
    title: 'Application created',
    status: 'completed',
    description: record.applicationRef
  }, {
    title: 'Guardian verified',
    status: record.verified ? 'completed' : 'upcoming'
  }, {
    title: payment,
    status: paid ? 'completed' : 'active'
  }, {
    title: 'Registration confirmed',
    status: confirmed ? 'completed' : 'upcoming'
  }, {
    title: confirmed ? 'Admit card available' : 'Admit card pending',
    status: confirmed ? 'completed' : 'upcoming'
  }, {
    title: record.checkInAt ? 'Exam check-in recorded' : 'Examination',
    status: record.checkInAt ? 'completed' : 'upcoming',
    description: record.checkInAt ? 'Attendance check-in recorded; this does not confirm exam completion.' : ''
  }, {
    title: 'Result & recognition',
    status: 'TBA',
    description: 'To be announced'
  }];
}
