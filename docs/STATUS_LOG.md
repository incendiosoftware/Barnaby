# Status Log

## 2026-02-21 09:09:46 +13:00

- Updated new agent window startup behavior in `src/App.tsx`:
  - Removed the visible initial long system prompt from chat.
  - Added a concise model banner message (`Model: <model>`).
  - Added automatic assistant ready message: `I am ready`.
- Updated model switching flow so the model banner is refreshed and ready message is ensured.
- Updated new thinking/agent window behavior to auto-close and disconnect previous open agent panels, keeping only the newest panel.
- Prevented startup-only ready messages from being saved as meaningful conversation history.
- Validation:
  - `npm run build:dist:raw` passed.
  - `npm run test` failed in existing `test/e2e.spec.ts` (hook timeout and `page` undefined in `afterAll`).

