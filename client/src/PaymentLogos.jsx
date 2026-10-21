import React from "react";

// PhonePe Official Purple Icon & Badge
export function PhonePeBadge() {
  return (
    <span className="brand-logo-pill phonepe-pill" title="PhonePe">
      <svg width="20" height="20" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" rx="9" fill="#5F259F" />
        <path
          d="M26.2 15.6C26.2 13.6 24.5 12 22.3 12H15V28H18.8V23.2H22.3C24.5 23.2 26.2 21.6 26.2 19.6C26.2 18.2 25.4 17 24.1 16.4C25.4 15.8 26.2 14.8 26.2 15.6ZM18.8 15.5H21.9C22.8 15.5 23.4 16 23.4 16.8C23.4 17.6 22.8 18.1 21.9 18.1H18.8V15.5ZM22.1 21.4H18.8V19.3H22.1C23 19.3 23.6 19.8 23.6 20.4C23.6 21 23 21.4 22.1 21.4Z"
          fill="#FFFFFF"
        />
        <path
          d="M24.8 22.5L29 28H24.5L21.2 23.2C22.6 23.2 23.8 22.9 24.8 22.5Z"
          fill="#FFFFFF"
        />
      </svg>
      <span>PhonePe</span>
    </span>
  );
}

// Google Pay GPay Official Multi-color Badge
export function GooglePayBadge() {
  return (
    <span className="brand-logo-pill gpay-pill" title="Google Pay">
      <svg width="22" height="20" viewBox="0 0 48 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="48" height="32" rx="6" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
        <path
          d="M17.8 16.2C17.8 15.6 17.75 15.1 17.65 14.6H10.5V17.5H14.6C14.45 18.4 13.9 19.2 13.1 19.7V21.6H15.6C17.05 20.25 17.8 18.4 17.8 16.2Z"
          fill="#4285F4"
        />
        <path
          d="M10.5 23.5C12.5 23.5 14.2 22.85 15.6 21.6L13.1 19.7C12.4 20.2 11.5 20.5 10.5 20.5C8.55 20.5 6.95 19.2 6.35 17.4H3.8V19.4C5.15 22.1 7.6 23.5 10.5 23.5Z"
          fill="#34A853"
        />
        <path
          d="M6.35 17.4C6.2 16.9 6.1 16.45 6.1 16C6.1 15.55 6.2 15.1 6.35 14.6V12.6H3.8C3.25 13.65 2.95 14.8 2.95 16C2.95 17.2 3.25 18.35 3.8 19.4L6.35 17.4Z"
          fill="#FBBC05"
        />
        <path
          d="M10.5 11.5C11.6 11.5 12.6 11.9 13.4 12.65L15.65 10.4C14.2 9.05 12.5 8.5 10.5 8.5C7.6 8.5 5.15 9.9 3.8 12.6L6.35 14.6C6.95 12.8 8.55 11.5 10.5 11.5Z"
          fill="#EA4335"
        />
        <text x="21" y="21" fontFamily="sans-serif" fontSize="13" fontWeight="800" fill="#5F6368">
          Pay
        </text>
      </svg>
      <span>GPay</span>
    </span>
  );
}

// Paytm Official Cyan & Blue Badge
export function PaytmBadge() {
  return (
    <span className="brand-logo-pill paytm-pill" title="Paytm">
      <svg width="24" height="16" viewBox="0 0 54 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="1" y="16" fontFamily="Arial, Helvetica, sans-serif" fontSize="16" fontWeight="900" fill="#002970">
          Pay
        </text>
        <text x="31" y="16" fontFamily="Arial, Helvetica, sans-serif" fontSize="16" fontWeight="900" fill="#00BAF2">
          tm
        </text>
      </svg>
      <span>Paytm</span>
    </span>
  );
}

// BHIM / Official UPI Tricolor Arrows Badge
export function UpiBadge() {
  return (
    <span className="brand-logo-pill upi-pill" title="UPI & BHIM">
      <svg width="22" height="18" viewBox="0 0 46 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 4L6 20H11L17 4H12Z" fill="#F47920" />
        <path d="M19 4L13 20H18L24 4H19Z" fill="#097F3E" />
        <text x="26" y="18" fontFamily="sans-serif" fontSize="13" fontWeight="900" fill="#1C3F60">
          UPI
        </text>
      </svg>
      <span>BHIM UPI</span>
    </span>
  );
}

// RuPay Official Logo
export function RuPayBadge() {
  return (
    <span className="brand-logo-pill rupay-pill" title="RuPay Cards">
      <svg width="28" height="18" viewBox="0 0 60 22" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="2" y="17" fontFamily="Arial, Helvetica, sans-serif" fontSize="15" fontWeight="900" fill="#004F9F">
          RuPay
        </text>
        <path d="M48 6L53 11L48 16H51L56 11L51 6H48Z" fill="#F37021" />
        <path d="M53 6L58 11L53 16H56L61 11L56 6H53Z" fill="#009F4D" />
      </svg>
      <span>RuPay</span>
    </span>
  );
}

// Visa Official Badge
export function VisaBadge() {
  return (
    <span className="brand-logo-pill visa-pill" title="Visa">
      <svg width="26" height="16" viewBox="0 0 48 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="2" y="17" fontFamily="Arial, sans-serif" fontSize="17" fontWeight="900" fontStyle="italic" fill="#1A1F71">
          VISA
        </text>
      </svg>
      <span>Visa</span>
    </span>
  );
}

// Mastercard Official Interlocking Circles Badge
export function MastercardBadge() {
  return (
    <span className="brand-logo-pill mastercard-pill" title="Mastercard">
      <svg width="28" height="18" viewBox="0 0 38 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="14" cy="12" r="10" fill="#EB001B" />
        <circle cx="24" cy="12" r="10" fill="#F79E1B" fillOpacity="0.88" />
      </svg>
      <span>Mastercard</span>
    </span>
  );
}

// Bank Icon Badge (SBI, HDFC, ICICI, Axis)
export function BankIcon({ name, code, color = "#087EB8" }) {
  return (
    <span className="brand-logo-pill bank-pill" title={name}>
      <span className="bank-avatar" style={{ backgroundColor: color }}>
        {code}
      </span>
      <span>{name}</span>
    </span>
  );
}
