---
name: Photo library API compatibility
description: SDK 57 saving API and least-privilege access decision.
---

Use the explicit expo-media-library/legacy entry point for add-only saving with saveToLibraryAsync.

**Why:** In Expo SDK 57, the root export still typechecks but always throws at runtime. The legacy save API supports adding an existing file without requiring read access to the library.

**How to apply:** Keep save permissions write-only with an empty granular read-scope list. Android Expo Go rejects explicit photo/video scopes before filtering for write-only access; no read scopes are needed to add PNG/GIF files. Older Android still requests storage-write access, and iOS uses add-only access. Scope the config plugin to photos, not audio/video. Check the installed API before migrating to the newer class-based API.
