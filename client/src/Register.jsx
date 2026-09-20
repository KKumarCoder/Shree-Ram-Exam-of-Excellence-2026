import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  IndianRupee,
  ShieldCheck,
  Upload,
  Download,
  AlertCircle,
} from "lucide-react";
import {
  api,
  draftHeaders,
  getToken,
  setToken,
  downloadBlob,
  img,
} from "./api.js";
const initial = {
  studentName: "",
  dob: "",
  studentClass: "",
  currentSchool: "",
  guardianName: "",
  guardianPhone: "",
  email: "",
  address: "",
  city: "",
  district: "",
  state: "Haryana",
  pincode: "",
  purpose: "",
  consent: false,
};
const fields = [
  ["studentName", "Student full name *"],
  ["dob", "Date of birth *", "date"],
  ["studentClass", "Class *", "select"],
  ["currentSchool", "Current school *"],
  ["guardianName", "Parent / guardian name *"],
  ["guardianPhone", "Guardian mobile (10 digits) *", "tel"],
  ["email", "Email (optional)", "email"],
  ["address", "Full address *"],
  ["city", "City / village *"],
  ["district", "District *"],
  ["state", "State *"],
  ["pincode", "PIN code *", "tel"],
  ["purpose", "Purpose of participation (optional)"],
];
const phases = [
  "Student details",
  "OTP verification",
  "Payment",
  "Confirmation",
];
function ErrorBox({ message }) {
  return message ? (
    <div className="error">
      <AlertCircle size={18} />
      {message}
    </div>
  ) : null;
}
export function Register({ settings, loading }) {
  const [form, setForm] = useState(initial),
    [step, setStep] = useState(0),
    [otp, setOtp] = useState(""),
    [devOtp, setDevOtp] = useState(""),
    [registration, setRegistration] = useState(null),
    [receipt, setReceipt] = useState(null),
    [photo, setPhoto] = useState(null),
    [utr, setUtr] = useState(""),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (getToken())
      api
        .get("/registrations/me", { headers: draftHeaders() })
        .then(({ data }) => {
          setRegistration(data.registration);
          setStep(
            data.registration.status === "DRAFT"
              ? 1
              : data.registration.status === "OTP_VERIFIED" ||
                  data.registration.status === "PAYMENT_PENDING" ||
                  data.registration.status === "PAYMENT_REJECTED"
                ? 2
                : 3,
          );
        })
        .catch(() => setToken(""));
  }, []);
  async function execute(fn) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  function reset() {
    setToken("");
    setStep(0);
    setForm(initial);
    setRegistration(null);
    setOtp("");
    setDevOtp("");
    setError("");
    setMessage("");
  }
  const save = () =>
    execute(async () => {
      const r = await api.post("/registrations/start", form);
      setToken(r.data.token);
      setRegistration(r.data.registration);
      setStep(1);
      const sent = await api.post(
        "/registrations/otp/send",
        {},
        { headers: draftHeaders() },
      );
      setMessage(sent.data.message);
      setDevOtp(sent.data.devOtp || "");
    });
  const send = () =>
    execute(async () => {
      const r = await api.post(
        "/registrations/otp/send",
        {},
        { headers: draftHeaders() },
      );
      setMessage(r.data.message);
      setDevOtp(r.data.devOtp || "");
    });
  const verify = () =>
    execute(async () => {
      const r = await api.post(
        "/registrations/otp/verify",
        { otp },
        { headers: draftHeaders() },
      );
      setRegistration(r.data.registration);
      setStep(2);
      setMessage(r.data.message);
    });
  const uploadPhoto = () =>
    execute(async () => {
      if (!photo) throw new Error("Choose a photo first.");
      const fd = new FormData();
      fd.append("photo", photo);
      const r = await api.post("/registrations/photo", fd, {
        headers: draftHeaders(),
        timeout: 30000,
      });
      setMessage(r.data.message);
      setRegistration((s) => ({ ...s, photoUploaded: true }));
    });
  const submitManual = () =>
    execute(async () => {
      if (!receipt) throw new Error("Upload your real payment receipt.");
      const fd = new FormData();
      fd.append("utr", utr);
      fd.append("termsAccepted", "true");
      fd.append("receipt", receipt);
      const r = await api.post("/registrations/manual", fd, {
        headers: draftHeaders(),
        timeout: 30000,
      });
      setRegistration(r.data.registration);
      setStep(3);
      setMessage(r.data.message);
    });
  const startRazorpay = () =>
    execute(async () => {
      if (!accepted) throw new Error("Please accept the terms.");
      const { data: order } = await api.post(
        "/registrations/razorpay/order",
        { termsAccepted: true },
        { headers: draftHeaders() },
      );
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = resolve;
          script.onerror = () =>
            reject(new Error("Payment checkout could not load."));
          document.head.append(script);
        });
      }
      await new Promise((resolve, reject) => {
        const checkout = new window.Razorpay({
          key: order.key,
          order_id: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: "Shree Ram Public School",
          description: "SHREE 2026 OLYMPIAD",
          handler: async (result) => {
            try {
              const r = await api.post(
                "/registrations/razorpay/verify",
                {
                  orderId: result.razorpay_order_id,
                  paymentId: result.razorpay_payment_id,
                  signature: result.razorpay_signature,
                },
                { headers: draftHeaders() },
              );
              setRegistration(r.data.registration);
              setStep(3);
              setMessage("Your payment and registration are confirmed.");
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          modal: {
            ondismiss: () => {
              setMessage(
                "Payment checkout closed. You can retry without creating a new application.",
              );
              resolve();
            },
          },
          prefill: {
            name: form.guardianName,
            email: form.email,
            contact: form.guardianPhone,
          },
        });
        checkout.open();
      });
    });
  const download = () =>
    execute(async () => {
      const r = await api.get("/registrations/admit-card", {
        headers: draftHeaders(),
        responseType: "blob",
      });
      downloadBlob(
        r.data,
        `${registration.registrationNumber || "SHREE-admit-card"}.pdf`,
      );
    });
  return (
    <main className="register-page shell">
      <div className="page-intro">
        <span className="eyebrow">OFFICIAL REGISTRATION</span>
        <h1>Join SHREE 2026 OLYMPIAD</h1>
        <p>
          One secure application, real guardian OTP, school-approved payment and
          a personalized admit card.
        </p>
      </div>
      <div className="wizard-layout">
        <div className="wizard-main">
          <div className="progress">
            {phases.map((label, i) => (
              <div
                key={label}
                className={i === step ? "current" : i < step ? "done" : ""}
              >
                <span>{i < step ? <CheckCircle2 size={16} /> : i + 1}</span>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <ErrorBox message={error} />
          {message && (
            <div className="success">
              <CheckCircle2 size={18} />
              {message}
            </div>
          )}
          {step === 0 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <div className="form-head">
                <FileText />
                <div>
                  <h2>Student information</h2>
                  <p>Fields marked * are mandatory.</p>
                </div>
              </div>
              <div className="form-grid">
                {fields.map(([key, label, type = "text"]) => (
                  <label
                    className={
                      key === "address" || key === "purpose" ? "span2" : ""
                    }
                    key={key}
                  >
                    <span>{label}</span>
                    {type === "select" ? (
                      <select
                        required
                        value={form[key]}
                        onChange={(e) => update(key, e.target.value)}
                      >
                        <option value="">Select class</option>
                        {Array.from({ length: 12 }, (_, i) => (
                          <option key={i + 1} value={String(i + 1)}>
                            Class {i + 1}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={type}
                        required={!["email", "purpose"].includes(key)}
                        maxLength={
                          key === "address"
                            ? 300
                            : key === "purpose"
                              ? 500
                              : 120
                        }
                        value={form[key]}
                        onChange={(e) => update(key, e.target.value)}
                        placeholder={label.replace(" *", "")}
                        pattern={
                          key === "guardianPhone"
                            ? "[6-9][0-9]{9}"
                            : key === "pincode"
                              ? "[1-9][0-9]{5}"
                              : undefined
                        }
                      />
                    )}
                  </label>
                ))}
              </div>
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={form.consent}
                  required
                  onChange={(e) => update("consent", e.target.checked)}
                />
                <span>
                  I am the parent/authorized guardian and consent to the
                  processing of this student’s information for the Olympiad.
                </span>
              </label>
              <button
                disabled={busy || loading || !settings.registrationOpen}
                className="btn primary wide"
              >
                {busy ? "Saving..." : "Continue to mobile verification"}{" "}
                <ArrowRight size={18} />
              </button>
              {!settings.registrationOpen && (
                <p className="hint">
                  Registration is currently closed. Please contact the school
                  for the opening date.
                </p>
              )}
            </form>
          )}
          {step === 1 && (
            <div className="step-panel">
              <div className="circle-icon">
                <ShieldCheck size={34} />
              </div>
              <h2>Verify guardian mobile</h2>
              <p>
                A six-digit OTP is sent to the phone number submitted in the
                application. The OTP expires after five minutes.
              </p>
              {devOtp && (
                <div className="dev-code">
                  LOCAL DEVELOPMENT ONLY: test OTP <b>{devOtp}</b>. This is
                  disabled in production.
                </div>
              )}
              <label>
                <span>Enter six-digit OTP</span>
                <input
                  inputMode="numeric"
                  maxLength="6"
                  pattern="[0-9]{6}"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="otp-input"
                />
              </label>
              <button
                className="btn primary wide"
                disabled={busy || otp.length !== 6}
                onClick={verify}
              >
                {busy ? "Checking..." : "Verify and continue"}{" "}
                <ArrowRight size={17} />
              </button>
              <button className="btn light wide" disabled={busy} onClick={send}>
                Resend OTP
              </button>
            </div>
          )}
          {step === 2 && (
            <div className="step-panel">
              <div className="form-head">
                <IndianRupee />
                <div>
                  <h2>Registration payment</h2>
                  <p>Verified parent mobile · fee ₹{settings.fee}</p>
                </div>
              </div>
              <div className="photo-upload">
                <h3>Student passport-size photograph *</h3>
                <p>
                  Upload a clear JPEG or PNG photo up to 2 MB. This photo will
                  be printed on the admit card.
                </p>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                />
                <button
                  className="btn light"
                  disabled={busy || !photo || registration?.photoUploaded}
                  onClick={uploadPhoto}
                >
                  {registration?.photoUploaded
                    ? "Photograph uploaded"
                    : "Upload photograph"}
                </button>
              </div>
              <div className="payment-summary">
                <span>Olympiad registration fee</span>
                <strong>₹{settings.fee}</strong>
              </div>
              {settings.paymentMode === "manual" ? (
                <>
                  <div className="upi-box">
                    <div>
                      <h3>Pay through official UPI</h3>
                      <p>
                        UPI ID: <b>{settings.upiId || "Not yet configured"}</b>
                      </p>
                      <p>
                        Payee:{" "}
                        <b>{settings.payeeName || "Shree Ram Public School"}</b>
                      </p>
                    </div>
                    {settings.upiId && (
                      <img
                        src="/images/school-upi-qr.png"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = "/api/payment-qr";
                        }}
                        alt="School payment UPI QR"
                      />
                    )}
                  </div>
                  <div className="notice">
                    After paying, upload the receipt and reference number.
                    Screenshots cannot automatically prove payment: the school
                    must verify the amount in its bank/UPI records before your
                    admit card is issued.
                  </div>
                  <label>
                    <span>UPI transaction reference / UTR *</span>
                    <input
                      value={utr}
                      maxLength="40"
                      onChange={(e) => setUtr(e.target.value)}
                      placeholder="Enter 8–40 character UTR"
                    />
                  </label>
                  <label className="file-upload">
                    <Upload size={19} />
                    <span>
                      {receipt
                        ? receipt.name
                        : "Upload payment receipt (JPG, PNG or PDF, up to 3 MB)"}
                    </span>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf"
                      onChange={(e) => setReceipt(e.target.files?.[0] || null)}
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className="notice">
                    Secure checkout through the school’s configured payment
                    provider. Payment is confirmed only after provider-side
                    verification.
                  </div>
                  <div className="feature-image payment-illustration">
                    <img
                      src={img("payment.webp")}
                      alt="Online payment illustration"
                    />
                  </div>
                </>
              )}
              <div className="policy">
                <h3>Terms, privacy and refund</h3>
                <p>{settings.terms}</p>
                <p>
                  <b>Privacy:</b> {settings.privacy}
                </p>
                <p>
                  <b>Refund:</b> {settings.refund}
                </p>
              </div>
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <span>
                  I have read and accept the event terms, privacy information
                  and refund policy.
                </span>
              </label>
              <button
                disabled={
                  busy ||
                  !accepted ||
                  !registration?.photoUploaded ||
                  (settings.paymentMode === "manual" && (!receipt || !utr))
                }
                className="btn primary wide"
                onClick={
                  settings.paymentMode === "manual"
                    ? submitManual
                    : startRazorpay
                }
              >
                {busy
                  ? "Processing..."
                  : settings.paymentMode === "manual"
                    ? "Submit receipt for school verification"
                    : "Pay securely online"}{" "}
                <ArrowRight size={18} />
              </button>
            </div>
          )}
          {step === 3 && (
            <div className="step-panel confirmation">
              <div className="circle-icon">
                <CheckCircle2 size={40} />
              </div>
              <h2>
                {registration?.status === "CONFIRMED"
                  ? "Registration confirmed!"
                  : "Application received"}
              </h2>
              <p>
                {registration?.status === "CONFIRMED"
                  ? "Your payment is verified and your admit card is ready."
                  : "Your payment is not yet confirmed. School staff must verify the actual received payment before issuing the admit card."}
              </p>
              <div className="receipt-summary">
                <div>
                  <span>Student name</span>
                  <strong>{registration?.studentName}</strong>
                </div>
                <div>
                  <span>Application reference</span>
                  <strong>{registration?.applicationRef}</strong>
                </div>
                <div>
                  <span>Registration number</span>
                  <strong>
                    {registration?.registrationNumber ||
                      "Issued after payment verification"}
                  </strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{registration?.status?.replaceAll("_", " ")}</strong>
                </div>
              </div>
              {registration?.status === "CONFIRMED" ? (
                <button
                  className="btn primary wide"
                  disabled={busy}
                  onClick={download}
                >
                  Download admit card PDF <Download size={18} />
                </button>
              ) : (
                <div className="notice">
                  Keep your application reference. You can check the status with
                  your guardian’s mobile OTP after school review.
                </div>
              )}
              <Link to="/status" className="btn light wide">
                Check application status
              </Link>
              <button className="link-button" onClick={reset}>
                Start another application
              </button>
            </div>
          )}
        </div>
        <aside className="wizard-side">
          <img
            src={img("registration.webp")}
            alt="Student registration visual"
          />
          <div className="side-card">
            <h3>Registration information</h3>
            <div>
              Fee <strong>₹{settings.fee}</strong>
            </div>
            <div>
              Exam date{" "}
              <strong>{settings.examDate || "To be announced"}</strong>
            </div>
            <div>
              Venue <strong>Shree Ram Public School</strong>
            </div>
            <div>
              Help desk <strong>{settings.contactPhone}</strong>
            </div>
          </div>
          <p>
            <ShieldCheck size={16} /> Guardian mobile OTP required for access.
          </p>
        </aside>
      </div>
    </main>
  );
}
