# LEGAVORA — International Publishing Platform (Enhanced Edition)

This repository combines a premium public-facing international agency website with the existing Next.js/Supabase author portal starter, payment routes and database schema.

## Included
- Editorial luxury homepage, responsive navigation and global footer
- Publishing, services, growth programs, portfolio, books, about, insights, contact and legal placeholder pages
- Existing author registration/login, dashboard, manuscript/project workflow, admin, Supabase SQL schema, Paystack integration code
- Video showcase **slots** ready for authorized trailers; not fictional client work

## Important status
This is a **development codebase**, not a certified production platform. Images are external illustrative Unsplash photography, not Legavora portfolio evidence. Replace or license/verify media before commercial launch. Video showcase cards are placeholders, not playable client trailers. Legal pages require qualified review. The full portal needs security, permissions, payment, email and file-storage testing. Amazon KDP and IngramSpark do not provide automatic publication through this website; distribution is a managed process using authorized author accounts.

## Running locally
1. Install Node.js 20+ and npm.
2. `npm install`
3. Copy `.env.example` to `.env.local` and set service credentials. Never commit `.env.local`.
4. `npm run dev` and visit `http://localhost:3000`.
5. Configure Supabase schema and access policies, authentication, storage and Paystack as described in `README.md`.
6. Test `npm run build` and end-to-end security before deploying.

## GitHub safety
Your existing `Legavora/legavora` repository is **public** and its `main` branch powers the old GitHub Pages site. Do not upload secrets. Do not merge this application into `main` until a new hosting deployment and domain cutover are ready. Use `legavora-new-platform` branch and confirm GitHub Pages stays on `main`.

## Launch checklist
- Verify build, dependencies and TypeScript
- Replace illustrative photography with licensed or original assets
- Supply genuine, permissioned video trailers, book cover samples and case studies
- Configure Supabase project, RLS, file storage and malware scanning
- Test account isolation, admin permissions and project authorization
- Connect Paystack using server-side verification; confirm actual USD settlement
- Implement and test invoices, notifications, support and refunds
- Finalize privacy, terms and publishing agreements with counsel
- Confirm retailer listing workflows, author-owned accounts and ISBN policy
- Deploy preview on Vercel and only then plan legavora.com DNS change
