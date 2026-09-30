import React, { useEffect, useRef, useState } from 'react';
import { Check, X, Download, Search, RefreshCcw, ChevronLeft, ChevronRight, Loader2, FileText, SlidersHorizontal } from 'lucide-react';
import { api, downloadBlob } from './api.js';
import { notify } from './notifications.js';
import './admin-records.css';

const statuses = {
  payments: ['UNDER_REVIEW', 'PAID', 'REJECTED'],
  registrations: ['DRAFT', 'OTP_VERIFIED', 'PAYMENT_PENDING', 'PAYMENT_UNDER_VERIFICATION', 'CONFIRMING', 'CONFIRMED', 'PAYMENT_REJECTED', 'CANCELLED'],
};
const labels = { UNDER_REVIEW: 'Awaiting review', PAID: 'Approved', REJECTED: 'Rejected', DRAFT: 'Email pending', OTP_VERIFIED: 'Email verified', PAYMENT_PENDING: 'Payment pending', PAYMENT_UNDER_VERIFICATION: 'Payment review', CONFIRMING: 'Confirming', CONFIRMED: 'Confirmed', PAYMENT_REJECTED: 'Payment rejected', CANCELLED: 'Cancelled' };
const initialFilters = { search: '', status: '', studentClass: '', from: '', to: '', limit: 5, page: 1 };
const dateLabel = value => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
function Badge({ status }) { return <span className={`review-badge state-${status?.toLowerCase()}`}>{labels[status] || status}</span>; }

