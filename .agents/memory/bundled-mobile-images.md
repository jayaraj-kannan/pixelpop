---
name: Bundled mobile images
description: Cross-platform loading of bundled image files in the Expo app.
---

Use Expo Asset to obtain a URI for bundled images on both native and web.

**Why:** React Native's Image.resolveAssetSource passed TypeScript checks but was missing at runtime in the web preview, causing the app to crash on startup.

**How to apply:** Resolve bundled sample files with Asset.fromModule and downloadAsync, then use localUri or uri. Do not assume the native Image static helpers are available in React Native Web.
