# Football Gallery — production readiness gate (updated 14 Nov 2026)

Status: **NOT production-ready.** Code paths are implemented and pass an end-to-end suite against a
real PostgreSQL 16 database in two storage modes, but nothing has run against the owner's real Google
Drive, the deployed Cloudflare Worker, the Vercel Preview/Production deployment, or a real iPhone /
LINE app. Do not merge PR #14 into `main` until every item marked ⏳ is done.

Primary storage (owner decision, 14 Nov 2026): **Google Drive** of the owner's Google One account
(`FG_STORAGE=drive`). Originals never pass through Vercel: browsers upload straight to Google with
resumable sessions, and a Cloudflare Worker (Free plan) streams previews, originals and ZIP parts.
Cloudflare R2 mode is kept as an alternative (R2 could not be enabled without billing).

## Verified locally
`tests/football-gallery-e2e.mjs` — **129/129 in Google Drive mode** (local Google OAuth + Drive v3
emulator, Worker running in workerd via `wrangler dev`) and **120/120 in R2/S3 mode** (moto S3).
- Admin: scrypt sign-in, per-IP + per-account (failed only) rate limits, logout, same-origin CSRF guard on every mutation.
- Google Drive connection: owner-only, `drive.file` scope, offline + consent, state signed and bound
  to the starting browser (forged callback rejected), refresh token encrypted (AES-256-GCM) in the DB.
- Events, players, many-to-many tagging (one file, many children), audit log viewer.
- Upload: server-decided MIME by extension allow-list, duplicate detection by SHA-256, JPEG/RAW pairing.
  Drive: browser → Google resumable upload in 8 MiB chunks, resume from the offset Google reports,
  SHA-256 confirmed from Google's `sha256Checksum` without re-downloading. R2: single PUT ≤ 64 MiB,
  resumable multipart above that, SHA-256/CRC32 recomputed from storage in resumable steps.
- Tampered content and size mismatches are rejected in both modes.
- Separate JPEG previews (photos and video poster frames); originals never modified.
- Privacy: per-child legal basis + evidence before approval, GPS metadata flag, consent withdrawal,
  Privacy Notice + retention date required to publish, event suspension/resume, removal requests.
- Access: LINE invite link (no sign-up/OTP), event code backup, per-event cookies, revocation takes
  effect immediately — including download links already handed to the Worker (re-authorised by the app
  on every original/ZIP request); preview links expire after 15 minutes.
- Downloads: per-file originals byte-for-byte (SHA-256 round trip), Download All / per child / selection
  as split ZIP parts (stored, ZIP64, SHA256SUMS.txt), exact Content-Length, HTTP Range resume through
  the Worker; Drive ZIP parts ≤ 45 files (Worker Free subrequest budget).
- Browser (Chrome, 390 px iPhone viewport, local script): owner connects Drive, uploads JPEG + RAW +
  150 MB video from the file picker straight to Google (29 chunk PUTs), previews load from the Worker,
  no horizontal scroll, no JavaScript errors.
- UI: 67 screen states at 320/375/390/430 px (iPhone Safari + LINE user agents), no input under 16 px.
- Performance (local): 4,000-photo event — album 41 ms, photo pages 6–36 ms.

## ⏳ Blockers before merging to main
1. Owner: Google Cloud project + Drive API + OAuth consent **published In production** + OAuth client
   with redirect URIs; deploy the Worker and set its secret; Vercel env vars (docs/FOOTBALL_GALLERY_INFRA_SETUP_TH.md §1).
2. Apply migration 004 to the Neon database and bootstrap the owner account.
3. Connect the real Google Drive and run tests/football-gallery-e2e.mjs against the Vercel Preview.
4. Confirm on Cloudflare that the Worker stays within the Free plan CPU limit while streaming a 45-file ZIP part
   and a multi-GB video (the local runtime does not enforce CPU limits).
5. Confirm Google accepts browser chunk uploads from the production origin (CORS on the session URI).
6. Real-device check: iPhone Safari and LINE in-app browser (invite link from a LINE chat, photo, video and one ZIP part).
7. Compare the 9 screens with the user's approved visual master (images are not in the repository).
8. Decide the Vercel plan (Hobby is non-commercial).
9. Record the real guardian consent / lawful basis process; never assume permission for children in group photos.
10. 3,000+ real files from multiple cameras.

Only after all of the above, and with the owner's explicit approval: merge PR #14 into `main`, let the
existing Vercel Production deployment build, then smoke-test https://photoflow-pro.vercel.app/football-gallery.
