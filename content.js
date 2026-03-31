// content.js — Injected into every page. Handles the command palette overlay.

(function () {
  "use strict";

  // Prevent double-injection (e.g. if extension reloads)
  if (document.getElementById("devpalette-overlay")) return;

  // ── State ──────────────────────────────────────────────────
  let shortcuts = [];
  let filtered = [];
  let selectedIndex = 0;
  let isOpen = false;

  // ── Build DOM ──────────────────────────────────────────────
  const overlay = document.createElement("div");
  overlay.id = "devpalette-overlay";

  overlay.innerHTML = `
    <div id="devpalette-container">
      <div id="devpalette-input-wrapper">
        <svg id="devpalette-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input id="devpalette-input" type="text" placeholder="Type a command..." autocomplete="off" spellcheck="false" />
      </div>
      <div id="devpalette-results"></div>
      <div id="devpalette-footer">
        <span class="devpalette-key-hint">
          <kbd>↑↓</kbd> navigate
          &nbsp;&nbsp;
          <kbd>Enter</kbd> select
          &nbsp;&nbsp;
          <kbd>Esc</kbd> close
        </span>
        <span class="devpalette-key-hint">
          <kbd>\`</kbd> toggle
        </span>
      </div>
    </div>
    <div id="devpalette-toast">Copied to clipboard!</div>
  `;

  document.documentElement.appendChild(overlay);

  const input = document.getElementById("devpalette-input");
  const results = document.getElementById("devpalette-results");
  const toast = document.getElementById("devpalette-toast");

  // ── Icon helpers ───────────────────────────────────────────

  // Returns an SVG icon string based on shortcut type
  function getIcon(type) {
    switch (type) {
      case "url":
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>`;
      case "snippet":
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="16 18 22 12 16 6"/>
                  <polyline points="8 6 2 12 8 18"/>
                </svg>`;
      case "action":
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>`;
      default:
        return "";
    }
  }

  // ── Rendering ──────────────────────────────────────────────

  function render() {
    results.innerHTML = "";

    if (filtered.length === 0) {
      results.innerHTML = `<div id="devpalette-empty">No matching commands</div>`;
      return;
    }

    // Group by category for visual separation
    let currentCategory = null;

    filtered.forEach((item, index) => {
      // Insert category header when category changes
      if (item.category !== currentCategory) {
        currentCategory = item.category;
        const catEl = document.createElement("div");
        catEl.className = "devpalette-category";
        catEl.textContent = currentCategory;
        results.appendChild(catEl);
      }

      const el = document.createElement("div");
      el.className = "devpalette-item" + (index === selectedIndex ? " selected" : "");
      el.dataset.index = index;

      el.innerHTML = `
        <div class="devpalette-item-icon ${item.type}">${getIcon(item.type)}</div>
        <div class="devpalette-item-text">
          <div class="devpalette-item-label">${escapeHtml(item.label)}</div>
          <div class="devpalette-item-description">${escapeHtml(item.description)}</div>
        </div>
        <span class="devpalette-item-badge ${item.type}">${item.type}</span>
      `;

      // Click to execute
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectedIndex = index;
        executeSelected();
      });

      // Hover to highlight
      el.addEventListener("mouseenter", () => {
        selectedIndex = index;
        updateSelection();
      });

      results.appendChild(el);
    });
  }

  // Update which item has the .selected class without re-rendering everything
  function updateSelection() {
    const items = results.querySelectorAll(".devpalette-item");
    items.forEach((el) => {
      el.classList.toggle("selected", parseInt(el.dataset.index) === selectedIndex);
    });
    // Scroll selected item into view
    const selected = results.querySelector(".devpalette-item.selected");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Filtering ──────────────────────────────────────────────

  // Fuzzy-ish filter: matches if every word in the query appears in label or description
  function filterShortcuts(query) {
    if (!query) {
      filtered = [...shortcuts];
    } else {
      const words = query.toLowerCase().split(/\s+/);
      filtered = shortcuts.filter((s) => {
        const text = (s.label + " " + s.description + " " + s.category).toLowerCase();
        return words.every((w) => text.includes(w));
      });
    }
    selectedIndex = 0;
    render();
  }

  // ── Execution ──────────────────────────────────────────────

  function executeSelected() {
    const item = filtered[selectedIndex];
    if (!item) return;

    switch (item.type) {
      case "url":
        closePalette();
        chrome.runtime.sendMessage({ action: "navigate", url: item.value, newTab: true });
        break;

      case "snippet":
        // Copy snippet to clipboard and show toast
        navigator.clipboard.writeText(item.value).then(() => {
          showToast("Copied to clipboard!");
          closePalette();
        }).catch(() => {
          // Fallback: select and copy
          const ta = document.createElement("textarea");
          ta.value = item.value;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          showToast("Copied to clipboard!");
          closePalette();
        });
        break;

      case "action":
        closePalette();
        executeAction(item.value);
        break;
    }
  }

  // Detect macOS for keyboard shortcut hints
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  function executeAction(actionId) {
    switch (actionId) {
      case "devtools":
        chrome.runtime.sendMessage({ action: "open-devtools" }, (resp) => {
          if (resp && resp.success) {
            showToast("Debugger attached — press " + (isMac ? "Cmd+Opt+I" : "F12") + " to open DevTools UI");
          } else {
            showToast("Could not attach debugger: " + (resp && resp.error || "unknown error"));
          }
        });
        break;

      case "devtools-network":
        chrome.runtime.sendMessage({ action: "open-devtools-network" }, (resp) => {
          if (resp && resp.success) {
            showToast("Network recording started — press " + (isMac ? "Cmd+Opt+I" : "F12") + " then switch to Network tab");
          } else {
            showToast("Could not attach debugger: " + (resp && resp.error || "unknown error"));
          }
        });
        break;

      case "devtools-sources":
        chrome.runtime.sendMessage({ action: "open-devtools-sources" }, (resp) => {
          if (resp && resp.success) {
            showToast("Debugger enabled — press " + (isMac ? "Cmd+Opt+I" : "F12") + " then switch to Sources tab");
          } else {
            showToast("Could not attach debugger: " + (resp && resp.error || "unknown error"));
          }
        });
        break;

      case "hard-reload":
        chrome.runtime.sendMessage({ action: "hard-reload" });
        break;

      case "clear-site-data":
        chrome.runtime.sendMessage({ action: "clear-site-data" }, (resp) => {
          if (resp && resp.success) {
            showToast("Site data cleared — reload to take effect");
          }
        });
        break;

      case "clear-cookies":
        chrome.runtime.sendMessage({ action: "clear-cookies" }, (resp) => {
          if (resp && resp.success) {
            showToast("Cookies cleared for this site");
          }
        });
        break;

      case "view-source":
        chrome.runtime.sendMessage({ action: "view-source" });
        break;
    }
  }

  // ── Toast notification ─────────────────────────────────────

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2000);
  }

  // ── Open / Close ───────────────────────────────────────────

  function openPalette() {
    if (isOpen) return;
    isOpen = true;

    // Fetch the latest shortcuts from storage every time the palette opens
    chrome.runtime.sendMessage({ action: "get-shortcuts" }, (resp) => {
      if (resp && resp.shortcuts) {
        shortcuts = resp.shortcuts;
      }
      filterShortcuts("");
      overlay.classList.add("visible");
      input.value = "";
      input.focus();
    });
  }

  function closePalette() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove("visible");
    input.value = "";
  }

  // ── Keyboard handling ──────────────────────────────────────

  // Global listener for the backtick trigger key
  document.addEventListener("keydown", (e) => {
    // Don't trigger if user is typing in an input/textarea (unless our own input)
    const tag = e.target.tagName;
    const isEditable = e.target.isContentEditable;
    const isInput = tag === "INPUT" || tag === "TEXTAREA" || isEditable;

    if (e.key === "`") {
      // If palette is open, close it
      if (isOpen) {
        e.preventDefault();
        closePalette();
        return;
      }
      // If not in an input field, open palette
      if (!isInput) {
        e.preventDefault();
        openPalette();
      }
    }

    // Escape to close
    if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      closePalette();
    }
  });

  // Keyboard navigation within the palette
  input.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
        updateSelection();
        break;

      case "ArrowUp":
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        updateSelection();
        break;

      case "Enter":
        e.preventDefault();
        executeSelected();
        break;

      case "Escape":
        e.preventDefault();
        closePalette();
        break;

      case "`":
        // Prevent the backtick from being typed into the search box
        e.preventDefault();
        closePalette();
        break;
    }
  });

  // Live filtering as the user types
  input.addEventListener("input", () => {
    filterShortcuts(input.value.trim());
  });

  // Close palette when clicking the backdrop (outside the container)
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) {
      closePalette();
    }
  });
})();