export function AdminRecords({ kind, refreshKey, canPay, canExam, onUnauthorized, onPdf }) {
  const payments = kind === 'payments';
  const [filters, setFilters] = useState(initialFilters);
  const [search, setSearch] = useState('');
  const [data, setData] = useState({ items: [], total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [actions, setActions] = useState({});
  const [exporting, setExporting] = useState('');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [reason, setReason] = useState('');
  const locks = useRef(new Set());
  const exportLock = useRef(false);
  const requestVersion = useRef(0);
  const dialog = useRef(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const version = ++requestVersion.current;
    const controller = new AbortController();
    setLoading(true); setError('');
    api.get(`/admin/${kind}`, { params: filters, signal: controller.signal }).then(({ data: result }) => {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      const pages = Math.max(1, result.pages || Math.ceil(result.total / filters.limit));
      if (filters.page > pages) { setFilters(f => ({ ...f, page: pages })); return; }
      setData(result);
    }).catch(e => {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setError(e.message);
      if (e.status === 401) onUnauthorized();
    }).finally(() => {
      if (!controller.signal.aborted && version === requestVersion.current) setLoading(false);
    });
    return () => controller.abort();
  }, [kind, filters, revision, refreshKey]);
  useEffect(() => {
    if (rejectTarget && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [rejectTarget]);
  const change = (key, value) => setFilters(f => ({ ...f, [key]: value, page: 1 }));
  async function review(payment, approve, note = '') {
    const id = payment._id;
    if (locks.current.has(id)) return;
    locks.current.add(id);
    setActions(a => ({ ...a, [id]: approve ? 'approve' : 'reject' }));
    try {
      const result = await api.post(`/admin/payments/${id}/${approve ? 'approve' : 'reject'}`, { note: approve ? 'Transaction verified against actual bank/UPI records.' : note.trim() });
      if (!alive.current) return;
      // Only mark a row reviewed after the server has committed its decision.
      ++requestVersion.current;
      setData(current => ({ ...current, items: current.items.map(p => p._id === id ? {
        ...p, status: approve ? 'PAID' : 'REJECTED', reviewNote: note,
        registrationId: { ...p.registrationId, status: result.data.registration?.status || (approve ? 'CONFIRMED' : 'PAYMENT_REJECTED') },
      } : p) }));
      if (!approve) { dialog.current?.close(); setRejectTarget(null); setReason(''); }
      notify.success(result.data.message);
    } catch (e) {
      if (!alive.current) return;
      notify.error(e.message);
      if (e.status === 401) onUnauthorized();
    } finally {
      locks.current.delete(id);
      if (alive.current) { setActions(a => { const next = { ...a }; delete next[id]; return next; }); setRevision(v => v + 1); }
    }
  }
  async function receipt(payment) {
    const key = `receipt:${payment._id}`;
    if (locks.current.has(key)) return;
    locks.current.add(key); setActions(a => ({ ...a, [key]: 'download' }));
    try {
      const r = await api.get(`/admin/payments/${payment._id}/receipt`, { responseType: 'blob' });
      const extension = r.data.type.includes('pdf') ? 'pdf' : r.data.type.includes('png') ? 'png' : 'jpg';
      downloadBlob(r.data, `receipt-${payment.utr || payment._id}.${extension}`);
    } catch (e) { notify.error(e.message); if (e.status === 401) onUnauthorized(); }
    finally { locks.current.delete(key); if (alive.current) setActions(a => { const next = { ...a }; delete next[key]; return next; }); }
  }
  async function exportReport(format) {
    if (exportLock.current) return;
    exportLock.current = true; setExporting(format);
    try {
      const r = await api.get(`/admin/records/${kind}/export.${format}`, { params: filters, responseType: 'blob', timeout: 60000 });
      downloadBlob(r.data, `shree-${kind}.${format}`);
      notify.success('Report downloaded. Includes all records matching your filters.');
    } catch (e) { notify.error(e.message); if (e.status === 401) onUnauthorized(); }
    finally { exportLock.current = false; if (alive.current) setExporting(''); }
  }
  const pages = Math.max(1, data.pages || Math.ceil(data.total / filters.limit));
  return <section className="admin-panel records-panel" aria-label={payments ? 'Payment records' : 'Registration records'}>
    <div className="records-heading">
      <div><span className="records-kicker">{payments ? 'PAYMENT OPERATIONS' : 'STUDENT DIRECTORY'}</span><h2>{payments ? 'Review payments' : 'Manage registrations'}</h2><p>{payments ? 'Verify the bank or UPI transaction before approving a receipt.' : 'Find students, track applications and download your records.'}</p></div>
      <div className="records-count"><strong>{data.total.toLocaleString('en-IN')}</strong><span>matching records</span></div>
    </div>
    {payments && <div className="review-tabs" aria-label="Payment status filters">{['', ...statuses.payments].map(status => <button key={status} type="button" aria-pressed={filters.status === status} className={filters.status === status ? 'selected' : ''} onClick={() => change('status', status)}>{status ? labels[status] : 'All payments'}</button>)}</div>}
    <form className="records-filters" onSubmit={e => { e.preventDefault(); change('search', search.trim()); }}>
      <label className="records-search"><span>Search records</span><div><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={payments ? 'Student, UTR, reference, mobile…' : 'Student, reference, mobile, email…'} /><button type="submit" aria-label="Apply search"><Search size={16} /></button></div></label>
      {!payments && <label><span>Status</span><select value={filters.status} onChange={e => change('status', e.target.value)}><option value="">All statuses</option>{statuses.registrations.map(status => <option key={status} value={status}>{labels[status]}</option>)}</select></label>}
      <label><span>Class</span><select value={filters.studentClass} onChange={e => change('studentClass', e.target.value)}><option value="">All classes</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Class {i + 1}</option>)}</select></label>
      <label><span>From date (IST)</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={e => change('from', e.target.value)} /></label>
      <label><span>To date (IST)</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={e => change('to', e.target.value)} /></label>
      <button type="button" className="btn light records-reset" onClick={() => { setFilters(initialFilters); setSearch(''); }}><SlidersHorizontal size={15} /> Reset</button>
    </form>
    <div className="records-toolbar"><span>{loading ? <><Loader2 className="admin-spin" size={15} /> Updating records…</> : `${data.total} records · exports include all matching pages`}</span><div>{['xlsx', 'pdf', 'csv'].map(format => <button type="button" className="btn light" key={format} disabled={!!exporting || loading || !!error} onClick={() => exportReport(format)}>{exporting === format ? <Loader2 size={15} className="admin-spin" /> : <Download size={15} />}{format === 'xlsx' ? 'Excel' : format.toUpperCase()}</button>)}</div></div>
    {error && <div className="records-error" role="alert"><span>Could not update records: {error}</span><button className="btn light" onClick={() => setRevision(v => v + 1)}><RefreshCcw size={15} /> Retry</button></div>}
    <div className="table-scroll records-table" aria-busy={loading}>
      <table><thead><tr>{(payments ? ['Student', 'Amount', 'Transaction / UTR', 'Submitted', 'Status', 'Actions'] : ['Student', 'Reference', 'Class', 'Contact', 'Status', 'Actions']).map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{data.items.map(record => {
          const student = payments ? record.registrationId : record;
          const id = payments ? record._id : record.id;
          const processing = actions[id];
          const recovery = payments && record.status === 'PAID' && student?.status !== 'CONFIRMED';
          return <tr key={id} className={processing ? 'row-processing' : ''}>
            <td><strong>{student?.studentName || 'Student unavailable'}</strong><small>{payments ? `Class ${student?.studentClass || '—'} · ${student?.applicationRef || '—'}` : student.guardianName}</small></td>
            {payments ? <><td className="amount-cell">₹{Number(record.amount).toLocaleString('en-IN')}</td><td><span className="utr-value">{record.utr || '—'}</span>{record.reviewNote && <small>{record.reviewNote}</small>}</td><td>{dateLabel(record.createdAt)}</td></> : <><td>{student.registrationNumber || student.applicationRef}<small>{dateLabel(student.createdAt)}</small></td><td>{student.studentClass}</td><td>{student.guardianPhone}<small>{student.email}</small></td></>}
            <td><Badge status={record.status} />{recovery && <small>Confirmation incomplete</small>}</td>
            <td><div className="record-actions">{payments ? <>
              {canPay && <button className="receipt-action" disabled={!record.hasReceipt || !!actions[`receipt:${id}`]} onClick={() => receipt(record)}>{actions[`receipt:${id}`] ? <Loader2 size={14} className="admin-spin" /> : <FileText size={14} />} Receipt</button>}
              {canPay && (record.status === 'UNDER_REVIEW' || recovery) && <button className="approve" disabled={!!processing || loading || !!error} onClick={() => review(record, true)}>{processing === 'approve' ? <Loader2 size={14} className="admin-spin" /> : <Check size={14} />}{processing === 'approve' ? 'Approving…' : recovery ? 'Retry confirmation' : 'Approve'}</button>}
              {canPay && record.status === 'UNDER_REVIEW' && <button className="reject" disabled={!!processing || loading || !!error} onClick={() => { setRejectTarget(record); setReason(''); }}><X size={14} />{processing === 'reject' ? 'Rejecting…' : 'Reject'}</button>}
            </> : record.status === 'CONFIRMED' && canExam ? <><button onClick={() => onPdf(record.id)}><Download size={14} /> Admit PDF</button></> : <span className="record-muted">—</span>}</div></td>
          </tr>;
        })}</tbody>
      </table>
      {!data.items.length && <div className="records-empty"><Search size={28} /><strong>{loading ? 'Loading records…' : error ? 'Records unavailable' : 'No matching records'}</strong><p>{!loading && !error ? 'Try a different search or reset your filters.' : 'Please wait or use Retry above.'}</p></div>}
    </div>
    <div className="records-pagination"><span>{data.total ? `${(filters.page - 1) * filters.limit + 1}–${Math.min(filters.page * filters.limit, data.total)} of ${data.total}` : '0 records'}</span><label>Rows per page <select value={filters.limit} onChange={e => change('limit', Number(e.target.value))}>{[5, 10, 25, 50, 100].map(n => <option key={n}>{n}</option>)}</select></label><nav aria-label="Table pagination"><button disabled={loading || filters.page === 1} onClick={() => setFilters(f => ({ ...f, page: 1 }))}>First</button><button aria-label="Previous page" disabled={loading || filters.page === 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}><ChevronLeft size={16} /></button><span>Page {filters.page} of {pages}</span><button aria-label="Next page" disabled={loading || filters.page >= pages} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}><ChevronRight size={16} /></button><button disabled={loading || filters.page >= pages} onClick={() => setFilters(f => ({ ...f, page: pages }))}>Last</button></nav></div>
    <dialog ref={dialog} className="review-dialog" onCancel={e => { if (actions[rejectTarget?._id]) e.preventDefault(); else setRejectTarget(null); }} onClose={() => { if (!actions[rejectTarget?._id]) setRejectTarget(null); }} aria-labelledby="reject-heading">
      <form onSubmit={e => { e.preventDefault(); if (reason.trim().length >= 5) review(rejectTarget, false, reason); }}><span className="records-kicker">PAYMENT DECISION</span><h2 id="reject-heading">Reject payment</h2><p>{rejectTarget?.registrationId?.studentName} · UTR {rejectTarget?.utr}</p><label><span>Reason for rejection</span><textarea autoFocus required minLength={5} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain what needs to be corrected…" /></label><small>Enter at least 5 characters. The reason is saved with the payment.</small><div className="dialog-actions"><button type="button" className="btn light" disabled={!!actions[rejectTarget?._id]} onClick={() => { dialog.current.close(); setRejectTarget(null); }}>Cancel</button><button className="btn reject-submit" disabled={!!actions[rejectTarget?._id] || reason.trim().length < 5}>{actions[rejectTarget?._id] ? 'Rejecting…' : 'Reject payment'}</button></div></form>
    </dialog>
  </section>;
}
