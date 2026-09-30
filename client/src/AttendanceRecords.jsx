import React, { useEffect, useRef, useState } from 'react';
import { Download, RefreshCcw, Search, Pencil, Trash2, UserCheck, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { api, downloadBlob } from './api.js';
import { notify } from './notifications.js';
import './attendance.css';

const initial = { search: '', studentClass: '', attendance: '', from: '', to: '', page: 1, limit: 5 };
const dateLabel = value => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const istInput = value => new Date(new Date(value).getTime() + 330 * 60000).toISOString().slice(0, 16);
export function AttendanceRecords({ refreshKey, canEdit, onUnauthorized, onChanged }) {
  const [filters, setFilters] = useState(initial), [search, setSearch] = useState('');
  const [data, setData] = useState({ items: [], total: 0, present: 0, notCheckedIn: 0, pages: 0 });
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const [exporting, setExporting] = useState(''), [target, setTarget] = useState(null), [reason, setReason] = useState('');
  const [time, setTime] = useState(''), [saving, setSaving] = useState(false), [saveError, setSaveError] = useState('');
  const dialog = useRef(null), saveLock = useRef(false), exportLock = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api.get('/admin/attendance', { params: filters, signal: controller.signal }).then(({ data: result }) => {
      if (controller.signal.aborted) return;
      const pages = Math.max(1, result.pages);
      if (filters.page > pages) { setFilters(f => ({ ...f, page: pages })); return; }
      setData(result);
    }).catch(e => { if (!controller.signal.aborted) { setError(e.message); if (e.status === 401) onUnauthorized(); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, refreshKey, revision]);
  useEffect(() => { if (target && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [target]);
  const change = (key, value) => setFilters(f => ({ ...f, [key]: value, page: 1 }));
  function open(student, remove = false) { setTarget({ student, remove }); setTime(istInput(student.checkInAt || new Date())); setReason(''); setSaveError(''); }
  function close() { if (saveLock.current) return; dialog.current.close(); setTarget(null); }
  async function save(event) {
    event.preventDefault(); if (saveLock.current || !target) return;
    saveLock.current = true; setSaving(true); setSaveError('');
    try {
      const body = { expectedCheckInAt: target.student.checkInAt || null, reason: reason.trim() };
      if (!target.remove) body.checkInAt = new Date(`${time}:00+05:30`).toISOString();
      const url = `/admin/attendance/${target.student.id}`;
      const result = target.remove ? await api.delete(url, { data: body }) : await api.patch(url, body);
      notify.success(result.data.message); dialog.current.close(); setTarget(null); onChanged?.();
    } catch (e) { setSaveError(e.message); if (e.status === 401) onUnauthorized(); }
    finally { saveLock.current = false; setSaving(false); setRevision(v => v + 1); }
  }
  async function download(format) {
    if (exportLock.current) return; exportLock.current = true; setExporting(format);
    try {
      const result = await api.get(`/admin/attendance/export.${format}`, { params: filters, responseType: 'blob', timeout: 60000 });
      downloadBlob(result.data, `shree-attendance.${format}`); notify.success('Attendance exported for all matching pages.');
    } catch (e) { notify.error(e.message); if (e.status === 401) onUnauthorized(); }
    finally { exportLock.current = false; setExporting(''); }
  }
  const pages = Math.max(1, data.pages);
  return <section className="attendance-records" aria-label="Attendance records">
    <div className="attendance-heading"><div><span className="records-kicker">EXAM DAY REGISTER</span><h2>Attendance</h2><p>Filter, review and export student check-ins.</p></div>
      <button className="btn light" disabled={loading} onClick={() => setRevision(v => v + 1)}><RefreshCcw size={16} /> Refresh list</button></div>
    <div className="attendance-metrics" aria-live="polite"><div><strong>{data.total}</strong><span>Matching students</span></div><div><strong>{data.present}</strong><span>Present</span></div><div><strong>{data.notCheckedIn}</strong><span>Not checked in</span></div></div>
    <form className="records-filters attendance-filters" onSubmit={e => { e.preventDefault(); change('search', search.trim()); }}>
      <label className="records-search"><span>Search student / registration</span><div><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, reference, guardian or mobile" /><button type="submit" aria-label="Search attendance"><Search size={16} /></button></div></label>
      <label><span>Class</span><select value={filters.studentClass} onChange={e => change('studentClass', e.target.value)}><option value="">All classes</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label>
      <label><span>Attendance</span><select value={filters.attendance} onChange={e => change('attendance', e.target.value)}><option value="">All students</option><option value="PRESENT">Present</option><option value="NOT_CHECKED_IN">Not checked in</option></select></label>
      <label><span>Check-in from (IST)</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={e => change('from', e.target.value)} /></label>
      <label><span>Check-in to (IST)</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={e => change('to', e.target.value)} /></label>
      <button type="button" className="btn light" onClick={() => { setFilters(initial); setSearch(''); }}>Reset filters</button>
    </form>
    {(filters.from || filters.to) && <p className="attendance-note">Date filters apply to check-in time. Students who have not checked in have no check-in date.</p>}
    <div className="records-toolbar"><span>{loading ? 'Loading attendance…' : `${data.total} matching students · exports include all matching pages`}</span><div>{['xlsx', 'pdf'].map(format => <button key={format} className={`btn attendance-export ${format}`} disabled={loading || !!error || !!exporting} onClick={() => download(format)}>{exporting === format ? <Loader2 size={16} className="admin-spin" /> : <Download size={16} />}{format === 'xlsx' ? 'Excel' : 'PDF'}</button>)}</div></div>
    {error && <div className="records-error" role="alert">{error}<button className="btn light" onClick={() => setRevision(v => v + 1)}>Retry</button></div>}
    <div className="table-scroll records-table" aria-busy={loading}><table><thead><tr><th>Student</th><th>Registration</th><th>Class</th><th>Attendance</th><th>Check-in (IST)</th>{canEdit && <th>Actions</th>}</tr></thead><tbody>{data.items.map(student => <tr key={student.id}>
      <td><strong>{student.studentName}</strong><small>{student.guardianName}</small></td><td>{student.registrationNumber || student.applicationRef}</td><td>{student.studentClass}</td>
      <td><span className={`status-pill ${student.checkInAt ? 'present' : 'absent'}`}>{student.checkInAt ? 'Present' : 'Not checked in'}</span></td><td>{dateLabel(student.checkInAt)}</td>
      {canEdit && <td><div className="record-actions"><button disabled={loading || !!error || saving} onClick={() => open(student)}>{student.checkInAt ? <Pencil size={14} /> : <UserCheck size={14} />}{student.checkInAt ? 'Edit' : 'Mark present'}</button>{student.checkInAt && <button className="reject" disabled={loading || !!error || saving} onClick={() => open(student, true)}><Trash2 size={14} /> Delete</button>}</div></td>}
    </tr>)}</tbody></table>{!data.items.length && <div className="records-empty"><UserCheck size={28} /><strong>{loading ? 'Loading attendance…' : error ? 'Attendance unavailable' : 'No matching students'}</strong><p>Adjust your filters or reset to view all confirmed students.</p></div>}</div>
    <div className="records-pagination"><span>{data.total ? `${(filters.page - 1) * filters.limit + 1}–${Math.min(filters.page * filters.limit, data.total)} of ${data.total}` : '0 records'}</span><label>Rows per page <select value={filters.limit} onChange={e => change('limit', Number(e.target.value))}>{[5, 10, 25, 50, 100].map(n => <option key={n}>{n}</option>)}</select></label><nav aria-label="Attendance pagination"><button disabled={loading || filters.page === 1} onClick={() => change('page', 1)}>First</button><button aria-label="Previous attendance page" disabled={loading || filters.page === 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}><ChevronLeft size={16} /></button><span>Page {filters.page} of {pages}</span><button aria-label="Next attendance page" disabled={loading || filters.page >= pages} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}><ChevronRight size={16} /></button><button disabled={loading || filters.page >= pages} onClick={() => setFilters(f => ({ ...f, page: pages }))}>Last</button></nav></div>
    <dialog ref={dialog} className="review-dialog attendance-dialog" onCancel={e => { if (saveLock.current) e.preventDefault(); else setTarget(null); }} onClose={() => { if (!saveLock.current) setTarget(null); }} aria-labelledby="attendance-edit-title">
      <form onSubmit={save}><span className="records-kicker">ATTENDANCE CORRECTION</span><h2 id="attendance-edit-title">{target?.remove ? 'Delete attendance entry?' : target?.student.checkInAt ? 'Edit attendance' : 'Mark student present'}</h2><p>{target?.student.studentName} · {target?.student.registrationNumber}</p>
        {target?.remove ? <p>The student will be marked “Not checked in”. Their registration and payment remain unchanged.</p> : <label><span>Check-in date and time (India / IST)</span><input type="datetime-local" value={time} max={istInput(new Date())} onChange={e => setTime(e.target.value)} required /></label>}
        <label><span>Reason for correction</span><textarea autoFocus required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain why this attendance entry needs changing" /></label><small>Changes are recorded in the admin audit history.</small>
        {saveError && <p role="alert" className="records-error">{saveError}</p>}<div className="dialog-actions"><button type="button" className="btn light" disabled={saving} onClick={close}>Cancel</button><button className={`btn ${target?.remove ? 'reject-submit' : 'primary'}`} disabled={saving || reason.trim().length < 3}>{saving ? 'Saving…' : target?.remove ? 'Delete attendance' : 'Save attendance'}</button></div>
      </form>
    </dialog>
  </section>;
}
