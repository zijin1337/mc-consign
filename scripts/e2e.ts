/**
 * 端到端冒烟测试：用本机 Edge 无头跑一遍 注册 → 发布 → 审核 → 列表/详情 → 后台操作。
 * 前置：pnpm dev 已在 3000 端口运行，且 .env 里的 DATABASE_URL / SESSION_SECRET 与它一致。
 * 脚本直连数据库：把刚发出的验证码换成已知值（服务端只存 HMAC），以及模拟「置顶到期」这类没法等的时间条件。
 * 用法：pnpm test:e2e
 */
import "dotenv/config";
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { Pool } from "pg";
import { PAGE_WORD_SET } from "../src/lib/eyebrow";
import { hashPassword } from "../src/lib/password";
import sharp from "sharp";

const BASE = process.env.E2E_BASE || "http://localhost:3000";
const TEST_CODE = "123456";
const pg = new Pool({ connectionString: process.env.DATABASE_URL });
const SHOT_DIR = ".local/e2e";
const STAMP = Date.now().toString().slice(-6);

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail && !ok ? ` — ${detail}` : ""}`);
}

/** 与 src/lib/codes.ts 同一种哈希 */
function hashCode(code: string) {
  return createHmac("sha256", process.env.SESSION_SECRET || "dev").update(code).digest("hex");
}

/** 把服务端刚发给 email 的最新一条验证码换成已知值，返回该值 */
async function plantCode(email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const r = await pg.query(
      `update verification_codes set code_hash = $1
       where id = (select id from verification_codes where target = $2 and used_at is null order by created_at desc limit 1)`,
      [hashCode(TEST_CODE), email],
    );
    if (r.rowCount === 1) return TEST_CODE;
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`数据库里找不到发给 ${email} 的验证码记录`);
}

async function testImage(label: string, color: { r: number; g: number; b: number }): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750"><text x="60" y="400" font-size="90" fill="#fff">${label}</text></svg>`;
  return sharp({ create: { width: 1200, height: 750, channels: 3, background: color } })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();
}

async function register(page: Page, username: string, qq: string, phone: string) {
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', "password123");
  await page.fill('input[name="qq"]', qq);
  await page.getByRole("button", { name: "发送验证码" }).click();
  await page.getByText("验证码已发送到").waitFor({ timeout: 20000 });
  const code = await plantCode(`${qq}@qq.com`);
  await page.fill('input[name="code"]', code);
  await page.fill('input[name="phone"]', phone);
  await page.check('input[name="agree"]');
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 30000 });
}

async function login(page: Page, account: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="account"]', account);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL((u) => u.pathname !== "/login", { timeout: 30000 });
}

