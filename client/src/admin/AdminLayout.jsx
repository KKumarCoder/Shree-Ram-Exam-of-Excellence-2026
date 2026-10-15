import React, { useState } from "react";
import { AdminSidebar } from "./AdminSidebar.jsx";
import { AdminTopbar } from "./AdminTopbar.jsx";
import "./admin-theme.css";

export function AdminLayout({
  active,
  onSelectSection,
  activeTitle,
  canPay,
  canExam,
  canSet,
  me,
  onLogout,
  stats,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  children,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="erp-admin-shell">
      <AdminSidebar
        active={active}
        onSelectSection={onSelectSection}
        canPay={canPay}
        canExam={canExam}
        canSet={canSet}
        me={me}
        onLogout={onLogout}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        stats={stats}
      />

      <div className="erp-main-container">
        <AdminTopbar
          activeTitle={activeTitle}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          onSearchSubmit={onSearchSubmit}
          stats={stats}
          me={me}
          onOpenMobile={() => setMobileOpen(true)}
          onQuickNavigate={onSelectSection}
        />

        <main className="erp-workspace-content" id="admin-workspace-content">
          {children}
        </main>
      </div>
    </div>
  );
}
