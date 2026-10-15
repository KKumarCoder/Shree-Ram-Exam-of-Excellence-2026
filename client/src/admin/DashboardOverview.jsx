import React, { useState, useEffect } from "react";
import {
  Users,
  MailCheck,
  FileClock,
  Receipt,
  BadgeCheck,
  Send,
  CopyCheck,
  GraduationCap,
  Trophy,
  ArrowRight,
  ExternalLink,
  Eye,
  Edit2,
  Mail,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { api } from "../api.js";
import { notify } from "../notifications.js";
import { PromoBannerSlider } from "./PromoBannerSlider.jsx";

export function DashboardOverview({
  stats,
  onRefresh,
  loading,
  onNavigate,
  onViewStudent,
}) {
  const [recentRecords, setRecentRecords] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setRecentLoading(true);
    api
      .get("/admin/registrations", { params: { limit: 5, page: 1 } })
      .then(({ data }) => {
        if (active) setRecentRecords(data.items || []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setRecentLoading(false);
      });

    return () => {
      active = false;
    };
  }, [stats]);

  // 8 Specific Metric Cards matching Gate Pass Dashboard visual DNA
  const metricCards = [
    {
      id: "total",
      title: "Total Registrations",
      value: stats?.total != null ? stats.total.toLocaleString("en-IN") : "—",
      icon: Users,
      accentColor: "#0284C7",
      bgColor: "#E7F6FF",
      note: "Registered candidates",
      dotColor: "#0284C7",
      onClick: () => onNavigate?.("registrations"),
    },
    {
      id: "verified",
      title: "Email Verified",
      value: stats?.contactVerified != null ? stats.contactVerified.toLocaleString("en-IN") : "—",
      icon: MailCheck,
      accentColor: "#22C55E",
      bgColor: "#E7F8EE",
      note: "Guardian identity verified",
      dotColor: "#22C55E",
      onClick: () => onNavigate?.("registrations"),
    },
    {
      id: "incomplete",
      title: "Incomplete Applications",
      value: (stats?.incomplete ?? stats?.pending ?? 0).toLocaleString("en-IN"),
      icon: FileClock,
      accentColor: "#FB923C",
      bgColor: "#FFF0E3",
      note: "Saved drafts awaiting proof",
      dotColor: "#FB923C",
      onClick: () => onNavigate?.("recovery"),
    },
    {
      id: "review",
      title: "Payment Under Review",
      value: (stats?.review ?? stats?.paymentUnderReview ?? 0).toLocaleString("en-IN"),
      icon: Receipt,
      accentColor: "#FACC15",
      bgColor: "#FFF8DB",
      note: "UTR submitted for review",
      dotColor: "#EAB308",
      onClick: () => onNavigate?.("payments"),
    },
    {
      id: "confirmed",
      title: "Approved Applications",
      value: stats?.confirmed != null ? stats.confirmed.toLocaleString("en-IN") : "—",
      icon: BadgeCheck,
      accentColor: "#22C55E",
      bgColor: "#E7F8EE",
      note: "Verified & confirmed",
      dotColor: "#22C55E",
      onClick: () => onNavigate?.("registrations"),
    },
    {
      id: "reminders",
      title: "Reminder Emails Sent",
      value: (stats?.remindersSent ?? 0).toLocaleString("en-IN"),
      icon: Send,
      accentColor: "#EC4899",
      bgColor: "#FDEAF3",
      note: "Accepted by Gmail SMTP",
      dotColor: "#EC4899",
      onClick: () => onNavigate?.("reminders"),
    },
    {
      id: "duplicates",
      title: "Suspected Duplicates",
      value: (stats?.suspectedDuplicatesCount ?? 0).toLocaleString("en-IN"),
      icon: CopyCheck,
      accentColor: "#FB923C",
      bgColor: "#FFF0E3",
      note: "Flagged for admin audit",
      dotColor: "#FB923C",
      onClick: () => onNavigate?.("duplicates"),
    },
    {
      id: "admit_cards",
      title: "Admit Cards Available",
      value: (stats?.confirmed ?? 0).toLocaleString("en-IN"),
      icon: GraduationCap,
      accentColor: "#0284C7",
      bgColor: "#E7F6FF",
      note: "Eligible for admit PDF",
      dotColor: "#0284C7",
      onClick: () => onNavigate?.("admit_cards"),
    },
  ];

  // Distribution calculation for mutual exclusive status segments
  const totalCount = Math.max(1, stats?.total || 1);
  const confirmedCount = stats?.confirmed || 0;
  const reviewCount = stats?.review || 0;
  const incompleteCount = stats?.incomplete ?? stats?.pending ?? 0;
  const duplicateCount = stats?.suspectedDuplicatesCount || 0;

  const confirmedPct = Math.round((confirmedCount / totalCount) * 100);
  const reviewPct = Math.round((reviewCount / totalCount) * 100);
  const incompletePct = Math.round((incompleteCount / totalCount) * 100);
  const duplicatePct = Math.min(100 - (confirmedPct + reviewPct + incompletePct), Math.round((duplicateCount / totalCount) * 100));

  return (
    <div className="erp-dashboard-overview">
      {/* PROMO BANNER SLIDER */}
      <PromoBannerSlider stats={stats} onNavigate={onNavigate} />

      {/* 3. EIGHT METRIC CARDS GRID (4x2) */}
      <div className="erp-metrics-grid">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className="erp-stat-card"
              onClick={card.onClick}
              role="button"
              tabIndex={0}
              style={{ cursor: "pointer" }}
            >
              <div className="erp-stat-card-head">
                <span className="erp-stat-label">{card.title}</span>
                <div
                  className="erp-stat-icon-holder"
                  style={{ color: card.accentColor }}
                >
                  <Icon size={20} />
                </div>
              </div>

              <div className="erp-stat-value">{card.value}</div>

              <div className="erp-stat-note">
                <span
                  className="erp-stat-dot"
                  style={{ background: card.dotColor }}
                />
                <span>{card.note}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. ANALYTICS GRID (Two Panels 65% / 35%) */}
      <div className="erp-analytics-grid">
        {/* Panel A: Class-wise Confirmed Enrollment Activity */}
        <div className="erp-panel-card">
          <div className="erp-panel-head">
            <div className="erp-panel-title-area">
              <h3>Class-wise Confirmed Registrations</h3>
              <p>A breakdown of approved student candidates across grades</p>
            </div>
            <span className="erp-pill-tag">Classes 2 – 11</span>
          </div>

          <div className="erp-class-bars-list">
            {stats?.classes && stats.classes.length > 0 ? (
              stats.classes.map((c) => {
                const maxCount = Math.max(...stats.classes.map((x) => x.count), 1);
                const widthPct = Math.max(6, Math.round((c.count / maxCount) * 100));
                return (
                  <div key={c._id} className="erp-class-bar-row">
                    <span className="erp-class-bar-label">Class {c._id}</span>
                    <div className="erp-class-bar-track">
                      <div
                        className="erp-class-bar-fill"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <span className="erp-class-bar-count">{c.count}</span>
                  </div>
                );
              })
            ) : (
              <p style={{ color: "var(--erp-text-muted)", fontSize: "0.85rem", margin: "14px 0" }}>
                Confirmed registration counts by class will display here as payments are approved.
              </p>
            )}
          </div>
        </div>

        {/* Panel B: Mutual-Exclusive Application Status Distribution */}
        <div className="erp-panel-card">
          <div className="erp-panel-head">
            <div className="erp-panel-title-area">
              <h3>Application Status</h3>
              <p>Distribution of all candidate stages</p>
            </div>
            <span className="erp-pill-tag">Real time</span>
          </div>

          <div className="erp-donut-container">
            {/* Segmented Progress Ring Bar */}
            <div className="erp-donut-bars">
              <div
                className="erp-donut-segment"
                style={{ width: `${confirmedPct}%`, background: "#22C55E" }}
                title={`Approved: ${confirmedCount} (${confirmedPct}%)`}
              />
              <div
                className="erp-donut-segment"
                style={{ width: `${reviewPct}%`, background: "#FACC15" }}
                title={`Under Review: ${reviewCount} (${reviewPct}%)`}
              />
              <div
                className="erp-donut-segment"
                style={{ width: `${incompletePct}%`, background: "#FB923C" }}
                title={`Incomplete Drafts: ${incompleteCount} (${incompletePct}%)`}
              />
              <div
                className="erp-donut-segment"
                style={{ width: `${duplicatePct}%`, background: "#EC4899" }}
                title={`Duplicate Audit: ${duplicateCount} (${duplicatePct}%)`}
              />
            </div>

            {/* Status Legend List */}
            <div className="erp-status-legend-list">
              <div className="erp-status-legend-item">
                <div className="erp-legend-label-group">
                  <span className="erp-legend-color-dot" style={{ background: "#22C55E" }} />
                  <span className="erp-legend-text">Approved & Confirmed</span>
                </div>
                <span className="erp-legend-count">{confirmedCount}</span>
              </div>

              <div className="erp-status-legend-item">
                <div className="erp-legend-label-group">
                  <span className="erp-legend-color-dot" style={{ background: "#FACC15" }} />
                  <span className="erp-legend-text">Payment Under Review</span>
                </div>
                <span className="erp-legend-count">{reviewCount}</span>
              </div>

              <div className="erp-status-legend-item">
                <div className="erp-legend-label-group">
                  <span className="erp-legend-color-dot" style={{ background: "#FB923C" }} />
                  <span className="erp-legend-text">Incomplete Drafts</span>
                </div>
                <span className="erp-legend-count">{incompleteCount}</span>
              </div>

              <div className="erp-status-legend-item">
                <div className="erp-legend-label-group">
                  <span className="erp-legend-color-dot" style={{ background: "#EC4899" }} />
                  <span className="erp-legend-text">Suspected Duplicates</span>
                </div>
                <span className="erp-legend-count">{duplicateCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4.5. CLASS 11 STREAM BREAKDOWN (PCM, PCB, ARTS, COMMERCE) */}
      <div className="erp-panel-card" style={{ marginBottom: "20px" }}>
        <div className="erp-panel-head">
          <div className="erp-panel-title-area">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <GraduationCap size={20} style={{ color: "#0284C7" }} />
              <h3 style={{ margin: 0 }}>Class 11 Stream Breakdown</h3>
            </div>
            <p>Direct candidate count across academic streams (PCM, PCB, Arts, Commerce)</p>
          </div>
          <span className="erp-pill-tag" style={{ background: "#E0F2FE", color: "#0284C7", fontWeight: 700 }}>
            Class 11 Streams
          </span>
        </div>

        <div
          className="erp-stream-cards-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: "14px",
            marginTop: "8px",
          }}
        >
          {[
            {
              id: "PCM",
              name: "PCM",
              desc: "Physics, Chem, Mathematics",
              color: "#0284C7",
              bg: "#F0F9FF",
              border: "#BAE6FD",
              data: stats?.class11Streams?.PCM || { total: 0, confirmed: 0 },
            },
            {
              id: "PCB",
              name: "PCB",
              desc: "Physics, Chem, Biology",
              color: "#16A34A",
              bg: "#F0FDF4",
              border: "#BBF7D0",
              data: stats?.class11Streams?.PCB || { total: 0, confirmed: 0 },
            },
            {
              id: "ARTS",
              name: "ARTS",
              desc: "Humanities / Arts",
              color: "#D97706",
              bg: "#FFFBEB",
              border: "#FDE68A",
              data: stats?.class11Streams?.ARTS || { total: 0, confirmed: 0 },
            },
            {
              id: "COMMERCE",
              name: "COMMERCE",
              desc: "Commerce & Business",
              color: "#7C3AED",
              bg: "#FAF5FF",
              border: "#E9D5FF",
              data: stats?.class11Streams?.COMMERCE || { total: 0, confirmed: 0 },
            },
          ].map((stream) => (
            <div
              key={stream.id}
              onClick={() => onNavigate?.("registrations")}
              role="button"
              tabIndex={0}
              style={{
                background: stream.bg,
                border: `1.5px solid ${stream.border}`,
                borderRadius: "14px",
                padding: "16px",
                cursor: "pointer",
                transition: "all 0.2s ease-in-out",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = `0 6px 18px ${stream.color}22`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 800, fontSize: "1.15rem", color: stream.color }}>
                  {stream.name}
                </span>
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: stream.color,
                    background: "#FFFFFF",
                    padding: "2px 8px",
                    borderRadius: "6px",
                    border: `1px solid ${stream.border}`,
                  }}
                >
                  {stream.data.confirmed} Approved
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                <span style={{ fontSize: "1.75rem", fontWeight: 800, color: "#0F172A" }}>
                  {stream.data.total}
                </span>
                <span style={{ fontSize: "0.8rem", color: "#64748B" }}>
                  candidates
                </span>
              </div>
              <div style={{ fontSize: "0.76rem", color: "#64748B" }}>
                {stream.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. RECENT REGISTRATIONS TABLE PANEL */}
      <div className="erp-recent-table-card">
        <div className="erp-panel-head">
          <div className="erp-panel-title-area">
            <h3>Recent Candidate Applications</h3>
            <p>Latest Olympiad candidates submitted into the ERP workspace</p>
          </div>
          <button
            type="button"
            className="erp-btn-soft"
            onClick={() => onNavigate?.("registrations")}
          >
            <span>View All Registrations</span>
            <ArrowRight size={14} />
          </button>
        </div>

        <div className="erp-table-container">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Application Ref</th>
                <th>Class</th>
                <th>Guardian Contact</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "28px" }}>
                    <Loader2 size={18} className="admin-spin" style={{ margin: "auto" }} />
                  </td>
                </tr>
              ) : recentRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "28px", color: "var(--erp-text-muted)" }}>
                    No registrations found.
                  </td>
                </tr>
              ) : (
                recentRecords.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="erp-student-name-cell">{r.studentName}</div>
                      <small style={{ color: "var(--erp-text-muted)" }}>{r.guardianName}</small>
                    </td>
                    <td>
                      <span className="erp-student-ref-cell">{r.applicationRef}</span>
                    </td>
                    <td>
                      Class {r.studentClass}
                      {r.studentClass === "11" && r.course && (
                        <span
                          style={{
                            display: "inline-block",
                            marginLeft: "6px",
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "1px 6px",
                            borderRadius: "4px",
                            background: "#E0F2FE",
                            color: "#0369A1",
                            border: "1px solid #BAE6FD",
                          }}
                        >
                          {r.course}
                        </span>
                      )}
                    </td>
                    <td>
                      <div>{r.guardianPhone}</div>
                      <small style={{ color: "var(--erp-text-muted)" }}>{r.email}</small>
                    </td>
                    <td>
                      <span
                        className={`erp-badge-pill ${
                          r.status === "CONFIRMED"
                            ? "confirmed"
                            : r.status === "PAYMENT_UNDER_VERIFICATION" || r.status === "UNDER_REVIEW"
                              ? "under_review"
                              : "incomplete"
                        }`}
                      >
                        {r.status?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="erp-btn-soft"
                        style={{ padding: "6px 10px", fontSize: "0.76rem" }}
                        onClick={() => onViewStudent?.(r.id)}
                        title="View student history & audit timeline"
                      >
                        <Eye size={13} />
                        <span>History</span>
                      </button>
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
