# Barnaby 0.0.250 - Release Notes

**Released:** March 2026

## Changed

- Cleaned up `index.ts` main process: moved `__filename`/`__dirname` declarations after imports, extracted shared app-exit cleanup into `cleanupOnExit()` helper to remove duplication between `window-all-closed` and `before-quit` handlers

## Notes

- Artifact: `release/0.0.250/Barnaby_0.0.250_portable.exe`
