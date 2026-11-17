import { notify } from "./notifications.js";
import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  ShieldCheck,
  Download,
  CheckCircle2,
  Clock3,
  Award,
} from "lucide-react";
import { api, downloadBlob, img, setToken } from "./api.js";
import { ApplicationStatusTimeline } from "./PortalComponents.jsx";
export function Status() {
  const navigate = useNavigate();
  const [ref, setRef] = useState(""),
    [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [lookupToken, setLookupToken] = useState(""),
    [draftToken, setDraftToken] = useState(""),
    [access, setAccess] = useState(""),
    [record, setRecord] = useState(null),
    [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [resendAt, setResendAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () =>
      setSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  async function run(fn) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify.error(e.message);
      if (e.status === 401) {
        setAccess("");
        setLookupToken("");
        setRecord(null);
        setCode("");
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function request() {
    run(async () => {
      const r = await api.post("/status/request", {
        registrationNumber: ref.trim().toUpperCase(),
        phone,
      });
      setLookupToken(r.data.lookupToken);
      notify.success(
        r.data.message ||
          "Verification code sent to your WhatsApp number.",
      );
      setCode("");
      setResendAt(Date.parse(r.data.resendAvailableAt) || 0);
    });
  }
  function verify() {
    run(async () => {
      const r = await api.post(
        "/status/verify",
        { otp: code },
        { headers: { Authorization: `Bearer ${lookupToken}` } },
      );
      setAccess(r.data.accessToken);
      setDraftToken(r.data.draftToken || "");
      setRecord(r.data.registration);
      notify.success("WhatsApp mobile verified successfully.");
    });
  }
  function refreshStatus() {
    run(async () => {
      const r = await api.get("/status/me", {
        headers: { Authorization: `Bearer ${access}` },
      });
      setRecord(r.data.registration);
    });
  }
  function downloadReceipt() {
    run(async () => {
      const headers = { Authorization: `Bearer ${access}` };
      const { data } = await api.get("/status/me", { headers });
      const latest = data.registration;
      setRecord(latest);
      const r = await api.get("/application-receipt", {
        headers,
        responseType: "blob",
      });
      const fileRef =
        latest.registrationNumber || latest.applicationRef || "Shree-Olympiad-2027";
      downloadBlob(
        r.data,
        `${fileRef}-application-receipt.pdf`,
      );
    });
  }
  function download() {
    run(async () => {
      const headers = { Authorization: `Bearer ${access}` };
      const { data } = await api.get("/status/me", { headers });
      const latest = data.registration;
      setRecord(latest);
      const r = await api.get("/admit-card", {
        headers,
        responseType: "blob",
      });
      const fileRef =
        latest.registrationNumber || latest.applicationRef || "Shree-Olympiad-2027";
      downloadBlob(r.data, `${fileRef}-admit-card.pdf`);
    });
  }
  function downloadCertificate() {
    run(async () => {
      const r = await api.get("/certificate", {
        headers: { Authorization: `Bearer ${access}` },
        responseType: "blob",
      });
      downloadBlob(
        r.data,
        `Certificate-${(record.studentName || "Student").replace(/[^a-zA-Z0-9]/g, "_")}-${record.registrationNumber || "2027"}.pdf`,
      );
    });
  }
  return (
    <main className="status-page shell">
      <div className="page-intro">
        <span className="eyebrow">STUDENT SERVICES</span>
        <h1>Check status & download admit card</h1>
        <p>
          Verify your registered mobile via WhatsApp to access student details and admit card.
        </p>
      </div>
      <div className="status-grid">
        <div className="status-card">
          {!lookupToken ? (
            <>
              <div className="form-head">
                <Search />
                <div>
                  <h2>Find your application</h2>
                  <p>
                    Enter your application reference or confirmed registration
                    number.
                  </p>
                </div>
              </div>
              <label>
                <span>Application reference / Registration number</span>
                <input
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="APP-XXXXXXXXXX or SHREE26-000001"
                />
              </label>
              <label>
                <span>Guardian mobile number</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  maxLength="10"
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  placeholder="10-digit registered mobile"
                />
              </label>
              <button
                className="btn primary wide"
                disabled={busy || phone.length !== 10 || !ref}
                onClick={request}
              >
                Send secure OTP
              </button>
            </>
          ) : !access ? (
            <>
              <div className="form-head">
                <ShieldCheck />
                <div>
                  <h2>Confirm WhatsApp OTP</h2>
                  <p>
                    Enter the 6-digit OTP sent to your registered WhatsApp mobile number.
                  </p>
                </div>
              </div>
              <label>
                <span>Six-digit verification code</span>
                <input
                  inputMode="numeric"
                  maxLength="6"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                />
              </label>
              <button
                className="btn primary wide"
                disabled={busy || code.length !== 6}
                onClick={verify}
              >
                Verify & view status
              </button>
              <button
                className="btn light wide"
                disabled={busy || seconds > 0}
                onClick={request}
              >
                {seconds > 0 ? `Resend OTP in ${seconds}s` : "Resend OTP"}
              </button>
              <button
                className="link-button"
                disabled={busy}
                onClick={() => {
                  setLookupToken("");
                  setCode("");
                }}
              >
                Change application / mobile
              </button>
            </>
          ) : (
            <>
              <div className="form-head">
                <CheckCircle2 />
                <div>
                  <h2>Application details</h2>
                  <p>Your WhatsApp mobile is verified.</p>
                </div>
              </div>
              <div className="receipt-summary">
                {[
                  ["Student", record.studentName],
                  [
                    "Class",
                    record.studentClass === "11" && record.course
                      ? `${record.studentClass} (${record.course})`
                      : record.studentClass,
                  ],
                  ["Application ref.", record.applicationRef],
                  ["Registration no.", record.registrationNumber || "Pending"],
                  ["Application status", record.status.replaceAll("_", " ")],
                  [
                    "Payment status",
                    {
                      CONFIRMED: "Confirmed",
                      CONFIRMING: "Confirmed",
                      PAYMENT_UNDER_VERIFICATION: "Under review",
                      PAYMENT_PENDING: "Pending",
                      PAYMENT_REJECTED: "Rejected",
                      CANCELLED: "Contact school",
                    }[record.status] || "Not completed",
                  ],
                  [
                    "Admit card",
                    record.status === "CONFIRMED" ? "Available" : "Pending",
                  ],
                  ["Room", record.room || "To be assigned"],
                  ["Seat", record.seat || "To be assigned"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <ApplicationStatusTimeline record={record} />
              {record.status === "CONFIRMED" && (
                <p className="notice">
                  {record.notificationStatus === "SENT"
                    ? "Admit card and receipt sent to your registered WhatsApp mobile number. You can also download them below."
                    : "Your admit card and receipt are available below."}
                </p>
              )}
              {!["DRAFT", "OTP_VERIFIED"].includes(record.status) && (
                <button
                  className="btn outlined-dark wide"
                  disabled={busy}
                  onClick={downloadReceipt}
                >
                  <Download size={17} /> Download application receipt PDF
                </button>
              )}
              {record.status === "CONFIRMED" ? (
                <>
                  <button
                    className="btn primary wide"
                    disabled={busy}
                    onClick={download}
                  >
                    <Download size={17} /> Download admit card PDF
                  </button>
                  {record.checkInAt && (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "16px",
                        background: "var(--surface-soft, #f8fafc)",
                        border: "1.5px solid #0284c7",
                        borderRadius: "12px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          color: "#0369a1",
                          fontWeight: 700,
                          fontSize: "14px",
                        }}
                      >
                        <Award size={18} /> Official Certificate of Participation
                      </div>
                      <p
                        style={{
                          margin: "8px 0 14px",
                          fontSize: "13px",
                          color: "var(--text-muted, #475569)",
                          lineHeight: 1.5,
                        }}
                      >
                        {record.certificateIssuedAt
                          ? `Your certificate (ID: ${record.certificateNumber}) has been issued. You can also download it below.`
                          : "Exam attendance recorded! Your official Certificate of Participation is scheduled to be automatically generated and sent to WhatsApp."}
                      </p>
                      <button
                        type="button"
                        className="btn wide"
                        style={{
                          background: "#0e4b66",
                          color: "#ffffff",
                          borderColor: "#0e4b66",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                        }}
                        disabled={busy}
                        onClick={downloadCertificate}
                      >
                        <Download size={17} /> Download Certificate of Participation PDF
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="notice">
                    <Clock3 size={16} />{" "}
                    {record.status === "PAYMENT_REJECTED"
                      ? "Payment was rejected. Resubmit payment proof to complete registration."
                      : record.status === "CANCELLED"
                        ? "This application is cancelled. Contact the school office."
                        : "Admit card is available only after payment approval. Check again after school review."}
                  </div>
                  {["DRAFT", "OTP_VERIFIED", "PAYMENT_PENDING", "PAYMENT_REJECTED"].includes(
                    record.status,
                  ) && (
                    <button
                      type="button"
                      className="btn primary wide"
                      style={{
                        marginTop: "12px",
                        background: "#ffcd3b",
                        color: "#073657",
                        fontWeight: 700,
                        fontSize: "15px",
                        padding: "14px 20px",
                        borderRadius: "10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        boxShadow: "0 4px 12px rgba(255, 205, 59, 0.35)",
                        border: "none",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        if (draftToken) {
                          setToken(draftToken);
                        }
                        navigate("/register");
                      }}
                    >
                      Continue Application & Pay ₹149 →
                    </button>
                  )}
                  <button
                    className="btn light wide"
                    disabled={busy}
                    onClick={refreshStatus}
                  >
                    {busy
                      ? "Checking..."
                      : "Check approval / unlock admit card"}
                  </button>
                </>
              )}
            </>
          )}
          <p className="hint">
            Need help? Contact the school office. Never share your OTP.
          </p>
        </div>
        <div className="status-image">
          <img
            src="/images/shree-2027/exam-day-students.png"
            alt="Students holding their examination documents"
          />
          <div className="side-card">
            <h3>Your application, step by step</h3>
            <p>
              Keep your application reference and registered guardian mobile
              ready.
            </p>
            <p>
              Verify the WhatsApp OTP to view your details. Download the
              application receipt while payment is under review; the admit card
              is available after payment confirmation.
            </p>
          </div>
        </div>
      </div>
      <div className="center-link">
        <Link to="/register" className="btn outlined-dark">
          New registration
        </Link>
      </div>
    </main>
  );
}
