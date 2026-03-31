# Bhaba's Tools — Chrome Command Palette Extension

A hacking toolkit command palette for Chrome. Press **backtick (`` ` ``)** on any page to launch a VS Code / Raycast-style command palette.

## Features

- **URL shortcuts** — Quick-navigate to GitHub, MDN, localhost, etc.
- **Code snippets** — Copy reusable code patterns to clipboard instantly
- **Browser actions** — Hard reload, clear site data, view source
- **Fuzzy search** — Filter commands as you type
- **Keyboard navigation** — Arrow keys + Enter to select, Escape to close
- **Custom shortcuts** — Add, edit, and delete your own shortcuts via the popup UI
- **Persistent storage** — All shortcuts saved in `chrome.storage.local`

## Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `Extension` folder (this directory)
5. The extension icon will appear in your toolbar

## Usage

| Action | How |
|--------|-----|
| Open palette | Press **`` ` ``** (backtick) on any page |
| Close palette | Press **`` ` ``**, **Escape**, or click outside |
| Search | Start typing to filter commands |
| Navigate | **↑ / ↓** arrow keys |
| Execute | **Enter** |
| Manage shortcuts | Click the extension icon in the toolbar |

## Project Structure

```
Extension/
├── manifest.json     # Manifest V3 configuration
├── background.js     # Service worker — default shortcuts, message handling
├── content.js        # Content script — palette overlay logic
├── content.css       # Palette overlay styles
├── popup.html        # Popup UI (shortcut manager)
├── popup.js          # Popup logic — CRUD for shortcuts
├── popup.css         # Popup styles
├── icons/            # Extension icons (16, 48, 128px)
└── README.md
```

## Default Shortcuts

### Navigation
- GitHub, Stack Overflow, MDN Web Docs
- Localhost:3000, Localhost:8080
- Chrome Extensions page, DevTools Docs

### Code Snippets
- Console log template
- Async fetch with error handling
- Debounce function
- UUID generator

### Actions
- Open DevTools (shows keyboard shortcut hint)
- Hard Reload (bypass cache)
- Clear Site Data (cookies, cache, localStorage)
- View Page Source

## Adding Custom Shortcuts

1. Click the Bhaba's Tools icon in the toolbar
2. Click **+ Add**
3. Fill in the form:
   - **Label** — Name shown in the palette
   - **Description** — Brief explanation
   - **Type** — URL, Snippet, or Action
   - **Value** — The URL, code, or action ID
   - **Category** — Grouping label
4. Click **Save**

## Permissions

- `storage` — Save shortcuts
- `activeTab` — Interact with the current tab
- `scripting` — Inject content scripts
