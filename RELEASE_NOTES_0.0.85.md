# Barnaby 0.0.85 – Release Notes

**Released:** February 2025

---

## Gemini & Claude CLI fixes

### PATH fix for Electron (Windows)

Barnaby now adds the npm global bin directory (`%APPDATA%\npm`) to `PATH` when spawning the Gemini and Claude CLIs. This resolves cases where the CLIs work in a terminal but fail from Barnaby because Electron does not inherit the full terminal PATH.

- **Gemini**: `gemini` command is now reliably found when run from Barnaby.
- **Claude**: Same fix for the `claude` command.

### Claude timeout messaging

When a Claude turn times out, the error message now includes clearer guidance:

- No credits left — check your subscription at claude.ai
- Claude CLI not in PATH — run `claude --version` in a terminal
- Slow network or API delay

The generic "turn/start timed out" message is replaced with provider-specific suggestions where applicable.

---

## Build & stability

- Fixed TypeScript build errors: `stdio` spawn options in `claudeClient` and `geminiClient`.
- Fixed `getRateLimitPercent` and `formatRateLimitLabel` scope by moving them to top-level.
- Fixed `ChatMessage` typing for system messages in panel state updates.

---

## How to update

- **Portable:** Use `release\0.0.85\Barnaby_0.0.85_portable.exe`.
- **Dev:** `npm run dev` as usual.
