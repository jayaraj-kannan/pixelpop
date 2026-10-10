---
name: Gemini SDK routing
description: Avoid accidental managed-endpoint routing when configuring own-key Gemini access.
---

Supplying an explicit API key to GoogleGenAI is not enough to ensure direct provider routing. In own-key mode, also explicitly select Google's public endpoint and API version.

**Why:** The SDK independently reads GOOGLE_GEMINI_BASE_URL and global base-URL defaults even when an API key is passed. Those defaults can point at a managed gateway and mix two different access/billing modes.

**How to apply:** Keep endpoint selection explicit when maintaining own-key clients. Do not change managed integration environment variables to make an own-key client work.
