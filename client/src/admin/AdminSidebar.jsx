import React from "react";
import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Receipt,
  FileClock,
  Send,
  GraduationCap,
  ScanLine,
  Settings,
  CopyCheck,
  FileSpreadsheet,
  Shield,
  LogOut,
  X,
} from "lucide-react";
import { img } from "../api.js";

export function AdminSidebar({
  active,
  onSelectSection,
  canPay,
  canExam,
  canSet,
  me,
  onLogout,
  mobileOpen,
  onCloseMobile,
  stats,
}) {
  const getInitials = (email) => {
    if (!email) return "SA";
    const parts = email.split("@")[0].split(/[._-]/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
  };

  const navGroups = [
    {
      title: "WORKSPACE",
      items: [
        {
          id: "dashboard",
          label: "Overview",
          icon: LayoutDashboard,
        },
        {
          id: "registrations",
          label: "Registrations",
          icon: Users,
          badge: stats?.total,
        },
        {
          id: "payments",
          label: "Payment Review",
          icon: Receipt,
          badge: stats?.review > 0 ? stats.review : null,
          badgeVariant: "warning",
        },
        {
          id: "recovery",
          label: "Incomplete Applications",
          icon: FileClock,
          badge: stats?.incomplete > 0 ? stats.incomplete : null,
        },
        {
          id: "reminders",
          label: "Reminder Center",
          icon: Send,
          badge: stats?.remindersSent > 0 ? stats.remindersSent : null,
        },
        {
          id: "admit_cards",
          label: "Admit Cards",
          icon: GraduationCap,
          badge: stats?.confirmed > 0 ? stats.confirmed : null,
        },
      ],
    },
    {
      title: "EXAM MANAGEMENT",
      items: [
        {
          id: "checkin",
          label: "Exam Check-in",
          icon: ScanLine,
          visible: canExam,
        },
        {
          id: "settings",
          label: "Event Settings",
          icon: Settings,
          visible: canSet,
        },
        {
          id: "duplicates",
          label: "Suspected Duplicates",
          icon: CopyCheck,
          badge: stats?.suspectedDuplicatesCount > 0 ? stats.suspectedDuplicatesCount : null,
          badgeVariant: "orange",
        },
      ],
    },
    {
      title: "SYSTEM",
      items: [
        {
          id: "reports",
          label: "Reports & Exports",
          icon: FileSpreadsheet,
        },
      ],
    },
  ];

  return (
    <>
      {mobileOpen && (
        <div
          className="erp-sidebar-backdrop"
          onClick={onCloseMobile}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(6, 38, 57, 0.4)",
            backdropFilter: "blur(4px)",
            zIndex: 95,
          }}
        />
      )}
      <aside className={`erp-sidebar ${mobileOpen ? "open" : ""}`}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link
            className="erp-sidebar-brand"
            to="/"
            target="_blank"
            rel="noopener noreferrer"
            title="Open Olympiad Website in new tab"
          >
            <img
              src={img("school-logo.png")}
              alt="Shree Ram Public School logo"
              className="erp-sidebar-logo"
            />
            <div className="erp-brand-text">
              <span className="erp-brand-title">SHREE RAM PUBLIC SCHOOL</span>
              <div className="erp-brand-subtitle-row">
                <span className="erp-brand-subtitle">SHREE 2027 OLYMPIAD</span>
                <span className="erp-chip-erp">ERP</span>
              </div>
            </div>
          </Link>
          {mobileOpen && (
            <button
              type="button"
              onClick={onCloseMobile}
              style={{
                background: "transparent",
                border: 0,
                color: "var(--erp-text-muted)",
                cursor: "pointer",
                padding: "8px",
              }}
            >
              <X size={20} />
            </button>
          )}
        </div>

        {navGroups.map((group) => (
          <div key={group.title} className="erp-nav-group">
            <div className="erp-nav-group-title">{group.title}</div>
            <div className="erp-nav-list">
              {group.items
                .filter((item) => item.visible !== false)
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = active === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`erp-nav-item ${isActive ? "active" : ""}`}
                      onClick={() => {
                        onSelectSection(item.id);
                        if (mobileOpen) onCloseMobile();
                      }}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                      {item.badge != null && (
                        <span className="erp-nav-badge">{item.badge}</span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}

        <div className="erp-sidebar-footer">
          <div className="erp-sidebar-info-card">
            <Shield size={20} />
            <div>
              <strong>Every application. Carefully managed.</strong>
              <small>A safer, smarter Olympiad journey.</small>
            </div>
          </div>

          <div className="erp-sidebar-user-row">
            <div className="erp-sidebar-user">
              <div className="erp-user-avatar">
                {getInitials(me?.email)}
              </div>
              <div className="erp-user-meta">
                <strong>{me?.email?.split("@")[0] || "Administrator"}</strong>
                <span>{me?.role ? me.role.replace(/_/g, " ") : "SUPER ADMIN"}</span>
              </div>
            </div>
            <button
              type="button"
              className="erp-logout-btn"
              onClick={onLogout}
              title="Sign out of Admin ERP"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>

          <div className="erp-product-version">
            SRPS CAMPUS SUITE • 2027 v1.0
          </div>
        </div>
      </aside>
    </>
  );
}
