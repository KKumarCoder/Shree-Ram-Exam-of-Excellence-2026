import React, { useEffect, useState, useRef } from "react";
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
import { cleanRegistrationInput, registrationFieldError, fieldMaxLength } from "./registrationValidation.js";
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
  state: "HARYANA",
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
const capitalFields = new Set(fields.filter(([, , type]) => !type).map(([key]) => key));
const phases = [
  "Student details",
  "OTP verification",
  "Payment",
  "Confirmation",
];
function ErrorBox({ message }) {
  return message ? (
    <div className="error" role="alert">
      <AlertCircle size={18} />
      {message}
    </div>
  ) : null;
}
export function Register({ settings, loading, settingsError, reloadSettings }) {
  const [form, setForm] = useState(initial),
    [step, setStep] = useState(0),
    [otp, setOtp] = useState(""),
    [resendAt, setResendAt] = useState(0),
    [registration, setRegistration] = useState(null),
    [receipt, setReceipt] = useState(null),
    [photo, setPhoto] = useState(null),
    [utr, setUtr] = useState(""),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const running = useRef(false);
  const applicationKey = useRef(crypto.randomUUID());
  const [editingMobile, setEditingMobile] = useState(false);
  const [mobileInput, setMobileInput] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  useEffect(() => {
    const updateCountdown = () =>
      setResendSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    updateCountdown();
    if (!resendAt) return undefined;
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);
  useEffect(() => {
    if (getToken())
      api
        .get("/registrations/me", { headers: draftHeaders() })
        .then(({ data }) => {
          setRegistration(data.registration);
          setResendAt(data.resendAvailableAt ? Date.parse(data.resendAvailableAt) : 0);
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
         .catch((e) => {
          if ([401, 404, 410].includes(e.status)) setToken("");
          else setError("Could not restore your application. Please reload and retry; your session has been retained.");
        });
  }, []);
  async function execute(fn) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
      if (e.status === 401 || e.status === 410) {
        setToken(''); setRegistration(null); setStep(0);
        applicationKey.current = crypto.randomUUID();
        setEditingMobile(false); setOtp(''); setResendAt(0);
      } else if ([403, 409].includes(e.status) && getToken()) {
        const latest = await api.get('/registrations/me', { headers: draftHeaders() }).catch(() => null);
        if (latest?.data.registration.status === 'DRAFT') { setRegistration(latest.data.registration); setStep(1); setOtp(''); }
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const update = (key, value) => setForm((f) => ({
    ...f, [key]: capitalFields.has(key) ? value.toUpperCase() : value,
  }));
  function reset() {
    applicationKey.current = crypto.randomUUID();
    setToken("");
    setStep(0);
    setForm(initial);
    setFieldErrors({});
    setRegistration(null);
    setOtp("");
    setResendAt(0);
    setPhoto(null); setReceipt(null); setUtr(""); setAccepted(false); setEditingMobile(false);
    setError("");
    setMessage("");
  }
  const save = () =>
    execute(async () => {
      const r = await api.post("/registrations/start", form, { headers: { "Idempotency-Key": applicationKey.current } });
      setToken(r.data.token);
      setRegistration(r.data.registration);
      setStep(1);
      const sent = await api.post(
        "/registrations/otp/send",
        {},
        { headers: draftHeaders() },
      );
      setMessage(sent.data.message);
      setResendAt(Date.now() + (sent.data.cooldownSeconds || 45) * 1000);
    });
  const send = () =>
    execute(async () => {
      const r = await api.post(
        "/registrations/otp/send",
        {},
        { headers: draftHeaders() },
      );
      setMessage(r.data.message);
      setResendAt(Date.now() + (r.data.cooldownSeconds || 45) * 1000);
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
  const editMobile = () => {
    setMobileInput(registration?.guardianPhone || form.guardianPhone);
    setEditingMobile(true);
  };
  const saveMobile = () => execute(async () => {
    const { data } = await api.patch('/registrations/mobile', { guardianPhone: mobileInput }, { headers: draftHeaders() });
    setRegistration(data.registration); setEditingMobile(false); setOtp(''); setResendAt(0); setStep(1);
    setForm(f => ({ ...f, guardianPhone: mobileInput })); setMessage(data.message);
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
  const downloadReceipt = () =>
    execute(async () => {
      const headers = draftHeaders();
      const { data } = await api.get("/registrations/me", { headers });
      const latest = data.registration;
      setRegistration(latest);
      const confirmed = latest.status === "CONFIRMED";
      const r = await api.get(confirmed ? "/registrations/admit-card" : "/registrations/application-receipt", {
        headers, responseType: "blob",
      });
      downloadBlob(r.data, confirmed ? `${latest.registrationNumber}-admit-card.pdf` : "Shree Ram Exam of Excellence 2026.pdf");
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
          <ErrorBox message={settingsError || error} />
          {settingsError && <button type="button" className="btn light" disabled={loading} onClick={reloadSettings}>{loading ? 'Connecting...' : 'Retry connection'}</button>}
          {message && (
            <div className="success" role="status" aria-live="polite">
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
                        autoCapitalize={capitalFields.has(key) ? "characters" : "off"}
                        required={!["email", "purpose"].includes(key)}
                        maxLength={fieldMaxLength(key)}
                        inputMode={['guardianPhone', 'pincode'].includes(key) ? 'numeric' : undefined}
                        min={key === 'dob' ? '1995-01-01' : undefined}
                        max={key === 'dob' ? new Date().toLocaleDateString('en-CA') : undefined}
                        aria-invalid={!!fieldErrors[key]}
                        aria-describedby={fieldErrors[key] ? `${key}-error` : undefined}
                        value={form[key]}
                        onChange={(e) => {
                          const value = cleanRegistrationInput(key, e.target.value);
                          update(key, value);
                          const issue = registrationFieldError(key, value);
                          e.target.setCustomValidity(issue);
                          setFieldErrors(previous => ({...previous, [key]: previous[key] ? issue : ''}));
                        }}
                        onBlur={(e) => {
                          const issue = registrationFieldError(key, e.target.value);
                          e.target.setCustomValidity(issue);
                          setFieldErrors(previous => ({...previous, [key]: issue}));
                        }}
                        onInvalid={(e) => setFieldErrors(previous => ({...previous, [key]: registrationFieldError(key, e.target.value) || e.target.validationMessage}))}
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
                    {fieldErrors[key] && <small id={`${key}-error`} role="alert" style={{color: "#b42318"}}>{fieldErrors[key]}</small>}
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
                disabled={busy || loading || !!settingsError || !settings.registrationOpen}
                className="btn primary wide"
              >
                {busy ? "Saving..." : "Continue to mobile verification"}{" "}
                <ArrowRight size={18} />
              </button>
              {!loading && !settingsError && !settings.registrationOpen && (
                <p className="hint">
                  Registration is currently closed. Please contact the school
                  for the opening date.
                </p>
              )}
            </form>
          )}
          {editingMobile && (
            <form className="step-panel" onSubmit={e => { e.preventDefault(); saveMobile(); }}>
              <label><span>Parent/guardian mobile number (+91)</span>
                <input autoFocus type="tel" inputMode="numeric" autoComplete="tel-national" required pattern="[6-9][0-9]{9}" maxLength={10}
                  value={mobileInput} onChange={e => setMobileInput(e.target.value.replace(/\D/g, ''))} />
              </label>
              <button className="btn primary" disabled={busy}>Save and verify mobile</button>
              <button type="button" className="btn light" disabled={busy} onClick={() => setEditingMobile(false)}>Cancel</button>
            </form>
          )}
          {step === 1 && !editingMobile && (
            <div className="step-panel">
              <div className="circle-icon">
                <ShieldCheck size={34} />
              </div>
              <h2>Verify guardian mobile</h2>
              <p>
                Request a six-digit code for +91 {registration?.guardianPhone}.
                SMS arrival is not guaranteed. Codes expire according to the SMS service;
                request a new code if yours has expired.
              </p>
              <label>
                <span>Enter six-digit OTP</span>
                <input
                  autoFocus
                  autoComplete="one-time-code"
                  aria-label="Six-digit verification code"
                  onKeyDown={e => { if (e.key === 'Enter' && otp.length === 6 && !busy) verify(); }}
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
              <button
                className="btn light wide"
                disabled={busy || resendSeconds > 0}
                onClick={send}
              >
                {resendSeconds > 0
                  ? `Resend OTP in ${resendSeconds}s`
                  : resendAt ? "Resend OTP" : "Send OTP"}
              </button>
              <button
                className="btn light wide"
                disabled={busy}
                onClick={editMobile}
              >
                Edit mobile number
              </button>
            </div>
          )}
          {step === 2 && !editingMobile && (
            <div className="step-panel">
              <div className="form-head">
                <IndianRupee />
                <div>
                  <h2>Registration payment</h2>
                  <p>Mobile number verified · fee ₹{settings.fee}</p>
                  {registration?.status === 'OTP_VERIFIED' && <button className="link-button" disabled={busy} onClick={editMobile}>Edit mobile number</button>}
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

                </>
              )}
              {Number(settings.fee) === 149 && (
                <figure className="payment-promo">
                  <img src={img("srps-payment.png")} alt="Student and guardian exploring online school payments" width="1536" height="1024" loading="lazy" />
                  <figcaption>Use the payment details provided above. Keep your payment reference ready; confirmation follows school verification.</figcaption>
                </figure>
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
              {registration?.status !== "CONFIRMED" && (
                <button className="btn outlined-dark wide" disabled={busy} onClick={downloadReceipt}>
                  Download application receipt PDF <Download size={18} />
                </button>
              )}
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
            src={img("srps-registration.png")}
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
