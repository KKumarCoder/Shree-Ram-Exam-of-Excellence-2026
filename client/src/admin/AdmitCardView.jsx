import React, { useState, useEffect } from "react";
import {
  GraduationCap,
  Download,
  Search,
  CheckCircle,
  Clock,
  ShieldAlert,
  Loader2,
  RefreshCcw,
  FileText,
} from "lucide-react";
import { api, downloadBlob } from "../api.js";
import { notify } from "../notifications.js";

export function AdmitCardView({ canExam, onPdfDownload, stats }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [downloading, setDownloading] = useState({});

  const fetchEligibleStudents = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/registrations", {
        params: { status: "CONFIRMED", search, page, limit: 12 },
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      notify.error(e.message || "Failed to load eligible candidates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEligibleStudents();
  }, [page]);

  const handleDownload = async (id, regNumber) => {
    setDownloading((prev) => ({ ...prev, [id]: true }));
    try {
      const r = await api.get(`/admin/admit-card/${id}`, {
        responseType: "blob",
      });
      downloadBlob(r.data, `admit-card-${regNumber || id}.pdf`);
      notify.success("Admit card PDF downloaded successfully.");
    } catch (e) {
      notify.error(e.message || "Failed to download admit card PDF.");
    } finally {
      setDownloading((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="erp-admit-card-view">
      <div className="erp-panel-head" style={{ marginBottom: "20px" }}>
        <div className="erp-panel-title-area">
          <span className="erp-eyebrow">EXAMINATION LOGISTICS</span>
          <h2 style={{ fontSize: "1.8rem", color: "var(--erp-navy)", margin: "4px 0" }}>
            Admit Card Management
          </h2>
          <p>
            Verify eligibility, view roll numbers, and download official examination admit cards for confirmed students.
          </p>
        </div>

        <button
          type="button"
          className="erp-btn-soft"
          onClick={fetchEligibleStudents}
          disabled={loading}
        >
          <RefreshCcw size={15} className={loading ? "admin-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {/* 4 Cards Overview */}
      <div className="erp-metrics-grid" style={{ marginBottom: "26px" }}>
        <div className="erp-stat-card">
          <div className="erp-stat-card-head">
            <span className="erp-stat-label">Eligible Students</span>
            <div className="erp-stat-icon-holder" style={{ color: "var(--erp-green)" }}>
              <CheckCircle size={18} />
            </div>
          </div>
          <div className="erp-stat-value">{stats?.confirmed ?? 0}</div>
          <div className="erp-stat-note">
            <span className="erp-stat-dot" style={{ background: "var(--erp-green)" }} />
            <span>Approved & payment verified</span>
          </div>
        </div>

        <div className="erp-stat-card">
          <div className="erp-stat-card-head">
            <span className="erp-stat-label">Pending Verification</span>
            <div className="erp-stat-icon-holder" style={{ color: "var(--erp-yellow)" }}>
              <Clock size={18} />
            </div>
          </div>
          <div className="erp-stat-value">{stats?.review ?? 0}</div>
          <div className="erp-stat-note">
            <span className="erp-stat-dot" style={{ background: "var(--erp-yellow)" }} />
            <span>UTR under review</span>
          </div>
        </div>

        <div className="erp-stat-card">
          <div className="erp-stat-card-head">
            <span className="erp-stat-label">Incomplete Proof</span>
            <div className="erp-stat-icon-holder" style={{ color: "var(--erp-orange)" }}>
              <ShieldAlert size={18} />
            </div>
          </div>
          <div className="erp-stat-value">{stats?.incomplete ?? 0}</div>
          <div className="erp-stat-note">
            <span className="erp-stat-dot" style={{ background: "var(--erp-orange)" }} />
            <span>Awaiting payment submission</span>
          </div>
        </div>

        <div className="erp-stat-card">
          <div className="erp-stat-card-head">
            <span className="erp-stat-label">Total Candidate Pool</span>
            <div className="erp-stat-icon-holder" style={{ color: "var(--erp-sky-deep)" }}>
              <GraduationCap size={18} />
            </div>
          </div>
          <div className="erp-stat-value">{stats?.total ?? 0}</div>
          <div className="erp-stat-note">
            <span className="erp-stat-dot" style={{ background: "var(--erp-sky-deep)" }} />
            <span>All registered applications</span>
          </div>
        </div>
      </div>

      {/* Eligible Students Table */}
      <div className="erp-panel-card">
        <div className="erp-panel-head">
          <div className="erp-panel-title-area">
            <h3>Confirmed Candidates with Issued Admit Cards</h3>
            <p>Every student listed below has verified payment and an assigned roll number</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchEligibleStudents();
            }}
            style={{ display: "flex", gap: "8px" }}
          >
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter student or roll number..."
              style={{
                padding: "8px 14px",
                border: "1px solid var(--erp-border)",
                borderRadius: "var(--erp-radius-button)",
                fontSize: "0.84rem",
              }}
            />
            <button type="submit" className="erp-btn-cta" style={{ padding: "8px 14px" }}>
              <Search size={15} />
            </button>
          </form>
        </div>

        <div className="erp-table-container">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Roll Number</th>
                <th>Class</th>
                <th>Application Ref</th>
                <th>Guardian Phone</th>
                <th style={{ textAlign: "right" }}>Official PDF</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "32px" }}>
                    <Loader2 size={20} className="admin-spin" style={{ margin: "auto" }} />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "var(--erp-text-muted)" }}>
                    No confirmed candidates found matching query.
                  </td>
                </tr>
              ) : (
                items.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <div className="erp-student-name-cell">{student.studentName}</div>
                      <small style={{ color: "var(--erp-text-muted)" }}>{student.currentSchool}</small>
                    </td>
                    <td>
                      <strong style={{ color: "var(--erp-sky-deep)", letterSpacing: "0.03em" }}>
                        {student.registrationNumber || "Assigned on PDF"}
                      </strong>
                    </td>
                    <td>
                      <div>Class {student.studentClass}</div>
                      {student.studentClass === "11" && student.course && (
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "1px 6px",
                            borderRadius: "4px",
                            background: "#E0F2FE",
                            color: "#0369A1",
                            border: "1px solid #BAE6FD",
                            marginTop: "2px",
                          }}
                        >
                          {student.course}
                        </span>
                      )}
                    </td>
                    <td>
                      <code className="erp-student-ref-cell">{student.applicationRef}</code>
                    </td>
                    <td>{student.guardianPhone}</td>
                    <td style={{ textAlign: "right" }}>
                      {canExam ? (
                        <button
                          type="button"
                          className="erp-btn-soft"
                          disabled={downloading[student.id]}
                          onClick={() => handleDownload(student.id, student.registrationNumber)}
                          style={{
                            color: "var(--erp-sky-deep)",
                            fontWeight: 700,
                            padding: "6px 12px",
                            fontSize: "0.8rem",
                          }}
                        >
                          {downloading[student.id] ? (
                            <Loader2 size={13} className="admin-spin" />
                          ) : (
                            <Download size={13} />
                          )}
                          <span>Download PDF</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: "0.74rem", color: "var(--erp-text-muted)" }}>
                          Exam Coordinator role required
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
