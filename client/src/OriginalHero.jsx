import React, {useEffect, useState} from "react";
import { Link } from "react-router-dom";
import { GraduationCap, ArrowUpRight, ArrowRight } from "lucide-react";
export function OriginalHero({ settings }) {
  const [portrait, setPortrait] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => setPortrait(current => 1 - current), 5000);
    return () => clearInterval(timer);
  }, [ready]);
  return (
    <section className="shree-hero" aria-labelledby="olympiad-title">
      <div className="shree-hero-sweep" aria-hidden="true" />
      <div className="shree-hero-grid">
        <div className="shree-hero-copy">
          <span className="shree-eyebrow">
            <span /> A BIG STAGE FOR BRIGHT MINDS
          </span>
          <h1 id="olympiad-title">
            Every student has
            <br />
            something <em>extraordinary.</em>
          </h1>
          <p>
            Let yours shine with the
            <br />
            <strong>SHREE 2026 OLYMPIAD.</strong>
          </p>
          <div className="shree-hero-note">
            <GraduationCap />
            <span>
              Learn with curiosity.
              <br />
              Compete with confidence.
            </span>
          </div>
        </div>
        <div className="shree-students">
          <img
            src="/images/olympiad-Confident%20School%20Uniform%20Duo.png"
            className={`uniform-duo-image hero-portrait ${portrait === 0 ? "is-visible" : ""}`}
            aria-hidden={portrait !== 0}
            alt="Two confident students in blue and red school uniforms"
            fetchpriority="high"
            width="1536"
            height="1024"
          />
          <img
            src="/images/smiling-school-duo-transparent.png"
            className={`hero-portrait school-portrait ${portrait === 1 ? "is-visible" : ""}`}
            alt="Smiling students standing back to back in blue checked school uniforms"
            aria-hidden={portrait !== 1}
            width="1024" height="1536"
            onLoad={() => setReady(true)}
          />
          <span className="shree-student-tag">
            <span aria-hidden="true">✦</span>YOUR NEXT CHAPTER STARTS HERE
          </span>
        </div>
        <div className="shree-event">
          <span className="shree-class-tag">FOR CLASSES 1–12</span>
          <div
            className="shree-event-word letter-brand"
            aria-label="SHREE 2026"
          >
            <b className="brand-letters brand-red" aria-hidden="true">
              {[..."SHREE"].map((letter, i) => (
                <i key={i} style={{ "--letter-order": i }}>
                  {letter}
                </i>
              ))}
            </b>
            <span>2026</span>
          </div>
          <h2 className="letter-brand" aria-label="OLYMPIAD">
            <b className="brand-letters brand-blue" aria-hidden="true">
              {[..."OLYMPIAD"].map((letter, i) => (
                <i key={i} style={{ "--letter-order": 7 - i }}>
                  {letter}
                </i>
              ))}
            </b>
          </h2>
          <div className="shree-event-subtitle">
            Shree Ram Exam of Excellence
          </div>
          <p>
            One opportunity.
            <br />A world of possibilities.
          </p>
          <Link className="shree-button" to="/register">
            {settings.registrationOpen
              ? "REGISTER NOW"
              : "REGISTRATION DETAILS"}
            <ArrowUpRight size={20} />
          </Link>
          <Link className="shree-status-link" to="/status">
            Check status / Admit card <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
