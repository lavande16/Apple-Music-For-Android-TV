# Kawarp background attribution

The GLES2 background shaders and rendering sequence are adapted from
[Better Lyrics / Kawarp](https://github.com/better-lyrics/kawarp), fixed at
`bb914faf44a394c8b05896b31b21edbb369b5596` in the sibling `kawarp-reference` checkout.

Copyright (c) 2026 Better Lyrics. MIT licensed. The complete license is bundled in
`android/app/src/main/assets/licenses/Kawarp-MIT.txt` and included in every APK.

The Android port adds TextureView/EGL lifecycle, quality limits, CPU static fallback,
stale artwork handling and transition snapshots. The six original shaders, eight
128x128 Kawase passes, dark tint, noise warp, saturation and dithering defaults are retained.
