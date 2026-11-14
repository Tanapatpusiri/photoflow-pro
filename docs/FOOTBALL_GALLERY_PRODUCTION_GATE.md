# Football Gallery — production readiness gate (updated 14 Nov 2026)

Status: **NOT production-ready.** Code paths are implemented and pass an end-to-end suite against a
real PostgreSQL 16 database and an S3-compatible local store, but nothing has run against the owner's
Cloudflare R2, a dedicated production database, the Vercel Preview/Production deployment, or a real
iPhone / LINE app. Do not merge PR #14 into `main` until every item marked ⏳ is done.

## Verified locally (tests/football-gallery-e2e.mjs, 120 checks)
- Admin: scrypt sign-in, per-IP + per-account (failed only) rate limits, logout, same-origin CSRF guard on every mutation.
- Events, players, many-to-many tagging (one file, many children), audit log viewer.
- Upload: server-decided MIME by extension allow-list, duplicate detection by SHA-256, JPEG/RAW pairing,
  single PUT for <= 64 MiB, resumable multipart for larger files (resume after interruption, server-side
  part verification), abort.
- Integrity: SHA-256 (+CRC32) recomputed from storage in resumable steps, so videos > 100 MB can be
  approved; tampered content and size mismatches are rejected.
- Separate JPEG previews (photos and video poster frames); originals never modified.
- Privacy: per-child legal basis + evidence before approval, GPS metadata flag, consent withdrawal,
  Privacy Notice + retention date required to publish, event suspension/resume, removal requests.
- Access: LINE invite link (no sign-up/OTP), event code backup (typo-tolerant), per-event cookies,
  revocation takes effect immediately, expiry and retention enforced server-side on every request.
- Downloads: per-file originals byte-for-byte (SHA-256 round trip), Download All / per child / selection
  as split ZIP parts (stored, ZIP64, SHA256SUMS.txt), exact Content-Length, HTTP Range resume.
- UI: 67 screen states at 320/375/390/430 px (iPhone Safari + LINE user agents) with no horizontal
  overflow and no input under 16 px; Download All works in the browser.
- Performance (local): 4,000-photo event — album 41 ms, photo pages 6–36 ms, Download All prep for
  8,000 originals 0.65 s; previous admin events query built 160k intermediate rows (115 ms) vs 1 ms now.

## ⏳ Blockers before merging to main
1. Owner provisions dedicated PostgreSQL + private R2 bucket + CORS + Vercel env vars (docs/FOOTBALL_GALLERY_INFRA_SETUP_TH.md).
2. Run migrations and bootstrap the owner account on that database.
3. Run tests/football-gallery-e2e.mjs against the Vercel Preview URL with real R2.
4. Real-device check: iPhone Safari and LINE in-app browser (invite link from a LINE chat, photo download, one ZIP part).
5. Compare the 9 screens with the user's approved visual master (images are not in the repository).
6. Decide Vercel plan (Hobby is non-commercial) and where ZIP streaming runs (Vercel Function vs Cloudflare Worker, see setup doc §6).
7. Record the real guardian consent / lawful basis process; never assume permission for children in group photos.
8. 3,000+ real files from multiple cameras (JPEG/RAW name collisions across cameras rely on the camera label per upload batch).

Only after all of the above: merge PR #14 into `main`, let the existing Vercel Production deployment build,
then smoke-test https://photoflow-pro.vercel.app/football-gallery with a real event and real downloads.
