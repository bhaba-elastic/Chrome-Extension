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
  },
  {
    id: "action-close-duplicates",
    label: "Close Duplicate Tabs",
    description: "Close all duplicate tabs, keeping one per URL",
    type: "action",
    value: "close-duplicate-tabs",
    category: "Tab Management"
  },
  {
    id: "action-group-by-domain",
    label: "Group Tabs by Domain",
    description: "Group all open tabs by their domain",
    type: "action",
    value: "group-tabs-by-domain",
    category: "Tab Management"
  },
  {
    id: "action-move-to-window",
    label: "Move Tab to New Window",
    description: "Move the current tab to a new window",
    type: "action",
    value: "move-tab-to-window",
    category: "Tab Management"
  },
  {
    id: "action-custom-group",
    label: "Add Tab to Custom Group",
    description: "Add current tab to a named group, creating it if it doesn't exist",
    type: "action",
    value: "add-tab-to-group",
    category: "Tab Management"
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

    case "close-duplicate-tabs":
      closeDuplicateTabs().then((result) => sendResponse(result));
      return true;

    case "group-tabs-by-domain":
      groupTabsByDomain().then((result) => sendResponse(result));
      return true;

    case "move-tab-to-window":
      if (sender.tab) {
        moveTabToNewWindow(sender.tab.id).then((result) => sendResponse(result));
        return true;
      }
      sendResponse({ success: false, error: "No tab context" });
      break;

    case "add-tab-to-group":
      if (sender.tab) {
        addTabToGroup(sender.tab.id, message.groupName).then((result) => sendResponse(result));
        return true;
      }
      sendResponse({ success: false, error: "No tab context" });
      break;

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

    case "drive-connect":
      driveConnect()
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case "drive-disconnect":
      driveDisconnect()
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case "drive-status":
      driveGetStatus()
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, connected: false }));
      return true;

    case "drive-backup":
      driveBackup(message.shortcuts)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case "drive-restore":
      driveRestore()
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
  }
});

// ── Tab management ───────────────────────────────────────────

