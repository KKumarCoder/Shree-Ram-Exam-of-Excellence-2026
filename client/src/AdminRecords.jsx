import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  X,
  Download,
  Search,
  RefreshCcw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  SlidersHorizontal,
  Eye,
  History,
  Users,
  Mail,
  Edit2,
  Trash2,
  AlertTriangle,
  Save,
} from "lucide-react";
import { api, downloadBlob } from "./api.js";
import { notify } from "./notifications.js";
import { supportedClasses } from "./portalData.js";
import "./admin-records.css";

const statuses = {
  payments: ["UNDER_REVIEW", "PAID", "REJECTED"],
  registrations: [
    "DRAFT",
    "OTP_VERIFIED",
    "PAYMENT_PENDING",
    "AWAITING_PAYMENT",
    "PAYMENT_SUBMITTED",
    "UNDER_REVIEW",
    "CONFIRMED",
    "APPROVED",
    "PAYMENT_REJECTED",
    "CANCELLED",
  ],
};
const labels = {
  UNDER_REVIEW: "Payment under review",
  PAID: "Approved",
  REJECTED: "Rejected",
  DRAFT: "Draft (Email pending)",
  AWAITING_PAYMENT: "Awaiting payment proof",
  PAYMENT_SUBMITTED: "Payment submitted",
  PAYMENT_UNDER_VERIFICATION: "Payment review",
  CONFIRMING: "Confirming",
  CONFIRMED: "Approved (Confirmed)",
  APPROVED: "Approved (Confirmed)",
  OTP_VERIFIED: "Email verified",
  PAYMENT_PENDING: "Payment pending",
  PAYMENT_REJECTED: "Payment rejected",
  CANCELLED: "Cancelled / Superseded",
};
const initialFilters = {
  search: "",
  status: "",
  studentClass: "",
  course: "",
  from: "",
  to: "",
  limit: 5,
  page: 1,
};
const dateLabel = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      })
    : "—";
function Badge({ status }) {
  return (
    <span className={`review-badge state-${status?.toLowerCase()}`}>
      {labels[status] || status}
    </span>
  );
}

