# Production release checklist — approval required

- [ ] School confirms event name, accurate exam date/time, venue, class eligibility and registration deadline (the starter does not enforce a deadline).
- [ ] School approves final prize position rules and scholarship coverage/duration. The graphic and slabs are promotional and not automatically legally binding.
- [ ] School finalizes student privacy notice, guardian consent, terms, refunds, data retention and grievance contact. Seek applicable legal advice.
- [ ] Real MongoDB Atlas connection with restricted IP/user permissions and backups.
- [ ] Strong independent `JWT_SECRET` and `OTP_PEPPER`, not placeholders, and isolated production `.env`.
- [ ] Configure the existing Shree Ram Public School Twilio Verify Service; verify six-digit codes, actual expiry, trial recipients, India delivery and Fraud Guard. Follow [Twilio activation and deployment](TWILIO_OTP.md).
- [ ] For India: confirm sender/template/DLT and any provider compliance requirements before SMS delivery.
- [ ] For manual payments: verify correct account owner and amount in merchant records before accepting a receipt. A QR/UTR screenshot is NOT payment proof.
- [ ] For Razorpay: live merchant onboarding, API keys, live order capture and correct `payment.captured` webhook HMAC secret. Test a genuine provider transaction in a controlled environment.
- [ ] Limit staff roles and rotate seeded administrator password. Use secure multi-factor authentication if deploying broadly (not implemented in this starter).
- [ ] Add CAPTCHA/bot mitigation, stronger OTP/device abuse detection, and monitoring for public scale.
- [ ] Move student photographs and receipts to managed private object storage for multi-instance deployment. Local private files need backup and strict filesystem permissions.
- [ ] Establish automated data retention, deletion policy, and staff access review.
- [ ] Add transaction reconciliation dashboard, refund workflow, audit review, webhook replay monitoring and load tests prior to high-volume use.
- [ ] Check Nginx, TLS, response headers and file upload limits. Confirm webhook publicly reachable over HTTPS.
- [ ] Verify exact printed PDF on target printer; the PDF is programmatically branded, not a pixel-perfect export of the design image.
- [ ] Test registration, OTP expiry, receipt collision, manual rejection/retry, payment replay, signed webhook, QR verification and print on real browsers.

**This is a functional-source-code starter, not a claim that an account, external provider or production infrastructure has been activated.**
