import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ScanLine,
  RefreshCcw,
  Loader2,
  Lock,
  Mail,
  Check,
  X,
  Users,
  AlertTriangle,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { api, downloadBlob, img } from "./api.js";
import { notify } from "./notifications.js";
import { AdminLayout } from "./admin/AdminLayout.jsx";
import { DashboardOverview } from "./admin/DashboardOverview.jsx";
import { ReminderCenterView } from "./admin/ReminderCenterView.jsx";
import { AdmitCardView } from "./admin/AdmitCardView.jsx";
import { ReportsView } from "./admin/ReportsView.jsx";
import { DuplicateAuditView } from "./admin/DuplicateAuditView.jsx";
import { AdminRecords } from "./AdminRecords.jsx";
import { PaymentRecoveryDashboard } from "./PaymentRecoveryDashboard.jsx";
import { PortalEditor } from "./PortalEditor.jsx";
import { AttendanceRecords } from "./AttendanceRecords.jsx";
import { StudentDetailModal } from "./StudentDetailModal.jsx";
import "./admin/admin-theme.css";

const sectionTitles = {
  dashboard: "Overview",
  registrations: "Manage Registrations",
  payments: "Payment Review",
  recovery: "Incomplete Applications",
  reminders: "Email Reminder Center",
  admit_cards: "Admit Card Management",
  checkin: "Exam Check-in",
  settings: "Event Settings",
  duplicates: "Suspected Duplicates",
  reports: "Reports & Exports",
};

function CheckInResultDialog({ result, onClose }) {
  const dialogRef = useRef(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const registration = result?.registration;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (result && dialog && !dialog.open) dialog.showModal();
    else if (!result && dialog?.open) dialog.close();
  }, [result]);

  useEffect(() => {
    if (!result || photoLoading) return;
    const timeout = window.setTimeout(() => dialogRef.current?.close(), 2000);
    return () => window.clearTimeout(timeout);
  }, [result, photoLoading]);

  useEffect(() => {
    if (!registration?.id) return;
    let active = true;
    let url;
    setPhotoUrl("");
    setPhotoLoading(true);
    api
      .get(`/admin/check-in/${registration.id}/photo`, {
        responseType: "blob",
      })
      .then(({ data }) => {
        url = URL.createObjectURL(data);
        if (active) setPhotoUrl(url);
        else URL.revokeObjectURL(url);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setPhotoLoading(false);
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [registration?.id]);

  return (
    <dialog
      ref={dialogRef}
      className={`checkin-result-dialog ${result?.alreadyCheckedIn ? "is-duplicate" : "is-present"}`}
      aria-labelledby="checkin-result-title"
      onClose={onClose}
    >
      {registration && (
        <div
          className={`checkin-result-content ${result.alreadyCheckedIn ? "is-duplicate" : "is-present"}`}
        >
          <button
            type="button"
            className="checkin-result-close"
            aria-label="Close check-in result"
            onClick={() => dialogRef.current?.close()}
            autoFocus
          >
            <X size={18} />
          </button>
          <div className="checkin-result-photo">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={`${registration.studentName} student photo`}
              />
            ) : (
              <Users size={38} aria-hidden="true" />
            )}
            {photoLoading && <span>Loading photo</span>}
          </div>
          <span className="checkin-result-status">
            {result.alreadyCheckedIn ? "ALREADY SCANNED" : "PRESENT"}
            {result.alreadyCheckedIn ? (
              <X size={17} aria-hidden="true" />
            ) : (
              <Check size={17} aria-hidden="true" />
            )}
          </span>
          <h2 id="checkin-result-title">
            {result.alreadyCheckedIn
              ? "Attendance already recorded"
              : "Attendance confirmed"}
          </h2>
          <p className="checkin-result-name">{registration.studentName}</p>
          <div className="checkin-result-details">
            <span>Class {registration.studentClass}</span>
            <strong>{registration.registrationNumber}</strong>
          </div>
          <p className="checkin-result-message">
            {result.alreadyCheckedIn
              ? "This admit card was scanned earlier. No duplicate check-in was added."
              : "Student marked present! Participation certificate will be automatically emailed 4 hours after check-in."}
          </p>
          <button
            type="button"
            className="btn primary checkin-result-done"
            onClick={() => dialogRef.current?.close()}
          >
            Done
          </button>
        </div>
      )}
    </dialog>
  );
}

