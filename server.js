const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = parseInt(process.env.PORT || "3000", 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "moneyup-db.json");
const OG_IMAGE_PATH = path.join(__dirname, "public", "og-moneyup-n16.jpg");

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const DEFAULT_CONTENDERS = [
  { friend_code: "NPC-TONE", name: "BigTone_N16", title: "WALL LEANER KING", avatar: "avatar_cpu1", rank: 12, winnings: 64.0, crowns: 280, best_dist: 0.012, leaners: 7, throws: 68, rounds_won: 14, jingles_won: 11, borough: "Block 13 • Milton Gardens", is_npc: true },
  { friend_code: "NPC-DEAN", name: "DeanoFlips", title: "JINGLES BOSS", avatar: "avatar_cpu2", rank: 9, winnings: 38.0, crowns: 195, best_dist: 0.019, leaners: 4, throws: 49, rounds_won: 9, jingles_won: 16, borough: "Chaucer Court • Floor 8", is_npc: true },
  { friend_code: "NPC-KING", name: "KingSovereign", title: "HACKNEY SOVEREIGN", avatar: "avatar_cpu1", rank: 24, winnings: 184.0, crowns: 620, best_dist: 0.004, leaners: 19, throws: 190, rounds_won: 44, jingles_won: 35, borough: "Dalston, E8", is_npc: true, global_only: true },
  { friend_code: "NPC-STOK", name: "StokeyAce", title: "WALL LEANER KING", avatar: "avatar_cpu2", rank: 19, winnings: 142.5, crowns: 510, best_dist: 0.008, leaners: 14, throws: 145, rounds_won: 33, jingles_won: 24, borough: "Stoke Newington, N16", is_npc: true, global_only: true },
  { friend_code: "NPC-BRCK", name: "BrickLaneBoss", title: "JINGLES BOSS", avatar: "avatar_cpu3", rank: 16, winnings: 98.0, crowns: 390, best_dist: 0.011, leaners: 11, throws: 102, rounds_won: 21, jingles_won: 29, borough: "Shoreditch, E1", is_npc: true, global_only: true },
  { friend_code: "NPC-SPEN", name: "SpenserGroveKid", title: "CURB SHARK", avatar: "avatar_cpu3", rank: 8, winnings: 28.0, crowns: 160, best_dist: 0.024, leaners: 3, throws: 38, rounds_won: 7, jingles_won: 8, borough: "Spenser Grove, N16", is_npc: true },
  { friend_code: "NPC-HOWD", name: "HowardRdShark", title: "CURB SHARK", avatar: "avatar_cpu1", rank: 6, winnings: 22.0, crowns: 130, best_dist: 0.038, leaners: 2, throws: 31, rounds_won: 5, jingles_won: 6, borough: "Howard Road, N16", is_npc: true },
  { friend_code: "NPC-JEZN", name: "Jez", title: "N16 ROOKIE", avatar: "avatar_cpu3", rank: 5, winnings: 16.0, crowns: 95, best_dist: 0.052, leaners: 1, throws: 22, rounds_won: 3, jingles_won: 4, borough: "Allen Road, N16", is_npc: true },
  { friend_code: "NPC-BESS", name: "Bess_N16", title: "N16 ROOKIE", avatar: "avatar_cpu2", rank: 3, winnings: 9.0, crowns: 60, best_dist: 0.085, leaners: 0, throws: 15, rounds_won: 1, jingles_won: 2, borough: "Milton Gardens Hall", is_npc: true }
];

let db = {
  profiles: {},
  friendships: [], // { a: code, b: code, status: "pending"|"accepted", requester: code, created_at, updated_at }
  rooms: {}
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadDb() {
  ensureDir(DATA_DIR);
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        db.profiles = parsed.profiles || {};
        db.friendships = Array.isArray(parsed.friendships) ? parsed.friendships : [];
        db.rooms = parsed.rooms || {};
      }
    }
  } catch (err) {
    console.error("Failed to load DB, starting fresh:", err.message);
  }
}

function saveDb() {
  try {
    ensureDir(DATA_DIR);
    const tmpPath = DB_PATH + ".tmp-" + crypto.randomBytes(4).toString("hex");
    fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), "utf8");
    fs.renameSync(tmpPath, DB_PATH);
  } catch (err) {
    console.error("Failed to save DB:", err.message);
  }
}

