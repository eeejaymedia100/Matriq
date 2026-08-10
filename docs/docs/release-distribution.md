# Release & Distribution — Getting This Onto Your Phone

## Costs to budget for (confirm before Phase 2, don't discover mid-build)

- **Apple Developer Program: $99/year.** There is no way to distribute a real, installable iOS
  build to your phone beyond a 7-day free-provisioning window without this. Get this set up
  early — it gates everything iOS-related.
- **Google Play Console: $25 one-time.** Needed for Internal Testing track distribution.
  (A debug APK can be sideloaded without this at all, for the fastest personal testing loop —
  see below.)

## Android — two paths

**1. Direct APK sideload (fastest loop, use this for day-to-day dev testing):**
- EAS Build produces a `.apk` for a development/internal build profile.
- Transfer it to your phone (via `adb install`, a direct download link EAS provides, or even
  just downloading it in the phone's browser) and install directly — no Play Console needed at
  all for this.
- This is what Phase 2's "install a debug build on your own phone" milestone should use — don't
  wait on Play Console setup to see the app running for the first time.

**2. Play Console Internal Testing (for wider testing, closer to real launch):**
- Requires the $25 developer account.
- EAS Submit uploads the build; internal testers (added by email, up to 100) get it via the Play
  Store app itself, closer to the real end-user install experience.
- Use this from Phase 8 onward.

## iOS — TestFlight is the only realistic path

- Requires the Apple Developer Program membership.
- EAS Build compiles the `.ipa` in the cloud (solving the "no Mac" problem — see
  `docs/tech-stack.md`); EAS Submit uploads it to App Store Connect.
- **Internal TestFlight testers** (up to 100, added by Apple ID email, must be part of your
  Apple Developer team) get builds with **no App Review required** — this is your fast loop,
  use it from Phase 2 onward once the developer account exists.
- **External TestFlight testers** (up to 10,000) go through a lightweight Beta App Review — use
  this only once you're inviting testers beyond yourself, from Phase 8 onward.
- There is no equivalent to Android's "just sideload an APK" for iOS without a Mac and a cable —
  TestFlight (via EAS) is genuinely the fastest real path given your Linux-only build
  environment.

## EAS configuration

- `eas.json` defines build profiles: `development` (includes dev client, for fast local
  iteration), `preview`/`staging` (matches the staging backend), `production` (matches
  production backend, submitted to stores).
- App signing credentials (iOS provisioning profiles/certificates, Android keystore) are managed
  by EAS by default (`eas credentials`) — let it handle this rather than managing keystores
  manually; one less place for a signing key to be mishandled.
- Environment variables per build profile (which backend URL each profile points to) configured
  in `eas.json`, not hardcoded in app code.

## Release cadence recommendation

- **Phase 2 onward:** development-profile builds, installed directly on your phone, updated as
  often as useful (multiple times a day is fine — this is the cheap loop).
- **Every merge to `develop`:** an automatic staging-profile build via CI (`docs/ci-cd.md`) — so
  there's always a recent build to test against staging without you having to trigger it
  manually.
- **Every production release:** production-profile build, submitted to TestFlight internal +
  Play internal testing, tested by you on a real device (`docs/testing-qa.md`'s checklist)
  before any wider invite goes out.

## First-time setup checklist

- [ ] Apple Developer Program enrolled, team ID noted.
- [ ] Google Play Console account created, app entry created (even empty) so the package name is
      reserved.
- [ ] `eas.json` committed with all three build profiles.
- [ ] `eas credentials` run once per platform to establish signing credentials, stored by EAS
      (not manually managed files sitting in the repo or on the GCP box).
- [ ] A test TestFlight build successfully installed on your own iPhone, and a test APK
      successfully sideloaded on your own Android phone — both confirmed working before Phase 2
      is considered complete.
