# Barnaby 0.0.87 – Release Notes

**Released:** February 2025

---

## New Features

### Factory Reset
Added a **"Reset application to factory defaults"** button in **Settings > Diagnostics**.
- This clears all application data, including:
  - Chat history
  - Application state (preferences, window size)
  - Local storage cache
- The application automatically restarts as a fresh install.
- Useful for fixing corrupted state or testing the first-run experience.

### Syntax Highlighting
- **File Previews**: Opening a file (via "File Preview" or context) now displays the code with full syntax highlighting (colors, line numbers) instead of plain text.
- **Chat Code Blocks**: Code snippets in chat responses now feature proper syntax highlighting.
- **Theme Aware**: The highlighting adapts to your selected Light or Dark theme (using One Light / One Dark schemes).

### Improved Theming
- **Default Dark Theme**: Updated to use neutral grays instead of blue-tinted (Nord) colors for popup windows and menus, providing a more consistent and professional look.

### Fixes & Improvements
- **Context Awareness**: Agents (Gemini/Claude) now receive the full workspace file tree in their system prompt, allowing them to understand the project structure without guessing.
- **File Injection**: You can now reference files in your messages using `@filename` (e.g., `@src/App.tsx`), and Barnaby will automatically inject the file's content into the context.
- **CLI Integration**: Fixed issue where prompts were too long for command-line arguments by passing them via `stdin`.
- **Workspace Dock**: Default workspace dock side is now set to **Left** on fresh installs.

---

## How to update

- **Portable:** Use `release\0.0.87\Barnaby_0.0.87_portable.exe`.
- **Dev:** `npm run dev` as usual.
