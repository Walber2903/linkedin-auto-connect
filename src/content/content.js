/**
 * content.js — LinkedIn Search Auto-Connector
 *
 * WARNING & LIMITATIONS
 * - Automating interactions on LinkedIn may violate LinkedIn's Terms of Service.
 * - Use this for educational purposes; you are solely responsible for compliance.
 * - Keep invites very low; respect rate limits & other users.
 *
 * SAFE DEFAULTS
 * - MAX_INVITES_PER_PAGE and MAX_PAGES_PER_RUN cap actions per run.
 *   Tweak in CONFIG below (values are intentionally conservative).
 *
 * HOW IT WORKS
 * - When `enabled` is true and URL matches https://www.linkedin.com/search/results*,
 *   a loop clicks visible "Connect" buttons, confirms simple modals, paginates,
 *   and repeats. It stops promptly when you toggle Off, navigate away, or limits hit.
 * - Uses MutationObserver to detect results updates and SPA changes.
 * - Uses a run token (runId) + cancellable timers to stop cleanly (hardStop()).
 */

console.log('[LI-AutoConnect] content script loaded on', location.href);

/** @typedef {{ enabled: boolean, running: boolean, runId: number, timers: Set<number>, observers: Set<MutationObserver>, urlCheckId: number|null, debug: boolean, sleepResolvers: Set<Function>, pendingResolves: Set<Function> }} State */

/** Configuration constants kept in one place for easy tuning. */
const CONFIG = {
  // Pacing (milliseconds)
  DELAYS: {
    CONNECT_CLICK_MIN: 800,
    CONNECT_CLICK_MAX: 1500,
    PAGE_CHANGE_MIN: 1200,
    PAGE_CHANGE_MAX: 2500,
    DIALOG_APPEAR_TIMEOUT: 5000,
    RESULTS_CHANGE_TIMEOUT: 12000
  },
  // Safety caps
  MAX_INVITES_PER_PAGE: 8,   // default small number; adjust carefully
  MAX_PAGES_PER_RUN: 3,      // default small number; adjust carefully

  // Keywords (keep all lowercase; normText lowercases DOM text)
  KW: {
    CONNECT: ['connect', 'conectar', 'invite', 'invitar', 'convidar', 'connecter', 'connetti', 'verbinden'],
    PENDING: ['pending', 'pendente', 'pendiente', 'en attente'],
    MESSAGE: ['message', 'mensagem', 'mensaje', 'messaggio'],
    FOLLOW:  ['follow', 'seguir', 'suivre', 'segui']
  },

  // Optional, layout-specific fallback container with obfuscated classes
  SELECTORS: {
    OB_CONTAINER: 'div.trMOuCrxGuyMcoBfUoxZIQAILvdyMtzfftN.SbIBLepHrzBVCRarZbIJSiSzqpwqueZ'
  },

  // General behavior
  DEBUG: true
};

/** @type {State} */
const STATE = {
  enabled: false,
  running: false,
  runId: 0,
  timers: new Set(),
  observers: new Set(),
  urlCheckId: null,
  debug: CONFIG.DEBUG,
  sleepResolvers: new Set(),
  pendingResolves: new Set()
};

/** Utils **/

/** @param {any[]} args */
function debugLog(...args) {
  if (STATE.debug) console.log('[LI-AutoConnect]', ...args);
}

/**
 * Returns a normalized string for case-insensitive text matching.
 * @param {string} s
 */
function normText(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** @param {number} min @param {number} max */
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Promise-based sleep that can be cancelled. When hardStop() runs,
 * we resolve all pending sleeps so the loop can exit promptly.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => {
    const id = window.setTimeout(() => {
      STATE.timers.delete(id);
      STATE.sleepResolvers.delete(resolve);
      resolve();
    }, ms);
    STATE.timers.add(id);
    STATE.sleepResolvers.add(resolve);
  });
}

/** Clear all pending timers. */
function clearAllTimers() {
  for (const id of STATE.timers) clearTimeout(id);
  STATE.timers.clear();
}

/**
 * Visibility heuristic for elements (exclude hidden/zero-size).
 * @param {Element} el
 */
function isVisible(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
  if (rect.width === 0 || rect.height === 0) return false;
  // light heuristic
  return (el.offsetWidth + el.offsetHeight) > 0 || el.getClientRects().length > 0;
}

