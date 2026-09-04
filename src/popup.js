"use strict";

const DEFAULTS = {
  hideSidebar: true,
  hideShelves: true,
  hideItems: true,
  hideChannelTab: true,
  shortsPage: "redirect",
};

const toggles = [...document.querySelectorAll(".toggle")];
const modes = [...document.querySelectorAll('input[name="shortsPage"]')];

function render(settings) {
  for (const toggle of toggles) {
    toggle.setAttribute("aria-checked", String(Boolean(settings[toggle.dataset.setting])));
  }
  for (const mode of modes) {
    mode.checked = mode.value === settings.shortsPage;
  }
}

chrome.storage.sync.get(DEFAULTS, (stored) => {
  render({ ...DEFAULTS, ...stored });
});

for (const toggle of toggles) {
  toggle.addEventListener("click", () => {
    const next = toggle.getAttribute("aria-checked") !== "true";
    toggle.setAttribute("aria-checked", String(next));
    chrome.storage.sync.set({ [toggle.dataset.setting]: next });
  });
}

for (const mode of modes) {
  mode.addEventListener("change", () => {
    if (mode.checked) chrome.storage.sync.set({ shortsPage: mode.value });
  });
}
