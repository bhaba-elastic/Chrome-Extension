// popup.js — Manages the shortcut editor UI in the extension popup

(function () {
  "use strict";

  let shortcuts = [];
  let editingId = null; // null = adding new, string = editing existing

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
    chrome.runtime.sendMessage({ action: "get-shortcuts" }, (resp) => {
      shortcuts = resp && resp.shortcuts ? resp.shortcuts : [];
      renderList();
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

    // Group by category
    const grouped = {};
    visible.forEach((s) => {
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
        card.innerHTML = `
          <div class="shortcut-icon ${shortcut.type}">${icons[shortcut.type] || ""}</div>
          <div class="shortcut-info">
            <div class="shortcut-label">${escapeHtml(shortcut.label)}</div>
            <div class="shortcut-desc">${escapeHtml(shortcut.description)}</div>
          </div>
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

  // ── Initialize ─────────────────────────────────────────────
  loadShortcuts();
})();
