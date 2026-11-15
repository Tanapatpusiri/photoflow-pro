# Football Gallery — production readiness gate

Updated: 15 November 2026. Status: **not production-ready**. Keep the pull request in draft until
the review, verification and deployment gates below are satisfied. The target for this working
branch is `develop`; merging to the production branch requires separate explicit authorization.

## Preview evidence

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
