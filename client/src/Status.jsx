import { notify } from "./notifications.js";
import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  ShieldCheck,
  Download,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import { api, downloadBlob, img } from "./api.js";
import { ApplicationStatusTimeline } from "./PortalComponents.jsx";
export function Status() {
  const [ref, setRef] = useState(""),
    [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [lookupToken, setLookupToken] = useState(""),
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
          "Verification code sent. Check your inbox and spam folder.",
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
      setRecord(r.data.registration);
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
      const confirmed = latest.status === "CONFIRMED";
      const r = await api.get(
        confirmed ? "/admit-card" : "/application-receipt",
        {
          headers,
          responseType: "blob",
        },
      );
      downloadBlob(
        r.data,
        confirmed
          ? `${latest.registrationNumber}-admit-card.pdf`
          : "Shree Ram Exam of Excellence 2027.pdf",
      );
    });
  }
  function download() {
    run(async () => {
      const r = await api.get("/admit-card", {
        headers: { Authorization: `Bearer ${access}` },
        responseType: "blob",
      });
      downloadBlob(r.data, `${record.registrationNumber}-admit-card.pdf`);
    });
  }
  return (
    <main className="status-page shell">
      <div className="page-intro">
        <span className="eyebrow">STUDENT SERVICES</span>
        <h1>Check status & download admit card</h1>
        <p>
          Verify your registered email to access private student information.
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
                  <h2>Confirm your email</h2>
                  <p>
                    Enter the OTP sent to your registered email. Check your
                    inbox and spam folder.
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
                  <p>Your email is verified.</p>
                </div>
              </div>
              <div className="receipt-summary">
                {[
                  ["Student", record.studentName],
                  ["Class", record.studentClass],
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
                    ? "Admit card and receipt sent to your registered email. Check your inbox and spam folder."
                    : "Your admit card and receipt are available below. Email delivery is being processed."}
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
                <button
                  className="btn primary wide"
                  disabled={busy}
                  onClick={download}
                >
                  <Download size={17} /> Download admit card PDF
                </button>
              ) : (
                <>
                  <div className="notice">
                    <Clock3 size={16} />{" "}
                    {record.status === "PAYMENT_REJECTED"
                      ? "Payment was rejected. Contact the school office to correct the payment submission."
                      : record.status === "CANCELLED"
                        ? "This application is cancelled. Contact the school office."
                        : "Admit card is available only after payment approval. Check again after school review."}
                  </div>
                  <button
                    className="btn primary wide"
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
              Verify the email OTP to view your details. Download the
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