function randomCode(len) {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_CHARS[crypto.randomInt(0, CODE_CHARS.length)];
  }
  return out;
}

function generateFriendCode() {
  for (let tries = 0; tries < 50; tries++) {
    const code = "N16-" + randomCode(4);
    if (!db.profiles[code]) return code;
  }
  return "N16-" + randomCode(6);
}

function normalizeFriendCode(raw) {
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return "";
  if (s.startsWith("N16-") && s.length === 8) return s;
  if (/^[A-Z0-9]{4}$/.test(s)) return "N16-" + s;
  if (/^N16[A-Z0-9]{4}$/.test(s)) return "N16-" + s.slice(3);
  return s;
}

function generateRoomCode() {
  for (let tries = 0; tries < 50; tries++) {
    const code = randomCode(6);
    if (!db.rooms[code]) return code;
  }
  return randomCode(6);
}

function isOnline(lastSeen) {
  return Date.now() - Number(lastSeen || 0) < 120000;
}

function sanitizeProfile(p) {
  return {
    friend_code: p.friend_code,
    name: String(p.name || "PITCHER").slice(0, 16),
    avatar: String(p.avatar || "avatar_you"),
    title: String(p.title || "CURB SHARK"),
    rank: Number(p.rank || 1),
    xp: Number(p.xp || 0),
    crowns: Number(p.crowns || 0),
    winnings: Number(p.winnings || 0),
    best_dist: Number(p.best_dist ?? 99.0),
    leaners: Number(p.leaners || 0),
    jingles_won: Number(p.jingles_won || 0),
    rounds_won: Number(p.rounds_won || 0),
    throws: Number(p.throws || 0),
    borough: String(p.borough || "Chaucer Court, N16"),
    last_seen: Number(p.last_seen || Date.now()),
    online: isOnline(p.last_seen)
  };
}

function getPairKey(c1, c2) {
  return c1 < c2 ? [c1, c2] : [c2, c1];
}

function findFriendship(c1, c2) {
  const [a, b] = getPairKey(c1, c2);
  return db.friendships.find((f) => f.a === a && f.b === b);
}

function getActiveRoomForHost(hostCode) {
  const now = Date.now();
  for (const code of Object.keys(db.rooms)) {
    const r = db.rooms[code];
    if (r && r.host_code === hostCode && r.status === "lobby" && now - r.updated_at < 1800000) {
      return code;
    }
  }
  return "";
}

