---
name: GIF codec imports
description: gifenc CommonJS interoperability across Node checks and the Expo bundler.
---

Preserve cross-runtime handling when importing gifenc, and check both its named API and default-import shape before simplifying the import.

**Why:** Node cannot statically expose gifenc's named CommonJS exports. Its default import is the full exports object, while Metro honors the package's __esModule marker and sees the default export as a constructor function. An import that passed the Node binary check could therefore fail when GIF export runs in the app.

**How to apply:** Prefer the namespace's named API when present, with the full default-export object as a Node fallback. Do not replace this with an unconditional default import.
