import React, { useState } from "react";
import { X, Mail, Loader2 } from "lucide-react";
import { api } from "./api.js";
import { notify } from "./notifications.js";

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

export function StudentDetailModal({
  selectedStudentDetail,
  onClose,
  canPay,
  onRefresh,
}) {
  const [reminding, setReminding] = useState(false);

  if (!selectedStudentDetail) return null;

  const { student, payment, auditLog, reminderLogs, siblings } = selectedStudentDetail;

  const handleSendReminder = async () => {
    if (reminding) return;
    if (
      !window.confirm(
        `Send registration reminder email to the guardian of ${student.studentName}?`
      )
    )
      return;

    setReminding(true);
    try {
      const { data } = await api.post(`/admin/registrations/${student._id}/remind`);
      notify({
        type: "success",
        title: "Reminder Sent",
        message: data.message || "Manual reminder email dispatched via Gmail SMTP.",
      });
      if (onRefresh) onRefresh(student._id);
    } catch (err) {
      notify({
        type: "error",
        title: "Failed",
        message: err.response?.data?.error || "Failed to deliver reminder email.",
      });
    } finally {
      setReminding(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        className="admin-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="admin-modal-head">
          <div>
            <h3>{student.studentName}</h3>
            <small>
              Class {student.studentClass}
              {student.studentClass === "11" && student.course
                ? ` (${student.course})`
                : ""}{" "}
              · Ref: {student.applicationRef}
              {student.registrationNumber ? ` · Reg: ${student.registrationNumber}` : ""}
            </small>
          </div>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
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
                <strong>{student.guardianName}</strong>
              </div>
              <div className="card-item">
                <span>Mobile</span>
                <strong>{student.guardianPhone}</strong>
              </div>
              <div className="card-item">
                <span>Email</span>
                <strong>{student.email || "—"}</strong>
              </div>
            </div>

            <div className="detail-card">
              <span className="card-label">Student Information</span>
              <div className="card-item">
                <span>Date of Birth</span>
                <strong>{student.dob}</strong>
              </div>
              <div className="card-item">
                <span>Gender</span>
                <strong>{student.gender || "MALE"}</strong>
              </div>
              <div className="card-item">
                <span>Current School</span>
                <strong>{student.currentSchool}</strong>
              </div>
              {student.studentClass === "11" && (
                <div className="card-item">
                  <span>Stream / Course</span>
                  <strong style={{ color: "#0284C7", fontWeight: 800 }}>
                    {student.course || "Not Selected"}
                  </strong>
                </div>
              )}
              <div className="card-item">
                <span>Location</span>
                <strong>
                  {student.city}, {student.district}, {student.state} - {student.pincode}
                </strong>
              </div>
            </div>
          </div>

          <div className="detail-card full-width">
            <span className="card-label">Application Status Breakdown</span>
            <div className="status-chips-row">
              <div className="status-chip">
                <span>Overall</span>
                <Badge status={student.status} />
              </div>
              <div className="status-chip">
                <span>Contact Verification</span>
                <strong className="chip-value">
                  {student.verificationStatus || (student.verifiedAt ? "verified" : "pending")}
                </strong>
              </div>
              <div className="status-chip">
                <span>Application Stage</span>
                <strong className="chip-value">
                  {student.applicationStatus || "draft"}
                </strong>
              </div>
              <div className="status-chip">
                <span>Payment Stage</span>
                <strong className="chip-value">
                  {student.paymentStatus || "not_submitted"}
                </strong>
              </div>
            </div>
          </div>

          {payment && (
            <div className="detail-card full-width">
              <span className="card-label">Payment Information</span>
              <div className="payment-info-row">
                <div>
                  <span>Mode</span>
                  <strong>{payment.mode}</strong>
                </div>
                <div>
                  <span>Amount</span>
                  <strong>₹{payment.amount}</strong>
                </div>
                <div>
                  <span>UTR</span>
                  <strong className="utr-badge">{payment.utr || "—"}</strong>
                </div>
                <div>
                  <span>Payment Status</span>
                  <strong className="status-text">{payment.status}</strong>
                </div>
              </div>
              {payment.reviewNote && (
                <p className="payment-note">Review Note: {payment.reviewNote}</p>
              )}
            </div>
          )}

          {siblings?.length > 0 && (
            <div className="detail-card full-width">
              <span className="card-label">
                Other Students Under Same Guardian Mobile ({siblings.length})
              </span>
              <div className="siblings-chips">
                {siblings.map((sib) => (
                  <div key={sib.id} className="sibling-badge">
                    <strong>{sib.studentName}</strong> (Class {sib.studentClass}
                    {sib.studentClass === "11" && sib.course
                      ? ` - ${sib.course}`
                      : ""}) ·{" "}
                    {sib.applicationRef} · <Badge status={sib.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="detail-card full-width">
            <span className="card-label">Status & Audit History</span>
            <div className="history-timeline">
              {student.statusHistory?.length ? (
                student.statusHistory.map((h, i) => (
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
                  Created on {dateLabel(student.createdAt)}. No status changes recorded.
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
                Reminder Delivery History ({reminderLogs?.length || 0})
              </span>
              {canPay &&
                ["DRAFT", "OTP_VERIFIED", "PAYMENT_PENDING"].includes(student.status) &&
                student.applicationStatus !== "approved" && (
                  <button
                    type="button"
                    className="btn primary small remind-btn"
                    disabled={reminding}
                    onClick={handleSendReminder}
                  >
                    {reminding ? (
                      <Loader2 size={13} className="admin-spin" />
                    ) : (
                      <Mail size={13} />
                    )}
                    Send Manual Reminder Now
                  </button>
                )}
            </div>
            {reminderLogs?.length ? (
              <div className="reminder-logs-table" style={{ overflowX: "auto" }}>
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
                      <th style={{ padding: "8px 10px" }}>Message ID / Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reminderLogs.map((log, i) => (
                      <tr key={log._id || i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px 10px", fontWeight: "600" }}>
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
                        <td style={{ padding: "8px 10px", color: "#64748b" }}>
                          {log.recipientEmail}
                        </td>
                        <td style={{ padding: "8px 10px" }}>{dateLabel(log.sentAt)}</td>
                        <td
                          style={{
                            padding: "8px 10px",
                            fontFamily: "monospace",
                            fontSize: "11px",
                            color: log.errorDetail ? "#dc2626" : "#64748b",
                          }}
                        >
                          {log.providerMessageId || log.errorDetail || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="no-history-text" style={{ margin: "8px 0" }}>
                No reminder emails dispatched yet for this application. (Scheduled attempts will appear here).
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
