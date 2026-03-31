// popup.js — Manages the shortcut editor UI in the extension popup

(function () {
  "use strict";

  let shortcuts = [];
  let editingId = null; // null = adding new, string = editing existing
  let usageCounts = {};

  const listEl = document.getElementById("shortcut-list");
  const searchEl = document.getElementById("search");
  const formOverlay = document.getElementById("form-overlay");
  const formTitle = document.getElementById("form-title");
  const formLabel = document.getElementById("form-label");
  const formDescription = document.getElementById("form-description");
  const formType = document.getElementById("form-type");
  const formValue = document.getElementById("form-value");
  const formValueLabel = document.getElementById("form-value-label");
  const formCategory = document.getElementById("form-category");

  // ── Load shortcuts from storage ────────────────────────────

  function loadShortcuts() {
    let ready = 0;
    const tryRender = () => { if (++ready >= 2) renderList(); };

    chrome.runtime.sendMessage({ action: "get-shortcuts" }, (resp) => {
      shortcuts = resp && resp.shortcuts ? resp.shortcuts : [];
      tryRender();
    });
    chrome.runtime.sendMessage({ action: "get-usage-counts" }, (resp) => {
      usageCounts = resp && resp.usageCounts ? resp.usageCounts : {};
      tryRender();
    });
  }

  // ── Save shortcuts to storage ──────────────────────────────

  function saveShortcuts(callback) {
    chrome.runtime.sendMessage(
      { action: "save-shortcuts", shortcuts },
      () => {
        if (callback) callback();
      }
    );
  }

  // ── Render the shortcut list ───────────────────────────────

  function renderList(filter = "") {
    listEl.innerHTML = "";

    const query = filter.toLowerCase().trim();
    const visible = query
      ? shortcuts.filter(
          (s) =>
            s.label.toLowerCase().includes(query) ||
            s.description.toLowerCase().includes(query) ||
            s.category.toLowerCase().includes(query)
        )
      : shortcuts;

    if (visible.length === 0) {
      listEl.innerHTML = `<div class="empty-state">${
        query ? "No matching shortcuts" : "No shortcuts yet — click + Add to create one"
      }</div>`;
      return;
    }

    // Sort by usage frequency
    const sortedVisible = [...visible].sort(
      (a, b) => (usageCounts[b.id] || 0) - (usageCounts[a.id] || 0)
    );

    // Group by category
    const grouped = {};
    sortedVisible.forEach((s) => {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(s);
    });

    // Type icons (inline SVG strings)
    const icons = {
      url: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>`,
      snippet: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="16 18 22 12 16 6"/>
                  <polyline points="8 6 2 12 8 18"/>
                </svg>`,
      action: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                 <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
               </svg>`,
    };

    Object.keys(grouped).forEach((category) => {
      const header = document.createElement("div");
      header.className = "category-header";
      header.textContent = category;
      listEl.appendChild(header);

      grouped[category].forEach((shortcut) => {
        const card = document.createElement("div");
        card.className = "shortcut-card";
        const count = usageCounts[shortcut.id] || 0;
        card.innerHTML = `
          <div class="shortcut-icon ${shortcut.type}">${icons[shortcut.type] || ""}</div>
          <div class="shortcut-info">
            <div class="shortcut-label">${escapeHtml(shortcut.label)}</div>
            <div class="shortcut-desc">${escapeHtml(shortcut.description)}</div>
          </div>
          ${count > 0 ? `<span class="usage-badge" title="Used ${count} time${count !== 1 ? 's' : ''}">${count}</span>` : ""}
          <div class="shortcut-actions">
            <button class="edit" title="Edit">✎</button>
            <button class="delete" title="Delete">✕</button>
          </div>
        `;

        // Edit button
        card.querySelector(".edit").addEventListener("click", (e) => {
          e.stopPropagation();
          openForm(shortcut);
        });

        // Delete button
        card.querySelector(".delete").addEventListener("click", (e) => {
          e.stopPropagation();
          shortcuts = shortcuts.filter((s) => s.id !== shortcut.id);
          saveShortcuts(() => renderList(searchEl.value));
        });

        listEl.appendChild(card);
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Form: Add / Edit ──────────────────────────────────────

  function openForm(shortcut = null) {
    editingId = shortcut ? shortcut.id : null;
    formTitle.textContent = shortcut ? "Edit Shortcut" : "Add Shortcut";

    formLabel.value = shortcut ? shortcut.label : "";
    formDescription.value = shortcut ? shortcut.description : "";
    formType.value = shortcut ? shortcut.type : "url";
    formValue.value = shortcut ? shortcut.value : "";
    formCategory.value = shortcut ? shortcut.category : "";

    updateValueLabel();
    formOverlay.classList.remove("hidden");
    formLabel.focus();
  }

  function closeForm() {
    formOverlay.classList.add("hidden");
    editingId = null;
  }

  // Update the label text above the value textarea depending on type
  function updateValueLabel() {
    const labels = { url: "URL", snippet: "Code Snippet", action: "Action ID" };
    formValueLabel.textContent = labels[formType.value] || "Value";

    const placeholders = {
      url: "https://example.com",
      snippet: "console.log('hello');",
      action: "devtools / hard-reload / clear-site-data / view-source",
    };
    formValue.placeholder = placeholders[formType.value] || "";
  }

  function saveForm() {
    const label = formLabel.value.trim();
    const description = formDescription.value.trim();
    const type = formType.value;
    const value = formValue.value.trim();
    const category = formCategory.value.trim() || "Custom";

    if (!label || !value) return;

    if (editingId) {
      // Update existing
      const idx = shortcuts.findIndex((s) => s.id === editingId);
      if (idx !== -1) {
        shortcuts[idx] = { ...shortcuts[idx], label, description, type, value, category };
      }
    } else {
      // Add new
      const id = "custom-" + Date.now();
      shortcuts.push({ id, label, description, type, value, category });
    }

    saveShortcuts(() => {
      renderList(searchEl.value);
      closeForm();
    });
  }

  // ── Event listeners ────────────────────────────────────────

  searchEl.addEventListener("input", () => {
    renderList(searchEl.value);
  });

  document.getElementById("btn-add").addEventListener("click", () => {
    openForm();
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    if (confirm("Reset all shortcuts to defaults? Custom shortcuts will be lost.")) {
      chrome.runtime.sendMessage({ action: "reset-shortcuts" }, (resp) => {
        shortcuts = resp.shortcuts;
        renderList();
      });
    }
  });

  document.getElementById("btn-save").addEventListener("click", saveForm);
  document.getElementById("btn-cancel").addEventListener("click", closeForm);

  formType.addEventListener("change", updateValueLabel);

  // Allow Enter to save the form from input fields
  [formLabel, formDescription, formCategory].forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveForm();
      }
    });
  });

  // ── Export / Import ────────────────────────────────────────

  const importFileInput = document.getElementById("import-file");
  const importStatus = document.getElementById("import-status");
  let importStatusTimer = null;

  function showImportStatus(message, isError = false) {
    if (importStatusTimer) clearTimeout(importStatusTimer);
    importStatus.textContent = message;
    importStatus.className = isError ? "import-error" : "import-success";
    importStatusTimer = setTimeout(() => {
      importStatus.className = "hidden";
      importStatusTimer = null;
    }, 4000);
  }

  // Export: download shortcuts as JSON
  document.getElementById("btn-export").addEventListener("click", () => {
    if (shortcuts.length === 0) {
      showImportStatus("No shortcuts to export", true);
      return;
    }
    const data = JSON.stringify(
      { shortcuts, exportedAt: new Date().toISOString() },
      null,
      2
    );
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bhaba-tools-shortcuts.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showImportStatus(`Exported ${shortcuts.length} shortcuts`);
  });

  // Import: trigger file picker
  document.getElementById("btn-import").addEventListener("click", () => {
    importFileInput.value = "";
    importFileInput.click();
  });

  // Handle selected file
  const VALID_TYPES = new Set(["url", "snippet", "action"]);
  const MAX_FILE_SIZE = 1_000_000; // 1 MB

  importFileInput.addEventListener("change", () => {
    const file = importFileInput.files[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      showImportStatus("File too large (max 1 MB)", true);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      showImportStatus("Failed to read file", true);
    };
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.shortcuts || !Array.isArray(data.shortcuts)) {
          showImportStatus("Invalid file: missing shortcuts array", true);
          return;
        }

        // Validate each shortcut has required fields and valid type
        const valid = data.shortcuts.filter(
          (s) =>
            s &&
            typeof s.id === "string" &&
            typeof s.label === "string" &&
            typeof s.type === "string" &&
            VALID_TYPES.has(s.type) &&
            typeof s.value === "string"
        ).map((s) => ({
          id: s.id,
          label: s.label,
          description: s.description || "",
          type: s.type,
          value: s.value,
          category: s.category || "Custom",
        }));

        if (valid.length === 0) {
          showImportStatus("No valid shortcuts found in file", true);
          return;
        }

        const skipped = data.shortcuts.length - valid.length;
        if (!confirm(`This will replace your current ${shortcuts.length} shortcuts with ${valid.length} imported ones. Continue?`)) {
          return;
        }

        shortcuts = valid;
        saveShortcuts(() => {
          renderList();
          let msg = `Imported ${valid.length} shortcuts`;
          if (skipped > 0) msg += ` (${skipped} skipped — invalid)`;
          showImportStatus(msg);
        });
      } catch (err) {
        showImportStatus("Failed to parse JSON file", true);
      }
    };
    reader.readAsText(file);
  });

  // ── Google Drive sync ──────────────────────────────────────

  const driveStatus = document.getElementById("drive-status");
  const driveDisconnected = document.getElementById("drive-disconnected");
  const driveConnected = document.getElementById("drive-connected");
  const driveUserEmail = document.getElementById("drive-user-email");

  let driveStatusTimer = null;
  function showDriveStatus(message, isError = false) {
    if (driveStatusTimer) clearTimeout(driveStatusTimer);
    driveStatus.textContent = message;
    driveStatus.className = isError ? "drive-error" : "drive-success";
    driveStatusTimer = setTimeout(() => {
      driveStatus.className = "hidden";
      driveStatusTimer = null;
    }, 4000);
  }

  function setDriveConnected(email) {
    driveDisconnected.classList.add("hidden");
    driveConnected.classList.remove("hidden");
    driveUserEmail.textContent = email;
  }

  function setDriveDisconnected() {
    driveConnected.classList.add("hidden");
    driveDisconnected.classList.remove("hidden");
    driveUserEmail.textContent = "";
  }

  // Check connection status on load
  function checkDriveStatus() {
    chrome.runtime.sendMessage({ action: "drive-status" }, (resp) => {
      if (resp && resp.connected) {
        setDriveConnected(resp.email);
      } else {
        setDriveDisconnected();
      }
    });
  }

  // Connect
  document.getElementById("btn-drive-connect").addEventListener("click", () => {
    const btn = document.getElementById("btn-drive-connect");
    btn.disabled = true;
    btn.textContent = "Connecting...";

    chrome.runtime.sendMessage({ action: "drive-connect" }, (resp) => {
      btn.disabled = false;
      btn.textContent = "Connect Google Drive";
      if (resp && resp.success) {
        setDriveConnected(resp.email);
        showDriveStatus("Connected as " + resp.email);
      } else {
        showDriveStatus((resp && resp.error) || "Connection failed", true);
      }
    });
  });

  // Disconnect
  document.getElementById("btn-drive-disconnect").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "drive-disconnect" }, (resp) => {
      if (resp && resp.success) {
        setDriveDisconnected();
        showDriveStatus("Disconnected from Google Drive");
      }
    });
  });

  // Backup
  document.getElementById("btn-drive-backup").addEventListener("click", () => {
    const btn = document.getElementById("btn-drive-backup");
    btn.disabled = true;
    btn.textContent = "Saving...";

    chrome.runtime.sendMessage(
      { action: "drive-backup", shortcuts },
      (resp) => {
        btn.disabled = false;
        btn.textContent = "Backup to Drive";
        if (resp && resp.success) {
          showDriveStatus(
            resp.updated ? "Shortcuts updated in Drive" : "Shortcuts saved to Drive"
          );
        } else {
          const err = (resp && resp.error) || "Backup failed";
          if (err.includes("Not connected") || err.includes("reconnect")) {
            setDriveDisconnected();
          }
          showDriveStatus(err, true);
        }
      }
    );
  });

  // Import from Drive
  document.getElementById("btn-drive-restore").addEventListener("click", () => {
    const btn = document.getElementById("btn-drive-restore");
    btn.disabled = true;
    btn.textContent = "Importing...";

    chrome.runtime.sendMessage({ action: "drive-restore" }, (resp) => {
      btn.disabled = false;
      btn.textContent = "Import from Drive";
      if (resp && resp.success) {
        shortcuts = resp.shortcuts;
        renderList();
        const date = resp.exportedAt
          ? new Date(resp.exportedAt).toLocaleDateString()
          : "unknown date";
        showDriveStatus(`Restored ${resp.shortcuts.length} shortcuts (backed up ${date})`);
      } else {
        const err = (resp && resp.error) || "Restore failed";
        if (err.includes("Not connected") || err.includes("reconnect")) {
          setDriveDisconnected();
        }
        showDriveStatus(err, true);
      }
    });
  });

  // ── Initialize ─────────────────────────────────────────────
  loadShortcuts();
  checkDriveStatus();
})();
