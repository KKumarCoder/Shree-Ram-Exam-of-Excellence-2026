import React, { useState, useEffect } from "react";
import {
  Search,
  Bell,
  Moon,
  Sun,
  Menu,
  CheckCircle,
  ExternalLink,
} from "lucide-react";

export function AdminTopbar({
  activeTitle = "Overview",
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  stats,
  me,
  onOpenMobile,
  onQuickNavigate,
}) {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === "undefined") return false;
    const saved =
      localStorage.getItem("shree-theme") ||
      localStorage.getItem("shree_admin_theme");
    if (saved) return saved === "dark";
    return (
      document.documentElement.dataset.theme === "dark" ||
      document.documentElement.classList.contains("dark")
    );
  });

  useEffect(() => {
    const themeVal = isDark ? "dark" : "light";
    document.documentElement.dataset.theme = themeVal;
    document.documentElement.style.colorScheme = themeVal;
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    try {
      localStorage.setItem("shree-theme", themeVal);
      localStorage.setItem("shree_admin_theme", themeVal);
    } catch {}
  }, [isDark]);

  const toggleDarkMode = () => {
    setIsDark((prev) => !prev);
  };

  const pendingNotifications = (stats?.review || 0) + (stats?.suspectedDuplicatesCount || 0);

  const getInitials = (email) => {
    if (!email) return "SA";
    const parts = email.split("@")[0].split(/[._-]/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
  };

  return (
    <header className="erp-topbar">
      <div className="erp-topbar-left">
        <button
          type="button"
          className="erp-mobile-menu-toggle"
          onClick={onOpenMobile}
          aria-label="Toggle navigation menu"
        >
          <Menu size={22} />
        </button>
        <div className="erp-breadcrumb">
          <span>Workspace</span>
          <span>/</span>
          <strong>{activeTitle}</strong>
        </div>
      </div>

      <form
        className="erp-search-pill"
        onSubmit={(e) => {
          e.preventDefault();
          if (onSearchSubmit) onSearchSubmit(searchQuery);
        }}
      >
        <Search size={16} />
        <input
          type="text"
          value={searchQuery || ""}
          onChange={(e) => onSearchChange?.(e.target.value)}
          placeholder="Search students, applications, UTR..."
          aria-label="Search students and applications"
        />
        <span className="erp-search-shortcut">⌘K</span>
      </form>

      <div className="erp-topbar-right">
        <button
          type="button"
          className="erp-top-icon-btn"
          onClick={toggleDarkMode}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <div className="erp-status-pill">
          <span className="erp-status-dot" />
          <span>Olympiad workspace</span>
        </div>

        <button
          type="button"
          className="erp-top-icon-btn"
          onClick={() => onQuickNavigate?.("payments")}
          title={`${pendingNotifications} pending operational items`}
          aria-label="Notifications"
        >
          <Bell size={17} />
          {pendingNotifications > 0 && (
            <span className="erp-notification-badge">{pendingNotifications}</span>
          )}
        </button>

        <div className="erp-top-user-pill">
          <div className="erp-top-avatar">
            {getInitials(me?.email)}
          </div>
          <div className="erp-top-user-info">
            <strong>{me?.email?.split("@")[0] || "Administrator"}</strong>
            <small>{me?.role ? me.role.replace(/_/g, " ") : "SUPER ADMIN"}</small>
          </div>
        </div>
      </div>
    </header>
  );
}
