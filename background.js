// background.js – Extension background service worker & message router
"use strict";

const STORAGE_KEY = "jobfill_profile";
const TRACKER_KEY = "jobfill_applications";

// Setup side panel behavior & context menus on install
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  }

  // Register context menu for manual field mapping
  if (chrome.contextMenus) {
    chrome.contextMenus.create({
      id: "jobify_map_field",
      title: "Jobify: Highlight or Inspect Form Field",
      contexts: ["editable", "selection"]
    });
  }
});

// Handle command shortcut (Cmd+Shift+F / Ctrl+Shift+F)
chrome.commands.onCommand.addListener((command) => {
  if (command === "autofill-page") {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const profile = result[STORAGE_KEY] || {};
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "fillForm", profile }, (response) => {
            if (response && response.filled > 0) {
              logApplicationRecord(tabs[0], response.filled);
            }
          });
        }
      });
    });
  }
});

// Context menu click listener
if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "jobify_map_field" && tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: "inspectActiveElement" });
    }
  });
}

// Log application record
function logApplicationRecord(tab, filledCount) {
  if (!tab || !tab.url) return;
  const entry = {
    id: Date.now(),
    url: tab.url,
    title: tab.title || "Job Application",
    date: new Date().toISOString(),
    filledCount: filledCount || 0
  };

  chrome.storage.local.get(TRACKER_KEY, (res) => {
    const list = res[TRACKER_KEY] || [];
    list.unshift(entry);
    chrome.storage.local.set({ [TRACKER_KEY]: list.slice(0, 100) });
  });
}

// Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fillForm") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "fillForm", profile: message.profile },
          (response) => {
            const res = response || { success: false, filled: 0 };
            if (res.filled > 0) {
              logApplicationRecord(tabs[0], res.filled);
            }
            sendResponse(res);
          }
        );
      } else {
        sendResponse({ success: false, filled: 0 });
      }
    });
    return true;
  }

  if (message.action === "scanForm") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "scanForm" }, (response) => {
          sendResponse(response || { fields: [] });
        });
      } else {
        sendResponse({ fields: [] });
      }
    });
    return true;
  }

  if (message.action === "highlightField") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "highlightField", fieldName: message.fieldName });
      }
    });
    return true;
  }

  if (message.action === "generateAIAnswers") {
    handleAIGeneration(message.provider, message.apiKey, message.model, message.prompt)
      .then(answer => sendResponse({ success: true, answer }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// LLM API Request Dispatcher (Gemini & OpenAI support)
async function handleAIGeneration(provider, apiKey, model, prompt) {
  if (!apiKey) {
    throw new Error("Missing API Key. Configure your LLM key in Settings.");
  }

  if (provider === "gemini") {
    const selectedModel = model || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || "Gemini API Error");
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty response from Gemini API");
    return text.trim();
  }

  if (provider === "openai") {
    const selectedModel = model || "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: "You are a professional career assistant answering job application questions clearly, concisely, and persuasively based strictly on the provided candidate details." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || "OpenAI API Error");
    }
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty response from OpenAI API");
    return text.trim();
  }

  throw new Error("Unsupported LLM Provider: " + provider);
}