/** Is this tab currently on LinkedIn search result pages? */
function isOnLinkedInSearch() {
  return /^https:\/\/www\.linkedin\.com\/search\/results/i.test(location.href);
}

/**
 * Find the main results container to watch for updates.
 * Tries several known containers and falls back to <main>.
 */
function getResultsContainer() {
  const candidates = [
    'ul.reusable-search__entity-result-list',
    'div.search-results-container',
    'div.reusable-search__container',
    'div.scaffold-finite-scroll__content',
    'main'
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return document.body;
}

/**
 * Wait until the results container mutates meaningfully (children list changes).
 * Resolves early if timeout elapses or when hardStop() is called.
 */
function waitForResultsChange() {
  return new Promise(async (resolve) => {
    const container = getResultsContainer();

    const finish = () => {
      try { observer.disconnect(); } catch {}
      STATE.observers.delete(observer);
      STATE.pendingResolves.delete(resolve);
      clearTimeout(timeoutId);
      resolve();
    };

    const timeoutId = window.setTimeout(finish, CONFIG.DELAYS.RESULTS_CHANGE_TIMEOUT);
    STATE.timers.add(timeoutId);

    const observer = new MutationObserver((mutList) => {
      for (const m of mutList) {
        if (m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
          finish();
          return;
        }
      }
    });
    observer.observe(container, { childList: true, subtree: true });
    STATE.observers.add(observer);
    STATE.pendingResolves.add(resolve);
  });
}

/** Disconnect all observers. */
function detachObservers() {
  for (const obs of STATE.observers) {
    try { obs.disconnect(); } catch {}
  }
  STATE.observers.clear();

  if (STATE.urlCheckId != null) {
    clearInterval(STATE.urlCheckId);
    STATE.urlCheckId = null;
  }
}

/** Attach an interval to stop if we navigate away from search results. */
function attachObservers() {
  if (STATE.urlCheckId != null) return;
  let lastHref = location.href;
  STATE.urlCheckId = window.setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      if (!isOnLinkedInSearch()) {
        debugLog('URL changed; leaving search results -> hardStop()');
        hardStop();
      }
    }
    if (!STATE.enabled && STATE.running) {
      debugLog('Enabled turned off -> hardStop()');
      hardStop();
    }
  }, 500);
}

/**
 * Small auto-scroll nudge to trigger lazy-loaded results.
 */
async function autoScrollOnce() {
  const startHeight = document.body.scrollHeight;
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  await sleep(600);
  if (document.body.scrollHeight > startHeight) await sleep(300);
}

/**
 * Waits briefly until either:
 * - a results list exists, or
 * - at least one Connect button is discoverable, or
 * - pagination/next controls appear.
 */
async function waitForInitialResultsAndButtons(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs && STATE.enabled) {
    const hasResultsContainer = !!document.querySelector(
      'ul.reusable-search__entity-result-list, div.search-results-container, div.reusable-search__container, main'
    );
    const hasCards = !!document.querySelector(
      'li.reusable-search__result-container, div.entity-result, div.reusable-search__result-container'
    );
    const hasButtons = queryConnectButtons().length > 0;
    const hasPagination = !!document.querySelector(
      'ul.artdeco-pagination__pages, button[aria-label^="Next" i], a[aria-label^="Next" i]'
    );
    if (hasResultsContainer || hasCards || hasButtons || hasPagination) return;
    await sleep(250);
  }
}

/**
 * Check if any of the tokens is included in the haystack (both lowercased).
 */
function includesAny(haystack, tokens) {
  return tokens.some(t => haystack.includes((t || '').toLowerCase()));
}

/**
 * Query all visible, clickable "Connect" buttons for the current result page.
 * Strategy (in order):
 * 0) Optional: search inside a known obfuscated container (layout-specific).
 * 1) Collect buttons that contain a `.artdeco-button__text` span (or any artdeco button).
 * 2) Keep candidates whose text/aria/title suggests "connect".
 * 3) If nothing yet, brute-scan all <button> by text.
 * 4) Filter by visibility and exclude Pending/Message/Follow.
 * 5) De-duplicate by card (one button per result card).
 * @returns {HTMLButtonElement[]}
 */