async function main() {
  mkdirSync(SHOT_DIR, { recursive: true });
  // 每次都从「超管仍用初始口令」的状态开始，顺带测强制改密；跑完恢复成默认口令且不再强制
  const ADMIN_DEFAULT = "admin12345";
  const ADMIN_NEW = `E2e-${STAMP}-Pass!`;
  await pg.query("update users set password_hash = $1, password_changed_at = null where username = 'admin'", [await hashPassword(ADMIN_DEFAULT)]);
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  // 注册 / 验证码按 IP 限流（每小时 10 次 / 20 条）。反复跑 e2e 会撞上，每轮用一个随机的内网 IP 伪装成不同客户端。
  const fakeIp = `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  const newContext = (opts: Parameters<typeof browser.newContext>[0] = {}) =>
    browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts, extraHTTPHeaders: { "x-forwarded-for": fakeIp, ...(opts.extraHTTPHeaders ?? {}) } });
  const seller = await (await newContext()).newPage();
  const admin = await (await newContext()).newPage();
  const buyer = await (await newContext()).newPage();
  const guest = await (await newContext()).newPage();
  // 不可逆操作前有 confirm 弹窗：全部接受并记下文案，后面断言确实弹了
  const dialogs: string[] = [];
  const acceptDialogs = (p: Page) =>
    p.on("dialog", (d) => {
      dialogs.push(d.message());
      void d.accept();
    });
  for (const p of [seller, admin, buyer, guest]) {
    p.setDefaultTimeout(60000);
    acceptDialogs(p);
  }

  const sellerName = `测试卖家${STAMP}`;
  const sellerQq = `3${STAMP}`;
  const buyerName = `买家${STAMP}`;
  const buyerQq = `4${STAMP}`;
  const ign = `Baozi${STAMP}`;

  // ---- 注册卖家 ----
  await register(seller, sellerName, sellerQq, `139${STAMP}01`);
  check("卖家注册并自动登录", (await seller.textContent("header"))?.includes(sellerName) ?? false);

  // ---- 违禁词拦截 ----
  await seller.goto(`${BASE}/sell/new`);
  const fillListing = async (page: Page, note: string, ign: string) => {
    await page.fill('input[name="attr_level"]', "120");
    await page.selectOption('select[name="attr_rank"]', "MVP+");
    await page.fill('input[name="attr_ign"]', ign);
    await page.check('input[name="attr_capes"][value="官方"]');
    await page.check('input[name="attr_canRebindEmail"][value="true"]');
    await page.check('input[name="attr_hasBanRecord"][value="false"]');
    await page.fill('input[name="attr_regYear"]', "2019");
    await page.fill('input[name="price"]', "5000");
    await page.selectOption('select[name="source"]', "self_bought");
    await page.check('input[name="feeMode"][value="all_in"]');
    await page.check('input[name="hasTransactionId"][value="true"]');
    await page.fill('textarea[name="note"]', note);
    await page.setInputFiles('input[type="file"]', [
      { name: "shot1.png", mimeType: "image/png", buffer: await testImage("Hypixel Lobby", { r: 40, g: 90, b: 160 }) },
      { name: "shot2.png", mimeType: "image/png", buffer: await testImage("Profile 120", { r: 120, g: 60, b: 140 }) },
    ]);
    // 选中即上传，等两张都到 done 再提交
    await page.waitForFunction(() => document.querySelectorAll('[data-upload-state="done"]').length >= 2, undefined, { timeout: 60000 });
  };
  await fillListing(seller, "这是黑 卡号", "BadIgn");
  check("第一张截图标为封面", (await seller.getByText("封面", { exact: true }).count()) >= 1);
  // 超过 5MB 的文件在浏览器里就拦下，不发请求
  await seller.setInputFiles('input[type="file"]', [{ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1024, 1) }]);
  await seller.locator('[data-upload-state="error"]').first().waitFor({ timeout: 15000 });
  check("超过 5MB 的图片在浏览器端直接拦下", ((await seller.locator('[data-upload-state="error"]').first().textContent()) ?? "").includes("5MB"));
  await seller.getByRole("button", { name: "提交审核" }).click();
  await seller.getByText("违禁词").waitFor();
  check("违禁词「黑 卡」被拦截", true);
  check("校验失败后已上传的截图仍在", (await seller.locator('[data-upload-state="done"]').count()) === 2);
  const outbox = await pg.query("select count(*)::int as n from mail_outbox where sent_at is null and attempts >= 5");
  check("邮件发件箱没有卡死的信", outbox.rows[0].n === 0);

  // ---- 正常发布 ----
  await seller.goto(`${BASE}/sell/new`);
  await fillListing(seller, "自购正版，可提供交易 ID，随时验号", ign);
  await seller.getByRole("button", { name: "提交审核" }).click();
  await seller.waitForURL((u) => u.pathname === "/me" && u.searchParams.has("submitted"));
  // /me 的商品表在页内 <Suspense> 里流式到达，先等到新账号出现再读整页文本，否则偶发读到只有页头的半页
  await seller.locator("main").getByText(ign).first().waitFor();
  const meText = (await seller.textContent("main")) ?? "";
  check("发布后进入待审核", meText.includes("待审核") && meText.includes(ign));
  const listingId = Number(new URL(seller.url()).searchParams.get("submitted"));

  // ---- 游客看不到未审核商品（游客卡上没有正版 ID，按卡片的 data-id 判定） ----
  await guest.goto(`${BASE}/`);
  await guest.locator(".listing-card").first().waitFor({ timeout: 20000 }).catch(() => {});
  check("游客首页不显示待审核商品", (await guest.locator(`.listing-card[data-id="${listingId}"]`).count()) === 0);

  // ---- 超管审核 ----
  await login(admin, "admin", ADMIN_DEFAULT);
  await admin.goto(`${BASE}/admin/review`);
  check("超管初始口令被强制跳到改密页", new URL(admin.url()).pathname === "/me/password", admin.url());
  await admin.fill('input[name="current"]', ADMIN_DEFAULT);
  await admin.fill('input[name="password"]', ADMIN_NEW);
  await admin.fill('input[name="confirm"]', ADMIN_NEW);
  await admin.getByRole("button", { name: "保存新密码" }).click();
  await admin.waitForURL((u) => u.pathname === "/me");
  await admin.goto(`${BASE}/admin/review`);
  check("改密后可正常进入后台", new URL(admin.url()).pathname === "/admin/review", admin.url());
  const reviewText = (await admin.textContent("main")) ?? "";
  check("审核队列显示商品与卖家联系方式", reviewText.includes(ign) && reviewText.includes(`QQ ${sellerQq}`));
  await admin.screenshot({ path: `${SHOT_DIR}/admin-review.png`, fullPage: true });
  // 不填原因点「拒绝」不会提交，商品仍留在队列里
  const reviewForm = admin.locator(`form:has(input[name="id"][value="${listingId}"])`);
  await reviewForm.locator('button[value="reject"]').click();
  await admin.waitForTimeout(800);
  check("拒绝审核不填原因不会提交", (await reviewForm.count()) === 1 && new URL(admin.url()).pathname === "/admin/review");
  await admin.locator(`form:has(input[name="id"][value="${listingId}"]) button[value="approve"]`).click();
  // 页面本来就空闲时 networkidle 会立刻返回，要等这一条从审核队列消失才算动作完成
  await reviewForm.waitFor({ state: "detached" });
  await admin.goto(`${BASE}/admin/listings?q=${listingId}`);
  // 只看该商品所在行：页面上的状态下拉里本来就有「在售」两个字，看整页会误判
  check("审核通过后状态为在售", ((await admin.locator("tbody tr", { hasText: ign }).textContent()) ?? "").includes("在售"));

  // ---- 通知：顶栏角标、点开即标已读并跳转 ----
  await seller.goto(`${BASE}/`);
  const bell = seller.locator('header a[href="/me/notifications"]');
  const unreadBefore = Number(await bell.getAttribute("data-unread"));
  check("顶栏显示未读消息角标", unreadBefore >= 1 && ((await bell.textContent()) ?? "").includes(String(unreadBefore)), `unread=${unreadBefore}`);
  await seller.goto(`${BASE}/me/notifications`);
  await seller.locator('a[href^="/me/notifications/"]').first().click();
  await seller.waitForURL((u) => u.pathname === `/listings/${listingId}`);
  const unreadAfter = Number(await seller.locator('header a[href="/me/notifications"]').getAttribute("data-unread"));
  check("点开通知后跳到目标页并标为已读", unreadAfter === unreadBefore - 1, `before=${unreadBefore} after=${unreadAfter}`);

  // ---- 游客首页：只看氛围与概览（会员类型、标价、通用人偶），看不到任何能识别账号的信息；详情需登录 ----
  await guest.goto(`${BASE}/`);
  // 首页是流式输出：先等真卡片到达，再读文本，否则读到的是骨架屏
  const guestCard = guest.locator(`.listing-card[data-id="${listingId}"]`);
  await guestCard.waitFor({ timeout: 20000 });
  const homeText = (await guest.textContent("main")) ?? "";
  const guestCardText = (await guestCard.textContent()) ?? "";
  check("游客首页显示已上架商品的会员类型与标价", guestCardText.includes("MVP+") && guestCardText.includes("中介费"));
  check("游客首页不出现正版 ID、皮肤与头像", !homeText.includes(ign) && (await guest.locator('main img[src^="/skin/"]').count()) === 0);
  // 游客卡：会员色底纹封面（无截图、无头像），整卡指向登录并带回跳
  const guestHref = await guestCard.getAttribute("href");
  check(
    "游客卡用会员色底纹封面，入口指向登录并带回跳",
    (await guestCard.locator(".listing-cover.has-image, .listing-cover.has-face").count()) === 0 && guestHref === `/login?next=${encodeURIComponent(`/listings/${listingId}`)}`,
    guestHref ?? "",
  );
  const navCur = guest.locator('nav[aria-label="主要导航"] a[aria-current="page"]');
  check(
    "主导航当前项标 aria-current 且下划线不是荧光绿",
    (await navCur.count()) === 1 && (await navCur.getAttribute("href")) === "/" && (await navCur.evaluate((a) => getComputedStyle(a, "::after").backgroundColor)) !== "rgb(200, 255, 84)",
  );
  /** eyebrow 首词都在词表里；荧光绿文字只出现在允许的元素上（hero 点缀、官方数据一致 tag、状态芯片） */
  const designGuards = async (page: Page, label: string) => {
    const words = await page.locator(".eyebrow").evaluateAll((es) => es.map((e) => (e.textContent || "").split("/")[0].trim()));
    check(`${label}：eyebrow 首词都在词表内`, words.length > 0 && words.every((w) => PAGE_WORD_SET.has(w)), words.join(","));
    const leaks = await page.evaluate(() => {
      // hero 点缀、官方数据一致 tag、状态芯片、成功提示图标、Hypixel 官方会员色、导航扫线（A 类动作）、VIP 封面色（C 类：忠实于 Hypixel §a 绿）
      const ALLOW = [".hero-in", ".tag", ".status-ok", '[role="status"]', ".hx-rank", ".cover-badge", "button", ".link-pending", ".cover-lime"];
      const bad: string[] = [];
      for (const el of Array.from(document.querySelectorAll("main *"))) {
        if (getComputedStyle(el).color !== "rgb(200, 255, 84)") continue;
        if (ALLOW.some((sel) => el.closest(sel))) continue;
        bad.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}:${(el.textContent || "").trim().slice(0, 20)}`);
      }
      return bad;
    });
    check(`${label}：荧光绿文字只在白名单元素上`, leaks.length === 0, leaks.join(" | "));
  };
  await designGuards(guest, "首页");
  await guest.screenshot({ path: `${SHOT_DIR}/home-guest.png`, fullPage: true });
  await guest.goto(`${BASE}/listings/${listingId}`);
  check("游客点详情跳登录", new URL(guest.url()).pathname === "/login");
  const linkStyles = await guest.locator("main a.link").evaluateAll((as) => as.map((a) => { const s = getComputedStyle(a); return [s.textDecorationLine, s.color]; }));
  check("登录页正文链接有下划线且不是荧光绿", linkStyles.length >= 2 && linkStyles.every(([d, c]) => d.includes("underline") && c !== "rgb(200, 255, 84)"), JSON.stringify(linkStyles));

  // ---- 买家注册、看详情 ----
  await register(buyer, buyerName, buyerQq, `139${STAMP}02`);
  await buyer.goto(`${BASE}/listings/${listingId}`);
  const detail = (await buyer.textContent("main")) ?? "";
  const masked = `${Array.from(sellerName).slice(0, 2).join("")}***${Array.from(sellerName).slice(-2).join("")}`;
  check("详情页卖家用户名打码", detail.includes(masked) && !detail.includes(sellerName), `期待 ${masked}`);
  check("详情页不出现卖家联系方式", !detail.includes(`QQ ${sellerQq}`));
  check("详情页显示属性与预估费用", detail.includes("Hypixel 等级") && detail.includes("买家实付") && detail.includes("能否换绑邮箱"));
  await buyer.screenshot({ path: `${SHOT_DIR}/detail-buyer.png`, fullPage: true });
  await designGuards(buyer, "详情页");
  const coverSrc = await buyer.locator("main .listing-cover.has-image img").first().getAttribute("src");
  const imgResp = await buyer.request.get(`${BASE}${coverSrc}`);
  check("截图可访问且为 jpeg", imgResp.ok() && (imgResp.headers()["content-type"] ?? "").includes("image/jpeg"), coverSrc ?? "");

  // ---- 交易流程：买家下单（选中介 admin）→ 中介开始 → 完成结算 → 售后 ----
  const maskedBuyer = `${Array.from(buyerName).slice(0, 2).join("")}***${Array.from(buyerName).slice(-2).join("")}`;
  await buyer.goto(`${BASE}/listings/${listingId}/buy`);
  await buyer.selectOption('select[name="agentId"]', { label: "admin" });
  await buyer.fill('textarea[name="message"]', "E2E 想要这个号，今晚方便验号");
  await buyer.getByRole("button", { name: "提交意向单" }).click();
  await buyer.waitForURL((u) => /^\/orders\/\d+$/.test(u.pathname) && u.searchParams.has("created"));
  const orderId = Number(new URL(buyer.url()).pathname.split("/").pop());
  const orderText = (await buyer.textContent("main")) ?? "";
  check("买家下单后进入待联系", orderText.includes("待联系") && orderText.includes("admin"));
  check("买家看不到卖家 QQ", !orderText.includes(sellerQq));
  await buyer.goto(`${BASE}/listings/${listingId}/buy`);
  check("重复下单跳回已有意向单", new URL(buyer.url()).pathname === `/orders/${orderId}`, buyer.url());
  await buyer.goto(`${BASE}/listings/${listingId}`);
  check("详情页显示已在排队", ((await buyer.textContent("main")) ?? "").includes("你已在排队"));
  await seller.goto(`${BASE}/orders`);
  // /orders 的表格在页内 <Suspense> 里流式到达，先等买家名出现再读整页
  await seller.locator("main").getByText(maskedBuyer).first().waitFor({ timeout: 15000 }).catch(() => {});
  const sellerOrders = (await seller.textContent("main")) ?? "";
  check("卖家在意向单列表看到买家（打码）", sellerOrders.includes(maskedBuyer) && !sellerOrders.includes(buyerName), `期待 ${maskedBuyer}`);

  await admin.goto(`${BASE}/agent`);
  // 中介台列表同样在 <Suspense> 里，先等该单的账号名出现
  await admin.locator("main").getByText(ign).first().waitFor({ timeout: 15000 }).catch(() => {});
  const agentText = (await admin.textContent("main")) ?? "";
  check("中介台待联系显示该单", agentText.includes(ign) && agentText.includes(buyerName));
  await admin.goto(`${BASE}/orders/${orderId}`);
  const agentView = (await admin.textContent("main")) ?? "";
  check("中介能看到双方 QQ", agentView.includes(buyerQq) && agentView.includes(sellerQq));
  await admin.screenshot({ path: `${SHOT_DIR}/order-agent.png`, fullPage: true });
  await admin.getByRole("button", { name: "开始交易" }).click();
  await admin.getByText("交易进行中").waitFor();
  check("开始交易后状态为交易中", ((await admin.textContent("main")) ?? "").includes("交易进行中"));
  await guest.goto(`${BASE}/`);
  check("首页卡片显示交易中角标", ((await guest.textContent("main")) ?? "").includes("交易中"));

  await admin.fill('input[name="finalPrice"]', "4800");
  await admin.getByRole("button", { name: "确认完成，结算信用分" }).click();
  await admin.waitForURL((u) => u.searchParams.has("done"));
  check("完成交易前有确认弹窗", dialogs.some((m) => m.includes("不可撤销")));
  const doneText = (await admin.textContent("main")) ?? "";
  check("完成后显示成交金额与质保", doneText.includes("¥4,800") && doneText.includes("质保至"));
  check("中介费按阶梯 5% 算出 240", doneText.includes("¥240"));
  await admin.screenshot({ path: `${SHOT_DIR}/order-done.png`, fullPage: true });
  await buyer.goto(`${BASE}/me/credit`);
  const buyerCredit = (await buyer.textContent("main")) ?? "";
  check("买家信用分 +480 到 580", buyerCredit.includes("+480") && buyerCredit.includes("580"));
  await seller.goto(`${BASE}/me/credit`);
  check("卖家信用分 +480", ((await seller.textContent("main")) ?? "").includes("+480"));
  await guest.goto(`${BASE}/sold`);
  const soldText = (await guest.textContent("main")) ?? "";
  check("已完成区公开成交记录与成交价", soldText.includes(ign) && soldText.includes("¥4,800") && soldText.includes("admin"));
  await guest.goto(`${BASE}/`);
  await guest.locator(".listing-card").first().waitFor({ timeout: 20000 }).catch(() => {});
  check("已售账号从首页消失", (await guest.locator(`.listing-card[data-id="${listingId}"]`).count()) === 0);

  await buyer.goto(`${BASE}/orders/${orderId}`);
  await buyer.fill('textarea[name="description"]', "E2E 售后：账号第二天被原主人找回了，请协助处理");
  await buyer.getByRole("button", { name: "申请售后" }).click();
  await buyer.waitForURL((u) => u.searchParams.has("aftersale"));
  check("买家提交售后", ((await buyer.textContent("main")) ?? "").includes("处理中"));
  await admin.goto(`${BASE}/orders/${orderId}`);
  await admin.selectOption('select[name="result"]', "refund");
  await admin.locator('form:has(select[name="result"]) textarea[name="note"]').fill("E2E 已协调卖家全额退款");
  await admin.check('input[name="sellerAtFault"]');
  await admin.getByRole("button", { name: "提交处理结果" }).click();
  await admin.getByText("已解决", { exact: true }).waitFor();
  const resolvedText = (await admin.textContent("main")) ?? "";
  check("售后处理为退款并判卖家责任", resolvedText.includes("结果：退款") && resolvedText.includes("。判定卖家责任"));
  await seller.goto(`${BASE}/me/credit`);
  check("卖家因售后被扣 50 分", ((await seller.textContent("main")) ?? "").includes("-50"));

  // ---- 第二单：平台分派 → 超管分派 → 开始 → 中介取消（买家爽约） ----
  const ign2 = `Cancel${STAMP}`;
  await seller.goto(`${BASE}/sell/new`);
  await fillListing(seller, "第二个号，测试取消流程", ign2);
  await seller.getByRole("button", { name: "提交审核" }).click();
  await seller.waitForURL((u) => u.pathname === "/me" && u.searchParams.has("submitted"));
  const listingId2 = Number(new URL(seller.url()).searchParams.get("submitted"));
  await admin.goto(`${BASE}/admin/review`);
  await admin.locator(`form:has(input[name="id"][value="${listingId2}"]) button[value="approve"]`).click();
  await admin.locator(`form:has(input[name="id"][value="${listingId2}"])`).waitFor({ state: "detached" });
  await buyer.goto(`${BASE}/listings/${listingId2}/buy`);
  await buyer.getByRole("button", { name: "提交意向单" }).click();
  await buyer.waitForURL((u) => /^\/orders\/\d+$/.test(u.pathname) && u.searchParams.has("created"));
  const orderId2 = Number(new URL(buyer.url()).pathname.split("/").pop());
  check("平台分派的单为待分派", ((await buyer.textContent("main")) ?? "").includes("待分派"));
  await admin.goto(`${BASE}/admin/orders?unassigned=1`);
  const assignForm = admin.locator(`form:has(input[name="id"][value="${orderId2}"])`);
  await assignForm.locator('select[name="agentId"]').selectOption({ label: "admin" });
  await assignForm.getByRole("button", { name: "分派" }).click();
  // 这一页只看未分派，分派成功后该行就从列表消失
  await assignForm.waitFor({ state: "detached" });
  await admin.goto(`${BASE}/orders/${orderId2}`);
  check("分派后状态为待联系", ((await admin.textContent("main")) ?? "").includes("待联系"));
  await admin.getByRole("button", { name: "开始交易" }).click();
  await admin.getByText("交易进行中").waitFor();
  await admin.selectOption('select[name="reason"]', "buyer_quit");
  await admin.locator('form:has(select[name="reason"]) textarea[name="note"]').fill("E2E 买家失联");
  await admin.getByRole("button", { name: "取消意向单" }).click();
  await admin.getByText("已取消。原因").waitFor();
  const cancelledText = (await admin.textContent("main")) ?? "";
  check("取消后显示原因", cancelledText.includes("已取消") && cancelledText.includes("买家放弃或失联"));
  check("取消意向单前有确认弹窗且提到爽约扣分", dialogs.some((m) => m.includes("取消") && m.includes("爽约")));
  await guest.goto(`${BASE}/`);
  check(
    "交易中取消后账号恢复在售",
    await guest
      .locator(`.listing-card[data-id="${listingId2}"]`)
      .waitFor({ timeout: 20000 })
      .then(() => true)
      .catch(() => false),
  );
  await admin.goto(`${BASE}/admin/users?q=${buyerQq}`);
  check("买家爽约计 1 次并扣 5 分", ((await admin.textContent("main")) ?? "").includes("575 / 1 / 1"));

  await admin.goto(`${BASE}/admin/reports`);
  const reportText = (await admin.textContent("main")) ?? "";
  // 报表按月汇总，同月多次跑测试会累加，只验证有 admin 的汇总行且不为空
  check("中介报表汇总当月成交", reportText.includes("admin") && !reportText.includes("没有完成的交易") && /合计\s*\d+/.test(reportText.replace(/\s+/g, " ")));
  const month = new Date().toISOString().slice(0, 7);
  const csv = await admin.request.get(`${BASE}/admin/reports/export?month=${month}`);
  const csvBody = await csv.text();
  check("报表 CSV 可导出", csv.ok() && (csv.headers()["content-type"] ?? "").includes("text/csv") && csvBody.includes(`${orderId},`) && csvBody.includes("4800"));
  const csvAsBuyer = await buyer.request.get(`${BASE}/admin/reports/export?month=${month}`);
  check("普通用户不能导出报表", csvAsBuyer.status() === 403 || csvAsBuyer.url().includes("/login"));

  // ---- 后台：公告、信用分、封禁 ----
  await admin.goto(`${BASE}/admin/settings`);
  await admin.fill('textarea[name="announcement"]', `E2E 公告 ${STAMP}`);
  await admin.getByRole("button", { name: "保存配置" }).click();
  await admin.getByText("已保存").waitFor();
  await guest.goto(`${BASE}/`);
  check("公告显示在首页", ((await guest.textContent("body")) ?? "").includes(`E2E 公告 ${STAMP}`));
  await admin.fill('textarea[name="announcement"]', "");
  await admin.getByRole("button", { name: "保存配置" }).click();
  await admin.getByText("已保存").waitFor();

  await admin.goto(`${BASE}/admin/users?q=${sellerQq}`);
  await admin.getByRole("link", { name: sellerName }).click();
  await admin.fill('input[name="delta"]', "30");
  await admin.fill('input[name="reason"]', "E2E 手动加分");
  await admin.getByRole("button", { name: "调整" }).click();
  await admin.getByText("E2E 手动加分").waitFor();
  await seller.goto(`${BASE}/me/credit`);
  const creditText = (await seller.textContent("main")) ?? "";
  // 卖家：100 + 480（成交）- 50（售后）+ 30（手动）= 560
  check("手动加分后卖家可见记录", creditText.includes("+30") && creditText.includes("E2E 手动加分") && creditText.includes("560"));

  await admin.goto(`${BASE}/admin/users?q=${buyerQq}`);
  await admin.getByRole("link", { name: buyerName }).click();
  await admin.fill('textarea[name="reason"]', "E2E 测试封禁");
  await admin.getByRole("button", { name: "封禁", exact: true }).click();
  await admin.getByRole("button", { name: "解除封禁并移出黑名单" }).waitFor();
  check("封禁前有确认弹窗", dialogs.some((m) => m.includes("封禁") && m.includes("黑名单")));
  await buyer.goto(`${BASE}/me`);
  check("被封禁用户跳封禁页", new URL(buyer.url()).pathname === "/banned" || new URL(buyer.url()).pathname === "/login");

  // 日志页每页 50 条，按动作筛选逐个确认，不受总量影响
  const missingActions: string[] = [];
  for (const a of ["review_approve", "view_contact", "credit_adjust", "ban_user", "start_order", "complete_order", "cancel_order", "assign_order", "aftersale_resolve"]) {
    await admin.goto(`${BASE}/admin/logs?action=${a}`);
    if (!((await admin.locator("tbody").textContent().catch(() => "")) ?? "").includes(a)) missingActions.push(a);
  }
  check("日志记录了审核、联系方式、加分、封禁、订单全流程", missingActions.length === 0, `缺少 ${missingActions.join(", ")}`);

  // ---- 卖家下架 / 重新上架 ----
  await seller.goto(`${BASE}/me`);
  await seller.waitForLoadState("networkidle");
  const thumbs = await seller.$$eval('tbody img:not([src^="/skin/"])', (imgs) => imgs.map((i) => (i as HTMLImageElement).naturalWidth));
  check("我的商品列表显示封面缩略图", thumbs.length > 0 && thumbs.every((w) => w > 0), JSON.stringify(thumbs));
  // 第一个号已售出，用第二个号（取消后恢复在售）测下架 / 重新上架
  const row = seller.locator("tbody tr", { hasText: ign2 });
  await row.locator('button:has-text("下架")').click();
  await row.getByText("已下架", { exact: true }).waitFor({ timeout: 20000 }).catch(() => {});
  check("卖家下架", (await row.textContent())?.includes("已下架") ?? false, await row.textContent() ?? "");
  check("卖家下架前有确认弹窗", dialogs.some((m) => m.includes("下架")));
  await row.locator('button:has-text("重新上架")').click();
  await row.getByText("在售", { exact: true }).waitFor({ timeout: 20000 }).catch(() => {});
  check("内容未改重新上架直接在售", (await row.textContent())?.includes("在售") ?? false, await row.textContent() ?? "");

  // ---- 置顶栏：超管按时长置顶 → 首页置顶栏 → 到期自动撤下 → 取消置顶 ----
  await admin.goto(`${BASE}/admin/listings?q=${listingId2}`);
  const pinRow = admin.locator("tbody tr", { hasText: ign2 });
  await pinRow.locator('select[name="amount"]').selectOption("3");
  await pinRow.getByRole("button", { name: "置顶", exact: true }).click();
  await pinRow.getByText("置顶至").waitFor();
  check("后台显示置顶截止时间与延长 / 取消按钮", (await pinRow.textContent())?.includes("延长") ?? false);
  await guest.goto(`${BASE}/`);
  // 首页走 (home)/loading.tsx 流式输出，置顶栏与网格晚于页头到达；先等置顶栏再读整页文本
  await guest.locator('section[aria-label="置顶推荐"]').waitFor({ timeout: 15000 }).catch(() => {});
  const homePinned = (await guest.textContent("main")) ?? "";
  const occurrences = await guest.locator(`[data-id="${listingId2}"]`).count();
  // 置顶栏的存在用结构判定（section[aria-label]），不依赖 eyebrow 文案
  const pinnedStripCount = (p: Page) => p.locator('section[aria-label="置顶推荐"]').count();
  check(
    "首页出现置顶栏且账号不在网格里重复",
    (await pinnedStripCount(guest)) === 1 && homePinned.includes("其中 1 个置顶") && occurrences === 1 && (await guest.locator(`.pinned-card[data-id="${listingId2}"]`).count()) === 1,
    `出现 ${occurrences} 次`,
  );
  check("游客看到的置顶卡没有正版 ID 与头像", !homePinned.includes(ign2) && (await guest.locator(".pinned-card img.account-face").count()) === 0);
  // 登录后置顶卡带像素头像
  await seller.goto(`${BASE}/`);
  await seller.locator(`.pinned-card[data-id="${listingId2}"]`).waitFor({ timeout: 15000 }).catch(() => {});
  check("登录后置顶卡带像素头像", (await seller.locator(".pinned-card img.account-face").count()) === 1);
  await guest.waitForTimeout(900); // 等 hero 入场动画结束再截图
  await guest.screenshot({ path: `${SHOT_DIR}/home-pinned.png`, fullPage: true });
  await guest.goto(`${BASE}/?rank=VIP`);
  check("筛选不匹配时置顶栏跟着隐藏", (await pinnedStripCount(guest)) === 0);
  await seller.goto(`${BASE}/me/notifications`);
  check("卖家收到置顶通知", ((await seller.textContent("main")) ?? "").includes("已被置顶"));
  await seller.getByRole("button", { name: "全部标为已读" }).click();
  await seller
    .waitForFunction(() => document.querySelector('header a[href="/me/notifications"]')?.getAttribute("data-unread") === "0", undefined, { timeout: 15000 })
    .catch(() => {});
  check("全部标为已读后顶栏角标清零", (await seller.locator('header a[href="/me/notifications"]').getAttribute("data-unread")) === "0");
  await admin.goto(`${BASE}/admin/listings?pinned=1`);
  check("后台「只看置顶中」筛选命中", ((await admin.textContent("main")) ?? "").includes(ign2));
  await admin.goto(`${BASE}/admin`);
  // 后台段有 loading.tsx，概览统计块流式到达，先等到「置顶中」再读整页
  await admin.locator("main").getByText("置顶中").first().waitFor({ timeout: 15000 }).catch(() => {});
  check("后台概览显示置顶中数量", /置顶中/.test((await admin.textContent("main")) ?? ""));
  await pg.query("update listings set pinned_until = now() - interval '1 minute' where id = $1", [listingId2]);
  await guest.goto(`${BASE}/`);
  await guest.locator(".listing-card").first().waitFor({ timeout: 20000 }).catch(() => {});
  check("到期后置顶栏自动消失，账号回到网格", (await pinnedStripCount(guest)) === 0 && (await guest.locator(`.listing-card[data-id="${listingId2}"]`).count()) === 1);
  await admin.goto(`${BASE}/admin/listings?q=${listingId2}`);
  await pinRow.locator('select[name="amount"]').selectOption("1");
  await pinRow.getByRole("button", { name: "置顶", exact: true }).click();
  await pinRow.getByText("置顶至").waitFor();
  await pinRow.getByRole("button", { name: "取消置顶" }).click();
  await pinRow.getByText("置顶至").waitFor({ state: "detached" });
  await guest.goto(`${BASE}/`);
  check("取消置顶后置顶栏消失", (await pinnedStripCount(guest)) === 0);
  await admin.goto(`${BASE}/admin/logs?action=set_pinned`);
  // 后台段有 loading.tsx，日志表流式到达，先等到有行再读整页文本
  await admin.locator("main tbody tr").first().waitFor({ timeout: 15000 }).catch(() => {});
  check("置顶与取消都留痕", (((await admin.textContent("main")) ?? "").match(/set_pinned/g) ?? []).length >= 3);

  // ---- Hypixel 官方数据（模拟模式：名字与皮肤走 Mojang，战绩为随机生成）----
  const NOTCH = "069a79f444e94726a5befca90e38aaf5";
  await seller.goto(`${BASE}/sell/new`);
  await seller.fill('input[name="attr_ign"]', "notch");
  await seller.getByRole("button", { name: "从 Hypixel 拉取" }).click();
  await seller.getByText("已填入").waitFor({ timeout: 60000 });
  const filledLevel = await seller.inputValue('input[name="attr_level"]');
  const filledIgn = await seller.inputValue('input[name="attr_ign"]');
  check("表单一键拉取填入等级并修正 ID 大小写", /^\d+$/.test(filledLevel) && Number(filledLevel) > 0 && filledIgn === "Notch", `${filledIgn} ${filledLevel}`);
  // 拉取过的玩家才会被皮肤接口认识
  const rawSkin = await guest.request.get(`${BASE}/skin/${NOTCH}?view=raw`);
  check("原始皮肤纹理可取（Notch，真实 Mojang 数据）", rawSkin.ok() && (rawSkin.headers()["content-type"] ?? "").includes("image/png"));
  const portrait = await guest.request.get(`${BASE}/skin/${NOTCH}?view=body`);
  check("2D 立绘可取", portrait.ok() && (portrait.headers()["content-type"] ?? "").includes("image/png"));
  const noCape = await guest.request.get(`${BASE}/skin/${NOTCH}?view=cape`);
  check("没有披风时披风接口返回 404", noCape.status() === 404);
  await seller.goto(`${BASE}/listings/${listingId2}`);
  await seller.getByText("NETWORK LEVEL").waitFor({ timeout: 60000 });
  const detailText = (await seller.textContent("main")) ?? "";
  check("详情页自动展示 Hypixel 官方数据面板", (await seller.locator(".hx-panel").count()) === 1 && detailText.includes("HYPIXEL") && detailText.includes("起床战争"));
  await seller.locator('.hx-viewer[data-state="ready"]').waitFor({ timeout: 60000 }).catch(() => {});
  const viewerState = await seller.locator(".hx-viewer").getAttribute("data-state");
  check("3D 皮肤模型加载完成", viewerState === "ready", `state=${viewerState}`);
  await seller.waitForTimeout(1200);
  await seller.screenshot({ path: `${SHOT_DIR}/detail-hypixel.png`, fullPage: true });
  const snapRow = await pg.query("select api_snapshot, mc_uuid from listings where id = $1", [listingId2]);
  check("上架时自动保存官方快照", !!snapRow.rows[0]?.api_snapshot && /^[0-9a-f]{32}$/.test(snapRow.rows[0]?.mc_uuid ?? ""));

  // ---- 加载反馈：首页流式骨架屏、链接导航进行中的提示 ----
  const homeHtml = await (await guest.request.get(`${BASE}/`)).text();
  check("首页流式输出，骨架屏与内容同在首屏 HTML 里", homeHtml.includes('data-skeleton="home"') && homeHtml.includes("listing-card"));
  await seller.goto(`${BASE}/`);
  // 把详情页的 RSC 请求压慢 1.5 秒，验证这段时间里被点的卡片有「进行中」的细线
  await seller.route((url) => url.pathname.startsWith("/listings/") && url.searchParams.has("_rsc"), async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    // 拦截器可能在 unroute 之后才走到这里，放行失败不能变成未处理异常把整个脚本拖垮
    await route.continue().catch(() => {});
  });
  const clickedCard = seller.locator(".listing-card").first();
  await clickedCard.click();
  const pendingShown = await clickedCard
    .locator(".link-pending.is-pending")
    .waitFor({ state: "attached", timeout: 2500 })
    .then(() => true)
    .catch(() => false);
  check("点击账号卡后立刻有导航进行中的反馈", pendingShown);
  await seller.waitForURL((u) => /^\/listings\/\d+$/.test(u.pathname));
  await seller.unrouteAll({ behavior: "wait" });

  // ---- 健壮性与安全回归 ----
  const badParams = await guest.request.get(`${BASE}/?minPrice=1.5&minLevel=3000000000&page=1e20`);
  check("首页乱参数不再 500", badParams.status() === 200);
  const badSold = await guest.request.get(`${BASE}/sold?page=1.3`);
  check("已完成区乱页码不再 500", badSold.status() === 200);
  const badId = await seller.goto(`${BASE}/listings/abc`);
  check("非法商品 id 返回 404", badId?.status() === 404, `status=${badId?.status()}`);
  const hugeId = await seller.goto(`${BASE}/listings/100000000000000000000`);
  check("超大商品 id 返回 404", hugeId?.status() === 404, `status=${hugeId?.status()}`);
  const unknownSkin = await guest.request.get(`${BASE}/skin/00000000000000000000000000000001?view=raw`);
  check("未收录 uuid 的皮肤请求返回 404", unknownSkin.status() === 404);
  const probe = await (await newContext()).newPage();
  probe.setDefaultTimeout(60000);
  acceptDialogs(probe);
  await probe.goto(`${BASE}/login?next=/\\evil.com`);
  await probe.fill('input[name="account"]', sellerName);
  await probe.fill('input[name="password"]', "password123");
  await probe.getByRole("button", { name: "登录", exact: true }).click();
  await probe.waitForURL((u) => u.pathname !== "/login");
  check("反斜杠开放重定向被拦住", new URL(probe.url()).host === new URL(BASE).host && new URL(probe.url()).pathname === "/", probe.url());
  await probe.context().close();
  await admin.goto(`${BASE}/listings/${listingId2}/buy`);
  await admin.fill('textarea[name="message"]', "收黑 卡号");
  await admin.getByRole("button", { name: "提交意向单" }).click();
  await admin.getByText("违禁词").waitFor();
  check("买家留言过违禁词", true);

  // ---- 视觉检查用截图 ----
  await guest.goto(`${BASE}/login`);
  await guest.screenshot({ path: `${SHOT_DIR}/login.png`, fullPage: true });
  await seller.goto(`${BASE}/sell/new`);
  await seller.screenshot({ path: `${SHOT_DIR}/sell-new.png`, fullPage: true });
  await seller.goto(`${BASE}/me`);
  await seller.screenshot({ path: `${SHOT_DIR}/me.png`, fullPage: true });
  await admin.goto(`${BASE}/admin`);
  await admin.screenshot({ path: `${SHOT_DIR}/admin-home.png`, fullPage: true });
  await admin.goto(`${BASE}/admin/listings`);
  await admin.screenshot({ path: `${SHOT_DIR}/admin-listings.png`, fullPage: true });
  await admin.goto(`${BASE}/admin/settings`);
  await admin.screenshot({ path: `${SHOT_DIR}/admin-settings.png`, fullPage: true });
  await admin.goto(`${BASE}/agent?tab=completed`);
  await admin.screenshot({ path: `${SHOT_DIR}/agent.png`, fullPage: true });
  await admin.goto(`${BASE}/admin/orders`);
  await admin.screenshot({ path: `${SHOT_DIR}/admin-orders.png`, fullPage: true });
  await seller.goto(`${BASE}/orders`);
  await seller.screenshot({ path: `${SHOT_DIR}/orders-list.png`, fullPage: true });
  const mobile = await (await newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true })).newPage();
  mobile.setDefaultTimeout(60000);
  acceptDialogs(mobile);
  await mobile.goto(`${BASE}/`);
  const firstCard = await mobile.locator(".listing-card, .pinned-card").first().boundingBox();
  check("手机端首屏内就能看到账号卡", !!firstCard && firstCard.y < 800, `y=${firstCard?.y}`);
  check("手机端筛选表单默认收起", !(await mobile.locator('form[method="get"]').isVisible()));
  await mobile.getByRole("button", { name: /筛选条件/ }).click();
  check("手机端点开筛选面板", await mobile.locator('form[method="get"]').isVisible());
  await mobile.screenshot({ path: `${SHOT_DIR}/mobile-home.png`, fullPage: true });
  await mobile.goto(`${BASE}/login`);
  await mobile.fill('input[name="account"]', sellerName);
  await mobile.fill('input[name="password"]', "password123");
  await mobile.getByRole("button", { name: "登录", exact: true }).click();
  await mobile.waitForURL((u) => u.pathname !== "/login");
  await mobile.goto(`${BASE}/orders`);
  const rowDisplay = await mobile.locator(".table-cards tbody tr").first().evaluate((el) => getComputedStyle(el).display);
  const theadVisible = await mobile.locator(".table-cards thead").first().isVisible();
  check("手机端意向单列表改为卡片式", rowDisplay === "flex" && !theadVisible, `display=${rowDisplay} thead=${theadVisible}`);
  const flushRows = await mobile.locator(".card-flush .table-cards tbody tr").evaluateAll((trs) =>
    trs.map((tr) => {
      const s = getComputedStyle(tr);
      return [s.borderLeftWidth, s.borderRightWidth, s.borderTopWidth, s.marginTop];
    }),
  );
  check(
    "flush 卡里的手机端行没有独立边框与外边距，只有 border-top 分隔",
    flushRows.length > 0 && flushRows.every((b) => b[0] === "0px" && b[1] === "0px" && b[3] === "0px") && flushRows.slice(1).every((b) => b[2] === "1px"),
    JSON.stringify(flushRows),
  );
  await mobile.screenshot({ path: `${SHOT_DIR}/mobile-orders.png`, fullPage: true });
  await mobile.goto(`${BASE}/listings/${listingId2}`);
  const ctaBar = await mobile.locator('[data-testid="mobile-cta"]').boundingBox();
  check("手机端详情页价格与操作栏固定在首屏底部", !!ctaBar && ctaBar.y > 400 && ctaBar.y + ctaBar.height <= 845, JSON.stringify(ctaBar));
  await mobile.screenshot({ path: `${SHOT_DIR}/mobile-detail.png`, fullPage: true });

  // ---- 登录后的账号卡：正版 ID、等级、像素头像；删掉截图后封面退到「会员色底 + 像素头像大图」 ----
  await seller.goto(`${BASE}/`);
  const memberCard = seller.locator(`.listing-card[data-id="${listingId2}"]`);
  await memberCard.waitFor({ timeout: 20000 });
  await memberCard.scrollIntoViewIfNeeded();
  const memberText = (await memberCard.textContent()) ?? "";
  check("登录后卡片显示正版 ID 与等级", memberText.includes(ign2) && memberText.includes("120"), memberText.slice(0, 120));
  const faceSrc = await memberCard.locator("img.account-face").first().getAttribute("src");
  check("账号卡 ign 旁有像素头像", !!faceSrc && faceSrc.includes("view=face"), faceSrc ?? "");
  const faceResp = await seller.request.get(`${BASE}${faceSrc}`);
  check("头像接口返回 png 并带 ETag", faceResp.ok() && (faceResp.headers()["content-type"] ?? "").includes("image/png") && !!faceResp.headers()["etag"]);
  // 头像是 lazy 图，先滚到卡片再等它加载完
  // 注意：浏览器里跑的回调不能声明内部具名函数（tsx 会注入 __name 帮助函数，页面里没有）
  const faceState = await memberCard.locator("img.account-face").first().evaluate(
    (el) =>
      new Promise<string>((resolve) => {
        const i = el as HTMLImageElement;
        if (i.complete && i.naturalWidth > 0) resolve(`${i.naturalWidth}x${i.naturalHeight} ${getComputedStyle(i).imageRendering}`);
        else {
          i.addEventListener("load", () => resolve(`${i.naturalWidth}x${i.naturalHeight} ${getComputedStyle(i).imageRendering}`), { once: true });
          i.addEventListener("error", () => resolve(`error ${getComputedStyle(i).imageRendering}`), { once: true });
          setTimeout(() => resolve(`${i.naturalWidth}x${i.naturalHeight} ${getComputedStyle(i).imageRendering}`), 15000);
        }
      }),
  );
  check("头像已加载且像素渲染", /^\d+x\d+ pixelated$/.test(faceState) && !faceState.startsWith("0x"), faceState);
  await pg.query("delete from listing_images where listing_id = $1", [listingId2]);
  await seller.goto(`${BASE}/`);
  const bare = seller.locator(`.listing-card[data-id="${listingId2}"]`);
  await bare.waitFor({ timeout: 20000 });
  await bare.scrollIntoViewIfNeeded();
  const faceCover = bare.locator(".listing-cover.has-face img.cover-face");
  const faceBox = await faceCover.boundingBox();
  check(
    "无截图卡封面用像素头像大图且不当作有图",
    (await faceCover.count()) === 1 && (await bare.locator(".listing-cover.has-image").count()) === 0 && !!faceBox && faceBox.width >= 64 && faceBox.width <= 96,
    JSON.stringify(faceBox),
  );
  await bare.screenshot({ path: `${SHOT_DIR}/card-no-cover.png` });

  // ---- 求购：解封买家 → 发布（联系方式闸）→ 大厅 / 打码 → 卖家推荐 → 据推荐下单 → 成交后求购完成 → 编辑 / 到期续期 / 关闭 → 后台下架恢复 → 中介台 ----
  // 买家在上面「封禁」一节被封了（会话被踢、信用清零）。封禁中的买家不能下单、中介也不能对其开始交易，先由超管解封并重新登录
  await admin.goto(`${BASE}/admin/users?q=${buyerQq}`);
  await admin.getByRole("link", { name: buyerName }).click();
  await admin.getByRole("button", { name: "解除封禁并移出黑名单" }).click();
  await admin.getByRole("button", { name: "封禁", exact: true }).waitFor();
  await login(buyer, buyerName, "password123");
  check("解封后买家能重新登录", ((await buyer.textContent("header")) ?? "").includes(buyerName));
  // 第一个号已售出，第二个号被这位买家下过单又取消过，再发一个干净的在售账号专门给求购推荐用
  const ign3 = `Wanted${STAMP}`;
  await seller.goto(`${BASE}/sell/new`);
  await fillListing(seller, "第三个号，给求购推荐用", ign3);
  await seller.getByRole("button", { name: "提交审核" }).click();
  await seller.waitForURL((u) => u.pathname === "/me" && u.searchParams.has("submitted"));
  const listingId3 = Number(new URL(seller.url()).searchParams.get("submitted"));
  await admin.goto(`${BASE}/admin/review`);
  await admin.locator(`form:has(input[name="id"][value="${listingId3}"]) button[value="approve"]`).click();
  await admin.locator(`form:has(input[name="id"][value="${listingId3}"])`).waitFor({ state: "detached" });
  const adminId = Number((await pg.query("select id from users where username = 'admin'")).rows[0].id);
  const fillWanted = async (
    page: Page,
    w: { ranks?: string[]; capes?: string[]; minLevel?: string; budgetMin?: string; budgetMax: string; requirements?: string; agentId?: number; days?: string },
  ) => {
    for (const r of w.ranks ?? []) await page.check(`input[name="ranks"][value="${r}"]`);
    for (const c of w.capes ?? []) await page.check(`input[name="capes"][value="${c}"]`);
    if (w.minLevel !== undefined) await page.fill('input[name="minLevel"]', w.minLevel);
    if (w.budgetMin !== undefined) await page.fill('input[name="budgetMin"]', w.budgetMin);
    await page.fill('input[name="budgetMax"]', w.budgetMax);
    if (w.requirements !== undefined) await page.fill('textarea[name="requirements"]', w.requirements);
    if (w.agentId !== undefined) await page.selectOption('select[name="preferredAgentId"]', String(w.agentId));
    if (w.days !== undefined) await page.selectOption('select[name="days"]', w.days);
  };
  const wantedCreated = (u: URL) => /^\/wanted\/\d+$/.test(u.pathname) && u.searchParams.has("created");
  const lastId = (page: Page) => Number(new URL(page.url()).pathname.split("/").pop());
  /** 需登录页的数据部分在 Suspense 里流式到达，读整页文本前先等目标文字出现；等不到也不抛，交给后面的 check 判定 */
  const waitText = (page: Page, text: string) => page.getByText(text).first().waitFor({ timeout: 15000 }).catch(() => {});
  /** 没匹配到元素时返回空串，避免 first().textContent() 在缺元素时等满默认超时 */
  const textOf = async (l: ReturnType<Page["locator"]>) => ((await l.count()) ? ((await l.first().textContent()) ?? "") : "");

  // (1) 其他要求里留 QQ 被第二道闸拦下，仍停在发布页；(2) 改成正常文案发布成功
  await buyer.goto(`${BASE}/wanted/new`);
  await fillWanted(buyer, { ranks: ["MVP+"], minLevel: "100", budgetMax: "6000", days: "30", requirements: "加我QQ聊" });
  await buyer.getByRole("button", { name: "发布求购" }).click();
  await buyer.getByText("不能留").waitFor();
  check("求购说明里留 QQ 被拦下且仍在发布页", new URL(buyer.url()).pathname === "/wanted/new", buyer.url());
  check("求购表单校验失败后条件与预算仍在", (await buyer.isChecked('input[name="ranks"][value="MVP+"]')) && (await buyer.inputValue('input[name="budgetMax"]')) === "6000");
  await fillWanted(buyer, { ranks: ["MVP+"], minLevel: "100", budgetMax: "6000", days: "30", requirements: "要有官方披风，最好能提供交易 ID，价格可谈" });
  await buyer.getByRole("button", { name: "发布求购" }).click();
  await buyer.waitForURL(wantedCreated);
  const wantedId = lastId(buyer);
  await waitText(buyer, "求购已发布");
  const createdText = (await buyer.textContent("main")) ?? "";
  check("发布求购后进入详情并提示已发布", createdText.includes("求购已发布") && createdText.includes("MVP+") && createdText.includes("¥6,000"), buyer.url());
  const buyerBell = buyer.locator('header a[href="/me/notifications"]');
  const buyerUnread0 = Number(await buyerBell.getAttribute("data-unread"));

  // (3) 游客在大厅看到这张卡，买家名打码；详情需登录；非法 id 404
  await guest.goto(`${BASE}/wanted`);
  const wantedCard = guest.locator(`article.wanted-card[data-wanted-id="${wantedId}"]`);
  await wantedCard.waitFor({ timeout: 20000 });
  const hallText = (await guest.textContent("main")) ?? "";
  const cardText = (await wantedCard.textContent()) ?? "";
  check("游客在求购大厅看到新求购卡（预算、条件、剩余天数）", cardText.includes("¥6,000") && cardText.includes("MVP+") && cardText.includes("100 级以上") && /剩 \d+ 天/.test(cardText), cardText.slice(0, 160));
  check("求购大厅买家用户名打码", hallText.includes(maskedBuyer) && !hallText.includes(buyerName), `期待 ${maskedBuyer}`);
  check("求购大厅显示计数，游客看到「登录后发布」", /找到 \d+ 条求购/.test(hallText) && (await guest.getByRole("link", { name: "登录后发布" }).count()) === 1);
  const navWanted = guest.locator('nav[aria-label="主要导航"] a[href="/wanted"]');
  check("主导航有「求购」且在大厅页为当前项", (await navWanted.count()) === 1 && (await navWanted.getAttribute("aria-current")) === "page");
  await designGuards(guest, "求购大厅");
  await guest.screenshot({ path: `${SHOT_DIR}/wanted-guest.png`, fullPage: true });
  await guest.goto(`${BASE}/wanted/${wantedId}`);
  check("游客点求购详情跳登录", new URL(guest.url()).pathname === "/login");
  const badWanted = await seller.goto(`${BASE}/wanted/abc`);
  check("非法求购 id 返回 404", badWanted?.status() === 404, `status=${badWanted?.status()}`);

  // (4) 卖家在详情页把在售账号推荐给买家；留言同样过联系方式闸；推过的账号不再出现在下拉里
  await seller.goto(`${BASE}/wanted/${wantedId}`);
  const offerForm = seller.locator('[data-testid="offer-form"]');
  await offerForm.waitFor();
  await offerForm.locator('select[name="listingId"]').selectOption(String(listingId3));
  await offerForm.locator('textarea[name="message"]').fill("加微信聊");
  await offerForm.getByRole("button", { name: "推荐给买家" }).click();
  await seller.getByText("不能留").waitFor();
  check("推荐留言里留微信被拦下", true);
  await offerForm.locator('select[name="listingId"]').selectOption(String(listingId3));
  await offerForm.locator('textarea[name="message"]').fill("E2E 推荐：MVP+ 120 级带官方披风，随时可验号");
  await offerForm.getByRole("button", { name: "推荐给买家" }).click();
  await seller.getByText("已推荐给买家").waitFor();
  const sellerOfferRow = seller.locator("[data-offer-id]");
  await sellerOfferRow.first().waitFor({ timeout: 15000 }).catch(() => {});
  check(
    "卖家推荐成功并看到自己的推荐为待回应、可撤回",
    (await sellerOfferRow.count()) === 1 && (await textOf(sellerOfferRow)).includes("待买家回应") && (await sellerOfferRow.getByRole("button", { name: "撤回" }).count()) === 1,
    (await textOf(sellerOfferRow)).slice(0, 160),
  );
  check("已推荐过的账号不再出现在可推荐下拉里", (await seller.locator(`select[name="listingId"] option[value="${listingId3}"]`).count()) === 0);

  // (5) 买家刷新详情：一条待回应推荐、卖家名打码、顶栏未读增加
  await buyer.goto(`${BASE}/wanted/${wantedId}`);
  const offerRows = buyer.locator("[data-offer-id]");
  await offerRows.first().waitFor({ timeout: 15000 }).catch(() => {});
  const buyerUnread1 = Number(await buyerBell.getAttribute("data-unread"));
  const offerRowText = await textOf(offerRows);
  check("买家在详情看到 1 条待回应推荐", (await offerRows.count()) === 1 && offerRowText.includes("待买家回应") && offerRowText.includes("¥5,000"), offerRowText.slice(0, 160));
  check("推荐里卖家名打码且链到账号详情", offerRowText.includes(masked) && !offerRowText.includes(sellerName) && (await offerRows.locator(`a[href="/listings/${listingId3}"]`).count()) >= 1, `期待 ${masked}`);
  check("收到推荐后买家顶栏未读增加", buyerUnread1 > buyerUnread0, `before=${buyerUnread0} after=${buyerUnread1}`);

  // (6) 买家点「去下单」→ 带 wanted 参数的下单页 → 提交意向单 → 推荐变「买家已下单」，卖家收到采纳通知
  await offerRows.first().getByRole("link", { name: "去下单" }).click();
  await buyer.waitForURL((u) => u.pathname === `/listings/${listingId3}/buy` && u.searchParams.get("wanted") === String(wantedId));
  const buyText = (await buyer.textContent("main")) ?? "";
  check("去下单进入带求购参数的下单页并提示来源", buyText.includes("本单来自你的求购") && buyText.includes(ign3), buyer.url());
  await buyer.selectOption('select[name="agentId"]', { label: "admin" });
  await buyer.fill('textarea[name="message"]', "E2E 从求购推荐过来的，今晚方便验号");
  await buyer.getByRole("button", { name: "提交意向单" }).click();
  await buyer.waitForURL((u) => /^\/orders\/\d+$/.test(u.pathname) && u.searchParams.has("created"));
  const orderId3 = lastId(buyer);
  check("据求购下的意向单进入待联系并标注来自求购", ((await buyer.textContent("main")) ?? "").includes("待联系") && (await buyer.locator(`main a[href="/wanted/${wantedId}"]`).count()) >= 1);
  await buyer.goto(`${BASE}/wanted/${wantedId}`);
  await waitText(buyer, "买家已下单");
  const acceptedText = await textOf(offerRows);
  check("下单后推荐状态变为买家已下单", acceptedText.includes("买家已下单") && (await offerRows.getByRole("link", { name: "去下单" }).count()) === 0, acceptedText.slice(0, 160));
  check("求购详情提示已据此提交意向单", (await buyer.locator(`main a[href="/orders/${orderId3}"]`).count()) >= 1);
  await seller.goto(`${BASE}/me/notifications`);
  check("卖家收到推荐被采纳的通知", ((await seller.textContent("main")) ?? "").includes("买家采纳了你的推荐"));

  // (7) 超管当中介：开始交易 → 完成。求购随之完成、从大厅消失、不再显示推荐表单
  await admin.goto(`${BASE}/orders/${orderId3}`);
  check("中介视角的意向单也标注来自求购", (await admin.locator(`main a[href="/wanted/${wantedId}"]`).count()) >= 1);
  await admin.getByRole("button", { name: "开始交易" }).click();
  await admin.getByText("交易进行中").waitFor();
  await admin.fill('input[name="finalPrice"]', "4900");
  await admin.getByRole("button", { name: "确认完成，结算信用分" }).click();
  await admin.waitForURL((u) => u.searchParams.has("done"));
  await buyer.goto(`${BASE}/wanted/${wantedId}`);
  await waitText(buyer, "已完成");
  const fulfilledText = (await buyer.textContent("main")) ?? "";
  check(
    "意向单完成后求购单变为已完成",
    (await buyer.getByText("已完成", { exact: true }).count()) >= 1 && fulfilledText.includes(`#${orderId3}`) && (await buyer.getByRole("button", { name: "关闭求购" }).count()) === 0,
    fulfilledText.slice(0, 200),
  );
  await designGuards(buyer, "求购详情");
  await buyer.screenshot({ path: `${SHOT_DIR}/wanted-detail.png`, fullPage: true });
  await seller.goto(`${BASE}/wanted/${wantedId}`);
  await waitText(seller, "买家已下单");
  check("已完成的求购不再显示推荐表单", (await seller.locator('[data-testid="offer-form"]').count()) === 0 && (await textOf(sellerOfferRow)).includes("买家已下单"));
  await guest.goto(`${BASE}/wanted`);
  await guest.waitForLoadState("networkidle");
  check("已完成的求购不再出现在大厅", (await wantedCard.count()) === 0);

  // (8) 第二张求购：不选会员 → 编辑预算 → 直接改库模拟到期 → 续期 → 在「我的」页关闭
  await buyer.goto(`${BASE}/wanted/new`);
  await fillWanted(buyer, { budgetMax: "800" });
  await buyer.getByRole("button", { name: "发布求购" }).click();
  await buyer.waitForURL(wantedCreated);
  const wantedId2 = lastId(buyer);
  await waitText(buyer, "会员不限");
  check("不选会员发布的求购显示会员不限", ((await buyer.textContent("main")) ?? "").includes("会员不限"));
  await buyer.goto(`${BASE}/wanted/${wantedId2}/edit`);
  await buyer.fill('input[name="budgetMax"]', "900");
  await buyer.getByRole("button", { name: "保存修改" }).click();
  await buyer.waitForURL((u) => u.pathname === `/wanted/${wantedId2}` && u.searchParams.has("updated"));
  await waitText(buyer, "修改已保存");
  const editedText = (await buyer.textContent("main")) ?? "";
  check("编辑求购后预算更新并提示已保存", editedText.includes("修改已保存") && editedText.includes("¥900") && !editedText.includes("¥800"));
  await pg.query("update wanted_requests set expires_at = now() - interval '1 minute' where id = $1", [wantedId2]);
  await guest.goto(`${BASE}/wanted`);
  await guest.waitForLoadState("networkidle");
  const wantedCard2 = guest.locator(`article.wanted-card[data-wanted-id="${wantedId2}"]`);
  check("到期的求购从大厅消失", (await wantedCard2.count()) === 0);
  await buyer.goto(`${BASE}/wanted/${wantedId2}`);
  await waitText(buyer, "已过期");
  check("到期的求购详情显示已过期", (await buyer.getByText("已过期", { exact: true }).count()) >= 1);
  await buyer.getByRole("button", { name: /^续期/ }).click();
  await buyer.getByText("求购中", { exact: true }).first().waitFor({ timeout: 20000 }).catch(() => {});
  const renewedText = (await buyer.textContent("main")) ?? "";
  check("续期后回到求购中", (await buyer.getByText("已过期", { exact: true }).count()) === 0 && renewedText.includes("求购中") && /剩 \d+ 天/.test(renewedText));
  await guest.goto(`${BASE}/wanted`);
  check("续期后重新出现在大厅", await wantedCard2.waitFor({ timeout: 20000 }).then(() => true).catch(() => false));
  await buyer.goto(`${BASE}/me`);
  const myRow2 = buyer.locator(`tr[data-wanted-id="${wantedId2}"]`);
  await myRow2.waitFor({ timeout: 20000 });
  check("我的页面列出我的求购", /我的求购（\d+）/.test((await buyer.textContent("main")) ?? "") && (await buyer.locator("tr[data-wanted-id]").count()) >= 2);
  const dlgBeforeClose = dialogs.length;
  await myRow2.getByRole("button", { name: "关闭", exact: true }).click();
  await myRow2.getByText("已关闭", { exact: true }).waitFor({ timeout: 20000 }).catch(() => {});
  check("在我的页面关闭求购", ((await myRow2.textContent()) ?? "").includes("已关闭"), (await myRow2.textContent()) ?? "");
  check("关闭求购前有确认弹窗", dialogs.length > dlgBeforeClose && dialogs.slice(dlgBeforeClose).some((m) => m.includes("关闭")));

  // (9) 第三张求购指定中介 admin、区间预算 → 大厅筛选 → 后台按编号查到并下架 → 游客看不到、别人 404、买家看到已下架并收通知 → 恢复 → 留痕
  await buyer.goto(`${BASE}/wanted/new`);
  await fillWanted(buyer, { ranks: ["MVP++"], capes: ["官方"], budgetMin: "2000", budgetMax: "3000", agentId: adminId, days: "60" });
  await buyer.getByRole("button", { name: "发布求购" }).click();
  await buyer.waitForURL(wantedCreated);
  const wantedId3 = lastId(buyer);
  await waitText(buyer, "求购已发布");
  const wanted3Text = (await buyer.textContent("main")) ?? "";
  check("区间预算、披风与指定中介显示在详情", wanted3Text.includes("¥2,000～¥3,000") && wanted3Text.includes("官方披风") && wanted3Text.includes("admin"));
  const buyerUnread2 = Number(await buyerBell.getAttribute("data-unread"));
  await admin.goto(`${BASE}/me/notifications`);
  check("被指定的中介收到求购通知", ((await admin.textContent("main")) ?? "").includes("有买家指定你跟进求购"));
  await guest.goto(`${BASE}/wanted?rank=MVP%2B%2B`);
  const wantedCard3 = guest.locator(`article.wanted-card[data-wanted-id="${wantedId3}"]`);
  const hitByRank = await wantedCard3.waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  await guest.goto(`${BASE}/wanted?minBudget=5000`);
  await guest.waitForLoadState("networkidle");
  check("大厅筛选：会员类型命中、预算下限过滤掉", hitByRank && (await wantedCard3.count()) === 0);
  await admin.goto(`${BASE}/admin/wanted?q=${wantedId3}`);
  const wantedForm = admin.locator(`form:has(input[name="id"][value="${wantedId3}"])`);
  const adminRow3 = admin.locator("tbody tr", { has: admin.locator(`input[name="id"][value="${wantedId3}"]`) });
  await adminRow3.waitFor({ timeout: 20000 }).catch(() => {});
  check("后台按编号查到求购并显示买家原名", (await adminRow3.count()) === 1 && (await textOf(adminRow3)).includes(buyerName));
  const dlgBeforeRemove = dialogs.length;
  await wantedForm.locator('input[name="note"]').fill("测试下架");
  await wantedForm.getByRole("button", { name: "下架" }).click();
  await admin.locator(`form:has(input[name="id"][value="${wantedId3}"]) button:has-text("恢复")`).waitFor({ timeout: 20000 });
  const removedRowText = await textOf(adminRow3);
  check("后台下架后显示已下架与原因", removedRowText.includes("已下架") && removedRowText.includes("测试下架"), removedRowText.slice(0, 200));
  check("下架求购前有确认弹窗", dialogs.length > dlgBeforeRemove && dialogs.slice(dlgBeforeRemove).some((m) => m.includes("下架")));
  await admin.goto(`${BASE}/admin/wanted?status=removed`);
  const removedFilterHit = (await adminRow3.count()) === 1;
  await admin.goto(`${BASE}/admin/wanted?status=open&q=${wantedId3}`);
  check("后台状态筛选：已下架命中、求购中不含", removedFilterHit && (await adminRow3.count()) === 0);
  await guest.goto(`${BASE}/wanted`);
  await guest.waitForLoadState("networkidle");
  check("下架的求购游客看不到", (await wantedCard3.count()) === 0);
  const removedForOthers = await seller.goto(`${BASE}/wanted/${wantedId3}`);
  check("下架的求购其他用户打开是 404", removedForOthers?.status() === 404, `status=${removedForOthers?.status()}`);
  await buyer.goto(`${BASE}/wanted/${wantedId3}`);
  await waitText(buyer, "已下架");
  const buyerUnread3 = Number(await buyerBell.getAttribute("data-unread"));
  check("买家仍能打开被下架的求购并看到已下架", (await buyer.getByText("已下架", { exact: true }).count()) >= 1 && (await buyer.getByRole("button", { name: "关闭求购" }).count()) === 0);
  check("求购被下架后买家顶栏未读增加", buyerUnread3 > buyerUnread2, `before=${buyerUnread2} after=${buyerUnread3}`);
  await buyer.goto(`${BASE}/me`);
  const myRow3 = buyer.locator(`tr[data-wanted-id="${wantedId3}"]`);
  await myRow3.waitFor({ timeout: 20000 }).catch(() => {});
  check("我的页面显示下架原因", (await textOf(myRow3)).includes("测试下架"), await textOf(myRow3));
  await admin.goto(`${BASE}/admin/wanted?q=${wantedId3}`);
  await wantedForm.getByRole("button", { name: "恢复" }).click();
  await admin.locator(`form:has(input[name="id"][value="${wantedId3}"]) button:has-text("下架")`).waitFor({ timeout: 20000 });
  check("后台恢复求购后回到求购中", (await textOf(adminRow3)).includes("求购中"));
  await guest.goto(`${BASE}/wanted`);
  check("恢复后游客又能看到该求购", await wantedCard3.waitFor({ timeout: 20000 }).then(() => true).catch(() => false));
  const missingWantedActions: string[] = [];
  for (const a of ["wanted_remove", "wanted_restore"]) {
    await admin.goto(`${BASE}/admin/logs?action=${a}`);
    if (!((await admin.locator("tbody").textContent().catch(() => "")) ?? "").includes(a)) missingWantedActions.push(a);
  }
  check("求购下架与恢复都留痕", missingWantedActions.length === 0, `缺少 ${missingWantedActions.join(", ")}`);

  // (10) 中介台「求购」tab：求购中的单在列、指定我的标「指定你」、买家原名可见；已完成 / 已关闭的不在；原有四个 tab 文案不变
  await admin.goto(`${BASE}/agent?tab=wanted`);
  const agentRow3 = admin.locator("tbody tr", { has: admin.locator(`a[href="/wanted/${wantedId3}"]`) });
  await agentRow3.waitFor({ timeout: 20000 }).catch(() => {});
  const agentWantedText = (await admin.textContent("main")) ?? "";
  const agentRow3Text = await textOf(agentRow3);
  check(
    "中介台求购 tab 列出该求购并标「指定你」",
    (await agentRow3.count()) === 1 && agentRow3Text.includes("指定你") && agentRow3Text.includes(buyerName) && agentRow3Text.includes("去推荐"),
    agentRow3Text.slice(0, 200),
  );
  check("已完成与已关闭的求购不在中介台", (await admin.locator(`main a[href="/wanted/${wantedId}"]`).count()) === 0 && (await admin.locator(`main a[href="/wanted/${wantedId2}"]`).count()) === 0);
  check("中介台五个 tab 文案齐全", ["待联系", "交易中", "已完成", "已取消", "求购"].every((t) => agentWantedText.includes(t)));
  await admin.screenshot({ path: `${SHOT_DIR}/agent-wanted.png`, fullPage: true });

  // (11) 设计守卫与截图：发布表单、后台求购管理、首页入口、手机端大厅
  await buyer.goto(`${BASE}/wanted/new`);
  await designGuards(buyer, "发布求购");
  await buyer.screenshot({ path: `${SHOT_DIR}/wanted-new.png`, fullPage: true });
  await admin.goto(`${BASE}/admin/wanted`);
  await admin.screenshot({ path: `${SHOT_DIR}/admin-wanted.png`, fullPage: true });
  await guest.goto(`${BASE}/`);
  // 首页流式输出，hero 也在流里；先等链接出现再计数
  await guest.locator('main a[href="/wanted"]').first().waitFor({ timeout: 15000 }).catch(() => {});
  check("首页 hero 有「浏览求购」入口", (await guest.locator('main a[href="/wanted"]').count()) >= 1);
  await mobile.goto(`${BASE}/wanted`);
  // 大厅走 loading.tsx 流式输出，先等卡片出现再量位置
  await mobile.locator(".wanted-card").first().waitFor({ timeout: 15000 }).catch(() => {});
  const firstWantedCard = await mobile.locator(".wanted-card").first().boundingBox();
  check("手机端求购大厅首屏内能看到求购卡", !!firstWantedCard && firstWantedCard.y < 844, `y=${firstWantedCard?.y}`);
  await mobile.screenshot({ path: `${SHOT_DIR}/mobile-wanted.png`, fullPage: true });

  // ---- SEO 文件（大纲第 13 节：站点地图是百度 SEO 的前置条件）----
  const robotsRes = await guest.request.get(`${BASE}/robots.txt`);
  const robotsTxt = await robotsRes.text();
  check("robots.txt 可访问且屏蔽了需登录的区", robotsRes.ok() && robotsTxt.includes("Disallow: /admin") && robotsTxt.includes("Disallow: /me"));
  check("robots.txt 指向站点地图", robotsTxt.includes("Sitemap: ") && robotsTxt.trimEnd().endsWith("/sitemap.xml"), robotsTxt.slice(-60));
  const sitemapRes = await guest.request.get(`${BASE}/sitemap.xml`);
  const sitemapXml = await sitemapRes.text();
  check("sitemap 收录公开页", sitemapRes.ok() && sitemapXml.includes("/sold") && sitemapXml.includes("/wanted"));
  check("sitemap 不收录需登录的详情页", !sitemapXml.includes("/listings/"));

  // ---- 改用户名（大纲第 2 节：过违禁词、唯一、30 天一次、留痕）----
  // 买家改完必须用 SQL 改回去：cleanup-e2e.sql 按 ^买家[0-9]{6}$ 匹配测试用户，改了名就清理不到
  const buyerId = Number((await pg.query("select id from users where username = $1", [buyerName])).rows[0].id);
  await buyer.goto(`${BASE}/me/username`);
  await buyer.fill('input[name="username"]', "黑号中介");
  await buyer.getByRole("button", { name: "保存新用户名" }).click();
  await buyer.getByText("违禁词").waitFor({ timeout: 15000 }).catch(() => {});
  check("改名过违禁词库", ((await buyer.textContent("main")) ?? "").includes("违禁词"));
  await buyer.fill('input[name="username"]', "ADMIN");
  await buyer.getByRole("button", { name: "保存新用户名" }).click();
  await buyer.getByText("用户名已被使用").waitFor({ timeout: 15000 }).catch(() => {});
  check("改名重名（忽略大小写）被拒", ((await buyer.textContent("main")) ?? "").includes("用户名已被使用"));
  const renamed = `买家改${STAMP}`;
  await buyer.fill('input[name="username"]', renamed);
  await buyer.getByRole("button", { name: "保存新用户名" }).click();
  await buyer.waitForURL((u) => u.searchParams.get("username") === "1", { timeout: 30000 });
  check("改名成功并回到「我的」", ((await buyer.textContent("main")) ?? "").includes(renamed));
  const renameLog = await pg.query("select before, after from audit_logs where operator_id = $1 and action = $2", [buyerId, "username_change"]);
  check("改名留痕（含改前改后）", renameLog.rowCount === 1 && renameLog.rows[0].before?.username === buyerName && renameLog.rows[0].after?.username === renamed);
  await buyer.goto(`${BASE}/me/username`);
  check("冷却期内表单禁用并提示剩余天数", ((await buyer.textContent("main")) ?? "").includes("距离下次可改还有 30 天") && (await buyer.locator('input[name="username"][disabled]').count()) === 1);
  await buyer.evaluate(() => document.querySelectorAll<HTMLElement>("form [disabled]").forEach((el) => el.removeAttribute("disabled")));
  await buyer.fill('input[name="username"]', `再改${STAMP}`);
  await buyer.getByRole("button", { name: "保存新用户名" }).click();
  await buyer.getByText("还需").waitFor({ timeout: 15000 }).catch(() => {});
  check("绕过前端禁用后服务端仍拒绝", ((await buyer.textContent("main")) ?? "").includes("天只能改一次"));
  await pg.query("update users set username = $1, username_changed_at = null where id = $2", [buyerName, buyerId]);
  await pg.query("delete from audit_logs where operator_id = $1 and action = $2", [buyerId, "username_change"]);

  const flushed = await pg.query("select count(*)::int as pending, count(*) filter (where sent_at is not null)::int as sent from mail_outbox");
  check("通知邮件经发件箱发出（console 模式也计已发）", flushed.rows[0].sent > 0 && flushed.rows[0].pending - flushed.rows[0].sent <= 20, JSON.stringify(flushed.rows[0]));
  await pg.query("update users set password_hash = $1, password_changed_at = now() where username = 'admin'", [await hashPassword(ADMIN_DEFAULT)]);
  await pg.end();
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
