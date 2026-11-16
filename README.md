# Legavora International Publishing Platform

A Next.js 15 + TypeScript + Tailwind + Supabase foundation for an author-owned publishing services business.

## Included
- Premium responsive marketing website, services, packages, publishing explanation, company page and public catalogue
- Email/password author registration and login via Supabase Auth
- Author project intake and dashboard, private manuscript uploads, file records, proof approval and distribution status
- Staff admin view with project stage/status updates
- USD invoice display and Paystack hosted checkout initialization
- Signed Paystack webhook with server-side verification and idempotent database settlement
- PostgreSQL schema, role-based RLS and private storage policies

## Setup
1. Install Node.js 20+ and run `npm install`.
2. Create a Supabase project. Run `supabase/schema.sql` in the SQL editor. Set the Auth site URL and allowed redirects to your deployed site.
3. Copy `.env.example` to `.env.local` and fill in credentials. Never expose service-role or Paystack secret keys in client code.
4. Run `npm run dev` and open http://localhost:3000.
5. Register an author and confirm the email. To designate a trusted administrator, use the Supabase SQL editor with the exact user UUID: `update public.profiles set role='admin' where id='YOUR-USER-UUID';`. Do not add a public admin-registration flow.
6. Create invoices, approvals, distribution records and book catalogue entries via trusted SQL/admin operations until their dedicated admin editors are implemented.
7. For USD card payments, obtain Paystack approval for international payments and USD settlement, configure the webhook endpoint `https://yourdomain.com/api/paystack/webhook`, and test with provider-supported test credentials before live activation.
8. Deploy to a Next.js-compatible host, connect your domain, configure HTTPS, environment variables and Supabase production auth URLs.

## Important limitations / remaining production work
This is a substantial **working starter application**, not a finished audited production publishing SaaS. Before real customer use, add: transactional emails, password reset and account recovery UI, secure document download endpoints, file malware scanning, full admin CRUD for invoices/proofs/catalogue/distribution, signed agreements, notifications, audit logging for all changes, privacy/terms/refund policies, rate limiting, monitoring, backups and restore drills, accessibility testing, automated tests and a security review. Configure tax/invoicing and data retention with qualified professionals.

**Distribution:** Amazon KDP, IngramSpark and Bookshop.org are not automatically connected. Distribution is a human-managed workflow until approved partner/API access is established. Never request author passwords or claim automatic retailer listings. Authors should retain rights and receive royalties directly in their own distributor accounts.

**Payments:** USD settlement and international card availability depend on provider approval. This code does not guarantee Paystack activation. Bank transfers need manual reconciliation or a separately approved bank API. Paystack webhook updates invoices only after signature, remote transaction verification, amount and currency match.

**Security caveat:** The private storage policies are a starter; add server-side content validation and malware scanning before production. Configure database backups and review RLS with a security engineer. Use distinct test and production credentials.

## Suggested build sequence
1. Validate visual design and copy, then finalize terms and publishing service packages.
2. Complete account lifecycle and author intake, file access, staff assignments and messaging.
3. Build administrative invoice/proof/catalogue/distribution forms, reporting and notification services.
4. Complete payments, bank transfer reconciliation and secure document signing.
5. Integrate distributor workflows where authorized; test, audit and launch.
