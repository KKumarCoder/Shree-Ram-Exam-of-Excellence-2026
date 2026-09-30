// Public naming and class range match the existing registration contract.
export const branding = Object.freeze({
  eventName: 'SHREE 2026 OLYMPIAD',
  eventShortName: 'SHREE',
  eventYear: '2026',
  eventSubtitle: 'Shree Ram Exam of Excellence'
});
export const supportedClasses = Array.from({
  length: 12
}, (_, index) => String(index + 1));
export const prizeCategories = [{
  name: 'Laptop',
  eligibleClasses: 'Classes 9–12',
  description: 'A new way to explore, create and learn.',
  image: '/images/prize-laptop.png'
}, {
  name: 'Tablet',
  eligibleClasses: 'Classes 6–8',
  description: 'Big ideas, ready to go wherever curiosity leads.',
  image: '/images/prize-tablet.png'
}, {
  name: 'Bicycle',
  eligibleClasses: 'Classes 1–5',
  description: 'Celebrate effort with a fresh adventure.',
  image: '/images/prize-bicycle.png'
}, {
  name: 'Smartwatch',
  eligibleClasses: 'Participation category',
  description: 'A little inspiration for every new day.',
  image: '/images/prize-smartwatch-illustration.webp'
}];
