import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  ShieldCheck,
  X,
  RefreshCcw,
  Loader2,
  CopyCheck,
} from "lucide-react";
import { api } from "../api.js";
import { notify } from "../notifications.js";

export function DuplicateAuditView({ canAdmin, refreshKey }) {
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [supersedeTarget, setSupersedeTarget] = useState(null);
  const [supersedeReason, setSupersedeReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const fetchDuplicates = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/duplicates");
      setDuplicateGroups(data.duplicateGroups || []);
      setSummary(data.summary || null);
    } catch (e) {
      notify.error(e.message || "Failed to load duplicate report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDuplicates();
  }, [refreshKey]);

  const handleSupersede = async () => {
    if (!supersedeTarget) return;
    setActionBusy(true);
    try {
      await api.post(`/admin/registrations/${supersedeTarget.id}/supersede`, {
        reason: supersedeReason || "Marked as duplicate draft by administrator",
      });
      notify.success(
        `Application ${supersedeTarget.applicationRef} marked as superseded`
      );
      setSupersedeTarget(null);
      setSupersedeReason("");
      fetchDuplicates();
    } catch (e) {
      notify.error(e.message || "Failed to supersede registration");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="erp-duplicate-audit-view">
      <div className="erp-panel-head" style={{ marginBottom: "20px" }}>
        <div className="erp-panel-title-area">
          <span className="erp-eyebrow">NON-DESTRUCTIVE AUDIT REPORT</span>
          <h2 style={{ fontSize: "1.8rem", color: "var(--erp-navy)", margin: "4px 0" }}>
            Suspected Duplicate Applications
          </h2>
          <p>
            Grouped by normalized student name, guardian mobile, class, and date of birth.
            Records are never deleted automatically; administrators can review history and supersede abandoned drafts.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="erp-date-chip">
            <CopyCheck size={16} color="var(--erp-orange)" />
            <span>{summary?.suspectedDuplicateGroups || 0} Duplicate Groups</span>
          </div>

          <button
            type="button"
            className="erp-btn-soft"
            onClick={fetchDuplicates}
            disabled={loading}
          >
            <RefreshCcw size={15} className={loading ? "admin-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="erp-panel-card" style={{ textAlign: "center", padding: "40px" }}>
          <Loader2 size={24} className="admin-spin" style={{ margin: "auto 0 10px" }} />
          <p style={{ color: "var(--erp-text-muted)", margin: 0 }}>
            Scanning active student records for duplicate identities…
          </p>
        </div>
      ) : duplicateGroups.length === 0 ? (
        <div className="erp-panel-card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <ShieldCheck size={42} color="var(--erp-green)" style={{ margin: "0 auto 12px" }} />
          <h3 style={{ margin: "0 0 6px", color: "var(--erp-navy)" }}>
            No Duplicate Applications Detected
          </h3>
          <p style={{ color: "var(--erp-text-muted)", margin: 0, fontSize: "0.9rem" }}>
            All active registrations represent distinct student identities.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {duplicateGroups.map((group) => (
            <div key={group.groupKey} className="erp-panel-card">
              <div className="erp-panel-head" style={{ marginBottom: "14px" }}>
                <div>
                  <h3 style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--erp-navy)" }}>
                    <AlertTriangle size={18} color="var(--erp-orange)" />
                    {group.studentName} — Class {group.studentClass}
                  </h3>
                  <small style={{ color: "var(--erp-text-muted)", fontSize: "0.78rem" }}>
                    Guardian Phone: {group.guardianPhone} · DOB: {group.dob || "Not specified"} · Candidates: {group.candidateCount}
                  </small>
                </div>
                <span className="erp-badge-pill under_review">
                  {group.candidateCount} Submissions
                </span>
              </div>

              <div className="erp-table-container">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Ref / Date</th>
                      <th>Status</th>
                      <th>Application / Payment Stage</th>
                      <th>UTR / Payment</th>
                      <th style={{ textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.candidates.map((cand) => {
                      const isSuperseded =
                        cand.status === "CANCELLED" ||
                        cand.applicationStatus === "superseded";
                      return (
                        <tr
                          key={cand.id}
                          style={{
                            opacity: isSuperseded ? 0.6 : 1,
                            background: isSuperseded ? "var(--erp-surface-soft)" : undefined,
                          }}
                        >
                          <td>
                            <strong className="erp-student-ref-cell">
                              {cand.applicationRef}
                            </strong>
                            <small style={{ display: "block", color: "var(--erp-text-muted)" }}>
                              {new Date(cand.createdAt).toLocaleString("en-IN", {
                                timeZone: "Asia/Kolkata",
                              })}
                            </small>
                          </td>
                          <td>
                            <span
                              className={`erp-badge-pill ${
                                cand.status === "CONFIRMED"
                                  ? "confirmed"
                                  : cand.status === "PAYMENT_UNDER_VERIFICATION" ||
                                      cand.status === "UNDER_REVIEW"
                                    ? "under_review"
                                    : "incomplete"
                              }`}
                            >
                              {cand.status}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontSize: "0.78rem" }}>
                              App: <strong>{cand.applicationStatus || "draft"}</strong>
                            </div>
                            <div style={{ fontSize: "0.78rem" }}>
                              Pay: <strong>{cand.paymentStatus || "not_submitted"}</strong>
                            </div>
                          </td>
                          <td>
                            {cand.payment ? (
                              <div>
                                <span>
                                  ₹{cand.payment.amount} ({cand.payment.mode})
                                </span>
                                {cand.payment.utr && (
                                  <code
                                    style={{
                                      display: "block",
                                      marginTop: 4,
                                      fontSize: "0.74rem",
                                      color: "var(--erp-sky-deep)",
                                    }}
                                  >
                                    {cand.payment.utr}
                                  </code>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: "var(--erp-text-muted)" }}>
                                No payment
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {isSuperseded ? (
                              <span style={{ color: "var(--erp-text-muted)", fontSize: "0.76rem" }}>
                                Superseded
                              </span>
                            ) : cand.status === "CONFIRMED" ? (
                              <span style={{ color: "var(--erp-green)", fontWeight: 700, fontSize: "0.76rem" }}>
                                Active Confirmed
                              </span>
                            ) : canAdmin ? (
                              <button
                                type="button"
                                className="erp-btn-soft"
                                style={{ fontSize: "0.76rem", padding: "5px 10px" }}
                                onClick={() => setSupersedeTarget(cand)}
                              >
                                Supersede Draft
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for superseding duplicate */}
      {supersedeTarget && (
        <div
          className="admin-modal-backdrop"
          onClick={() => setSupersedeTarget(null)}
        >
          <div
            className="admin-modal-dialog crud-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480 }}
          >
            <div className="admin-modal-head">
              <div>
                <h3>Supersede Duplicate Draft</h3>
                <small>Application: {supersedeTarget.applicationRef}</small>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setSupersedeTarget(null)}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--erp-text-secondary)", margin: "10px 0 16px" }}>
              Mark application <strong>{supersedeTarget.applicationRef}</strong> (
              {supersedeTarget.studentName}) as superseded. This preserves the record for
              auditing while excluding it from active metrics and duplicate collision checks.
            </p>

            <label className="crud-form-field" style={{ marginBottom: "16px" }}>
              <span>Reason for Superseding</span>
              <input
                type="text"
                placeholder="e.g. Abandoned draft, student registered in newer application"
                value={supersedeReason}
                onChange={(e) => setSupersedeReason(e.target.value)}
              />
            </label>

            <div className="crud-modal-actions">
              <button
                type="button"
                className="btn light"
                onClick={() => setSupersedeTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={actionBusy}
                onClick={handleSupersede}
              >
                {actionBusy ? "Superseding…" : "Confirm Supersede"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
