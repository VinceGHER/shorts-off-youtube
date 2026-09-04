const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const EXT = path.join(__dirname, "..");
const DOCS = path.join(EXT, "docs");
const QUERY = "https://www.youtube.com/results?search_query=sourdough+bread";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(withExtension) {
  const args = ["--no-sandbox", "--disable-dev-shm-usage"];
  if (withExtension) args.push(`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`);
  const browser = await puppeteer.launch({ headless: "new", args });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  return { browser, page };
}

const visibleShorts = (page) =>
  page.evaluate(() => {
    const shown = (el) => el && el.getClientRects().length > 0;
    return {
      thumbnails: [...document.querySelectorAll('a[href^="/shorts/"]')].filter(shown).length,
      shelves: [...document.querySelectorAll("grid-shelf-view-model, ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]")].filter(shown).length,
      sidebar: [...document.querySelectorAll("ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer")]
        .filter((el) => (el.textContent || "").trim().toLowerCase() === "shorts")
        .filter(shown).length,
    };
  });

(async () => {
  fs.mkdirSync(DOCS, { recursive: true });
  const report = {};

  for (const withExtension of [false, true]) {
    const tag = withExtension ? "after" : "before";
    const { browser, page } = await open(withExtension);

    await page.goto("https://www.youtube.com/", { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(3000);
    report[`home-${tag}`] = await visibleShorts(page);
    await page.screenshot({ path: path.join(DOCS, `sidebar-${tag}.png`), clip: { x: 0, y: 0, width: 250, height: 300 } });

    await page.goto(QUERY, { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(4000);
    report[`search-${tag}`] = await visibleShorts(page);
    await page.screenshot({ path: path.join(DOCS, `search-${tag}.png`) });

    await browser.close();
  }

  console.log(JSON.stringify(report, null, 1));

  const failures = [];
  for (const key of ["home-after", "search-after"]) {
    const r = report[key];
    if (r.thumbnails || r.shelves || r.sidebar) failures.push(`${key}: ${JSON.stringify(r)}`);
  }
  if (!report["search-before"].thumbnails) failures.push("baseline: live search showed no Shorts, nothing was proven");

  if (failures.length) {
    console.log("FAIL\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("PASS — no Shorts left on the live homepage or search results");
})();
