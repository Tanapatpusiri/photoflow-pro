# Football Gallery — production readiness gate

This branch begins the approved Apple-minimal Football Gallery implementation inside the existing PhotoFlow Pro repository without changing the existing live root application.

## Shipped in this branch
- `/football-gallery`: responsive iPhone-first access screen, no sample children/photos or fake live data.
- `POST /api/football-gallery/access`: **fail-closed**, returns 503 until real event authorization is provisioned. It never grants access on the basis of a guessed/static code.
- Semantic form, validation errors, accessible controls, >=16px mobile input, iOS safe area.

## Mandatory blockers before production migration
1. Connect production **Cloudflare R2** private bucket and lifecycle/billing policy; do not put original files in GitHub, Vercel public folder, or public buckets.
2. Connect a dedicated, controlled PostgreSQL database with event, player, many-to-many media, files, privacy record, grant, role, download job and audit schemas. Existing Supabase URL embedded in old app code was not found among available projects, **do not reuse it without ownership verification**.
3. Admin authentication + server-side role checks + private event grants/invite token hashing + revocation + rate limits + signed download URLs.
4. Bulk resumable upload for JPEG/RAW/video; SHA-256 original integrity checks and preview derivatives separate from originals.
5. Event/player media tagging and publication permission checks before any original/thumbnail listing.
6. Download selection and server-side chunked ZIP with large file support; LINE iOS/Safari test.
7. Privacy notice/retention/removal workflow and verified guardian/other lawful publication basis.
8. Replace existing public mock screens only after E2E tests pass, with user's nine approved UI screenshots as visual regression references.
9. Verify Vercel plan suitability before real commercial traffic and upload of children’s photography.

Until all items are verified, **this is an incomplete, non-production-ready implementation**, not a working gallery for parents.
