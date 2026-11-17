import React, { useState, useEffect } from "react";
import {
  MessageSquare,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Send,
  FileText,
  Award,
  Search,
  Filter,
  Users,
  Smartphone,
  Eye,
  RotateCw,
  ExternalLink,
  ShieldCheck,
  CheckCheck,
} from "lucide-react";
import { api } from "../api.js";
import { notify } from "../notifications.js";

export function WhatsAppCenter({ canAdmin = true }) {
  const [tab, setTab] = useState("overview"); // 'overview' | 'templates' | 'messages' | 'otp' | 'admit' | 'certificates' | 'bulk' | 'diagnostics'
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messagesPagination, setMessagesPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [otpLogs, setOtpLogs] = useState([]);
  const [otpPagination, setOtpPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [diagnostics, setDiagnostics] = useState(null);

  // Filters
  const [msgFilterStatus, setMsgFilterStatus] = useState("");
  const [msgFilterType, setMsgFilterType] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Test Modal state
  const [testModal, setTestModal] = useState({ open: false, templateKey: "OTP", mobile: "", params: ["123456"] });
  const [testSending, setTestSending] = useState(false);

  // Bulk Campaign state
  const [bulkAudience, setBulkAudience] = useState("all_confirmed");
  const [bulkClass, setBulkClass] = useState("5");
  const [bulkTemplate, setBulkTemplate] = useState("EXAM_REMINDER");
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // Load Overview Data
  const loadOverview = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/whatsapp/overview");
      setOverview(data);
    } catch (e) {
      notify.error(e.message || "Failed to load WhatsApp statistics");
    } finally {
      setLoading(false);
    }
  };

  // Load Templates
  const loadTemplates = async () => {
    try {
      const { data } = await api.get("/admin/whatsapp/templates");
      setTemplates(data.templates || []);
    } catch (e) {
      notify.error("Failed to load WhatsApp templates");
    }
  };

  // Load Message History
  const loadMessages = async (page = 1) => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 25,
        status: msgFilterStatus || undefined,
        messageType: msgFilterType || undefined,
        search: searchQuery.trim() || undefined,
      };
      const { data } = await api.get("/admin/whatsapp/messages", { params });
      setMessages(data.messages || []);
      setMessagesPagination({ page: data.page, totalPages: data.totalPages, total: data.total });
    } catch (e) {
      notify.error("Failed to load message history");
    } finally {
      setLoading(false);
    }
  };

  // Load OTP Logs
  const loadOtpLogs = async (page = 1) => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/whatsapp/otp-logs", { params: { page, limit: 25 } });
      setOtpLogs(data.challenges || []);
      setOtpPagination({ page: data.page, totalPages: data.totalPages, total: data.total });
    } catch (e) {
      notify.error("Failed to load OTP logs");
    } finally {
      setLoading(false);
    }
  };

  // Load Diagnostics
  const loadDiagnostics = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/whatsapp/connection-test");
      setDiagnostics(data);
    } catch (e) {
      notify.error("Failed to run diagnostics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "overview") loadOverview();
    if (tab === "templates") loadTemplates();
    if (tab === "messages") loadMessages(1);
    if (tab === "otp") loadOtpLogs(1);
    if (tab === "diagnostics") loadDiagnostics();
  }, [tab]);

  // Handle Retry Message
  const handleRetry = async (messageId) => {
    try {
      const { data } = await api.post(`/admin/whatsapp/messages/${messageId}/retry`);
      if (data.success) {
        notify.success("Message redelivered successfully!");
        loadMessages(messagesPagination.page);
      } else {
        notify.error(data.error || "Retry failed");
      }
    } catch (e) {
      notify.error(e.message || "Error retrying message");
    }
  };

  // Handle Test Message Send
  const handleSendTest = async (e) => {
    e.preventDefault();
    if (!testModal.mobile) {
      notify.error("Please enter a recipient WhatsApp number");
      return;
    }
    setTestSending(true);
    try {
      const { data } = await api.post("/admin/whatsapp/templates/test", {
        templateKey: testModal.templateKey,
        mobile: testModal.mobile,
        params: testModal.params,
      });
      notify.success(data.message || "Test message sent successfully!");
      setTestModal((prev) => ({ ...prev, open: false }));
    } catch (e) {
      notify.error(e.response?.data?.error || e.message || "Failed to send test message");
    } finally {
      setTestSending(false);
    }
  };

  // Handle Bulk Dispatch
  const handleStartBulk = async () => {
    if (!confirm(`Are you sure you want to dispatch bulk WhatsApp messages to audience: ${bulkAudience}?`)) {
      return;
    }
    setBulkSending(true);
    setBulkResult(null);
    try {
      const { data } = await api.post("/admin/whatsapp/bulk-send", {
        targetAudience: bulkAudience,
        studentClass: bulkClass,
        templateKey: bulkTemplate,
        campaignTitle: `Admin Campaign ${new Date().toLocaleDateString()}`,
      });
      notify.success(data.message);
      setBulkResult(data);
    } catch (e) {
      notify.error(e.response?.data?.error || e.message || "Bulk dispatch failed");
    } finally {
      setBulkSending(false);
    }
  };

  return (
    <div className="whatsapp-center-view">
      {/* Top Header Card */}
      <div className="erp-panel-card" style={{ marginBottom: "20px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "#DCFCE7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#16a34a",
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.634.074-1.809-.413-1.464-.607-2.434-2.115-2.51-2.215-.075-.1-.611-.813-.611-1.554 0-.741.388-1.106.526-1.256.138-.15.301-.188.402-.188.101 0 .202.001.29.006.094.004.221-.036.345.263.129.313.439 1.071.478 1.149.038.078.063.169.012.27-.051.101-.076.163-.151.25-.075.088-.158.196-.226.263-.075.075-.153.157-.066.307.087.15.388.641.833 1.037.572.509 1.055.666 1.205.741.15.075.238.063.326-.038.088-.1.376-.438.476-.589.1-.15.2-.126.338-.075.138.05.877.413 1.028.489.15.075.25.113.288.176.038.063.038.364-.106.769z"/>
              </svg>
            </div>
            <div>
              <span className="erp-eyebrow" style={{ color: "#16a34a" }}>
                AUTOMATION GATEWAY
              </span>
              <h2 style={{ fontSize: "1.6rem", color: "var(--erp-navy)", margin: "2px 0" }}>
                WhatsApp Communication Center
              </h2>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--erp-text-secondary)" }}>
                Unified APITxT Business API for Registration OTP, Admit Cards & Certificates
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "20px",
                background: "#DCFCE7",
                color: "#15803d",
                fontWeight: 600,
                fontSize: "13px",
              }}
            >
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#16a34a" }} />
              APITxT Connected
            </span>
            <button
              type="button"
              className="erp-btn erp-btn-secondary"
              onClick={() => {
                if (tab === "overview") loadOverview();
                if (tab === "messages") loadMessages(messagesPagination.page);
                if (tab === "otp") loadOtpLogs(otpPagination.page);
                if (tab === "diagnostics") loadDiagnostics();
              }}
              disabled={loading}
              title="Refresh Current View"
            >
              <RefreshCw size={15} className={loading ? "spin-animation" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {/* Tab Navigation Pill Bar */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            borderTop: "1px solid var(--erp-border)",
            marginTop: "20px",
            paddingTop: "16px",
            overflowX: "auto",
          }}
        >
          {[
            { id: "overview", label: "Overview & Metrics", icon: MessageSquare },
            { id: "templates", label: "Templates Registry (9)", icon: FileText },
            { id: "messages", label: "Delivery Reports & Logs", icon: CheckCheck },
            { id: "otp", label: "WhatsApp OTP Logs", icon: Smartphone },
            { id: "bulk", label: "Bulk Distribution", icon: Users },
            { id: "diagnostics", label: "Connection & Gateway", icon: ShieldCheck },
          ].map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                  transition: "all 0.15s ease",
                  background: isActive ? "var(--erp-navy)" : "#F1F5F9",
                  color: isActive ? "#FFFFFF" : "var(--erp-text)",
                  whiteSpace: "nowrap",
                }}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* VIEW 1: OVERVIEW & METRICS */}
      {tab === "overview" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: "16px",
              marginBottom: "20px",
            }}
          >
            <div className="erp-stat-card">
              <span className="erp-stat-label">TOTAL MESSAGES</span>
              <span className="erp-stat-value">{overview?.metrics?.totalMessages ?? 0}</span>
              <span className="erp-stat-sub">Dispatched via APITxT</span>
            </div>

            <div className="erp-stat-card">
              <span className="erp-stat-label">DELIVERY SUCCESS</span>
              <span className="erp-stat-value" style={{ color: "#16a34a" }}>
                {overview?.metrics?.deliveryRate ?? 0}%
              </span>
              <span className="erp-stat-sub">{overview?.metrics?.deliveredCount ?? 0} confirmed delivered</span>
            </div>

            <div className="erp-stat-card">
              <span className="erp-stat-label">READ / SEEN RATE</span>
              <span className="erp-stat-value" style={{ color: "#0284c7" }}>
                {overview?.metrics?.readRate ?? 0}%
              </span>
              <span className="erp-stat-sub">{overview?.metrics?.readCount ?? 0} read receipts</span>
            </div>

            <div className="erp-stat-card">
              <span className="erp-stat-label">OTP VERIFICATIONS</span>
              <span className="erp-stat-value" style={{ color: "#7c3aed" }}>
                {overview?.metrics?.verifiedOtpChallenges ?? 0} / {overview?.metrics?.totalOtpChallenges ?? 0}
              </span>
              <span className="erp-stat-sub">{overview?.metrics?.otpSuccessRate ?? 0}% success rate</span>
            </div>

            <div className="erp-stat-card">
              <span className="erp-stat-label">ADMIT CARDS SENT</span>
              <span className="erp-stat-value" style={{ color: "#052742" }}>
                {overview?.metrics?.admitCardCount ?? 0}
              </span>
              <span className="erp-stat-sub">Official PDF Deliveries</span>
            </div>

            <div className="erp-stat-card">
              <span className="erp-stat-label">FAILED DISPATCHES</span>
              <span
                className="erp-stat-value"
                style={{ color: (overview?.metrics?.failedCount ?? 0) > 0 ? "#dc2626" : "#64748b" }}
              >
                {overview?.metrics?.failedCount ?? 0}
              </span>
              <span className="erp-stat-sub">Ready for retry</span>
            </div>
          </div>

          {/* Recent Live Activity Stream */}
          <div className="erp-panel-card">
            <div className="erp-panel-head" style={{ marginBottom: "16px" }}>
              <div className="erp-panel-title-area">
                <span className="erp-eyebrow">LIVE EVENT LOG</span>
                <h3 style={{ margin: "2px 0", fontSize: "1.2rem", color: "var(--erp-navy)" }}>
                  Recent WhatsApp Activity
                </h3>
              </div>
              <button
                type="button"
                className="erp-btn erp-btn-secondary"
                onClick={() => setTab("messages")}
              >
                View Full Log ({overview?.metrics?.totalMessages ?? 0})
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>RECIPIENT</th>
                    <th>STUDENT / ID</th>
                    <th>TEMPLATE</th>
                    <th>TYPE</th>
                    <th>STATUS</th>
                    <th>DISPATCHED AT</th>
                  </tr>
                </thead>
                <tbody>
                  {overview?.recentMessages?.length > 0 ? (
                    overview.recentMessages.map((m) => (
                      <tr key={m._id}>
                        <td>
                          <strong>{m.recipientPhone}</strong>
                        </td>
                        <td>
                          {m.studentName ? (
                            <div>
                              <span>{m.studentName}</span>
                              {m.registrationNumber && (
                                <div style={{ fontSize: "11px", color: "var(--erp-text-secondary)" }}>
                                  {m.registrationNumber}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "#94a3b8" }}>—</span>
                          )}
                        </td>
                        <td>
                          <code style={{ fontSize: "12px", background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>
                            {m.templateName}
                          </code>
                        </td>
                        <td>
                          <span className="erp-badge">{m.messageType}</span>
                        </td>
                        <td>
                          <span
                            className={`erp-badge ${
                              m.status === "DELIVERED" || m.status === "READ"
                                ? "erp-badge-success"
                                : m.status === "FAILED"
                                  ? "erp-badge-danger"
                                  : "erp-badge-info"
                            }`}
                          >
                            {m.status}
                          </span>
                        </td>
                        <td>{new Date(m.createdAt).toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "28px", color: "#94a3b8" }}>
                        No WhatsApp messages recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* VIEW 2: TEMPLATES REGISTRY */}
      {tab === "templates" && (
        <div className="erp-panel-card">
          <div className="erp-panel-head" style={{ marginBottom: "16px" }}>
            <div className="erp-panel-title-area">
              <span className="erp-eyebrow">APPROVED WHATSAPP BUSINESS TEMPLATES</span>
              <h3 style={{ margin: "2px 0", fontSize: "1.2rem", color: "var(--erp-navy)" }}>
                Registered Template Specifications
              </h3>
            </div>
            <span style={{ fontSize: "13px", color: "#16a34a", fontWeight: 600 }}>
              All 9 Templates Configured in Provider Registry
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
            {templates.map((t) => (
              <div
                key={t.key}
                style={{
                  border: "1.5px solid var(--erp-border)",
                  borderRadius: "12px",
                  padding: "16px",
                  background: "#FAFAFA",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                  <div>
                    <h4 style={{ margin: "0 0 4px", fontSize: "15px", color: "var(--erp-navy)" }}>{t.key}</h4>
                    <code style={{ fontSize: "13px", color: "#0284c7", fontWeight: 600 }}>{t.name}</code>
                  </div>
                  <span className="erp-badge" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                    {t.category}
                  </span>
                </div>

                <p style={{ fontSize: "13px", color: "var(--erp-text-secondary)", margin: "8px 0 12px" }}>
                  {t.description}
                </p>

                <div style={{ fontSize: "12px", color: "#475569", marginBottom: "12px" }}>
                  <strong>Parameters ({t.variableLabels.length}):</strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                    {t.variableLabels.map((v, i) => (
                      <span key={i} style={{ background: "#E2E8F0", padding: "2px 8px", borderRadius: "12px" }}>
                        {`{{${i + 1}}}`} {v}
                      </span>
                    ))}
                  </div>
                </div>

                {t.hasMedia && (
                  <div style={{ fontSize: "12px", color: "#059669", fontWeight: 600, marginBottom: "12px" }}>
                    ✓ Dynamic PDF Document Header Enabled
                  </div>
                )}

                <button
                  type="button"
                  className="erp-btn erp-btn-secondary"
                  style={{ width: "100%", justifyContent: "center", fontSize: "13px" }}
                  onClick={() =>
                    setTestModal({
                      open: true,
                      templateKey: t.key,
                      mobile: "",
                      params: t.variableLabels.map((lbl, idx) => `Sample ${lbl}`),
                    })
                  }
                >
                  <Send size={13} /> Test Send This Template
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 3: MESSAGE HISTORY */}
      {tab === "messages" && (
        <div className="erp-panel-card">
          <div className="erp-panel-head" style={{ marginBottom: "16px" }}>
            <div className="erp-panel-title-area">
              <span className="erp-eyebrow">APITXT DELIVERY REPORTS</span>
              <h3 style={{ margin: "2px 0", fontSize: "1.2rem", color: "var(--erp-navy)" }}>
                Message History & Status Tracking
              </h3>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                placeholder="Search phone or student..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadMessages(1)}
                className="erp-input"
                style={{ padding: "6px 12px", width: "200px" }}
              />
              <select
                value={msgFilterStatus}
                onChange={(e) => {
                  setMsgFilterStatus(e.target.value);
                  loadMessages(1);
                }}
                className="erp-select"
                style={{ padding: "6px 12px" }}
              >
                <option value="">All Statuses</option>
                <option value="SENT">Sent</option>
                <option value="DELIVERED">Delivered</option>
                <option value="READ">Read</option>
                <option value="FAILED">Failed</option>
              </select>
              <button
                type="button"
                className="erp-btn erp-btn-primary"
                onClick={() => loadMessages(1)}
              >
                Search
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>RECIPIENT</th>
                  <th>STUDENT</th>
                  <th>TEMPLATE</th>
                  <th>STATUS</th>
                  <th>REQUEST ID</th>
                  <th>TIMESTAMP</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {messages.length > 0 ? (
                  messages.map((m) => (
                    <tr key={m._id}>
                      <td>
                        <strong>{m.recipientPhone}</strong>
                      </td>
                      <td>
                        {m.studentName ? (
                          <div>
                            <div>{m.studentName}</div>
                            {m.registrationNumber && (
                              <span style={{ fontSize: "11px", color: "var(--erp-text-secondary)" }}>
                                {m.registrationNumber}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>
                      <td>
                        <code>{m.templateName}</code>
                      </td>
                      <td>
                        <span
                          className={`erp-badge ${
                            m.status === "DELIVERED" || m.status === "READ"
                              ? "erp-badge-success"
                              : m.status === "FAILED"
                                ? "erp-badge-danger"
                                : "erp-badge-info"
                          }`}
                        >
                          {m.status}
                        </span>
                        {m.errorMessage && (
                          <div style={{ fontSize: "11px", color: "#dc2626", maxWidth: "200px" }}>
                            {m.errorMessage}
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: "11px", fontFamily: "monospace" }}>
                          {m.providerRequestId || "N/A"}
                        </span>
                      </td>
                      <td>{new Date(m.createdAt).toLocaleString()}</td>
                      <td>
                        {m.status === "FAILED" && (
                          <button
                            type="button"
                            className="erp-btn erp-btn-secondary"
                            style={{ padding: "4px 8px", fontSize: "12px" }}
                            onClick={() => handleRetry(m._id)}
                          >
                            <RotateCw size={12} /> Retry
                          </button>
                        )}
                        {m.mediaUrl && (
                          <a
                            href={m.mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="erp-btn erp-btn-secondary"
                            style={{ padding: "4px 8px", fontSize: "12px", marginLeft: "4px" }}
                          >
                            <ExternalLink size={12} /> PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                      No messages found matching criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {messagesPagination.totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button
                type="button"
                className="erp-btn erp-btn-secondary"
                disabled={messagesPagination.page <= 1}
                onClick={() => loadMessages(messagesPagination.page - 1)}
              >
                Previous
              </button>
              <span style={{ alignSelf: "center", fontSize: "13px" }}>
                Page {messagesPagination.page} of {messagesPagination.totalPages}
              </span>
              <button
                type="button"
                className="erp-btn erp-btn-secondary"
                disabled={messagesPagination.page >= messagesPagination.totalPages}
                onClick={() => loadMessages(messagesPagination.page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* VIEW 4: OTP LOGS */}
      {tab === "otp" && (
        <div className="erp-panel-card">
          <div className="erp-panel-head" style={{ marginBottom: "16px" }}>
            <div className="erp-panel-title-area">
              <span className="erp-eyebrow">SECURITY & VERIFICATION AUDIT</span>
              <h3 style={{ margin: "2px 0", fontSize: "1.2rem", color: "var(--erp-navy)" }}>
                WhatsApp OTP Verification Logs
              </h3>
            </div>
            <button
              type="button"
              className="erp-btn erp-btn-secondary"
              onClick={() => loadOtpLogs(1)}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>MOBILE</th>
                  <th>VERIFICATION STATUS</th>
                  <th>ATTEMPTS</th>
                  <th>SENT AT</th>
                  <th>EXPIRES AT</th>
                  <th>REQUEST ID</th>
                </tr>
              </thead>
              <tbody>
                {otpLogs.length > 0 ? (
                  otpLogs.map((c) => (
                    <tr key={c._id}>
                      <td>
                        <strong>{c.mobile}</strong>
                      </td>
                      <td>
                        {c.verified ? (
                          <span className="erp-badge erp-badge-success">
                            ✓ Verified ({new Date(c.verifiedAt).toLocaleTimeString()})
                          </span>
                        ) : new Date(c.expiresAt) < new Date() ? (
                          <span className="erp-badge erp-badge-secondary">Expired</span>
                        ) : (
                          <span className="erp-badge erp-badge-warning">Pending Code Entry</span>
                        )}
                      </td>
                      <td>{c.attempts} / 5</td>
                      <td>{new Date(c.createdAt).toLocaleString()}</td>
                      <td>{new Date(c.expiresAt).toLocaleTimeString()}</td>
                      <td>
                        <span style={{ fontSize: "11px", fontFamily: "monospace" }}>
                          {c.providerRequestId || "—"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                      No OTP challenges recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 5: BULK CAMPAIGNS */}
      {tab === "bulk" && (
        <div className="erp-panel-card">
          <div className="erp-panel-head" style={{ marginBottom: "16px" }}>
            <div className="erp-panel-title-area">
              <span className="erp-eyebrow">MASS BROADCAST</span>
              <h3 style={{ margin: "2px 0", fontSize: "1.2rem", color: "var(--erp-navy)" }}>
                Bulk WhatsApp Campaign Manager
              </h3>
            </div>
          </div>

          <div style={{ maxWidth: "600px", margin: "0 auto" }}>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                Target Recipient Group
              </label>
              <select
                className="erp-select"
                value={bulkAudience}
                onChange={(e) => setBulkAudience(e.target.value)}
                style={{ width: "100%", padding: "8px 12px" }}
              >
                <option value="all_confirmed">All Confirmed Participants</option>
                <option value="class_wise">Class-wise Participants</option>
                <option value="attendance_present">Students Who Attended Exam</option>
              </select>
            </div>

            {bulkAudience === "class_wise" && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                  Select Class
                </label>
                <select
                  className="erp-select"
                  value={bulkClass}
                  onChange={(e) => setBulkClass(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px" }}
                >
                  {["2", "3", "4", "5", "6", "7", "8", "9", "10", "11"].map((c) => (
                    <option key={c} value={c}>
                      Class {c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                WhatsApp Template to Dispatch
              </label>
              <select
                className="erp-select"
                value={bulkTemplate}
                onChange={(e) => setBulkTemplate(e.target.value)}
                style={{ width: "100%", padding: "8px 12px" }}
              >
                <option value="PAYMENT_RECEIVED">shree_payment_received (Payment Submission - APPROVED)</option>
                <option value="ADMIT_CARD">shree_olympiad_admit_card (Admit Card PDF Document - APPROVED)</option>
                <option value="PARTICIPATION_CERTIFICATE">shree_student_certificates_flow (Certificate Delivery - APPROVED)</option>
                <option value="EXAM_REMINDER">shree_exam_reminder (Exam Schedule & Reporting)</option>
                <option value="TOPPER_CERTIFICATE">shree_topper_certificate (Merit Award PDF)</option>
              </select>
            </div>

            <div
              style={{
                background: "#F8FAFC",
                border: "1px solid var(--erp-border)",
                borderRadius: "8px",
                padding: "14px",
                marginBottom: "20px",
                fontSize: "13px",
                color: "#475569",
              }}
            >
              <strong>Campaign Safeguards:</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: "20px" }}>
                <li>Messages are paced with a 50ms interval to prevent provider rate spikes.</li>
                <li>Delivery reports and read receipts are tracked live via webhooks.</li>
                <li>Duplicate prevention guarantees one message per recipient.</li>
              </ul>
            </div>

            {bulkResult && (
              <div
                style={{
                  background: "#ECFDF5",
                  border: "1px solid #A7F3D0",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "20px",
                  color: "#065F46",
                }}
              >
                <strong>Campaign Started!</strong> {bulkResult.message}
              </div>
            )}

            <button
              type="button"
              className="erp-btn erp-btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "12px" }}
              disabled={bulkSending}
              onClick={handleStartBulk}
            >
              <Send size={16} />
              {bulkSending ? "Initiating Campaign..." : "Start WhatsApp Broadcast"}
            </button>
          </div>
        </div>
      )}

      {/* VIEW 6: DIAGNOSTICS & GATEWAY */}
      {tab === "diagnostics" && (
        <div className="erp-panel-card">
          <div className="erp-panel-head" style={{ marginBottom: "16px" }}>
            <div className="erp-panel-title-area">
              <span className="erp-eyebrow">SYSTEM HEALTH</span>
              <h3 style={{ margin: "2px 0", fontSize: "1.2rem", color: "var(--erp-navy)" }}>
                APITxT Gateway Diagnostics
              </h3>
            </div>
            <button
              type="button"
              className="erp-btn erp-btn-secondary"
              onClick={loadDiagnostics}
            >
              <RefreshCw size={14} /> Run Check
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div style={{ border: "1px solid var(--erp-border)", borderRadius: "8px", padding: "18px" }}>
              <h4 style={{ margin: "0 0 12px", color: "var(--erp-navy)" }}>Provider Connection Status</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
                <div>
                  <strong>Provider:</strong> APITxT (Official API Gateway)
                </div>
                <div>
                  <strong>Base URL:</strong> <code>{diagnostics?.baseUrl}</code>
                </div>
                <div>
                  <strong>Auth Key:</strong>{" "}
                  <span style={{ color: diagnostics?.authKeyConfigured ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                    {diagnostics?.authKeyPreview}
                  </span>
                </div>
                <div>
                  <strong>Endpoint Ping:</strong>{" "}
                  <span style={{ color: diagnostics?.endpointReachability?.success ? "#16a34a" : "#dc2626" }}>
                    {diagnostics?.endpointReachability?.message}
                  </span>
                </div>
                <div>
                  <strong>Overall Status:</strong>{" "}
                  <span className={`erp-badge ${diagnostics?.configured ? "erp-badge-success" : "erp-badge-danger"}`}>
                    {diagnostics?.status}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ border: "1px solid var(--erp-border)", borderRadius: "8px", padding: "18px" }}>
              <h4 style={{ margin: "0 0 12px", color: "var(--erp-navy)" }}>Webhook Configuration Guide</h4>
              <p style={{ fontSize: "13px", color: "var(--erp-text-secondary)", lineHeight: 1.5 }}>
                In the APITxT Dashboard, set your real-time WhatsApp Delivery Report Webhook URL to:
              </p>
              <div
                style={{
                  background: "#F1F5F9",
                  padding: "10px 14px",
                  borderRadius: "6px",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  wordBreak: "break-all",
                  marginBottom: "12px",
                }}
              >
                https://shreeolympiad.srpskanhra.com/api/whatsapp/apitxt/webhook
              </div>
              <p style={{ fontSize: "12px", color: "#64748B" }}>
                Delivery reports (`sent`, `delivered`, `read`, `failed`) are ingested automatically and update the admin metrics in real time.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TEST SEND MODAL */}
      {testModal.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5, 39, 66, 0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "14px",
              padding: "24px",
              maxWidth: "480px",
              width: "90%",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ margin: "0 0 14px", color: "var(--erp-navy)" }}>
              Test WhatsApp Template: {testModal.templateKey}
            </h3>

            <form onSubmit={handleSendTest}>
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
                  Recipient Mobile Number (10 digits)
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 9812345678"
                  value={testModal.mobile}
                  onChange={(e) => setTestModal((prev) => ({ ...prev, mobile: e.target.value }))}
                  className="erp-input"
                  style={{ width: "100%", padding: "8px 12px" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button
                  type="button"
                  className="erp-btn erp-btn-secondary"
                  onClick={() => setTestModal((prev) => ({ ...prev, open: false }))}
                  disabled={testSending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="erp-btn erp-btn-primary"
                  disabled={testSending}
                >
                  {testSending ? "Sending..." : "Send Test WhatsApp"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
export default WhatsAppCenter;
