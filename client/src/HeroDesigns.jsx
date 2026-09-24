import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  Trophy,
  BookOpen,
  FlaskConical,
  Calculator,
  Globe2,
  Monitor,
  Smartphone,
  GraduationCap,
  Star,
  Compass,
} from "lucide-react";
import "./hero-designs.css";

const designs = [
  {
    name: "The Academy",
    style: "Heritage • Forest green • Editorial",
    className: "academy",
    colors: ["#143d30", "#f5efdd", "#d6b467"],
  },
  {
    name: "Bright Minds",
    style: "Playful • Cobalt blue • Bold shapes",
    className: "bright",
    colors: ["#2352ec", "#ffce43", "#f7f8ff"],
  },
  {
    name: "The Challenger",
    style: "Sporting • Burgundy • Big typography",
    className: "challenger",
    colors: ["#591e33", "#f1ded0", "#e96543"],
  },
  {
    name: "Beyond Tomorrow",
    style: "Futuristic • Midnight • Orbital graphics",
    className: "beyond",
    colors: ["#101a30", "#a4f4ce", "#a1b2ff"],
  },
  {
    name: "A New Chapter",
    style: "Minimal • Warm paper • Magazine layout",
    className: "chapter",
    colors: ["#f4efe5", "#202a34", "#cd6540"],
  },
  {
    name: "Your Golden Ticket",
    style: "Celebratory • Golden yellow • Ticket layout",
    className: "ticket",
    colors: ["#ffda66", "#16364c", "#fff9e9"],
  },
];
function Brand() {
  return (
    <div className="concept-brand">
      <img src="/images/school-logo.png" alt="Shree Ram Public School crest" />
      <span>
        SHREE RAM
        <br />
        <b>PUBLIC SCHOOL</b>
      </span>
    </div>
  );
}
function Actions({ label = "Register for the Olympiad" }) {
  return (
    <div className="concept-actions">
      <Link to="/register" className="concept-primary">
        {label}
        <ArrowUpRight size={20} />
      </Link>
      <Link to="/status" className="concept-secondary">
        Check application status <ArrowRight size={16} />
      </Link>
    </div>
  );
}
function Facts({ settings }) {
  return (
    <div className="concept-facts">
      <span>
        <b>Classes 1–12</b>Who can participate
      </span>
      <span>
        <b>₹{settings.fee}</b>Registration fee
      </span>
      <span>
        <b>{settings.examDate || "To be announced"}</b>Examination date
      </span>
    </div>
  );
}
function Mark({ children }) {
  return <span className="concept-kicker">{children}</span>;
}
function Academy({ settings }) {
  return (
    <div className="concept-layout">
      <div className="concept-copy">
        <Mark>SHREE 2026 OLYMPIAD · KANHRA</Mark>
        <h2>
          A tradition of learning.
          <br />
          <em>A future of possibility.</em>
        </h2>
        <p>
          For the curious, the determined, and the thinkers of tomorrow.
          Discover how far your knowledge can take you.
        </p>
        <Actions />
        <Facts settings={settings} />
      </div>
      <div className="academy-art" aria-hidden="true">
        <div className="academy-arch">
          <span>THE PURSUIT OF</span>
          <Trophy />
          <strong>Excellence</strong>
          <small>LEARN · COMPETE · GROW</small>
        </div>
        <span className="academy-seal">
          20
          <br />
          26
        </span>
        <div className="academy-caption">
          Great journeys begin with curiosity.
        </div>
      </div>
    </div>
  );
}
function Bright({ settings }) {
  return (
    <>
      <div className="concept-layout">
        <div className="concept-copy">
          <Mark>
            <Sparkles size={16} /> BIG IDEAS START HERE
          </Mark>
          <h2>
            Little questions.
            <br />
            Big discoveries.
            <br />
            <em>Brighter you.</em>
          </h2>
          <p>
            Bring your curiosity to the SHREE 2026 OLYMPIAD. A new challenge in
            maths, science, language and beyond.
          </p>
          <Actions label="Let’s take the challenge" />
          <Facts settings={settings} />
        </div>
        <div className="bright-art" aria-hidden="true">
          <div className="bright-tile maths">
            <Calculator />
            <strong>Think.</strong>
            <span>01 / MATHEMATICS</span>
          </div>
          <div className="bright-tile science">
            <FlaskConical />
            <strong>Explore.</strong>
            <span>02 / SCIENCE</span>
          </div>
          <div className="bright-tile language">
            <BookOpen />
            <strong>Express.</strong>
            <span>03 / ENGLISH</span>
          </div>
          <div className="bright-tile world">
            <Globe2 />
            <strong>Discover.</strong>
            <span>04 / YOUR WORLD</span>
          </div>
          <span className="bright-star">✦</span>
        </div>
      </div>
      <div className="bright-ribbon">
        STAY CURIOUS <Star /> THINK BIG <Star /> GIVE IT YOUR BEST <Star />{" "}
        SHREE 2026
      </div>
    </>
  );
}
function Challenger({ settings }) {
  return (
    <>
      <div className="challenger-top">
        <Mark>SHREE 2026 OLYMPIAD</Mark>
        <span>YOUR NEXT CHALLENGE STARTS HERE ↗</span>
      </div>
      <h2 className="challenger-title">
        READY.
        <br />
        <span>SET.</span> <em>SHINE.</em>
      </h2>
      <div className="challenger-bottom">
        <p>
          Put your knowledge to the test.
          <br />
          Find your focus. Make your effort count.
        </p>
        <Actions label="Enter the Olympiad" />
      </div>
      <Facts settings={settings} />
      <span className="challenger-number" aria-hidden="true">
        26
      </span>
    </>
  );
}
function Beyond({ settings }) {
  return (
    <div className="concept-layout">
      <div className="concept-copy">
        <Mark>
          <span className="live-dot" /> SHREE 2026 · A NEW HORIZON
        </Mark>
        <h2>
          Your potential.
          <br />
          <em>
            No ordinary
            <br />
            limits.
          </em>
        </h2>
        <p>
          Every great discovery starts with a question. Explore your strengths
          at the SHREE 2026 OLYMPIAD.
        </p>
        <Actions label="Begin your journey" />
        <Facts settings={settings} />
      </div>
      <div className="orbit-art" aria-hidden="true">
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
        <div className="orbit orbit-three" />
        <div className="orbit-core">
          <Sparkles />
          <strong>SHREE</strong>
          <span>
            20<span>26</span>
          </span>
        </div>
        <span className="orbit-node node-one">
          <FlaskConical />
        </span>
        <span className="orbit-node node-two">
          <Globe2 />
        </span>
        <span className="orbit-node node-three">
          <Calculator />
        </span>
        <small>CURIOUS MINDS. INFINITE POSSIBILITIES.</small>
      </div>
    </div>
  );
}
function Chapter({ settings }) {
  return (
    <>
      <div className="chapter-top">
        <Mark>THE SHREE JOURNAL</Mark>
        <span>2026 EDITION / OLYMPIAD</span>
      </div>
      <div className="concept-layout">
        <div className="concept-copy">
          <h2>
            The next chapter
            <br />
            is <em>yours.</em>
          </h2>
          <p>
            A little preparation. A lot of possibility.
            <br />
            An invitation to learn, challenge yourself and grow with Shree Ram
            Public School.
          </p>
          <Actions label="Write your next chapter" />
        </div>
        <div className="chapter-art" aria-hidden="true">
          <div className="chapter-book">
            <small>SHREE RAM PUBLIC SCHOOL</small>
            <strong>
              The art
              <br />
              of asking
              <br />
              <em>why.</em>
            </strong>
            <Compass />
            <span>SHREE 2026 OLYMPIAD</span>
          </div>
          <div className="chapter-note">
            Curiosity is
            <br />
            the first step.
          </div>
        </div>
      </div>
      <Facts settings={settings} />
    </>
  );
}
function Ticket({ settings }) {
  return (
    <div className="concept-layout">
      <div className="concept-copy">
        <Mark>
          <Trophy size={17} /> MAKE ROOM FOR YOUR NEXT ACHIEVEMENT
        </Mark>
        <h2>
          You bring
          <br />
          the curiosity.
          <br />
          <em>
            We bring
            <br />
            the challenge.
          </em>
        </h2>
        <p>
          Join the SHREE 2026 OLYMPIAD.
          <br />
          One opportunity to discover more of you.
        </p>
        <Actions label="Start my registration" />
      </div>
      <div className="golden-ticket">
        <div className="ticket-stub">
          <span>SHREE RAM PUBLIC SCHOOL</span>
          <Star />
        </div>
        <div className="ticket-content">
          <GraduationCap size={42} />
          <span>AN INVITATION TO EXCEL</span>
          <h3>
            SHREE
            <br />
            2026
            <br />
            <em>OLYMPIAD</em>
          </h3>
          <Facts settings={settings} />
          <div className="ticket-stripes" aria-hidden="true" />
          <small>YOUR JOURNEY STARTS WITH REGISTRATION</small>
        </div>
      </div>
    </div>
  );
}
const previews = [Academy, Bright, Challenger, Beyond, Chapter, Ticket];
export function HeroDesigns({ settings }) {
  const [selected, setSelected] = useState(0),
    [mobile, setMobile] = useState(false);
  const Current = previews[selected],
    design = designs[selected];
  return (
    <main className="design-studio">
      <div className="studio-intro">
        <div>
          <span className="eyebrow">SHREE 2026 / DESIGN STUDIO</span>
          <h1>
            Six directions.
            <br />
            <span>One brighter tomorrow.</span>
          </h1>
          <p>Explore six different hero designs. Pick a style to preview it.</p>
        </div>
        <span className="studio-count">
          01—06
          <br />
          <small>HERO CONCEPTS</small>
        </span>
      </div>
      <div className="concept-selector" aria-label="Choose a hero design">
        {designs.map((item, i) => (
          <button
            key={item.name}
            aria-pressed={selected === i}
            onClick={() => setSelected(i)}
          >
            <span className="concept-index">0{i + 1}</span>
            <strong>{item.name}</strong>
            <span className="concept-swatches" aria-hidden="true">
              {item.colors.map((color) => (
                <i key={color} style={{ background: color }} />
              ))}
            </span>
          </button>
        ))}
      </div>
      <div className="studio-toolbar">
        <div>
          <b>
            0{selected + 1} / {design.name}
          </b>
          <span>{design.style}</span>
        </div>
        <div className="preview-devices" aria-label="Preview size">
          <button
            aria-label="Desktop preview"
            aria-pressed={!mobile}
            onClick={() => setMobile(false)}
          >
            <Monitor size={18} />
          </button>
          <button
            aria-label="Mobile preview"
            aria-pressed={mobile}
            onClick={() => setMobile(true)}
          >
            <Smartphone size={18} />
          </button>
        </div>
      </div>
      <div className={`concept-viewport ${mobile ? "preview-mobile" : ""}`}>
        <section
          className={`hero-concept ${design.className}`}
          aria-label={`${design.name} hero preview`}
        >
          <div className="concept-header">
            <Brand />
            <span className="concept-school">LEARN. COMPETE. GROW.</span>
            <Link to="/register">
              Register <ArrowUpRight size={16} />
            </Link>
          </div>
          <Current settings={settings} />
        </section>
      </div>
      <div className="studio-bottom">
        <span>Like this direction? Share its number or name.</span>
        <button onClick={() => setSelected((selected + 1) % designs.length)}>
          Next design <ArrowRight size={18} />
        </button>
      </div>
    </main>
  );
}
