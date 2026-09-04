const fs = require("fs");
const puppeteer = require("puppeteer");

const css = fs.readFileSync(require("path").join(__dirname, "..", "src", "hide-shorts.css"), "utf8");

const markup = `
<style>${css}</style>
<body>
<!-- sidebar -->
<ytd-guide-entry-renderer id="guide-shorts"><a href="/shorts" title="Shorts">Shorts</a></ytd-guide-entry-renderer>
<ytd-guide-entry-renderer id="guide-js-hidden" data-so-hidden="sidebar"><a title="Shorts">Shorts</a></ytd-guide-entry-renderer>
<ytd-guide-entry-renderer id="guide-subs"><a href="/feed/subscriptions" title="Subscriptions">Subs</a></ytd-guide-entry-renderer>
<ytd-mini-guide-entry-renderer id="mini-shorts"><a id="endpoint" href="/shorts" title="Shorts"></a></ytd-mini-guide-entry-renderer>
<ytd-mini-guide-entry-renderer id="mini-home"><a id="endpoint" href="/" title="Home"></a></ytd-mini-guide-entry-renderer>

<!-- shelves -->
<ytd-rich-section-renderer id="sec-shorts"><ytd-rich-shelf-renderer is-shorts></ytd-rich-shelf-renderer></ytd-rich-section-renderer>
<ytd-rich-section-renderer id="sec-grid"><grid-shelf-view-model></grid-shelf-view-model></ytd-rich-section-renderer>
<ytd-rich-section-renderer id="sec-normal"><ytd-rich-shelf-renderer></ytd-rich-shelf-renderer></ytd-rich-section-renderer>
<ytd-item-section-renderer id="isec-reel"><div id="contents"><ytd-reel-shelf-renderer></ytd-reel-shelf-renderer></div></ytd-item-section-renderer>
<ytd-item-section-renderer id="isec-normal"><div id="contents"><ytd-video-renderer><a href="/watch?v=x"></a></ytd-video-renderer></div></ytd-item-section-renderer>

<!-- loose items -->
<ytd-rich-item-renderer id="item-short"><a href="/shorts/abc123"></a></ytd-rich-item-renderer>
<ytd-rich-item-renderer id="item-video"><a href="/watch?v=abc123"></a></ytd-rich-item-renderer>
<ytd-video-renderer id="search-short"><a href="/shorts/abc123"></a></ytd-video-renderer>
<ytd-video-renderer id="search-video"><a href="/watch?v=abc123"></a></ytd-video-renderer>
<yt-lockup-view-model id="lockup-short"><a href="https://www.youtube.com/shorts/abc123"></a></yt-lockup-view-model>
<yt-lockup-view-model id="lockup-video"><a href="https://www.youtube.com/watch?v=abc123"></a></yt-lockup-view-model>
<ytd-compact-video-renderer id="compact-short"><a href="/shorts/abc123"></a></ytd-compact-video-renderer>
<ytm-shorts-lockup-view-model id="mobile-short"></ytm-shorts-lockup-view-model>

<!-- channel tabs -->
<yt-tab-shape id="tab-href-shorts"><a href="/@someone/shorts"></a></yt-tab-shape>
<yt-tab-shape id="tab-js-hidden" data-so-hidden="tab">Shorts</yt-tab-shape>
<yt-tab-shape id="tab-videos"><a href="/@someone/videos"></a></yt-tab-shape>
</body>`;

const MUST_HIDE = [
  "guide-shorts", "mini-shorts",
  "sec-shorts", "sec-grid", "isec-reel",
  "item-short", "search-short", "lockup-short", "compact-short", "mobile-short",
  "tab-href-shorts", "tab-js-hidden", "guide-js-hidden",
];
const MUST_SHOW = [
  "guide-subs", "mini-home", "sec-normal", "isec-normal",
  "item-video", "search-video", "lockup-video", "tab-videos",
];

const hidden = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[id]")]
      .filter((el) => getComputedStyle(el).display === "none")
      .map((el) => el.id)
  );

(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setContent(markup);

  const failures = [];
  const check = (label, ids, shouldHide, actual) => {
    for (const id of ids) {
      const isHidden = actual.includes(id);
      if (isHidden !== shouldHide) {
        failures.push(`${label}: #${id} is ${isHidden ? "hidden" : "visible"}, expected ${shouldHide ? "hidden" : "visible"}`);
      }
    }
  };

  let actual = await hidden(page);
  check("defaults", MUST_HIDE, true, actual);
  check("defaults", MUST_SHOW, false, actual);

  // Every group switched off -> nothing hidden except the JS-tagged element.
  await page.evaluate(() => {
    for (const a of ["data-so-sidebar", "data-so-shelves", "data-so-items", "data-so-channel-tab"]) {
      document.documentElement.setAttribute(a, "off");
    }
  });
  actual = await hidden(page);
  const stillHidden = actual.filter((id) => !["tab-js-hidden", "guide-js-hidden"].includes(id));
  if (stillHidden.length) failures.push(`all-off: still hidden -> ${stillHidden.join(", ")}`);

  // Pending attribute blanks the page body.
  await page.evaluate(() => document.documentElement.setAttribute("data-so-shorts-pending", ""));
  const bodyHidden = await page.evaluate(() => getComputedStyle(document.body).visibility === "hidden");
  if (!bodyHidden) failures.push("pending: body not blanked");

  await browser.close();

  if (failures.length) {
    console.log("FAIL\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log(`PASS — ${MUST_HIDE.length} hidden, ${MUST_SHOW.length} untouched, toggles and blanking work`);
})();
