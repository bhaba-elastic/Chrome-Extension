// background.js — Service worker that manages default shortcuts and handles messages

// Default developer shortcuts installed on first run
const DEFAULT_SHORTCUTS = [
  {
    id: "goto-github",
    label: "GitHub",
    description: "Open GitHub",
    type: "url",
    value: "https://github.com",
    category: "Navigation"
  },
  {
    id: "goto-stackoverflow",
    label: "Stack Overflow",
    description: "Open Stack Overflow",
    type: "url",
    value: "https://stackoverflow.com",
    category: "Navigation"
  },
  {
    id: "goto-mdn",
    label: "MDN Web Docs",
    description: "Open MDN Web Docs",
    type: "url",
    value: "https://developer.mozilla.org",
    category: "Navigation"
  },
  {
    id: "goto-localhost",
    label: "Localhost:3000",
    description: "Open local dev server",
    type: "url",
    value: "http://localhost:3000",
    category: "Navigation"
  },
  {
    id: "goto-localhost-8080",
    label: "Localhost:8080",
    description: "Open local dev server (8080)",
    type: "url",
    value: "http://localhost:8080",
    category: "Navigation"
  },
  {
    id: "goto-extensions",
    label: "Chrome Extensions",
    description: "Open extensions management page",
    type: "url",
    value: "chrome://extensions",
    category: "Chrome"
  },
  {
    id: "goto-devtools-docs",
    label: "DevTools Docs",
    description: "Open Chrome DevTools documentation",
    type: "url",
    value: "https://developer.chrome.com/docs/devtools",
    category: "Navigation"
  },
  {
    id: "snippet-console-log",
    label: "Console Log",
    description: "console.log() with label",
    type: "snippet",
    value: "console.log('[DEBUG]:', );",
    category: "Snippets"
  },
  {
    id: "snippet-fetch",
    label: "Fetch Template",
    description: "Async fetch with error handling",
    type: "snippet",
    value: `async function fetchData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
    return await response.json();
  } catch (error) {
    console.error('Fetch failed:', error);
    throw error;
  }
}`,
    category: "Snippets"
  },
  {
    id: "snippet-debounce",
    label: "Debounce",
    description: "Debounce function",
    type: "snippet",
    value: `function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}`,
    category: "Snippets"
  },
  {
    id: "snippet-uuid",
    label: "UUID Generator",
    description: "Generate a random UUID v4",
    type: "snippet",
    value: `function uuid() {
  return crypto.randomUUID();
}`,
    category: "Snippets"
  },
  {
    id: "action-devtools",
    label: "Open DevTools",
    description: "Attach debugger and open Chrome DevTools",
    type: "action",
    value: "devtools",
    category: "Actions"
  },
  {
    id: "action-devtools-network",
    label: "DevTools — Network Tab",
    description: "Open DevTools to the Network panel",
    type: "action",
    value: "devtools-network",
    category: "Actions"
  },
  {
    id: "action-devtools-sources",
    label: "DevTools — Sources Tab",
    description: "Open DevTools to the Sources panel",
    type: "action",
    value: "devtools-sources",
    category: "Actions"
  },
  {
    id: "action-clear-cache",
    label: "Clear Site Data",
    description: "Clear cookies and cache for current site",
    type: "action",
    value: "clear-site-data",
    category: "Actions"
  },
  {
    id: "action-clear-cookies",
    label: "Clear Cookies",
    description: "Clear only cookies for current site",
    type: "action",
    value: "clear-cookies",
    category: "Actions"
  },
  {
    id: "action-reload-hard",
    label: "Hard Reload",
    description: "Reload page bypassing cache",
    type: "action",
    value: "hard-reload",
    category: "Actions"
  },
  {
    id: "action-toggle-js",
    label: "View Page Source",
    description: "View the page source in a new tab",
    type: "action",
    value: "view-source",
    category: "Actions"
  }
];

// Install default shortcuts on first install, and merge new defaults on update
chrome.runtime.onInstalled.addListener(async (details) => {
  const { shortcuts } = await chrome.storage.local.get("shortcuts");

  if (details.reason === "install" && !shortcuts) {
    await chrome.storage.local.set({ shortcuts: DEFAULT_SHORTCUTS });
    return;
  }

  // On update: add any new default shortcuts that don't already exist
  if (details.reason === "update" && shortcuts) {
    const existingIds = new Set(shortcuts.map((s) => s.id));
    const newDefaults = DEFAULT_SHORTCUTS.filter((d) => !existingIds.has(d.id));
    if (newDefaults.length > 0) {
      await chrome.storage.local.set({ shortcuts: [...shortcuts, ...newDefaults] });
    }
  }
});

