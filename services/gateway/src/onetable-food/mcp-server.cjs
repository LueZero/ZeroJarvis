/**
 * MCP server for restaurant search via Google Maps + OpenTable booking via Playwright.
 * Run by OpenCode as a local MCP server (Node.js, not Bun).
 *
 * Protocol: JSON-RPC 2.0 over stdio.
 * Supports both Content-Length framing and line-delimited JSON (OpenCode uses the latter).
 * Tools: search_restaurants (Google Maps), search_opentable, book_opentable, complete_booking
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const net = require("net");

// ── Load booking config ──
const CONFIG_PATH = path.resolve(__dirname, "../../../../config/booking.json");
let bookingConfig = { user: {}, booking: {} };
try {
  bookingConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
} catch (e) {
  process.stderr.write(`[mcp] Warning: cannot load ${CONFIG_PATH}: ${e.message}\n`);
}

// ── Pending booking state for verification flow ──
let pendingBooking = null; // { page, formData, fillBookingForm, clickSubmitButton, restaurant, date, time, partySize, slotTime, searchUrl, submitted }

// ── MCP Protocol (line-delimited JSON + Content-Length fallback) ──

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  processBuffer();
});

function processBuffer() {
  while (true) {
    // Try Content-Length framing first
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const header = buffer.slice(0, headerEnd);
      const match = header.match(/^Content-Length:\s*(\d+)/im);
      if (match) {
        const len = parseInt(match[1]);
        const bodyStart = headerEnd + 4;
        if (buffer.length < bodyStart + len) return;
        const body = buffer.slice(bodyStart, bodyStart + len);
        buffer = buffer.slice(bodyStart + len);
        try { handleMessage(JSON.parse(body)); } catch {}
        continue;
      }
    }
    // Fall back to line-delimited JSON
    const newlineIdx = buffer.indexOf("\n");
    if (newlineIdx === -1) return;
    const line = buffer.slice(0, newlineIdx).trim();
    buffer = buffer.slice(newlineIdx + 1);
    if (!line) continue;
    try { handleMessage(JSON.parse(line)); } catch {}
  }
}

function send(msg) {
  const json = JSON.stringify(msg);
  process.stdout.write(json + "\n");
}

async function handleMessage(msg) {
  switch (msg.method) {
    case "initialize":
      send({
        jsonrpc: "2.0", id: msg.id,
        result: {
          protocolVersion: "2025-11-25",
          capabilities: { tools: {} },
          serverInfo: { name: "onetable-food", version: "2.0.0" },
        },
      });
      break;

    case "notifications/initialized":
      break;

    case "tools/list":
      send({
        jsonrpc: "2.0", id: msg.id,
        result: {
          tools: [
            {
              name: "search_restaurants",
              description: "在 Google Maps 搜尋餐廳，回傳名稱、評分、評論數、價位、菜系、地址、營業狀態等資訊",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "搜尋關鍵字，例如「台北大安區義大利餐廳」",
                  },
                },
                required: ["query"],
              },
            },
            {
              name: "search_opentable",
              description: "在 OpenTable 搜尋指定餐廳的可訂位時段，回傳餐廳名稱、評分、可用時段清單",
              inputSchema: {
                type: "object",
                properties: {
                  restaurant: {
                    type: "string",
                    description: "餐廳名稱，例如「鼎泰豐」",
                  },
                  date: {
                    type: "string",
                    description: "日期 YYYY-MM-DD 格式，預設今天",
                  },
                  time: {
                    type: "string",
                    description: "時間 HH:MM 格式，例如 19:00",
                  },
                  party_size: {
                    type: "number",
                    description: "用餐人數，預設 2",
                  },
                },
                required: ["restaurant"],
              },
            },
            {
              name: "book_opentable",
              description: "在 OpenTable 上自動完成訂位流程。訂位人姓名、電話、email 已從 config/booking.json 自動帶入，不需要再詢問使用者。只需提供餐廳名稱即可直接訂位。",
              inputSchema: {
                type: "object",
                properties: {
                  restaurant: {
                    type: "string",
                    description: "餐廳名稱",
                  },
                  date: {
                    type: "string",
                    description: "日期 YYYY-MM-DD",
                  },
                  time: {
                    type: "string",
                    description: "時間 HH:MM",
                  },
                  party_size: {
                    type: "number",
                    description: "用餐人數",
                  },
                  special_request: {
                    type: "string",
                    description: "特殊需求（例如靠窗）",
                  },
                },
                required: ["restaurant"],
              },
            },
            {
              name: "complete_booking",
              description: "在 book_opentable 回報需要簡訊驗證碼後，使用者提供驗證碼時呼叫此工具。系統會自動填入驗證碼完成訂位。",
              inputSchema: {
                type: "object",
                properties: {
                  code: {
                    type: "string",
                    description: "使用者收到的簡訊驗證碼",
                  },
                },
                required: [],
              },
            },
          ],
        },
      });
      break;

    case "tools/call": {
      const { name, arguments: args } = msg.params;
      if (name === "search_restaurants") {
        const result = await searchRestaurants(args.query || "");
        send({
          jsonrpc: "2.0", id: msg.id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result) }],
          },
        });
      } else if (name === "search_opentable") {
        const today = new Date().toISOString().slice(0, 10);
        const result = await searchOpenTable(
          args.restaurant || "",
          args.date || today,
          args.time || "19:00",
          args.party_size || 2,
        );
        send({
          jsonrpc: "2.0", id: msg.id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result) }],
          },
        });
      } else if (name === "book_opentable") {
        const today = new Date().toISOString().slice(0, 10);
        const u = bookingConfig.user || {};
        const result = await bookOpenTable(
          args.restaurant || "",
          args.date || today,
          args.time || "19:00",
          args.party_size || bookingConfig.booking?.defaultPartySize || 2,
          args.name || [u.lastName, u.firstName].filter(Boolean).join("") || "",
          args.phone || u.phone || "",
          args.email || u.email || "",
          args.special_request || "",
        );
        send({
          jsonrpc: "2.0", id: msg.id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result) }],
          },
        });
      } else if (name === "complete_booking") {
        const result = await completeBookingAfterVerification(args.code);
        send({
          jsonrpc: "2.0", id: msg.id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result) }],
          },
        });
      } else {
        send({
          jsonrpc: "2.0", id: msg.id,
          error: { code: -32601, message: `Unknown tool: ${name}` },
        });
      }
      break;
    }

    default:
      if (msg.id !== undefined) {
        send({ jsonrpc: "2.0", id: msg.id, result: {} });
      }
      break;
  }
}

// ── Restaurant Search (Playwright + Google Maps) ──

async function searchRestaurants(query) {
  if (!query) {
    return { query: "", restaurants: [], searchedAt: new Date().toISOString() };
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-gpu"],
    });

    const ctx = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "zh-TW",
      viewport: { width: 1280, height: 800 },
    });

    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    const page = await ctx.newPage();
    await page.goto(
      `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
      { timeout: 25000 }
    );
    await page.waitForSelector('a[href*="maps/place"]', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const restaurants = await page.$$eval('a[href*="maps/place"]', (els) => {
      return els.slice(0, 10).map((el) => {
        const container = el.closest("div") || el;
        const text = container?.textContent || "";
        const name = el.getAttribute("aria-label") || "";
        const ratingMatch = text.match(/(\d\.\d)/);
        const reviewMatch = text.match(/\(([\d,]+)\)/);
        const priceMatch = text.match(/(\${1,4})\s*·/);
        const cuisineMatch = text.match(/\d\.\d\s*([^\d·$\(\)]{2,20})\s*·/);
        const addressMatch = text.match(/·\s*([^·]{4,40}(?:路|街|大道|巷|號|段|樓|區|市|鎮|鄉|村|里|[\d\-]*[號]?))/);
        const statusMatch = text.match(/(營業中|已打烊|即將打烊|24\s*小時營業)/);
        return {
          name,
          rating: ratingMatch ? parseFloat(ratingMatch[1]) : 0,
          reviews: reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, "")) : 0,
          priceRange: priceMatch ? priceMatch[1] : "",
          cuisine: cuisineMatch ? cuisineMatch[1].trim() : "",
          address: addressMatch ? addressMatch[1].trim() : "",
          status: statusMatch ? statusMatch[1] : "",
          mapsUrl: el.href || "",
        };
      }).filter((r) => r.name.length > 0);
    });

    return { query, restaurants, searchedAt: new Date().toISOString() };
  } catch {
    return { query, restaurants: [], searchedAt: new Date().toISOString() };
  } finally {
    if (browser) await browser.close();
  }
}

// ── OpenTable TW — CDP Browser Automation ──
// Uses CDP connection to a manually-launched Chrome to bypass Akamai TLS fingerprinting.
// Playwright never touches Chrome's startup → TLS fingerprint = normal user.

const OT_USER_DATA = path.join(process.env.LOCALAPPDATA || "C:/Users/CIM/AppData/Local", "ZeroJarvis", "opentable-profile");
const CDP_PORT = 9234;

function findChrome() {
  const candidates = [
    path.join(process.env["PROGRAMFILES"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(true));
    srv.once("listening", () => { srv.close(); resolve(false); });
    srv.listen(port, "127.0.0.1");
  });
}

async function launchRealChrome() {
  const inUse = await isPortInUse(CDP_PORT);

  if (!inUse) {
    const chromePath = findChrome();
    if (!chromePath) throw new Error("找不到系統 Chrome，請安裝 Google Chrome");

    const chromeProc = spawn(chromePath, [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${OT_USER_DATA}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-default-apps",
      "--window-size=1280,900",
    ], { detached: true, stdio: "ignore" });
    chromeProc.unref();

    // Wait for Chrome to be ready
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await isPortInUse(CDP_PORT)) break;
    }
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  return browser;
}

// ── Dismiss Overlays ──
// Cookie consent, privacy banners, and other overlays can block button clicks.

async function dismissOverlays(pg) {
  try {
    await pg.evaluate(() => {
      // OneTrust / cookie consent
      const acceptBtns = document.querySelectorAll(
        '#onetrust-accept-btn-handler, .onetrust-accept-btn-handler, ' +
        'button[id*="accept" i], button[class*="accept" i], ' +
        'button[aria-label*="accept" i], button[aria-label*="Allow" i]'
      );
      for (const b of acceptBtns) {
        if (b.offsetParent !== null) { b.click(); return 'cookie-accept'; }
      }
      // Generic cookie/privacy overlays
      const overlays = document.querySelectorAll(
        '[class*="cookie" i][class*="banner" i], [class*="cookie" i][class*="overlay" i], ' +
        '[class*="consent" i][class*="banner" i], [id*="cookie" i][id*="banner" i]'
      );
      for (const o of overlays) {
        if (o.offsetParent !== null) { o.remove(); return 'overlay-removed'; }
      }
      // Close auth modal if present (from previous booking attempt)
      // But NEVER kill the auth iframe if it contains phone/code/details forms
      const authIframe = document.querySelector('iframe[id="authenticationModalIframe"]');
      if (!authIframe) {
        const modalClose = document.querySelector('button[data-test="modal-close"]');
        if (modalClose && modalClose.offsetParent !== null) {
          modalClose.click();
          return 'modal-closed';
        }
      }
      return null;
    });
  } catch {}
}

// ── Helper: find auth frame using multiple strategies ──
async function findAuthFrame(pg) {
  // Strategy 1: frames() URL matching
  for (const f of pg.frames()) {
    const url = f.url();
    if (url.includes('/authenticate/') || url.includes('/auth/') || url.includes('authentication')) {
      return { frame: f, type: 'frame' };
    }
  }
  // Strategy 2: frames() — any non-main frame with phone input
  for (const f of pg.frames()) {
    if (f === pg.mainFrame()) continue;
    const fUrl = f.url();
    if (!fUrl || fUrl === 'about:blank') continue;
    try {
      const hasPhone = await f.evaluate(() => !!document.querySelector('#phoneNumber')).catch(() => false);
      if (hasPhone) return { frame: f, type: 'frame' };
    } catch {}
  }
  // Strategy 3: frameLocator via DOM element
  const selectors = [
    'iframe#authenticationModalIframe',
    'iframe[id*="auth" i]',
    'iframe[data-test*="auth" i]',
    'iframe[src*="auth" i]',
  ];
  for (const sel of selectors) {
    try {
      const loc = pg.frameLocator(sel);
      const bodyCount = await loc.locator('body').count().catch(() => 0);
      if (bodyCount > 0) return { frame: loc, type: 'frameLocator' };
    } catch {}
  }
  // Strategy 4: any visible iframe
  try {
    const loc = pg.frameLocator('iframe:visible');
    const bodyCount = await loc.locator('body').count().catch(() => 0);
    if (bodyCount > 0) return { frame: loc, type: 'frameLocator' };
  } catch {}
  return null;
}

// ── Auth via frameLocator (fallback for CDP-connected browsers) ──
// When pg.frames() can't find the iframe, use Playwright's frameLocator API
// which works by targeting the iframe DOM element directly.
async function handleAuthViaFrameLocator(pg, phone, countryCode) {
  process.stderr.write(`[mcp] 使用 frameLocator 方式處理 auth iframe\n`);

  // Try multiple selectors to find the iframe
  const selectors = [
    'iframe#authenticationModalIframe',
    'iframe[id*="auth" i]',
    'iframe[data-test*="auth" i]',
    'iframe[src*="auth" i]',
    'iframe:visible',
  ];

  let fl = null;
  for (const sel of selectors) {
    try {
      const loc = pg.frameLocator(sel);
      // Test if this frameLocator actually works by checking for content
      const phoneCount = await loc.locator('#phoneNumber').count().catch(() => 0);
      const bodyCount = await loc.locator('body').count().catch(() => 0);
      if (phoneCount > 0 || bodyCount > 0) {
        fl = loc;
        process.stderr.write(`[mcp] frameLocator 成功: ${sel} (phone=${phoneCount})\n`);
        break;
      }
    } catch {}
  }

  if (!fl) {
    process.stderr.write(`[mcp] frameLocator 也找不到可用的 iframe\n`);
    return { found: false };
  }

  // Wait for phone field
  let hasPhone = false;
  let hasCodeInput = false;
  for (let i = 0; i < 8; i++) {
    hasPhone = await fl.locator('#phoneNumber').count().catch(() => 0) > 0;
    hasCodeInput = await fl.locator('input[data-test*="code" i], input[id*="code" i], input[id*="otp" i]').count().catch(() => 0) > 0;
    if (hasPhone || hasCodeInput) break;
    await pg.waitForTimeout(1000);
    process.stderr.write(`[mcp] frameLocator: 等待元素... (${i + 1}/8)\n`);
  }

  if (hasCodeInput) {
    const text = await fl.locator('body').innerText().catch(() => '');
    return { found: true, needsVerificationCode: true, message: text.slice(0, 800) };
  }

  if (!hasPhone) {
    const text = await fl.locator('body').innerText().catch(() => '');
    process.stderr.write(`[mcp] frameLocator: 找不到 phone 欄位, 內容: ${text.slice(0, 300)}\n`);
    return { found: true, handled: false, message: text.slice(0, 800) };
  }

  // Phone is empty — can't proceed
  if (!phone) {
    process.stderr.write(`[mcp] 無電話號碼，無法完成簡訊驗證\n`);
    return { found: true, handled: false, message: '缺少電話號碼，無法完成簡訊驗證。' };
  }

  // Select country code
  try {
    const ccMap = { TW: '886', US: '1', JP: '81', KR: '82', CN: '86', HK: '852', SG: '65' };
    const dialCode = ccMap[countryCode] || countryCode;
    const ccSelect = fl.locator('#phoneNumberCountryCode');
    if (await ccSelect.count() > 0) {
      // Get options to find correct value
      const options = await ccSelect.locator('option').allInnerTexts().catch(() => []);
      process.stderr.write(`[mcp] 國碼選項: ${options.slice(0, 5).join(', ')}...\n`);
      // Try selecting by country code or dial code
      await ccSelect.selectOption({ label: options.find(t => t.includes(`+${dialCode}`)) || countryCode }).catch(async () => {
        await ccSelect.selectOption(countryCode).catch(() => {});
      });
      process.stderr.write(`[mcp] frameLocator: 已選擇國碼\n`);
    }
  } catch (e) {
    process.stderr.write(`[mcp] frameLocator: 國碼選擇失敗: ${e.message}\n`);
  }

  // Fill phone — strip leading 0 for international format
  let phoneNum = phone;
  if (phoneNum.startsWith('0') && countryCode && countryCode !== 'US') {
    phoneNum = phoneNum.slice(1);
  }

  try {
    const phoneInput = fl.locator('#phoneNumber');
    await phoneInput.click({ timeout: 3000 });
    await phoneInput.fill('');
    // Type char by char for reliability
    for (const ch of phoneNum) {
      await phoneInput.type(ch, { delay: 40 + Math.random() * 60 });
    }
    process.stderr.write(`[mcp] frameLocator: 已填寫電話: ${phoneNum}\n`);
  } catch (e) {
    process.stderr.write(`[mcp] frameLocator: 填寫電話失敗: ${e.message}\n`);
    return { found: true, handled: false, message: `填寫電話失敗: ${e.message}` };
  }

  // Click 繼續
  await pg.waitForTimeout(500);
  try {
    // Try multiple selectors for the continue button
    const btnSelectors = [
      'button[data-test="continue-button"]',
      'button:has-text("繼續")',
      'button[type="submit"]',
    ];
    let clicked = false;
    for (const btnSel of btnSelectors) {
      const btn = fl.locator(btnSel);
      if (await btn.count() > 0) {
        await btn.first().click({ timeout: 5000 }).catch(async () => {
          await btn.first().click({ force: true, timeout: 5000 });
        });
        process.stderr.write(`[mcp] frameLocator: 已點擊繼續 (${btnSel})\n`);
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      process.stderr.write(`[mcp] frameLocator: 找不到繼續按鈕\n`);
    }
  } catch (e) {
    process.stderr.write(`[mcp] frameLocator: 點擊繼續失敗: ${e.message}\n`);
  }

  // Wait and check next state
  await pg.waitForTimeout(5000);

  // Check main page
  if (pg.url().includes('/confirmation')) {
    return { found: true, success: true };
  }

  // Check for verification code input
  for (let codeCheck = 0; codeCheck < 3; codeCheck++) {
    const codeExists = await fl.locator('#emailVerificationCode, input[data-test*="code" i], input[id*="code" i], input[id*="otp" i]').count().catch(() => 0) > 0;
    const text = await fl.locator('body').innerText().catch(() => '');
    const needsCode = text.includes('驗證碼') || text.includes('確認碼') || text.includes('verification code') || text.includes('enter the code') || text.includes('請輸入驗證碼');
    const needsDetails = text.includes('最後一步') || text.includes('確認你的詳細資料') || text.includes('名字');

    process.stderr.write(`[mcp] frameLocator 狀態(${codeCheck}): code=${codeExists} needsCode=${needsCode} details=${needsDetails}\n`);

    if (needsCode || codeExists) {
      return { found: true, needsVerificationCode: true, message: text.slice(0, 800) };
    }
    if (needsDetails) {
      return { found: true, needsDetails: true, message: text.slice(0, 800) };
    }
    await pg.waitForTimeout(2000);
  }

  return { found: true, submitted: true, message: '' };
}

// ── Auth Iframe Handler ──
// After clicking 完成訂位, OpenTable shows an authentication iframe
// with phone number input for SMS verification.

async function handleAuthIframe(pg, phone, countryCode) {
  process.stderr.write(`[mcp] handleAuthIframe 開始，phone=${phone ? '有' : '無'}\n`);

  // Debug: list all frames
  const allFrames = pg.frames();
  process.stderr.write(`[mcp] 頁面共有 ${allFrames.length} 個 frames\n`);
  for (const f of allFrames) {
    process.stderr.write(`[mcp]   frame: ${f.url().slice(0, 120)}\n`);
  }

  // ── Strategy 1: find auth frame via pg.frames() URL matching ──
  let authFrame = null;
  for (let retry = 0; retry < 10; retry++) {
    for (const f of pg.frames()) {
      const url = f.url();
      if (url.includes('/authenticate/') || url.includes('/auth/') || url.includes('authentication')) {
        authFrame = f;
        break;
      }
    }
    if (authFrame) break;

    // Also check if any non-main frame has phone input
    for (const f of pg.frames()) {
      if (f === pg.mainFrame()) continue;
      const fUrl = f.url();
      if (!fUrl || fUrl === 'about:blank') continue;
      try {
        const hasPhone = await f.evaluate(() => !!document.querySelector('#phoneNumber')).catch(() => false);
        if (hasPhone) {
          authFrame = f;
          process.stderr.write(`[mcp] 透過 phone 欄位找到 frame: ${fUrl.slice(0, 120)}\n`);
          break;
        }
      } catch {}
    }
    if (authFrame) break;

    await pg.waitForTimeout(1000);
    if (retry % 3 === 2) process.stderr.write(`[mcp] 等待驗證 iframe... (${retry + 1}/10)\n`);
  }

  // ── Strategy 2: use frameLocator if frames() didn't find it ──
  // This works better with CDP-connected browsers where frames() may be incomplete
  let useFrameLocator = false;
  if (!authFrame) {
    process.stderr.write(`[mcp] frames() 找不到 auth iframe，嘗試 frameLocator...\n`);

    // Check if the iframe element exists in DOM
    const iframeSelectors = [
      'iframe#authenticationModalIframe',
      'iframe[id*="auth" i]',
      'iframe[data-test*="auth" i]',
      'iframe[src*="auth" i]',
      'iframe[src*="authenticate" i]',
    ];

    let iframeSelector = null;
    for (const sel of iframeSelectors) {
      try {
        const count = await pg.locator(sel).count();
        if (count > 0) {
          iframeSelector = sel;
          process.stderr.write(`[mcp] 找到 iframe 元素: ${sel}\n`);
          break;
        }
      } catch {}
    }

    // If no auth-specific iframe, look for ANY visible iframe
    if (!iframeSelector) {
      try {
        const iframeInfo = await pg.evaluate(() => {
          const iframes = document.querySelectorAll('iframe');
          return Array.from(iframes).map(f => ({
            id: f.id,
            src: f.src,
            visible: f.offsetParent !== null || f.getBoundingClientRect().height > 0,
            classes: f.className,
          }));
        });
        process.stderr.write(`[mcp] 頁面上所有 iframe: ${JSON.stringify(iframeInfo)}\n`);

        // Find the first visible iframe that's likely the auth modal
        for (const info of iframeInfo) {
          if (info.visible && info.src) {
            iframeSelector = info.id ? `iframe#${info.id}` : `iframe[src="${info.src}"]`;
            process.stderr.write(`[mcp] 使用可見 iframe: ${iframeSelector}\n`);
            break;
          }
        }
      } catch (e) {
        process.stderr.write(`[mcp] 列舉 iframe 失敗: ${e.message}\n`);
      }
    }

    if (iframeSelector) {
      useFrameLocator = true;
      // We'll use frameLocator approach below
    } else {
      return { found: false };
    }
  }

  if (authFrame) {
    process.stderr.write(`[mcp] 偵測到驗證 iframe (frames): ${authFrame.url().slice(0, 100)}\n`);
  }

  // ── Fill phone number ──
  if (useFrameLocator) {
    return await handleAuthViaFrameLocator(pg, phone, countryCode);
  }

  // Wait for phone field to render inside iframe (retry up to 8 seconds)
  let iframeState = { hasPhone: false, hasCodeInput: false, text: '' };
  for (let waitRetry = 0; waitRetry < 8; waitRetry++) {
    iframeState = await authFrame.evaluate(() => ({
      hasPhone: !!document.querySelector('#phoneNumber'),
      hasCodeInput: !!(document.querySelector('input[data-test*="code" i]') || document.querySelector('input[id*="code" i]') || document.querySelector('input[id*="otp" i]')),
      hasEmailSwitch: !!(document.querySelector('a[href*="email"]') || document.querySelector('button[data-test*="email" i]') || (document.body?.innerText || '').includes('改用電子郵件')),
      text: (document.body?.innerText || '').slice(0, 800),
    })).catch(() => ({ hasPhone: false, hasCodeInput: false, hasEmailSwitch: false, text: '' }));

    if (iframeState.hasPhone || iframeState.hasCodeInput) break;
    await pg.waitForTimeout(1000);
    process.stderr.write(`[mcp] 等待 iframe 內元素載入... (${waitRetry + 1}/8)\n`);
  }

  if (!iframeState.hasPhone && !iframeState.hasCodeInput) {
    process.stderr.write(`[mcp] iframe 內容: ${iframeState.text.slice(0, 300)}\n`);
    return { found: true, handled: false, message: iframeState.text };
  }

  if (iframeState.hasCodeInput) {
    return { found: true, needsVerificationCode: true, message: iframeState.text };
  }

  // Select country code
  try {
    const ccOptions = await authFrame.$$eval('#phoneNumberCountryCode option', opts =>
      opts.map(o => ({ value: o.value, text: o.textContent?.trim() || '' }))
    );
    const ccMap = { TW: '886', US: '1', JP: '81', KR: '82', CN: '86', HK: '852', SG: '65' };
    const dialCode = ccMap[countryCode] || countryCode;
    const match = ccOptions.find(o =>
      o.value === countryCode ||
      o.text.includes(`+${dialCode}`)
    );
    if (match) {
      await authFrame.selectOption('#phoneNumberCountryCode', match.value);
      process.stderr.write(`[mcp] 已選擇國碼: ${match.text}\n`);
    }
  } catch (e) {
    process.stderr.write(`[mcp] 國碼選擇失敗: ${e.message}\n`);
  }

  // Fill phone — strip leading 0 for international format
  let phoneNum = phone || '';
  if (!phoneNum) {
    process.stderr.write(`[mcp] 無電話號碼，無法完成簡訊驗證\n`);
    return { found: true, handled: false, message: '缺少電話號碼，無法完成簡訊驗證。請在 config/booking.json 設定 phone 或在指令中提供 phone 參數。' };
  }
  if (phoneNum.startsWith('0') && countryCode && countryCode !== 'US') {
    phoneNum = phoneNum.slice(1);
  }
  const phoneInput = await authFrame.$('#phoneNumber');
  if (phoneInput) {
    await phoneInput.click();
    await phoneInput.fill('');
    for (const ch of phoneNum) {
      await phoneInput.type(ch, { delay: 40 + Math.random() * 60 });
    }
    process.stderr.write(`[mcp] 已填寫電話: ${phoneNum}\n`);
  }

  // Click 繼續
  await pg.waitForTimeout(500);
  const continueBtn = await authFrame.$('button[data-test="continue-button"]');
  if (continueBtn) {
    try {
      await continueBtn.click({ timeout: 5000 });
    } catch {
      await continueBtn.click({ force: true, timeout: 5000 });
    }
    process.stderr.write(`[mcp] 已點擊繼續\n`);
  }

  // Wait and check next state
  await pg.waitForTimeout(5000);

  // Check main page first
  if (pg.url().includes('/confirmation')) {
    return { found: true, success: true };
  }

  // Re-check iframe for code input (retry a few times as page may be transitioning)
  for (let codeCheck = 0; codeCheck < 3; codeCheck++) {
    const afterState = await authFrame.evaluate(() => {
      const text = (document.body?.innerText || '');
      return {
        text: text.slice(0, 800),
        hasCodeInput: !!(document.querySelector('#emailVerificationCode') || document.querySelector('input[data-test*="code" i]') || document.querySelector('input[id*="code" i]') || document.querySelector('input[id*="otp" i]')),
        needsCode: text.includes('驗證碼') || text.includes('確認碼') || text.includes('verification code') || text.includes('enter the code') || text.includes('請輸入驗證碼'),
        needsDetails: text.includes('最後一步') || text.includes('確認你的詳細資料') || text.includes('名字'),
      };
    }).catch(() => ({ text: '', hasCodeInput: false, needsCode: false, needsDetails: false }));

    process.stderr.write(`[mcp] iframe 狀態(${codeCheck}): code=${afterState.hasCodeInput} needsCode=${afterState.needsCode} details=${afterState.needsDetails}\n`);

    if (afterState.needsCode || afterState.hasCodeInput) {
      return { found: true, needsVerificationCode: true, message: afterState.text };
    }
    if (afterState.needsDetails) {
      return { found: true, needsDetails: true, message: afterState.text };
    }
    await pg.waitForTimeout(2000);
  }

  return { found: true, submitted: true, message: '' };
}

async function searchOpenTable(restaurant, date, time, partySize) {
  if (!restaurant) {
    return { restaurant, found: false, results: [], searchUrl: "", date, time, partySize };
  }

  const dateTime = `${date}T${time}:00`;
  const searchUrl = `https://www.opentable.com.tw/s?term=${encodeURIComponent(restaurant)}&dateTime=${encodeURIComponent(dateTime)}&covers=${partySize}`;

  let browser;
  try {
    browser = await launchRealChrome();
    const context = browser.contexts()[0] || await browser.newContext();
    const page = await context.newPage();
    await page.goto(searchUrl, { timeout: 30000, waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);

    const results = await page.evaluate(() => {
      const restaurants = [];
      const allLinks = document.querySelectorAll('a[href*="/restaurant/profile"]');
      const seen = new Set();

      for (const link of Array.from(allLinks).slice(0, 8)) {
        const href = link.href || "";
        if (seen.has(href)) continue;
        seen.add(href);

        const card = link.closest('[class*="card" i], [class*="result" i], [class*="Restaurant" i], li, article, section') || link.parentElement?.parentElement?.parentElement;
        const nameEl = card?.querySelector('h2, h3, [class*="name" i], [class*="Name"]') || link;
        let name = (nameEl?.textContent || "").trim().split("\n")[0].trim();
        if (!name || name.length < 2 || name.length > 60) continue;

        const slotEls = card?.querySelectorAll('a[href*="/booking/details"], a[href*="availabilityToken"], button[class*="slot" i], button[class*="time" i], a[href*="avt="], [class*="TimeSlot"], [data-test*="slot"]') || [];
        const slots = [];
        for (const slot of slotEls) {
          const t = (slot.textContent || "").trim();
          const url = slot.tagName === "A" ? slot.href : (slot.closest("a")?.href || "");
          if (t && t.match(/\d{1,2}:\d{2}/)) {
            slots.push({ time: t, bookingUrl: url });
          }
        }

        const cardText = card?.textContent || "";
        const ratingMatch = cardText.match(/([\d.]+)\s*(?:分|\/5)/);

        restaurants.push({
          name,
          rating: ratingMatch ? ratingMatch[1] : "",
          meta: "",
          slots,
          pageUrl: href,
        });
      }

      // Fallback: look for time slot buttons on the whole page
      if (restaurants.length === 0) {
        const slotBtns = document.querySelectorAll('a[href*="/booking/details"], a[href*="availabilityToken"], button[class*="slot" i], button[class*="time" i], a[href*="avt="]');
        const slots = [];
        for (const btn of Array.from(slotBtns).slice(0, 10)) {
          const t = (btn.textContent || "").trim();
          const url = btn.tagName === "A" ? btn.href : "";
          if (t && t.match(/\d{1,2}:\d{2}/)) {
            slots.push({ time: t, bookingUrl: url });
          }
        }
        if (slots.length > 0) {
          const pageTitle = document.querySelector('h1, h2')?.textContent?.trim() || "";
          restaurants.push({ name: pageTitle || "搜尋結果", rating: "", meta: "", slots, pageUrl: window.location.href });
        }
      }

      return restaurants;
    });

    const pageText = await page.evaluate(() => (document.body?.innerText || "").slice(0, 2000));
    const noResults = pageText.includes("找不到") || pageText.includes("沒有結果") ||
                      pageText.includes("No results") || pageText.includes("0 間餐廳") ||
                      pageText.includes("Access Denied");

    await page.close();

    return {
      restaurant,
      found: results.length > 0,
      results,
      searchUrl,
      noResults: noResults && results.length === 0,
      date,
      time,
      partySize,
      searchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      restaurant,
      found: false,
      results: [],
      searchUrl,
      error: String(err?.message || err),
      date,
      time,
      partySize,
      searchedAt: new Date().toISOString(),
    };
  }
}

// ── OpenTable TW — Automated Booking ──
// Time slots on search results are <a> tags with JS click handlers.
// Clicking them navigates to /booking/details?availabilityToken=... where the form lives.

async function bookOpenTable(restaurant, date, time, partySize, name, phone, email, specialRequest) {
  const dateTime = `${date}T${time}:00`;
  const searchUrl = `https://www.opentable.com.tw/s?term=${encodeURIComponent(restaurant)}&dateTime=${encodeURIComponent(dateTime)}&covers=${partySize}`;

  let browser;
  try {
    browser = await launchRealChrome();
    const context = browser.contexts()[0] || await browser.newContext();

    // Close existing OpenTable tabs to avoid interference
    for (const p of context.pages()) {
      if (p.url().includes('opentable.com')) {
        try { await p.close(); } catch {}
      }
    }

    const page = await context.newPage();
    page.setDefaultTimeout(10000); // Prevent 30s hangs on overlays
    await page.goto(searchUrl, { timeout: 30000, waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);

    // Step 1: Find the time slot link and click it (triggers JS navigation to /booking/details)
    // IMPORTANT: Time slots are <a> tags inside restaurant cards.
    // The page also has a time-picker dropdown with <a> tags — we must NOT match those.
    // We scope our search to elements inside restaurant result cards only.
    const slotInfo = await page.evaluate((targetTime) => {
      // Convert "20:45" to "下午8:45" for matching
      let targetHour = parseInt(targetTime.split(":")[0]);
      let targetMin = targetTime.split(":")[1];
      let ampm = targetHour >= 12 ? "下午" : "上午";
      if (targetHour > 12) targetHour -= 12;
      const target12h = `${ampm}${targetHour}:${targetMin}`;

      // Find the restaurant results area (exclude the top search bar / time picker)
      // OpenTable search results are typically in the main content area
      const resultContainers = document.querySelectorAll(
        '[class*="SearchResult" i], [class*="RestaurantCard" i], [class*="result" i], ' +
        '[data-test*="restaurant" i], [data-test*="search-result" i], ' +
        'main, [role="main"], #search-results, .search-results'
      );

      // Helper to check if an element is inside the time picker dropdown (not a result slot)
      function isInTimePicker(el) {
        const picker = el.closest('[class*="timepicker" i], [class*="DateTimePicker" i], [class*="SearchBar" i], [class*="searchBar" i], [class*="filter" i], nav, header, [class*="Header" i]');
        return !!picker;
      }

      // Strategy 1: Look inside result containers
      for (const container of resultContainers) {
        const links = container.querySelectorAll("a");
        for (const a of links) {
          if (isInTimePicker(a)) continue;
          const text = (a.textContent || "").trim();
          if (text === target12h || text === targetTime) {
            // Return a unique selector path for this element
            return { text, index: Array.from(document.querySelectorAll("a")).indexOf(a) };
          }
        }
      }

      // Strategy 2: Find any <a> with time text that is inside a card-like container
      const allAs = document.querySelectorAll("a");
      for (const a of allAs) {
        if (isInTimePicker(a)) continue;
        const text = (a.textContent || "").trim();
        if (text === target12h || text === targetTime) {
          // Verify it's near a restaurant name (inside a card)
          const card = a.closest('[class*="card" i], [class*="result" i], [class*="Restaurant" i], li, article, section');
          if (card) {
            return { text, index: Array.from(allAs).indexOf(a) };
          }
        }
      }

      // Strategy 3: Match any time slot in cards (not exact match)
      for (const a of allAs) {
        if (isInTimePicker(a)) continue;
        const text = (a.textContent || "").trim();
        if (text.match(/^[上下]午\d{1,2}:\d{2}$/) && a.closest('[class*="card" i], [class*="result" i], [class*="Restaurant" i], li, article, section')) {
          return { text, index: Array.from(allAs).indexOf(a) };
        }
      }

      return null;
    }, time);

    if (!slotInfo) {
      await page.close();
      return { success: false, error: "找不到可用時段", searchUrl };
    }

    // Click the slot — use Playwright's real click (not evaluate click) for JS navigation
    // We target by nth-index to avoid hitting the time picker dropdown's <a> tags
    const slotTime = slotInfo.text;
    const allLinks = page.locator("a");
    const targetLink = allLinks.nth(slotInfo.index);

    await Promise.all([
      page.waitForURL("**/booking/details**", { timeout: 15000 }).catch(() => null),
      targetLink.click({ timeout: 10000 }),
    ]);

    // Wait for booking form to load
    await page.waitForTimeout(4000);
    const currentUrl = page.url();

    if (!currentUrl.includes("/booking/details")) {
      // Maybe navigation happened differently, wait a bit more
      await page.waitForTimeout(3000);
    }

    // Step 2 + 3: Fill form, submit, handle verification, re-fill if needed

    // Step 3: Click "完成訂位" submit button
    async function clickSubmitButton(pg) {
      await dismissOverlays(pg);
      const btn = await pg.$('button[data-test="complete-reservation-button"]');
      if (btn) {
        const txt = await btn.textContent();
        try {
          await btn.click({ timeout: 5000 });
        } catch {
          // Force click if overlay still blocks
          await btn.click({ force: true, timeout: 5000 });
        }
        return txt?.trim() || "submitted";
      }
      const allBtns = await pg.$$('button[type="submit"]');
      for (const b of allBtns) {
        const text = await b.textContent();
        const lower = (text || "").toLowerCase();
        if (lower.includes("完成") || lower.includes("訂位") || lower.includes("confirm") ||
            lower.includes("reserve")) {
          try {
            await b.click({ timeout: 5000 });
          } catch {
            await b.click({ force: true, timeout: 5000 });
          }
          return text?.trim();
        }
      }
      return null;
    }

    // Helper: fill all form fields on the current page
    // Returns an object indicating which fields were found and filled
    //
    // OpenTable has two form modes:
    //   A. Phone mode (default): phoneNumber + countryCode → submit
    //   B. Email mode (after clicking "改用電子郵件"): email field → submit
    //   C. Post-verification: firstName + lastName + email (phone already saved)
    //
    // Strategy: prefer phone mode (don't click 改用電子郵件).
    // Only switch to email mode if phone field is not found.
    async function fillBookingForm(pg, { firstName, lastName, phone, email, specialReq }) {
      const filled = { phone: false, email: false, firstName: false, lastName: false };

      // Helper: check if element exists AND is visible before filling
      async function safeFill(el, value) {
        if (!el || !value) return false;
        try {
          const visible = await el.isVisible().catch(() => false);
          if (!visible) return false;
          await el.click({ timeout: 3000 }).catch(() => {});
          await el.fill(value);
          return true;
        } catch (e) {
          process.stderr.write(`[mcp] safeFill 失敗: ${e.message.slice(0, 80)}\n`);
          return false;
        }
      }

      // First, try to fill phone (preferred path — phone mode)
      const phInput = await pg.$('#phoneNumber');
      if (await safeFill(phInput, phone)) {
        filled.phone = true;
      }

      // If no phone field, try email mode
      if (!filled.phone) {
        // Check if we need to switch to email mode
        const emailSwitch = pg.locator('button[data-test="continue-with-email-button"]');
        if (await emailSwitch.count() > 0 && await emailSwitch.isVisible().catch(() => false)) {
          await emailSwitch.click({ timeout: 3000 }).catch(() => {});
          await pg.waitForTimeout(2000);
        }
        // Now look for email input
        const emInput = await pg.$('#email, input[type="email"], input[id*="email" i], input[placeholder*="email" i]');
        if (await safeFill(emInput, email)) {
          filled.email = true;
        }
      }

      // First name (usually only appears after verification or on re-fill)
      const fnInput = await pg.$('#firstName, input[data-test*="first" i], input[id*="first" i], input[placeholder*="名" i], input[aria-label*="名" i]');
      if (await safeFill(fnInput, firstName)) { filled.firstName = true; }

      // Last name
      const lnInput = await pg.$('#lastName, input[data-test*="last" i], input[id*="last" i], input[placeholder*="姓" i], input[aria-label*="姓" i]');
      if (await safeFill(lnInput, lastName)) { filled.lastName = true; }

      // Special requests
      if (specialReq) {
        const ta = await pg.$('#specialRequest');
        await safeFill(ta, specialReq);
      }

      process.stderr.write(`[mcp] fillBookingForm 結果: ${JSON.stringify(filled)}\n`);
      await pg.waitForTimeout(500);
      return filled;
    }

    // Prepare form data from config
    const u = bookingConfig.user || {};
    const formData = {
      firstName: u.firstName || name?.split(" ")[0] || name || "",
      lastName: u.lastName || name?.split(" ")[1] || name?.charAt(0) || "",
      phone: phone || u.phone || "",
      email: email || u.email || "",
      specialReq: specialRequest || "",
    };

    // Pre-check: at least one contact method required
    if (!formData.phone && !formData.email) {
      await page.close();
      return { success: false, message: "缺少聯絡方式：請在 config/booking.json 設定 phone 或 email，或在指令中提供 phone/email 參數。", searchUrl };
    }

    // Dismiss cookie consent and other overlays before interaction
    await dismissOverlays(page);

    // Check for credit card requirement — abort before filling form
    const creditCardCheck = await page.evaluate(() => {
      const text = (document.body?.innerText || '').toLowerCase();
      const hasCCInput = !!(
        document.querySelector('input[id*="card" i]') ||
        document.querySelector('input[name*="card" i]') ||
        document.querySelector('input[data-test*="card" i]') ||
        document.querySelector('input[autocomplete="cc-number"]') ||
        document.querySelector('input[id*="cvv" i]') ||
        document.querySelector('input[id*="cvc" i]') ||
        document.querySelector('[class*="credit-card" i]') ||
        document.querySelector('[class*="creditCard" i]') ||
        document.querySelector('[class*="CardNumber" i]')
      );
      const hasCCText = text.includes('信用卡') || text.includes('credit card') || text.includes('卡號') ||
                        text.includes('card number') || text.includes('到期日') || text.includes('expiration') ||
                        text.includes('cvv') || text.includes('cvc') || text.includes('安全碼');
      return { hasCCInput, hasCCText, needsCC: hasCCInput || hasCCText };
    });
    if (creditCardCheck.needsCC) {
      process.stderr.write(`[mcp] ⚠ 偵測到信用卡欄位！input=${creditCardCheck.hasCCInput} text=${creditCardCheck.hasCCText}\n`);
      await page.close();
      return {
        success: false,
        requiresCreditCard: true,
        slotSelected: slotTime,
        message: `此餐廳（${restaurant}）的訂位需要提供信用卡資訊，為安全起見已自動中止。請手動前往 OpenTable 完成訂位。`,
        searchUrl,
      };
    }

    // Initial fill — try to fill whatever fields are visible
    let filled = await fillBookingForm(page, formData);
    await page.waitForTimeout(1000);

    // Semi-auto strategy: try to click submit, but if reCAPTCHA blocks it,
    // fall back to asking the user to click it manually.
    let submitted = await clickSubmitButton(page);
    process.stderr.write(`[mcp] clickSubmitButton 結果: ${submitted || 'null (未找到按鈕)'}\n`);

    // Check for auth iframe (appears after clicking submit for logged-in users)
    await page.waitForTimeout(3000);
    process.stderr.write(`[mcp] 檢查 auth iframe...\n`);
    const authResult = await handleAuthIframe(page, formData.phone, bookingConfig.user?.countryCode || "TW");
    process.stderr.write(`[mcp] handleAuthIframe 結果: found=${authResult.found} success=${authResult.success} needsCode=${authResult.needsVerificationCode} needsDetails=${authResult.needsDetails} handled=${authResult.handled}\n`);
    if (authResult.found) {
      if (authResult.success) {
        await page.close();
        return { success: true, slotSelected: slotTime, submitted, message: `訂位成功！${restaurant} ${date} ${time} ${partySize}位`, searchUrl };
      }
      if (authResult.needsVerificationCode) {
        pendingBooking = { page, formData, fillBookingForm, clickSubmitButton, restaurant, date, time, partySize, slotTime, searchUrl, submitted };
        return {
          success: false,
          needsVerification: true,
          needsCode: true,
          slotSelected: slotTime,
          submitted,
          message: "已填寫電話號碼並送出。OpenTable 會發送簡訊驗證碼到你的手機，請告訴我收到的驗證碼數字。",
          searchUrl,
        };
      }
      if (authResult.needsDetails) {
        // Phone already verified, needs name/email details
        process.stderr.write(`[mcp] Auth iframe 需要填寫詳細資料 (name/email)\n`);
        const detailsFilled = await fillDetailsInAuthIframe(page, formData);
        if (detailsFilled) {
          // Check if booking succeeded after filling details
          await page.waitForTimeout(3000);
          const postDetailsUrl = page.url();
          const postDetailsText = await page.evaluate(() => (document.body?.innerText || "").slice(0, 2000));
          if (postDetailsUrl.includes("/confirmation") || postDetailsText.includes("感謝") || postDetailsText.includes("訂位完成") || postDetailsText.includes("confirmed")) {
            await page.close();
            return { success: true, slotSelected: slotTime, submitted, message: `訂位成功！${restaurant} ${date} ${time} ${partySize}位`, searchUrl };
          }
        }
      }
      // Auth iframe found but unknown state — retry once more with longer wait
      process.stderr.write(`[mcp] Auth iframe 狀態不明 (handled=${authResult.handled}): ${authResult.message?.slice(0, 200)}\n`);
      
      // The iframe is visible but we couldn't interact with it — try again
      await page.waitForTimeout(3000);
      const authRetry2 = await handleAuthIframe(page, formData.phone, bookingConfig.user?.countryCode || "TW");
      if (authRetry2.found && authRetry2.needsVerificationCode) {
        pendingBooking = { page, formData, fillBookingForm, clickSubmitButton, restaurant, date, time, partySize, slotTime, searchUrl, submitted };
        return {
          success: false, needsVerification: true, needsCode: true, slotSelected: slotTime, submitted,
          message: "已填寫電話號碼並送出。OpenTable 會發送簡訊驗證碼到你的手機，請告訴我收到的驗證碼數字。", searchUrl,
        };
      }
      if (authRetry2.found && authRetry2.success) {
        await page.close();
        return { success: true, slotSelected: slotTime, submitted, message: `訂位成功！${restaurant} ${date} ${time} ${partySize}位`, searchUrl };
      }
      if (authRetry2.found && authRetry2.needsDetails) {
        const detailsFilled = await fillDetailsInAuthIframe(page, formData);
        if (detailsFilled) {
          await page.waitForTimeout(3000);
          if (page.url().includes("/confirmation")) {
            await page.close();
            return { success: true, slotSelected: slotTime, submitted, message: `訂位成功！${restaurant} ${date} ${time} ${partySize}位`, searchUrl };
          }
        }
      }
      // Still unknown — keep page alive and tell user
      if (authRetry2.found && !authRetry2.success && !authRetry2.needsVerificationCode) {
        pendingBooking = { page, formData, fillBookingForm, clickSubmitButton, restaurant, date, time, partySize, slotTime, searchUrl, submitted };
        return {
          success: false, waitingForUserSubmit: true, slotSelected: slotTime, submitted,
          message: `訂位流程需要驗證，但自動填寫失敗。請手動在瀏覽器中完成驗證。(${authRetry2.message?.slice(0, 100) || '未知狀態'})`,
          searchUrl,
        };
      }
    }

    // If auth iframe was not found on first attempt, try again (it may appear late)
    if (!authResult.found) {
      await page.waitForTimeout(3000);
      const authRetry = await handleAuthIframe(page, formData.phone, bookingConfig.user?.countryCode || "TW");
      if (authRetry.found) {
        if (authRetry.success) {
          await page.close();
          return { success: true, slotSelected: slotTime, submitted, message: `訂位成功！${restaurant} ${date} ${time} ${partySize}位`, searchUrl };
        }
        if (authRetry.needsVerificationCode) {
          pendingBooking = { page, formData, fillBookingForm, clickSubmitButton, restaurant, date, time, partySize, slotTime, searchUrl, submitted };
          return {
            success: false, needsVerification: true, needsCode: true, slotSelected: slotTime, submitted,
            message: "已填寫電話號碼並送出。OpenTable 會發送簡訊驗證碼到你的手機，請告訴我收到的驗證碼數字。", searchUrl,
          };
        }
        if (authRetry.needsDetails) {
          process.stderr.write(`[mcp] Auth iframe (retry) 需要填寫詳細資料\n`);
          const detailsFilled = await fillDetailsInAuthIframe(page, formData);
          if (detailsFilled) {
            await page.waitForTimeout(3000);
            if (page.url().includes("/confirmation")) {
              await page.close();
              return { success: true, slotSelected: slotTime, submitted, message: `訂位成功！${restaurant} ${date} ${time} ${partySize}位`, searchUrl };
            }
          }
        }
        process.stderr.write(`[mcp] Auth iframe (retry) 狀態: ${authRetry.message?.slice(0, 200)}\n`);
      }
    }

    // Quick check (6 seconds): did the page change after clicking submit?
    process.stderr.write(`[mcp] 進入 quick check 階段，目前 URL: ${page.url().slice(0, 100)}\n`);
    let pageChanged = false;
    for (let quickCheck = 0; quickCheck < 2; quickCheck++) {
      await page.waitForTimeout(3000);
      const curUrl = page.url();
      const pageText = await page.evaluate(() => (document.body?.innerText || "").slice(0, 3000));

      // Success?
      if (curUrl.includes("/confirmation") || pageText.includes("感謝") || pageText.includes("訂位完成") ||
          pageText.includes("confirmed") || pageText.includes("成功")) {
        await page.close();
        return { success: true, slotSelected: slotTime, submitted, message: `訂位成功！${restaurant} ${date} ${time} ${partySize}位`, finalUrl: curUrl, searchUrl };
      }

      // Verification?
      const hasVerification = pageText.includes("驗證碼") || pageText.includes("驗證帳戶") ||
                              pageText.includes("verify") || pageText.includes("verification") ||
                              pageText.includes("確認碼") || pageText.includes("驗證信") ||
                              pageText.includes("確認你的電子郵件") || pageText.includes("收到用來驗證帳戶的電子郵件");
      if (hasVerification) {
        pendingBooking = { page, formData, fillBookingForm, clickSubmitButton, restaurant, date, time, partySize, slotTime, searchUrl, submitted };
        return { success: false, needsVerification: true, slotSelected: slotTime, submitted,
                 message: "OpenTable 要求 email 驗證。請查看信箱完成驗證，完成後跟我說『驗證完成』。", searchUrl };
      }

      // New fields appeared? (form expanded after submit)
      const newFields = await page.evaluate(() => ({
        hasPhone: !!document.querySelector('#phoneNumber'),
        hasEmail: !!document.querySelector('#email, input[type="email"]'),
        hasFirstName: !!document.querySelector('#firstName, input[id*="first" i]'),
      }));
      if ((newFields.hasPhone || newFields.hasEmail || newFields.hasFirstName) && !filled.phone && !filled.email && !filled.firstName) {
        process.stderr.write(`[mcp] 新欄位出現，填寫並重新送出\n`);
        filled = await fillBookingForm(page, formData);
        await page.waitForTimeout(1000);
        submitted = await clickSubmitButton(page);
        pageChanged = true;
        break;
      }
    }

    // If form expanded and re-submitted, wait for result again
    if (pageChanged) {
      for (let recheck = 0; recheck < 4; recheck++) {
        await page.waitForTimeout(3000);
        const curUrl = page.url();
        const pageText = await page.evaluate(() => (document.body?.innerText || "").slice(0, 3000));
        if (curUrl.includes("/confirmation") || pageText.includes("感謝") || pageText.includes("訂位完成") || pageText.includes("confirmed") || pageText.includes("成功")) {
          await page.close();
          return { success: true, slotSelected: slotTime, submitted, message: `訂位成功！${restaurant} ${date} ${time} ${partySize}位`, finalUrl: curUrl, searchUrl };
        }
        const hasVerification = pageText.includes("驗證碼") || pageText.includes("驗證帳戶") || pageText.includes("verify") || pageText.includes("確認碼") || pageText.includes("收到用來驗證帳戶的電子郵件");
        if (hasVerification) {
          pendingBooking = { page, formData, fillBookingForm, clickSubmitButton, restaurant, date, time, partySize, slotTime, searchUrl, submitted };
          return { success: false, needsVerification: true, slotSelected: slotTime, submitted,
                   message: "OpenTable 要求 email 驗證。請查看信箱完成驗證，完成後跟我說『驗證完成』。", searchUrl };
        }
      }
    }

    // If we're still on the booking page with no change, the auto-submit likely failed
    // (reCAPTCHA blocked). Keep the page alive and ask user to click submit manually.
    const finalUrl = page.url();
    if (finalUrl.includes("/booking/")) {
      pendingBooking = { page, formData, fillBookingForm, clickSubmitButton, restaurant, date, time, partySize, slotTime, searchUrl, submitted };
      process.stderr.write(`[mcp] 最終結果: waitingForUserSubmit，頁面保持開啟\n`);
      return {
        success: false,
        waitingForUserSubmit: true,
        slotSelected: slotTime,
        submitted,
        message: "我已經幫你填好訂位資料了！請在告訴我驗證碼後完成訂位。",
        finalUrl,
        searchUrl,
      };
    }

    process.stderr.write(`[mcp] 最終結果: 未知狀態，關閉頁面。URL=${page.url().slice(0, 100)}\n`);
    await page.close();
    return { success: false, slotSelected: slotTime, submitted, message: "已嘗試訂位，請確認瀏覽器中的結果", finalUrl, searchUrl };
  } catch (err) {
    process.stderr.write(`[mcp] bookOpenTable 錯誤: ${err?.message || err}\n`);
    return {
      success: false,
      error: String(err?.message || err),
      searchUrl,
    };
  }
}