function queryConnectButtons() {
  // 0) Optional fallback: explicit containers with obfuscated classes
  const byObContainer = [];
  try {
    const containers = Array.from(document.querySelectorAll(CONFIG.SELECTORS.OB_CONTAINER));
    containers.forEach(container => {
      const btns = Array.from(container.querySelectorAll('button.artdeco-button'));
      btns.forEach(b => {
        const span = b.querySelector('.artdeco-button__text');
        const txt = normText((span?.textContent || b.textContent || ''));
        if (includesAny(txt, CONFIG.KW.CONNECT)) byObContainer.push(b);
      });
    });
  } catch {}

  // 1) Buttons that have the text span (using :has when available)
  const spanButtons = Array.from(
    document.querySelectorAll('button:has(span.artdeco-button__text), button.artdeco-button')
  );

  // 2) Candidates by text/aria/title
  const byTextOrAria = spanButtons.filter((b) => {
    const t = normText(b.querySelector('.artdeco-button__text')?.textContent || b.textContent || '');
    const aria = normText(b.getAttribute('aria-label') || '');
    const title = normText(b.getAttribute('title') || '');
    return includesAny(t, CONFIG.KW.CONNECT) || includesAny(aria, CONFIG.KW.CONNECT) || includesAny(title, CONFIG.KW.CONNECT);
  });

  // 3) Last resort: brute-scan all buttons if nothing was found
  let byBrute = [];
  if (byTextOrAria.length === 0 && byObContainer.length === 0) {
    const all = Array.from(document.querySelectorAll('button'));
    byBrute = all.filter((b) => includesAny(normText(b.textContent || ''), CONFIG.KW.CONNECT));
  }

  // 4) Combine and dedupe (by element identity)
  const combined = [...byObContainer, ...byTextOrAria, ...byBrute];
  const dedup = Array.from(new Set(combined));

  // 5) Visibility/state filter; exclude non-connect states
  const filtered = dedup.filter((b) => {
    if (!(b instanceof HTMLButtonElement)) return false;
    if (b.disabled || b.getAttribute('aria-disabled') === 'true') return false;
    if (!isVisible(b)) return false;

    const full = normText(b.querySelector('.artdeco-button__text')?.textContent || b.textContent || '');
    if (includesAny(full, CONFIG.KW.PENDING)) return false;
    if (includesAny(full, CONFIG.KW.MESSAGE)) return false;
    if (includesAny(full, CONFIG.KW.FOLLOW))  return false;

    return true;
  });

  // 6) One button per card (stable dedupe by result card element)
  const unique = [];
  const seenCards = new Set();

  for (const b of filtered) {
    const card = b.closest(
      'li.reusable-search__result-container, div.reusable-search__result-container, div.entity-result'
    ) || b; // fallback: the button itself

    if (!seenCards.has(card)) {
      seenCards.add(card);
      unique.push(b);
    }
  }

  // Diagnostics
  debugLog(
    `detector: obClass=${byObContainer.length}, spanButtons=${spanButtons.length}, byTextOrAria=${byTextOrAria.length}, brute=${byBrute.length}, final=${unique.length}`
  );

  return unique;
}

/**
 * Attempt to click "Connect" then handle confirmation modal if present.
 * Skips if email is required or dialog isn't a simple confirm.
 * @param {HTMLButtonElement} button
 */
async function clickConnectAndConfirm(button) {
  try {
    button.click();

    // Wait for either a dialog to appear OR button to flip to 'Pending'
    const dialogAppeared = await waitForDialogOrPending(button);

    if (!dialogAppeared) {
      // No dialog; either sent immediately or ignored. Proceed.
      return true;
    }

    const dialog = getTopmostDialog();
    if (!dialog) {
      // If dialog was ephemeral, proceed.
      return true;
    }

    // Email gate / verification check
    const dialogText = normText(dialog.innerText || '');
    const emailInput = dialog.querySelector('input[type="email"], input[name*="email" i]');
    if (emailInput || dialogText.includes('email address') || dialogText.includes('enter email')) {
      // Close/Cancel and skip
      clickBest(dialog, [
        'button[aria-label*="close" i]',
        'button[aria-label*="dismiss" i]',
        'button'
      ], ['cancel', 'dismiss', 'close']);
      await sleep(300);
      return false;
    }

    // Prefer buttons that clearly send without a note
    const sent = clickBest(dialog, [
      'button'
    ], ['send without a note', 'send now', 'send invite', 'send', 'enviar', 'convidar', 'conectar']);

    if (sent) {
      await sleep(400);
      await waitDialogClose(dialog, 4000);
      return true;
    }

    // If we didn't find a "Send" button, cancel gracefully
    clickBest(dialog, [
      'button[aria-label*="close" i]',
      'button'
    ], ['cancel', 'dismiss', 'close']);
    await sleep(300);
    return false;
  } catch (err) {
    debugLog('clickConnectAndConfirm error:', err);
    return false;
  }
}

