# Football Gallery — production readiness gate

Updated: 15 November 2026 (evening). Status: **not production-ready** — code and Preview checks are
largely complete; the remaining blockers are owner actions and production configuration below. Keep the pull request in draft until
the review, verification and deployment gates below are satisfied. The target for this working
branch is `develop`; merging to the production branch requires separate explicit authorization.

## Preview evidence — 15 November 2026 (commits 49cdb20 and 30e9998)

Checked on the branch Preview with synthetic `ZZ-TEST-CLAUDE-*` data only; the real draft album was
not touched. The owner signed in to Vercel and the admin page personally.

- Parent API refusals (no session, no grant, wrong Origin, wrong or short code, forged Worker
  tickets) returned 401/403/404 as designed. Framing is denied on `/football-gallery` pages
  (`X-Frame-Options: DENY`, `frame-ancestors 'none'`); the main site is unaffected.
- JPEG, a 62.9 MB RAW (DNG, paired with its JPEG) and an MP4 video were uploaded through the admin
  UI. Server-side SHA-256 matched every source file; duplicates were reported as duplicates.
- Approval requires the separate GPS and "no identifiable child" confirmations (400 without them);
  tagged children require a recorded privacy basis first.
- Parents downloaded originals, RAW and video with matching SHA-256; byte ranges (206/416) joined
  to identical files; ZIP parts (JPEG, RAW, video) had the declared size, valid CRCs and matching
  SHA256SUMS; resumed ZIP downloads with `If-Range` produced identical bytes.
- A whole-album ZIP of 46 JPEGs was split into a 45-file part and a 1-file part; both streamed
  through the Free-plan Worker with valid CRCs and checksums. The 45-file part took about 56 s for
  only 0.46 MB because the Worker fetches each file from Drive one after another (≈1.2 s per file).
  Expect slow ZIPs for albums of many small files; measure before choosing the Worker plan.
- Hiding a photo, revoking a grant or suspending the album stopped previously issued original,
  preview and ZIP links immediately (404/410/403). Suspended albums tell holders of a still-valid
  invitation that the album is paused; everyone else still sees "not found".
- Admin previews load through a session-checked endpoint (401 without a session) that redirects to
  a two-minute Worker link. Capture times, file sizes in KB and review-list refresh after upload
  were checked in the admin UI.

Not covered: real iPhone Safari and LINE (no iOS simulator on the review machine), files larger
than 63 MB, interrupted large uploads, multiple cameras, expiry on the real date, and load at the
Free-plan limits.

## Earlier preview evidence

- The current feature branch builds on Vercel Preview. Google Drive is connected in that Preview;
  this does not establish the state of any production service or account.
- A synthetic JPEG was uploaded to the real Preview Drive, its SHA-256 was verified, its preview
  was displayed, and an original and ZIP were downloaded and checked in an earlier Preview.
  ZIP/download behavior must be retested after Worker changes before release.
- In Preview, previously issued preview links and album access were rejected after a test grant was
  revoked. Test grants issued for this check were subsequently revoked.
- In Preview, a correctly dated event was accessible, an undated published test event was rejected,
  and an approved synthetic date was subsequently recorded for that test event. The API refused to
  overwrite the date. The existing retention date was not changed.
- A separately initialized, incomplete synthetic JPEG upload was resumed through the Preview UI;
  the final original's SHA-256 matched and the generated preview was available. This does not
  establish behavior for large files, multiple cameras or a complete real album.
- The administrator's retention review list was checked on Preview. It identifies missing or invalid
  dates, expired events and events due within 30 days, and is unavailable without admin access.
  The list does not notify the owner, delete files, or record approval to delete.

The previous gate reported 129/129 Drive-emulator checks, 120/120 S3-emulator checks, 67 local
screen states and a local 4,000-photo performance exercise. Those historical reports have not been
independently repeated for the current commit and are not evidence of a full live Preview pass.

## Production state observed on 15 November 2026 (read-only)

- `https://photoflow-pro.vercel.app/football-gallery` returns 404: the production branch is `main`,
  which does not contain Football Gallery yet.
- Vercel has **no production environment variables** for Football Gallery. All seven
  (`DATABASE_URL`, `FG_STORAGE`, `FG_SESSION_SECRET`, `FG_DOWNLOAD_BASE`, `FG_DOWNLOAD_SECRET`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) are scoped to Preview for this branch only.
- The dedicated Neon database has a `production` branch with migrations 001–004, no 005, no owner
  account, no albums and no Drive connection. Its time zone is GMT; the app now evaluates album
  dates on the Bangkok calendar regardless.
- The production download Worker (`football-gallery-download`) answers `/health`; its secrets and
  `FG_APP_ORIGIN` were not inspected and must match the production app.

## Owner runbook before the production merge

Each step changes infrastructure or accounts and needs the owner (or an explicit instruction):

1. Google Cloud: add `https://photoflow-pro.vercel.app/api/football-gallery/admin/google/callback`
   as a redirect URI, publish the OAuth app and complete verification with a public privacy policy.
2. Neon `production` branch: run `DATABASE_URL=… node scripts/migrate-football-gallery.mjs` (now
   applies 005) and create the owner with `scripts/bootstrap-football-admin.mjs`.
3. Production Worker: set `FG_DOWNLOAD_SECRET` to a new random value (not the Preview value) and
   confirm `FG_APP_ORIGIN=https://photoflow-pro.vercel.app`; deploy with `npx wrangler deploy`.
4. Vercel Production env: add the seven variables with production values (new secrets, the
   production database URL and Worker URL). Do not reuse Preview secrets.
5. Merge this branch to `develop`, re-run checks, then merge to `main` only on explicit instruction;
   connect Google Drive on the production admin page and run a synthetic smoke test.
6. Rotate the Preview admin password (it appeared in a tool log) and remove temporary test access.

## Release blockers

1. Review the complete branch diff, current source and target, required checks, permissions and
   conflict status. Re-run affected checks on the exact commit being merged. Do not treat self-review
   as a required external approval.
2. Google OAuth remains in testing. Prepare a complete, accurate public homepage and privacy policy,
   verify the required domain and finish the applicable Google app verification before public use.
   The owner must confirm the real legal basis, guardian/child process, notices and contact details.
3. Verify production database isolation, migrations, owner account, environment settings, Drive
   account and Worker configuration independently. Preview configuration is not proof of production
   configuration. Keep credentials out of Git and reports.
4. Complete the owner's deletion-confirmation workflow, covering original files, preview files,
   related records, partial failures, backups and verification. Until then, retention expiry only
   closes access; stored files are not automatically deleted. No destructive deletion is authorized
   by this document.
5. Complete full integration tests against appropriately isolated Preview resources, including
   upload interruption/retry, originals, RAW/video, ZIP integrity and range requests, large files,
   45-file ZIP parts, multiple cameras and error recovery. Do not run tests that reconnect or alter
   a real Drive account without understanding their effects.
6. Check real iPhone Safari and LINE, the approved visual master, main-site regressions, service
   plan suitability, operational monitoring and recovery, dependency auditing, and the existing
   Worker editor diagnostics. A passing build alone is not sufficient.
7. Review and clean up temporary testing access with the owner's authorization. Reconcile the
   separate test Worker's dashboard settings and checked-in configuration before redeploying it.

Only after the required review, verification, CI and environment-specific deployment permissions
pass may the feature be merged to `develop`. Production changes must flow through `develop`, and
must not be merged or deployed without the owner's separate explicit instruction.