export function Admin() {
  const [me, setMe] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState("dashboard");
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(null);
  const [token, setToken] = useState("");
  const [scanResult, setScanResult] = useState(null);
  const [scanner, setScanner] = useState(null);
  const scannerRef = useRef(null);
  const [scannerState, setScannerState] = useState("idle");
  const [busy, setBusy] = useState(false);
  const [recordsRefresh, setRecordsRefresh] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudentDetail, setSelectedStudentDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const scanLock = useRef(false);
  const loadVersion = useRef(0);

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  const load = async () => {
    const version = ++loadVersion.current;
    if (
      active === "registrations" ||
      active === "payments" ||
      active === "duplicates" ||
      active === "recovery" ||
      active === "reminders" ||
      active === "admit_cards" ||
      active === "reports"
    ) {
      setRecordsRefresh((value) => value + 1);
    }
    if (active === "checkin") {
      await loadAttendance();
      return;
    }
    try {
      const { data } = await api.get(
        active === "settings" ? "/admin/settings" : "/admin/dashboard"
      );
      if (version !== loadVersion.current) return;
      if (active === "settings") setSettings(data);
      else setStats(data);
    } catch (e) {
      // safe fallback
    }
  };

  useEffect(() => {
    api
      .get("/admin/me")
      .then((r) => {
        setMe(r.data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (me) load().catch((e) => notify.error(e.message));
  }, [me, active]);

  const loadAttendance = async () => {
    setRecordsRefresh((value) => value + 1);
  };

  const canPay =
    !!me && ["SUPER_ADMIN", "ADMIN", "PAYMENT_VERIFIER"].includes(me.role);
  const canSet = !!me && ["SUPER_ADMIN", "ADMIN"].includes(me.role);
  const canExam =
    !!me && ["SUPER_ADMIN", "ADMIN", "EXAM_COORDINATOR"].includes(me.role);

  useEffect(() => {
    return () => {
      const activeScanner = scannerRef.current;
      scannerRef.current = null;
      setScanner(null);
      setScannerState("idle");
      if (activeScanner) {
        activeScanner
          .stop()
          .catch(() => {})
          .finally(() => {
            try {
              activeScanner.clear();
            } catch {}
          });
      }
    };
  }, [active, me]);

  async function login(e) {
    e.preventDefault();
    await run(async () => {
      const r = await api.post("/admin/login", { email, password });
      setMe(r.data);
      setPassword("");
    });
  }

  async function logout() {
    await run(async () => {
      await api.post("/admin/logout");
      setMe(null);
      setActive("dashboard");
    });
  }

  const pdf = (id) =>
    run(async () => {
      const r = await api.get(`/admin/admit-card/${id}`, {
        responseType: "blob",
      });
      downloadBlob(r.data, `admit-${id}.pdf`);
    });

  const saveSettings = () =>
    run(async () => {
      const payload = {
        registrationOpen: settings.registrationOpen,
        fee: Number(settings.fee),
        certificateDelayHours: Number(settings.certificateDelayHours ?? 4),
        examDate: settings.examDate,
        reportingTime: settings.reportingTime,
        examTime: settings.examTime,
        venue: settings.venue,
        paymentMode: settings.paymentMode,
        upiId: settings.upiId,
        payeeName: settings.payeeName,
        contactPhone: settings.contactPhone,
        contactEmail: settings.contactEmail,
        terms: settings.terms,
        privacy: settings.privacy,
        refund: settings.refund,
      };
      const r = await api.patch("/admin/settings", payload);
      setSettings(r.data);
      notify.success("Event settings saved successfully.");
    });

  const checkIn = (value = token) =>
    run(async () => {
      const r = await api.post("/admin/check-in", { token: value.trim() });
      setScanResult({
        registration: r.data.registration,
        alreadyCheckedIn: r.data.alreadyCheckedIn,
      });
      setToken("");
      await loadAttendance();
    });

  const startScanner = async () => {
    if (scannerRef.current || scannerState !== "idle") return;
    setScannerState("starting");
    const camera = new Html5Qrcode("admin-qr-reader");
    scannerRef.current = camera;
    setScanner(camera);
    try {
      await camera.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (scanLock.current || scannerRef.current !== camera) return;
          scanLock.current = true;
          try {
            const match = decodedText.match(/\/api\/verify\/([^/?#]+)/);
            const scannedToken = match
              ? decodeURIComponent(match[1])
              : decodedText.trim();
            if (scannedToken.length < 20) {
              notify.error("This QR code is not a Shree Olympiad admit card.");
              return;
            }
            await camera.stop().catch(() => {});
            try {
              camera.clear();
            } catch {}
            scannerRef.current = null;
            setScanner(null);
            setScannerState("idle");
            setToken(scannedToken);
            await checkIn(scannedToken);
          } finally {
            scanLock.current = false;
          }
        },
        () => {}
      );
      if (scannerRef.current !== camera) {
        await camera.stop().catch(() => {});
        try {
          camera.clear();
        } catch {}
        return;
      }
      setScannerState("running");
    } catch (e) {
      scannerRef.current = null;
      try {
        camera.clear();
      } catch {}
      setScanner(null);
      setScannerState("idle");
      notify.error(
        "Camera could not start. Allow camera access and use HTTPS or localhost."
      );
    }
  };

  const stopScanner = async () => {
    const activeScanner = scannerRef.current;
    scannerRef.current = null;
    if (!activeScanner) return;
    await activeScanner.stop().catch(() => {});
    try {
      activeScanner.clear();
    } catch {}
    setScanner(null);
    setScannerState("idle");
  };

  const scanImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || scannerRef.current || scannerState !== "idle") return;
    setScannerState("starting");
    const imageScanner = new Html5Qrcode("admin-qr-reader");
    try {
      const decodedText = await imageScanner.scanFile(file, true);
      const match = decodedText.match(/\/api\/verify\/([^/?#]+)/);
      const scannedToken = match
        ? decodeURIComponent(match[1])
        : decodedText.trim();
      if (scannedToken.length < 20) throw new Error("invalid");
      setToken(scannedToken);
      await checkIn(scannedToken);
    } catch {
      notify.error(
        "QR image could not be read. Use a clear, well-lit admit card image."
      );
    } finally {
      try {
        imageScanner.clear();
      } catch {}
      setScannerState("idle");
    }
  };

  const viewStudentDetail = async (id) => {
    setDetailLoading(true);
    try {
      const { data: detail } = await api.get(`/admin/registrations/${id}/history`);
      setSelectedStudentDetail(detail);
    } catch (err) {
      notify.error(err.message || "Failed to load student history.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleGlobalSearch = (query) => {
    if (query) {
      setActive("registrations");
    }
  };

  // 1. Soft 3D Admin Login Screen
  if (!me) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--erp-app-bg)",
          padding: "20px",
          fontFamily: "inherit",
        }}
      >
        <div
          style={{
            maxWidth: "460px",
            width: "100%",
            background: "var(--erp-surface-raised)",
            borderRadius: "var(--erp-radius-card)",
            padding: "40px 36px",
            boxShadow: "var(--erp-shadow-card)",
            border: "1px solid var(--erp-border-light)",
            textAlign: "center",
          }}
        >
          <img
            src={img("school-logo.png")}
            alt="Shree Ram Public School logo"
            style={{
              width: "72px",
              height: "72px",
              objectFit: "contain",
              margin: "0 auto 16px",
              filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.08))",
            }}
          />

          <span className="erp-eyebrow" style={{ display: "block", marginBottom: "6px" }}>
            AUTHORIZED SCHOOL ERP STAFF
          </span>
          <h1
            style={{
              fontSize: "1.9rem",
              fontWeight: 800,
              color: "var(--erp-navy)",
              margin: "0 0 6px",
              letterSpacing: "-0.02em",
            }}
          >
            Admin ERP Login
          </h1>
          <p
            style={{
              fontSize: "0.86rem",
              color: "var(--erp-text-secondary)",
              margin: "0 0 28px",
            }}
          >
            Secure administration of Olympiad candidates, payments, and admit cards.
          </p>

          <form onSubmit={login} style={{ display: "flex", flexDirection: "column", gap: "16px", textAlign: "left" }}>
            <label className="crud-form-field">
              <span>Admin Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="srpskanhra2012@gmail.com"
                style={{
                  background: "#FFFFFF",
                  padding: "12px 14px",
                  borderRadius: "var(--erp-radius-input)",
                }}
              />
            </label>

            <label className="crud-form-field">
              <span>Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                style={{
                  background: "#FFFFFF",
                  padding: "12px 14px",
                  borderRadius: "var(--erp-radius-input)",
                }}
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="erp-btn-cta"
              style={{
                width: "100%",
                padding: "14px",
                justifyContent: "center",
                marginTop: "10px",
                fontSize: "0.94rem",
              }}
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="admin-spin" /> Signing in securely…
                </>
              ) : (
                "Sign In to ERP Dashboard"
              )}
            </button>
          </form>

          <div style={{ marginTop: "24px" }}>
            <Link
              to="/"
              style={{
                fontSize: "0.82rem",
                color: "var(--erp-sky-deep)",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              ← Back to Olympiad Website
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // 2. Logged-in Enterprise Soft 3D ERP Interface
  return (
    <AdminLayout
      active={active}
      onSelectSection={setActive}
      activeTitle={sectionTitles[active] || "Workspace"}
      canPay={canPay}
      canExam={canExam}
      canSet={canSet}
      me={me}
      onLogout={logout}
      stats={stats}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onSearchSubmit={handleGlobalSearch}
    >
      {/* SECTION 1: Overview */}
      {active === "dashboard" && (
        <DashboardOverview
          stats={stats}
          onRefresh={() => run(load)}
          loading={busy}
          onNavigate={setActive}
          onViewStudent={viewStudentDetail}
        />
      )}

      {/* SECTION 2: Incomplete Applications / Recovery */}
      {active === "recovery" && (
        <PaymentRecoveryDashboard
          canPay={canPay}
          refreshKey={recordsRefresh}
        />
      )}

      {/* SECTION 3: Registrations & Payments Tables */}
      {["registrations", "payments"].includes(active) && (
        <AdminRecords
          key={active}
          kind={active}
          refreshKey={recordsRefresh}
          canPay={canPay}
          canExam={canExam}
          onUnauthorized={() => setMe(null)}
          onPdf={pdf}
        />
      )}

      {/* SECTION 4: Email Reminder Center */}
      {active === "reminders" && (
        <ReminderCenterView
          canSet={canSet}
          onNavigateToRecovery={() => setActive("recovery")}
          refreshKey={recordsRefresh}
        />
      )}

      {/* SECTION 5: Admit Card Management */}
      {active === "admit_cards" && (
        <AdmitCardView
          canExam={canExam}
          onPdfDownload={pdf}
          stats={stats}
        />
      )}

      {/* SECTION 6: Suspected Duplicates */}
      {active === "duplicates" && (
        <DuplicateAuditView
          canAdmin={canSet}
          refreshKey={recordsRefresh}
        />
      )}

      {/* SECTION 7: Reports & Exports */}
      {active === "reports" && <ReportsView stats={stats} />}

      {/* SECTION 8: Event Settings */}
      {active === "settings" && canSet && settings && (
        <div className="erp-panel-card">
          <div className="erp-panel-head" style={{ marginBottom: "20px" }}>
            <div className="erp-panel-title-area">
              <span className="erp-eyebrow">PORTAL & EXAMINATION RULES</span>
              <h2 style={{ fontSize: "1.8rem", color: "var(--erp-navy)", margin: "4px 0" }}>
                Event Configuration
              </h2>
              <p>Configure fee, venue, schedule, and public Olympiad syllabus/information.</p>
            </div>
          </div>

          <PortalEditor
            settings={settings}
            onSaved={(data) => setSettings((prev) => ({ ...prev, ...data }))}
          />

          <div
            style={{
              marginTop: "26px",
              paddingTop: "24px",
              borderTop: "1px solid var(--erp-border)",
            }}
          >
            <h3 style={{ fontSize: "1.2rem", color: "var(--erp-navy)", marginBottom: "16px" }}>
              Logistics & Financial Settings
            </h3>
            <div className="crud-form-grid" style={{ marginBottom: "20px" }}>
              {[
                ["fee", "Registration Fee (₹)", "number"],
                ["certificateDelayHours", "Certificate Issue Delay (Hours after check-in)", "number"],
                ["examDate", "Exam Date / Label"],
                ["reportingTime", "Reporting Time"],
                ["examTime", "Exam Time"],
                ["venue", "Venue"],
                ["upiId", "Official School UPI ID"],
                ["payeeName", "Official Payee Name"],
                ["contactPhone", "School Phone"],
                ["contactEmail", "School Email", "email"],
              ].map(([key, label, type = "text"]) => (
                <label key={key} className="crud-form-field">
                  <span>{label}</span>
                  <input
                    type={type}
                    value={settings[key] ?? ""}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, [key]: e.target.value }))
                    }
                  />
                </label>
              ))}

              <label className="crud-form-field">
                <span>Payment Mode</span>
                <select
                  value={settings.paymentMode}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, paymentMode: e.target.value }))
                  }
                >
                  <option value="manual">Manual UPI & Receipt Verification</option>
                  <option value="razorpay">Razorpay Verified Gateway (Instant)</option>
                  <option value="both">Both (Student Chooses Online or Manual QR)</option>
                </select>
              </label>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>
              {[
                ["terms", "Terms and Guardian Consent"],
                ["privacy", "Privacy Statement"],
                ["refund", "Refund Policy"],
              ].map(([key, label]) => (
                <label key={key} className="crud-form-field">
                  <span>{label}</span>
                  <textarea
                    rows={3}
                    value={settings[key] || ""}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, [key]: e.target.value }))
                    }
                  />
                </label>
              ))}
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                background: "var(--erp-surface-soft)",
                padding: "14px 18px",
                borderRadius: "var(--erp-radius-button)",
                border: "1px solid var(--erp-border)",
                marginBottom: "24px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={settings.registrationOpen}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    registrationOpen: e.target.checked,
                  }))
                }
                style={{ width: "18px", height: "18px" }}
              />
              <span style={{ fontSize: "0.88rem", color: "var(--erp-navy)", fontWeight: 700 }}>
                Open registration to the public (only after all required configuration is complete)
              </span>
            </label>

            <button
              type="button"
              className="erp-btn-cta"
              disabled={busy}
              onClick={saveSettings}
            >
              {busy ? "Saving Settings…" : "Save Event Settings"}
            </button>
          </div>
        </div>
      )}

      {/* SECTION 9: Exam Check-in & Scanner */}
      {active === "checkin" && (
        <div className="erp-panel-card">
          <div className="erp-panel-head" style={{ marginBottom: "20px" }}>
            <div className="erp-panel-title-area">
              <span className="erp-eyebrow">BARCODE & QR ATTENDANCE</span>
              <h2 style={{ fontSize: "1.8rem", color: "var(--erp-navy)", margin: "4px 0" }}>
                Scan Admit Card QR
              </h2>
              <p>
                Use device camera or image upload to scan a confirmed candidate's admit card.
                Attendance is marked automatically in real-time.
              </p>
            </div>
          </div>

          {canExam ? (
            <>
              <div
                id="admin-qr-reader"
                style={{
                  maxWidth: "420px",
                  margin: "0 auto 20px",
                  borderRadius: "var(--erp-radius-card-sm)",
                  overflow: "hidden",
                }}
              />
              <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginBottom: "20px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="erp-btn-cta"
                  onClick={startScanner}
                  disabled={
                    busy ||
                    scannerState === "starting" ||
                    scannerState === "running"
                  }
                >
                  <ScanLine size={16} />
                  <span>
                    {scannerState === "starting"
                      ? "Starting camera…"
                      : scannerState === "running"
                        ? "Camera Active"
                        : "Start Camera"}
                  </span>
                </button>
                {scanner && (
                  <button
                    type="button"
                    className="erp-btn-soft"
                    onClick={stopScanner}
                  >
                    Stop Camera
                  </button>
                )}
                <label className="erp-btn-soft" style={{ cursor: "pointer" }}>
                  <span>Scan Image File</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={scanImage}
                    disabled={busy || scannerState !== "idle"}
                    style={{ display: "none" }}
                  />
                </label>
              </div>

              <AttendanceRecords
                refreshKey={recordsRefresh}
                canEdit={canSet}
                delayHours={settings?.certificateDelayHours}
                onUnauthorized={() => setMe(null)}
                onChanged={() => setScanResult(null)}
              />
            </>
          ) : (
            <p style={{ color: "var(--erp-text-muted)" }}>Exam Coordinator role required.</p>
          )}
        </div>
      )}

      {/* Modals & Dialogs */}
      <CheckInResultDialog
        result={scanResult}
        onClose={() => setScanResult(null)}
      />

      <StudentDetailModal
        selectedStudentDetail={selectedStudentDetail}
        onClose={() => setSelectedStudentDetail(null)}
        canPay={canPay}
        onRefresh={() => setRecordsRefresh((r) => r + 1)}
      />
    </AdminLayout>
  );
}