// ── Fill Details Form in Auth Iframe ──
// After phone verification, OpenTable shows a "確認你的詳細資料" form
// inside the auth iframe with: firstName, lastName, email, and a 完成訂位 button.

async function fillDetailsInAuthIframe(pg, formData) {
  // Retry loop — the details form may take a moment to appear after code verification
  for (let attempt = 0; attempt < 6; attempt++) {
    const found = await findAuthFrame(pg);
    if (!found) {
      process.stderr.write(`[mcp] fillDetails: 找不到 auth iframe (attempt ${attempt})\n`);
      await pg.waitForTimeout(2000);
      continue;
    }

    const authFrame = found.frame;
    const isLocator = found.type === 'frameLocator';

    let formInfo;
    if (isLocator) {
      const text = await authFrame.locator('body').innerText().catch(() => '');
      const inputCount = await authFrame.locator('input:visible').count().catch(() => 0);
      formInfo = {
        text: text.slice(0, 500),
        hasDetails: text.includes('最後一步') || text.includes('確認你的詳細資料') ||
                    text.includes('名字') || text.includes('First name') || text.includes('Confirm your details'),
        inputPlaceholders: [],
      };
    } else {
      formInfo = await authFrame.evaluate(() => {
        const text = (document.body?.innerText || '');
        const inputs = [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null);
        return {
          text: text.slice(0, 500),
          hasDetails: text.includes('最後一步') || text.includes('確認你的詳細資料') ||
                      text.includes('名字') || text.includes('First name') || text.includes('Confirm your details'),
          inputPlaceholders: inputs.map(i => i.placeholder || i.id || ''),
        };
      }).catch(() => ({ text: '', hasDetails: false, inputPlaceholders: [] }));
    }

    process.stderr.write(`[mcp] fillDetails(${attempt}): hasDetails=${formInfo.hasDetails} inputs=${JSON.stringify(formInfo.inputPlaceholders)}\n`);

    if (!formInfo.hasDetails) {
      await pg.waitForTimeout(2000);
      continue;
    }

    process.stderr.write(`[mcp] 偵測到詳細資料表單，用 Playwright fill() 填寫...\n`);

    const filled = {};

    if (isLocator) {
      // frameLocator mode — use locator API
      const firstNameInput = authFrame.locator('input[id*="firstName" i], input[id*="first_name" i], input[placeholder*="名字" i]');
      if (await firstNameInput.count() > 0) { await firstNameInput.first().fill(formData.firstName || ''); filled.firstName = true; }

      const lastNameInput = authFrame.locator('input[id*="lastName" i], input[id*="last_name" i], input[placeholder*="姓" i]');
      if (await lastNameInput.count() > 0) { await lastNameInput.first().fill(formData.lastName || ''); filled.lastName = true; }

      const emailInput = authFrame.locator('input[id*="email" i], input[type="email"], input[placeholder*="郵件" i]');
      if (await emailInput.count() > 0) { await emailInput.first().fill(formData.email || ''); filled.email = true; }
    } else {
      // frame mode — use $$ API
      const inputs = await authFrame.$$('input');
      for (const inp of inputs) {
        if (!(await inp.isVisible().catch(() => false))) continue;
        const ph = (await inp.getAttribute('placeholder').catch(() => '') || '').toLowerCase();
        const id = (await inp.getAttribute('id').catch(() => '') || '').toLowerCase();

        if (ph.includes('名字') || id.includes('firstname') || id.includes('first_name')) {
          await inp.fill(formData.firstName || '');
          filled.firstName = true;
        } else if (ph.includes('姓氏') || ph.includes('姓') || id.includes('lastname') || id.includes('last_name')) {
          await inp.fill(formData.lastName || '');
          filled.lastName = true;
        } else if (ph.includes('郵件') || ph.includes('email') || id.includes('email')) {
          await inp.fill(formData.email || '');
          filled.email = true;
        }
      }
    }

    process.stderr.write(`[mcp] 已填寫: ${JSON.stringify(filled)}\n`);

    // Click 完成訂位 button in iframe
    await pg.waitForTimeout(800);

    if (isLocator) {
      const btn = authFrame.locator('button:has-text("完成訂位"), button:has-text("Complete"), button:has-text("confirm")');
      if (await btn.count() > 0) {
        await btn.first().click({ timeout: 5000 }).catch(async () => { await btn.first().click({ force: true }); });
        process.stderr.write(`[mcp] 已點擊 iframe 內完成按鈕 (frameLocator)\n`);
      }
    } else {
      const btns = await authFrame.$$('button');
      for (const b of btns) {
        if (!(await b.isVisible().catch(() => false))) continue;
        const text = await b.textContent().catch(() => '');
        if (text.includes('完成訂位') || text.includes('Complete') || text.includes('confirm')) {
          await b.click({ timeout: 5000 }).catch(() => b.click({ force: true }));
          process.stderr.write(`[mcp] 已點擊 iframe 內「${text.trim()}\n`);
          break;
        }
      }
    }

    await pg.waitForTimeout(5000);
    return true;
  }

  process.stderr.write(`[mcp] fillDetails: 重試耗盡，未找到詳細資料表單\n`);
  return false;
}