export function AdminRecords({
  kind,
  refreshKey,
  canPay,
  canExam,
  onUnauthorized,
  onPdf,
}) {
  const payments = kind === "payments";
  const [filters, setFilters] = useState(initialFilters);
  const [search, setSearch] = useState("");
  const [data, setData] = useState({ items: [], total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [actions, setActions] = useState({});
  const [exporting, setExporting] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [selectedStudentDetail, setSelectedStudentDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const locks = useRef(new Set());
  const exportLock = useRef(false);
  const requestVersion = useRef(0);
  const dialog = useRef(null);
  const alive = useRef(true);

  // CRUD State for Payments & Registrations
  const [editPaymentTarget, setEditPaymentTarget] = useState(null);
  const [editPaymentForm, setEditPaymentForm] = useState({
    utr: "",
    amount: 149,
    status: "UNDER_REVIEW",
    reviewNote: "",
  });
  const [deletePaymentTarget, setDeletePaymentTarget] = useState(null);

  const [editRegistrationTarget, setEditRegistrationTarget] = useState(null);
  const [editRegistrationForm, setEditRegistrationForm] = useState({
    studentName: "",
    studentClass: "5",
    course: "",
    dob: "",
    currentSchool: "",
    guardianName: "",
    guardianPhone: "",
    email: "",
    address: "",
    city: "",
    district: "",
    state: "HARYANA",
    pincode: "",
    status: "DRAFT",
    registrationNumber: "",
  });
  const [deleteRegistrationTarget, setDeleteRegistrationTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [saving, setSaving] = useState(false);

  function openEditPayment(p) {
    setEditPaymentTarget(p);
    setEditPaymentForm({
      utr: p.utr || "",
      amount: p.amount || 149,
      status: p.status || "UNDER_REVIEW",
      reviewNote: p.reviewNote || "",
    });
  }

  async function saveEditPayment(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: res } = await api.patch(
        `/admin/payments/${editPaymentTarget._id}`,
        editPaymentForm
      );
      notify.success(res.message || "Payment updated successfully.");
      setEditPaymentTarget(null);
      setRevision((r) => r + 1);
    } catch (err) {
      notify.error(
        err.response?.data?.error || err.message || "Failed to update payment."
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeletePayment() {
    setSaving(true);
    try {
      const { data: res } = await api.delete(
        `/admin/payments/${deletePaymentTarget._id}`
      );
      notify.success(res.message || "Payment deleted successfully.");
      setDeletePaymentTarget(null);
      setRevision((r) => r + 1);
    } catch (err) {
      notify.error(
        err.response?.data?.error || err.message || "Failed to delete payment."
      );
    } finally {
      setSaving(false);
    }
  }

  function openEditRegistration(r) {
    setEditRegistrationTarget(r);
    setEditRegistrationForm({
      studentName: r.studentName || "",
      studentClass: String(r.studentClass || "5"),
      course: r.course || "",
      dob: r.dob || "",
      currentSchool: r.currentSchool || "",
      guardianName: r.guardianName || "",
      guardianPhone: r.guardianPhone || "",
      email: r.email || "",
      address: r.address || "",
      city: r.city || "",
      district: r.district || "",
      state: r.state || "HARYANA",
      pincode: r.pincode || "",
      status: r.status || "DRAFT",
      registrationNumber: r.registrationNumber || "",
    });
  }

  async function saveEditRegistration(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: res } = await api.patch(
        `/admin/registrations/${editRegistrationTarget.id}`,
        editRegistrationForm
      );
      notify.success(res.message || "Registration updated successfully.");
      setEditRegistrationTarget(null);
      setRevision((r) => r + 1);
    } catch (err) {
      notify.error(
        err.response?.data?.error ||
          err.message ||
          "Failed to update registration."
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteRegistration() {
    setSaving(true);
    try {
      const { data: res } = await api.delete(
        `/admin/registrations/${deleteRegistrationTarget.id}`,
        {
          data: { reason: deleteReason || "Deleted by administrator" },
        }
      );
      notify.success(res.message || "Registration deleted successfully.");
      setDeleteRegistrationTarget(null);
      setDeleteReason("");
      setRevision((r) => r + 1);
    } catch (err) {
      notify.error(
        err.response?.data?.error ||
          err.message ||
          "Failed to delete registration."
      );
    } finally {
      setSaving(false);
    }
  }

  async function viewStudentDetail(id) {
    setDetailLoading(true);
    try {
      const { data: detail } = await api.get(`/admin/registrations/${id}/history`);
      setSelectedStudentDetail(detail);
    } catch (err) {
      notify.error(err.message || "Failed to load student history.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function sendReminder(id, name) {
    if (
      !window.confirm(
        `Send registration reminder email to the guardian of ${name || "this student"}?`,
      )
    )
      return;
    setActions((prev) => ({ ...prev, [`remind:${id}`]: true }));
    try {
      const { data } = await api.post(`/admin/registrations/${id}/remind`);
      notify.success(data.message || "Reminder email sent successfully.");
      setRevision((r) => r + 1);
    } catch (err) {
      notify.error(err.message || "Failed to send reminder email.");
    } finally {
      setActions((prev) => ({ ...prev, [`remind:${id}`]: false }));
    }
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const version = ++requestVersion.current;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api
      .get(`/admin/${kind}`, { params: filters, signal: controller.signal })
      .then(({ data: result }) => {
        if (controller.signal.aborted || version !== requestVersion.current)
          return;
        const pages = Math.max(
          1,
          result.pages || Math.ceil(result.total / filters.limit),
        );
        if (filters.page > pages) {
          setFilters((f) => ({ ...f, page: pages }));
          return;
        }
        setData(result);
      })
      .catch((e) => {
        if (controller.signal.aborted || version !== requestVersion.current)
          return;
        setError(e.message);
        if (e.status === 401) onUnauthorized();
      })
      .finally(() => {
        if (!controller.signal.aborted && version === requestVersion.current)
          setLoading(false);
      });
    return () => controller.abort();
  }, [kind, filters, revision, refreshKey]);
  useEffect(() => {
    if (rejectTarget && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [rejectTarget]);
  const change = (key, value) =>
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  async function review(payment, approve, note = "") {
    const id = payment._id;
    if (locks.current.has(id)) return;
    locks.current.add(id);
    setActions((a) => ({ ...a, [id]: approve ? "approve" : "reject" }));
    try {
      const result = await api.post(
        `/admin/payments/${id}/${approve ? "approve" : "reject"}`,
        {
          note: approve
            ? "Transaction verified against actual bank/UPI records."
            : note.trim(),
        },
      );
      if (!alive.current) return;
      // Only mark a row reviewed after the server has committed its decision.
      ++requestVersion.current;
      setData((current) => ({
        ...current,
        items: current.items.map((p) =>
          p._id === id
            ? {
                ...p,
                status: approve ? "PAID" : "REJECTED",
                reviewNote: note,
                registrationId: {
                  ...p.registrationId,
                  status:
                    result.data.registration?.status ||
                    (approve ? "CONFIRMED" : "PAYMENT_REJECTED"),
                },
              }
            : p,
        ),
      }));
      if (!approve) {
        dialog.current?.close();
        setRejectTarget(null);
        setReason("");
      }
      notify.success(result.data.message);
    } catch (e) {
      if (!alive.current) return;
      notify.error(e.message);
      if (e.status === 401) onUnauthorized();
    } finally {
      locks.current.delete(id);
      if (alive.current) {
        setActions((a) => {
          const next = { ...a };
          delete next[id];
          return next;
        });
        setRevision((v) => v + 1);
      }
    }
  }
  async function receipt(payment) {
    const key = `receipt:${payment._id}`;
    if (locks.current.has(key)) return;
    locks.current.add(key);
    setActions((a) => ({ ...a, [key]: "download" }));
    try {
      const r = await api.get(`/admin/payments/${payment._id}/receipt`, {
        responseType: "blob",
      });
      const extension = r.data.type.includes("pdf")
        ? "pdf"
        : r.data.type.includes("png")
          ? "png"
          : "jpg";
      downloadBlob(
        r.data,
        `receipt-${payment.utr || payment._id}.${extension}`,
      );
    } catch (e) {
      notify.error(e.message);
      if (e.status === 401) onUnauthorized();
    } finally {
      locks.current.delete(key);
      if (alive.current)
        setActions((a) => {
          const next = { ...a };
          delete next[key];
          return next;
        });
    }
  }
  async function exportReport(format) {
    if (exportLock.current) return;
    exportLock.current = true;
    setExporting(format);
    try {
      const r = await api.get(`/admin/records/${kind}/export.${format}`, {
        params: filters,
        responseType: "blob",
        timeout: 60000,
      });
      downloadBlob(r.data, `shree-${kind}.${format}`);
      notify.success(
        "Report downloaded. Includes all records matching your filters.",
      );
    } catch (e) {
      notify.error(e.message);
      if (e.status === 401) onUnauthorized();
    } finally {
      exportLock.current = false;
      if (alive.current) setExporting("");
    }
  }
  const pages = Math.max(
    1,
    data.pages || Math.ceil(data.total / filters.limit),
  );
  return (
    <section
      className="admin-panel records-panel"
      aria-label={payments ? "Payment records" : "Registration records"}
    >
      <div className="records-heading">
        <div>
          <span className="records-kicker">
            {payments ? "PAYMENT OPERATIONS" : "STUDENT DIRECTORY"}
          </span>
          <h2>{payments ? "Review payments" : "Manage registrations"}</h2>
          <p>
            {payments
              ? "Verify the bank or UPI transaction before approving a receipt."
              : "Find students, track applications and download your records."}
          </p>
        </div>
        <div className="records-count">
          <strong>{data.total.toLocaleString("en-IN")}</strong>
          <span>matching records</span>
        </div>
      </div>
      {payments && (
        <div className="review-tabs" aria-label="Payment status filters">
          {["", ...statuses.payments].map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={filters.status === status}
              className={filters.status === status ? "selected" : ""}
              onClick={() => change("status", status)}
            >
              {status ? labels[status] : "All payments"}
            </button>
          ))}
        </div>
      )}
      <form
        className="records-filters"
        onSubmit={(e) => {
          e.preventDefault();
          change("search", search.trim());
        }}
      >
        <label className="records-search">
          <span>Search records</span>
          <div>
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                payments
                  ? "Student, UTR, reference, mobile…"
                  : "Student, reference, mobile, email…"
              }
            />
            <button type="submit" aria-label="Apply search">
              <Search size={16} />
            </button>
          </div>
        </label>
        {!payments && (
          <label>
            <span>Status</span>
            <select
              value={filters.status}
              onChange={(e) => change("status", e.target.value)}
            >
              <option value="">All statuses</option>
              {statuses.registrations.map((status) => (
                <option key={status} value={status}>
                  {labels[status]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>Class</span>
          <select
            value={filters.studentClass}
            onChange={(e) => {
              const val = e.target.value;
              change("studentClass", val);
              if (val !== "11" && filters.course) {
                change("course", "");
              }
            }}
          >
            <option value="">All classes</option>
            {supportedClasses.map((studentClass) => (
              <option key={studentClass} value={studentClass}>
                Class {studentClass}
              </option>
            ))}
          </select>
        </label>
        {!payments && (
          <label>
            <span>Stream / Course</span>
            <select
              value={filters.course}
              onChange={(e) => change("course", e.target.value)}
            >
              <option value="">All streams</option>
              <option value="PCM">PCM (Non-Med)</option>
              <option value="PCB">PCB (Medical)</option>
              <option value="ARTS">ARTS (Humanities)</option>
              <option value="COMMERCE">COMMERCE</option>
            </select>
          </label>
        )}
        <label>
          <span>From date (IST)</span>
          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => change("from", e.target.value)}
          />
        </label>
        <label>
          <span>To date (IST)</span>
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => change("to", e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn light records-reset"
          onClick={() => {
            setFilters(initialFilters);
            setSearch("");
          }}
        >
          <SlidersHorizontal size={15} /> Reset
        </button>
      </form>
      <div className="records-toolbar">
        <span>
          {loading ? (
            <>
              <Loader2 className="admin-spin" size={15} /> Updating records…
            </>
          ) : (
            `${data.total} records · exports include all matching pages`
          )}
        </span>
        <div>
          {["xlsx", "pdf", "csv"].map((format) => (
            <button
              type="button"
              className="btn light"
              key={format}
              disabled={!!exporting || loading || !!error}
              onClick={() => exportReport(format)}
            >
              {exporting === format ? (
                <Loader2 size={15} className="admin-spin" />
              ) : (
                <Download size={15} />
              )}
              {format === "xlsx" ? "Excel" : format.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <div className="records-error" role="alert">
          <span>Could not update records: {error}</span>
          <button
            className="btn light"
            onClick={() => setRevision((v) => v + 1)}
          >
            <RefreshCcw size={15} /> Retry
          </button>
        </div>
      )}
      <div className="table-scroll records-table" aria-busy={loading}>
        <table>
          <thead>
            <tr>
              {(payments
                ? [
                    "Student",
                    "Amount",
                    "Transaction / UTR",
                    "Submitted",
                    "Status",
                    "Actions",
                  ]
                : [
                    "Student",
                    "Reference",
                    "Class",
                    "Contact",
                    "Status",
                    "Actions",
                  ]
              ).map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((record) => {
              const student = payments ? record.registrationId : record;
              const id = payments ? record._id : record.id;
              const processing = actions[id];
              const recovery =
                payments &&
                record.status === "PAID" &&
                student?.status !== "CONFIRMED";
              return (
                <tr key={id} className={processing ? "row-processing" : ""}>
                  <td>
                    <strong>
                      {student?.studentName || "Student unavailable"}
                    </strong>
                    <small>
                      {payments
                        ? `Class ${student?.studentClass || "—"} · ${student?.applicationRef || "—"}`
                        : student.guardianName}
                    </small>
                  </td>
                  {payments ? (
                    <>
                      <td className="amount-cell">
                        ₹{Number(record.amount).toLocaleString("en-IN")}
                      </td>
                      <td>
                        <span className="utr-value">{record.utr || "—"}</span>
                        {record.reviewNote && (
                          <small>{record.reviewNote}</small>
                        )}
                      </td>
                      <td>{dateLabel(record.createdAt)}</td>
                    </>
                  ) : (
                    <>
                      <td>
                        {student.registrationNumber || student.applicationRef}
                        <small>{dateLabel(student.createdAt)}</small>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: "var(--erp-navy, #193651)" }}>
                          Class {student.studentClass}
                        </div>
                        {student.studentClass === "11" && (
                          <div style={{ marginTop: "3px" }}>
                            {student.course ? (
                              <span
                                style={{
                                  display: "inline-block",
                                  fontSize: "0.68rem",
                                  fontWeight: 800,
                                  padding: "2px 7px",
                                  borderRadius: "6px",
                                  letterSpacing: "0.02em",
                                  background:
                                    student.course === "PCM"
                                      ? "#E0F2FE"
                                      : student.course === "PCB"
                                      ? "#DCFCE7"
                                      : student.course === "ARTS"
                                      ? "#FEF3C7"
                                      : "#F3E8FF",
                                  color:
                                    student.course === "PCM"
                                      ? "#0369A1"
                                      : student.course === "PCB"
                                      ? "#15803D"
                                      : student.course === "ARTS"
                                      ? "#B45309"
                                      : "#6B21A8",
                                  border:
                                    student.course === "PCM"
                                      ? "1px solid #BAE6FD"
                                      : student.course === "PCB"
                                      ? "1px solid #BBF7D0"
                                      : student.course === "ARTS"
                                      ? "1px solid #FDE68A"
                                      : "1px solid #E9D5FF",
                                }}
                              >
                                {student.course}
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  color: "#94A3B8",
                                  fontStyle: "italic",
                                }}
                              >
                                Unassigned
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        {student.guardianPhone}
                        <small>{student.email}</small>
                      </td>
                    </>
                  )}
                  <td>
                    <Badge status={record.status} />
                    {recovery && <small>Confirmation incomplete</small>}
                  </td>
                  <td>
                    <div className="record-actions">
                      {payments ? (
                        <>
                          {canPay && (
                            <button
                              className="receipt-action"
                              disabled={
                                !record.hasReceipt || !!actions[`receipt:${id}`]
                              }
                              onClick={() => receipt(record)}
                            >
                              {actions[`receipt:${id}`] ? (
                                <Loader2 size={14} className="admin-spin" />
                              ) : (
                                <FileText size={14} />
                              )}{" "}
                              Receipt
                            </button>
                          )}
                          {canPay &&
                            (record.status === "UNDER_REVIEW" || recovery) && (
                              <button
                                className="approve"
                                disabled={!!processing || loading || !!error}
                                onClick={() => review(record, true)}
                              >
                                {processing === "approve" ? (
                                  <Loader2 size={14} className="admin-spin" />
                                ) : (
                                  <Check size={14} />
                                )}
                                {processing === "approve"
                                  ? "Approving…"
                                  : recovery
                                    ? "Retry confirmation"
                                    : "Approve"}
                              </button>
                            )}
                          {canPay && record.status === "UNDER_REVIEW" && (
                            <button
                              className="reject"
                              disabled={!!processing || loading || !!error}
                              onClick={() => {
                                setRejectTarget(record);
                                setReason("");
                              }}
                            >
                              <X size={14} />
                              {processing === "reject"
                                ? "Rejecting…"
                                : "Reject"}
                            </button>
                          )}
                          {canPay && (
                            <button
                              type="button"
                              className="btn light small btn-edit-action"
                              onClick={() => openEditPayment(record)}
                              title="Edit payment details (UTR, amount, status, note)"
                            >
                              <Edit2 size={13} /> Edit
                            </button>
                          )}
                          {canPay && (
                            <button
                              type="button"
                              className="btn light small btn-delete-action"
                              onClick={() => setDeletePaymentTarget(record)}
                              title="Delete payment record"
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="registration-actions">
                          <button
                            type="button"
                            className="btn light small"
                            onClick={() => viewStudentDetail(record.id)}
                            title="View student history & audit timeline"
                          >
                            <Eye size={13} /> History
                          </button>
                          {canPay &&
                            ["DRAFT", "OTP_VERIFIED", "PAYMENT_PENDING"].includes(
                              record.status,
                            ) &&
                            record.applicationStatus !== "approved" &&
                            record.applicationStatus !== "submitted" && (
                              <button
                                type="button"
                                className="btn light small"
                                style={{
                                  color: "#b45309",
                                  borderColor: "#fde68a",
                                }}
                                disabled={actions[`remind:${record.id}`]}
                                onClick={() =>
                                  sendReminder(record.id, record.studentName)
                                }
                                title={`Send manual reminder email (Sent: ${record.reminderCount || 0}/3)`}
                              >
                                {actions[`remind:${record.id}`] ? (
                                  <Loader2 size={13} className="admin-spin" />
                                ) : (
                                  <Mail size={13} />
                                )}{" "}
                                Remind
                                {record.reminderCount
                                  ? ` (${record.reminderCount})`
                                  : ""}
                              </button>
                            )}
                          {record.status === "CONFIRMED" && canExam && (
                            <button onClick={() => onPdf(record.id)}>
                              <Download size={14} /> Admit PDF
                            </button>
                          )}
                          {canPay && (
                            <button
                              type="button"
                              className="btn light small btn-edit-action"
                              onClick={() => openEditRegistration(record)}
                              title="Edit student and guardian registration details"
                            >
                              <Edit2 size={13} /> Edit
                            </button>
                          )}
                          {canPay && (
                            <button
                              type="button"
                              className="btn light small btn-delete-action"
                              onClick={() => {
                                setDeleteRegistrationTarget(record);
                                setDeleteReason("");
                              }}
                              title="Permanently delete registration"
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data.items.length && (
          <div className="records-empty">
            <Search size={28} />
            <strong>
              {loading
                ? "Loading records…"
                : error
                  ? "Records unavailable"
                  : "No matching records"}
            </strong>
            <p>
              {!loading && !error
                ? "Try a different search or reset your filters."
                : "Please wait or use Retry above."}
            </p>
          </div>
        )}
      </div>
      <div className="records-pagination">
        <span>
          {data.total
            ? `${(filters.page - 1) * filters.limit + 1}–${Math.min(filters.page * filters.limit, data.total)} of ${data.total}`
            : "0 records"}
        </span>
        <label>
          Rows per page{" "}
          <select
            value={filters.limit}
            onChange={(e) => change("limit", Number(e.target.value))}
          >
            {[5, 10, 25, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <nav aria-label="Table pagination">
          <button
            disabled={loading || filters.page === 1}
            onClick={() => setFilters((f) => ({ ...f, page: 1 }))}
          >
            First
          </button>
          <button
            aria-label="Previous page"
            disabled={loading || filters.page === 1}
            onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            Page {filters.page} of {pages}
          </span>
          <button
            aria-label="Next page"
            disabled={loading || filters.page >= pages}
            onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
          >
            <ChevronRight size={16} />
          </button>
          <button
            disabled={loading || filters.page >= pages}
            onClick={() => setFilters((f) => ({ ...f, page: pages }))}
          >
            Last
          </button>
        </nav>
      </div>
      <dialog
        ref={dialog}
        className="review-dialog"
        onCancel={(e) => {
          if (actions[rejectTarget?._id]) e.preventDefault();
          else setRejectTarget(null);
        }}
        onClose={() => {
          if (!actions[rejectTarget?._id]) setRejectTarget(null);
        }}
        aria-labelledby="reject-heading"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= 5) review(rejectTarget, false, reason);
          }}
        >
          <span className="records-kicker">PAYMENT DECISION</span>
          <h2 id="reject-heading">Reject payment</h2>
          <p>
            {rejectTarget?.registrationId?.studentName} · UTR{" "}
            {rejectTarget?.utr}
          </p>
          <label>
            <span>Reason for rejection</span>
            <textarea
              autoFocus
              required
              minLength={5}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain what needs to be corrected…"
            />
          </label>
          <small>
            Enter at least 5 characters. The reason is saved with the payment.
          </small>
          <div className="dialog-actions">
            <button
              type="button"
              className="btn light"
              disabled={!!actions[rejectTarget?._id]}
              onClick={() => {
                dialog.current.close();
                setRejectTarget(null);
              }}
            >
              Cancel
            </button>
            <button
              className="btn reject-submit"
              disabled={
                !!actions[rejectTarget?._id] || reason.trim().length < 5
              }
            >
              {actions[rejectTarget?._id] ? "Rejecting…" : "Reject payment"}
            </button>
          </div>
        </form>
      </dialog>

      {selectedStudentDetail && (
        <div
          className="admin-modal-backdrop"
          onClick={() => setSelectedStudentDetail(null)}
        >
          <div
            className="admin-modal-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="admin-modal-head">
              <div>
                <h3>{selectedStudentDetail.student.studentName}</h3>
                <small>
                  Class {selectedStudentDetail.student.studentClass}
                  {selectedStudentDetail.student.studentClass === "11" &&
                  selectedStudentDetail.student.course
                    ? ` (${selectedStudentDetail.student.course})`
                    : ""}{" "}
                  · Ref: {selectedStudentDetail.student.applicationRef}
                  {selectedStudentDetail.student.registrationNumber
                    ? ` · Reg: ${selectedStudentDetail.student.registrationNumber}`
                    : ""}
                </small>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setSelectedStudentDetail(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="admin-modal-body">
              <div className="detail-cards-grid">
                <div className="detail-card">
                  <span className="card-label">Guardian Information</span>
                  <div className="card-item">
                    <span>Name</span>
                    <strong>{selectedStudentDetail.student.guardianName}</strong>
                  </div>
                  <div className="card-item">
                    <span>Mobile</span>
                    <strong>{selectedStudentDetail.student.guardianPhone}</strong>
                  </div>
                  <div className="card-item">
                    <span>Email</span>
                    <strong>{selectedStudentDetail.student.email || "—"}</strong>
                  </div>
                </div>

                <div className="detail-card">
                  <span className="card-label">Student Information</span>
                  <div className="card-item">
                    <span>Date of Birth</span>
                    <strong>{selectedStudentDetail.student.dob}</strong>
                  </div>
                  <div className="card-item">
                    <span>Gender</span>
                    <strong>{selectedStudentDetail.student.gender || "MALE"}</strong>
                  </div>
                  <div className="card-item">
                    <span>Current School</span>
                    <strong>{selectedStudentDetail.student.currentSchool}</strong>
                  </div>
                  {selectedStudentDetail.student.studentClass === "11" && (
                    <div className="card-item">
                      <span>Stream / Course</span>
                      <strong style={{ color: "#0284C7", fontWeight: 800 }}>
                        {selectedStudentDetail.student.course || "Not Selected"}
                      </strong>
                    </div>
                  )}
                  <div className="card-item">
                    <span>Location</span>
                    <strong>
                      {selectedStudentDetail.student.city},{" "}
                      {selectedStudentDetail.student.district},{" "}
                      {selectedStudentDetail.student.state} -{" "}
                      {selectedStudentDetail.student.pincode}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="detail-card full-width">
                <span className="card-label">Application Status Breakdown</span>
                <div className="status-chips-row">
                  <div className="status-chip">
                    <span>Overall</span>
                    <Badge status={selectedStudentDetail.student.status} />
                  </div>
                  <div className="status-chip">
                    <span>Contact Verification</span>
                    <strong className="chip-value">
                      {selectedStudentDetail.student.verificationStatus ||
                        (selectedStudentDetail.student.verifiedAt
                          ? "verified"
                          : "pending")}
                    </strong>
                  </div>
                  <div className="status-chip">
                    <span>Application Stage</span>
                    <strong className="chip-value">
                      {selectedStudentDetail.student.applicationStatus || "draft"}
                    </strong>
                  </div>
                  <div className="status-chip">
                    <span>Payment Stage</span>
                    <strong className="chip-value">
                      {selectedStudentDetail.student.paymentStatus || "not_submitted"}
                    </strong>
                  </div>
                </div>
              </div>

              {selectedStudentDetail.payment && (
                <div className="detail-card full-width">
                  <span className="card-label">Payment Information</span>
                  <div className="payment-info-row">
                    <div>
                      <span>Mode</span>
                      <strong>{selectedStudentDetail.payment.mode}</strong>
                    </div>
                    <div>
                      <span>Amount</span>
                      <strong>₹{selectedStudentDetail.payment.amount}</strong>
                    </div>
                    <div>
                      <span>UTR</span>
                      <strong className="utr-badge">
                        {selectedStudentDetail.payment.utr || "—"}
                      </strong>
                    </div>
                    <div>
                      <span>Payment Status</span>
                      <strong className="status-text">
                        {selectedStudentDetail.payment.status}
                      </strong>
                    </div>
                  </div>
                  {selectedStudentDetail.payment.reviewNote && (
                    <p className="payment-note">
                      Review Note: {selectedStudentDetail.payment.reviewNote}
                    </p>
                  )}
                </div>
              )}

              {selectedStudentDetail.siblings?.length > 0 && (
                <div className="detail-card full-width">
                  <span className="card-label">
                    Other Students Under Same Guardian Mobile (
                    {selectedStudentDetail.siblings.length})
                  </span>
                  <div className="siblings-chips">
                    {selectedStudentDetail.siblings.map((sib) => (
                      <div key={sib.id} className="sibling-badge">
                        <strong>{sib.studentName}</strong> (Class{" "}
                        {sib.studentClass}
                        {sib.studentClass === "11" && sib.course
                          ? ` - ${sib.course}`
                          : ""}
                        ) · {sib.applicationRef} ·{" "}
                        <Badge status={sib.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="detail-card full-width">
                <span className="card-label">Status & Audit History</span>
                <div className="history-timeline">
                  {selectedStudentDetail.student.statusHistory?.length ? (
                    selectedStudentDetail.student.statusHistory.map((h, i) => (
                      <div key={i} className="history-step">
                        <small>{dateLabel(h.changedAt)}</small>
                        <span>
                          <strong>{h.from}</strong> → <strong>{h.to}</strong>
                        </span>
                        {h.reason && <p>{h.reason}</p>}
                        <small>Actor: {h.actor}</small>
                      </div>
                    ))
                  ) : (
                    <p className="no-history-text">
                      Created on {dateLabel(selectedStudentDetail.student.createdAt)}. No status changes recorded.
                    </p>
                  )}
                </div>
              </div>

              <div className="detail-card full-width">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "10px",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  <span className="card-label" style={{ margin: 0 }}>
                    Reminder Delivery History (
                    {selectedStudentDetail.reminderLogs?.length || 0})
                  </span>
                  {canPay &&
                    ["DRAFT", "OTP_VERIFIED", "PAYMENT_PENDING"].includes(
                      selectedStudentDetail.student.status,
                    ) &&
                    selectedStudentDetail.student.applicationStatus !==
                      "approved" && (
                      <button
                        type="button"
                        className="btn primary small"
                        disabled={
                          actions[`remind:${selectedStudentDetail.student._id}`]
                        }
                        onClick={async () => {
                          await sendReminder(
                            selectedStudentDetail.student._id,
                            selectedStudentDetail.student.studentName,
                          );
                          await viewStudentDetail(
                            selectedStudentDetail.student._id,
                          );
                        }}
                      >
                        <Mail size={13} /> Send Manual Reminder Now
                      </button>
                    )}
                </div>
                {selectedStudentDetail.reminderLogs?.length ? (
                  <div
                    className="reminder-logs-table"
                    style={{ overflowX: "auto" }}
                  >
                    <table
                      style={{
                        width: "100%",
                        fontSize: "13px",
                        borderCollapse: "collapse",
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            background: "#f8fafc",
                            textAlign: "left",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          <th style={{ padding: "8px 10px" }}>Attempt</th>
                          <th style={{ padding: "8px 10px" }}>Trigger</th>
                          <th style={{ padding: "8px 10px" }}>Status</th>
                          <th style={{ padding: "8px 10px" }}>Recipient</th>
                          <th style={{ padding: "8px 10px" }}>Sent At</th>
                          <th style={{ padding: "8px 10px" }}>
                            Message ID / Error
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedStudentDetail.reminderLogs.map((log, i) => (
                          <tr
                            key={log._id || i}
                            style={{ borderBottom: "1px solid #f1f5f9" }}
                          >
                            <td
                              style={{
                                padding: "8px 10px",
                                fontWeight: "600",
                              }}
                            >
                              #{log.attemptNumber}
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              {log.triggerType} ({log.triggeredBy})
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              <span
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  fontWeight: "700",
                                  background:
                                    log.status === "SENT"
                                      ? "#dcfce7"
                                      : log.status === "FAILED"
                                        ? "#fee2e2"
                                        : "#fef3c7",
                                  color:
                                    log.status === "SENT"
                                      ? "#15803d"
                                      : log.status === "FAILED"
                                        ? "#b91c1c"
                                        : "#b45309",
                                }}
                              >
                                {log.status}
                              </span>
                            </td>
                            <td
                              style={{
                                padding: "8px 10px",
                                color: "#64748b",
                              }}
                            >
                              {log.recipientEmail}
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              {dateLabel(log.sentAt)}
                            </td>
                            <td
                              style={{
                                padding: "8px 10px",
                                fontFamily: "monospace",
                                fontSize: "11px",
                                color: log.errorDetail
                                  ? "#dc2626"
                                  : "#64748b",
                              }}
                            >
                              {log.providerMessageId ||
                                log.errorDetail ||
                                "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="no-history-text" style={{ margin: "8px 0" }}>
                    No reminder emails dispatched yet for this application.
                    (Scheduled attempts will appear here).
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {editPaymentTarget && (
        <div
          className="admin-modal-backdrop"
          onClick={() => !saving && setEditPaymentTarget(null)}
        >
          <div
            className="admin-modal-dialog crud-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="admin-modal-head">
              <div>
                <h3>Edit Payment Record</h3>
                <small>
                  Student: {editPaymentTarget.registrationId?.studentName || "—"} · Class {editPaymentTarget.registrationId?.studentClass || "—"}
                </small>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                disabled={saving}
                onClick={() => setEditPaymentTarget(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={saveEditPayment} className="crud-modal-form">
              <div className="crud-form-grid">
                <label className="crud-form-field">
                  <span>UTR / Transaction Number *</span>
                  <input
                    type="text"
                    required
                    value={editPaymentForm.utr}
                    onChange={(e) =>
                      setEditPaymentForm((prev) => ({
                        ...prev,
                        utr: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="e.g. 414561574781"
                  />
                </label>

                <label className="crud-form-field">
                  <span>Amount (₹) *</span>
                  <input
                    type="number"
                    required
                    min="1"
                    value={editPaymentForm.amount}
                    onChange={(e) =>
                      setEditPaymentForm((prev) => ({
                        ...prev,
                        amount: Number(e.target.value),
                      }))
                    }
                  />
                </label>

                <label className="crud-form-field">
                  <span>Payment Status *</span>
                  <select
                    value={editPaymentForm.status}
                    onChange={(e) =>
                      setEditPaymentForm((prev) => ({
                        ...prev,
                        status: e.target.value,
                      }))
                    }
                  >
                    <option value="UNDER_REVIEW">UNDER_REVIEW (Pending Review)</option>
                    <option value="PAID">PAID (Approved & Confirm Student)</option>
                    <option value="REJECTED">REJECTED (Payment Rejected)</option>
                  </select>
                </label>

                <label className="crud-form-field full-col">
                  <span>Admin / Review Note</span>
                  <textarea
                    rows={2}
                    value={editPaymentForm.reviewNote}
                    onChange={(e) =>
                      setEditPaymentForm((prev) => ({
                        ...prev,
                        reviewNote: e.target.value,
                      }))
                    }
                    placeholder="Optional notes or remarks..."
                  />
                </label>
              </div>

              <div className="crud-modal-actions">
                <button
                  type="button"
                  className="btn light"
                  disabled={saving}
                  onClick={() => setEditPaymentTarget(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 size={15} className="admin-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <Save size={15} /> Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletePaymentTarget && (
        <div
          className="admin-modal-backdrop"
          onClick={() => !saving && setDeletePaymentTarget(null)}
        >
          <div
            className="admin-modal-dialog crud-modal crud-delete-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="admin-modal-head danger-head">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <AlertTriangle color="#ef4444" size={24} />
                <div>
                  <h3>Delete Payment Record?</h3>
                  <small>This action cannot be undone</small>
                </div>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                disabled={saving}
                onClick={() => setDeletePaymentTarget(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="crud-delete-body">
              <p>
                Are you sure you want to delete payment record for student{" "}
                <strong>{deletePaymentTarget.registrationId?.studentName || "Unknown"}</strong>?
              </p>
              <div className="delete-summary-box">
                <div><strong>UTR:</strong> {deletePaymentTarget.utr || "—"}</div>
                <div><strong>Amount:</strong> ₹{deletePaymentTarget.amount}</div>
                <div><strong>Status:</strong> {deletePaymentTarget.status}</div>
              </div>
              <p className="danger-notice">
                ⚠️ Deleting this payment will unlink it from the student record and revert the student's status back to awaiting payment proof if not already confirmed.
              </p>

              <div className="crud-modal-actions">
                <button
                  type="button"
                  className="btn light"
                  disabled={saving}
                  onClick={() => setDeletePaymentTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn danger-btn"
                  disabled={saving}
                  onClick={confirmDeletePayment}
                >
                  {saving ? (
                    <>
                      <Loader2 size={15} className="admin-spin" /> Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 size={15} /> Delete Payment
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editRegistrationTarget && (
        <div
          className="admin-modal-backdrop"
          onClick={() => !saving && setEditRegistrationTarget(null)}
        >
          <div
            className="admin-modal-dialog crud-modal crud-modal-large"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="admin-modal-head">
              <div>
                <h3>Edit Student Registration</h3>
                <small>
                  Application Ref: {editRegistrationTarget.applicationRef || editRegistrationTarget.id}
                </small>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                disabled={saving}
                onClick={() => setEditRegistrationTarget(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={saveEditRegistration} className="crud-modal-form">
              <div className="crud-form-grid">
                <label className="crud-form-field">
                  <span>Student Name *</span>
                  <input
                    type="text"
                    required
                    value={editRegistrationForm.studentName}
                    onChange={(e) =>
                      setEditRegistrationForm((prev) => ({
                        ...prev,
                        studentName: e.target.value.toUpperCase(),
                      }))
                    }
                  />
                </label>

                <label className="crud-form-field">
                  <span>Class (2 - 11) *</span>
                  <select
                    value={editRegistrationForm.studentClass}
                    onChange={(e) => {
                      const nextCls = e.target.value;
                      setEditRegistrationForm((prev) => ({
                        ...prev,
                        studentClass: nextCls,
                        course: nextCls === "11" ? prev.course : "",
                      }));
                    }}
                  >
                    {supportedClasses.map((c) => (
                      <option key={c} value={c}>
                        Class {c}
                      </option>
                    ))}
                  </select>
                </label>

                {editRegistrationForm.studentClass === "11" && (
                  <label className="crud-form-field">
                    <span>Course / Stream (Class 11) *</span>
                    <select
                      value={editRegistrationForm.course || ""}
                      onChange={(e) =>
                        setEditRegistrationForm((prev) => ({
                          ...prev,
                          course: e.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">-- Select Stream --</option>
                      <option value="PCM">PCM (Non-Medical)</option>
                      <option value="PCB">PCB (Medical)</option>
                      <option value="ARTS">ARTS (Humanities)</option>
                      <option value="COMMERCE">COMMERCE</option>
                    </select>
                  </label>
                )}

                <label className="crud-form-field">
                  <span>Date of Birth</span>
                  <input
                    type="date"
                    value={editRegistrationForm.dob}
                    onChange={(e) =>
                      setEditRegistrationForm((prev) => ({
                        ...prev,
                        dob: e.target.value,
                      }))
                    }
                  />
                </label>

                <label className="crud-form-field">
                  <span>Current School</span>
                  <input
                    type="text"
                    value={editRegistrationForm.currentSchool}
                    onChange={(e) =>
                      setEditRegistrationForm((prev) => ({
                        ...prev,
                        currentSchool: e.target.value,
                      }))
                    }
                  />
                </label>

                <label className="crud-form-field">
                  <span>Guardian Name *</span>
                  <input
                    type="text"
                    required
                    value={editRegistrationForm.guardianName}
                    onChange={(e) =>
                      setEditRegistrationForm((prev) => ({
                        ...prev,
                        guardianName: e.target.value.toUpperCase(),
                      }))
                    }
                  />
                </label>

                <label className="crud-form-field">
                  <span>Guardian Phone (10 digits) *</span>
                  <input
                    type="tel"
                    required
                    pattern="^[6-9]\d{9}$"
                    value={editRegistrationForm.guardianPhone}
                    onChange={(e) =>
                      setEditRegistrationForm((prev) => ({
                        ...prev,
                        guardianPhone: e.target.value.replace(/\D/g, "").slice(0, 10),
                      }))
                    }
                  />
                </label>

                <label className="crud-form-field">
                  <span>Guardian Email *</span>
                  <input
                    type="email"
                    required
                    value={editRegistrationForm.email}
                    onChange={(e) =>
                      setEditRegistrationForm((prev) => ({
                        ...prev,
                        email: e.target.value.toLowerCase().trim(),
                      }))
                    }
                  />
                </label>

                <label className="crud-form-field">
                  <span>Application Status *</span>
                  <select
                    value={editRegistrationForm.status}
                    onChange={(e) =>
                      setEditRegistrationForm((prev) => ({
                        ...prev,
                        status: e.target.value,
                      }))
                    }
                  >
                    <option value="DRAFT">DRAFT (Email Pending)</option>
                    <option value="OTP_VERIFIED">OTP_VERIFIED (Verified)</option>
                    <option value="PAYMENT_PENDING">PAYMENT_PENDING (Resume)</option>
                    <option value="AWAITING_PAYMENT">AWAITING_PAYMENT</option>
                    <option value="UNDER_REVIEW">UNDER_REVIEW (Payment Review)</option>
                    <option value="CONFIRMED">CONFIRMED (Admit Ready)</option>
                    <option value="PAYMENT_REJECTED">PAYMENT_REJECTED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </label>

                <label className="crud-form-field">
                  <span>Registration / Roll Number</span>
                  <input
                    type="text"
                    value={editRegistrationForm.registrationNumber}
                    onChange={(e) =>
                      setEditRegistrationForm((prev) => ({
                        ...prev,
                        registrationNumber: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="e.g. SR26-05-1234"
                  />
                </label>

                <label className="crud-form-field">
                  <span>City</span>
                  <input
                    type="text"
                    value={editRegistrationForm.city}
                    onChange={(e) =>
                      setEditRegistrationForm((prev) => ({
                        ...prev,
                        city: e.target.value,
                      }))
                    }
                  />
                </label>

                <label className="crud-form-field">
                  <span>District</span>
                  <input
                    type="text"
                    value={editRegistrationForm.district}
                    onChange={(e) =>
                      setEditRegistrationForm((prev) => ({
                        ...prev,
                        district: e.target.value,
                      }))
                    }
                  />
                </label>

                <label className="crud-form-field">
                  <span>State</span>
                  <input
                    type="text"
                    value={editRegistrationForm.state}
                    onChange={(e) =>
                      setEditRegistrationForm((prev) => ({
                        ...prev,
                        state: e.target.value.toUpperCase(),
                      }))
                    }
                  />
                </label>

                <label className="crud-form-field">
                  <span>Pincode</span>
                  <input
                    type="text"
                    value={editRegistrationForm.pincode}
                    onChange={(e) =>
                      setEditRegistrationForm((prev) => ({
                        ...prev,
                        pincode: e.target.value.replace(/\D/g, "").slice(0, 6),
                      }))
                    }
                  />
                </label>

                <label className="crud-form-field full-col">
                  <span>Full Address</span>
                  <input
                    type="text"
                    value={editRegistrationForm.address}
                    onChange={(e) =>
                      setEditRegistrationForm((prev) => ({
                        ...prev,
                        address: e.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <div className="crud-modal-actions">
                <button
                  type="button"
                  className="btn light"
                  disabled={saving}
                  onClick={() => setEditRegistrationTarget(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 size={15} className="admin-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <Save size={15} /> Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteRegistrationTarget && (
        <div
          className="admin-modal-backdrop"
          onClick={() => !saving && setDeleteRegistrationTarget(null)}
        >
          <div
            className="admin-modal-dialog crud-modal crud-delete-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="admin-modal-head danger-head">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <AlertTriangle color="#ef4444" size={24} />
                <div>
                  <h3>Delete Student Registration?</h3>
                  <small>High impact action · Complete purge</small>
                </div>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                disabled={saving}
                onClick={() => setDeleteRegistrationTarget(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="crud-delete-body">
              <p>
                Are you sure you want to permanently delete registration for:
              </p>
              <div className="delete-summary-box">
                <div><strong>Student:</strong> {deleteRegistrationTarget.studentName}</div>
                <div><strong>Class:</strong> {deleteRegistrationTarget.studentClass}</div>
                <div><strong>Ref:</strong> {deleteRegistrationTarget.applicationRef || deleteRegistrationTarget.id}</div>
                <div><strong>Guardian:</strong> {deleteRegistrationTarget.guardianName} ({deleteRegistrationTarget.guardianPhone})</div>
              </div>
              <p className="danger-notice">
                ⚠️ <strong>WARNING:</strong> This will permanently delete the student registration document along with all related payments, email verification challenges, and reminder logs from MongoDB. This action CANNOT be undone!
              </p>

              <label className="crud-form-field" style={{ marginTop: "12px", display: "block" }}>
                <span style={{ fontSize: "12px", fontWeight: "600", color: "#475569" }}>
                  Reason for Deletion (Recorded in Audit Trail)
                </span>
                <input
                  type="text"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="e.g. Duplicate entry, parent cancellation request, test entry..."
                  style={{ width: "100%", marginTop: "4px" }}
                />
              </label>

              <div className="crud-modal-actions">
                <button
                  type="button"
                  className="btn light"
                  disabled={saving}
                  onClick={() => setDeleteRegistrationTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn danger-btn"
                  disabled={saving}
                  onClick={confirmDeleteRegistration}
                >
                  {saving ? (
                    <>
                      <Loader2 size={15} className="admin-spin" /> Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 size={15} /> Permanently Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