/** Find a dialog element likely associated to the Connect flow. */
function getTopmostDialog() {
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], .artdeco-modal, .artdeco-modal--layer-default'));
  return dialogs.length ? dialogs[dialogs.length - 1] : null;
}

/**
 * Click the "best" button within a container based on preferred text tokens.
 * @param {Element} root
 * @param {string[]} selectors in priority order
 * @param {string[]} preferredTexts lowercased, matched via includes()
 * @returns {boolean} clicked
 */
function clickBest(root, selectors, preferredTexts) {
  const buttons = [];
  for (const sel of selectors) {
    root.querySelectorAll(sel).forEach(b => {
      if (b instanceof HTMLButtonElement && isVisible(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true') {
        buttons.push(b);
      }
    });
  }
  if (buttons.length === 0) return false;
  const byPref = buttons.find(b => {
    const t = normText(b.innerText || b.textContent || '');
    return preferredTexts.some(p => t.includes(p));
  });
  const target = byPref || buttons[0];
  target.click();
  return true;
}

/**
 * Wait until a dialog appears or the button changes to "Pending".
 * @param {HTMLButtonElement} button
 * @returns {Promise<boolean>} true if dialog appeared, false otherwise
 */
async function waitForDialogOrPending(button) {
  const start = Date.now();
  while (Date.now() - start < CONFIG.DELAYS.DIALOG_APPEAR_TIMEOUT) {
    const dlg = getTopmostDialog();
    if (dlg && isVisible(dlg)) return true;

    // Or the button self-changed to "Pending"
    const t = normText(button.innerText || button.textContent || '');
    if (includesAny(t, CONFIG.KW.PENDING)) return false;

    await sleep(150);
    if (!STATE.enabled) return false;
  }
  return !!getTopmostDialog();
}

/** Wait for a specific dialog to close or timeout. */
async function waitDialogClose(dialog, timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!document.contains(dialog) || !isVisible(dialog)) return;
    await sleep(150);
  }
}

/**
 * Find pagination and click the next page button.
 * Returns true if navigated to next page, false if no next page found.
 * Includes fallbacks for "Next" arrow and "Show more".
 */
async function findAndClickNextPage() {
  // Prefer numbered pagination
  const list = document.querySelector('ul.artdeco-pagination__pages, ul[class*="artdeco-pagination__pages"]');
  if (list) {
    const buttons = Array.from(list.querySelectorAll('li button')).filter(isVisible);
    if (buttons.length > 0) {
      let activeIndex = buttons.findIndex(btn => btn.getAttribute('aria-current') === 'true');
      if (activeIndex < 0) {
        const activeLi = list.querySelector('li.active.selected');
        if (activeLi) {
          const activeBtn = activeLi.querySelector('button');
          activeIndex = buttons.indexOf(activeBtn);
        }
      }
      if (activeIndex < 0) activeIndex = 0;

      const nextBtn = buttons[activeIndex + 1];
      if (nextBtn) {
        nextBtn.click();
        return true;
      }
    }
  }

  // Fallback: Next arrow button
  const nextArrow = document.querySelector('button[aria-label^="Next" i], a[aria-label^="Next" i]');
  if (nextArrow && isVisible(nextArrow)) {
    nextArrow.click();
    return true;
  }

  // Fallback: "Show more results" / "See more results"
  const moreLike = Array.from(document.querySelectorAll('button, a')).find(el => {
    const t = normText(el.textContent || '');
    return isVisible(el) && (t.includes('show more results') || t.includes('see more results') || t === 'show more');
  });
  if (moreLike) {
    moreLike.click();
    return true;
  }

  return false;
}