// ── Complete Booking After Verification ──
// Called via the complete_booking MCP tool after the user finishes email/phone verification.
// Uses the saved page reference from bookOpenTable to re-fill form and submit.

async function completeBookingAfterVerification(code) {
  if (!pendingBooking) {
    return { success: false, error: "沒有待驗證的訂位。請先使用 book_opentable 開始訂位流程。" };
  }

  const { page, formData, fillBookingForm, clickSubmitButton,
          restaurant, date, time, partySize, slotTime, searchUrl } = pendingBooking;

  try {
    const curUrl = page.url();
    process.stderr.write(`[mcp] 驗證後繼續訂位，目前頁面: ${curUrl}\n`);

    // If a verification code was provided, enter it in the auth iframe
    if (code) {
      process.stderr.write(`[mcp] 輸入驗證碼: ${code}\n`);
      const found = await findAuthFrame(page);
      const authFrame = found?.frame;
      const isLocator = found?.type === 'frameLocator';
      if (authFrame) {
        // Find code input — try multiple selectors
        let codeFilled = false;
        const codeSelectors = [
          '#emailVerificationCode',
          'input[data-test*="code" i]', 'input[id*="code" i]',
          'input[id*="otp" i]', 'input[id*="pin" i]',
          'input[data-test*="verification" i]',
        ];

        if (isLocator) {
          // frameLocator mode
          for (const sel of codeSelectors) {
            const inp = authFrame.locator(sel);
            if (await inp.count() > 0 && await inp.first().isVisible().catch(() => false)) {
              await inp.first().fill(code);
              codeFilled = true;
              process.stderr.write(`[mcp] 已填入驗證碼 (frameLocator: ${sel})\n`);
              break;
            }
          }
        } else {
          // frame mode
          for (const sel of codeSelectors) {
            const inp = await authFrame.$(sel);
            if (inp && await inp.isVisible().catch(() => false)) {
              await inp.fill(code);
              codeFilled = true;
              process.stderr.write(`[mcp] 已填入驗證碼 (${sel})\n`);
              break;
            }
          }
          if (!codeFilled) {
            // Fallback: any visible input that isn't phone/recaptcha
            const allInputs = await authFrame.$$('input');
            for (const inp of allInputs) {
              const id = await inp.getAttribute('id').catch(() => '');
              if (id === 'phoneNumber' || id === 'phoneNumberCountryCode' || id?.startsWith('g-recaptcha')) continue;
              const type = await inp.getAttribute('type').catch(() => '');
              if (type === 'hidden' || type === 'checkbox' || type === 'select-one') continue;
              if (await inp.isVisible().catch(() => false)) {
                await inp.fill(code);
                codeFilled = true;
                process.stderr.write(`[mcp] 已填入驗證碼 (fallback: id=${id})\n`);
                break;
              }
            }
          }
        }

        if (codeFilled) {
          // Click verify/continue button
          if (isLocator) {
            const btn = authFrame.locator('button:has-text("驗證"), button:has-text("確認"), button:has-text("繼續"), button:has-text("verify"), button:has-text("Continue")');
            if (await btn.count() > 0) {
              await btn.first().click({ timeout: 5000 }).catch(async () => { await btn.first().click({ force: true }); });
              process.stderr.write(`[mcp] 已點擊驗證按鈕 (frameLocator)\n`);
            }
          } else {
            const btns = await authFrame.$$('button');
            for (const b of btns) {
              if (!(await b.isVisible().catch(() => false))) continue;
              const text = await b.textContent().catch(() => '');
              if (text.includes('驗證') || text.includes('確認') || text.includes('繼續') ||
                  text.includes('verify') || text.includes('Verify') || text.includes('Continue')) {
                await b.click({ timeout: 5000 }).catch(() => b.click({ force: true }));
                process.stderr.write(`[mcp] 已點擊: ${text.trim()}\n`);
                break;
              }
            }
          }
          await page.waitForTimeout(8000);

          // After verification code accepted, check for "確認你的詳細資料" form
          process.stderr.write(`[mcp] 驗證碼送出後等待 8s，現在檢查 details form...\n`);
          const detailsResult = await fillDetailsInAuthIframe(page, formData);
          process.stderr.write(`[mcp] fillDetailsInAuthIframe 結果: ${detailsResult}\n`);
        } else {
          process.stderr.write(`[mcp] 找不到驗證碼輸入欄位\n`);
          if (!isLocator) {
            const dbg = await authFrame.evaluate(() => {
              const inputs = [...document.querySelectorAll('input')].map(i => ({ id: i.id, type: i.type, visible: i.offsetParent !== null }));
              return { inputs, text: (document.body?.innerText || '').slice(0, 500) };
            }).catch(() => ({}));
            process.stderr.write(`[mcp] iframe 狀態: ${JSON.stringify(dbg)}\n`);
          }
        }
      } else {
        process.stderr.write(`[mcp] 找不到驗證 iframe\n`);
      }
    }

    // Check for success
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(2000);
      const url = page.url();
      const pageText = await page.evaluate(() => (document.body?.innerText || "").slice(0, 3000));

      const isSuccess = pageText.includes("感謝") || pageText.includes("成功") ||
                        pageText.includes("confirmed") || pageText.includes("Confirmed") ||
                        pageText.includes("訂位完成") || pageText.includes("reservation") ||
                        url.includes("/booking/confirmation") || url.includes("/confirmation");
      if (isSuccess) {
        pendingBooking = null;
        await page.close();
        return {
          success: true,
          slotSelected: slotTime,
          verificationCompleted: true,
          message: `訂位成功！${restaurant} ${date} ${time} ${partySize}位`,
          finalUrl: url,
          searchUrl,
        };
      }

      // Check if auth iframe still needs code
      const authFrame = page.frames().find(f => f.url().includes('/authenticate/'));
      if (authFrame) {
        const frameText = await authFrame.evaluate(() => (document.body?.innerText || '').slice(0, 500)).catch(() => '');
        const needsCode = frameText.includes('驗證碼') || frameText.includes('確認碼') || frameText.includes('verification');
        if (needsCode && i >= 4) {
          // Code seems wrong or expired
          return {
            success: false,
            needsVerification: true,
            needsCode: true,
            message: "驗證碼似乎不正確或已過期，請重新確認驗證碼。",
            searchUrl,
          };
        }
      }
    }

    // Final check
    const finalUrl = page.url();
    const finalText = await page.evaluate(() => (document.body?.innerText || "").slice(0, 2000));
    const success = finalUrl.includes("/confirmation") || finalText.includes("感謝") ||
                    finalText.includes("成功") || finalText.includes("confirmed") || finalText.includes("訂位完成");

    if (success) {
      pendingBooking = null;
      await page.close();
      return {
        success: true,
        slotSelected: slotTime,
        verificationCompleted: true,
        message: `訂位成功！${restaurant} ${date} ${time} ${partySize}位`,
        finalUrl,
        searchUrl,
      };
    }

    // Not successful — keep page open, keep pendingBooking for retry
    return {
      success: false,
      message: "驗證後訂位未完成，請確認瀏覽器中的狀態。你可以再次提供驗證碼重試。",
      finalUrl,
      searchUrl,
    };
  } catch (err) {
    pendingBooking = null;
    try { await page.close(); } catch {}
    return {
      success: false,
      error: String(err?.message || err),
      searchUrl,
    };
  }
}
