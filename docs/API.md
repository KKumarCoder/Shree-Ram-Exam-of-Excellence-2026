# API contract

Base URL: `/api`. Public forms send JSON unless explicitly marked multipart. Authenticated student operations send `Authorization: Bearer <token>`. Admin authentication uses a secure HttpOnly cookie scoped to `/api/admin`.

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | Database readiness |
| GET | `/settings` | Public event, fee, exam, payment and policy settings |
| GET | `/payment-qr` | Actual UPI QR for the configured merchant (NOT verified payment confirmation) |
| POST | `/registrations/start` | Validate + create private draft, return draft token/applicationRef |
| POST | `/registrations/otp/send` | Send real provider OTP, or explicit development-only OTP |
| POST | `/registrations/otp/verify` | Verify 6-digit challenge; lock to guardian phone |
| GET | `/registrations/me` | Restore draft / check state |
| POST | `/registrations/photo` | Optional private student JPEG/PNG multipart field `photo` |
| POST | `/registrations/manual` | Upload real receipt (`receipt` multipart), UTR and accepted terms |
| POST | `/registrations/razorpay/order` | Create real provider order (when configured) |
| POST | `/registrations/razorpay/verify` | Verify signature AND live provider captured payment |
| POST | `/webhooks/razorpay` | Raw-body HMAC verified payment.captured event |
| GET | `/registrations/admit-card` | Download PDF for confirmed draft bearer token |
| POST | `/status/request` | Request guardian lookup OTP using APP-... or SHREE26-... reference |
| POST | `/status/verify` | Verify lookup OTP and issue short-lived student token |
| GET | `/status/me` | Private student status via verified token |
| GET | `/admit-card` | Confirmed student PDF via verified token |
| GET | `/verify/:token` | Minimal public QR verification data |
| POST | `/admin/login` | Staff login with HttpOnly session cookie |
| POST | `/admin/logout` | Clear admin cookie |
| GET | `/admin/me` | Current role |
| GET | `/admin/dashboard` | Real confirmed and pending counts |
| GET | `/admin/registrations` | Search/filter/paginate records |
| GET | `/admin/payments` | Manual payment review queue |
| GET | `/admin/payments/:id/receipt` | Authorized private receipt download |
| POST | `/admin/payments/:id/approve` | Mark actual bank-verified payment paid, confirm registration |
| POST | `/admin/payments/:id/reject` | Store rejection reason and allow resubmission |
| GET | `/admin/admit-card/:id` | Authorized confirmed-student PDF |
| POST | `/admin/registrations/:id/seat` | Room/seat assignment |
| POST | `/admin/check-in` | Single-use admit QR token check-in |
| GET/PATCH | `/admin/settings` | Configure published event and payment details |
| GET | `/admin/export.csv` | CSV export of confirmed registrations |

Admin endpoints enforce roles on the backend. Upload bytes are held in private server storage, not public web directories. No sample UTR, OTP, or fake provider success may ever be used in production.
