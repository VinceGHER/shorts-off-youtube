const http = require("http");
const puppeteer = require("puppeteer");

const PORT = 8099;
const EXT = require("path").join(__dirname, "..");

const page = (body) => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  if (req.url.startsWith("/shorts/")) return res.end(page("<div id=short>short player</div>"));
  if (req.url.startsWith("/@")) {
    return res.end(
      page(`<yt-tab-group-shape>
              <yt-tab-shape id="t-home">Home</yt-tab-shape>
              <yt-tab-shape id="t-videos">Videos</yt-tab-shape>
              <yt-tab-shape id="t-shorts" tab-title="Shorts">Shorts</yt-tab-shape>
            </yt-tab-group-shape>`)
    );
  }
  return res.end(page("<div id=watch>watch page</div>"));
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await new Promise((r) => server.listen(PORT, r));

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      `--host-resolver-rules=MAP www.youtube.com 127.0.0.1:${PORT}`,
      "--ignore-certificate-errors",
    ],
  });

  const failures = [];
  const p = await browser.newPage();

  // 1. A Short redirects to the normal watch page, keeping the id.
  await p.goto("http://www.youtube.com/shorts/abc123", { waitUntil: "networkidle2" });
  await sleep(600);
  if (!p.url().includes("/watch?v=abc123")) failures.push(`redirect: ended at ${p.url()}`);

  // 2. The channel Shorts tab gets tagged, the others do not.
  await p.goto("http://www.youtube.com/@someone", { waitUntil: "networkidle2" });
  await sleep(600);
  const tabs = await p.evaluate(() =>
    [...document.querySelectorAll("yt-tab-shape")].map((el) => [el.id, el.hasAttribute("data-so-hidden")])
  );
  const tagged = tabs.filter(([, hidden]) => hidden).map(([id]) => id);
  if (tagged.join() !== "t-shorts") failures.push(`channel tab: tagged ${JSON.stringify(tagged)}`);
  const shortsTabHidden = await p.evaluate(
    () => getComputedStyle(document.getElementById("t-shorts")).display === "none"
  );
  if (!shortsTabHidden) failures.push("channel tab: tagged but still displayed");

  await browser.close();
  server.close();

  if (failures.length) {
    console.log("FAIL\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("PASS — redirect and channel-tab removal work in a real browser");
})();
