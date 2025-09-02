/* popup.js
 * Controls a single persisted toggle in chrome.storage.local: { enabled: boolean }.
 * Sends a broadcast request to background to notify the active tab immediately,
 * while all tabs also react to chrome.storage.onChanged.
 */

const enabledToggle = document.getElementById('enabledToggle');
const statusEl = document.getElementById('status');

function setStatus(on) {
  statusEl.innerHTML = `Status: <strong>${on ? 'On' : 'Off'}</strong>`;
}

async function getEnabled() {
  const { enabled } = await chrome.storage.local.get({ enabled: false });
  return !!enabled;
}

async function setEnabled(enabled) {
  // Optimistic UI
  enabledToggle.checked = enabled;
  setStatus(enabled);

  // Persist
  await chrome.storage.local.set({ enabled });

  // Ask background to nudge the active tab (fast UX). All tabs will also get storage event.
  chrome.runtime.sendMessage({ type: 'BROADCAST_TOGGLE', enabled }).catch(() => {});
}

(async function init() {
  const enabled = await getEnabled();
  enabledToggle.checked = enabled;
  setStatus(enabled);

  enabledToggle.addEventListener('change', async () => {
    await setEnabled(enabledToggle.checked);
  });
})();
