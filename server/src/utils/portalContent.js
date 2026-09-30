import { z } from 'zod';
import { branding, supportedClasses } from '../../../shared/branding.mjs';
const text = (max = 300) => z.string().trim().max(max).default('');
const link = z.string().trim().max(2000).refine(value => !value || /^\/(?!\/)[^\\\s]*$/.test(value) || /^https:\/\/[^\s\\]+$/.test(value), 'Use an HTTPS URL or a local path beginning with one slash.').default('');
const published = {
  isPublished: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10000).default(0)
};
const item = shape => z.object({
  ...shape,
  ...published
}).strict();
const list = schema => z.array(schema).max(150).default([]);
export const portalSchema = z.object({
  eventShortName: text(80).default(branding.eventShortName),
  eventYear: text(10).default(branding.eventYear),
  eventSubtitle: text(160).default(branding.eventSubtitle),
  examMode: text(100),
  officeHours: text(300),
  schoolAddress: text(500),
  eligibilityNotes: text(3000),
  paymentPolicy: text(6000),
  announcement: z.object({
    enabled: z.boolean().default(false),
    text: text(300),
    date: text(80),
    isNew: z.boolean().default(false),
    link
  }).strict().default({}),
  importantDates: list(item({
    title: z.string().trim().min(1).max(160),
    date: text(80),
    description: text(600),
    status: z.enum(['completed', 'active', 'upcoming', 'TBA']).default('TBA')
  })),
  examPattern: z.object({
    isPublished: z.boolean().default(false),
    totalQuestions: text(80),
    totalMarks: text(80),
    duration: text(80),
    questionType: text(100),
    medium: text(100),
    negativeMarking: text(150),
    sections: list(z.object({
      title: z.string().trim().min(1).max(120),
      questions: text(80),
      marks: text(80),
      description: text(600)
    }).strict())
  }).strict().default({}),
  syllabus: list(item({
    studentClass: z.enum(supportedClasses),
    title: text(160),
    description: text(2000),
    topics: z.array(z.string().trim().min(1).max(500)).max(60).default([]),
    fileUrl: link,
    samplePaperUrl: link
  })),
  resources: list(item({
    title: z.string().trim().min(1).max(200),
    category: z.enum(['syllabus', 'sample-paper', 'answer-key', 'bulletin', 'guideline', 'notice-attachment', 'download']),
    studentClass: z.enum(['', ...supportedClasses]).default(''),
    year: text(20),
    description: text(1000),
    fileUrl: link,
    previewUrl: link,
    answerKeyUrl: link,
    fileType: text(30).default('PDF'),
    pages: text(30),
    fileSize: text(50),
    publishedAt: text(80)
  })),
  faq: list(item({
    question: z.string().trim().min(1).max(300),
    answer: z.string().trim().min(1).max(3000),
    category: text(80).default('General')
  })),
  notices: list(item({
    title: z.string().trim().min(1).max(200),
    date: text(80),
    category: text(80).default('General'),
    description: text(3000),
    link,
    isNew: z.boolean().default(false),
    pinned: z.boolean().default(false)
  })),
  guidelines: list(item({
    title: z.string().trim().min(1).max(160),
    description: text(3000)
  })),
  journey: list(item({
    title: z.string().trim().min(1).max(160),
    description: text(600),
    link
  })),
  awardRules: list(item({
    title: z.string().trim().min(1).max(160),
    description: text(3000),
    link
  }))
}).strict();
export function publicPortal(value) {
  // Validate and allowlist persisted data too; never leak arbitrary Mixed fields.
  const parsed = portalSchema.safeParse(value || {});
  const data = parsed.success ? parsed.data : portalSchema.parse({});
  for (const key of ['importantDates', 'syllabus', 'resources', 'faq', 'notices', 'guidelines', 'journey', 'awardRules']) {
    data[key] = data[key].filter(item => item.isPublished).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  if (!data.announcement.enabled) data.announcement = {
    enabled: false
  };
  if (!data.examPattern.isPublished) data.examPattern = {
    isPublished: false
  };
  return data;
}
