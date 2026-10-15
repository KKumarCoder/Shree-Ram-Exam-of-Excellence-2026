import React, { useState } from "react";
import {
  FileSpreadsheet,
  Download,
  Loader2,
  Users,
  Receipt,
  ScanLine,
  CheckCircle,
} from "lucide-react";
import { api, downloadBlob } from "../api.js";
import { notify } from "../notifications.js";

export function ReportsView({ stats }) {
  const [exporting, setExporting] = useState("");

  const runExport = async (type, format, filename) => {
    const key = `${type}:${format}`;
    setExporting(key);
    try {
      let endpoint = `/admin/records/${type}/export.${format}`;
      if (type === "attendance") {
        endpoint = `/admin/attendance/export.${format}`;
      }
      const r = await api.get(endpoint, {
        responseType: "blob",
        timeout: 60000,
      });
      downloadBlob(r.data, `${filename}.${format}`);
      notify.success(`${filename}.${format} downloaded successfully.`);
    } catch (e) {
      notify.error(e.message || "Failed to download export report.");
    } finally {
      setExporting("");
    }
  };

  return (
    <div className="erp-reports-view">
      <div className="erp-panel-head" style={{ marginBottom: "20px" }}>
        <div className="erp-panel-title-area">
          <span className="erp-eyebrow">DATA COMPLIANCE & ARCHIVES</span>
          <h2 style={{ fontSize: "1.8rem", color: "var(--erp-navy)", margin: "4px 0" }}>
            Reports & Exports Center
          </h2>
          <p>
            Generate certified Excel spreadsheets, CSV data dumps, and PDF summaries directly from production records.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "22px" }}>
        {/* Report 1: Student Registrations Master Directory */}
        <div className="erp-panel-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <div className="erp-stat-icon-holder" style={{ color: "var(--erp-sky-deep)" }}>
                <Users size={20} />
              </div>
              <div>
                <h3 style={{ margin: "0 0 2px", fontSize: "1.1rem", color: "var(--erp-navy)" }}>
                  Registrations Directory
                </h3>
                <small style={{ color: "var(--erp-text-muted)" }}>
                  {stats?.total ?? 0} total applications
                </small>
              </div>
            </div>
            <p style={{ fontSize: "0.84rem", color: "var(--erp-text-secondary)", lineHeight: 1.5, margin: "0 0 20px" }}>
              Complete candidate records including Student Name, Class, Guardian Details, Contact Numbers, Address, and Verification Status.
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", borderTop: "1px solid var(--erp-border)", paddingTop: "16px" }}>
            {["xlsx", "csv", "pdf"].map((fmt) => {
              const isBusy = exporting === `registrations:${fmt}`;
              return (
                <button
                  key={fmt}
                  type="button"
                  className="erp-btn-soft"
                  disabled={!!exporting}
                  onClick={() => runExport("registrations", fmt, "shree-registrations-master")}
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  {isBusy ? <Loader2 size={13} className="admin-spin" /> : <Download size={13} />}
                  <span>{fmt === "xlsx" ? "Excel" : fmt.toUpperCase()}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Report 2: Payment Verification Ledger */}
        <div className="erp-panel-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <div className="erp-stat-icon-holder" style={{ color: "var(--erp-green)" }}>
                <Receipt size={20} />
              </div>
              <div>
                <h3 style={{ margin: "0 0 2px", fontSize: "1.1rem", color: "var(--erp-navy)" }}>
                  Payment Review Ledger
                </h3>
                <small style={{ color: "var(--erp-text-muted)" }}>
                  ₹{stats?.revenue ?? 0} verified fees
                </small>
              </div>
            </div>
            <p style={{ fontSize: "0.84rem", color: "var(--erp-text-secondary)", lineHeight: 1.5, margin: "0 0 20px" }}>
              Financial verification ledger containing Bank UTRs, transaction amounts, submission dates, admin reviewer notes, and approval statuses.
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", borderTop: "1px solid var(--erp-border)", paddingTop: "16px" }}>
            {["xlsx", "csv", "pdf"].map((fmt) => {
              const isBusy = exporting === `payments:${fmt}`;
              return (
                <button
                  key={fmt}
                  type="button"
                  className="erp-btn-soft"
                  disabled={!!exporting}
                  onClick={() => runExport("payments", fmt, "shree-payments-ledger")}
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  {isBusy ? <Loader2 size={13} className="admin-spin" /> : <Download size={13} />}
                  <span>{fmt === "xlsx" ? "Excel" : fmt.toUpperCase()}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Report 3: Exam Attendance Roster */}
        <div className="erp-panel-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
              <div className="erp-stat-icon-holder" style={{ color: "var(--erp-orange)" }}>
                <ScanLine size={20} />
              </div>
              <div>
                <h3 style={{ margin: "0 0 2px", fontSize: "1.1rem", color: "var(--erp-navy)" }}>
                  Exam Check-in Roster
                </h3>
                <small style={{ color: "var(--erp-text-muted)" }}>
                  Admit card check-in logs
                </small>
              </div>
            </div>
            <p style={{ fontSize: "0.84rem", color: "var(--erp-text-secondary)", lineHeight: 1.5, margin: "0 0 20px" }}>
              Live examination hall roster displaying scanned admit card barcodes, candidate check-in timestamps, and presence verification.
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", borderTop: "1px solid var(--erp-border)", paddingTop: "16px" }}>
            {["xlsx", "pdf"].map((fmt) => {
              const isBusy = exporting === `attendance:${fmt}`;
              return (
                <button
                  key={fmt}
                  type="button"
                  className="erp-btn-soft"
                  disabled={!!exporting}
                  onClick={() => runExport("attendance", fmt, "shree-exam-attendance-roster")}
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  {isBusy ? <Loader2 size={13} className="admin-spin" /> : <Download size={13} />}
                  <span>{fmt === "xlsx" ? "Excel" : fmt.toUpperCase()}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
