import mongoose from "mongoose";
import { branding } from "../../../shared/branding.mjs";
const { Schema } = mongoose;
const model = mongoose.model.bind(mongoose);
const opts = { timestamps: true };
const mediaSchema = new Schema({
  publicId: { type: String, required: true },
  resourceType: { type: String, enum: ['image', 'raw'], required: true },
  type: { type: String, enum: ['authenticated'], default: 'authenticated' },
  format: { type: String, required: true },
  contentType: { type: String, required: true },
  bytes: { type: Number, required: true },
}, { _id: false });
// Journal upload intentions before contacting Cloudinary, including uncertain timeouts.
export const MediaAsset = model('MediaAsset', new Schema({
  asset: { type: mediaSchema, required: true },
  sweepAt: { type: Date, required: true, index: true },
}, opts));
export const Admin = model(
  "Admin",
  new Schema(
    {
      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
      },
      passwordHash: { type: String, required: true },
      role: {
        type: String,
        enum: ["SUPER_ADMIN", "ADMIN", "PAYMENT_VERIFIER", "EXAM_COORDINATOR"],
        default: "ADMIN",
      },
      active: { type: Boolean, default: true },
    },
    opts,
  ),
);
export const Registration = model(
  "Registration",
  new Schema(
    {
      registrationNumber: { type: String, unique: true, sparse: true },
      applicationRef: { type: String, required: true, unique: true },
      draftRequestKey: { type: String, unique: true, sparse: true },
      draftRequestHash: { type: String },
      studentName: { type: String, required: true, trim: true },
      dob: { type: String, required: true },
      studentClass: { type: String, required: true },
      currentSchool: { type: String, required: true },
      guardianName: { type: String, required: true },
      guardianPhone: { type: String, required: true },
      email: { type: String, default: "", lowercase: true, trim: true },
      verifiedEmail: { type: String, default: "" },
      address: { type: String, required: true },
      city: { type: String, required: true },
      district: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      purpose: { type: String, default: "" },
      consent: { type: Boolean, required: true },
      verifiedAt: { type: Date, default: null },
      draftExpiresAt: { type: Date },
      verificationExpiresAt: { type: Date, default: null },
      verificationDevMode: { type: Boolean, default: false },
      termsVersion: { type: String, default: "2026-v1" },
      termsAcceptedAt: { type: Date, default: null },
      status: {
        type: String,
        enum: [
          "DRAFT",
          "OTP_VERIFIED",
          "PAYMENT_PENDING",
          "PAYMENT_UNDER_VERIFICATION",
          "CONFIRMING",
          "CONFIRMED",
          "PAYMENT_REJECTED",
          "CANCELLED",
        ],
        default: "DRAFT",
        index: true,
      },
      paymentMode: {
        type: String,
        enum: ["manual", "razorpay", ""],
        default: "",
      },
      paymentId: { type: Schema.Types.ObjectId, ref: "Payment", default: null },
      photoPath: { type: String, default: "" }, // Legacy migration only; never read by upload/download routes.
      photo: { type: mediaSchema, default: null },
      admitToken: { type: String, unique: true, sparse: true },
      seat: { type: String, default: "" },
      room: { type: String, default: "" },
      checkInAt: { type: Date, default: null },
      notificationStatus: { type: String, default: "" },
      notificationAttempts: { type: Number, default: 0 },
      notificationNextAttemptAt: { type: Date },
      notificationLease: { type: String },
    },
    opts,
  ),
);
export const Challenge = model(
  "Challenge",
  new Schema(
    {
      phone: { type: String },
      recipient: { type: String },
      registrationId: {
        type: Schema.Types.ObjectId,
        ref: "Registration",
        required: true,
      },
      purpose: { type: String, enum: ["register", "lookup"], required: true },
      provider: { type: String, enum: ["brevo", "smtp"], required: true },
      providerVerificationReference: { type: String, default: "" },
      codeHash: { type: String, default: "", select: false },
      devMode: { type: Boolean, default: false },
      verificationStatus: {
        type: String,
        enum: ["pending", "approved", "denied", "expired", "superseded"],
        default: "pending",
      },
      attempts: { type: Number, default: 0 },
      expiresAt: { type: Date, required: true },
      lastSentAt: { type: Date, required: true },
      resendAvailableAt: { type: Date, required: true },
      verifiedAt: { type: Date, default: null },
      consumedAt: { type: Date, default: null },
    },
    opts,
  ),
);
Challenge.schema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });
Challenge.schema.index({ registrationId: 1, purpose: 1 });
Challenge.schema.index({ phone: 1, createdAt: -1 });
Challenge.schema.index({ recipient: 1, createdAt: -1 });
export const Payment = model(
  "Payment",
  new Schema(
    {
      registrationId: {
        type: Schema.Types.ObjectId,
        ref: "Registration",
        required: true,
        index: true,
      },
      mode: { type: String, enum: ["manual", "razorpay"], required: true },
      amount: { type: Number, required: true },
      currency: { type: String, default: "INR" },
      utr: { type: String, unique: true, sparse: true },
      receiptPath: { type: String, default: "" }, // Legacy migration only.
      receipt: { type: mediaSchema, default: null },
      providerOrderId: { type: String, unique: true, sparse: true },
      providerPaymentId: { type: String, unique: true, sparse: true },
      status: {
        type: String,
        enum: ["PENDING", "UNDER_REVIEW", "PAID", "REJECTED"],
        default: "PENDING",
      },
      reviewedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
      reviewNote: { type: String, default: "" },
      verifiedAt: { type: Date },
    },
    opts,
  ),
);
export const Settings = model(
  "Settings",
  new Schema(
    {
      _id: { type: String, default: "primary" },
      eventName: { type: String, default: branding.eventName },
      portal: { type: Schema.Types.Mixed, default: () => ({}) },
      fee: { type: Number, default: 149 },
      registrationOpen: { type: Boolean, default: false },
      examDate: { type: String, default: "" },
      reportingTime: { type: String, default: "" },
      examTime: { type: String, default: "" },
      venue: {
        type: String,
        default:
          "Shree Ram Public School, Kanhra-Badhra Road, Charkhi Dadri, Haryana 127306",
      },
      paymentMode: {
        type: String,
        enum: ["manual", "razorpay"],
        default: "manual",
      },
      upiId: { type: String, default: "" },
      payeeName: { type: String, default: "" },
      upiQrPath: { type: String, default: "" },
      contactPhone: { type: String, default: "8199991081" },
      contactEmail: { type: String, default: "srpskanhra@gmail.com" },
      terms: {
        type: String,
        default:
          "I confirm the information submitted is correct. I am a parent or authorized guardian and consent to the school processing the student information for this Olympiad. Payment and award eligibility are subject to the school’s published terms.",
      },
      privacy: {
        type: String,
        default:
          "Student information is used for Olympiad registration, exam administration and school communication. Contact the school for corrections and retention requests.",
      },
      refund: {
        type: String,
        default:
          "Refund eligibility and deadlines must be confirmed with the school office before registration opens.",
      },
      instructions: {
        type: [String],
        default: [
          "Carry this admit card and school ID to the examination centre.",
          "Arrive at least 30 minutes before reporting time.",
          "Bring your own stationery; electronic devices are not permitted unless authorized.",
          "Follow invigilator instructions.",
        ],
      },
      scholarships: {
        type: [Schema.Types.Mixed],
        default: [
          { marks: "95%+", benefit: "100%" },
          { marks: "90%+", benefit: "75%" },
          { marks: "85%+", benefit: "50%" },
          { marks: "80%+", benefit: "25%" },
          { marks: "60–<80%", benefit: "10%" },
          { marks: "<60%", benefit: "5%" },
        ],
      },
    },
    opts,
  ),
);
export const Counter = model(
  "Counter",
  new Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  }),
);
export const Audit = model(
  "Audit",
  new Schema(
    {
      actor: { type: String, required: true },
      action: { type: String, required: true },
      registrationId: { type: Schema.Types.ObjectId, ref: "Registration" },
      details: { type: Schema.Types.Mixed, default: {} },
    },
    opts,
  ),
);
export const Notification = model(
  "Notification",
  new Schema(
    {
      registrationId: { type: Schema.Types.ObjectId, ref: "Registration" },
      channel: { type: String, required: true },
      status: { type: String, required: true },
      detail: { type: String, default: "" },
    },
    opts,
  ),
);

export const OtpBucket = model('OtpBucket', new Schema({
  _id: String, count: { type: Number, default: 0 }, expiresAt: { type: Date, required: true, expires: 0 },
}));
export const OtpLock = model('OtpLock', new Schema({
  _id: String, owner: String, expiresAt: { type: Date, required: true, expires: 0 },
}));

// Stable, indexed ordering for paginated administrator lists.
Registration.schema.index({ createdAt: -1, _id: -1 });
Registration.schema.index({ status: 1, createdAt: -1, _id: -1 });
Payment.schema.index({ mode: 1, status: 1, createdAt: -1, _id: -1 });

Registration.schema.index({ "photo.publicId": 1 });
Payment.schema.index({ "receipt.publicId": 1 });
