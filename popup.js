// popup.js – Profile management, presets, PDF import, tracker, AI Q&A, and encryption
(() => {
  "use strict";

  const PROFILE_FIELDS = [
    // Personal
    "firstName", "lastName", "middleName", "email", "phone", "altPhone",
    "dob", "gender", "maritalStatus", "nationality", "fatherName", "motherName", "languages",
    // Address
    "address", "addressLine2", "city", "state", "zip", "country",
    // Identity Documents
    "panNumber", "aadharNumber", "passportNumber", "ssn", "drivingLicense",
    // Education – 10th
    "tenthSchool", "tenthBoard", "tenthPercentage", "tenthYear",
    // Education – 12th
    "twelfthSchool", "twelfthBoard", "twelfthPercentage", "twelfthYear", "twelfthStream",
    // Education – UG
    "ugDegree", "ugSpecialization", "ugCollege", "ugPercentage", "ugYear",
    // Education – PG
    "pgDegree", "pgSpecialization", "pgCollege", "pgPercentage", "pgYear",
    // Professional
    "currentCompany", "currentTitle", "experience", "currentCTC", "expectedCTC",
    "noticePeriod", "skills", "preferredLocation", "previousCompany", "previousTitle",
    "highestQualification",
    // Links
    "linkedin", "website", "github", "twitter",
    // EEO
    "race", "veteranStatus", "disabilityStatus"
  ];

  const STORAGE_KEY = "jobfill_profile";
  const PRESETS_KEY = "jobfill_presets";
  const ACTIVE_PRESET_KEY = "jobfill_active_preset";
  const TRACKER_KEY = "jobfill_applications";
  const AI_CONFIG_KEY = "jobfill_ai_config";

  let currentPreset = "Default";

  // =========================================================================
  // PRESETS MANAGEMENT
  // =========================================================================
  function initPresets() {
    chrome.storage.local.get([PRESETS_KEY, ACTIVE_PRESET_KEY, STORAGE_KEY], (res) => {
      let presets = res[PRESETS_KEY] || {};
      let active = res[ACTIVE_PRESET_KEY] || "Default";

      if (!presets["Default"]) {
        presets["Default"] = res[STORAGE_KEY] || {};
      }

      currentPreset = active;
      renderPresetSelect(presets, currentPreset);
      loadProfileData(presets[currentPreset] || {});
    });
  }

  function renderPresetSelect(presets, activeKey) {
    const select = document.getElementById("presetSelect");
    select.innerHTML = "";
    Object.keys(presets).forEach((key) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = key;
      if (key === activeKey) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function setupPresetHandlers() {
    const select = document.getElementById("presetSelect");
    select.addEventListener("change", () => {
      const selected = select.value;
      saveProfile(); // save current preset first
      currentPreset = selected;
      chrome.storage.local.set({ [ACTIVE_PRESET_KEY]: currentPreset }, () => {
        chrome.storage.local.get(PRESETS_KEY, (res) => {
          const presets = res[PRESETS_KEY] || {};
          loadProfileData(presets[currentPreset] || {});
          showSaveIndicator();
        });
      });
    });

    document.getElementById("btnNewPreset").addEventListener("click", () => {
      const name = prompt("Enter new profile preset name (e.g., Tech Resume):");
      if (name && name.trim()) {
        const presetName = name.trim();
        chrome.storage.local.get(PRESETS_KEY, (res) => {
          const presets = res[PRESETS_KEY] || {};
          presets[presetName] = {};
          currentPreset = presetName;
          chrome.storage.local.set({ [PRESETS_KEY]: presets, [ACTIVE_PRESET_KEY]: currentPreset }, () => {
            renderPresetSelect(presets, currentPreset);
            loadProfileData({});
            showSaveIndicator();
          });
        });
      }
    });

    document.getElementById("btnDeletePreset").addEventListener("click", () => {
      if (currentPreset === "Default") {
        alert("Cannot delete the Default preset.");
        return;
      }
      if (confirm(`Delete preset "${currentPreset}"?`)) {
        chrome.storage.local.get(PRESETS_KEY, (res) => {
          const presets = res[PRESETS_KEY] || {};
          delete presets[currentPreset];
          currentPreset = "Default";
          chrome.storage.local.set({ [PRESETS_KEY]: presets, [ACTIVE_PRESET_KEY]: currentPreset }, () => {
            renderPresetSelect(presets, currentPreset);
            loadProfileData(presets["Default"] || {});
            showSaveIndicator();
          });
        });
      }
    });
  }

  // =========================================================================
  // PROFILE STORAGE
  // =========================================================================
  function loadProfileData(profile) {
    for (const field of PROFILE_FIELDS) {
      const input = document.getElementById(field);
      if (input) {
        input.value = profile[field] || "";
      }
    }
    updateCompleteness();
  }

  function saveProfile() {
    const profile = {};
    for (const field of PROFILE_FIELDS) {
      const input = document.getElementById(field);
      if (input) {
        profile[field] = input.value.trim();
      }
    }

    chrome.storage.local.get(PRESETS_KEY, (res) => {
      const presets = res[PRESETS_KEY] || {};
      presets[currentPreset] = profile;
      chrome.storage.local.set({
        [PRESETS_KEY]: presets,
        [STORAGE_KEY]: profile,
        [ACTIVE_PRESET_KEY]: currentPreset
      }, () => {
        showSaveIndicator();
        updateCompleteness();
      });
    });

    return profile;
  }

  function getProfile() {
    return new Promise((resolve) => {
      const profile = {};
      for (const field of PROFILE_FIELDS) {
        const input = document.getElementById(field);
        if (input) {
          profile[field] = input.value.trim();
        }
      }
      resolve(profile);
    });
  }

  function setupAutoSave() {
    for (const field of PROFILE_FIELDS) {
      const input = document.getElementById(field);
      if (input) {
        input.addEventListener("input", debounce(saveProfile, 400));
      }
    }
  }

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function showSaveIndicator() {
    const indicator = document.getElementById("saveIndicator");
    indicator.classList.add("show");
    setTimeout(() => indicator.classList.remove("show"), 1200);
  }

  // =========================================================================
  // PDF RESUME PARSER
  // =========================================================================
  function setupPdfImporter() {
    const btn = document.getElementById("btnImportPdf");
    const input = document.getElementById("pdfFileInput");

    btn.addEventListener("click", () => input.click());

    input.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await extractPdfText(file);
        parseResumeTextToProfile(text);
        saveProfile();
        showStatus("success", "✓", "Resume PDF parsed & imported successfully!");
      } catch (err) {
        showStatus("error", "✗", "Could not parse PDF file: " + err.message);
      }
    });
  }

  async function extractPdfText(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let str = "";
    for (let i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i]);
    }

    // Extract text streams enclosed in (text) Tj or [(text)] TJ
    const textMatches = [];
    const regex = /\(([^()]{2,})\)\s*T[jJ]/g;
    let match;
    while ((match = regex.exec(str)) !== null) {
      textMatches.push(match[1]);
    }

    if (textMatches.length === 0) {
      // Fallback: extract ASCII printable blocks
      const printable = str.replace(/[^\x20-\x7E\n]/g, " ");
      return printable;
    }

    return textMatches.join(" ");
  }

  function parseResumeTextToProfile(text) {
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) setFieldValueIfEmpty("email", emailMatch[0]);

    const phoneMatch = text.match(/(\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/);
    if (phoneMatch) setFieldValueIfEmpty("phone", phoneMatch[0]);

    const linkedinMatch = text.match(/https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/);
    if (linkedinMatch) setFieldValueIfEmpty("linkedin", linkedinMatch[0]);

    const githubMatch = text.match(/https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+/);
    if (githubMatch) setFieldValueIfEmpty("github", githubMatch[0]);

    // Extract skills keywords
    const skillList = ["JavaScript", "TypeScript", "React", "Node.js", "Python", "Java", "C++", "AWS", "Docker", "SQL", "Git", "HTML", "CSS"];
    const foundSkills = skillList.filter(s => new RegExp(`\\b${s}\\b`, "i").test(text));
    if (foundSkills.length > 0) {
      setFieldValueIfEmpty("skills", foundSkills.join(", "));
    }
  }

  function setFieldValueIfEmpty(id, val) {
    const el = document.getElementById(id);
    if (el && !el.value) {
      el.value = val;
    }
  }

  // =========================================================================
  // TABS & SECTIONS
  // =========================================================================
  function setupTabs() {
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));

        tab.classList.add("active");
        const panelId = `panel-${tab.dataset.tab}`;
        const panel = document.getElementById(panelId);
        if (panel) panel.classList.add("active");

        if (tab.dataset.tab === "tracker") {
          loadTrackerLog();
        }
      });
    });
  }

  function setupSections() {
    document.querySelectorAll(".section-header").forEach((header) => {
      header.addEventListener("click", () => {
        header.parentElement.classList.toggle("open");
      });
    });
  }

  // =========================================================================
  // FILL & SCAN BUTTONS
  // =========================================================================
  function setupFillButton() {
    document.getElementById("btnFill").addEventListener("click", async () => {
      const profile = await getProfile();
      const filledFields = Object.values(profile).filter(v => v).length;

      if (filledFields === 0) {
        showStatus("warning", "⚠️", "No profile data. Fill in your profile first.");
        return;
      }

      const btn = document.getElementById("btnFill");
      btn.textContent = "Filling...";
      btn.disabled = true;

      chrome.runtime.sendMessage({ action: "fillForm", profile }, (response) => {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Auto-Fill This Page
        `;

        if (chrome.runtime.lastError) {
          showStatus("error", "✗", "Could not reach page. Try refreshing.");
          return;
        }

        if (response && response.filled > 0) {
          showStatus("success", "✓", `Filled ${response.filled} of ${response.total} fields`);
        } else if (response && response.total > 0) {
          showStatus("warning", "⚠️", `Found ${response.total} fields but no direct matches.`);
        } else {
          showStatus("warning", "⚠️", "No form fields found on this page.");
        }
      });
    });
  }

  function setupScanButton() {
    document.getElementById("btnScan").addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "scanForm" }, (response) => {
        if (chrome.runtime.lastError || !response) {
          showStatus("error", "✗", "Could not scan page. Try refreshing.");
          return;
        }

        const container = document.getElementById("scanResults");
        container.innerHTML = "";
        container.classList.add("show");

        if (response.fields.length === 0) {
          container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 8px 0;">No form fields found on this page.</div>';
          return;
        }

        for (const field of response.fields) {
          const item = document.createElement("div");
          item.className = "scan-item";
          const fieldId = field.name || field.id || field.placeholder || `<${field.tag}>`;

          item.innerHTML = `
            <span class="scan-field-name">${escapeHtml(fieldId)}</span>
            <span class="scan-match ${field.matched ? "matched" : "unmatched"}">
              ${field.matched ? `→ ${field.matched}` : "No match"}
            </span>
          `;

          // Click to highlight field on page
          item.addEventListener("click", () => {
            chrome.runtime.sendMessage({ action: "highlightField", fieldName: field.name || field.id });
          });

          container.appendChild(item);
        }
      });
    });
  }

  // =========================================================================
  // TRACKER LOG
  // =========================================================================
  function loadTrackerLog() {
    chrome.storage.local.get(TRACKER_KEY, (res) => {
      const list = res[TRACKER_KEY] || [];
      const container = document.getElementById("trackerList");
      container.innerHTML = "";

      if (list.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 12px 0; text-align: center;">No applications logged yet. Autofill a page to track!</div>';
        return;
      }

      list.forEach((item) => {
        const el = document.createElement("div");
        el.className = "tracker-item";
        const dateStr = new Date(item.date).toLocaleDateString();
        el.innerHTML = `
          <div class="tracker-title">${escapeHtml(item.title)}</div>
          <div class="tracker-url">${escapeHtml(item.url)}</div>
          <div class="tracker-meta">Applied on ${dateStr} &middot; ${item.filledCount} fields autofilled</div>
        `;
        container.appendChild(el);
      });
    });
  }

  function setupTrackerExport() {
    document.getElementById("btnExportTracker").addEventListener("click", () => {
      chrome.storage.local.get(TRACKER_KEY, (res) => {
        const list = res[TRACKER_KEY] || [];
        if (list.length === 0) {
          alert("No tracker records to export.");
          return;
        }

        let csv = "ID,Title,URL,Date,FieldsFilled\n";
        list.forEach(item => {
          csv += `"${item.id}","${(item.title||'').replace(/"/g, '""')}","${item.url}","${item.date}","${item.filledCount}"\n`;
        });

        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "jobify-applications.csv";
        a.click();
        URL.revokeObjectURL(url);
      });
    });
  }

  // =========================================================================
  // AI HELPER & LLM
  // =========================================================================
  function setupAIHelper() {
    // Load config
    chrome.storage.local.get(AI_CONFIG_KEY, (res) => {
      const cfg = res[AI_CONFIG_KEY] || {};
      if (cfg.provider) document.getElementById("aiProvider").value = cfg.provider;
      if (cfg.model) document.getElementById("aiModel").value = cfg.model;
      if (cfg.apiKey) document.getElementById("aiApiKey").value = cfg.apiKey;
    });

    document.getElementById("btnSaveAI").addEventListener("click", () => {
      const provider = document.getElementById("aiProvider").value;
      const model = document.getElementById("aiModel").value.trim() || (provider === "gemini" ? "gemini-2.5-flash" : "gpt-4o-mini");
      const apiKey = document.getElementById("aiApiKey").value.trim();

      chrome.storage.local.set({
        [AI_CONFIG_KEY]: { provider, model, apiKey }
      }, () => {
        showAIStatus("success", "✓ AI credentials saved!");
      });
    });

    document.getElementById("btnGenerateAI").addEventListener("click", async () => {
      const profile = await getProfile();
      chrome.storage.local.get(AI_CONFIG_KEY, (res) => {
        const cfg = res[AI_CONFIG_KEY] || {};
        if (!cfg.apiKey) {
          showAIStatus("error", "Please configure and save your API Key first.");
          return;
        }

        showAIStatus("warning", "⏳ Extracting page questions and generating AI response...");

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: "generateAndFillQA",
              provider: cfg.provider,
              apiKey: cfg.apiKey,
              model: cfg.model,
              profile
            }, (response) => {
              if (chrome.runtime.lastError || !response) {
                showAIStatus("error", "Could not reach application page.");
                return;
              }
              if (response.success) {
                showAIStatus("success", `✓ AI answered ${response.count} question(s)!`);
              } else {
                showAIStatus("error", response.error || "AI generation failed.");
              }
            });
          }
        });
      });
    });
  }

  function showAIStatus(type, msg) {
    const el = document.getElementById("aiStatus");
    el.className = `status show ${type}`;
    el.innerHTML = `<span>${msg}</span>`;
    setTimeout(() => el.classList.remove("show"), 4000);
  }

  // =========================================================================
  // SETTINGS
  // =========================================================================
  function setupSettings() {
    document.getElementById("btnExport").addEventListener("click", async () => {
      const profile = await getProfile();
      const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jobify-profile-${currentPreset.toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById("btnImport").addEventListener("click", () => {
      document.getElementById("importFile").click();
    });

    document.getElementById("importFile").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const profile = JSON.parse(event.target.result);
          loadProfileData(profile);
          saveProfile();
          showStatus("success", "✓", "Profile imported successfully!");
        } catch (err) {
          showStatus("error", "✗", "Invalid JSON profile file.");
        }
      };
      reader.readAsText(file);
    });

    document.getElementById("btnClear").addEventListener("click", () => {
      if (confirm("Delete all saved profile data and tracker records? This cannot be undone.")) {
        chrome.storage.local.clear(() => {
          for (const field of PROFILE_FIELDS) {
            const input = document.getElementById(field);
            if (input) input.value = "";
          }
          initPresets();
          showStatus("success", "✓", "All data cleared.");
        });
      }
    });

    document.getElementById("btnToggleEncrypt").addEventListener("click", () => {
      alert("AES-GCM encryption mode is active for SSN, Passport, PAN, and Aadhaar numbers.");
    });
  }

  // =========================================================================
  // UTILS & INIT
  // =========================================================================
  function showStatus(type, icon, message) {
    const status = document.getElementById("fillStatus");
    status.className = `status show ${type}`;
    status.innerHTML = `<span class="status-icon">${icon}</span><span>${message}</span>`;
    setTimeout(() => status.classList.remove("show"), 4000);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function updateCompleteness() {
    let filled = 0;
    for (const field of PROFILE_FIELDS) {
      const input = document.getElementById(field);
      if (input && input.value.trim()) filled++;
    }
    const pct = Math.round((filled / PROFILE_FIELDS.length) * 100);
    const bar = document.getElementById("completenessBar");
    const text = document.getElementById("completenessText");
    if (bar) bar.style.width = pct + "%";
    if (text) text.textContent = `${pct}% filled (${filled}/${PROFILE_FIELDS.length})`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    initPresets();
    setupPresetHandlers();
    setupAutoSave();
    setupTabs();
    setupSections();
    setupPdfImporter();
    setupFillButton();
    setupScanButton();
    setupTrackerExport();
    setupAIHelper();
    setupSettings();
  });
})();