async function closeDuplicateTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    const seen = new Map(); // url -> first tab id
    const toClose = [];

    for (const tab of tabs) {
      // Skip special pages (chrome://, about:, etc.) and pinned tabs
      if (!tab.url || !tab.url.startsWith("http")) continue;
      if (tab.pinned) continue;
      if (seen.has(tab.url)) {
        toClose.push(tab.id);
      } else {
        seen.set(tab.url, tab.id);
      }
    }

    if (toClose.length === 0) {
      return { success: true, closed: 0 };
    }
    await chrome.tabs.remove(toClose);
    return { success: true, closed: toClose.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function groupTabsByDomain() {
  try {
    const tabs = await chrome.tabs.query({});
    const byDomain = {};

    for (const tab of tabs) {
      // Skip special pages and pinned tabs
      if (!tab.url || !tab.url.startsWith("http")) continue;
      if (tab.pinned) continue;
      const domain = new URL(tab.url).hostname;
      if (!byDomain[domain]) byDomain[domain] = [];
      byDomain[domain].push(tab.id);
    }

    // Only group domains that have more than one tab
    let groupsCreated = 0;
    for (const [domain, tabIds] of Object.entries(byDomain)) {
      if (tabIds.length < 2) continue;
      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, { title: domain });
      groupsCreated++;
    }

    return { success: true, groups: groupsCreated };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function moveTabToNewWindow(tabId) {
  try {
    // Check if this is the only tab in the current window
    const tab = await chrome.tabs.get(tabId);
    const windowTabs = await chrome.tabs.query({ windowId: tab.windowId });
    if (windowTabs.length <= 1) {
      return { success: false, error: "Cannot move — this is the only tab in the window" };
    }
    const newWindow = await chrome.windows.create({ tabId });
    return { success: true, windowId: newWindow.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function addTabToGroup(tabId, groupName) {
  try {
    if (!groupName || !groupName.trim()) {
      return { success: false, error: "Group name cannot be empty" };
    }
    const name = groupName.trim();

    // Check if a group with this name already exists in the same window
    const tab = await chrome.tabs.get(tabId);
    const existingGroups = await chrome.tabGroups.query({ windowId: tab.windowId });
    const match = existingGroups.find(
      (g) => g.title && g.title.toLowerCase() === name.toLowerCase()
    );

    if (match) {
      // Add tab to the existing group
      await chrome.tabs.group({ tabIds: [tabId], groupId: match.id });
      return { success: true, groupName: match.title, created: false };
    } else {
      // Create a new group with the given name
      const groupId = await chrome.tabs.group({ tabIds: [tabId] });
      await chrome.tabGroups.update(groupId, { title: name });
      return { success: true, groupName: name, created: true };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Google Drive sync ────────────────────────────────────────
//
// Setup instructions:
// 1. Go to https://console.cloud.google.com/
// 2. Create a project (or use an existing one)
// 3. Enable the "Google Drive API"
// 4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
// 5. Application type: "Web application"
// 6. Under "Authorized redirect URIs" add:
//    https://<YOUR_EXTENSION_ID>.chromiumapp.org/
//    (Find your extension ID at chrome://extensions with Developer mode on)
// 7. Copy the Client ID and paste it below.

const GOOGLE_CLIENT_ID = "YOUR_CLIENT_ID_HERE.apps.googleusercontent.com";
const DRIVE_SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";
const DRIVE_FILENAME = "bhaba-tools-shortcuts.json";

// ── OAuth via launchWebAuthFlow ──────────────────────────────

function getRedirectURL() {
  return chrome.identity.getRedirectURL();
}

async function driveConnect() {
  const redirectUrl = getRedirectURL();
  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth" +
    `?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
    `&response_type=token` +
    `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
    `&scope=${encodeURIComponent(DRIVE_SCOPES)}` +
    `&prompt=consent`;

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (callbackUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(callbackUrl);
        }
      }
    );
  });

  // Extract access token from redirect URL fragment
  const hashParams = new URLSearchParams(responseUrl.split("#")[1]);
  const accessToken = hashParams.get("access_token");
  if (!accessToken) {
    throw new Error("No access token received");
  }

  // Fetch user info for display
  const userResp = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!userResp.ok) throw new Error("Failed to fetch user info");
  const userInfo = await userResp.json();

  // Store token and user info
  await chrome.storage.local.set({
    driveToken: accessToken,
    driveUser: { email: userInfo.email, name: userInfo.name },
  });

  return { success: true, email: userInfo.email, name: userInfo.name };
}

async function driveDisconnect() {
  const { driveToken } = await chrome.storage.local.get("driveToken");
  // Revoke the token with Google
  if (driveToken) {
    fetch(`https://accounts.google.com/o/oauth2/revoke?token=${driveToken}`).catch(() => {});
  }
  await chrome.storage.local.remove(["driveToken", "driveUser"]);
  return { success: true };
}

async function driveGetStatus() {
  const { driveToken, driveUser } = await chrome.storage.local.get(["driveToken", "driveUser"]);
  if (!driveToken || !driveUser) {
    return { connected: false };
  }
  // Verify token is still valid
  const resp = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { Authorization: `Bearer ${driveToken}` } }
  );
  if (!resp.ok) {
    // Token expired — clean up
    await chrome.storage.local.remove(["driveToken", "driveUser"]);
    return { connected: false, expired: true };
  }
  return { connected: true, email: driveUser.email, name: driveUser.name };
}

// ── Drive file operations ────────────────────────────────────

async function getStoredToken() {
  const { driveToken } = await chrome.storage.local.get("driveToken");
  if (!driveToken) throw new Error("Not connected to Google Drive. Please connect first.");

  // Verify token is still valid; if expired, attempt re-auth
  const check = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${driveToken}` },
  });
  if (check.ok) return driveToken;

  // Token expired — try silent re-auth
  try {
    const result = await driveConnect();
    if (result.success) {
      const { driveToken: newToken } = await chrome.storage.local.get("driveToken");
      return newToken;
    }
  } catch (_) {
    // Silent re-auth failed
  }
  await chrome.storage.local.remove(["driveToken", "driveUser"]);
  throw new Error("Session expired. Please reconnect to Google Drive.");
}

async function findDriveFile(token) {
  const query = encodeURIComponent(
    `name='${DRIVE_FILENAME}' and trashed=false`
  );
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) throw new Error(`Drive search failed: ${resp.status}`);
  const data = await resp.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
}

async function driveBackup(shortcuts) {
  const token = await getStoredToken();
  const existing = await findDriveFile(token);
  const content = JSON.stringify({ shortcuts, exportedAt: new Date().toISOString() }, null, 2);

  if (existing) {
    const resp = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: content,
      }
    );
    if (!resp.ok) throw new Error(`Drive update failed: ${resp.status}`);
    return { success: true, fileId: existing.id, updated: true };
  } else {
    const metadata = { name: DRIVE_FILENAME, mimeType: "application/json" };
    const boundary = "----DriveBackupBoundary";
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      content +
      `\r\n--${boundary}--`;

    const resp = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
    if (!resp.ok) throw new Error(`Drive create failed: ${resp.status}`);
    const file = await resp.json();
    return { success: true, fileId: file.id, updated: false };
  }
}

async function driveRestore() {
  const token = await getStoredToken();
  const existing = await findDriveFile(token);

  if (!existing) {
    return { success: false, error: "No backup found in Google Drive" };
  }

  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) throw new Error(`Drive download failed: ${resp.status}`);

  const data = await resp.json();
  if (!data.shortcuts || !Array.isArray(data.shortcuts)) {
    return { success: false, error: "Invalid backup file format" };
  }

  // Validate each shortcut has required fields
  const validShortcuts = data.shortcuts.filter(
    (s) => s && typeof s.id === "string" && typeof s.label === "string" &&
           typeof s.type === "string" && typeof s.value === "string"
  ).map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description || "",
    type: s.type,
    value: s.value,
    category: s.category || "Custom",
  }));

  if (validShortcuts.length === 0) {
    return { success: false, error: "Backup file contains no valid shortcuts" };
  }

  await chrome.storage.local.set({ shortcuts: validShortcuts });
  return { success: true, shortcuts: validShortcuts, exportedAt: data.exportedAt };
}
