# Project bug and security review — 23 September 2026

## Changes verified

- Serialized manual-payment approve/reject decisions with the existing persistent lease mechanism, preventing conflicting concurrent decisions.
- Allowed approval retries for already-paid manual payments when registration confirmation previously failed. Confirmation failure now restores the previous registration state instead of always forcing online-payment pending state. Stale confirmation claims can be retried after two minutes only when a paid payment exists; compare-and-set writes prevent an older worker from overwriting the recovery.
- Rejected a different Razorpay payment ID when an order already has a recorded paid transaction.
- Checked the effective registration settings when saving changes: an open manual-payment portal cannot lose its UPI ID/payee configuration through a partial update.
- Added image parsing and a 16-megapixel ceiling before saving candidate photos; removed newly written photos if the database save fails.
- Added safe, actionable errors for malformed JSON, upload errors, and invalid IDs, and disabled API response caching.
- Returned the freshly verified registration from status OTP verification instead of a pre-verification snapshot.
- Added status OTP resend/countdown, change-details navigation, expired-session recovery and duplicate-request protection. Added distinct rejected/cancelled messages.
- Preserved registration session tokens on temporary backend failures during resume.
- Decoded JSON errors delivered as PDF-download blobs so students see the actual error.
- Added admin-session expiry recovery, integer pagination and application-reference search.
- Excluded generated student PDF output from Git.
- Updated Nodemailer to 10.0.10 and React Router DOM to 7.18.4. Their current npm advisory checks report zero vulnerabilities after the updates.
- Lazy-loaded the admin portal: main production JS bundle decreased from about 621 KB to 281 KB, with a separate 355 KB admin bundle. The size warning is resolved.

## Verification

- 23 unit/validation tests and 29 isolated MongoDB/HTTP integration tests passed.
- Production frontend build passed.
- Registration, status and admin components passed a server-render smoke check after the router upgrade. This is not a browser interaction test.
- Backend health endpoint returned `ok: true`.
- `git diff --check` passed.
- Client and server npm audits returned zero reported vulnerabilities at review time.

## Limits and remaining operational checks

No live student/payment records were changed. No SMS, email, or payment was sent. Actual SMS/email delivery, captured gateway payments and browser/device interactions still require staging checks. Browser automation was unavailable in this session.

This review is not a guarantee that all bugs or security issues have been eliminated. Image parsing/size limits are not antivirus scanning. Input validation cannot prove that names, addresses or school details are genuine. Existing strict letter-only school/place rules can exclude legitimate names containing digits or punctuation; these remain as explicitly requested.

MongoDB updates across payment, registration and audit collections are not transactional. Exceptions and stale confirmation claims can be retried through approval/provider recovery. Payment, registration and audit writes still span separate collections, so production reconciliation and monitoring remain important; recovery is triggered by a retry, not by a background job.

Keep real production secrets separate from local development credentials and keep private uploads/output outside the public web root. The dependency upgrades require Node.js 20 or newer, consistent with the backend's engine requirement.