// ── DevTools helpers ──────────────────────────────────────────
// Chrome extensions cannot directly open the DevTools UI window.
// We use chrome.debugger.attach() which connects the Chrome DevTools Protocol
// to the tab, then send CDP commands to enable the relevant domain.
// The debugger banner signals the user that debugging is active.

function openDevTools(tabId, action, sendResponse) {
  const target = { tabId };

  chrome.debugger.attach(target, "1.3", () => {
    if (chrome.runtime.lastError) {
      // Already attached or permission denied
      const msg = chrome.runtime.lastError.message || "";
      if (msg.includes("Already attached")) {
        // Debugger is already attached — just send the domain command
        sendDomainCommand(target, action, sendResponse);
      } else {
        sendResponse({ success: false, error: msg });
      }
      return;
    }
    sendDomainCommand(target, action, sendResponse);
  });
}

function sendDomainCommand(target, action, sendResponse) {
  switch (action) {
    case "open-devtools":
      // Enable basic inspection — the debugger attachment itself activates DevTools
      chrome.debugger.sendCommand(target, "Inspector.enable", {}, () => {
        sendResponse({ success: true, panel: "elements" });
      });
      break;

    case "open-devtools-network":
      // Enable the Network domain so the panel populates when the user opens it
      chrome.debugger.sendCommand(target, "Network.enable", {}, () => {
        sendResponse({ success: true, panel: "network" });
      });
      break;

    case "open-devtools-sources":
      // Enable the Debugger domain which powers the Sources panel
      chrome.debugger.sendCommand(target, "Debugger.enable", {}, () => {
        sendResponse({ success: true, panel: "sources" });
      });
      break;

    default:
      sendResponse({ success: false, error: "Unknown action" });
  }
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "navigate":
      // Open URL in current tab or new tab
      if (message.newTab) {
        chrome.tabs.create({ url: message.url });
      } else {
        chrome.tabs.update(sender.tab.id, { url: message.url });
      }
      sendResponse({ success: true });
      break;

    case "hard-reload":
      // Reload the active tab bypassing cache
      chrome.tabs.reload(sender.tab.id, { bypassCache: true });
      sendResponse({ success: true });
      break;

    case "clear-site-data":
      // Clear browsing data for the origin of the current tab
      if (sender.tab && sender.tab.url) {
        const url = new URL(sender.tab.url);
        chrome.browsingData.remove(
          { origins: [url.origin] },
          { cookies: true, cache: true, localStorage: true },
          () => sendResponse({ success: true })
        );
        return true;
      }
      sendResponse({ success: false });
      break;

    case "clear-cookies":
      // Clear only cookies for the origin of the current tab
      if (sender.tab && sender.tab.url) {
        const url = new URL(sender.tab.url);
        chrome.browsingData.remove(
          { origins: [url.origin] },
          { cookies: true },
          () => sendResponse({ success: true })
        );
        return true;
      }
      sendResponse({ success: false });
      break;

    case "view-source":
      if (sender.tab && sender.tab.url) {
        chrome.tabs.create({ url: "view-source:" + sender.tab.url });
      }
      sendResponse({ success: true });
      break;

    case "open-devtools":
    case "open-devtools-network":
    case "open-devtools-sources":
      if (sender.tab) {
        openDevTools(sender.tab.id, message.action, sendResponse);
        return true; // async response
      }
      sendResponse({ success: false, error: "No tab context" });
      break;

    case "get-shortcuts":
      chrome.storage.local.get("shortcuts", (data) => {
        sendResponse({ shortcuts: data.shortcuts || DEFAULT_SHORTCUTS });
      });
      return true; // async response

    case "save-shortcuts":
      chrome.storage.local.set({ shortcuts: message.shortcuts }, () => {
        sendResponse({ success: true });
      });
      return true;

    case "reset-shortcuts":
      chrome.storage.local.set({ shortcuts: DEFAULT_SHORTCUTS }, () => {
        sendResponse({ shortcuts: DEFAULT_SHORTCUTS });
      });
      return true;

    case "track-usage":
      // Increment usage count for a shortcut
      chrome.storage.local.get("usageCounts", (data) => {
        const counts = data.usageCounts || {};
        counts[message.shortcutId] = (counts[message.shortcutId] || 0) + 1;
        chrome.storage.local.set({ usageCounts: counts }, () => {
          sendResponse({ success: true, count: counts[message.shortcutId] });
        });
      });
      return true;

    case "get-usage-counts":
      chrome.storage.local.get("usageCounts", (data) => {
        sendResponse({ usageCounts: data.usageCounts || {} });
      });
      return true;
  }
});
