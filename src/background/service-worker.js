// MV3 service worker. Listens for toggle messages and pings the active tab
// (no "tabs" permission used). Content scripts also react to storage changes.

chrome.runtime.onInstalled.addListener(() => {
  // Initialize default "enabled" to false if not set
  chrome.storage.local.get({ enabled: null }, ({ enabled }) => {
    if (enabled === null) chrome.storage.local.set({ enabled: false });
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'BROADCAST_TOGGLE') {
    // Tell active tab right away for snappy UX
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const active = tabs && tabs[0];
      if (active && active.id) {
        chrome.tabs.sendMessage(active.id, {
          type: 'LINKEDIN_AUTOCONNECT_TOGGLE',
          enabled: !!msg.enabled
        }).catch(() => {});
      }
    });
    sendResponse({ ok: true });
  }
});

// Optional: also nudge the active tab on storage changes.
// Content scripts already listen to chrome.storage.onChanged, so this is just a bonus.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const active = tabs && tabs[0];
      if (active && active.id) {
        chrome.tabs.sendMessage(active.id, {
          type: 'LINKEDIN_AUTOCONNECT_TOGGLE',
          enabled: !!changes.enabled.newValue
        }).catch(() => {});
      }
    });
  }
});