/** Stop everything immediately: timers, observers, flags. */
function hardStop() {
  STATE.running = false;
  STATE.runId += 1; // invalidate any in-flight loops

  clearAllTimers();

  // Resolve any pending sleeps and wait-for-results promises immediately
  for (const r of STATE.sleepResolvers) { try { r(); } catch {} }
  STATE.sleepResolvers.clear();
  for (const r of STATE.pendingResolves) { try { r(); } catch {} }
  STATE.pendingResolves.clear();

  detachObservers();
  debugLog('Stopped.');
}

/** Controller **/

async function startIfEligible(trigger) {
  if (!STATE.enabled) return;
  if (!isOnLinkedInSearch()) return;
  if (STATE.running) return;

  STATE.running = true;
  const myRun = STATE.runId + 1;
  STATE.runId = myRun;
  attachObservers();

  debugLog(`Starting run #${myRun} (${trigger || 'auto'})`);

  // Give the SPA a moment to render the first batch of results/pagination
  await waitForInitialResultsAndButtons();

  (async () => {
    try {
      let pagesProcessed = 0;

      while (STATE.running && STATE.enabled && isOnLinkedInSearch()) {
        const isFirstPage = (pagesProcessed === 0);

        // First-page specific behavior:
        //  - Do NOT scroll before the very first scan; the page may still be hydrating.
        //  - On later pages, nudge scroll first to trigger lazy content.
        if (!isFirstPage) {
          await autoScrollOnce();
        } else {
          debugLog('[first-page] pre-scan span count =', document.querySelectorAll('span.artdeco-button__text').length);
        }

        // Initial scan
        let connectButtons = queryConnectButtons();

        // If nothing yet, wait briefly for hydration and rescan
        if (connectButtons.length === 0) {
          await sleep(700);
          connectButtons = queryConnectButtons();
        }

        // First-page fallback: now scroll once and rescan
        if (connectButtons.length === 0 && isFirstPage) {
          await autoScrollOnce();
          await sleep(600);
          connectButtons = queryConnectButtons();
        }

        debugLog(`Found ${connectButtons.length} connect buttons.`);

        let invited = 0;
        for (const btn of connectButtons) {
          if (!STATE.running || !STATE.enabled) break;
          if (invited >= CONFIG.MAX_INVITES_PER_PAGE) break;

          await sleep(randomBetween(CONFIG.DELAYS.CONNECT_CLICK_MIN, CONFIG.DELAYS.CONNECT_CLICK_MAX));
          try {
            const ok = await clickConnectAndConfirm(btn);
            invited += 1;
            debugLog(`Invite ${ok ? 'OK' : 'SKIPPED'} (${invited}/${CONFIG.MAX_INVITES_PER_PAGE})`);
          } catch (e) {
            debugLog('Error during invite attempt:', e);
          }
        }

        if (connectButtons.length === 0) debugLog('No connect buttons on this page, trying to paginate once.');

        if (pagesProcessed >= CONFIG.MAX_PAGES_PER_RUN - 1) {
          debugLog(`Max pages (${CONFIG.MAX_PAGES_PER_RUN}) reached. Stopping.`);
          break;
        }

        const moved = await findAndClickNextPage();
        if (!moved) {
          debugLog('No next page found. Stopping.');
          break;
        }

        await sleep(randomBetween(CONFIG.DELAYS.PAGE_CHANGE_MIN, CONFIG.DELAYS.PAGE_CHANGE_MAX));
        await waitForResultsChange();
        pagesProcessed += 1;
        debugLog(`Advanced to next page. Pages processed: ${pagesProcessed}.`);
      }
    } catch (err) {
      debugLog('Run error:', err);
    } finally {
      STATE.running = false;
      detachObservers();
      debugLog('Run complete.');
    }
  })();
}

/** Storage & messaging wiring **/

chrome.storage.local.get({ enabled: false }, ({ enabled }) => {
  STATE.enabled = !!enabled;
  if (STATE.enabled && isOnLinkedInSearch()) startIfEligible('onLoad');
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.enabled) return;
  STATE.enabled = !!changes.enabled.newValue;
  if (!STATE.enabled) {
    hardStop();
  } else if (isOnLinkedInSearch()) {
    startIfEligible('storageChange');
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'LINKEDIN_AUTOCONNECT_TOGGLE') return;
  STATE.enabled = !!msg.enabled;
  if (!STATE.enabled) {
    hardStop();
  } else if (isOnLinkedInSearch()) {
    startIfEligible('message');
  }
});
