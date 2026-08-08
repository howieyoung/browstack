import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { sessionCookieValue } from "../src/archiveToken.js";
import { BIND_ADDRESS, SECURITY_HEADERS, createBrowstackServer } from "../src/server.js";

/**
 * 安全不變式:對照 SECURITY.md。這些斷言鎖住「看似無害的 PR 會悄悄破壞」的性質。
 * 認證用注入的固定 token（免動 Keychain）;deny/redirect/cover 路徑不觸發 DB 渲染,
 * 所以整個測試不需 better-sqlite3、不開啟真實 issues 資料。
 */

const TEST_TOKEN = "a".repeat(64); // 合法格式的假 token（/^[0-9a-f]{64}$/）
const GOOD_COOKIE = `${"bs"}=${sessionCookieValue(TEST_TOKEN)}`;

let server: http.Server;
let port: number;

before(async () => {
  server = createBrowstackServer({ getToken: () => TEST_TOKEN });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  port = (server.address() as AddressInfo).port;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

interface Res {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

// host: undefined → 送合法 Host;null → 送空 Host;字串 → 送該值。TCP 一律連本機臨時 port,
// 但 Host header 可獨立指定,正好用來測 Host 閘。
function request(opts: {
  method?: string;
  path?: string;
  host?: string | null;
  contentType?: string;
  cookie?: string;
  body?: string;
}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    headers.host = opts.host === undefined ? "127.0.0.1:8787" : (opts.host ?? "");
    if (opts.contentType) headers["content-type"] = opts.contentType;
    if (opts.cookie) headers.cookie = opts.cookie;
    if (opts.body !== undefined) headers["content-length"] = String(Buffer.byteLength(opts.body));
    const req = http.request(
      { host: "127.0.0.1", port, method: opts.method ?? "GET", path: opts.path ?? "/", headers },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data, headers: res.headers }));
      },
    );
    req.on("error", reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

test("Host 閘:合法本機 Host 放行", async () => {
  assert.equal((await request({ path: "/health", host: "127.0.0.1:8787" })).status, 200);
  assert.equal((await request({ path: "/health", host: "localhost:8787" })).status, 200);
});

test("Host 閘:主機名尾端單一點仍視為本機", async () => {
  assert.equal((await request({ path: "/health", host: "127.0.0.1.:8787" })).status, 200);
  assert.equal((await request({ path: "/health", host: "localhost.:8787" })).status, 200);
});

test("Host 閘:非本機 Host 一律 403（擋 DNS rebinding）", async () => {
  for (const host of ["evil.com", "127.0.0.1:8787.evil.com", "127.0.0.1:9999", "attacker:8787"]) {
    assert.equal((await request({ path: "/health", host })).status, 403, `host=${host} 應 403`);
  }
});

test("Host 閘:缺失/空 Host → 403", async () => {
  assert.equal((await request({ path: "/health", host: null })).status, 403);
});

test("/health 去指紋:回 {ok:true},不洩漏產品名", async () => {
  const res = await request({ path: "/health" });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
  assert.ok(!/browstack|service/i.test(res.body), "/health 不應含產品名或 service 欄位");
});

test("/capture:非 application/json 一律拒絕", async () => {
  const textPlain = await request({
    method: "POST",
    path: "/capture",
    contentType: "text/plain",
    body: JSON.stringify({ items: [] }),
  });
  assert.equal(textPlain.status, 415, "text/plain（no-cors 汙染路徑）應被擋");
  const noType = await request({ method: "POST", path: "/capture", body: "{}" });
  assert.equal(noType.status, 415, "無 content-type 應被擋");
});

test("/capture:application/json 通過 content-type 閘（{} → 400 items required,未觸發 DB）", async () => {
  const res = await request({
    method: "POST",
    path: "/capture",
    contentType: "application/json",
    body: "{}",
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /items/);
});

test("/capture:Host 閘先於 content-type（非本機 Host 直接 403）", async () => {
  const res = await request({
    method: "POST",
    path: "/capture",
    host: "evil.com",
    contentType: "application/json",
    body: JSON.stringify({ items: [] }),
  });
  assert.equal(res.status, 403);
});

test("未知路由 → 404", async () => {
  assert.equal((await request({ path: "/does-not-exist" })).status, 404);
});

test("CSP:default-src 'none'、含 img data:、無 script-src、無 unsafe-eval", () => {
  const csp = SECURITY_HEADERS["content-security-policy"];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /img-src 'self' data:/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /script-src/, "不應有 script-src(default-src 'none' 已封殺腳本)");
  assert.doesNotMatch(csp, /unsafe-eval/);
});

test("綁定位址永遠是本機迴環", () => {
  assert.equal(BIND_ADDRESS, "127.0.0.1");
});

test("典藏路由:無 token 無 cookie → 403", async () => {
  assert.equal((await request({ path: "/archive" })).status, 403);
  assert.equal((await request({ path: "/issues/3" })).status, 403);
  assert.equal((await request({ path: "/covers/3" })).status, 403);
});

test("典藏路由:錯誤 k → 403", async () => {
  assert.equal((await request({ path: "/archive?k=" + "b".repeat(64) })).status, 403);
  assert.equal((await request({ path: "/archive?k=notavalidtoken" })).status, 403);
});

test("典藏路由:合法 k → 302 + 設定 HttpOnly SameSite=Lax cookie,導向乾淨路徑", async () => {
  const res = await request({ path: "/archive?k=" + TEST_TOKEN });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/archive");
  const setCookie = ([] as string[]).concat(res.headers["set-cookie"] ?? []).join(" ");
  assert.match(setCookie, /bs=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.doesNotMatch(setCookie, new RegExp(TEST_TOKEN), "cookie 不得是 token 本身");
});

test("典藏路由:/issues/N 帶合法 k 也會換發 cookie 並 302 回乾淨路徑", async () => {
  const res = await request({ path: "/issues/5?k=" + TEST_TOKEN });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/issues/5");
});

test("整數路由:前導零/非數字/路徑穿越一律不匹配 → 404（有 cookie 也不放行檔案）", async () => {
  for (const p of ["/issues/01", "/issues/1.5", "/issues/-1", "/issues/abc", "/issues/..%2f..%2fetc%2fpasswd", "/covers/..%2f..%2fdata%2fbrowstack.db"]) {
    assert.equal((await request({ path: p, cookie: GOOD_COOKIE })).status, 404, `${p} 應 404`);
  }
});

test("/covers/N:有 cookie → 200 圖片,且帶 CSP／nosniff／CORP 安全標頭", async () => {
  const res = await request({ path: "/covers/3", cookie: GOOD_COOKIE });
  assert.equal(res.status, 200);
  assert.match(String(res.headers["content-type"]), /^image\//);
  assert.match(String(res.headers["content-security-policy"]), /default-src 'none'/);
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["cross-origin-resource-policy"], "same-origin");
});

test("典藏路由仍先過 Host 閘（非本機 Host + 合法 cookie → 403）", async () => {
  const res = await request({ path: "/archive", host: "evil.com", cookie: GOOD_COOKIE });
  assert.equal(res.status, 403);
});
