import { AttendanceRecords } from "./AttendanceRecords.jsx";
import { AdminRecords } from "./AdminRecords.jsx";
import { notify } from "./notifications.js";
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Wallet,
  ClipboardCheck,
  Settings,
  LogOut,
  Download,
  Search,
  Check,
  X,
  RefreshCcw,
  ShieldCheck,
  ScanLine,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { api, downloadBlob, img } from "./api.js";
import { PortalEditor } from "./PortalEditor.jsx";
const sections = [
  ["dashboard", "Overview", LayoutDashboard],
  ["registrations", "Registrations", Users],
  ["payments", "Payment review", Wallet],
  ["settings", "Event settings", Settings],
  ["checkin", "Exam check-in", ScanLine],
];
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
              : "Student has been marked present."}
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
  const [me, setMe] = useState(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [active, setActive] = useState("dashboard"),
    [stats, setStats] = useState(null),
    [settings, setSettings] = useState(null),
    [token, setToken] = useState(""),
    [scanResult, setScanResult] = useState(null),
    [scanner, setScanner] = useState(null),
    scannerRef = useRef(null),
    [scannerState, setScannerState] = useState("idle"),
    [busy, setBusy] = useState(false);
  const [recordsRefresh, setRecordsRefresh] = useState(0);
  const scanLock = useRef(false);
  const loadVersion = useRef(0);
  async function run(fn) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify.error(e.message);
      if (e.status === 401) setMe(null);
    } finally {
      setBusy(false);
    }
  }
  const load = async () => {
    const version = ++loadVersion.current;
    if (active === "registrations" || active === "payments") {
      setRecordsRefresh((value) => value + 1);
      return;
    }
    if (active === "checkin") {
      await loadAttendance();
      return;
    }
    const { data } = await api.get(
      active === "settings" ? "/admin/settings" : "/admin/dashboard",
    );
    if (version !== loadVersion.current) return;
    if (active === "settings") setSettings(data);
    else setStats(data);
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
      !!me && ["SUPER_ADMIN", "ADMIN", "PAYMENT_VERIFIER"].includes(me.role),
    canSet = !!me && ["SUPER_ADMIN", "ADMIN"].includes(me.role),
    canExam =
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
      notify.success("Event settings saved.");
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
        () => {},
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
        "Camera could not start. Allow camera access and use HTTPS or localhost.",
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
        "QR image could not be read. Use a clear, well-lit admit card image.",
      );
    } finally {
      try {
        imageScanner.clear();
      } catch {}
      setScannerState("idle");
    }
  };
  if (!me)
    return (
      <main className="admin-login shell">
        <div className="login-box">
          <img src={img("school-logo.png")} alt="School logo" />
          <span className="eyebrow">AUTHORIZED SCHOOL STAFF</span>
          <h1>Admin Login</h1>
          <p>Secure administration of Olympiad registrations and payments.</p>
          <form onSubmit={login}>
            <label>
              <span>Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@school.example"
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
              />
            </label>
            <button disabled={busy} className="btn primary wide">
              {busy ? "Signing in..." : "Sign in securely"}
            </button>
          </form>
          <Link to="/">Back to website</Link>
        </div>
      </main>
    );
  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" to="/">
          <img src={img("school-logo.png")} />
          <strong>
            SHREE 2027
            <br />
            OLYMPIAD
          </strong>
        </Link>
        <small>ADMINISTRATOR PORTAL</small>
        {sections
          .filter(([id]) => id !== "settings" || canSet)
          .map(([id, label, Icon]) => (
            <button
              key={id}
              className={active === id ? "selected" : ""}
              onClick={() => setActive(id)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        <button className="logout" onClick={logout}>
          <LogOut size={18} />
          Log out
        </button>
      </aside>
      <section className="admin-content">
        <div className="admin-top">
          <div>
            <span className="eyebrow">SHREE RAM PUBLIC SCHOOL</span>
            <h1>{sections.find(([id]) => id === active)?.[1]}</h1>
            <p>
              {me.email} · {me.role.replaceAll("_", " ")}
            </p>
          </div>
          <button
            className="btn light"
            onClick={() => run(load)}
            disabled={busy}
          >
            <RefreshCcw size={16} /> Refresh
          </button>
        </div>
        {active === "dashboard" && stats && (
          <>
            <div className="metrics">
              {[
                ["Total applications", stats.total, Users],
                ["Confirmed", stats.confirmed, ClipboardCheck],
                ["Pending applications", stats.pending, LayoutDashboard],
                ["Manual reviews", stats.review, Wallet],
                ["Verified revenue", `₹${stats.revenue}`, Wallet],
              ].map(([label, num, Icon]) => (
                <div className="metric" key={label}>
                  <Icon />
                  <span>{label}</span>
                  <strong>{num}</strong>
                </div>
              ))}
            </div>
            <div className="dashboard-panel">
              <div>
                <h2>Class-wise confirmed registrations</h2>
                {stats.classes.length ? (
                  stats.classes.map((s) => (
                    <div className="bar-row" key={s._id}>
                      <span>Class {s._id}</span>
                      <div>
                        <i
                          style={{
                            width: `${Math.max(4, (s.count / stats.confirmed) * 100)}%`,
                          }}
                        />
                      </div>
                      <strong>{s.count}</strong>
                    </div>
                  ))
                ) : (
                  <p>Confirmed registration data will appear here.</p>
                )}
              </div>
              <img src={img("admin.webp")} alt="Admin dashboard illustration" />
            </div>
          </>
        )}
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
        {active === "settings" && canSet && settings && (
          <div className="admin-panel settings-panel">
            <h2>Event configuration</h2>
            <PortalEditor
              settings={settings}
              onSaved={(data) => setSettings((prev) => ({ ...prev, ...data }))}
            />
            <p>
              Registrations start closed. Configure real payment and OTP
              credentials before enabling registration.
            </p>
            <div className="form-grid">
              {[
                ["fee", "Registration fee (₹)", "number"],
                ["examDate", "Exam date / label"],
                ["reportingTime", "Reporting time"],
                ["examTime", "Exam time"],
                ["venue", "Venue"],
                ["upiId", "Official school UPI ID"],
                ["payeeName", "Official payee name"],
                ["contactPhone", "School phone"],
                ["contactEmail", "School email", "email"],
              ].map(([key, label, type = "text"]) => (
                <label key={key}>
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
              <label>
                <span>Payment method</span>
                <select
                  value={settings.paymentMode}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, paymentMode: e.target.value }))
                  }
                >
                  <option value="manual">
                    Manual UPI & receipt verification
                  </option>
                  <option value="razorpay">Razorpay verified gateway</option>
                </select>
              </label>
            </div>
            {[
              ["terms", "Terms and guardian consent"],
              ["privacy", "Privacy statement"],
              ["refund", "Refund policy"],
            ].map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <textarea
                  rows={4}
                  value={settings[key] || ""}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
            <label className="checkline">
              <input
                type="checkbox"
                checked={settings.registrationOpen}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    registrationOpen: e.target.checked,
                  }))
                }
              />
              <span>
                <strong>Open registration to the public</strong> (only after all
                required configuration is complete)
              </span>
            </label>
            <button
              className="btn primary"
              disabled={busy}
              onClick={saveSettings}
            >
              Save settings
            </button>
          </div>
        )}
        {active === "checkin" && (
          <div className="admin-panel exam-checkin-panel">
            <div className="form-head">
              <ScanLine />
              <div>
                <h2>Scan admit card QR</h2>
                <p>
                  Use the camera to scan a confirmed student&apos;s admit card.
                  Attendance is marked automatically.
                </p>
              </div>
            </div>
            {canExam ? (
              <>
                <div id="admin-qr-reader" className="qr-reader" />
                <div className="scanner-actions">
                  <button
                    className="btn primary"
                    onClick={startScanner}
                    disabled={
                      busy ||
                      scannerState === "starting" ||
                      scannerState === "running"
                    }
                  >
                    {scannerState === "starting"
                      ? "Starting camera..."
                      : scannerState === "running"
                        ? "Camera active"
                        : "Start camera"}
                  </button>
                  {scanner && (
                    <button
                      className="btn light scanner-stop"
                      onClick={stopScanner}
                    >
                      Stop camera
                    </button>
                  )}
                  <label className="btn light scan-image-button">
                    Scan image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={scanImage}
                      disabled={busy || scannerState !== "idle"}
                      aria-label="Scan admit card image"
                    />
                  </label>
                </div>
                <p className="scanner-help">
                  Allow camera access when your browser asks. Point the camera
                  at the QR code printed on the admit card.
                </p>
                <AttendanceRecords
                  refreshKey={recordsRefresh}
                  canEdit={canSet}
                  onUnauthorized={() => setMe(null)}
                  onChanged={() => setScanResult(null)}
                />
              </>
            ) : (
              <p>Exam Coordinator role required.</p>
            )}
          </div>
        )}
      </section>
      <CheckInResultDialog
        result={scanResult}
        onClose={() => setScanResult(null)}
      />
    </main>
  );
}
