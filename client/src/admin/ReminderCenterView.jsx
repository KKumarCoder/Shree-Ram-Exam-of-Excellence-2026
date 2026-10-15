import React, { useState, useEffect } from "react";
import {
  Send,
  Mail,
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCcw,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ExternalLink,
  Info,
} from "lucide-react";
import { api } from "../api.js";
import { notify } from "../notifications.js";

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

export function ReminderCenterView({ canSet, onNavigateToRecovery, refreshKey }) {
  const [data, setData] = useState({ logs: [], total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [settingsData, setSettingsData] = useState(null);
  const [toggling, setToggling] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [logsRes, setRes] = await Promise.all([
        api.get("/admin/reminders/logs", { params: { page, limit: 15 } }),
        api.get("/admin/settings/reminders"),
      ]);
      setData(logsRes.data);
      setSettingsData(setRes.data);
    } catch (e) {
      notify.error(e.message || "Failed to load reminder history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, refreshKey]);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const nextVal = !settingsData?.enabled;
      const { data: res } = await api.post("/admin/settings/reminders/toggle", {
        enabled: nextVal,
      });
      notify.success(res.message);
      setSettingsData((prev) => ({ ...prev, enabled: nextVal }));
    } catch (e) {
      notify.error(e.message || "Failed to update scheduler setting");
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="erp-reminder-center">
      <div className="erp-panel-head" style={{ marginBottom: "20px" }}>
        <div className="erp-panel-title-area">
          <span className="erp-eyebrow">AUTOMATED & MANUAL OUTREACH</span>
          <h2 style={{ fontSize: "1.8rem", color: "var(--erp-navy)", margin: "4px 0" }}>
            Email Reminder Center
          </h2>
          <p>
            Track incomplete application reminders and help families finish their Olympiad registration.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            className="erp-btn-cta"
            onClick={onNavigateToRecovery}
          >
            <Send size={15} />
            <span>Send Manual Reminder</span>
          </button>
          <button
            type="button"
            className="erp-btn-soft"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCcw size={15} className={loading ? "admin-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Scheduler Status Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
          background: settingsData?.enabled ? "#f0fdf4" : "#fefce8",
          border: settingsData?.enabled
            ? "1px solid #bbf7d0"
            : "1px solid #fef08a",
          padding: "16px 20px",
          borderRadius: "var(--erp-radius-card-sm)",
          marginBottom: "24px",
          boxShadow: "var(--erp-shadow-card-sm)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <Mail
            size={24}
            color={settingsData?.enabled ? "#166534" : "#854d0e"}
          />
          <div>
            <strong
              style={{
                color: settingsData?.enabled ? "#166534" : "#854d0e",
                fontSize: "0.94rem",
                display: "block",
              }}
            >
              Automated Background Reminders:{" "}
              {settingsData?.enabled ? "ACTIVE" : "PAUSED (Admin Manual Control Only)"}
            </strong>
            <small style={{ color: "#64748b", fontSize: "0.8rem" }}>
              {settingsData?.enabled
                ? "Background cron evaluates inactive applications at 2h, 24h, and 72h intervals (Strict maximum: 3 attempts per student)."
                : "Automatic bulk emails are paused. Administrators can send targeted reminders manually from the Incomplete Applications tab."}
            </small>
          </div>
        </div>

        {canSet && (
          <button
            type="button"
            className={settingsData?.enabled ? "erp-btn-soft" : "erp-btn-cta"}
            disabled={toggling}
            onClick={handleToggle}
            style={{
              background: settingsData?.enabled ? "#fee2e2" : undefined,
              color: settingsData?.enabled ? "#b91c1c" : undefined,
              borderColor: settingsData?.enabled ? "#fca5a5" : undefined,
            }}
          >
            {toggling
              ? "Updating…"
              : settingsData?.enabled
                ? "Pause Automated Reminders"
                : "Activate Automated Reminders"}
          </button>
        )}
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="erp-metrics-grid" style={{ marginBottom: "26px" }}>
        <div className="erp-stat-card">
          <div className="erp-stat-card-head">
            <span className="erp-stat-label">Total Reminders Sent</span>
            <div className="erp-stat-icon-holder" style={{ color: "var(--erp-pink)" }}>
              <Send size={18} />
            </div>
          </div>
          <div className="erp-stat-value">{settingsData?.sentCount ?? 0}</div>
          <div className="erp-stat-note">
            <span className="erp-stat-dot" style={{ background: "var(--erp-pink)" }} />
            <span>Dispatched via Gmail SMTP</span>
          </div>
        </div>

        <div className="erp-stat-card">
          <div className="erp-stat-card-head">
            <span className="erp-stat-label">Accepted by SMTP</span>
            <div className="erp-stat-icon-holder" style={{ color: "var(--erp-green)" }}>
              <CheckCircle size={18} />
            </div>
          </div>
          <div className="erp-stat-value">{settingsData?.sentCount ?? 0}</div>
          <div className="erp-stat-note">
            <span className="erp-stat-dot" style={{ background: "var(--erp-green)" }} />
            <span>Transport success with message ID</span>
          </div>
        </div>

        <div className="erp-stat-card">
          <div className="erp-stat-card-head">
            <span className="erp-stat-label">Delivery Failures</span>
            <div className="erp-stat-icon-holder" style={{ color: "var(--erp-orange)" }}>
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="erp-stat-value">{settingsData?.failedCount ?? 0}</div>
          <div className="erp-stat-note">
            <span className="erp-stat-dot" style={{ background: "var(--erp-orange)" }} />
            <span>Provider rejects or invalid emails</span>
          </div>
        </div>

        <div className="erp-stat-card">
          <div className="erp-stat-card-head">
            <span className="erp-stat-label">Eligible Incomplete</span>
            <div className="erp-stat-icon-holder" style={{ color: "var(--erp-sky-deep)" }}>
              <Clock size={18} />
            </div>
          </div>
          <div className="erp-stat-value">{settingsData?.pendingCount ?? 0}</div>
          <div className="erp-stat-note">
            <span className="erp-stat-dot" style={{ background: "var(--erp-sky-deep)" }} />
            <span>Saved drafts under 3 attempts</span>
          </div>
        </div>
      </div>

      {/* Reminder Schedule Details Card */}
      <div
        className="erp-panel-card"
        style={{ marginBottom: "26px", padding: "20px 24px" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <Info size={18} color="var(--erp-sky-deep)" />
          <h4 style={{ margin: 0, fontSize: "0.96rem", color: "var(--erp-navy)" }}>
            Multi-Stage Inactive Follow-up Policy
          </h4>
        </div>
        <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--erp-text-secondary)", lineHeight: 1.5 }}>
          The reminder scheduler follows a non-intrusive 3-touch cadence:
          <strong> 1st attempt at 2 hours</strong> after inactivity,
          <strong> 2nd attempt at 24 hours</strong>, and a
          <strong> final attempt at 72 hours</strong>. Every reminder includes student name, class, application reference, and a secure one-click resume link with Email OTP authentication.
        </p>
      </div>

      {/* Reminder Logs Table */}
      <div className="erp-panel-card">
        <div className="erp-panel-head">
          <div className="erp-panel-title-area">
            <h3>Dispatched Reminder Logs</h3>
            <p>Complete historical delivery record from MongoDB ReminderLog collection</p>
          </div>
          <span className="erp-pill-tag">{data.total} total attempts</span>
        </div>

        <div className="erp-table-container">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Attempt</th>
                <th>Recipient</th>
                <th>Trigger</th>
                <th>Status</th>
                <th>Sent At (IST)</th>
                <th>Provider Message ID</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px" }}>
                    <Loader2 size={20} className="admin-spin" style={{ margin: "auto" }} />
                  </td>
                </tr>
              ) : data.logs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "var(--erp-text-muted)" }}>
                    No reminder emails logged in database yet.
                  </td>
                </tr>
              ) : (
                data.logs.map((log) => (
                  <tr key={log._id}>
                    <td>
                      <div className="erp-student-name-cell">
                        {log.registrationId?.studentName || "Candidate"}
                      </div>
                      <small className="erp-student-ref-cell">
                        {log.registrationId?.applicationRef || "Ref unknown"}
                      </small>
                    </td>
                    <td>
                      <strong>#{log.attemptNumber}</strong>
                    </td>
                    <td>
                      <div>{log.recipientEmail}</div>
                      <small style={{ color: "var(--erp-text-muted)" }}>
                        {log.registrationId?.guardianPhone}
                      </small>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: "0.74rem",
                          fontWeight: 700,
                          background: "var(--erp-surface-raised)",
                          padding: "2px 8px",
                          borderRadius: "6px",
                        }}
                      >
                        {log.triggerType || "AUTOMATIC"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`erp-badge-pill ${
                          log.status === "SENT"
                            ? "confirmed"
                            : log.status === "FAILED"
                              ? "incomplete"
                              : "under_review"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td>{dateLabel(log.sentAt)}</td>
                    <td>
                      <code style={{ fontSize: "0.72rem", color: "#64748b" }}>
                        {log.providerMessageId ? log.providerMessageId.slice(0, 24) + "…" : log.errorDetail || "—"}
                      </code>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data.pages > 1 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "20px",
              paddingTop: "14px",
              borderTop: "1px solid var(--erp-border)",
            }}
          >
            <span style={{ fontSize: "0.8rem", color: "var(--erp-text-muted)" }}>
              Page {page} of {data.pages}
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="erp-btn-soft"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={15} /> Prev
              </button>
              <button
                type="button"
                className="erp-btn-soft"
                disabled={page >= data.pages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
