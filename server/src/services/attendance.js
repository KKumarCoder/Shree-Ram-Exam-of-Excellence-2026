import { Registration, Audit } from '../models/index.js';
import { recordFilters } from './adminRecords.js';
import { excelReport, pdfReport } from './adminExport.js';
import { z } from 'zod';
import { parse } from '../utils/validation.js';

export function attendanceFilters(query = {}) {
  const attendance = String(query.attendance || '');
  if (!['', 'PRESENT', 'NOT_CHECKED_IN'].includes(attendance))
    throw Object.assign(new Error('Choose a valid attendance status.'), { status: 400 });
  const filters = recordFilters({ ...query, status: '' });
  const match = { status: 'CONFIRMED' };
  if (filters.studentClass) match.studentClass = filters.studentClass;
  if (filters.search) match.$or = ['studentName', 'guardianName', 'registrationNumber', 'applicationRef', 'guardianPhone'].map(key => ({ [key]: { $regex: filters.search, $options: 'i' } }));
  if (attendance === 'PRESENT') match.checkInAt = { $ne: null };
  if (attendance === 'NOT_CHECKED_IN') match.checkInAt = null;
  if (Object.keys(filters.date).length) {
    // Date filters refer to the actual check-in date, in the school's timezone.
    match.$and = [{ checkInAt: filters.date }];
  }
  return { ...filters, attendance, match };
}
const order = { checkInAt: -1, studentName: 1, _id: 1 };
export async function listAttendance(req, res) {
  const { match, page, limit } = attendanceFilters(req.query);
  const [result] = await Registration.aggregate([{ $match: match }, { $facet: {
    items: [{ $sort: order }, { $skip: (page - 1) * limit }, { $limit: limit }, { $project: {
      studentName: 1, guardianName: 1, studentClass: 1, registrationNumber: 1, applicationRef: 1, checkInAt: 1,
    } }],
    counts: [{ $group: { _id: null, total: { $sum: 1 }, present: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$checkInAt', null] }, null] }, 1, 0] } } } }],
  } }]);
  const { total = 0, present = 0 } = result.counts[0] || {};
  res.json({ items: result.items.map(({ _id, ...row }) => ({ ...row, id: String(_id) })), total, present,
    notCheckedIn: total - present, page, limit, pages: Math.ceil(total / limit) });
}
export async function exportAttendance(req, res) {
  const format = req.params.format;
  if (!['pdf', 'xlsx'].includes(format)) return res.status(400).json({ error: 'Choose PDF or Excel.' });
  const filters = attendanceFilters(req.query);
  const records = await Registration.find(filters.match).sort(order).limit(10001).lean();
  if (records.length > 10000) return res.status(422).json({ error: 'Narrow your filters to export at most 10,000 records.' });
  const columns = ['Student', 'Guardian', 'Registration', 'Class', 'Attendance', 'Check-in (IST)'];
  const rows = records.map(r => [r.studentName, r.guardianName, r.registrationNumber || r.applicationRef,
    r.studentClass, r.checkInAt ? 'Present' : 'Not checked in', r.checkInAt ? new Date(r.checkInAt).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }) : '']);
  const summary = [filters.attendance || 'All attendance', filters.studentClass ? `Class ${filters.studentClass}` : 'All classes',
    `Check-in: ${req.query.from || 'Start'} to ${req.query.to || 'Today'} (IST)`, req.query.search ? `Search: ${String(req.query.search).slice(0,100)}` : ''].filter(Boolean).join(' | ');
  const body = format === 'xlsx' ? await excelReport(columns, rows, 'Attendance') : await pdfReport(columns, rows, 'Exam attendance', summary);
  res.set('Cache-Control', 'private, no-store').attachment(`shree-attendance.${format}`)
    .type(format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf').send(body);
}
const timestamp = z.string().datetime({ offset: true });
const common = { expectedCheckInAt: timestamp.nullable(), reason: z.string().trim().min(3).max(300) };
export async function updateAttendance(req, res) {
  const deleting = req.method === 'DELETE';
  const data = parse(z.object(deleting ? common : { ...common, checkInAt: timestamp }).strict(), req.body);
  const nextDate = deleting ? null : new Date(data.checkInAt);
  if (nextDate && (nextDate.getTime() > Date.now() + 60000 || nextDate.getUTCFullYear() < 2000))
    return res.status(400).json({ error: 'Choose a valid check-in time that is not in the future.' });
  if (deleting && !data.expectedCheckInAt) return res.status(409).json({ error: 'This student has no attendance entry to delete.' });
  const before = await Registration.findOneAndUpdate({ _id: req.params.id, status: 'CONFIRMED',
    checkInAt: data.expectedCheckInAt ? new Date(data.expectedCheckInAt) : null }, { $set: { checkInAt: nextDate } }, { new: false });
  if (!before) return res.status(409).json({ error: 'Attendance changed or student is unavailable. Refresh the list and try again.' });
  await Audit.create({ actor: String(req.admin._id), action: deleting ? 'ATTENDANCE_DELETED' : 'ATTENDANCE_UPDATED', registrationId: before._id,
    details: { before: before.checkInAt, after: nextDate, reason: data.reason } });
  res.json({ message: deleting ? 'Attendance entry deleted. Student is now not checked in.' : 'Attendance updated.' });
}
