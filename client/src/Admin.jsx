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
const sections = [
  ["dashboard", "Overview", LayoutDashboard],
  ["registrations", "Registrations", Users],
  ["payments", "Payment review", Wallet],
  ["settings", "Event settings", Settings],
  ["checkin", "Exam check-in", ScanLine],
];
export function Admin() {
  const [me, setMe] = useState(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [active, setActive] = useState("dashboard"),
    [stats, setStats] = useState(null),
    [registrations, setRegistrations] = useState([]),
    [attendance, setAttendance] = useState({ items: [], total: 0, present: 0 }),
    [payments, setPayments] = useState([]),
    [settings, setSettings] = useState(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [token, setToken] = useState(""),
    [scanResult, setScanResult] = useState(null),
    [scanner, setScanner] = useState(null),
    scannerRef = useRef(null),
    [scannerState, setScannerState] = useState("idle"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function run(fn) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const load = async () => {
    const [a, b, c, d] = await Promise.all([
      api.get("/admin/dashboard"),
      api.get("/admin/registrations", {
        params: { page, search, status: filter },
      }),
      api.get("/admin/payments"),
      api.get("/admin/settings"),
    ]);
    setStats(a.data);
    setRegistrations(b.data.items);
    setTotal(b.data.total);
    setPayments(c.data.items);
    setSettings(d.data);
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
    if (me) load().catch((e) => setError(e.message));
  }, [me, page, filter]);
  const loadAttendance = async () => {
    const r = await api.get("/admin/attendance");
    setAttendance(r.data);
  };
  useEffect(() => {
    if (me && active === "checkin")
      loadAttendance().catch((e) => setError(e.message));
  }, [me, active]);
  const canPay =
      !!me && ["SUPER_ADMIN", "ADMIN", "PAYMENT_VERIFIER"].includes(me.role),
    canSet = !!me && ["SUPER_ADMIN", "ADMIN"].includes(me.role),
    canExam =
      !!me && ["SUPER_ADMIN", "ADMIN", "EXAM_COORDINATOR"].includes(me.role);
  useEffect(() => {
    return () => {
      const activeScanner = scannerRef.current;
      scannerRef.current = null;
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
  }, []);
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
  const review = (id, approve) =>
    run(async () => {
      const note = approve
        ? "Transaction verified against actual bank/UPI records."
        : prompt("Enter a reason for rejection (required):");
      if (!approve && (!note || note.trim().length < 5)) return;
      const r = await api.post(
        `/admin/payments/${id}/${approve ? "approve" : "reject"}`,
        { note },
      );
      setNotice(r.data.message);
      await load();
    });
  const receipt = (id) =>
    run(async () => {
      const r = await api.get(`/admin/payments/${id}/receipt`, {
        responseType: "blob",
      });
      downloadBlob(r.data, `payment-receipt-${id}`);
    });
  const pdf = (id) =>
    run(async () => {
      const r = await api.get(`/admin/admit-card/${id}`, {
        responseType: "blob",
      });
      downloadBlob(r.data, `admit-${id}.pdf`);
    });
  const exportCsv = () =>
    run(async () => {
      const r = await api.get("/admin/export.csv", { responseType: "blob" });
      downloadBlob(r.data, "SHREE-2026-registrations.csv");
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
      setNotice("Event settings saved.");
    });
  const assign = (r) =>
    run(async () => {
      const room = prompt(`Room for ${r.studentName}:`, r.room || "");
      if (room === null) return;
      const seat = prompt("Seat number:", r.seat || "");
      if (seat === null) return;
      await api.post(`/admin/registrations/${r.id}/seat`, { room, seat });
      setNotice("Room and seat updated.");
      await load();
    });
  const checkIn = () =>
    run(async (value = token) => {
      const r = await api.post("/admin/check-in", { token: value.trim() });
      setScanResult(r.data.registration);
      setNotice("Student checked in.");
      setToken("");
      await loadAttendance();
    });
  const startScanner = async () => {
    if (scanner) return;
    setError("");
    setScannerState("starting");
    const camera = new Html5Qrcode("admin-qr-reader");
    scannerRef.current = camera;
    setScanner(camera);
    try {
      await camera.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          const match = decodedText.match(/\/api\/verify\/([^/?#]+)/);
          const scannedToken = match
            ? decodeURIComponent(match[1])
            : decodedText.trim();
          if (scannedToken.length < 20) {
            setError("This QR code is not a Shree Olympiad admit card.");
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
        },
        () => {},
      );
      setScannerState("running");
    } catch (e) {
      scannerRef.current = null;
      try {
        camera.clear();
      } catch {}
      setScanner(null);
      setScannerState("idle");
      setError(
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
    if (!file) return;
    setError("");
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
      setError(
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
          {error && <div className="error">{error}</div>}
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
            SHREE 2026
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
        {error && <div className="error">{error}</div>}
        {notice && <div className="success">{notice}</div>}
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
        {active === "registrations" && (
          <div className="admin-panel">
            <div className="table-tools">
              <input
                value={search}
                placeholder="Search name, reference, mobile..."
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setPage(1);
                    load().catch((x) => setError(x.message));
                  }
                }}
              />
              <button
                className="btn light"
                onClick={() => {
                  setPage(1);
                  load().catch((x) => setError(x.message));
                }}
              >
                <Search size={16} />
                Search
              </button>
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                }}
              >
                {[
                  "",
                  "DRAFT",
                  "OTP_VERIFIED",
                  "PAYMENT_PENDING",
                  "PAYMENT_UNDER_VERIFICATION",
                  "CONFIRMED",
                  "PAYMENT_REJECTED",
                  "CANCELLED",
                ].map((v) => (
                  <option key={v} value={v}>
                    {v ? v.replaceAll("_", " ") : "All statuses"}
                  </option>
                ))}
              </select>
              <button className="btn primary" onClick={exportCsv}>
                <Download size={16} />
                CSV
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Reference</th>
                    <th>Class</th>
                    <th>Mobile</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.studentName}</strong>
                        <small>{r.guardianName}</small>
                      </td>
                      <td>{r.registrationNumber || r.applicationRef}</td>
                      <td>{r.studentClass}</td>
                      <td>{r.guardianPhone}</td>
                      <td>
                        <span className="status-pill">
                          {r.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="actions">
                        {r.status === "CONFIRMED" && canExam && (
                          <>
                            <button onClick={() => pdf(r.id)}>PDF</button>
                            <button onClick={() => assign(r)}>Seat</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                {total} result(s) · page {page}
              </span>
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                disabled={page * 25 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
        {active === "payments" && (
          <div className="admin-panel">
            <div className="section-heading left">
              <h2>Manual payment review</h2>
              <p>
                Always check the school bank/UPI transaction record before
                clicking Approve. A receipt alone is not proof of payment.
              </p>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Amount</th>
                    <th>UTR</th>
                    <th>Review status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p._id}>
                      <td>
                        {p.registrationId?.studentName || "—"}
                        <small>{p.registrationId?.studentClass}</small>
                      </td>
                      <td>₹{p.amount}</td>
                      <td>{p.utr}</td>
                      <td>
                        <span className="status-pill">{p.status}</span>
                      </td>
                      <td className="actions">
                        <button onClick={() => receipt(p._id)}>Receipt</button>
                        {canPay && p.status === "UNDER_REVIEW" && (
                          <>
                            <button
                              className="approve"
                              onClick={() => review(p._id, true)}
                              disabled={busy}
                            >
                              <Check size={13} /> Approve
                            </button>
                            <button
                              className="reject"
                              onClick={() => review(p._id, false)}
                              disabled={busy}
                            >
                              <X size={13} /> Reject
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {payments.length === 0 && <p>No manual payments submitted yet.</p>}
          </div>
        )}
        {active === "settings" && canSet && settings && (
          <div className="admin-panel settings-panel">
            <h2>Event configuration</h2>
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
          <div className="admin-panel">
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
                    <button className="btn light" onClick={stopScanner}>
                      Stop camera
                    </button>
                  )}
                  <label className="btn light scan-image-button">
                    Scan image
                    <input type="file" accept="image/*" onChange={scanImage} />
                  </label>
                </div>
                <p className="scanner-help">
                  Allow camera access when your browser asks. Point the camera
                  at the QR code printed on the admit card.
                </p>
                {scanResult && (
                  <div className="receipt-summary">
                    <div>
                      <span>Student</span>
                      <strong>{scanResult.studentName}</strong>
                    </div>
                    <div>
                      <span>Registration</span>
                      <strong>{scanResult.registrationNumber}</strong>
                    </div>
                    <div>
                      <span>Room</span>
                      <strong>{scanResult.room || "Not assigned"}</strong>
                    </div>
                    <div>
                      <span>Check-in</span>
                      <strong>Recorded</strong>
                    </div>
                  </div>
                )}
                <div className="attendance-heading">
                  <div>
                    <h2>Attendance</h2>
                    <p>
                      {attendance.present} present ·{" "}
                      {attendance.total - attendance.present} not checked in ·{" "}
                      {attendance.total} confirmed
                    </p>
                  </div>
                  <button
                    className="btn light"
                    onClick={() => run(loadAttendance)}
                    disabled={busy}
                  >
                    <RefreshCcw size={16} /> Refresh list
                  </button>
                </div>
                <div className="table-scroll attendance-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Registration</th>
                        <th>Class</th>
                        <th>Room / Seat</th>
                        <th>Attendance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.items.map((student) => (
                        <tr key={student.id}>
                          <td>
                            <strong>{student.studentName}</strong>
                            <small>{student.guardianName}</small>
                          </td>
                          <td>
                            {student.registrationNumber ||
                              student.applicationRef}
                          </td>
                          <td>{student.studentClass}</td>
                          <td>
                            {student.room || "-"} / {student.seat || "-"}
                          </td>
                          <td>
                            <span
                              className={`status-pill ${student.checkInAt ? "present" : "absent"}`}
                            >
                              {student.checkInAt ? "Present" : "Not checked in"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p>Exam Coordinator role required.</p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
