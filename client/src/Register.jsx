import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  FileText,
  IndianRupee,
  ShieldCheck,
  Upload,
  Download,
  AlertCircle,
  X,
  Search,
  Users,
  User,
  MapPin,
  Phone,
  Mail,
  Calendar,
  GraduationCap,
  Info,
  HelpCircle,
  Check,
  ExternalLink,
  CreditCard,
  Zap,
  Landmark,
  Wallet,
  Lock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  PhonePeBadge,
  GooglePayBadge,
  PaytmBadge,
  UpiBadge,
  RuPayBadge,
  VisaBadge,
  MastercardBadge,
  BankIcon,
} from "./PaymentLogos.jsx";
import { notify } from "./notifications.js";
import { formatPublicDate } from "./publicDisplay.js";
import {
  api,
  draftHeaders,
  getToken,
  setToken,
  downloadBlob,
  img,
} from "./api.js";
import {
  cleanRegistrationInput,
  registrationFieldError,
  fieldMaxLength,
} from "./registrationValidation.js";
import { translations } from "./registrationTranslations.js";
import "./registration-progress.css";

const initialForm = {
  studentName: "",
  dob: "",
  gender: "",
  studentClass: "",
  course: "",
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

const participationPurposes = [
  "School admission",
  "Assess my knowledge",
  "Scholarship opportunity",
  "Win prizes and gifts",
  "Competitive exam practice",
];

export function Register({ settings, loading, settingsError, reloadSettings }) {
  // Language: Strictly English
  const lang = "en";
  const t = translations.en;
  useEffect(() => {
    try {
      localStorage.removeItem("shree_reg_lang_v2");
      localStorage.setItem("shree_reg_lang_v2", "en");
    } catch {}
  }, []);

  const [form, setForm] = useState(initialForm);
  // wizardStep: 1 = Details, 2 = Verify Email OTP, 3 = Pay Fee QR, 4 = Submit Payment Details, 5 = Confirmation
  const [wizardStep, setWizardStep] = useState(1);
  const [otp, setOtp] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [registration, setRegistration] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [utr, setUtr] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [otpAction, setOtpAction] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    loadRazorpayScript();
    if (typeof window !== "undefined") {
      window.__setWizardStep = setWizardStep;
      window.__setRegistration = setRegistration;
      window.__setForm = setForm;
    }
  }, []);
  const [submittedAttempt, setSubmittedAttempt] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [showUtrGuide, setShowUtrGuide] = useState(false);
  const [paymentTab, setPaymentTab] = useState("online");

  // Inline WhatsApp Mobile OTP Verification states
  const [mobileVerified, setMobileVerified] = useState(false);
  const [mobileOtpCode, setMobileOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpSentOnce, setOtpSentOnce] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [mobileOtpError, setMobileOtpError] = useState("");
  const [otpSentMessage, setOtpSentMessage] = useState("");
  const [mobileVerificationToken, setMobileVerificationToken] = useState("");
  const [whatsappConsent, setWhatsappConsent] = useState(true);
  const [consentExpanded, setConsentExpanded] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);


  // Resume Registration modal states
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeIdentifier, setResumeIdentifier] = useState("");
  const [resumeStep, setResumeStep] = useState("input"); // 'input' | 'otp' | 'recovery-otp' | 'select'
  const [resumeLookupToken, setResumeLookupToken] = useState("");
  const [resumeToken, setResumeToken] = useState("");
  const [resumeOtp, setResumeOtp] = useState("");
  const [resumeApplications, setResumeApplications] = useState([]);
  const [resumeMaskedEmail, setResumeMaskedEmail] = useState("");
  const [resumeBusy, setResumeBusy] = useState(false);
  const [recoveryAppRef, setRecoveryAppRef] = useState("");

  const running = useRef(false);
  const applicationKey = useRef(crypto.randomUUID());

  // Handle URL tokens from email reminders (?recoveryToken=... or ?optOutToken=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const recoveryToken = params.get("recoveryToken");
    const optOutToken = params.get("optOutToken");

    if (recoveryToken) {
      setResumeBusy(true);
      api
        .post("/registrations/recovery/validate", { recoveryToken })
        .then(({ data }) => {
          setResumeLookupToken(data.lookupToken);
          setResumeMaskedEmail(data.maskedPhone || data.maskedEmail || "");
          setRecoveryAppRef(data.applicationRef);
          setResumeStep("recovery-otp");
          setResumeOtp("");
          setResumeOpen(true);
        })
        .catch((err) => {
          notify.error(
            err.message ||
            ("Recovery link is expired or invalid. You can resume your application using your registered mobile number.")
          );
          setResumeStep("input");
          setResumeOpen(true);
        })
        .finally(() => {
          setResumeBusy(false);
          window.history.replaceState({}, "", window.location.pathname);
        });
    } else if (optOutToken) {
      api
        .post("/registrations/recovery/opt-out", { recoveryToken: optOutToken })
        .then(({ data }) => {
          notify.success(
            data.message ||
            ("You have been unsubscribed from reminder emails.")
          );
        })
        .catch((err) => {
          notify.error(err.message || "Could not process opt-out request.");
        })
        .finally(() => {
          window.history.replaceState({}, "", window.location.pathname);
        });
    }
  }, [lang]);

  // OTP Countdown timer
  useEffect(() => {
    const updateCountdown = () =>
      setResendSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    updateCountdown();
    if (!resendAt) return undefined;
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  // Session countdown active check

  // Restore current session if active token exists in localStorage
  useEffect(() => {
    if (getToken()) {
      api
        .get("/registrations/me", { headers: draftHeaders() })
        .then(({ data }) => {
          const reg = data.registration;
          setRegistration(reg);
          setResendAt(
            data.resendAvailableAt ? Date.parse(data.resendAvailableAt) : 0
          );
          setForm({
            studentName: reg.studentName || "",
            dob: reg.dob || "",
            gender: reg.gender || "",
            studentClass: reg.studentClass || "",
            course: reg.course || "",
            currentSchool: reg.currentSchool || "",
            guardianName: reg.guardianName || "",
            guardianPhone: reg.guardianPhone || "",
            email: reg.email || "",
            address: reg.address || "",
            city: reg.city || "",
            district: reg.district || "",
            state: reg.state || "HARYANA",
            pincode: reg.pincode || "",
            purpose: reg.purpose || "",
            consent: true,
          });

          // Determine current wizard step
          if (
            reg.status === "CONFIRMED" ||
            reg.status === "PAYMENT_UNDER_VERIFICATION"
          ) {
            setWizardStep(5);
          } else {
            setWizardStep(1);
          }
        })
        .catch((e) => {
          if ([401, 404, 410].includes(e.status)) setToken("");
          else
            notify.error(
              "Could not restore your application session. Please reload."
            );
        });
    }
  }, [lang]);

  // Async executor wrapper
  async function execute(fn) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify.error(e.message || "An unexpected error occurred.");
      if (e.status === 401 || e.status === 410) {
        setToken("");
        setRegistration(null);
        setWizardStep(1);
        applicationKey.current = crypto.randomUUID();
        setEditingEmail(false);
        setOtp("");
        setResendAt(0);
      } else if ([403, 409].includes(e.status) && getToken()) {
        const latest = await api
          .get("/registrations/me", { headers: draftHeaders() })
          .catch(() => null);
        if (latest?.data.registration.status === "DRAFT") {
          setRegistration(latest.data.registration);
          setWizardStep(1);
          setOtp("");
        }
      } else if ([429, 502, 503].includes(e.status) && getToken()) {
        const latest = await api
          .get("/registrations/me", { headers: draftHeaders() })
          .catch(() => null);
        if (latest) setResendAt(Date.parse(latest.data.resendAvailableAt) || 0);
      }
    } finally {
      running.current = false;
      setBusy(false);
      setOtpAction("");
    }
  }

  const updateField = (key, value) => {
    const cleaned = cleanRegistrationInput(key, value);
    setForm((prev) => ({ ...prev, [key]: cleaned }));
    // If the field was already in error state, clear error once valid
    if (fieldErrors[key]) {
      const err = registrationFieldError(key, cleaned, lang);
      if (!err) {
        setFieldErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    }
  };

  const handleBlurField = (key, value) => {
    // Only display errors on blur if user has attempted to submit or actually entered content
    if (submittedAttempt || (typeof value === "string" && value.trim().length > 0)) {
      const err = registrationFieldError(key, value, lang);
      setFieldErrors((prev) => ({ ...prev, [key]: err }));
    }
  };

  // Reset entire form
  function resetAll() {
    applicationKey.current = crypto.randomUUID();
    setToken("");
    setWizardStep(1);
    setForm(initialForm);
    setFieldErrors({});
    setSubmittedAttempt(false);
    setRegistration(null);
    setOtp("");
    setResendAt(0);
    setPhoto(null);
    setPhotoPreview(null);
    setReceipt(null);
    setReceiptPreview(null);
    setUtr("");
    setTermsAccepted(false);
    setEditingEmail(false);
  }

  // Register another sibling (preserves guardian info, resets student details)
  function registerAnotherSibling() {
    applicationKey.current = crypto.randomUUID();
    setToken("");
    setWizardStep(1);
    setSubmittedAttempt(false);
    setForm((prev) => ({
      studentName: "",
      dob: "",
      gender: "",
      studentClass: "",
      course: "",
      currentSchool: prev.currentSchool || "",
      guardianName: prev.guardianName,
      guardianPhone: prev.guardianPhone,
      email: prev.email,
      address: prev.address,
      city: prev.city,
      district: prev.district,
      state: prev.state || "HARYANA",
      pincode: prev.pincode,
      purpose: "",
      consent: true,
    }));
    setFieldErrors({});
    setRegistration(null);
    setOtp("");
    setResendAt(0);
    setPhoto(null);
    setPhotoPreview(null);
    setReceipt(null);
    setReceiptPreview(null);
    setUtr("");
    setTermsAccepted(false);
    setEditingEmail(false);
    notify.success("Ready for sibling");
  }

  // ==========================================
  // RAZORPAY GATEWAY SDK LOADER & LAUNCHER
  // ==========================================
  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (typeof window !== "undefined" && window.Razorpay) return resolve(true);
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const launchRazorpayCheckout = async (activeReg = null) => {
    const reg = activeReg || registration;
    const loaded = await loadRazorpayScript();
    if (!loaded) {
      throw new Error(
        "Failed to load Razorpay payment gateway. Please check your internet connection."
      );
    }

    const { data } = await api.post(
      "/registrations/razorpay/order",
      { termsAccepted: true },
      { headers: draftHeaders() }
    );

    const studentName = reg?.studentName || form.studentName;
    const studentEmail = reg?.email || form.email;
    const guardianPhone =
      reg?.guardianPhone || form.guardianPhone || form.phone;

    return new Promise((resolve) => {
      const options = {
        key: data.key,
        amount: data.amount,
        currency: data.currency || "INR",
        name: "Shree Ram Public School",
        description: `Shree Olympiad 2027 Registration Fee — ${studentName}`,
        image: window.location.origin + "/images/school-logo.png",
        order_id: data.orderId,
        prefill: {
          name: studentName,
          email: studentEmail || `student_${guardianPhone}@shreeolympiad.in`,
          contact: guardianPhone,
          method: "upi",
        },
        config: {
          display: {
            blocks: {
              upi: {
                name: "Pay via UPI (Google Pay, PhonePe, Paytm)",
                instruments: [
                  {
                    method: "upi",
                  },
                ],
              },
              card: {
                name: "Debit & Credit Cards",
                instruments: [
                  {
                    method: "card",
                  },
                ],
              },
              netbanking: {
                name: "Net Banking (All Indian Banks)",
                instruments: [
                  {
                    method: "netbanking",
                  },
                ],
              },
              wallet: {
                name: "Wallets",
                instruments: [
                  {
                    method: "wallet",
                  },
                ],
              },
            },
            sequence: ["block.upi", "block.card", "block.netbanking", "block.wallet"],
            preferences: {
              show_default_blocks: true,
            },
          },
        },
        theme: {
          color: "#073657",
        },
        modal: {
          backdropclose: false,
          escape: false,
          ondismiss: () => {
            notify.info(
              `Payment window closed. Click 'Submit & Pay' to complete your ₹${settings.fee || 2} fee payment anytime.`
            );
            resolve(false);
          },
        },
        handler: async (response) => {
          try {
            setBusy(true);
            const verifyRes = await api.post(
              "/registrations/razorpay/verify",
              {
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              },
              { headers: draftHeaders() }
            );

            setRegistration(verifyRes.data.registration);
            setWizardStep(5);
            notify.success("Payment success");
            resolve(true);
          } catch (err) {
            notify.error(err.message || "Payment verification failed.");
            resolve(false);
          } finally {
            setBusy(false);
          }
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (response) => {
        const desc =
          response.error?.description || "Payment failed. Please try again.";
        notify.error(desc);
      });
      rzp.open();
    });
  };

  // ==========================================
  // STEP 1: SAVE DRAFT & UPLOAD PHOTO
  // ==========================================
  const handleSaveStep1 = () =>
    execute(async () => {
      setSubmittedAttempt(true);
      // Validate all required fields
      const errors = {};
      const requiredKeys = [
        "studentName",
        "dob",
        "gender",
        "studentClass",
        ...(form.studentClass === "11" ? ["course"] : []),
        "currentSchool",
        "guardianName",
        "guardianPhone",
        "city",
        "district",
        "state",
        "pincode",
      ];
      for (const k of requiredKeys) {
        const err = registrationFieldError(k, form[k], lang);
        if (err) errors[k] = err;
      }
      if (!form.consent) {
        errors.consent = t.errorTermsRequired || "Please confirm the declaration before submitting.";
      }
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        notify.error(
          "Please fill in all required fields marked with an asterisk (*)."
        );
        return;
      }

      // Check Mobile WhatsApp OTP verification requirement
      if (!mobileVerified) {
        setMobileOtpError(
          "Please verify your mobile number with WhatsApp OTP before proceeding."
        );
        notify.error(
          "Please verify your mobile number via WhatsApp OTP before proceeding."
        );
        const otpEl = document.getElementById("mobileOtp") || document.getElementById("guardianPhone");
        if (otpEl) otpEl.focus();
        return;
      }

      // Check photo requirement
      if (!registration?.photoUploaded && !photo) {
        throw new Error(t.errorPhotoRequired);
      }

      let current = registration;
      if (!current) {
        const villageValue = form.city?.trim() || "";
        const synthesizedAddress = form.address?.trim()
          ? form.address.trim()
          : villageValue.length >= 5
            ? villageValue
            : `VILLAGE ${villageValue}`;

        const payload = {
          ...form,
          whatsappConsent: true,
          mobileVerificationToken,
          address: synthesizedAddress,
        };

        const r = await api.post("/registrations/start", payload, {
          headers: { "Idempotency-Key": applicationKey.current },
        });
        setToken(r.data.token);
        current = r.data.registration;
        setRegistration(current);
        if (r.data.resumed) {
          notify.info(
            r.data.message ||
            ("Restored existing application for this student.")
          );
        }
      }

      // Upload photo if new photo selected
      if (photo) {
        if (
          !["image/jpeg", "image/png"].includes(photo.type) ||
          photo.size > 5 * 1024 * 1024
        ) {
          throw new Error(t.errorPhotoInvalid);
        }
        const fd = new FormData();
        fd.append("photo", photo);
        await api.post("/registrations/photo", fd, {
          headers: draftHeaders(),
          timeout: 45000,
        });
        current = { ...current, photoUploaded: true };
        setRegistration(current);
      }

      // Directly launch Razorpay payment popup!
      setTermsAccepted(true);
      await launchRazorpayCheckout(current);
    });

  // ==========================================
  // ==========================================
  // INLINE WHATSAPP OTP HANDLERS (STEP 1)
  // ==========================================
  const handleSendWhatsAppOtp = async () => {
    const phoneErr = registrationFieldError("guardianPhone", form.guardianPhone, lang);
    if (phoneErr) {
      setFieldErrors((prev) => ({ ...prev, guardianPhone: phoneErr }));
      notify.error(phoneErr);
      return;
    }
    setOtpSending(true);
    setMobileOtpError("");
    try {
      const res = await api.post("/whatsapp/otp/send", {
        mobile: form.guardianPhone,
      });
      setOtpSentOnce(true);
      setOtpCooldown(res.data.resendAvailableIn || 60);
      setOtpSentMessage(
        res.data.message ||
        ("OTP sent to your WhatsApp number.")
      );
      notify.success("WhatsApp OTP sent");
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        ("Failed to send WhatsApp OTP.");
      setMobileOtpError(msg);
      notify.error(msg);
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyWhatsAppOtp = async () => {
    if (!mobileOtpCode || mobileOtpCode.trim().length !== 6) {
      const msg =
        "Please enter the 6-digit WhatsApp OTP.";
      setMobileOtpError(msg);
      notify.error(msg);
      return;
    }
    setOtpVerifying(true);
    setMobileOtpError("");
    try {
      const res = await api.post("/whatsapp/otp/verify", {
        mobile: form.guardianPhone,
        otp: mobileOtpCode.trim(),
      });
      setMobileVerified(true);
      setMobileVerificationToken(res.data.verificationToken || "verified");
      setOtpSentMessage("");
      notify.success("WhatsApp verified");
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        ("Invalid WhatsApp OTP code.");
      setMobileOtpError(msg);
      notify.error(msg);
    } finally {
      setOtpVerifying(false);
    }
  };

  // ==========================================
  // STEP 2: EMAIL OTP HANDLERS
  // ==========================================
  const handleSendOtp = () =>
    execute(async () => {
      setOtpAction("send");
      setOtp("");
      const r = await api.post(
        "/registrations/otp/send",
        {},
        { headers: draftHeaders() }
      );
      notify.success(r.data.message);
      setResendAt(
        Date.parse(r.data.resendAvailableAt) ||
        Date.now() + (r.data.cooldownSeconds || 60) * 1000
      );
    });

  const handleVerifyOtp = () =>
    execute(async () => {
      if (otp.length !== 6) {
        throw new Error(t.errorOtpInvalid);
      }
      setOtpAction("verify");
      const r = await api.post(
        "/registrations/otp/verify",
        { otp },
        { headers: draftHeaders() }
      );
      setRegistration(r.data.registration);
      setWizardStep(3);
      notify.success(
        r.data.message ||
        ("Email verified successfully.")
      );
    });

  const handleSaveEmail = () =>
    execute(async () => {
      const emailErr = registrationFieldError("email", emailInput, lang);
      if (emailErr) throw new Error(emailErr);
      const { data } = await api.patch(
        "/registrations/email",
        { email: emailInput },
        { headers: draftHeaders() }
      );
      setRegistration(data.registration);
      setEditingEmail(false);
      setOtp("");
      setResendAt(0);
      setWizardStep(2);
      setForm((f) => ({ ...f, email: emailInput }));
      notify.success(data.message);
    });

  // STEP 2: MANUAL/FALLBACK RAZORPAY PAYMENT TRIGGER
  const handleRazorpayPayment = (regParam = null) =>
    execute(async () => {
      await launchRazorpayCheckout(regParam || registration);
    });

  // Download application receipt
  const handleDownloadReceipt = () =>
    execute(async () => {
      const headers = draftHeaders();
      const { data } = await api.get("/registrations/me", { headers });
      const latest = data.registration;
      setRegistration(latest);
      const r = await api.get("/registrations/application-receipt", {
        headers,
        responseType: "blob",
      });
      const fileRef =
        latest.registrationNumber || latest.applicationRef || "SHREE-2027";
      downloadBlob(
        r.data,
        `${fileRef}-application-receipt.pdf`,
      );
    });

  // Download admit card
  const handleDownloadAdmit = () =>
    execute(async () => {
      const r = await api.get("/registrations/admit-card", {
        headers: draftHeaders(),
        responseType: "blob",
      });
      downloadBlob(
        r.data,
        `${registration.registrationNumber || "SHREE-admit-card"}.pdf`
      );
    });

  // ==========================================
  // RESUME REGISTRATION MODAL HANDLERS
  // ==========================================
  async function handleResumeRequest(e) {
    e?.preventDefault();
    if (!resumeIdentifier.trim()) return;
    setResumeBusy(true);
    try {
      const { data } = await api.post("/registrations/resume/request", {
        identifier: resumeIdentifier.trim(),
      });
      setResumeLookupToken(data.lookupToken);
      setResumeMaskedEmail(data.maskedPhone || data.maskedEmail || "");
      setResumeStep("otp");
      notify.success("WhatsApp OTP sent");
    } catch (err) {
      notify.error(err.message || "Application not found");
    } finally {
      setResumeBusy(false);
    }
  }

  async function handleResumeVerify(e) {
    e?.preventDefault();
    if (!resumeOtp.trim() || resumeOtp.length !== 6) return;
    setResumeBusy(true);
    try {
      const { data } = await api.post(
        "/registrations/resume/verify",
        { otp: resumeOtp.trim() },
        { headers: { Authorization: `Bearer ${resumeLookupToken}` } }
      );
      if (data.applications?.length === 1) {
        await handleResumeSelect(data.applications[0].id, data.resumeToken);
      } else {
        setResumeApplications(data.applications || []);
        setResumeToken(data.resumeToken);
        setResumeStep("select");
      }
    } catch (err) {
      notify.error(
        err.message ||
        ("Incorrect verification code.")
      );
    } finally {
      setResumeBusy(false);
    }
  }

  async function handleResumeSelect(selectedId, tokenToUse = resumeToken) {
    setResumeBusy(true);
    try {
      const { data } = await api.post(
        "/registrations/resume/select",
        { registrationId: selectedId },
        { headers: { Authorization: `Bearer ${tokenToUse}` } }
      );
      setToken(data.token);
      setRegistration(data.registration);
      const reg = data.registration;
      setForm({
        studentName: reg.studentName || "",
        dob: reg.dob || "",
        gender: reg.gender || "",
        studentClass: reg.studentClass || "",
        course: reg.course || "",
        currentSchool: reg.currentSchool || "",
        guardianName: reg.guardianName || "",
        guardianPhone: reg.guardianPhone || "",
        email: reg.email || "",
        address: reg.address || "",
        city: reg.city || "",
        district: reg.district || "",
        state: reg.state || "HARYANA",
        pincode: reg.pincode || "",
        purpose: reg.purpose || "",
        consent: true,
      });

      if (
        reg.status === "CONFIRMED" ||
        reg.status === "PAYMENT_UNDER_VERIFICATION"
      ) {
        setWizardStep(5);
      } else {
        setWizardStep(1);
      }

      setResumeOpen(false);
      setResumeIdentifier("");
      setResumeStep("input");
      setResumeOtp("");
      notify.success("Application restored");
    } catch (err) {
      notify.error(err.message || "Failed to restore application session.");
    } finally {
      setResumeBusy(false);
    }
  }

  async function handleRecoveryVerify(e) {
    if (e) e.preventDefault();
    if (resumeOtp.length !== 6) return;
    setResumeBusy(true);
    try {
      const { data } = await api.post(
        "/registrations/recovery/verify",
        { otp: resumeOtp },
        { headers: { Authorization: `Bearer ${resumeLookupToken}` } }
      );
      setToken(data.token);
      setRegistration(data.registration);
      const reg = data.registration;
      setForm({
        studentName: reg.studentName || "",
        dob: reg.dob || "",
        gender: reg.gender || "",
        studentClass: reg.studentClass || "",
        course: reg.course || "",
        currentSchool: reg.currentSchool || "",
        guardianName: reg.guardianName || "",
        guardianPhone: reg.guardianPhone || "",
        email: reg.email || "",
        address: reg.address || "",
        city: reg.city || "",
        district: reg.district || "",
        state: reg.state || "HARYANA",
        pincode: reg.pincode || "",
        purpose: reg.purpose || "",
        consent: true,
      });

      if (
        reg.status === "CONFIRMED" ||
        reg.status === "PAYMENT_UNDER_VERIFICATION"
      ) {
        setWizardStep(5);
      } else {
        setWizardStep(1);
      }

      setResumeOpen(false);
      setResumeStep("input");
      setResumeOtp("");
      notify.success(
        `Welcome back! Application for ${reg.studentName} (${reg.applicationRef}) has been restored.`
      );
    } catch (err) {
      notify.error(
        err.message ||
        ("Invalid verification code. Please check your email and try again.")
      );
    } finally {
      setResumeBusy(false);
    }
  }

  return (
    <main className="register-page">
      <div className="registration-container">
        {/* ===================================================================
            1. PROFESSIONAL HEADER (MATCHING REFERENCE IMAGE 1)
            =================================================================== */}
        <header className="shree-form-header">
          <div className="shree-logo-wrap">
            <img
              src="/images/school-logo.png"
              alt="Shree Ram Public School"
              className="shree-school-logo"
            />
          </div>
          <div className="shree-header-text">
            <h1 className="shree-form-title">Student Registration Form</h1>
            <p className="shree-form-subtitle">
              Fill out the form to register for Shree Ram Exam of Excellence 2027. Official Online Application.
            </p>
            <div className="shree-meta-pills">
              <span className="shree-meta-pill">
                <strong>Registration Fee:</strong> ₹{settings.fee != null ? settings.fee : 2}
              </span>
              <span className="shree-meta-pill">
                <strong>Examination Date:</strong>{" "}
                {formatPublicDate(settings.examDate) || "12 Jan 2027"}
              </span>
              <span className="shree-meta-pill">
                <strong>Eligible Classes:</strong> Class 2 to 11
              </span>
            </div>
          </div>
        </header>

        {/* Settings Error / Warning */}
        {settingsError && (
          <div
            className="gov-instructions-card"
            style={{ borderLeftColor: "#DC2626", background: "#FEF2F2", marginBottom: "16px" }}
          >
            <div className="gov-instructions-head" style={{ color: "#DC2626" }}>
              <AlertCircle size={16} />
              <span>{settingsError}</span>
            </div>
            <button
              type="button"
              className="gov-btn-secondary"
              style={{ minHeight: "34px", padding: "4px 12px", marginTop: "8px" }}
              disabled={loading}
              onClick={reloadSettings}
            >
              {loading ? "Connecting..." : "Retry Connection"}
            </button>
          </div>
        )}


        {/* ===================================================================
            3. MAIN FORM CARD: STEP 1 (STUDENT & PARENT DETAILS)
            =================================================================== */}
        {wizardStep === 1 && (
          <form
            className="shree-form-card"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveStep1();
            }}
          >
            {/* Section 1: Student Information */}
            <div className="shree-section-head">
              <h2>Student Information</h2>
            </div>

            <div className="shree-grid-2">
              {/* Student Full Name */}
              <div className="shree-field">
                <label htmlFor="studentName" className="shree-label">
                  Student Full Name <span className="req">*</span>
                </label>
                <input
                  id="studentName"
                  type="text"
                  required
                  maxLength={fieldMaxLength("studentName")}
                  className={`shree-input ${fieldErrors.studentName ? "has-error" : ""}`}
                  value={form.studentName}
                  placeholder="Full name as per school records"
                  onChange={(e) => updateField("studentName", e.target.value)}
                  onBlur={(e) => handleBlurField("studentName", e.target.value)}
                />
                {fieldErrors.studentName && (
                  <span className="shree-error-text">
                    <AlertCircle size={13} /> {fieldErrors.studentName}
                  </span>
                )}
              </div>

              {/* Date of Birth */}
              <div className="shree-field">
                <label htmlFor="dob" className="shree-label">
                  Date of Birth <span className="req">*</span>
                </label>
                <input
                  id="dob"
                  type="date"
                  required
                  min="1995-01-01"
                  max={new Date().toLocaleDateString("en-CA")}
                  className={`shree-input ${fieldErrors.dob ? "has-error" : ""}`}
                  value={form.dob}
                  onChange={(e) => updateField("dob", e.target.value)}
                  onBlur={(e) => handleBlurField("dob", e.target.value)}
                />
                {fieldErrors.dob && (
                  <span className="shree-error-text">
                    <AlertCircle size={13} /> {fieldErrors.dob}
                  </span>
                )}
              </div>

              {/* Gender (Male / Female Radio Pills) */}
              <div className="shree-field">
                <label className="shree-label">
                  Gender <span className="req">*</span>
                </label>
                <div className="shree-radio-group">
                  <label className={`shree-radio-pill ${form.gender === "MALE" ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="gender"
                      value="MALE"
                      checked={form.gender === "MALE"}
                      onChange={() => {
                        updateField("gender", "MALE");
                        handleBlurField("gender", "MALE");
                      }}
                    />
                    <span className="shree-radio-circle" />
                    <span>Male</span>
                  </label>
                  <label className={`shree-radio-pill ${form.gender === "FEMALE" ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="gender"
                      value="FEMALE"
                      checked={form.gender === "FEMALE"}
                      onChange={() => {
                        updateField("gender", "FEMALE");
                        handleBlurField("gender", "FEMALE");
                      }}
                    />
                    <span className="shree-radio-circle" />
                    <span>Female</span>
                  </label>
                </div>
                {fieldErrors.gender && (
                  <span className="shree-error-text">
                    <AlertCircle size={13} /> {fieldErrors.gender}
                  </span>
                )}
              </div>

              {/* Class */}
              <div className="shree-field">
                <label htmlFor="studentClass" className="shree-label">
                  Class <span className="req">*</span>
                </label>
                <select
                  id="studentClass"
                  required
                  className={`shree-select ${fieldErrors.studentClass ? "has-error" : ""}`}
                  value={form.studentClass}
                  onChange={(e) => {
                    const nextClass = e.target.value;
                    updateField("studentClass", nextClass);
                    if (nextClass !== "11") {
                      updateField("course", "");
                      setFieldErrors((prev) => {
                        const copy = { ...prev };
                        delete copy.course;
                        return copy;
                      });
                    }
                  }}
                  onBlur={(e) => handleBlurField("studentClass", e.target.value)}
                >
                  <option value="">Select Class</option>
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((cls) => (
                    <option key={cls} value={String(cls)}>
                      {`Class ${cls}`}
                    </option>
                  ))}
                </select>
                {fieldErrors.studentClass && (
                  <span className="shree-error-text">
                    <AlertCircle size={13} /> {fieldErrors.studentClass}
                  </span>
                )}
              </div>

              {/* Stream (if Class 11) */}
              {form.studentClass === "11" && (
                <div className="shree-field shree-field-full">
                  <label htmlFor="course" className="shree-label">
                    Stream (for Class 11) <span className="req">*</span>
                  </label>
                  <select
                    id="course"
                    required
                    className={`shree-select ${fieldErrors.course ? "has-error" : ""}`}
                    value={form.course}
                    onChange={(e) => {
                      updateField("course", e.target.value);
                      if (fieldErrors.course) {
                        setFieldErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.course;
                          return copy;
                        });
                      }
                    }}
                    onBlur={(e) => handleBlurField("course", e.target.value)}
                  >
                    <option value="">Select Stream</option>
                    <option value="PCM">PCM (Physics, Chemistry, Maths)</option>
                    <option value="PCB">PCB (Physics, Chemistry, Biology)</option>
                    <option value="COMMERCE">Commerce</option>
                    <option value="ARTS">Arts</option>
                  </select>
                  {fieldErrors.course && (
                    <span className="shree-error-text">
                      <AlertCircle size={13} /> {fieldErrors.course}
                    </span>
                  )}
                </div>
              )}

              {/* Current School */}
              <div className="shree-field">
                <label htmlFor="currentSchool" className="shree-label">
                  Current School Name <span className="req">*</span>
                </label>
                <input
                  id="currentSchool"
                  type="text"
                  required
                  maxLength={fieldMaxLength("currentSchool")}
                  className={`shree-input ${fieldErrors.currentSchool ? "has-error" : ""}`}
                  value={form.currentSchool}
                  placeholder="School currently studying in"
                  onChange={(e) => updateField("currentSchool", e.target.value)}
                  onBlur={(e) => handleBlurField("currentSchool", e.target.value)}
                />
                {fieldErrors.currentSchool && (
                  <span className="shree-error-text">
                    <AlertCircle size={13} /> {fieldErrors.currentSchool}
                  </span>
                )}
              </div>

              {/* Passport Photo Upload */}
              <div className="shree-field">
                <label className="shree-label">
                  Student Passport-Size Photo <span className="req">*</span>
                </label>
                <label className="shree-photo-card" htmlFor="student-photo-input">
                  <input
                    id="student-photo-input"
                    type="file"
                    accept="image/jpeg,image/png"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (file) {
                        if (
                          !["image/jpeg", "image/png"].includes(file.type) ||
                          file.size > 5 * 1024 * 1024
                        ) {
                          notify.error("Please upload a JPG or PNG image under 5 MB.");
                          setPhoto(null);
                          setPhotoPreview(null);
                          return;
                        }
                        setPhoto(file);
                        setPhotoPreview(URL.createObjectURL(file));
                      }
                    }}
                  />
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="shree-photo-thumb" />
                  ) : registration?.photoUploaded ? (
                    <div className="shree-photo-badge-success">
                      <CheckCircle2 size={16} />
                    </div>
                  ) : (
                    <div className="shree-photo-badge">
                      <Upload size={14} />
                    </div>
                  )}
                  <div className="shree-photo-meta">
                    <span className="shree-photo-title">
                      {photo
                        ? photo.name
                        : registration?.photoUploaded
                        ? "Photo uploaded ✓"
                        : "Upload photo (JPG/PNG)"}
                    </span>
                    <span className="shree-photo-hint">Max file size 5 MB</span>
                  </div>
                  <span className="shree-photo-btn">
                    {photo || registration?.photoUploaded ? "Change" : "Browse"}
                  </span>
                </label>
              </div>
            </div>

            {/* Section 2: Contact Information */}
            <div className="shree-section-head">
              <h2>Contact Information</h2>
            </div>

            <div className="shree-grid-2">
              {/* Guardian Name */}
              <div className="shree-field">
                <label htmlFor="guardianName" className="shree-label">
                  Father / Guardian Full Name <span className="req">*</span>
                </label>
                <input
                  id="guardianName"
                  type="text"
                  required
                  maxLength={fieldMaxLength("guardianName")}
                  className={`shree-input ${fieldErrors.guardianName ? "has-error" : ""}`}
                  value={form.guardianName}
                  placeholder="Father / Guardian full name"
                  onChange={(e) => updateField("guardianName", e.target.value)}
                  onBlur={(e) => handleBlurField("guardianName", e.target.value)}
                />
                {fieldErrors.guardianName && (
                  <span className="shree-error-text">
                    <AlertCircle size={13} /> {fieldErrors.guardianName}
                  </span>
                )}
              </div>

              {/* Mobile Number & Dynamic WhatsApp OTP */}
              <div className="shree-field">
                <label htmlFor="guardianPhone" className="shree-label">
                  WhatsApp Mobile Number <span className="req">*</span>
                </label>
                {!mobileVerified ? (
                  !otpSentOnce ? (
                    /* State A: Phone Input + Send OTP */
                    <div className="shree-input-btn-group">
                      <input
                        id="guardianPhone"
                        type="tel"
                        inputMode="numeric"
                        required
                        maxLength={10}
                        className={`shree-input ${fieldErrors.guardianPhone ? "has-error" : ""}`}
                        value={form.guardianPhone}
                        placeholder="10-digit mobile number"
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                          updateField("guardianPhone", val);
                          setMobileOtpError("");
                          setOtpSentMessage("");
                        }}
                        onBlur={(e) => handleBlurField("guardianPhone", e.target.value)}
                      />
                      <button
                        type="button"
                        className="shree-action-btn primary"
                        disabled={
                          otpSending ||
                          otpCooldown > 0 ||
                          !form.guardianPhone ||
                          form.guardianPhone.length !== 10
                        }
                        onClick={handleSendWhatsAppOtp}
                      >
                        {otpSending
                          ? "Sending..."
                          : otpCooldown > 0
                          ? `Resend (${otpCooldown}s)`
                          : "Send OTP"}
                      </button>
                    </div>
                  ) : (
                    /* State B: In-place Dynamic OTP Verification */
                    <div className="shree-dynamic-otp-card">
                      <div className="shree-otp-card-top">
                        <span className="shree-otp-msg">
                          OTP sent via WhatsApp to <strong>+91 {form.guardianPhone}</strong>
                        </span>
                        <button
                          type="button"
                          className="shree-link-btn"
                          onClick={() => {
                            setOtpSentOnce(false);
                            setMobileOtpCode("");
                            setMobileOtpError("");
                            setOtpSentMessage("");
                          }}
                        >
                          Change Number
                        </button>
                      </div>

                      <div className="shree-input-btn-group">
                        <input
                          id="mobileOtp"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          autoFocus
                          className={`shree-input ${mobileOtpError ? "has-error" : ""}`}
                          value={mobileOtpCode}
                          placeholder="6-digit OTP"
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                            setMobileOtpCode(val);
                            setMobileOtpError("");
                          }}
                        />
                        <button
                          type="button"
                          className="shree-action-btn success"
                          disabled={otpVerifying || mobileOtpCode.trim().length !== 6}
                          onClick={handleVerifyWhatsAppOtp}
                        >
                          {otpVerifying ? "Verifying..." : "Verify OTP"}
                        </button>

                        {otpCooldown > 0 ? (
                          <span className="shree-cooldown-tag">{otpCooldown}s</span>
                        ) : (
                          <button
                            type="button"
                            className="shree-action-btn secondary"
                            disabled={otpSending}
                            onClick={handleSendWhatsAppOtp}
                          >
                            Resend
                          </button>
                        )}
                      </div>

                      {mobileOtpError && (
                        <span className="shree-error-text">
                          <AlertCircle size={13} /> {mobileOtpError}
                        </span>
                      )}
                    </div>
                  )
                ) : (
                  /* State C: WhatsApp Verified In-Place */
                  <div className="shree-verified-pill-box">
                    <div className="shree-verified-pill-left">
                      <span className="shree-phone-val">+91 {form.guardianPhone}</span>
                      <span className="shree-verified-badge">
                        <CheckCircle2 size={13} /> WhatsApp Verified
                      </span>
                    </div>
                    <button
                      type="button"
                      className="shree-link-btn"
                      onClick={() => {
                        setMobileVerified(false);
                        setOtpSentOnce(false);
                        setMobileOtpCode("");
                        setOtpSentMessage("");
                      }}
                    >
                      Change Number
                    </button>
                  </div>
                )}

                {fieldErrors.guardianPhone && !otpSentOnce && !mobileVerified && (
                  <span className="shree-error-text">
                    <AlertCircle size={13} /> {fieldErrors.guardianPhone}
                  </span>
                )}
              </div>
            </div>

            {/* Section 3: Address */}
            <div className="shree-section-head">
              <h2>Address</h2>
            </div>

            <div className="shree-grid-2">
              {/* Village / City */}
              <div className="shree-field shree-field-full">
                <label htmlFor="city" className="shree-label">
                  Street / Village / City <span className="req">*</span>
                </label>
                <input
                  id="city"
                  type="text"
                  required
                  maxLength={fieldMaxLength("city")}
                  className={`shree-input ${fieldErrors.city ? "has-error" : ""}`}
                  value={form.city}
                  placeholder="Village, town, or city address"
                  onChange={(e) => updateField("city", e.target.value)}
                  onBlur={(e) => handleBlurField("city", e.target.value)}
                />
                {fieldErrors.city && (
                  <span className="shree-error-text">
                    <AlertCircle size={13} /> {fieldErrors.city}
                  </span>
                )}
              </div>

              {/* District */}
              <div className="shree-field">
                <label htmlFor="district" className="shree-label">
                  District <span className="req">*</span>
                </label>
                <input
                  id="district"
                  type="text"
                  required
                  maxLength={fieldMaxLength("district")}
                  className={`shree-input ${fieldErrors.district ? "has-error" : ""}`}
                  value={form.district}
                  placeholder="District"
                  onChange={(e) => updateField("district", e.target.value)}
                  onBlur={(e) => handleBlurField("district", e.target.value)}
                />
                {fieldErrors.district && (
                  <span className="shree-error-text">
                    <AlertCircle size={13} /> {fieldErrors.district}
                  </span>
                )}
              </div>

              {/* State */}
              <div className="shree-field">
                <label htmlFor="state" className="shree-label">
                  State <span className="req">*</span>
                </label>
                <input
                  id="state"
                  type="text"
                  required
                  maxLength={fieldMaxLength("state")}
                  className="shree-input"
                  value={form.state}
                  placeholder="State"
                  onChange={(e) => updateField("state", e.target.value)}
                />
              </div>

              {/* PIN Code */}
              <div className="shree-field">
                <label htmlFor="pincode" className="shree-label">
                  PIN Code <span className="req">*</span>
                </label>
                <input
                  id="pincode"
                  type="tel"
                  inputMode="numeric"
                  required
                  maxLength={fieldMaxLength("pincode")}
                  className={`shree-input ${fieldErrors.pincode ? "has-error" : ""}`}
                  value={form.pincode}
                  placeholder="6-digit PIN code"
                  onChange={(e) => updateField("pincode", e.target.value)}
                  onBlur={(e) => handleBlurField("pincode", e.target.value)}
                />
                {fieldErrors.pincode && (
                  <span className="shree-error-text">
                    <AlertCircle size={13} /> {fieldErrors.pincode}
                  </span>
                )}
              </div>
            </div>

            {/* Consent Checkbox */}
            <div className="shree-consent-box">
              <label className="shree-consent-label checkline" htmlFor="consentCheckbox">
                <input
                  id="consentCheckbox"
                  type="checkbox"
                  required
                  checked={form.consent}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, consent: e.target.checked }));
                  }}
                  className="shree-checkbox"
                />
                <span className="shree-consent-text">
                  {consentExpanded ? (
                    <>
                      I confirm that all student and contact details provided are accurate for Shree Olympiad 2027 registration.{" "}
                      <button
                        type="button"
                        className="shree-see-more-btn"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setConsentExpanded(false);
                        }}
                      >
                        See less
                      </button>
                    </>
                  ) : (
                    <>
                      I confirm that all details provided are accurate...{" "}
                      <button
                        type="button"
                        className="shree-see-more-btn"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setConsentExpanded(true);
                        }}
                      >
                        See more
                      </button>
                    </>
                  )}
                </span>
              </label>
              {fieldErrors.consent && (
                <span className="shree-error-text" style={{ marginTop: "4px" }}>
                  <AlertCircle size={13} /> {fieldErrors.consent}
                </span>
              )}
            </div>

            {/* Submit Action */}
            <div className="shree-submit-row">
              <button
                type="submit"
                className="shree-submit-btn"
                disabled={
                  busy ||
                  loading ||
                  !!settingsError ||
                  !settings.registrationOpen
                }
              >
                {busy ? "Saving Details..." : "Submit & Pay"}{" "}
                <ArrowRight size={18} />
              </button>
            </div>
          </form>
        )}

        {/* ===================================================================
            8. STEP 5: CONFIRMATION SCREEN (APPLICATION SUBMITTED)
            =================================================================== */}
        {wizardStep === 5 && (
          <div className="gov-form-card gov-confirm-card">
            <div className="gov-confirm-seal">
              <CheckCircle2 size={44} />
            </div>
            <h2>{t.confirmTitle}</h2>
            <p>{t.confirmSub}</p>

            {/* Review Status Alert Box */}
            {registration?.status === "CONFIRMED" ? (
              <div
                className="gov-review-notice-box"
                style={{
                  background: "#ECFDF5",
                  borderColor: "#A7F3D0",
                  color: "#065F46",
                }}
              >
                <div
                  className="gov-review-badge"
                  style={{ background: "#10B981", color: "#FFFFFF" }}
                >
                  ✓ {"Registration Confirmed"}
                </div>
                <strong style={{ color: "#065F46" }}>
                  {"Payment Verified & Official Admit Card Issued Successfully!"}
                </strong>
                <p style={{ color: "#047857" }}>
                  {"Your permanent registration number has been assigned. You can now download your Admit Card and Payment Receipt below."}
                </p>
              </div>
            ) : (
              <div className="gov-review-notice-box">
                <div className="gov-review-badge">
                  ⏳ {t.reviewBadge}
                </div>
                <strong>{t.reviewNoticeTitle}</strong>
                <p>{t.reviewNoticeBody}</p>
              </div>
            )}

            {/* Confirmation Summary Details Table */}
            <div className="gov-confirm-table">
              <div className="gov-confirm-row">
                <span className="gov-confirm-label">{t.confirmStudent}</span>
                <span className="gov-confirm-value">
                  {registration?.studentName}
                </span>
              </div>
              <div className="gov-confirm-row">
                <span className="gov-confirm-label">{t.confirmRef}</span>
                <span
                  className="gov-confirm-value"
                  style={{
                    color: "#087EB8",
                    fontFamily: "monospace",
                    fontSize: "1rem",
                  }}
                >
                  {registration?.applicationRef}
                </span>
              </div>
              <div className="gov-confirm-row">
                <span className="gov-confirm-label">{t.confirmClass}</span>
                <span className="gov-confirm-value">
                  {`Class ${registration?.studentClass}${registration?.studentClass === "11" && registration?.course
                    ? ` (${registration.course})`
                    : ""
                  }`}
                </span>
              </div>
              <div className="gov-confirm-row">
                <span className="gov-confirm-label">{t.confirmGuardian}</span>
                <span className="gov-confirm-value">
                  {registration?.guardianName} ({registration?.guardianPhone})
                </span>
              </div>
              {registration?.email ? (
                <div className="gov-confirm-row">
                  <span className="gov-confirm-label">{t.confirmEmail}</span>
                  <span className="gov-confirm-value">{registration.email}</span>
                </div>
              ) : null}
              {registration?.status === "CONFIRMED" && (
                <div className="gov-confirm-row">
                  <span className="gov-confirm-label">Registration Number</span>
                  <span
                    className="gov-confirm-value"
                    style={{ color: "#238653" }}
                  >
                    {registration?.registrationNumber}
                  </span>
                </div>
              )}
              {utr && (
                <div className="gov-confirm-row">
                  <span className="gov-confirm-label">{t.confirmUtr}</span>
                  <span className="gov-confirm-value">{utr}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="gov-confirm-actions">
              {registration && (
                <button
                  type="button"
                  className="gov-btn-primary"
                  disabled={busy}
                  onClick={handleDownloadReceipt}
                >
                  <Download size={18} /> {t.btnDownloadReceipt}
                </button>
              )}

              {registration?.status === "CONFIRMED" && (
                <button
                  type="button"
                  className="gov-btn-primary"
                  style={{ background: "#238653" }}
                  disabled={busy}
                  onClick={handleDownloadAdmit}
                >
                  <Download size={18} /> {t.btnDownloadAdmit}
                </button>
              )}

              <Link to="/status" className="gov-btn-secondary">
                <Search size={16} /> {t.btnCheckStatus}
              </Link>

              <button
                type="button"
                className="gov-btn-secondary"
                onClick={registerAnotherSibling}
              >
                <Users size={16} /> {t.btnRegisterSibling}
              </button>

              <button
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748B",
                  fontSize: "0.86rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: "8px",
                }}
                onClick={resetAll}
              >
                {t.btnStartNew}
              </button>
            </div>
          </div>
        )}

        {/* Collapsible Guidelines Accordion */}
        <div className="gov-guidelines-accordion" style={{ marginTop: "24px" }}>
          <button
            type="button"
            className="gov-guidelines-toggle"
            onClick={() => setShowInstructions((prev) => !prev)}
            aria-expanded={showInstructions}
          >
            <span className="gov-guidelines-toggle-left">
              <Info size={16} />
              {t.instructionsTitle || ("Important Guidelines")}
            </span>
            <span className="gov-guidelines-toggle-right" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              {showInstructions ? (
                <>
                  <span>{"Hide"}</span>
                  <ChevronUp size={15} />
                </>
              ) : (
                <>
                  <span>{"View"}</span>
                  <ChevronDown size={15} />
                </>
              )}
            </span>
          </button>
          {showInstructions && (
            <div className="gov-guidelines-body">
              <ul>
                <li>{t.inst1}</li>
                <li>{t.inst2}</li>
                <li>{t.inst3}</li>
                <li>{t.inst4}</li>
                <li>{t.inst5}</li>
              </ul>
            </div>
          )}
        </div>

        {/* Minimal Support & Helpdesk Strip */}
        <footer className="gov-help-strip">
          <div className="gov-help-strip-left">
            <HelpCircle size={16} style={{ color: "#0284C7" }} />
            <span>{t.helpTitle || ("Helpdesk Support")}</span>
            <span className="gov-help-hours">
              ({t.helpHours || ("Mon - Sat: 9:00 AM - 5:00 PM")})
            </span>
          </div>
          <div className="gov-help-strip-right">
            <a href="tel:8199991081" className="gov-help-pill-compact">
              <Phone size={14} />
              <span>8199991081</span>
            </a>
            <a href="mailto:srpskanhra@gmail.com" className="gov-help-pill-compact">
              <Mail size={14} />
              <span>srpskanhra@gmail.com</span>
            </a>
          </div>
        </footer>

        {/* ===================================================================
            10. RESUME REGISTRATION MODAL
            =================================================================== */}
        {resumeOpen && (
          <div
            className="gov-modal-backdrop"
            onClick={() => setResumeOpen(false)}
          >
            <div
              className="gov-modal-card"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="resume-modal-title"
            >
              <div className="gov-modal-head">
                <div>
                  <h3 id="resume-modal-title">{t.resumeModalTitle}</h3>
                  <p>{t.resumeModalSub}</p>
                </div>
                <button
                  type="button"
                  className="gov-modal-close"
                  onClick={() => setResumeOpen(false)}
                  aria-label="Close dialog"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Step 1: Input Identifier */}
              {resumeStep === "input" && (
                <form
                  onSubmit={handleResumeRequest}
                  className="gov-modal-body"
                >
                  <div className="gov-field-group">
                    <label className="gov-field-label">
                      <span className="gov-label-text">{t.resumeInputLabel}</span>
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder={t.resumeInputPlaceholder}
                      className="gov-input"
                      value={resumeIdentifier}
                      onChange={(e) => setResumeIdentifier(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="gov-btn-primary gov-btn-wide"
                    disabled={resumeBusy || !resumeIdentifier.trim()}
                  >
                    {resumeBusy ? t.resumeSearching : t.resumeSearchBtn}
                  </button>
                </form>
              )}

              {/* Step 2: Verify OTP for Resume */}
              {resumeStep === "otp" && (
                <form
                  onSubmit={handleResumeVerify}
                  className="gov-modal-body"
                >
                  <p style={{ margin: 0, fontSize: "0.88rem", color: "#475569" }}>
                    {t.resumeOtpSub(resumeMaskedEmail)}
                  </p>
                  <div className="gov-field-group">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      autoFocus
                      placeholder="123456"
                      className="gov-otp-input-field"
                      value={resumeOtp}
                      onChange={(e) =>
                        setResumeOtp(
                          e.target.value.replace(/\D/g, "").slice(0, 6)
                        )
                      }
                    />
                  </div>
                  <button
                    type="submit"
                    className="gov-btn-primary gov-btn-wide"
                    disabled={resumeBusy || resumeOtp.length !== 6}
                  >
                    {resumeBusy ? t.btnVerifying : t.resumeVerifyBtn}
                  </button>
                  <button
                    type="button"
                    className="gov-btn-secondary gov-btn-wide"
                    onClick={() => setResumeStep("input")}
                  >
                    {t.resumeBackBtn}
                  </button>
                </form>
              )}

              {/* Step 2b: Recovery Link OTP */}
              {resumeStep === "recovery-otp" && (
                <form
                  onSubmit={handleRecoveryVerify}
                  className="gov-modal-body"
                >
                  <div
                    style={{
                      background: "#F8FAFC",
                      border: "1px solid #E2E8F0",
                      padding: "12px 14px",
                      borderRadius: "8px",
                    }}
                  >
                    <strong style={{ color: "#193651", display: "block" }}>
                      {recoveryAppRef}
                    </strong>
                    <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "#64748B" }}>
                      {t.resumeOtpSub(resumeMaskedEmail)}
                    </p>
                  </div>
                  <div className="gov-field-group">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      autoFocus
                      placeholder="123456"
                      className="gov-otp-input-field"
                      value={resumeOtp}
                      onChange={(e) =>
                        setResumeOtp(
                          e.target.value.replace(/\D/g, "").slice(0, 6)
                        )
                      }
                    />
                  </div>
                  <button
                    type="submit"
                    className="gov-btn-primary gov-btn-wide"
                    disabled={resumeBusy || resumeOtp.length !== 6}
                  >
                    {resumeBusy ? t.btnVerifying : t.resumeVerifyBtn}
                  </button>
                  <button
                    type="button"
                    className="gov-btn-secondary gov-btn-wide"
                    onClick={() => setResumeStep("input")}
                  >
                    {t.resumeBackBtn}
                  </button>
                </form>
              )}

              {/* Step 3: Multiple Siblings Application Picker */}
              {resumeStep === "select" && (
                <div className="gov-modal-body">
                  <p style={{ margin: 0, fontSize: "0.88rem", color: "#475569" }}>
                    {t.resumeSelectDesc}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      maxHeight: "280px",
                      overflowY: "auto",
                    }}
                  >
                    {resumeApplications.map((app) => (
                      <div
                        key={app.id}
                        className="gov-sibling-student-card"
                      >
                        <div>
                          <strong>{app.studentName}</strong>
                          <span>
                            {`Class ${app.studentClass}${app.studentClass === "11" && app.course ? ` (${app.course})` : ""}`}{" "}
                            · {app.applicationRef}
                          </span>
                          <small>
                            Status: {app.status?.replaceAll("_", " ")}
                          </small>
                        </div>
                        <button
                          type="button"
                          className="gov-btn-primary"
                          style={{
                            minHeight: "36px",
                            padding: "6px 14px",
                            fontSize: "0.84rem",
                          }}
                          disabled={resumeBusy}
                          onClick={() => handleResumeSelect(app.id)}
                        >
                          {t.resumeContinueBtn}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
export default Register;
