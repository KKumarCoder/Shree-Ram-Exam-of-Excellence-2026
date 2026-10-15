import React, { useEffect, useState, useRef } from "react";
import {
  Bell,
  Mail,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Eye,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  Send,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { api } from "./api.js";
import { notify } from "./notifications.js";
import { supportedClasses } from "./portalData.js";
import { StudentDetailModal } from "./StudentDetailModal.jsx";
import "./admin-records.css";

const dateLabel = (val) =>
  val
    ? new Date(val).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      })
    : "—";

export function PaymentRecoveryDashboard({ canPay, onViewDetail, refreshKey }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [stageFilter, setStageFilter] = useState("all_incomplete");
  const [reminderFilter, setReminderFilter] = useState("all");
  const [actions, setActions] = useState({});
  const [summary, setSummary] = useState(null);
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const viewStudentDetail = async (id) => {
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/admin/registrations/${id}/history`);
      setSelectedStudentDetail(data);
    } catch (err) {
      notify({
        type: "error",
        title: "Load Failed",
        message: err.response?.data?.error || "Failed to load student history.",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  // Fetch dashboard summary & scheduler status
  useEffect(() => {
    let active = true;
    Promise.all([
      api.get("/admin/dashboard"),
      api.get("/admin/settings/reminders").catch(() => ({ data: { enabled: false } })),
    ])
      .then(([dashRes, schedRes]) => {
        if (!active) return;
        setSummary(dashRes.data);
        setSchedulerStatus(schedRes.data);
      })
      .catch((err) => {
        console.error("Failed to load metrics/scheduler status:", err);
      });
    return () => {
      active = false;
    };
  }, [revision, refreshKey]);

  // Fetch incomplete registrations
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    // Determine query parameters based on stage filter
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (studentClass) params.set("studentClass", studentClass);
    if (search.trim()) params.set("search", search.trim());

    if (stageFilter === "draft") {
      params.set("status", "DRAFT");
    } else if (stageFilter === "awaiting_payment") {
      params.set("status", "OTP_VERIFIED");
    } else if (stageFilter === "under_review") {
      params.set("status", "PAYMENT_UNDER_VERIFICATION");
    }

    api
      .get(`/admin/registrations?${params.toString()}`)
      .then(({ data }) => {
        if (!active) return;
        // Filter in memory for incomplete records if "all_incomplete" is selected
        let filtered = (data.items || []).filter((s) =>
          ["DRAFT", "OTP_VERIFIED", "PAYMENT_PENDING", "PAYMENT_UNDER_VERIFICATION"].includes(s.status) &&
          s.status !== "CONFIRMED" &&
          s.status !== "CANCELLED"
        );

        if (reminderFilter === "0") {
          filtered = filtered.filter((s) => (s.reminderCount || 0) === 0);
        } else if (reminderFilter === "1") {
          filtered = filtered.filter((s) => (s.reminderCount || 0) === 1);
        } else if (reminderFilter === "2") {
          filtered = filtered.filter((s) => (s.reminderCount || 0) === 2);
        } else if (reminderFilter === "3") {
          filtered = filtered.filter((s) => (s.reminderCount || 0) >= 3);
        }

        setItems(filtered);
        setTotal(data.total || 0);
        setPages(data.pages || 1);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.response?.data?.error || "Could not load incomplete registrations.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, limit, studentClass, stageFilter, reminderFilter, search, revision, refreshKey]);

  // Toggle scheduler active/paused state
  const toggleScheduler = async () => {
    if (schedulerLoading) return;
    const targetState = !schedulerStatus?.enabled;
    const confirmMsg = targetState
      ? "Activate automated reminders? Applications incomplete for 2h, 24h, and 72h will be automatically reminded (max 3 emails each)."
      : "Pause automated reminders? Scheduled emails will be suspended until resumed.";

    if (!window.confirm(confirmMsg)) return;

    setSchedulerLoading(true);
    try {
      const { data } = await api.post("/admin/settings/reminders/toggle", { enabled: targetState });
      setSchedulerStatus(data);
      notify({
        type: "success",
        title: targetState ? "Scheduler Activated" : "Scheduler Paused",
        message: targetState
          ? "Automated background email reminders are now ACTIVE."
          : "Automated email delivery is now PAUSED.",
      });
      setRevision((r) => r + 1);
    } catch (err) {
      notify({
        type: "error",
        title: "Toggle Failed",
        message: err.response?.data?.error || "Unable to update scheduler setting.",
      });
    } finally {
      setSchedulerLoading(false);
    }
  };

  // Trigger manual reminder
  const sendManualReminder = async (id, studentName) => {
    if (actions[`remind:${id}`]) return;
    setActions((prev) => ({ ...prev, [`remind:${id}`]: true }));

    try {
      const { data } = await api.post(`/admin/registrations/${id}/remind`);
      notify({
        type: "success",
        title: "Reminder Sent Successfully",
        message: `Branded email with secure OTP resume link delivered to guardian of ${studentName}. (Message ID: ${data.messageId || "N/A"})`,
      });
      setRevision((r) => r + 1);
    } catch (err) {
      notify({
        type: "error",
        title: "Delivery Failed",
        message: err.response?.data?.error || "Failed to deliver reminder email.",
      });
    } finally {
      setActions((prev) => ({ ...prev, [`remind:${id}`]: false }));
    }
  };

  return (
    <div className="admin-panel payment-recovery-panel">
      {/* Header and Scheduler Status Banner */}
      <div className="recovery-header-section">
        <div>
          <span className="records-kicker">AUTOMATION & RECOVERY</span>
          <h2>Payment Pending Recovery Dashboard</h2>
          <p>
            Monitor incomplete student registrations, track contact verification stages, inspect payment evidence,
            and trigger manual Gmail SMTP reminders with secure OTP-protected resume links.
          </p>
        </div>

        <div className="recovery-scheduler-box">
          <div className="scheduler-info">
            <span className="scheduler-label">Automated Queue Status</span>
            <strong className={`scheduler-badge ${schedulerStatus?.enabled ? "is-active" : "is-paused"}`}>
              {schedulerStatus?.enabled ? (
                <>
                  <CheckCircle size={14} /> Active (2h, 24h, 72h)
                </>
              ) : (
                <>
                  <Clock size={14} /> Paused by Admin
                </>
              )}
            </strong>
          </div>
          {canPay && (
            <button
              type="button"
              className={`btn ${schedulerStatus?.enabled ? "light" : "primary"} small`}
              disabled={schedulerLoading}
              onClick={toggleScheduler}
            >
              {schedulerLoading ? (
                <Loader2 size={13} className="admin-spin" />
              ) : schedulerStatus?.enabled ? (
                "Pause Scheduler"
              ) : (
                "Activate Scheduler"
              )}
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Metrics */}
      <div className="recovery-kpi-grid">
        <div className="recovery-kpi-card">
          <span className="kpi-label">Incomplete Drafts</span>
          <strong className="kpi-val text-amber">{summary?.incomplete ?? "—"}</strong>
          <small>Awaiting payment proof</small>
        </div>
        <div className="recovery-kpi-card">
          <span className="kpi-label">Contact Verified</span>
          <strong className="kpi-val text-teal">{summary?.contactVerified ?? "—"}</strong>
          <small>Email OTP authenticated</small>
        </div>
        <div className="recovery-kpi-card">
          <span className="kpi-label">Reminders Delivered</span>
          <strong className="kpi-val text-blue">{summary?.remindersSent ?? "—"}</strong>
          <small>Via Gmail SMTP</small>
        </div>
        <div className="recovery-kpi-card">
          <span className="kpi-label">Delivery Failures</span>
          <strong className="kpi-val text-red">{summary?.reminderFailures ?? 0}</strong>
          <small>Transient provider errors</small>
        </div>
        <div className="recovery-kpi-card">
          <span className="kpi-label">Recovered via Link</span>
          <strong className="kpi-val text-purple">{summary?.resumedApplications ?? "—"}</strong>
          <small>Resumed via email token</small>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="records-toolbar">
        <label className="records-search">
          <Search size={16} />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search student, ref, phone, email…"
          />
        </label>

        <div className="records-filters">
          <label>
            <span>Class</span>
            <select
              value={studentClass}
              onChange={(e) => {
                setStudentClass(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Classes</option>
              {supportedClasses.map((c) => (
                <option key={c} value={c}>
                  Class {c}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Stage</span>
            <select
              value={stageFilter}
              onChange={(e) => {
                setStageFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all_incomplete">All Incomplete Stages</option>
              <option value="draft">Email Pending (Draft)</option>
              <option value="awaiting_payment">Email Verified (Awaiting Payment)</option>
              <option value="under_review">Payment Submitted (Under Review)</option>
            </select>
          </label>

          <label>
            <span>Reminders</span>
            <select
              value={reminderFilter}
              onChange={(e) => {
                setReminderFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Reminder Counts</option>
              <option value="0">0 Sent (No Reminders Yet)</option>
              <option value="1">1 Reminder Sent</option>
              <option value="2">2 Reminders Sent</option>
              <option value="3">3 Reminders (Max Reached)</option>
            </select>
          </label>

          <button
            type="button"
            className="btn light records-refresh-btn"
            onClick={() => setRevision((r) => r + 1)}
            title="Refresh recovery list"
          >
            <RefreshCcw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Main Table of Incomplete Registrations */}
      <div className="records-table-shell">
        <table className="records-table">
          <thead>
            <tr>
              <th>Student & Reference</th>
              <th>Class</th>
              <th>Guardian Contact</th>
              <th>Contact Status</th>
              <th>Last Reminder Date</th>
              <th>Reminder Count</th>
              <th>Payment Evidence</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((reg) => {
              const isVerified =
                reg.verificationStatus === "verified" ||
                reg.verified ||
                reg.status === "OTP_VERIFIED";
              const reminderCount = reg.reminderCount || 0;
              const hasEvidence =
                reg.status === "PAYMENT_UNDER_VERIFICATION" ||
                reg.applicationStatus === "submitted" ||
                reg.paymentStatus === "under_review";

              return (
                <tr key={reg.id}>
                  <td>
                    <strong>{reg.studentName}</strong>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      Ref: <code>{reg.applicationRef}</code> · {dateLabel(reg.createdAt)}
                    </div>
                  </td>

                  <td>
                    <span className="class-pill">Class {reg.studentClass}</span>
                  </td>

                  <td>
                    <div>{reg.guardianPhone}</div>
                    <small style={{ color: "var(--muted)" }}>{reg.email || "—"}</small>
                  </td>

                  <td>
                    {isVerified ? (
                      <span className="review-badge state-approved">
                        <CheckCircle size={11} style={{ display: "inline", marginRight: 3 }} />
                        Email Verified
                      </span>
                    ) : (
                      <span className="review-badge state-under_review">
                        <Clock size={11} style={{ display: "inline", marginRight: 3 }} />
                        Email Pending
                      </span>
                    )}
                  </td>

                  <td>
                    {reg.reminderLastSentAt ? (
                      <span style={{ fontSize: 12 }}>{dateLabel(reg.reminderLastSentAt)}</span>
                    ) : (
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>Never Sent</span>
                    )}
                  </td>

                  <td>
                    <span
                      className={`count-badge ${
                        reminderCount >= 3 ? "count-max" : reminderCount > 0 ? "count-active" : "count-zero"
                      }`}
                    >
                      {reminderCount} / 3 {reminderCount >= 3 ? "(Max)" : ""}
                    </span>
                  </td>

                  <td>
                    {hasEvidence ? (
                      <span className="review-badge state-payment_submitted">
                        Under Review
                      </span>
                    ) : (
                      <span className="evidence-badge pending">
                        Pending (No UTR)
                      </span>
                    )}
                  </td>

                  <td>
                    <div className="registration-actions">
                      <button
                        type="button"
                        className="btn light small"
                        onClick={() =>
                          onViewDetail
                            ? onViewDetail(reg.id)
                            : viewStudentDetail(reg.id)
                        }
                        title="View complete application details & reminder history"
                      >
                        <Eye size={13} /> History
                      </button>

                      {canPay && !hasEvidence && (
                        <button
                          type="button"
                          className="btn primary small remind-btn"
                          disabled={actions[`remind:${reg.id}`]}
                          onClick={() => sendManualReminder(reg.id, reg.studentName)}
                          title={`Send branded Gmail SMTP reminder (${reminderCount}/3 sent)`}
                        >
                          {actions[`remind:${reg.id}`] ? (
                            <Loader2 size={13} className="admin-spin" />
                          ) : (
                            <Mail size={13} />
                          )}
                          Remind
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {loading ? (
          <div className="records-empty">
            <Loader2 size={28} className="admin-spin" />
            <p>Scanning incomplete registrations…</p>
          </div>
        ) : error ? (
          <div className="records-empty">
            <AlertCircle size={28} color="#b82d40" />
            <p>{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="records-empty">
            <CheckCircle size={32} color="var(--accent)" />
            <strong>No Incomplete Registrations Matching Filter</strong>
            <p>All students in this criteria have either completed registration or have no pending reminders.</p>
          </div>
        ) : null}
      </div>

      {/* Pagination Footer */}
      <div className="records-pagination">
        <span>
          {items.length} applications shown
        </span>
        <label>
          Rows{" "}
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {[5, 10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label="Pagination">
          <button disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft size={16} />
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button disabled={loading || page >= pages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight size={16} />
          </button>
        </nav>
      </div>

      {selectedStudentDetail && (
        <StudentDetailModal
          selectedStudentDetail={selectedStudentDetail}
          onClose={() => setSelectedStudentDetail(null)}
          canPay={canPay}
          onRefresh={(id) => {
            viewStudentDetail(id);
            setRevision((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
