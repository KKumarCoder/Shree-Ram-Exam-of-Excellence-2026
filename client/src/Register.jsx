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
  RotateCcw,
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
} from "lucide-react";
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
  // Language State: defaults to English ('en') as requested, with Hindi toggle available
  const [lang, setLang] = useState(() => {
    return localStorage.getItem("shree_reg_lang_v2") || "en";
  });
  const t = translations[lang] || translations.en;

  const toggleLanguage = () => {
    const nextLang = lang === "hi" ? "en" : "hi";
    setLang(nextLang);
    localStorage.setItem("shree_reg_lang_v2", nextLang);
  };

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
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [showUtrGuide, setShowUtrGuide] = useState(false);
  const [paymentTab, setPaymentTab] = useState(
    settings?.paymentMode === "manual" ? "manual" : "online"
  );

  useEffect(() => {
    if (settings?.paymentMode === "manual") {
      setPaymentTab("manual");
    } else {
      setPaymentTab("online");
    }
  }, [settings?.paymentMode]);

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
          setResumeMaskedEmail(data.maskedEmail);
          setRecoveryAppRef(data.applicationRef);
          setResumeStep("recovery-otp");
          setResumeOtp("");
          setResumeOpen(true);
        })
        .catch((err) => {
          notify.error(
            err.message ||
            (lang === "hi"
              ? "रिकवरी लिंक अमान्य या समाप्त हो गया है। आप अपने ईमेल से आवेदन जारी रख सकते हैं।"
              : "Recovery link is expired or invalid. You can resume your application using your registered email.")
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
            (lang === "hi"
              ? "आपको ईमेल सूचनाओं से अनसब्सक्राइब कर दिया गया है।"
              : "You have been unsubscribed from reminder emails.")
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

  // Email verification expiration timer
  useEffect(() => {
    if (
      registration?.status !== "OTP_VERIFIED" ||
      !registration.verificationExpiresAt
    )
      return undefined;
    const timer = window.setTimeout(
      () => {
        setRegistration((s) => ({ ...s, status: "DRAFT", verified: false }));
        setWizardStep(registration.photoUploaded ? 2 : 1);
        setOtp("");
        notify.error(
          lang === "hi"
            ? "ईमेल सत्यापन समाप्त हो गया। कृपया पुनः सत्यापित करें।"
            : "Email verification expired. Please verify your email again."
        );
      },
      Math.max(0, Date.parse(registration.verificationExpiresAt) - Date.now())
    );
    return () => window.clearTimeout(timer);
  }, [
    registration?.status,
    registration?.verificationExpiresAt,
    registration?.photoUploaded,
    lang,
  ]);

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
          } else if (
            reg.status === "OTP_VERIFIED" ||
            reg.status === "PAYMENT_PENDING" ||
            reg.status === "PAYMENT_REJECTED"
          ) {
            setWizardStep(3);
          } else if (reg.photoUploaded) {
            setWizardStep(2);
          } else {
            setWizardStep(1);
          }
        })
        .catch((e) => {
          if ([401, 404, 410].includes(e.status)) setToken("");
          else
            notify.error(
              lang === "hi"
                ? "सत्र पुनर्प्राप्त नहीं हो सका। कृपया पृष्ठ पुनः लोड करें।"
                : "Could not restore your application session. Please reload."
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
          setWizardStep(latest.data.registration.photoUploaded ? 2 : 1);
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
    const err = registrationFieldError(key, cleaned, lang);
    setFieldErrors((prev) => ({ ...prev, [key]: err }));
  };

  const handleBlurField = (key, value) => {
    const err = registrationFieldError(key, value, lang);
    setFieldErrors((prev) => ({ ...prev, [key]: err }));
  };

  // Reset entire form
  function resetAll() {
    applicationKey.current = crypto.randomUUID();
    setToken("");
    setWizardStep(1);
    setForm(initialForm);
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
  }

  // Register another sibling (preserves guardian info, resets student details)
  function registerAnotherSibling() {
    applicationKey.current = crypto.randomUUID();
    setToken("");
    setWizardStep(1);
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
    notify.success(
      lang === "hi"
        ? "अभिभावक विवरण सुरक्षित रखा गया है। कृपया नए विद्यार्थी की जानकारी भरें।"
        : "Ready to register another sibling with existing guardian details."
    );
  }

  // ==========================================
  // STEP 1: SAVE DRAFT & UPLOAD PHOTO
  // ==========================================
  const handleSaveStep1 = () =>
    execute(async () => {
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
        "email",
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
        errors.consent = t.errorTermsRequired;
      }
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        notify.error(
          lang === "hi"
            ? "कृपया फॉर्म में चिह्नित सभी आवश्यक जानकारी सही भरें।"
            : "Please correct the highlighted fields before proceeding."
        );
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
            (lang === "hi"
              ? "इस विद्यार्थी का पूर्व में शुरू किया गया आवेदन बहाल किया गया।"
              : "Restored existing application for this student.")
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

      // If already OTP verified, jump to payment step 3
      if (current.status !== "DRAFT") {
        setWizardStep(3);
        notify.success(
          lang === "hi" ? "विद्यार्थी विवरण सुरक्षित है।" : "Student details verified."
        );
        return;
      }

      // Otherwise send OTP and advance to Step 2
      setWizardStep(2);
      setOtpAction("send");
      const sent = await api.post(
        "/registrations/otp/send",
        {},
        { headers: draftHeaders() }
      );
      notify.success(sent.data.message || t.otpSub);
      setResendAt(
        Date.parse(sent.data.resendAvailableAt) ||
        Date.now() + (sent.data.cooldownSeconds || 60) * 1000
      );
    });

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
        (lang === "hi"
          ? "ईमेल सफलतापूर्वक सत्यापित हो गया।"
          : "Email verified successfully.")
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

  // ==========================================
  // STEP 4: SUBMIT MANUAL PAYMENT PROOF
  // ==========================================
  const handleSubmitPayment = () =>
    execute(async () => {
      if (!receipt) {
        throw new Error(t.errorReceiptRequired);
      }
      if (
        !["image/jpeg", "image/png", "application/pdf"].includes(
          receipt.type
        ) ||
        receipt.size > 3 * 1024 * 1024
      ) {
        throw new Error(t.errorReceiptInvalid);
      }
      if (!termsAccepted) {
        throw new Error(t.errorTermsRequired);
      }

      const fd = new FormData();
      if (utr.trim()) {
        fd.append("utr", utr.trim());
      }
      fd.append("termsAccepted", "true");
      fd.append("receipt", receipt);

      const r = await api.post("/registrations/manual", fd, {
        headers: draftHeaders(),
        timeout: 45000,
      });

      setRegistration(r.data.registration);
      setWizardStep(5);
      notify.success(
        lang === "hi"
          ? "आपका आवेदन और भुगतान रसीद सफलतापूर्वक जमा हो गई है।"
          : "Application and payment proof submitted successfully."
      );
    });

  // Dynamically load Razorpay SDK
  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  // STEP 3 (ONLINE): PAY VIA RAZORPAY GATEWAY
  const handleRazorpayPayment = () =>
    execute(async () => {
      if (!termsAccepted) {
        throw new Error(
          lang === "hi"
            ? "कृपया ऑनलाइन भुगतान करने से पहले अभिभावक सहमति और नियम-शर्तें स्वीकार करें।"
            : "Please accept the terms and guardian declaration before payment."
        );
      }

      const loaded = await loadRazorpayScript();
      if (!loaded) {
        throw new Error(
          lang === "hi"
            ? "Razorpay गेटवे लोड नहीं हो सका। कृपया अपना इंटरनेट कनेक्शन जांचें।"
            : "Failed to load Razorpay payment gateway. Please check your internet connection."
        );
      }

      const { data } = await api.post(
        "/registrations/razorpay/order",
        { termsAccepted: true },
        { headers: draftHeaders() }
      );

      const studentName = registration?.studentName || form.studentName;
      const studentEmail = registration?.email || form.email;
      const guardianPhone =
        registration?.guardianPhone || form.guardianPhone || form.phone;

      const options = {
        key: data.key,
        amount: data.amount,
        currency: data.currency || "INR",
        name: settings?.eventName || "SHREE 2027 OLYMPIAD",
        description: `Olympiad Registration Fee — ${studentName}`,
        image: "/favicon.ico",
        order_id: data.orderId,
        prefill: {
          name: studentName,
          email: studentEmail,
          contact: guardianPhone,
        },
        theme: {
          color: "#073657",
        },
        modal: {
          backdropclose: false,
          escape: false,
          ondismiss: () => {
            notify.info(
              lang === "hi"
                ? "भुगतान विंडो बंद कर दी गई। आप दोबारा प्रयास कर सकते हैं।"
                : "Payment window closed. You can retry whenever you are ready."
            );
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
            notify.success(
              lang === "hi"
                ? "भुगतान सफल रहा! आपका पंजीकरण सफलतापूर्वक पूरा हुआ।"
                : "Payment successful! Your registration has been confirmed."
            );
          } catch (err) {
            notify.error(err.message || "Payment verification failed.");
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

  // Download application receipt
  const handleDownloadReceipt = () =>
    execute(async () => {
      const headers = draftHeaders();
      const { data } = await api.get("/registrations/me", { headers });
      const latest = data.registration;
      setRegistration(latest);
      const confirmed = latest.status === "CONFIRMED";
      const r = await api.get(
        confirmed
          ? "/registrations/admit-card"
          : "/registrations/application-receipt",
        { headers, responseType: "blob" }
      );
      downloadBlob(
        r.data,
        confirmed
          ? `${latest.registrationNumber || "SHREE-2027"}-admit-card.pdf`
          : `${latest.applicationRef || "SHREE-2027"}-application-receipt.pdf`
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
      setResumeMaskedEmail(data.maskedEmail);
      setResumeStep("otp");
      notify.success(
        data.message ||
        (lang === "hi"
          ? "सत्यापन कोड आपके ईमेल पर भेजा गया है।"
          : "Verification code sent to your email.")
      );
    } catch (err) {
      notify.error(err.message || "Failed to find application.");
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
        (lang === "hi" ? "गलत सत्यापन कोड।" : "Incorrect verification code.")
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
      } else if (
        reg.status === "OTP_VERIFIED" ||
        reg.status === "PAYMENT_PENDING" ||
        reg.status === "PAYMENT_REJECTED"
      ) {
        setWizardStep(3);
      } else if (reg.photoUploaded) {
        setWizardStep(2);
      } else {
        setWizardStep(1);
      }

      setResumeOpen(false);
      setResumeIdentifier("");
      setResumeStep("input");
      setResumeOtp("");
      notify.success(
        lang === "hi"
          ? `${reg.studentName} का आवेदन सफलतापूर्वक पुनः लोड कर लिया गया है।`
          : `Application restored for ${reg.studentName}.`
      );
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
      } else if (
        reg.status === "OTP_VERIFIED" ||
        reg.status === "PAYMENT_PENDING" ||
        reg.status === "PAYMENT_REJECTED"
      ) {
        setWizardStep(3);
      } else if (reg.photoUploaded) {
        setWizardStep(2);
      } else {
        setWizardStep(1);
      }

      setResumeOpen(false);
      setResumeStep("input");
      setResumeOtp("");
      notify.success(
        lang === "hi"
          ? `स्वागत है! ${reg.studentName} (${reg.applicationRef}) का आवेदन बहाल हो गया है।`
          : `Welcome back! Application for ${reg.studentName} (${reg.applicationRef}) has been restored.`
      );
    } catch (err) {
      notify.error(
        err.message ||
        (lang === "hi"
          ? "अमान्य सत्यापन कोड। कृपया दोबारा प्रयास करें।"
          : "Invalid verification code. Please check your email and try again.")
      );
    } finally {
      setResumeBusy(false);
    }
  }

  return (
    <main className="register-page">
      <div className="registration-container">
        {/* ===================================================================
            1. COMPACT OFFICIAL HEADER
            =================================================================== */}
        <div className="gov-header-card gov-compact-bar">
          <div className="gov-info-strip">
            <div className="gov-info-pill">
              <IndianRupee size={16} />
              <span>
                {t.badgeFee}: <strong>₹{settings.fee || 149}</strong>
              </span>
            </div>
            <div className="gov-info-pill">
              <Calendar size={16} />
              <span>
                {t.badgeDate}:{" "}
                <strong>
                  {formatPublicDate(settings.examDate) || t.badgeDateValue}
                </strong>
              </span>
            </div>
            <div className="gov-info-pill">
              <GraduationCap size={16} />
              <span>
                {t.badgeClasses}: <strong>{t.badgeClassesValue}</strong>
              </span>
            </div>
          </div>

          {/* Actions: Resume Previous Application & Language Switcher */}
          <div className="gov-top-actions">
            <button
              type="button"
              className="gov-resume-compact-btn"
              onClick={() => {
                setResumeOpen(true);
                setResumeStep("input");
              }}
              title={t.resumeBannerTitle}
            >
              <RotateCcw size={14} /> <span>{t.resumeBtn}</span>
            </button>
            <button
              type="button"
              className="lang-switcher-btn"
              onClick={toggleLanguage}
              title="Change Language / भाषा बदलें"
              aria-label="Toggle language between English and Hindi"
            >
              🌐 <strong>{t.langToggle}</strong>
            </button>
          </div>
        </div>


        {/* Settings Error / Warning */}
        {settingsError && (
          <div
            className="gov-instructions-card"
            style={{ borderLeftColor: "#DC2626", background: "#FEF2F2" }}
          >
            <div
              className="gov-instructions-head"
              style={{ color: "#DC2626" }}
            >
              <AlertCircle size={18} />
              <span>{settingsError}</span>
            </div>
            <button
              type="button"
              className="gov-btn-secondary"
              style={{ minHeight: "38px", padding: "6px 14px", marginTop: "8px" }}
              disabled={loading}
              onClick={reloadSettings}
            >
              {loading ? "Connecting..." : "Retry Connection"}
            </button>
          </div>
        )}

        {/* ===================================================================
            3. FOUR-STEP WIZARD STEPPER
            =================================================================== */}
        {wizardStep <= 4 && (
          <nav className="gov-stepper-card" aria-label="Registration Progress">
            {/* Desktop Stepper */}
            <div className="gov-stepper-grid">
              {(settings?.paymentMode === "razorpay" ||
              (settings?.paymentMode === "both" && paymentTab === "online")
                ? [
                    { num: 1, title: t.step1Title, sub: t.step1Short },
                    { num: 2, title: t.step2Title, sub: t.step2Short },
                    {
                      num: 3,
                      title:
                        lang === "hi" ? "ऑनलाइन भुगतान" : "Online Payment",
                      sub: lang === "hi" ? "Razorpay" : "Instant Pay",
                    },
                  ]
                : [
                    { num: 1, title: t.step1Title, sub: t.step1Short },
                    { num: 2, title: t.step2Title, sub: t.step2Short },
                    { num: 3, title: t.step3Title, sub: t.step3Short },
                    { num: 4, title: t.step4Title, sub: t.step4Short },
                  ]
              ).map((s) => {
                const isCompleted = s.num < wizardStep;
                const isActive = s.num === wizardStep;
                return (
                  <div
                    key={s.num}
                    className={`gov-step-item ${isActive ? "active" : ""} ${
                      isCompleted ? "completed" : ""
                    }`}
                  >
                    <div className="gov-step-num">
                      {isCompleted ? <Check size={18} /> : s.num}
                    </div>
                    <div className="gov-step-info">
                      <span className="gov-step-title">{s.title}</span>
                      <span className="gov-step-sub">{s.sub}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile Stepper View */}
            {(() => {
              const isOnline =
                settings?.paymentMode === "razorpay" ||
                (settings?.paymentMode === "both" && paymentTab === "online");
              const totalSteps = isOnline ? 3 : 4;
              const stepTitle =
                wizardStep === 1
                  ? t.step1Title
                  : wizardStep === 2
                    ? t.step2Title
                    : wizardStep === 3
                      ? isOnline
                        ? lang === "hi"
                          ? "ऑनलाइन भुगतान"
                          : "Online Payment"
                        : t.step3Title
                      : t.step4Title;
              const stepShort =
                wizardStep === 1
                  ? t.step1Short
                  : wizardStep === 2
                    ? t.step2Short
                    : wizardStep === 3
                      ? isOnline
                        ? "Razorpay"
                        : t.step3Short
                      : t.step4Short;
              return (
                <div className="gov-stepper-mobile">
                  <div className="gov-mobile-step-header">
                    <span>{stepTitle}</span>
                    <span className="gov-mobile-step-pill">
                      {t.stepIndicatorMobile(wizardStep, totalSteps, stepShort)}
                    </span>
                  </div>
                  <div className="gov-mobile-progress-bar">
                    <div
                      className="gov-mobile-progress-fill"
                      style={{
                        width: `${Math.min(100, (wizardStep / totalSteps) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })()}
          </nav>
        )}

        {/* ===================================================================
            4. MAIN FORM CARD: STEP 1 (STUDENT & PARENT DETAILS)
            =================================================================== */}
        {wizardStep === 1 && (
          <form
            className="gov-form-card"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveStep1();
            }}
          >
            {/* Group 1: Student Information */}
            <div className="form-group-heading">
              <span className="group-heading-icon">
                <User size={16} />
              </span>
              <h4>{lang === "hi" ? "विद्यार्थी विवरण" : "Student Details"}</h4>
            </div>

            <div className="gov-grid-2">
              {/* Student Full Name */}
              <div className="gov-field-group">
                <label htmlFor="studentName" className="gov-field-label">
                  <span className="gov-label-text">{t.studentName}</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="studentName"
                  type="text"
                  required
                  autoFocus
                  maxLength={fieldMaxLength("studentName")}
                  className={`gov-input ${
                    fieldErrors.studentName ? "is-invalid" : ""
                  }`}
                  value={form.studentName}
                  placeholder={t.studentNamePlaceholder}
                  onChange={(e) =>
                    updateField("studentName", e.target.value)
                  }
                  onBlur={(e) =>
                    handleBlurField("studentName", e.target.value)
                  }
                />
                {fieldErrors.studentName && (
                  <span className="gov-field-error">
                    <AlertCircle size={14} /> {fieldErrors.studentName}
                  </span>
                )}
              </div>

              {/* Date of Birth */}
              <div className="gov-field-group">
                <label htmlFor="dob" className="gov-field-label">
                  <span className="gov-label-text">{t.dob}</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="dob"
                  type="date"
                  required
                  min="1995-01-01"
                  max={new Date().toLocaleDateString("en-CA")}
                  className={`gov-input ${
                    fieldErrors.dob ? "is-invalid" : ""
                  }`}
                  value={form.dob}
                  onChange={(e) => updateField("dob", e.target.value)}
                  onBlur={(e) => handleBlurField("dob", e.target.value)}
                />
                {fieldErrors.dob && (
                  <span className="gov-field-error">
                    <AlertCircle size={14} /> {fieldErrors.dob}
                  </span>
                )}
              </div>

              {/* Gender */}
              <div className="gov-field-group">
                <label htmlFor="gender" className="gov-field-label">
                  <span className="gov-label-text">{t.gender}</span>
                  <span className="required-star">*</span>
                </label>
                <select
                  id="gender"
                  required
                  className={`gov-select ${
                    fieldErrors.gender ? "is-invalid" : ""
                  }`}
                  value={form.gender}
                  onChange={(e) => updateField("gender", e.target.value)}
                  onBlur={(e) => handleBlurField("gender", e.target.value)}
                >
                  <option value="">{t.selectGenderPlaceholder}</option>
                  <option value="MALE">{t.genderMale}</option>
                  <option value="FEMALE">{t.genderFemale}</option>
                </select>
                {fieldErrors.gender && (
                  <span className="gov-field-error">
                    <AlertCircle size={14} /> {fieldErrors.gender}
                  </span>
                )}
              </div>

              {/* Class */}
              <div className="gov-field-group">
                <label htmlFor="studentClass" className="gov-field-label">
                  <span className="gov-label-text">{t.studentClass}</span>
                  <span className="required-star">*</span>
                </label>
                <select
                  id="studentClass"
                  required
                  className={`gov-select ${
                    fieldErrors.studentClass ? "is-invalid" : ""
                  }`}
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
                  onBlur={(e) =>
                    handleBlurField("studentClass", e.target.value)
                  }
                >
                  <option value="">{t.selectClassPlaceholder}</option>
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((cls) => (
                    <option key={cls} value={String(cls)}>
                      {lang === "hi" ? `कक्षा ${cls}` : `Class ${cls}`}
                    </option>
                  ))}
                </select>
                {fieldErrors.studentClass && (
                  <span className="gov-field-error">
                    <AlertCircle size={14} /> {fieldErrors.studentClass}
                  </span>
                )}
              </div>

              {/* Course Dropdown (Only visible when Class 11 is selected) */}
              {form.studentClass === "11" && (
                <div className="gov-field-group">
                  <label htmlFor="course" className="gov-field-label">
                    <span className="gov-label-text">
                      {lang === "hi" ? "कोर्स (Course)" : "Course"}
                    </span>
                    <span className="required-star">*</span>
                  </label>
                  <select
                    id="course"
                    required
                    className={`gov-select ${
                      fieldErrors.course ? "is-invalid" : ""
                    }`}
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
                    <option value="">
                      {lang === "hi" ? "-- कोर्स चुनें --" : "-- Select Course --"}
                    </option>
                    <option value="PCM">PCM</option>
                    <option value="PCB">PCB</option>
                    <option value="COMMERCE">COMMERCE</option>
                    <option value="ARTS">ARTS</option>
                  </select>
                  {fieldErrors.course && (
                    <span className="gov-field-error">
                      <AlertCircle size={14} /> {fieldErrors.course}
                    </span>
                  )}
                </div>
              )}

              {/* Current School */}
              <div className="gov-field-group">
                <label htmlFor="currentSchool" className="gov-field-label">
                  <span className="gov-label-text">{t.currentSchool}</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="currentSchool"
                  type="text"
                  required
                  maxLength={fieldMaxLength("currentSchool")}
                  className={`gov-input ${
                    fieldErrors.currentSchool ? "is-invalid" : ""
                  }`}
                  value={form.currentSchool}
                  placeholder={t.currentSchoolPlaceholder}
                  onChange={(e) =>
                    updateField("currentSchool", e.target.value)
                  }
                  onBlur={(e) =>
                    handleBlurField("currentSchool", e.target.value)
                  }
                />
                {fieldErrors.currentSchool && (
                  <span className="gov-field-error">
                    <AlertCircle size={14} /> {fieldErrors.currentSchool}
                  </span>
                )}
              </div>

              {/* Compact Student Passport Photo */}
              <div className="gov-field-group">
                <label className="gov-field-label">
                  <span className="gov-label-text">{t.photoLabel}</span>
                  <span className="required-star">*</span>
                </label>
                <label className="gov-photo-compact" htmlFor="student-photo-input">
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
                          notify.error(t.errorPhotoInvalid);
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
                    <img
                      src={photoPreview}
                      alt="Student Preview"
                      className="gov-photo-compact-thumb"
                    />
                  ) : registration?.photoUploaded ? (
                    <div className="gov-photo-compact-thumb success">
                      <CheckCircle2 size={18} />
                    </div>
                  ) : (
                    <div className="gov-photo-compact-thumb">
                      <Upload size={16} />
                    </div>
                  )}
                  <span className="gov-photo-compact-text">
                    {photo
                      ? photo.name
                      : registration?.photoUploaded
                        ? t.photoUploadedBadge
                        : lang === "hi"
                          ? "फोटो चुनें (JPG/PNG, अधिकतम 5MB)"
                          : "Upload Photo (JPG/PNG, max 5MB)"}
                  </span>
                  <span className="gov-photo-compact-btn">
                    {photo || registration?.photoUploaded
                      ? lang === "hi"
                        ? "बदलें"
                        : "Change"
                      : lang === "hi"
                        ? "ब्राउज़"
                        : "Browse"}
                  </span>
                </label>
              </div>
            </div>

            {/* Group 2: Parent / Guardian Details */}
            <div className="form-group-heading">
              <span className="group-heading-icon">
                <Users size={16} />
              </span>
              <h4>{lang === "hi" ? "अभिभावक विवरण" : "Parent / Guardian Details"}</h4>
            </div>

            <div className="gov-grid-2">
              {/* Guardian Name */}
              <div className="gov-field-group">
                <label htmlFor="guardianName" className="gov-field-label">
                  <span className="gov-label-text">{t.guardianName}</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="guardianName"
                  type="text"
                  required
                  maxLength={fieldMaxLength("guardianName")}
                  className={`gov-input ${
                    fieldErrors.guardianName ? "is-invalid" : ""
                  }`}
                  value={form.guardianName}
                  placeholder={t.guardianNamePlaceholder}
                  onChange={(e) =>
                    updateField("guardianName", e.target.value)
                  }
                  onBlur={(e) =>
                    handleBlurField("guardianName", e.target.value)
                  }
                />
                {fieldErrors.guardianName && (
                  <span className="gov-field-error">
                    <AlertCircle size={14} /> {fieldErrors.guardianName}
                  </span>
                )}
              </div>

              {/* Guardian Mobile */}
              <div className="gov-field-group">
                <label htmlFor="guardianPhone" className="gov-field-label">
                  <span className="gov-label-text">{t.guardianPhone}</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="guardianPhone"
                  type="tel"
                  inputMode="numeric"
                  required
                  maxLength={fieldMaxLength("guardianPhone")}
                  className={`gov-input ${
                    fieldErrors.guardianPhone ? "is-invalid" : ""
                  }`}
                  value={form.guardianPhone}
                  placeholder={t.guardianPhonePlaceholder}
                  onChange={(e) =>
                    updateField("guardianPhone", e.target.value)
                  }
                  onBlur={(e) =>
                    handleBlurField("guardianPhone", e.target.value)
                  }
                />
                {fieldErrors.guardianPhone && (
                  <span className="gov-field-error">
                    <AlertCircle size={14} /> {fieldErrors.guardianPhone}
                  </span>
                )}
              </div>

              {/* Guardian Email */}
              <div className="gov-field-group gov-span-2">
                <label htmlFor="email" className="gov-field-label">
                  <span className="gov-label-text">{t.email}</span>
                  <span className="required-star">*</span>
                  <span className="gov-label-hint">
                    ({lang === "hi"
                      ? "OTP सत्यापन कोड इसी ईमेल पर भेजा जाएगा"
                      : "OTP verification code will be sent to this email"})
                  </span>
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  maxLength={fieldMaxLength("email")}
                  className={`gov-input ${
                    fieldErrors.email ? "is-invalid" : ""
                  }`}
                  value={form.email}
                  placeholder={t.emailPlaceholder}
                  onChange={(e) => updateField("email", e.target.value)}
                  onBlur={(e) => handleBlurField("email", e.target.value)}
                />
                {fieldErrors.email && (
                  <span className="gov-field-error">
                    <AlertCircle size={14} /> {fieldErrors.email}
                  </span>
                )}
              </div>
            </div>

            {/* Group 3: Address & Location Details */}
            <div className="form-group-heading">
              <span className="group-heading-icon">
                <MapPin size={16} />
              </span>
              <h4>{lang === "hi" ? "स्थान एवं पता" : "Address & Location"}</h4>
            </div>

            <div className="gov-grid-2">
              {/* Village / Town / City */}
              <div className="gov-field-group">
                <label htmlFor="city" className="gov-field-label">
                  <span className="gov-label-text">{t.city}</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="city"
                  type="text"
                  required
                  maxLength={fieldMaxLength("city")}
                  className={`gov-input ${
                    fieldErrors.city ? "is-invalid" : ""
                  }`}
                  value={form.city}
                  placeholder={t.cityPlaceholder}
                  onChange={(e) => updateField("city", e.target.value)}
                  onBlur={(e) => handleBlurField("city", e.target.value)}
                />
                {fieldErrors.city && (
                  <span className="gov-field-error">
                    <AlertCircle size={14} /> {fieldErrors.city}
                  </span>
                )}
              </div>

              {/* District */}
              <div className="gov-field-group">
                <label htmlFor="district" className="gov-field-label">
                  <span className="gov-label-text">{t.district}</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="district"
                  type="text"
                  required
                  maxLength={fieldMaxLength("district")}
                  className={`gov-input ${
                    fieldErrors.district ? "is-invalid" : ""
                  }`}
                  value={form.district}
                  placeholder={t.districtPlaceholder}
                  onChange={(e) => updateField("district", e.target.value)}
                  onBlur={(e) => handleBlurField("district", e.target.value)}
                />
                {fieldErrors.district && (
                  <span className="gov-field-error">
                    <AlertCircle size={14} /> {fieldErrors.district}
                  </span>
                )}
              </div>

              {/* PIN Code */}
              <div className="gov-field-group">
                <label htmlFor="pincode" className="gov-field-label">
                  <span className="gov-label-text">{t.pincode}</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="pincode"
                  type="tel"
                  inputMode="numeric"
                  required
                  maxLength={fieldMaxLength("pincode")}
                  className={`gov-input ${
                    fieldErrors.pincode ? "is-invalid" : ""
                  }`}
                  value={form.pincode}
                  placeholder={t.pincodePlaceholder}
                  onChange={(e) => updateField("pincode", e.target.value)}
                  onBlur={(e) => handleBlurField("pincode", e.target.value)}
                />
                {fieldErrors.pincode && (
                  <span className="gov-field-error">
                    <AlertCircle size={14} /> {fieldErrors.pincode}
                  </span>
                )}
              </div>

              {/* State */}
              <div className="gov-field-group">
                <label htmlFor="state" className="gov-field-label">
                  <span className="gov-label-text">{t.state}</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="state"
                  type="text"
                  required
                  maxLength={fieldMaxLength("state")}
                  className="gov-input"
                  value={form.state}
                  onChange={(e) => updateField("state", e.target.value)}
                />
              </div>
            </div>

            {/* Consent Checkbox */}
            <label className="gov-consent-box">
              <input
                type="checkbox"
                required
                checked={form.consent}
                onChange={(e) =>
                  setForm((f) => ({ ...f, consent: e.target.checked }))
                }
              />
              <span>{t.consentLabel}</span>
            </label>
            {fieldErrors.consent && (
              <p className="gov-field-error" style={{ marginBottom: "14px" }}>
                <AlertCircle size={14} /> {fieldErrors.consent}
              </p>
            )}

            {/* Submit Action */}
            <div className="gov-actions-row">
              <button
                type="submit"
                className="gov-btn-primary gov-btn-wide"
                disabled={
                  busy ||
                  loading ||
                  !!settingsError ||
                  !settings.registrationOpen
                }
              >
                {busy ? t.btnSaving : t.btnSaveDraft} <ArrowRight size={18} />
              </button>
            </div>
          </form>
        )}

        {/* ===================================================================
            5. MAIN FORM CARD: STEP 2 (VERIFY EMAIL OTP)
            =================================================================== */}
        {wizardStep === 2 && (
          <div className="gov-form-card">
            {editingEmail ? (
              /* Inline Edit Email Box */
              <div className="gov-otp-card">
                <h2>{t.editEmailTitle}</h2>
                <div className="gov-field-group" style={{ textAlign: "left", marginTop: "16px" }}>
                  <label htmlFor="edit-email-input" className="gov-field-label">
                    <span className="gov-label-text">{t.email}</span>
                  </label>
                  <input
                    id="edit-email-input"
                    type="email"
                    autoFocus
                    required
                    value={emailInput}
                    className="gov-input"
                    onChange={(e) => setEmailInput(e.target.value.trim())}
                  />
                </div>
                <div className="gov-actions-row" style={{ marginTop: "16px" }}>
                  <button
                    type="button"
                    className="gov-btn-primary"
                    disabled={busy || !emailInput.trim()}
                    onClick={handleSaveEmail}
                  >
                    {t.saveEmailBtn}
                  </button>
                  <button
                    type="button"
                    className="gov-btn-secondary"
                    onClick={() => setEditingEmail(false)}
                  >
                    {t.cancelBtn}
                  </button>
                </div>
              </div>
            ) : (
              /* OTP Verification Form */
              <div className="gov-otp-card">
                <div className="gov-otp-icon-wrap">
                  <ShieldCheck size={36} />
                </div>
                <h2>{t.otpHeading}</h2>
                <p className="gov-otp-sub">
                  {t.otpSub}
                  <br />
                  <span className="gov-masked-email-badge">
                    {registration?.email || form.email}
                  </span>
                </p>

                <div className="gov-field-group" style={{ alignItems: "center" }}>
                  <label htmlFor="otp-input" className="gov-field-label">
                    <span className="gov-label-text">{t.otpLabel}</span>
                  </label>
                  <input
                    id="otp-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    autoFocus
                    placeholder="123456"
                    className="gov-otp-input-field"
                    value={otp}
                    onChange={(e) =>
                      setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && otp.length === 6 && !busy) {
                        handleVerifyOtp();
                      }
                    }}
                  />
                  <span className="gov-field-help">{t.otpHelp}</span>
                </div>

                <div className="gov-otp-actions-col">
                  <button
                    type="button"
                    className="gov-btn-primary"
                    disabled={busy || otp.length !== 6}
                    onClick={handleVerifyOtp}
                  >
                    {otpAction === "verify" ? t.btnVerifying : t.btnVerifyOtp}{" "}
                    <ArrowRight size={18} />
                  </button>

                  <button
                    type="button"
                    className="gov-btn-secondary"
                    disabled={busy || resendSeconds > 0}
                    onClick={handleSendOtp}
                  >
                    {resendSeconds > 0
                      ? t.btnResendCountdown(resendSeconds)
                      : t.btnResendOtp}
                  </button>

                  <button
                    type="button"
                    className="gov-btn-secondary"
                    disabled={busy}
                    onClick={() => {
                      setEmailInput(registration?.email || form.email);
                      setEditingEmail(true);
                    }}
                  >
                    ✏️ {t.btnEditEmail}
                  </button>

                  <button
                    type="button"
                    className="gov-btn-secondary"
                    onClick={() => setWizardStep(1)}
                  >
                    <ArrowLeft size={16} /> {t.btnBack}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            6. MAIN FORM CARD: STEP 3 (PAY REGISTRATION FEE VIA UPI QR)
            =================================================================== */}
        {wizardStep === 3 && (
          <div className="gov-form-card">
            {/* Student & Fee Header Strip */}
            <div className="gov-payment-summary-strip">
              <div className="gov-pay-student-info">
                <span>{t.summaryStudent}</span>
                <strong>{registration?.studentName || form.studentName}</strong>
              </div>
              <div className="gov-pay-ref-info">
                <span>{t.summaryRef}</span>
                <strong>{registration?.applicationRef || "DRAFT"}</strong>
              </div>
              <div className="gov-pay-amount-box">
                <span>{t.summaryFee}</span>
                <strong>₹{settings.fee || 149}</strong>
              </div>
            </div>

            {/* If Both Modes are Enabled: Choice Tabs */}
            {settings?.paymentMode === "both" && (
              <div className="gov-payment-mode-tabs">
                <button
                  type="button"
                  className={`gov-pay-tab-btn ${paymentTab === "online" ? "active" : ""}`}
                  onClick={() => setPaymentTab("online")}
                >
                  <CreditCard size={18} />
                  <span>{t.paymentChoiceOnline || "Pay Online via Razorpay (Instant Admit Card)"}</span>
                </button>
                <button
                  type="button"
                  className={`gov-pay-tab-btn ${paymentTab === "manual" ? "active" : ""}`}
                  onClick={() => setPaymentTab("manual")}
                >
                  <IndianRupee size={18} />
                  <span>{t.paymentChoiceManual || "Pay via UPI QR (Manual Receipt Upload)"}</span>
                </button>
              </div>
            )}

            {/* TAB 1: RAZORPAY ONLINE GATEWAY */}
            {(settings?.paymentMode === "razorpay" || (settings?.paymentMode === "both" && paymentTab === "online")) ? (
              <div className="gov-razorpay-layout">
                <div className="gov-razorpay-header">
                  <div className="gov-razorpay-badge-row">
                    <span className="gov-instant-pill">
                      <Zap size={14} /> {lang === "hi" ? "तत्काल एडमिट कार्ड जारी" : "Instant Admit Card Issued"}
                    </span>
                    <span className="gov-security-pill">
                      <ShieldCheck size={14} /> {lang === "hi" ? "Razorpay 256-बिट सुरक्षित गेटवे" : "Razorpay 256-Bit Secure Gateway"}
                    </span>
                  </div>
                  <h3>{t.onlinePaymentTitle || "Online Payment via Razorpay Gateway"}</h3>
                  <p>
                    {t.onlinePaymentSub ||
                      "Pay securely using UPI (Google Pay, PhonePe, Paytm), Debit/Credit Cards, or Netbanking. Your official Admit Card will be generated immediately."}
                  </p>
                </div>

                {/* Accepted Payment Methods Badges */}
                <div className="gov-pay-methods-grid">
                  <div className="gov-pay-method-item">
                    <strong>UPI Apps</strong>
                    <span>Google Pay, PhonePe, Paytm, BHIM</span>
                  </div>
                  <div className="gov-pay-method-item">
                    <strong>ATM / Cards</strong>
                    <span>RuPay, Visa, MasterCard</span>
                  </div>
                  <div className="gov-pay-method-item">
                    <strong>Net Banking</strong>
                    <span>SBI, HDFC, ICICI, Axis & 50+ Banks</span>
                  </div>
                  <div className="gov-pay-method-item">
                    <strong>Wallets</strong>
                    <span>Paytm, Mobikwik & more</span>
                  </div>
                </div>

                {/* Terms & Guardian Consent Checkbox */}
                <div className="gov-terms-box" style={{ marginTop: "24px" }}>
                  <label className="gov-checkbox-row">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                    />
                    <span>
                      <strong>
                        {lang === "hi" ? "अभिभावक घोषणा एवं सहमति:" : "Guardian Declaration & Consent:"}{" "}
                      </strong>
                      {settings.terms ||
                        "I confirm the information submitted is correct. I am a parent or authorized guardian and consent to the school processing the student information for this Olympiad. Payment and award eligibility are subject to the school’s published terms."}
                    </span>
                  </label>
                </div>

                {/* Actions Row */}
                <div className="gov-actions-row" style={{ marginTop: "28px" }}>
                  <button
                    type="button"
                    className="gov-btn-secondary"
                    onClick={() => setWizardStep(2)}
                    disabled={busy}
                  >
                    <ArrowLeft size={16} /> {t.btnBack}
                  </button>
                  <button
                    type="button"
                    className="gov-btn-primary"
                    onClick={handleRazorpayPayment}
                    disabled={busy || !termsAccepted}
                    style={{
                      background: termsAccepted ? "#087EB8" : "#94A3B8",
                      cursor: termsAccepted && !busy ? "pointer" : "not-allowed",
                    }}
                  >
                    <CreditCard size={18} />
                    {busy
                      ? lang === "hi" ? "कृपया प्रतीक्षा करें..." : "Connecting Gateway..."
                      : (t.onlinePayBtn ? t.onlinePayBtn(settings.fee || 149) : `Pay ₹${settings.fee || 149} via Razorpay`)}
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            ) : (
              /* TAB 2: MANUAL SCHOOL UPI QR FLOW */
              <>
                {/* Already Paid Alert Banner */}
                <div className="gov-already-paid-card">
                  <div className="gov-already-paid-text">
                    <strong>⚡ {t.btnAlreadyPaid}</strong>
                    <p>{t.alreadyPaidNotice}</p>
                  </div>
                  <button
                    type="button"
                    className="gov-btn-amber"
                    onClick={() => setWizardStep(4)}
                  >
                    {lang === "hi"
                      ? "हाँ, मैंने भुगतान कर दिया है (रसीद अपलोड करें) →"
                      : "Proceed to Upload Receipt →"}
                  </button>
                </div>

                {/* Official UPI QR Layout */}
                <div className="gov-qr-layout">
                  <div className="gov-qr-box">
                    <img
                      src="/images/school-upi-qr.png"
                      alt="Official School Payment UPI QR Code"
                      className="gov-qr-image"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = "/api/payment-qr";
                      }}
                    />
                    <span className="gov-qr-caption">
                      {t.payeeNameLabel}:{" "}
                      <strong>
                        {settings.payeeName || "Shree Ram Public School"}
                      </strong>
                      <br />
                      {t.payeeUpiLabel}:{" "}
                      <strong>{settings.upiId || "srpskanhra@okaxis"}</strong>
                    </span>
                  </div>

                  <div className="gov-qr-instructions">
                    <h4>{t.upiStepsTitle}</h4>
                    <ul className="gov-qr-step-list">
                      <li className="gov-qr-step-item">
                        <span className="gov-qr-step-num">1</span>
                        <span>{t.upiStep1}</span>
                      </li>
                      <li className="gov-qr-step-item">
                        <span className="gov-qr-step-num">2</span>
                        <span>{t.upiStep2}</span>
                      </li>
                      <li className="gov-qr-step-item">
                        <span className="gov-qr-step-num">3</span>
                        <span>{t.upiStep3}</span>
                      </li>
                      <li className="gov-qr-step-item">
                        <span className="gov-qr-step-num">4</span>
                        <span>{t.upiStep4}</span>
                      </li>
                      <li className="gov-qr-step-item">
                        <span className="gov-qr-step-num">5</span>
                        <span>{t.upiStep5}</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Actions Row */}
                <div className="gov-actions-row">
                  <button
                    type="button"
                    className="gov-btn-secondary"
                    onClick={() => setWizardStep(2)}
                  >
                    <ArrowLeft size={16} /> {t.btnBack}
                  </button>
                  <button
                    type="button"
                    className="gov-btn-primary"
                    onClick={() => setWizardStep(4)}
                  >
                    {lang === "hi"
                      ? "भुगतान रसीद अपलोड करें"
                      : "Upload Payment Receipt"}{" "}
                    <ArrowRight size={18} />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ===================================================================
            7. MAIN FORM CARD: STEP 4 (SUBMIT PAYMENT DETAILS & UTR)
            =================================================================== */}
        {wizardStep === 4 && (
          <form
            className="gov-form-card"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmitPayment();
            }}
          >
            {/* Header Strip */}
            <div className="gov-payment-summary-strip">
              <div className="gov-pay-student-info">
                <span>{t.summaryStudent}</span>
                <strong>{registration?.studentName || form.studentName}</strong>
              </div>
              <div className="gov-pay-ref-info">
                <span>{t.summaryRef}</span>
                <strong>{registration?.applicationRef || "DRAFT"}</strong>
              </div>
              <div className="gov-pay-amount-box">
                <span>{t.summaryFee}</span>
                <strong>₹{settings.fee || 149}</strong>
              </div>
            </div>

            <div className="gov-section-header">
              <div className="gov-section-icon">
                <IndianRupee size={20} />
              </div>
              <div>
                <h3>{t.submitHeading}</h3>
                <p>{t.submitSub}</p>
              </div>
            </div>



            {/* Payment Receipt / Screenshot Upload */}
            <div className="gov-field-group" style={{ marginBottom: "20px" }}>
              <label className="gov-field-label">
                <span className="gov-label-text">{t.receiptLabel}</span>
                <span className="required-star">*</span>
              </label>

              <label
                className="gov-receipt-upload-card"
                htmlFor="receipt-file-input"
              >
                <input
                  id="receipt-file-input"
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  required
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (file) {
                      if (
                        ![
                          "image/jpeg",
                          "image/png",
                          "application/pdf",
                        ].includes(file.type) ||
                        file.size > 3 * 1024 * 1024
                      ) {
                        notify.error(t.errorReceiptInvalid);
                        setReceipt(null);
                        setReceiptPreview(null);
                        return;
                      }
                      setReceipt(file);
                      if (file.type.startsWith("image/")) {
                        setReceiptPreview(URL.createObjectURL(file));
                      } else {
                        setReceiptPreview(null);
                      }
                    }
                  }}
                />
                <Upload size={32} />
                <strong>
                  {receipt ? t.receiptSelected(receipt.name) : t.receiptChoose}
                </strong>
                <p>
                  {receipt
                    ? `${(receipt.size / (1024 * 1024)).toFixed(2)} MB · Click to replace`
                    : "JPG, PNG or PDF · Maximum file size 3 MB"}
                </p>
              </label>

              {/* Receipt Preview Thumbnail if image */}
              {receiptPreview && (
                <div style={{ marginTop: "8px", textAlign: "center" }}>
                  <img
                    src={receiptPreview}
                    alt="Uploaded Payment Receipt Preview"
                    style={{
                      maxHeight: "160px",
                      borderRadius: "8px",
                      border: "1px solid #CBD5E1",
                      margin: "0 auto",
                    }}
                  />
                </div>
              )}
            </div>

            {/* Verification Notice */}
            <div
              className="gov-instructions-card"
              style={{
                borderLeftColor: "#087EB8",
                background: "#EAF5FC",
                marginBottom: "20px",
              }}
            >
              <div
                className="gov-instructions-head"
                style={{ color: "#087EB8" }}
              >
                <Info size={16} />
                <span>{t.importantReviewNotice}</span>
              </div>
            </div>

            {/* Terms Acceptance Checkbox */}
            <label className="gov-consent-box">
              <input
                type="checkbox"
                required
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
              <span>{t.termsCheckbox}</span>
            </label>

            {/* Actions Row */}
            <div className="gov-actions-row">
              <button
                type="button"
                className="gov-btn-secondary"
                disabled={busy}
                onClick={() => setWizardStep(3)}
              >
                <ArrowLeft size={16} /> {t.btnBack}
              </button>
              <button
                type="submit"
                className="gov-btn-primary"
                disabled={busy || !receipt || !termsAccepted}
              >
                {busy ? t.btnSubmitting : t.btnSubmitApplication}{" "}
                <CheckCircle2 size={18} />
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
                  ✓ {lang === "hi" ? "सीट एवं भुगतान कन्फर्म" : "Registration Confirmed"}
                </div>
                <strong style={{ color: "#065F46" }}>
                  {lang === "hi"
                    ? "आपका भुगतान सत्यापित हो चुका है और प्रवेश पत्र (Admit Card) जारी कर दिया गया है!"
                    : "Payment Verified & Official Admit Card Issued Successfully!"}
                </strong>
                <p style={{ color: "#047857" }}>
                  {lang === "hi"
                    ? "आपका आधिकारिक पंजीकरण नंबर नीचे दिया गया है। आप अपना प्रवेश पत्र (Admit Card) और भुगतान रसीद तुरंत डाउनलोड कर सकते हैं।"
                    : "Your permanent registration number has been assigned. You can now download your Admit Card and Payment Receipt below."}
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
                  {lang === "hi"
                    ? `कक्षा ${registration?.studentClass}${registration?.studentClass === "11" && registration?.course
                      ? ` (${registration.course})`
                      : ""
                    }`
                    : `Class ${registration?.studentClass}${registration?.studentClass === "11" && registration?.course
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
              <div className="gov-confirm-row">
                <span className="gov-confirm-label">{t.confirmEmail}</span>
                <span className="gov-confirm-value">{registration?.email}</span>
              </div>
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

        {/* Important Instructions Card (shown at bottom) */}
        <aside className="gov-instructions-card" style={{ marginTop: "24px" }}>
          <div className="gov-instructions-head">
            <Info size={18} />
            <span>{t.instructionsTitle}</span>
          </div>
          <ul className="gov-instructions-list">
            <li>{t.inst1}</li>
            <li>{t.inst2}</li>
            <li>{t.inst3}</li>
            <li>{t.inst4}</li>
            <li>{t.inst5}</li>
          </ul>
        </aside>

        {/* ===================================================================
            9. SUPPORT & HELPDESK FOOTER CARD
            =================================================================== */}
        <footer className="gov-help-card">
          <div className="gov-help-content">
            <h4>{t.helpTitle}</h4>
            <p>{t.helpSubtitle}</p>
            <p style={{ marginTop: "4px", fontSize: "0.78rem", color: "#64748B" }}>
              {t.helpHours}
            </p>
          </div>

          <div className="gov-help-contacts">
            <a href="tel:8199991081" className="gov-help-pill">
              <Phone size={16} />
              <span>{t.helpPhone}</span>
            </a>
            <a href="mailto:srpskanhra@gmail.com" className="gov-help-pill">
              <Mail size={16} />
              <span>{t.helpEmail}</span>
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
                            {lang === "hi"
                              ? `कक्षा ${app.studentClass}${app.studentClass === "11" && app.course ? ` (${app.course})` : ""}`
                              : `Class ${app.studentClass}${app.studentClass === "11" && app.course ? ` (${app.course})` : ""}`}{" "}
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
