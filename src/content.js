/*
 * Shorts Off for YouTube — content script.
 *
 * Runs at document_start in the isolated world. Responsibilities:
 *   1. Blank and leave the Shorts player before it can start playing.
 *   2. Translate stored settings into attributes on <html> that gate the CSS.
 *   3. Catch YouTube's client-side navigations (no page load happens on them).
 *   4. Hide the channel "Shorts" tab, whose markup has no href to match on.
 */
(() => {
  "use strict";

  const DEFAULTS = {
    hideSidebar: true,
    hideShelves: true,
    hideItems: true,
    hideChannelTab: true,
    shortsPage: "redirect", // "redirect" | "home" | "allow"
  };

  const FLAG_ATTRS = {
    hideSidebar: "data-so-sidebar",
    hideShelves: "data-so-shelves",
    hideItems: "data-so-items",
    hideChannelTab: "data-so-channel-tab",
  };

  const PENDING_ATTR = "data-so-shorts-pending";
  const HIDDEN_ATTR = "data-so-hidden";
  const CHANNEL_PATH = /^\/(@|c\/|channel\/|user\/)/;
  const GUIDE_SELECTOR = "ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer";
  const TAB_SELECTOR = "yt-tab-shape, tp-yt-paper-tab";
  const CHIP_SELECTOR = "yt-chip-cloud-chip-renderer";
  const SHORTS_LABEL = "shorts";

  const root = document.documentElement;

  let settings = { ...DEFAULTS };
  let settingsLoaded = false;
  let lastHref = location.href;

  /* ---------------------------------------------------------------- *
   * Shorts player
   * ---------------------------------------------------------------- */

  const isShortsPath = (path) => path === "/shorts" || path.startsWith("/shorts/");

  const shortsIdFromPath = (path) => {
    const match = path.match(/^\/shorts\/([^/?#]+)/);
    return match ? match[1] : null;
  };

  /**
   * Hide the page immediately if this load is a Short, before anything paints.
   * The attribute is removed again if the user chose to allow Shorts.
   */
  function markPending() {
    if (isShortsPath(location.pathname)) root.setAttribute(PENDING_ATTR, "");
    else root.removeAttribute(PENDING_ATTR);
  }

  function handleShortsPage() {
    if (!settingsLoaded) return;

    if (!isShortsPath(location.pathname) || settings.shortsPage === "allow") {
      root.removeAttribute(PENDING_ATTR);
      return;
    }

    const id = shortsIdFromPath(location.pathname);

    // Built from the current origin so m.youtube.com stays on mobile.
    if (settings.shortsPage === "redirect" && id) {
      const target = new URL("/watch", location.origin);
      target.searchParams.set("v", id);
      const start = new URL(location.href).searchParams.get("t");
      if (start) target.searchParams.set("t", start);
      location.replace(target.toString());
      return;
    }

    location.replace(new URL("/", location.origin).toString());
  }

  /* ---------------------------------------------------------------- *
   * Settings -> attributes
   * ---------------------------------------------------------------- */

  function applyFlags() {
    // On a Short the user chose to keep, hiding Shorts thumbnails would empty
    // the feed, so that one group is suspended for the duration of the page.
    const onAllowedShort =
      settings.shortsPage === "allow" && isShortsPath(location.pathname);

    for (const [key, attr] of Object.entries(FLAG_ATTRS)) {
      const active = key === "hideItems" ? settings[key] && !onAllowedShort : settings[key];
      if (active) root.removeAttribute(attr);
      else root.setAttribute(attr, "off");
    }
  }

  function loadSettings() {
    chrome.storage.sync.get(DEFAULTS, (stored) => {
      if (chrome.runtime.lastError) {
        settings = { ...DEFAULTS };
      } else {
        settings = { ...DEFAULTS, ...stored };
      }
      settingsLoaded = true;
      applyFlags();
      handleShortsPage();
      scan();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULTS) settings[key] = change.newValue;
    }
    applyFlags();
    handleShortsPage();
    scan();
  });

  /* ---------------------------------------------------------------- *
   * Elements only a label can identify
   *
   * Two Shorts surfaces expose no URL to match on: the sidebar entry ships
   * an <a> with no href at all, and channel tabs carry no anchor. The label
   * is the only handle, and "Shorts" is a product name that stays
   * untranslated across YouTube's locales.
   *
   * Tagging is unconditional and idempotent; the stylesheet decides whether
   * a tagged element is actually hidden, so toggling a setting off needs no
   * cleanup pass here.
   * ---------------------------------------------------------------- */

  const labelOf = (el) =>
    (el.getAttribute("title") || el.getAttribute("tab-title") || el.textContent || "")
      .trim()
      .toLowerCase();

  function tag(el, group) {
    if (el.getAttribute(HIDDEN_ATTR) !== group) el.setAttribute(HIDDEN_ATTR, group);
  }

  function scanGuide() {
    for (const entry of document.querySelectorAll(GUIDE_SELECTOR)) {
      if (entry.hasAttribute(HIDDEN_ATTR)) continue;
      const link = entry.querySelector("a");
      const href = link && link.getAttribute("href");
      // Channel entries look similar; anything pointing elsewhere is not Shorts.
      if (href && href !== "/shorts") continue;
      const label = link ? labelOf(link) : "";
      if (label === SHORTS_LABEL || labelOf(entry) === SHORTS_LABEL) tag(entry, "sidebar");
    }
  }

  function scanChips() {
    for (const chip of document.querySelectorAll(CHIP_SELECTOR)) {
      if (chip.hasAttribute(HIDDEN_ATTR)) continue;
      if (labelOf(chip) === SHORTS_LABEL) tag(chip, "sidebar");
    }
  }

  function scanChannelTabs() {
    if (!CHANNEL_PATH.test(location.pathname)) return;
    for (const tab of document.querySelectorAll(TAB_SELECTOR)) {
      if (tab.hasAttribute(HIDDEN_ATTR)) continue;
      if (labelOf(tab) === SHORTS_LABEL) tag(tab, "tab");
    }
  }

  function scan() {
    scanGuide();
    scanChips();
    scanChannelTabs();
  }

  /* ---------------------------------------------------------------- *
   * Navigation
   *
   * YouTube swaps pages without a document load. yt-navigate-finish covers
   * most of it; the observer's href check is the backstop when the event
   * name changes or fires before the URL updates.
   * ---------------------------------------------------------------- */

  function onNavigate() {
    lastHref = location.href;
    markPending();
    applyFlags();
    handleShortsPage();
    scan();
  }

  window.addEventListener("yt-navigate-start", onNavigate, true);
  window.addEventListener("yt-navigate-finish", onNavigate, true);
  window.addEventListener("popstate", onNavigate);

  let scanQueued = false;
  const observer = new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      if (location.href !== lastHref) onNavigate();
      else scan();
    });
  });

  /* ---------------------------------------------------------------- *
   * Start
   * ---------------------------------------------------------------- */

  markPending();
  scan();
  loadSettings();
  observer.observe(root, { childList: true, subtree: true });
})();
