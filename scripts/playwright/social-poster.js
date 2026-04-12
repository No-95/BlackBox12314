const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const app = express();
app.use(express.json({ limit: "20mb" }));

const PORT = Number(process.env.PORT || 8080);
const BROWSERLESS_WS_ENDPOINT = process.env.BROWSERLESS_WS_ENDPOINT || "";
const TARGET_BASE_URL = process.env.TARGET_BASE_URL || "";
const TARGET_USERNAME = process.env.TARGET_USERNAME || "";
const TARGET_PASSWORD = process.env.TARGET_PASSWORD || "";

function ensure(value, name) {
  if (!value) {
    throw new Error(`Missing required value: ${name}`);
  }
}

async function downloadFile(mediaUrl) {
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = path.extname(new URL(mediaUrl).pathname) || ".bin";
  const tempPath = path.join(os.tmpdir(), `agentbox_${Date.now()}${ext}`);
  fs.writeFileSync(tempPath, buffer);
  return tempPath;
}

async function loginGeneric(page, selectors) {
  await page.goto(selectors.loginUrl || `${TARGET_BASE_URL}/accounts/login`, {
    waitUntil: "domcontentloaded"
  });

  if (selectors.acceptCookies) {
    const cookieBtn = page.locator(selectors.acceptCookies).first();
    if (await cookieBtn.isVisible().catch(() => false)) {
      await cookieBtn.click();
    }
  }

  await page.fill(selectors.usernameInput, TARGET_USERNAME);
  await page.fill(selectors.passwordInput, TARGET_PASSWORD);
  await page.click(selectors.loginButton);

  if (selectors.loginSuccessSelector) {
    await page.waitForSelector(selectors.loginSuccessSelector, { timeout: 60000 });
  }
}

async function postGeneric(page, mediaPath, caption, selectors) {
  await page.goto(selectors.createPostUrl || TARGET_BASE_URL, {
    waitUntil: "domcontentloaded"
  });

  if (selectors.openComposerButton) {
    await page.click(selectors.openComposerButton);
  }

  await page.setInputFiles(selectors.fileInput, mediaPath);

  if (selectors.captionInput) {
    await page.fill(selectors.captionInput, caption || "");
  }

  await page.click(selectors.submitButton);

  if (selectors.postSuccessSelector) {
    await page.waitForSelector(selectors.postSuccessSelector, { timeout: 90000 });
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "playwright-poster" });
});

app.post("/post", async (req, res) => {
  let mediaPath = "";
  let browser;

  try {
    ensure(TARGET_BASE_URL, "TARGET_BASE_URL");
    ensure(TARGET_USERNAME, "TARGET_USERNAME");
    ensure(TARGET_PASSWORD, "TARGET_PASSWORD");

    const {
      mediaUrl,
      mediaPath: bodyMediaPath,
      caption,
      selectors = {},
      dryRun = false
    } = req.body || {};

    if (!mediaUrl && !bodyMediaPath) {
      return res.status(400).json({ error: "Provide mediaUrl or mediaPath." });
    }

    const mergedSelectors = {
      loginUrl: `${TARGET_BASE_URL}/accounts/login`,
      usernameInput: 'input[name="username"], input[type="text"]',
      passwordInput: 'input[name="password"], input[type="password"]',
      loginButton: 'button[type="submit"]',
      loginSuccessSelector: "nav, header",
      createPostUrl: TARGET_BASE_URL,
      openComposerButton: "button:has-text('Create'), button:has-text('New post')",
      fileInput: 'input[type="file"]',
      captionInput: 'textarea, div[contenteditable="true"]',
      submitButton: "button:has-text('Post'), button:has-text('Share')",
      postSuccessSelector: "text=Your post has been shared",
      ...selectors
    };

    mediaPath = bodyMediaPath || (await downloadFile(mediaUrl));

    if (!dryRun && !BROWSERLESS_WS_ENDPOINT) {
      throw new Error("Missing BROWSERLESS_WS_ENDPOINT");
    }

    if (dryRun) {
      return res.json({
        ok: true,
        mode: "dry-run",
        message: "Payload validated. No browser action was taken.",
        mediaPath,
        caption: caption || ""
      });
    }

    browser = await chromium.connectOverCDP(BROWSERLESS_WS_ENDPOINT);
    const context = await browser.newContext();
    const page = await context.newPage();

    await loginGeneric(page, mergedSelectors);
    await postGeneric(page, mediaPath, caption || "", mergedSelectors);

    await context.close();
    await browser.close();

    res.json({ ok: true, message: "Post flow completed." });
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => {});
    }

    res.status(500).json({
      ok: false,
      error: error.message
    });
  } finally {
    if (mediaPath && mediaPath.startsWith(os.tmpdir())) {
      fs.unlink(mediaPath, () => {});
    }
  }
});

app.listen(PORT, () => {
  console.log(`playwright-poster listening on :${PORT}`);
});
