# Football Gallery — production infrastructure checklist (14 Nov 2026)

## Scope
Use ONLY existing GitHub repository `Tanapatpusiri/photoflow-pro` and existing Vercel project `photoflow-pro`. Do not overwrite its current public production site until the private gallery has passed end-to-end testing.

## Missing owner-authorized infrastructure
- Cloudflare account with R2 enabled and billing approved by owner; private R2 bucket dedicated to this gallery, NOT public, no public domain.
- Dedicated PostgreSQL database; DO NOT use the PJAA database. Prior code referenced a Supabase project not present in the user's connected Supabase account, so ownership and permissions remain unverified.
- Vercel Production + Preview environment variables, configured through the Vercel dashboard, **never pasted in chat or committed**:
```
DATABASE_URL
DATABASE_SSL
R2_ENDPOINT
R2_BUCKET
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
FG_SESSION_SECRET
```
Use a randomly generated `FG_SESSION_SECRET` of at least 32 bytes (e.g. 64 hex chars). Restrict S3 API credentials to the particular bucket only. Use private keys only in server environment variables.

## Database preparation
Run `db/football_gallery_schema.sql` then `db/football_gallery_ingestion_extension.sql` on the **dedicated** database. This is NOT an automatic migration yet. Check all tables/indexes and run DB security review before adding real child information.

Initialize first administrator via `scripts/bootstrap-football-admin.mjs` using transient shell variables `FG_ADMIN_EMAIL` and `FG_ADMIN_PASSWORD`; remove password environment values after bootstrap. Do not store plain passwords in database.

## R2 setup
Create a dedicated bucket, keep it private, and issue S3 API Read/Write key scoped only to that bucket. Configure restrictive CORS to permit browser PUT from the actual authorized Vercel origin and intended methods/headers. GET for previews and originals must be obtained by short-lived authorized signatures, not public URLs. Validate video and multipart upload limits separately.

Cloudflare docs: https://developers.cloudflare.com/r2/get-started/s3/

## Release gate
- Test 3,000+ mixed JPEG/RAW and videos, interrupted/resumed upload, multiple cameras with colliding JPEG/RAW base names, and pairing review.
- Demonstrate SHA-256 original roundtrip for JPEG, camera RAW and video. For large files >100MB, use a durable background verifier rather than a synchronous Vercel Function.
- Implement and verify resumable multipart upload (currently only retry from start), 2–5GB segmented ZIP background worker and retries (currently not enabled), all media editing/admin workflows and consent request handling. A live Serverless Function cannot produce multi-gigabyte archives reliably.
- Record actual guardian/legal bases, Privacy Notice and applicable retention. Never assume permissions for children in group photos.
- Verify nine approved UI mockup screens (provided by user) against iPhone Safari/LINE in-app browser and Android, and no horizontal overflow.
- Vercel account is on a Hobby plan; confirm plan appropriateness before any business/commercial rollout.
- Once all pass, merge draft PR #14 into main, use existing auto-deploy Production, smoke-test real URL with authorized event and real downloads; no mock or fake percentages.

## Current status
Preview build is functional as a frontend and API scaffold. **It is not production-ready** and no child images can be published without owner-managed infrastructure and privacy validation. Explicitly report blockers, never call this release completed.