function cleanupOldRooms() {
  const now = Date.now();
  let changed = false;
  for (const code of Object.keys(db.rooms)) {
    const r = db.rooms[code];
    if (!r || now - r.updated_at > 3 * 3600 * 1000) {
      delete db.rooms[code];
      changed = true;
    }
  }
  if (changed) saveDb();
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    "Cache-Control": "public, max-age=60"
  });
  res.end(html);
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 262144) req.destroy();
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_e) {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function getOrigin(req) {
  const protoHeader = req.headers["x-forwarded-proto"];
  const proto = protoHeader ? String(protoHeader).split(",")[0].trim() : "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:" + PORT;
  return `${proto}://${host}`;
}

function buildSsrPage({ origin, title, description, pageUrl, badgeLabel, codeValue, subNote, playersHtml, extraActionHtml }) {
  const ogImg = `${origin}/assets/og-moneyup-n16.jpg`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="MONEY UP • Pitching Pennies N16" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(pageUrl)}" />
  <meta property="og:image" content="${escapeHtml(ogImg)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(ogImg)}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImg)}" />
  <style>
    :root { --bg:#071326; --card:#0d2444; --royal:#1474e0; --gold:#fac602; --emerald:#53ce17; --text:#ffffff; --silver:#b8c7e0; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:radial-gradient(circle at top, #12366b 0%, #061020 75%); color:var(--text); font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
    .card { width:100%; max-width:560px; background:var(--card); border:3px solid var(--royal); border-radius:24px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.55); }
    .hero { width:100%; aspect-ratio:1200/630; object-fit:cover; display:block; border-bottom:3px solid var(--gold); }
    .body { padding:22px; }
    .pill { display:inline-block; background:var(--gold); color:#1a1004; font-weight:800; font-size:12px; letter-spacing:1px; padding:5px 12px; border-radius:999px; margin-bottom:10px; text-transform:uppercase; }
    h1 { font-size:24px; line-height:1.2; margin-bottom:8px; }
    p.desc { color:var(--silver); font-size:15px; line-height:1.45; margin-bottom:18px; }
    .code-box { background:#061224; border:2px solid var(--royal); border-radius:16px; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }
    .code-val { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:26px; font-weight:900; letter-spacing:2px; color:var(--gold); }
    button.btn { background:var(--emerald); color:#071b04; border:none; border-radius:12px; padding:11px 16px; font-weight:900; font-size:14px; cursor:pointer; }
    button.btn:active { transform:scale(0.97); }
    .players { background:#081830; border:1px solid #1e4276; border-radius:14px; padding:12px 14px; margin-bottom:16px; }
    .players h3 { font-size:13px; color:var(--gold); text-transform:uppercase; margin-bottom:8px; letter-spacing:0.8px; }
    .player-row { font-size:14px; padding:4px 0; color:#eaf2ff; }
    .steps { font-size:14px; color:var(--silver); line-height:1.5; background:#091b36; padding:14px; border-radius:14px; }
    .steps b { color:#fff; }
  </style>
</head>
<body>
  <div class="card">
    <img class="hero" src="/assets/og-moneyup-n16.jpg" alt="MONEY UP Pitching Pennies N16" />
    <div class="body">
      <div class="pill">${escapeHtml(badgeLabel)}</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="desc">${escapeHtml(subNote || description)}</p>
      ${codeValue ? `<div class="code-box"><span class="code-val" id="codeVal">${escapeHtml(codeValue)}</span><button class="btn" onclick="navigator.clipboard&&navigator.clipboard.writeText('${escapeHtml(codeValue)}');this.textContent='COPIED!';">COPY CODE</button></div>` : ""}
      ${playersHtml || ""}
      ${extraActionHtml || ""}
      <div class="steps">
        <b>How to join on Android:</b><br/>
        1. Open <b>MONEY UP (Pitching Pennies N16)</b><br/>
        2. Tap <b>ONLINE</b> or <b>FRIENDS</b> at the bottom of the screen<br/>
        3. Enter the code above and pitch at the Chaucer Court wall!
      </div>
    </div>
  </div>
</body>
</html>`;
}

loadDb();

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  cleanupOldRooms();

  const reqUrl = new URL(req.url || "/", "http://localhost");
  const pathname = reqUrl.pathname;
  const origin = getOrigin(req);

  // 1. Health Check
  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "moneyup-n16",
      uptime: Math.round(process.uptime()),
      counts: {
        profiles: Object.keys(db.profiles).length,
        friendships: db.friendships.length,
        rooms: Object.keys(db.rooms).length
      }
    });
  }

  // 2. OG Image Asset (GET / HEAD)
  if ((req.method === "GET" || req.method === "HEAD") && pathname === "/assets/og-moneyup-n16.jpg") {
    try {
      const stat = fs.statSync(OG_IMAGE_PATH);
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Content-Length": stat.size,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*"
      });
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(OG_IMAGE_PATH).pipe(res);
    } catch (_err) {
      res.writeHead(404);
      return res.end("Not Found");
    }
  }

  // 3. Profile Upsert
  if (req.method === "POST" && pathname === "/api/profile") {
    const body = await parseBody(req);
    let code = normalizeFriendCode(body.friend_code);
    if (!code) code = generateFriendCode();
    const prev = db.profiles[code] || {};
    const merged = {
      friend_code: code,
      name: String(body.name || prev.name || "PITCHER").trim().slice(0, 16) || "PITCHER",
      avatar: String(body.avatar || prev.avatar || "avatar_you"),
      title: String(body.title || prev.title || "CURB SHARK"),
      rank: Math.max(1, Number(body.rank ?? prev.rank ?? 1)),
      xp: Math.max(0, Number(body.xp ?? prev.xp ?? 0)),
      crowns: Math.max(0, Number(body.crowns ?? prev.crowns ?? 0)),
      winnings: Math.max(Number(body.winnings ?? 0), Number(prev.winnings ?? 0)),
      best_dist: Math.min(Number(body.best_dist ?? 99.0), Number(prev.best_dist ?? 99.0)),
      leaners: Math.max(Number(body.leaners ?? 0), Number(prev.leaners ?? 0)),
      jingles_won: Math.max(Number(body.jingles_won ?? 0), Number(prev.jingles_won ?? 0)),
      rounds_won: Math.max(Number(body.rounds_won ?? 0), Number(prev.rounds_won ?? 0)),
      throws: Math.max(Number(body.throws ?? 0), Number(prev.throws ?? 0)),
      borough: String(body.borough || prev.borough || "Chaucer Court, N16"),
      last_seen: Date.now()
    };
    db.profiles[code] = merged;
    saveDb();
    return sendJson(res, 200, { ok: true, profile: sanitizeProfile(merged) });
  }

  // 4. Profile Heartbeat
  if (req.method === "POST" && pathname === "/api/profile/heartbeat") {
    const body = await parseBody(req);
    const code = normalizeFriendCode(body.friend_code);
    if (!code || !db.profiles[code]) {
      return sendJson(res, 404, { ok: false, error: "Profile not found" });
    }
    db.profiles[code].last_seen = Date.now();
    saveDb();
    return sendJson(res, 200, { ok: true, online: true, friend_code: code });
  }

  // 5. Get Profile
  if (req.method === "GET" && pathname.startsWith("/api/profile/")) {
    const code = normalizeFriendCode(decodeURIComponent(pathname.slice("/api/profile/".length)));
    const p = db.profiles[code];
    if (!p) return sendJson(res, 404, { ok: false, error: "Profile not found" });
    return sendJson(res, 200, { ok: true, profile: sanitizeProfile(p) });
  }

  // 6. Friends List
  if (req.method === "GET" && pathname === "/api/friends") {
    const myCode = normalizeFriendCode(reqUrl.searchParams.get("code"));
    if (!myCode) return sendJson(res, 400, { ok: false, error: "Missing code" });
    const friends = [];
    const incoming = [];
    const outgoing = [];
    for (const f of db.friendships) {
      if (f.a !== myCode && f.b !== myCode) continue;
      const otherCode = f.a === myCode ? f.b : f.a;
      const otherProf = db.profiles[otherCode]
        ? sanitizeProfile(db.profiles[otherCode])
        : { friend_code: otherCode, name: otherCode, avatar: "avatar_cpu1", title: "PITCHER", rank: 1, winnings: 0, online: false };
      const entry = {
        ...otherProf,
        active_room_code: f.status === "accepted" ? getActiveRoomForHost(otherCode) : ""
      };
      if (f.status === "accepted") {
        friends.push(entry);
      } else if (f.status === "pending") {
        if (f.requester === myCode) outgoing.push(entry);
        else incoming.push(entry);
      }
    }
    return sendJson(res, 200, { ok: true, friend_code: myCode, friends, incoming, outgoing });
  }

  // 7. Friend Actions
  if (req.method === "POST" && pathname === "/api/friends") {
    const body = await parseBody(req);
    const action = String(body.action || "").toLowerCase();
    const myCode = normalizeFriendCode(body.friend_code);
    const targetCode = normalizeFriendCode(body.target_code);
    if (!myCode || !targetCode) {
      return sendJson(res, 400, { ok: false, error: "Missing friend_code or target_code" });
    }
    if (myCode === targetCode) {
      return sendJson(res, 400, { ok: false, error: "Cannot add yourself" });
    }
    const [a, b] = getPairKey(myCode, targetCode);
    const existingIdx = db.friendships.findIndex((f) => f.a === a && f.b === b);

    if (action === "request") {
      if (!db.profiles[targetCode]) {
        return sendJson(res, 404, { ok: false, error: "No pitcher found with code " + targetCode });
      }
      if (existingIdx >= 0) {
        const ex = db.friendships[existingIdx];
        if (ex.status === "pending" && ex.requester !== myCode) {
          ex.status = "accepted";
          ex.updated_at = Date.now();
          saveDb();
          return sendJson(res, 200, { ok: true, status: "accepted", target_code: targetCode });
        }
        return sendJson(res, 200, { ok: true, status: ex.status, target_code: targetCode });
      }
      db.friendships.push({ a, b, status: "pending", requester: myCode, created_at: Date.now(), updated_at: Date.now() });
      saveDb();
      return sendJson(res, 200, { ok: true, status: "pending", target_code: targetCode });
    }

    if (action === "accept") {
      if (existingIdx < 0) return sendJson(res, 404, { ok: false, error: "Request not found" });
      db.friendships[existingIdx].status = "accepted";
      db.friendships[existingIdx].updated_at = Date.now();
      saveDb();
      return sendJson(res, 200, { ok: true, status: "accepted", target_code: targetCode });
    }

    if (action === "decline" || action === "remove") {
      if (existingIdx >= 0) {
        db.friendships.splice(existingIdx, 1);
        saveDb();
      }
      return sendJson(res, 200, { ok: true, status: "removed", target_code: targetCode });
    }

    return sendJson(res, 400, { ok: false, error: "Unknown friend action" });
  }

  // 8. Leaderboards
  if (req.method === "GET" && pathname === "/api/leaderboard") {
    const board = String(reqUrl.searchParams.get("board") || "n16").toLowerCase();
    const limit = Math.min(50, Math.max(5, parseInt(reqUrl.searchParams.get("limit") || "25", 10) || 25));

    const map = new Map();
    for (const c of DEFAULT_CONTENDERS) {
      if (board === "n16" && c.global_only) continue;
      map.set(c.friend_code, { ...c, online: false });
    }
    for (const code of Object.keys(db.profiles)) {
      map.set(code, sanitizeProfile(db.profiles[code]));
    }

    const entries = Array.from(map.values());
    if (board === "precision") {
      entries.sort((x, y) => {
        const dx = Number(x.best_dist ?? 99.0);
        const dy = Number(y.best_dist ?? 99.0);
        if (Math.abs(dx - dy) > 0.0005) return dx - dy;
        return Number(y.leaners || 0) - Number(x.leaners || 0);
      });
    } else {
      entries.sort((x, y) => {
        const wx = Number(x.winnings || 0);
        const wy = Number(y.winnings || 0);
        if (Math.abs(wx - wy) > 0.005) return wy - wx;
        return Number(y.crowns || 0) - Number(x.crowns || 0);
      });
    }

    return sendJson(res, 200, { ok: true, board, entries: entries.slice(0, limit) });
  }

  // 9. Room Invites (MUST be checked BEFORE /api/rooms/:code)
  if (req.method === "GET" && pathname === "/api/rooms/invites") {
    const myCode = normalizeFriendCode(reqUrl.searchParams.get("code"));
    const now = Date.now();
    const friendSet = new Set();
    if (myCode) {
      for (const f of db.friendships) {
        if (f.status === "accepted" && (f.a === myCode || f.b === myCode)) {
          friendSet.add(f.a === myCode ? f.b : f.a);
        }
      }
    }
    const invites = [];
    for (const code of Object.keys(db.rooms)) {
      const r = db.rooms[code];
      if (!r || r.status !== "lobby" || now - r.updated_at > 1800000) continue;
      if (r.host_code === myCode) continue;
      if ((myCode && r.invited_code === myCode) || friendSet.has(r.host_code)) {
        const hostPlayer = r.players[0] || {};
        invites.push({
          code: r.code,
          host_code: r.host_code,
          host_name: hostPlayer.name || r.host_code,
          players_count: r.players.length,
          coin_worth: r.coin_worth,
          currency: r.currency,
          total_rounds: r.total_rounds,
          scoring_mode: r.scoring_mode,
          share_url: `${origin}/join/${r.code}`
        });
      }
    }
    return sendJson(res, 200, { ok: true, invites });
  }

  // 10. Get Room State
  if (req.method === "GET" && pathname.startsWith("/api/rooms/")) {
    const code = String(pathname.slice("/api/rooms/".length)).trim().toUpperCase();
    const room = db.rooms[code];
    if (!room) return sendJson(res, 404, { ok: false, error: "Room not found" });
    return sendJson(res, 200, { ok: true, room, share_url: `${origin}/join/${room.code}` });
  }

  // 11. Room Mutations
  if (req.method === "POST" && pathname === "/api/rooms") {
    const body = await parseBody(req);
    const action = String(body.action || "").toLowerCase();
    const playerCode = normalizeFriendCode(body.friend_code);

    if (action === "create") {
      if (!playerCode) return sendJson(res, 400, { ok: false, error: "Missing friend_code" });
      const prof = db.profiles[playerCode] || {};
      const hostName = String(body.name || prof.name || "HOST").slice(0, 16);
      const hostAvatar = String(body.avatar || prof.avatar || "avatar_you");
      const code = generateRoomCode();
      const now = Date.now();
      const room = {
        code,
        host_code: playerCode,
        status: "lobby",
        round: 1,
        total_rounds: Math.max(1, Math.min(20, Number(body.total_rounds || 5))),
        throws_per_round: Math.max(1, Math.min(10, Number(body.throws_per_round || 1))),
        coin_worth: Math.max(0.5, Number(body.coin_worth || 1.0)),
        currency: String(body.currency || "£"),
        scoring_mode: String(body.scoring_mode || "tips"),
        invited_code: normalizeFriendCode(body.invited_code || ""),
        turn_idx: 0,
        seq: 0,
        players: [{ friend_code: playerCode, name: hostName, avatar: hostAvatar, is_host: true }],
        events: [],
        created_at: now,
        updated_at: now
      };
      db.rooms[code] = room;
      saveDb();
      const stake = Number(room.coin_worth * room.throws_per_round).toFixed(2);
      const shareUrl = `${origin}/join/${code}?from=${encodeURIComponent(hostName)}&stake=${encodeURIComponent(stake)}`;
      return sendJson(res, 200, { ok: true, room, share_url: shareUrl });
    }

    const roomCode = String(body.room_code || "").trim().toUpperCase();
    const room = db.rooms[roomCode];
    if (!room) return sendJson(res, 404, { ok: false, error: "Room " + roomCode + " not found" });

    if (action === "join") {
      if (!playerCode) return sendJson(res, 400, { ok: false, error: "Missing friend_code" });
      const existing = room.players.find((p) => p.friend_code === playerCode);
      if (!existing) {
        if (room.status !== "lobby") {
          return sendJson(res, 409, { ok: false, error: "Match already in progress" });
        }
        if (room.players.length >= 4) {
          return sendJson(res, 409, { ok: false, error: "Room is full (max 4)" });
        }
        const prof = db.profiles[playerCode] || {};
        room.players.push({
          friend_code: playerCode,
          name: String(body.name || prof.name || playerCode).slice(0, 16),
          avatar: String(body.avatar || prof.avatar || "avatar_cpu1"),
          is_host: false
        });
        room.updated_at = Date.now();
        saveDb();
      }
      return sendJson(res, 200, { ok: true, room, share_url: `${origin}/join/${room.code}` });
    }

    if (action === "start") {
      if (room.host_code !== playerCode) {
        return sendJson(res, 403, { ok: false, error: "Only host can start match" });
      }
      room.status = "playing";
      room.seq += 1;
      room.events.push({ seq: room.seq, type: "match_started", player_code: playerCode, ts: Date.now() });
      room.updated_at = Date.now();
      saveDb();
      return sendJson(res, 200, { ok: true, room });
    }

    if (action === "throw") {
      room.seq += 1;
      const ev = {
        seq: room.seq,
        type: "throw",
        round: Number(body.round || room.round),
        player_code: playerCode,
        player_idx: Number(body.player_idx ?? 0),
        power: Number(body.power ?? 0.2),
        aim_x: Number(body.aim_x ?? 0.0),
        arc_idx: Number(body.arc_idx ?? 1),
        dist: Number(body.dist ?? 0.5),
        result: Number(body.result ?? 1),
        hit_wall: Boolean(body.hit_wall),
        final_pos: Array.isArray(body.final_pos) ? body.final_pos : [0, 0.06, 0.5],
        ts: Date.now()
      };
      room.events.push(ev);
      if (room.events.length > 120) room.events = room.events.slice(-120);
      room.turn_idx = (room.turn_idx + 1) % Math.max(1, room.players.length);
      room.updated_at = Date.now();
      saveDb();
      return sendJson(res, 200, { ok: true, room, event: ev });
    }

    if (action === "jingles_call" || action === "jingles_result") {
      room.seq += 1;
      const ev = {
        seq: room.seq,
        type: action,
        player_code: playerCode,
        face: String(body.face || "heads"),
        power: Number(body.power ?? 0.45),
        won: Number(body.won ?? 0),
        result: String(body.result || ""),
        ts: Date.now()
      };
      room.events.push(ev);
      if (room.events.length > 120) room.events = room.events.slice(-120);
      room.updated_at = Date.now();
      saveDb();
      return sendJson(res, 200, { ok: true, room, event: ev });
    }

    if (action === "next_round") {
      room.round += 1;
      room.turn_idx = 0;
      room.seq += 1;
      room.events.push({ seq: room.seq, type: "next_round", round: room.round, player_code: playerCode, ts: Date.now() });
      room.updated_at = Date.now();
      saveDb();
      return sendJson(res, 200, { ok: true, room });
    }

    if (action === "leave") {
      room.players = room.players.filter((p) => p.friend_code !== playerCode);
      if (room.players.length === 0) {
        delete db.rooms[roomCode];
      } else {
        if (room.host_code === playerCode) {
          room.host_code = room.players[0].friend_code;
          room.players[0].is_host = true;
        }
        room.updated_at = Date.now();
      }
      saveDb();
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 400, { ok: false, error: "Unknown room action" });
  }

  // 12. SSR WhatsApp / Browser Landing Pages (/, /join/:code, /invite/:code)
  if (req.method === "GET" && pathname.startsWith("/join/")) {
    const code = String(pathname.slice("/join/".length)).split("/")[0].trim().toUpperCase();
    const room = db.rooms[code];
    const fromParam = reqUrl.searchParams.get("from") || (room && room.players[0] ? room.players[0].name : "An N16 Pitcher");
    const stakeParam = reqUrl.searchParams.get("stake") || (room ? `${room.currency || "£"}${Number(room.coin_worth * room.throws_per_round).toFixed(2)}` : "£1.00");
    const stakeText = String(stakeParam).startsWith("£") || String(stakeParam).startsWith("$") ? stakeParam : `£${stakeParam}`;
    const playersHtml = room
      ? `<div class="players"><h3>Players in Lobby (${room.players.length}/4)</h3>${room.players.map((p, idx) => `<div class="player-row">${idx + 1}. <b>${escapeHtml(p.name)}</b> (${escapeHtml(p.friend_code)})</div>`).join("")}</div>`
      : "";
    return sendHtml(res, 200, buildSsrPage({
      origin,
      title: `${fromParam} challenged you to Money Up N16! Room ${code} • ${stakeText} Stake`,
      description: `Join Chaucer Court wall pitching & Jingles in Room ${code} (${stakeText} stake). Closest pound coin to the brick wall wins the pot!`,
      pageUrl: `${origin}/join/${encodeURIComponent(code)}`,
      badgeLabel: "Online Match Invite • Chaucer Court N16",
      codeValue: code,
      subNote: room ? `Live lobby active • ${room.total_rounds} rounds • ${room.scoring_mode.toUpperCase()}` : "Open Money Up N16 and enter this room code to join the match.",
      playersHtml
    }));
  }

  if (req.method === "GET" && pathname.startsWith("/invite/")) {
    const fCode = normalizeFriendCode(decodeURIComponent(pathname.slice("/invite/".length).split("/")[0]));
    const prof = db.profiles[fCode];
    const name = reqUrl.searchParams.get("name") || (prof ? prof.name : fCode);
    return sendHtml(res, 200, buildSsrPage({
      origin,
      title: `Add ${name} (${fCode}) on Money Up • Pitching Pennies N16`,
      description: `Add ${name} as a friend (${fCode}) on Money Up N16, track estate rankings, and pitch coins at Chaucer Court!`,
      pageUrl: `${origin}/invite/${encodeURIComponent(fCode)}`,
      badgeLabel: "Friend Code Invite • Hackney N16",
      codeValue: fCode,
      subNote: prof ? `Rank ${String(prof.rank).padStart(2, "0")} • ${prof.title} • £${Number(prof.winnings).toFixed(2)} Career Winnings` : "Add this pitcher in the FRIENDS tab to play online matches together."
    }));
  }

  // Default Home SSR Page (/)
  const fromHome = reqUrl.searchParams.get("from");
  const codeHome = reqUrl.searchParams.get("code");
  return sendHtml(res, 200, buildSsrPage({
    origin,
    title: fromHome
      ? `${fromHome} is playing MONEY UP — Pitching Pennies N16!`
      : "MONEY UP — Pitching Pennies • Chaucer Court N16",
    description: "Pitch £1 coins against the Chaucer Court red-brick wall in Hackney N16. Play Pass & Play, CPU, Online Rooms & Jingles!",
    pageUrl: origin + "/",
    badgeLabel: "Chaucer Court • Shakespeare Walk N16",
    codeValue: codeHome || "",
    subNote: codeHome ? `Add ${fromHome || "this pitcher"} using Friend Code ${codeHome} in the FRIENDS tab.` : "Real 3D coin physics, 45° Wall Leaners, Jingles Shake & Toss, Pass & Play, and live Online Rooms."
  }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[moneyup-n16] Listening on 0.0.0.0:${PORT}, DATA_DIR=${DATA_DIR}`);
});
