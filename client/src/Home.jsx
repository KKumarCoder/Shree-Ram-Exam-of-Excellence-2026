import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Calculator,
  FlaskConical,
  Globe2,
  Lightbulb,
  Trophy,
  ShieldCheck,
  FileText,
  CheckCircle2,
  IndianRupee,
  Download,
  Target,
  Clock3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { img } from "./api.js";
import "./home-slider.css";
const subjects = [
  [Calculator, "Mathematics"],
  [FlaskConical, "Science"],
  [BookOpen, "English"],
  [Globe2, "Social Science"],
  [Lightbulb, "General Awareness"],
];
const steps = [
  [FileText, "Complete form", "Enter student and guardian details."],
  [ShieldCheck, "Verify mobile", "Confirm the parent number with a real OTP."],
  [
    IndianRupee,
    "Pay registration fee",
    "Pay through the school’s configured method.",
  ],
  [Download, "Get your admit card", "Download after payment confirmation."],
];
const banners = Array.from({ length: 9 }, (_, i) => `Banner${i + 1}.png`);
function Feature({ image, kicker, title, copy, id, reverse = false }) {
  return (
    <section className={`feature shell ${reverse ? "reverse" : ""}`} id={id}>
      <div className="feature-image">
        <img src={img(image)} alt={title} loading="lazy" />
      </div>
      <div className="feature-copy">
        <span className="eyebrow">{kicker}</span>
        <h2>{title}</h2>
        <p>{copy}</p>
        <Link className="btn primary" to="/register">
          Register Now <ArrowRight size={17} />
        </Link>
      </div>
    </section>
  );
}
export function Home({ settings }) {
  const [slide, setSlide] = useState(0);
  const nextSlide = () => setSlide((current) => (current + 1) % banners.length);
  const previousSlide = () =>
    setSlide((current) => (current - 1 + banners.length) % banners.length);
  useEffect(() => {
    const timer = setInterval(nextSlide, 3000);
    return () => clearInterval(timer);
  }, []);
  return (
    <main>
      <section className="hero">
        <div className="hero-image banner-slider">
          {banners.map((banner, index) => (
            <img
              key={banner}
              className={index === slide ? "active" : ""}
              src={img(banner)}
              alt={`SHREE 2026 Olympiad banner ${index + 1}`}
              fetchPriority={index === 0 ? "high" : undefined}
            />
          ))}
        </div>
        <div className="hero-topline shell">
          <span>SHREE 2026 OLYMPIAD</span>
          <span>LEARN · COMPETE · ACHIEVE</span>
        </div>
        <div className="hero-slide-count">
          <b>{String(slide + 1).padStart(2, "0")}</b>
          <span>/ {String(banners.length).padStart(2, "0")}</span>
        </div>
        <div className="hero-controls" aria-label="Banner controls">
          <button onClick={previousSlide} aria-label="Previous banner">
            <ChevronLeft size={20} />
          </button>
          <button onClick={nextSlide} aria-label="Next banner">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="hero-dots" aria-label="Banner slides">
          {banners.map((banner, index) => (
            <button
              key={banner}
              className={index === slide ? "active" : ""}
              onClick={() => setSlide(index)}
              aria-label={`Show banner ${index + 1}`}
            />
          ))}
        </div>
        <div className="hero-actions shell">
          <span className="hero-action-label">
            Your next achievement starts here
          </span>
          <Link className="btn gold" to="/register">
            Start Registration <ArrowRight size={18} />
          </Link>
          <Link className="btn outlined" to="/status">
            Check Registration Status
          </Link>
        </div>
      </section>
      <section className="notice-strip">
        <div className="shell">
          <span>
            <CheckCircle2 size={17} /> Registration fee: <b>₹{settings.fee}</b>
          </span>
          <span>
            <Clock3 size={17} /> Exam:{" "}
            <b>{settings.examDate || "Date to be announced"}</b>
          </span>
          <span>
            <ShieldCheck size={17} /> Registration:{" "}
            <b>{settings.registrationOpen ? "Open" : "Not yet open"}</b>
          </span>
        </div>
      </section>
      <section className="shell intro" id="about">
        <span className="eyebrow">DISCOVER YOUR STRENGTH</span>
        <h1>Big dreams. Bigger opportunities.</h1>
        <p>
          SHREE 2026 OLYMPIAD is designed to encourage curiosity,
          problem-solving, academic confidence and healthy competition. Students
          from Classes 1–12 can explore their strengths and celebrate learning.
        </p>
        <div className="subject-grid">
          {subjects.map(([Icon, label]) => (
            <div className="subject" key={label}>
              <Icon size={26} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="steps-bg">
        <div className="shell">
          <div className="section-heading">
            <span className="eyebrow">SIMPLE & SECURE</span>
            <h2>How registration works</h2>
            <p>
              Four clear steps, with real parent-mobile verification and payment
              confirmation.
            </p>
          </div>
          <div className="steps">
            {steps.map(([Icon, title, copy], i) => (
              <div className="step" key={title}>
                <span className="step-num">0{i + 1}</span>
                <Icon size={30} />
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Feature
        image="registration.webp"
        kicker="01 · APPLICATION"
        title="Online registration, made simple"
        copy="Enter accurate student and guardian information, verify your number, and review your details before paying. Your information goes directly to the school’s secure database."
        id="how-to-register"
      />
      <Feature
        image="otp.webp"
        kicker="02 · SECURITY"
        title="Verified mobile registration"
        copy="A verification code helps confirm the guardian’s phone number. The code is sent through the configured SMS provider—no dummy mobile verification in production."
        reverse
      />
      <Feature
        image="payment.webp"
        kicker="03 · PAYMENT"
        title="Pay the ₹149 registration fee"
        copy="Use official UPI payment details with receipt upload and school approval, or the configured verified payment gateway. Receipt uploads are reviewed against actual transaction records."
      />
      <section className="prize-bg" id="prizes">
        <div className="shell prize-content">
          <div className="section-heading">
            <span className="eyebrow">CELEBRATE EXCELLENCE</span>
            <h2>Exciting prizes</h2>
            <p>
              Laptop, tablet, bicycle and participant-watch categories are shown
              in the school’s promotional material. Final award and eligibility
              rules will be published by the school.
            </p>
          </div>
          <img
            src={img("prizes.webp")}
            loading="lazy"
            alt="Olympiad prizes laptop tablet bicycle and watch"
          />
          <div className="prize-tags">
            <span>9–12 · LAPTOP</span>
            <span>6–8 · TABLET</span>
            <span>1–5 · BICYCLE</span>
            <span>ELIGIBLE PARTICIPANTS · WATCH</span>
          </div>
        </div>
      </section>
      <section className="scholarship shell" id="scholarship">
        <div>
          <span className="eyebrow">EVERY EFFORT COUNTS</span>
          <h2>Scholarship opportunities</h2>
          <p>
            Proposed benefit slabs based on Olympiad performance. Final
            coverage, eligibility and duration must be confirmed with the
            school.
          </p>
          <div className="scholarship-rows">
            {settings.scholarships.map((s, i) => (
              <div key={i}>
                <strong>{s.marks}</strong>
                <span>{s.benefit} scholarship</span>
              </div>
            ))}
          </div>
          <Link className="btn primary" to="/register">
            Join the Olympiad <ArrowRight size={17} />
          </Link>
        </div>
        <img
          src={img("scholarship.webp")}
          loading="lazy"
          alt="Scholarship promotional poster"
        />
      </section>
      <Feature
        image="admit.webp"
        kicker="04 · EXAM READY"
        title="Your personalized admit card"
        copy="After successful payment verification, use your registration number and guardian OTP to download a branded PDF admit card with exam details and a secure verification QR."
        reverse
      />
      <section className="cta shell">
        <img
          src={img("cta.webp")}
          alt="Registration open promotional graphic"
          loading="lazy"
        />
        <div>
          <span className="eyebrow">YOUR FUTURE STARTS HERE</span>
          <h2>Ready to participate?</h2>
          <p>
            Complete your application and keep your registration number safe.
          </p>
          <Link className="btn gold" to="/register">
            Register Now <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </main>
  );
}
