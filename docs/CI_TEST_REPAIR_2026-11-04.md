# Android checks: 79 failures investigation

Date: 2026-11-04. Source baseline: user V76 / versionCode 104.

The original Linux run executed 582 tests and failed 79. An isolated macOS checkout reproduced 75 failures; the difference was explained by the host locale and the Linux-unavailable `/private/tmp` output path.

## Initial failure groups

| Cause | Failing cases | Repair |
| --- | ---: | --- |
| Test exports searched for a private workspace marker (64), or wrote to `/private/tmp` (1) | 65 | Use a Gradle-configured module build directory; create export parent directories. |
| Unsafe-allocated player fixtures omitted a subsequently introduced StateFlow | 3 | Initialize the layout flow and a completed artwork-prefetch fixture. |
| Message-count assertion predated the catalog's additional named entry | 2 | Check coverage of all numbered message resources and continue validating every catalog entry in both languages. |
| Branding test still required V16 /16 | 1 | Check the generated BuildConfig against manifest package metadata. |
| Android 6 test invoked a PiP method removed from the application | 1 | Retain the actual legacy-notification test without reflection into a removed feature. |
| Chinese assertions relied on host language or omitted the browser language header | 5 | Select the fixture language explicitly and send an explicit Accept-Language header. |
| Dialog test lacked remote/window focus setup; lyric test used the obsolete empty-fetch lifecycle | 2 | Model keyboard-mode window focus, and complete the bounded empty-lyrics fetch before starting the notice timer. |
| **Total** | **79** | |

After fixing early export errors, additional stale expectations became reachable. These were updated to the current contracts: full-screen lyrics are entered through the lyrics-options popup; setting steppers use a solid accent fill; idle transport controls retain their semantic nodes while fading visually. The latter is checked against rendered pixels over the fixture's black background rather than by requiring node disposal.

## Scope and validation

- Application runtime files, the public V76 APK and its signing remain unchanged.
- No tests are excluded, disabled, or configured to ignore failures.
- Local full suite after repair: **582 tests, 0 failures, 0 errors, 0 skipped**.
- English-host full suite: **582 tests, 0 failures, 0 errors, 0 skipped**.
- GitHub Actions Linux full suite: **582 tests, 0 failures, 0 errors, 0 skipped**, confirmed from the uploaded JUnit XML. [Successful run 41842022186](https://github.com/lavande16/Apple-Music-For-Android-TV/actions/runs/41842022186), repair commit `be90004b77c7fcf4bdd11b7d7873d85b82f1761c`.
- CI exports JUnit XML and HTML reports even when tests fail, retaining them for seven days.

These are host-test results. They do not replace device playback, remote-control, or user acceptance testing. The published V76 APK is not rebuilt as part of this repair.
