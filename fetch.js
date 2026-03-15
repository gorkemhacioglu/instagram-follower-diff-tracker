// =============================================================
// Instagram Followers & Following Tracker v3
// Run in browser console while logged into instagram.com
// Tracks ANY public account over time — shows diffs between snapshots
// Uses GraphQL API with REST fallback. Data persisted in localStorage.
// =============================================================

(async function () {
  "use strict";

  const DELAY_MS = 2000;       // delay between requests
  const MAX_RETRIES = 10;      // retries per failed page
  const STORAGE_KEY = "ig_tracker_data";

  // --- Debug log ---
  const debugLog = [];
  function log(msg, data) {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
    debugLog.push(data ? entry + " " + JSON.stringify(data).slice(0, 300) : entry);
    console.log("[IG-Tracker]", msg, data || "");
  }

  // --- Storage helpers ---
  function loadAllData() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
  }
  function saveAllData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  function getSnapshots(username) {
    const data = loadAllData();
    return (data[username] || []).sort((a, b) => b.timestamp - a.timestamp);
  }
  function saveSnapshot(username, followersList, followingList) {
    const data = loadAllData();
    if (!data[username]) data[username] = [];
    // Normalize: lowercase, sort, dedup
    const norm = (arr) => [...new Set(arr.map(u => u.username.toLowerCase()))].sort();
    const detailMap = {};
    for (const u of [...followersList, ...followingList]) {
      const key = u.username.toLowerCase();
      if (!detailMap[key]) detailMap[key] = { ...u, username: key };
    }
    data[username].push({
      timestamp: Date.now(),
      followers: norm(followersList),
      following: norm(followingList),
      details: detailMap
    });
    saveAllData(data);
  }
  function getTrackedUsernames() {
    return Object.keys(loadAllData()).sort();
  }
  function deleteUserData(username) {
    const data = loadAllData();
    delete data[username];
    saveAllData(data);
  }
  function deleteSnapshot(username, timestamp) {
    const data = loadAllData();
    if (data[username]) {
      data[username] = data[username].filter(s => s.timestamp !== timestamp);
      if (data[username].length === 0) delete data[username];
      saveAllData(data);
    }
  }

  // --- Diff logic ---
  function diffSets(oldArr, newArr) {
    const oldSet = new Set(oldArr);
    const newSet = new Set(newArr);
    return {
      added: newArr.filter(u => !oldSet.has(u)),
      removed: oldArr.filter(u => !newSet.has(u))
    };
  }

  // --- UI ---
  const overlay = document.createElement("div");
  overlay.id = "ig-fetcher-overlay";
  Object.assign(overlay.style, {
    position: "fixed", top: "0", right: "0", bottom: "0", left: "0",
    background: "rgba(0,0,0,0.75)", zIndex: "999999",
    display: "flex", justifyContent: "center", alignItems: "flex-start",
    paddingTop: "30px", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
    color: "#fff", overflowY: "auto"
  });
  const container = document.createElement("div");
  Object.assign(container.style, {
    background: "#1a1a2e", borderRadius: "12px", padding: "24px",
    width: "800px", maxHeight: "92vh", overflowY: "auto",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
  });

  const tracked = getTrackedUsernames();
  const histOpts = tracked.map(u => `<option value="${u}">${u}</option>`).join("");

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0;font-size:20px;">IG Tracker v3</h2>
      <button id="ig-close-btn" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer">✕</button>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:14px;align-items:center">
      <input id="ig-username" type="text" placeholder="Enter target username (public accounts)" spellcheck="false"
        style="flex:1;padding:9px 14px;border-radius:6px;border:1px solid #333;background:#16213e;color:#fff;font-size:14px;outline:none" />
      <button id="ig-start-btn" style="padding:9px 22px;border:none;border-radius:6px;background:#0095f6;color:#fff;cursor:pointer;font-size:14px;white-space:nowrap">Fetch Now</button>
    </div>
    <div id="ig-status" style="margin-bottom:6px;color:#aaa;font-size:13px;">Enter a username and click Fetch Now.</div>
    <div id="ig-progress" style="margin-bottom:12px;height:4px;background:#333;border-radius:2px;overflow:hidden">
      <div id="ig-progress-bar" style="height:100%;width:0%;background:#0095f6;transition:width 0.3s"></div>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <button id="ig-export-btn" class="ig-btn" disabled>Export CSV</button>
      <button id="ig-copy-btn" class="ig-btn" disabled>Copy Usernames</button>
      <button id="ig-export-all-btn" class="ig-btn">Export All (JSON)</button>
      <button id="ig-import-btn" class="ig-btn">Import (JSON)</button>
      <button id="ig-show-log-btn" class="ig-btn">Show Debug Log</button>
      <input id="ig-import-file" type="file" accept=".json" style="display:none" />
    </div>
    <div style="display:flex;gap:10px;margin-bottom:14px;align-items:center;flex-wrap:wrap">
      <input id="ig-check-user" type="text" placeholder="Check relationship with a username…" spellcheck="false"
        style="flex:1;padding:7px 12px;border-radius:6px;border:1px solid #333;background:#16213e;color:#fff;font-size:13px;outline:none;min-width:200px" />
      <button id="ig-check-btn" class="ig-btn" style="background:#8e44ad">Check Status</button>
      <button id="ig-find-missing-btn" class="ig-btn" style="background:#e67e22">Find Missing Users</button>
    </div>
    <div id="ig-tabs" style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <button class="ig-tab active" data-tab="followers">Followers (0)</button>
      <button class="ig-tab" data-tab="following">Following (0)</button>
      <button class="ig-tab" data-tab="not-following-back">Not Following Back (0)</button>
      <button class="ig-tab" data-tab="fans-only">Fans Only (0)</button>
    </div>
    <div id="ig-list" style="max-height:350px;overflow-y:auto;background:#16213e;border-radius:8px;padding:12px;margin-bottom:18px"></div>
    <div style="border-top:1px solid #333;padding-top:16px">
      <h3 style="margin:0 0 10px;font-size:16px;">History & Compare</h3>
      <div style="display:flex;gap:10px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
        <select id="ig-hist-user" style="padding:7px 10px;border-radius:6px;border:1px solid #333;background:#16213e;color:#fff;font-size:13px;min-width:150px">
          <option value="">— Select user (${tracked.length} tracked) —</option>${histOpts}
        </select>
        <button id="ig-show-history-btn" class="ig-btn">Show Snapshots</button>
        <button id="ig-compare-btn" class="ig-btn" disabled>Compare Selected</button>
        <button id="ig-delete-user-btn" class="ig-btn" style="background:#c0392b!important">Delete User</button>
      </div>
      <div id="ig-history-list" style="max-height:200px;overflow-y:auto;background:#16213e;border-radius:8px;padding:10px;margin-bottom:12px;font-size:13px;color:#aaa"></div>
      <div id="ig-diff-result" style="max-height:400px;overflow-y:auto;background:#16213e;border-radius:8px;padding:12px;font-size:13px"></div>
    </div>
    <div id="ig-debug-panel" style="display:none;border-top:1px solid #333;padding-top:16px;margin-top:16px">
      <h3 style="margin:0 0 10px;font-size:16px;">Debug Log</h3>
      <div id="ig-debug-log" style="max-height:300px;overflow-y:auto;background:#0a0a1a;border-radius:8px;padding:12px;font-size:11px;font-family:monospace;color:#8f8;white-space:pre-wrap"></div>
    </div>
    <style>
      .ig-btn{padding:7px 16px;border:none;border-radius:6px;background:#333;color:#fff;cursor:pointer;font-size:13px}
      .ig-btn:hover{background:#444}.ig-btn:disabled{opacity:.4;cursor:default}
      .ig-tab{padding:6px 14px;border:none;border-radius:6px;background:#333;color:#fff;cursor:pointer;font-size:13px}
      .ig-tab:hover{background:#444}.ig-tab.active{background:#0095f6}
      #ig-fetcher-overlay a{color:#0095f6;text-decoration:none}
      #ig-fetcher-overlay a:hover{text-decoration:underline}
      .ig-row{padding:5px 8px;border-bottom:1px solid #1a1a3e;display:flex;justify-content:space-between;align-items:center}
      .ig-added{color:#2ecc71}.ig-removed{color:#e74c3c}
    </style>
  `;
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  // --- Refs ---
  const $ = id => document.getElementById(id);
  const usernameInput = $("ig-username"), statusEl = $("ig-status"), listEl = $("ig-list");
  const progressBar = $("ig-progress-bar");
  const startBtn = $("ig-start-btn"), exportBtn = $("ig-export-btn"), copyBtn = $("ig-copy-btn");
  const exportAllBtn = $("ig-export-all-btn"), importBtn = $("ig-import-btn"), importFile = $("ig-import-file");
  const closeBtn = $("ig-close-btn"), showLogBtn = $("ig-show-log-btn");
  const tabs = document.querySelectorAll(".ig-tab");
  const histUser = $("ig-hist-user"), showHistBtn = $("ig-show-history-btn");
  const compareBtn = $("ig-compare-btn"), deleteUserBtn = $("ig-delete-user-btn");
  const historyListEl = $("ig-history-list"), diffResultEl = $("ig-diff-result");
  const debugPanel = $("ig-debug-panel"), debugLogEl = $("ig-debug-log");

  let followers = [], following = [], currentTarget = "", activeTab = "followers";
  let profileInfo = null; // { id, followerCount, followingCount }

  const checkUserInput = $("ig-check-user"), checkBtn = $("ig-check-btn");
  const findMissingBtn = $("ig-find-missing-btn");

  closeBtn.addEventListener("click", () => overlay.remove());

  // --- Helpers ---
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function setStatus(msg) { statusEl.textContent = msg; }
  function setProgress(pct) { progressBar.style.width = Math.min(100, Math.max(0, pct)) + "%"; }
  function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  function fmtDate(ts) { return new Date(ts).toLocaleString(); }

  function getCSRFToken() {
    const m = document.cookie.match(/csrftoken=([^;]+)/);
    return m ? m[1] : "";
  }

  function getAppId() {
    // Try to extract from page scripts, fallback to known ID
    try {
      for (const s of document.querySelectorAll('script[type="application/json"]')) {
        const m = s.textContent.match(/"APP_ID"\s*:\s*"(\d+)"/);
        if (m) return m[1];
      }
    } catch {}
    return "936619743392459";
  }

  const IG_APP_ID = getAppId();
  log("App ID: " + IG_APP_ID);

  // Common headers
  function apiHeaders() {
    return {
      "x-ig-app-id": IG_APP_ID,
      "x-csrftoken": getCSRFToken(),
      "x-requested-with": "XMLHttpRequest",
      "x-ig-www-claim": sessionStorage.getItem("www-claim-v2") || "0"
    };
  }

  // --- Friendship status check ---
  async function checkFriendshipStatus(targetUsername) {
    log("Checking friendship with: " + targetUsername);
    // First get the user ID
    let targetId, targetUser;
    try {
      const resp = await fetch(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(targetUsername)}`, {
        headers: apiHeaders(), credentials: "include"
      });
      if (resp.ok) {
        const json = await resp.json();
        targetUser = json?.data?.user;
        targetId = targetUser?.id;
      }
    } catch (e) { log("Profile lookup error: " + e.message); }

    if (!targetId) {
      return { username: targetUsername, status: "NOT_FOUND", message: "Account not found — may be deleted, deactivated, or username changed." };
    }

    const result = {
      username: targetUsername,
      userId: targetId,
      fullName: targetUser?.full_name || "",
      isPrivate: !!targetUser?.is_private,
      isVerified: !!targetUser?.is_verified,
    };

    // Check friendship status
    try {
      const resp = await fetch(`/api/v1/friendships/show/${targetId}/`, {
        headers: apiHeaders(), credentials: "include"
      });
      if (resp.ok) {
        const data = await resp.json();
        log("Friendship data", data);
        result.following = !!data.following;           // you follow them
        result.followedBy = !!data.followed_by;        // they follow you
        result.blocking = !!data.blocking;              // you blocked them
        result.blockedBy = !!data.blocked_by_user;      // they blocked you (unreliable — IG often hides this)
        result.isRestricted = !!data.is_restricted;     // you restricted them
        result.isMutingReel = !!data.muting;
        result.outgoingRequest = !!data.outgoing_request; // you requested to follow (pending)
        result.incomingRequest = !!data.incoming_request; // they requested you
        result.isBestie = !!data.is_bestie;
        result.isCloseFriend = !!data.is_close_friend;
        result.rawData = data;
      } else {
        result.friendshipError = `HTTP ${resp.status}`;
        log("Friendship API error: " + resp.status);
      }
    } catch (e) {
      result.friendshipError = e.message;
      log("Friendship API error: " + e.message);
    }

    // Determine overall status
    if (result.blocking) result.statusLabel = "YOU BLOCKED THEM";
    else if (result.blockedBy) result.statusLabel = "THEY BLOCKED YOU";
    else if (result.following && result.followedBy) result.statusLabel = "MUTUAL";
    else if (result.following && !result.followedBy) result.statusLabel = "YOU FOLLOW THEM (they don't follow back)";
    else if (!result.following && result.followedBy) result.statusLabel = "THEY FOLLOW YOU (you don't follow back)";
    else if (result.outgoingRequest) result.statusLabel = "PENDING (you requested)";
    else result.statusLabel = "NO RELATIONSHIP";

    return result;
  }

  function renderFriendshipResult(r) {
    if (r.status === "NOT_FOUND") {
      return `<div style="padding:14px;background:#1a1a2e;border-radius:8px;border:1px solid #c0392b;margin-top:8px">
        <div style="font-size:15px;font-weight:600;color:#e74c3c">@${escapeHtml(r.username)} — NOT FOUND</div>
        <div style="color:#aaa;margin-top:6px;font-size:13px">${escapeHtml(r.message)}</div>
        <div style="color:#888;margin-top:4px;font-size:12px">This could mean: deleted account, deactivated, or banned by Instagram.</div>
      </div>`;
    }
    const colors = {
      "YOU BLOCKED THEM": "#e67e22",
      "THEY BLOCKED YOU": "#e74c3c",
      "MUTUAL": "#2ecc71",
      "NO RELATIONSHIP": "#888"
    };
    const color = colors[r.statusLabel] || "#0095f6";
    const flags = [
      r.following ? "✅ You follow them" : "❌ You don't follow them",
      r.followedBy ? "✅ They follow you" : "❌ They don't follow you",
      r.blocking ? "🚫 You blocked them" : null,
      r.blockedBy ? "⛔ They blocked you" : null,
      r.isRestricted ? "⚠️ You restricted them" : null,
      r.outgoingRequest ? "⏳ Follow request pending" : null,
      r.isPrivate ? "🔒 Private account" : "🌐 Public account",
      r.isVerified ? "✔ Verified" : null,
    ].filter(Boolean);

    return `<div style="padding:14px;background:#1a1a2e;border-radius:8px;border:1px solid ${color};margin-top:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><span style="font-size:15px;font-weight:600"><a href="https://instagram.com/${escapeHtml(r.username)}" target="_blank" rel="noopener">@${escapeHtml(r.username)}</a></span>
          ${r.fullName ? `<span style="color:#888;margin-left:8px">${escapeHtml(r.fullName)}</span>` : ""}</div>
        <span style="color:${color};font-weight:700;font-size:13px">${escapeHtml(r.statusLabel)}</span>
      </div>
      <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px">
        ${flags.map(f => `<span style="background:#16213e;padding:3px 10px;border-radius:4px;font-size:12px">${f}</span>`).join("")}
      </div>
      ${r.friendshipError ? `<div style="color:#e74c3c;margin-top:6px;font-size:12px">⚠ Friendship API error: ${escapeHtml(r.friendshipError)}</div>` : ""}
      <div style="color:#555;margin-top:8px;font-size:11px">Note: Instagram often hides the \"blocked_by\" flag. If someone blocked you, they usually just won't appear in follower lists and the API returns blocked_by=false. A \"NOT FOUND\" result is stronger evidence of being blocked.</div>
    </div>`;
  }

  // Check user button handler
  checkBtn.addEventListener("click", async () => {
    const target = checkUserInput.value.trim().replace(/^@/, "").toLowerCase();
    if (!target) { setStatus("Enter a username to check."); return; }
    checkBtn.disabled = true; checkBtn.textContent = "Checking…";
    setStatus(`Checking @${target}…`);
    try {
      const result = await checkFriendshipStatus(target);
      diffResultEl.innerHTML = renderFriendshipResult(result);
      setStatus(`Checked @${target}: ${result.statusLabel || result.status}`);
      log("Check result", result);
    } catch (e) {
      setStatus(`Error checking @${target}: ${e.message}`);
      log("Check error: " + e.message);
    }
    checkBtn.disabled = false; checkBtn.textContent = "Check Status";
  });
  checkUserInput.addEventListener("keydown", e => { if (e.key === "Enter") checkBtn.click(); });

  // Find missing users — compare fetched list vs previous snapshot to detect who disappeared
  findMissingBtn.addEventListener("click", async () => {
    if (!currentTarget && !histUser.value) {
      setStatus("Fetch a user first or select one from history.");
      return;
    }
    const username = currentTarget || histUser.value;
    const snaps = getSnapshots(username);
    if (snaps.length < 2) {
      setStatus("Need at least 2 snapshots to find missing users. Fetch again later.");
      return;
    }

    findMissingBtn.disabled = true; findMissingBtn.textContent = "Analyzing…";
    setStatus("Analyzing snapshots for missing users…");

    // Get the two most recent snapshots
    const newest = snaps[0];
    const previous = snaps[1];

    // Users in previous but not in newest (potential blocks/deactivations)
    const missingFollowers = previous.followers.filter(u => !newest.followers.includes(u));
    const missingFollowing = previous.following.filter(u => !newest.following.includes(u));
    const allMissing = [...new Set([...missingFollowers, ...missingFollowing])];

    if (allMissing.length === 0 && newest.followers.length >= (profileInfo?.followerCount || 0) && newest.following.length >= (profileInfo?.followingCount || 0)) {
      diffResultEl.innerHTML = `<div style="text-align:center;padding:20px;color:#2ecc71;font-size:15px;font-weight:600">✓ No missing users detected</div>`;
      setStatus("No missing users found.");
      findMissingBtn.disabled = false; findMissingBtn.textContent = "Find Missing Users";
      return;
    }

    let html = `<div style="margin-bottom:12px;color:#aaa;font-size:13px">
      <b>Missing Users Analysis</b> for @${escapeHtml(username)}<br>
      Comparing snapshot #${snaps.length} (${fmtDate(previous.timestamp)}) → #${snaps.length - 0} (${fmtDate(newest.timestamp)})<br>
      <span style="color:#e67e22">Profile says ${profileInfo?.followerCount || "?"} followers, ${profileInfo?.followingCount || "?"} following — 
      API returned ${newest.followers.length} followers, ${newest.following.length} following</span>
    </div>`;

    if (allMissing.length > 0) {
      html += `<div style="margin-bottom:8px;font-size:14px;font-weight:600;color:#e74c3c">${allMissing.length} user(s) disappeared between snapshots:</div>`;
      setStatus(`Checking ${allMissing.length} missing users…`);

      for (const uname of allMissing) {
        const inFollowers = missingFollowers.includes(uname);
        const inFollowing = missingFollowing.includes(uname);
        const where = [inFollowers ? "followers" : "", inFollowing ? "following" : ""].filter(Boolean).join(" & ");

        try {
          const result = await checkFriendshipStatus(uname);
          html += `<div style="border-left:3px solid ${result.status === 'NOT_FOUND' ? '#e74c3c' : '#e67e22'};padding:8px 12px;margin:6px 0;background:#111;border-radius:0 6px 6px 0">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span><a href="https://instagram.com/${escapeHtml(uname)}" target="_blank" rel="noopener">@${escapeHtml(uname)}</a>
                <span style="color:#888;font-size:11px">— was in: ${where}</span></span>
              <span style="font-size:12px;font-weight:600;color:${result.status === 'NOT_FOUND' ? '#e74c3c' : result.blocking ? '#e67e22' : result.blockedBy ? '#e74c3c' : '#888'}">
                ${escapeHtml(result.statusLabel || result.status)}</span>
            </div>
            ${result.status === 'NOT_FOUND' ? '<div style="color:#e74c3c;font-size:11px;margin-top:3px">⚠ Account deleted/deactivated/banned OR they blocked you</div>' : ''}
            ${result.blocking ? '<div style="color:#e67e22;font-size:11px;margin-top:3px">You have this account blocked</div>' : ''}
          </div>`;
          await sleep(500); // small delay between checks
        } catch (e) {
          html += `<div style="border-left:3px solid #888;padding:8px 12px;margin:6px 0;background:#111;border-radius:0 6px 6px 0">
            @${escapeHtml(uname)} — <span style="color:#e74c3c">Error checking: ${escapeHtml(e.message)}</span>
          </div>`;
        }
      }
    } else {
      html += `<div style="padding:12px;color:#e67e22;font-size:13px">
        No users disappeared between snapshots, but the count still doesn't match.<br>
        The ${(profileInfo?.followerCount || 0) - newest.followers.length} missing follower(s) and 
        ${(profileInfo?.followingCount || 0) - newest.following.length} missing following are accounts
        that were <b>never</b> in any snapshot — likely blocked/deactivated accounts that Instagram counts but the API can't return.
      </div>`;
    }

    html += `<div style="margin-top:14px;padding:10px;background:#0a0a1a;border-radius:6px;font-size:11px;color:#888">
      <b>How to interpret:</b><br>
      • <b>NOT_FOUND</b> = Account deleted, deactivated, or they blocked you (strongest signal)<br>
      • <b>YOU BLOCKED THEM</b> = You blocked them; they still count in totals<br>
      • <b>NO RELATIONSHIP</b> = They unfollowed/you unfollowed (normal churn)<br>
      • <b>MUTUAL/FOLLOWS</b> = API pagination missed them (re-fetch should fix)<br>
      • Instagram hides the "blocked_by" flag, so a block from their side usually shows as NOT_FOUND
    </div>`;

    diffResultEl.innerHTML = html;
    setStatus(`Analysis complete. ${allMissing.length} missing user(s) checked.`);
    findMissingBtn.disabled = false; findMissingBtn.textContent = "Find Missing Users";
  });

  // --- Fetch profile info (user ID + counts) ---
  async function fetchProfile(username) {
    log("Fetching profile for: " + username);

    // Method 1: web_profile_info API
    try {
      const resp = await fetch(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
        headers: apiHeaders(), credentials: "include"
      });
      log("web_profile_info status: " + resp.status);
      if (resp.ok) {
        const json = await resp.json();
        const user = json?.data?.user;
        if (user) {
          const info = {
            id: user.id,
            username: user.username,
            followerCount: user.edge_followed_by?.count ?? user.follower_count ?? 0,
            followingCount: user.edge_follow?.count ?? user.following_count ?? 0,
            isPrivate: user.is_private
          };
          log("Profile found via web_profile_info", info);
          return info;
        }
      }
    } catch (e) { log("web_profile_info error: " + e.message); }

    // Method 2: graphql user page
    try {
      const resp = await fetch(`/${encodeURIComponent(username)}/?__a=1&__d=dis`, {
        headers: apiHeaders(), credentials: "include"
      });
      log("__a=1 status: " + resp.status);
      if (resp.ok) {
        const json = await resp.json();
        const user = json?.graphql?.user || json?.user;
        if (user) {
          const info = {
            id: user.id,
            username: user.username,
            followerCount: user.edge_followed_by?.count ?? 0,
            followingCount: user.edge_follow?.count ?? 0,
            isPrivate: user.is_private
          };
          log("Profile found via __a=1", info);
          return info;
        }
      }
    } catch (e) { log("__a=1 error: " + e.message); }

    throw new Error("Could not fetch profile for @" + username);
  }

  // --- Fetch followers/following via REST API ---
  async function fetchViaREST(userId, type, expectedCount) {
    const endpoint = type === "followers"
      ? `/api/v1/friendships/${userId}/followers/`
      : `/api/v1/friendships/${userId}/following/`;

    const seenSet = new Set();
    const collected = [];
    let maxId = null;
    let page = 0;
    let emptyPages = 0;
    let retries = 0;

    log(`REST: starting ${type} fetch for userId=${userId}, expected=${expectedCount}`);

    while (true) {
      page++;
      const params = new URLSearchParams({ count: "50", search_surface: "follow_list_page" });
      if (maxId) params.set("max_id", maxId);

      const pct = expectedCount > 0 ? (collected.length / expectedCount) * 100 : 0;
      setStatus(`[REST] ${type}: page ${page}, got ${collected.length}/${expectedCount}…`);
      setProgress(pct);

      let resp;
      try {
        resp = await fetch(`${endpoint}?${params.toString()}`, {
          headers: apiHeaders(), credentials: "include"
        });
      } catch (e) {
        log(`REST fetch error page ${page}: ${e.message}`);
        if (++retries >= MAX_RETRIES) break;
        await sleep(5000);
        continue;
      }

      log(`REST ${type} page ${page}: status=${resp.status}`);

      if (resp.status === 429) {
        setStatus(`Rate limited. Waiting 60s before retry…`);
        log("Rate limited, waiting 60s");
        await sleep(60000);
        continue;
      }

      if (!resp.ok) {
        log(`REST error: HTTP ${resp.status}`);
        if (++retries >= MAX_RETRIES) {
          log("Max retries reached on REST, stopping");
          break;
        }
        await sleep(5000);
        continue;
      }

      retries = 0; // reset on success
      let data;
      try {
        data = await resp.json();
      } catch (e) {
        log("REST JSON parse error: " + e.message);
        break;
      }

      log(`REST ${type} page ${page}: got ${(data.users || []).length} users, next_max_id=${data.next_max_id || "none"}`);

      const users = data.users || [];
      if (users.length === 0) {
        emptyPages++;
        if (emptyPages >= 3) { log("3 empty pages, stopping"); break; }
        if (!data.next_max_id) break;
        maxId = data.next_max_id;
        await sleep(DELAY_MS);
        continue;
      }

      emptyPages = 0;
      for (const u of users) {
        const uname = (u.username || "").toLowerCase();
        if (!uname || seenSet.has(uname)) continue;
        seenSet.add(uname);
        collected.push({
          username: uname,
          full_name: u.full_name || "",
          is_private: !!u.is_private,
          is_verified: !!u.is_verified
        });
      }

      // Update live display
      if (type === "followers") { followers = collected.slice(); }
      else { following = collected.slice(); }
      updateTabCounts();
      renderList();

      if (!data.next_max_id) {
        log(`REST: no more pages. Total ${collected.length}`);
        break;
      }
      maxId = data.next_max_id;
      await sleep(DELAY_MS);
    }

    log(`REST ${type} done: ${collected.length} collected (expected ${expectedCount})`);
    return collected;
  }

  // --- Fetch via GraphQL (fallback) ---
  async function fetchViaGraphQL(userId, type, expectedCount) {
    // GraphQL query hashes for followers/following
    const queryHash = type === "followers"
      ? "c76146de99bb02f6415203be841dd25a" // edge_followed_by
      : "d04b0a864b4b54837c0d870b0e77e076"; // edge_follow
    const edgeName = type === "followers" ? "edge_followed_by" : "edge_follow";

    const seenSet = new Set();
    const collected = [];
    let endCursor = null;
    let hasNext = true;
    let page = 0;
    let retries = 0;

    log(`GraphQL: starting ${type} fetch for userId=${userId}, expected=${expectedCount}`);

    while (hasNext) {
      page++;
      const vars = { id: userId, include_reel: false, fetch_mutual: false, first: 50 };
      if (endCursor) vars.after = endCursor;

      const url = `/graphql/query/?query_hash=${queryHash}&variables=${encodeURIComponent(JSON.stringify(vars))}`;

      const pct = expectedCount > 0 ? (collected.length / expectedCount) * 100 : 0;
      setStatus(`[GraphQL] ${type}: page ${page}, got ${collected.length}/${expectedCount}…`);
      setProgress(pct);

      let resp;
      try {
        resp = await fetch(url, { headers: apiHeaders(), credentials: "include" });
      } catch (e) {
        log(`GraphQL fetch error page ${page}: ${e.message}`);
        if (++retries >= MAX_RETRIES) break;
        await sleep(5000);
        continue;
      }

      log(`GraphQL ${type} page ${page}: status=${resp.status}`);

      if (resp.status === 429) {
        setStatus("Rate limited. Waiting 60s…");
        log("GraphQL rate limited");
        await sleep(60000);
        continue;
      }

      if (!resp.ok) {
        log(`GraphQL error: HTTP ${resp.status}`);
        if (++retries >= MAX_RETRIES) break;
        await sleep(5000);
        continue;
      }

      retries = 0;
      let data;
      try {
        data = await resp.json();
      } catch (e) {
        log("GraphQL JSON parse error: " + e.message);
        break;
      }

      const edge = data?.data?.user?.[edgeName];
      if (!edge) {
        log("GraphQL: edge not found in response", { keys: Object.keys(data?.data?.user || {}) });
        break;
      }

      const nodes = edge.edges || [];
      log(`GraphQL ${type} page ${page}: ${nodes.length} edges, has_next=${edge.page_info?.has_next_page}`);

      for (const e of nodes) {
        const u = e.node;
        if (!u) continue;
        const uname = (u.username || "").toLowerCase();
        if (!uname || seenSet.has(uname)) continue;
        seenSet.add(uname);
        collected.push({
          username: uname,
          full_name: u.full_name || "",
          is_private: !!u.is_private,
          is_verified: !!u.is_verified
        });
      }

      // Update live display
      if (type === "followers") { followers = collected.slice(); }
      else { following = collected.slice(); }
      updateTabCounts();
      renderList();

      hasNext = edge.page_info?.has_next_page === true;
      endCursor = edge.page_info?.end_cursor || null;
      if (!endCursor) hasNext = false;
      await sleep(DELAY_MS);
    }

    log(`GraphQL ${type} done: ${collected.length} collected (expected ${expectedCount})`);
    return collected;
  }

  // --- Merge two result arrays by username, keeping all unique users ---
  function mergeResults(a, b) {
    const map = new Map();
    for (const u of a) map.set(u.username, u);
    for (const u of b) { if (!map.has(u.username)) map.set(u.username, u); }
    return [...map.values()];
  }

  // --- Smart fetch: REST + GraphQL, merge for completeness ---
  async function smartFetch(userId, type, expectedCount) {
    log(`smartFetch: ${type}, trying REST first…`);
    let result = await fetchViaREST(userId, type, expectedCount);
    log(`REST result: ${result.length}/${expectedCount}`);

    // If REST didn't get everything, also try GraphQL and merge
    if (expectedCount > 0 && result.length < expectedCount) {
      log(`REST got ${result.length}/${expectedCount} (incomplete). Running GraphQL too…`);
      setStatus(`REST got ${result.length}/${expectedCount}. Also trying GraphQL to fill gaps…`);
      const gqlResult = await fetchViaGraphQL(userId, type, expectedCount);
      log(`GraphQL result: ${gqlResult.length}/${expectedCount}`);

      // Merge both sets to get the most complete list
      result = mergeResults(result, gqlResult);
      log(`Merged result: ${result.length}/${expectedCount}`);

      // Update live display with merged data
      if (type === "followers") { followers = result.slice(); }
      else { following = result.slice(); }
      updateTabCounts();
      renderList();
    }

    log(`Final ${type} count: ${result.length}/${expectedCount}`);
    return result;
  }

  // --- Current data rendering ---
  function getActiveList() {
    if (activeTab === "followers") return followers;
    if (activeTab === "following") return following;
    const fSet = new Set(followers.map(u => u.username));
    if (activeTab === "not-following-back") return following.filter(u => !fSet.has(u.username));
    const gSet = new Set(following.map(u => u.username));
    return followers.filter(u => !gSet.has(u.username));
  }

  function renderList() {
    const list = getActiveList();
    if (list.length === 0) {
      listEl.innerHTML = `<div style="color:#666;text-align:center;padding:20px">No data yet</div>`;
      return;
    }
    listEl.innerHTML = list.map((u, i) =>
      `<div class="ig-row">
        <span style="color:#e2e2e2">${i + 1}. <a href="https://instagram.com/${escapeHtml(u.username)}" target="_blank" rel="noopener">${escapeHtml(u.username)}</a></span>
        <span style="color:#888;font-size:12px">${escapeHtml(u.full_name)}${u.is_verified ? " ✔" : ""}${u.is_private ? " 🔒" : ""}</span>
      </div>`
    ).join("");
  }

  function updateTabCounts() {
    const fSet = new Set(followers.map(u => u.username));
    const gSet = new Set(following.map(u => u.username));
    tabs.forEach(tab => {
      const t = tab.dataset.tab;
      if (t === "followers") tab.textContent = `Followers (${followers.length})`;
      else if (t === "following") tab.textContent = `Following (${following.length})`;
      else if (t === "not-following-back") tab.textContent = `Not Following Back (${following.filter(u => !fSet.has(u.username)).length})`;
      else tab.textContent = `Fans Only (${followers.filter(u => !gSet.has(u.username)).length})`;
    });
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      activeTab = tab.dataset.tab;
      tabs.forEach(t => { t.classList.toggle("active", t === tab); });
      renderList();
    });
  });

  // --- CSV export ---
  function downloadCSV(list, filename) {
    const header = "username,full_name,is_private,is_verified";
    const rows = list.map(u =>
      `"${u.username}","${(u.full_name || "").replace(/"/g, '""')}",${u.is_private},${u.is_verified}`
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = filename; a.click(); URL.revokeObjectURL(a.href);
  }

  exportBtn.addEventListener("click", () => {
    const p = currentTarget || "unknown";
    downloadCSV(followers, `${p}_followers.csv`);
    downloadCSV(following, `${p}_following.csv`);
    const fSet = new Set(followers.map(u => u.username));
    downloadCSV(following.filter(u => !fSet.has(u.username)), `${p}_not_following_back.csv`);
    setStatus("CSV files downloaded.");
  });

  copyBtn.addEventListener("click", () => {
    const list = getActiveList();
    navigator.clipboard.writeText(list.map(u => u.username).join("\n")).then(() => {
      setStatus(`Copied ${list.length} usernames.`);
    });
  });

  // --- JSON export / import ---
  exportAllBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(loadAllData(), null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "ig_tracker_history.json"; a.click(); URL.revokeObjectURL(a.href);
    setStatus("Full history exported.");
  });

  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", () => {
    const file = importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (typeof imported !== "object" || Array.isArray(imported)) throw new Error("Bad");
        const existing = loadAllData();
        for (const [user, snaps] of Object.entries(imported)) {
          if (!Array.isArray(snaps)) continue;
          if (!existing[user]) existing[user] = [];
          const ts = new Set(existing[user].map(s => s.timestamp));
          for (const s of snaps) { if (s.timestamp && !ts.has(s.timestamp)) existing[user].push(s); }
        }
        saveAllData(existing);
        refreshHistoryDropdown();
        setStatus(`Imported ${Object.keys(imported).length} user(s).`);
      } catch { setStatus("Import failed: invalid JSON."); }
    };
    reader.readAsText(file);
  });

  // --- Debug log toggle ---
  showLogBtn.addEventListener("click", () => {
    const vis = debugPanel.style.display === "none";
    debugPanel.style.display = vis ? "block" : "none";
    debugLogEl.textContent = debugLog.join("\n");
    showLogBtn.textContent = vis ? "Hide Debug Log" : "Show Debug Log";
  });

  // --- History ---
  function refreshHistoryDropdown() {
    const users = getTrackedUsernames();
    histUser.innerHTML = `<option value="">— Select user (${users.length} tracked) —</option>` +
      users.map(u => `<option value="${u}">${u}</option>`).join("");
  }

  let selectedSnapshots = [];

  showHistBtn.addEventListener("click", () => {
    const username = histUser.value;
    if (!username) { historyListEl.innerHTML = `<span style="color:#666">Select a user first.</span>`; return; }
    const snaps = getSnapshots(username);
    if (!snaps.length) { historyListEl.innerHTML = `<span style="color:#666">No snapshots for @${escapeHtml(username)}.</span>`; return; }
    selectedSnapshots = [];
    compareBtn.disabled = true;
    historyListEl.innerHTML = snaps.map((s, i) =>
      `<div style="padding:5px 6px;border-bottom:1px solid #1a1a3e;display:flex;align-items:center;gap:10px">
        <input type="checkbox" class="ig-snap-check" data-ts="${s.timestamp}" style="accent-color:#0095f6" />
        <span style="flex:1">#${snaps.length - i} — ${fmtDate(s.timestamp)} — <b>${s.followers.length}</b> followers, <b>${s.following.length}</b> following</span>
        <button class="ig-snap-del ig-btn" data-ts="${s.timestamp}" style="background:#c0392b;padding:3px 10px;font-size:11px">Del</button>
      </div>`
    ).join("");
    historyListEl.querySelectorAll(".ig-snap-check").forEach(cb => {
      cb.addEventListener("change", () => {
        const checked = [...historyListEl.querySelectorAll(".ig-snap-check:checked")];
        if (checked.length > 2) { cb.checked = false; return; }
        selectedSnapshots = checked.map(c => Number(c.dataset.ts));
        compareBtn.disabled = selectedSnapshots.length !== 2;
      });
    });
    historyListEl.querySelectorAll(".ig-snap-del").forEach(btn => {
      btn.addEventListener("click", () => {
        deleteSnapshot(username, Number(btn.dataset.ts));
        showHistBtn.click();
        refreshHistoryDropdown();
        setStatus("Snapshot deleted.");
      });
    });
  });

  deleteUserBtn.addEventListener("click", () => {
    const username = histUser.value;
    if (!username) return;
    if (!confirm(`Delete ALL data for @${username}?`)) return;
    deleteUserData(username);
    refreshHistoryDropdown();
    historyListEl.innerHTML = "";
    diffResultEl.innerHTML = "";
    setStatus(`Deleted @${username}.`);
  });

  // --- Compare ---
  compareBtn.addEventListener("click", () => {
    const username = histUser.value;
    if (!username || selectedSnapshots.length !== 2) return;
    const snaps = getSnapshots(username);
    const [ts1, ts2] = selectedSnapshots.sort((a, b) => a - b);
    const older = snaps.find(s => s.timestamp === ts1);
    const newer = snaps.find(s => s.timestamp === ts2);
    if (!older || !newer) { diffResultEl.innerHTML = `<span style="color:#e74c3c">Snapshot not found.</span>`; return; }

    const fDiff = diffSets(older.followers, newer.followers);
    const gDiff = diffSets(older.following, newer.following);

    function renderSection(title, diff) {
      const { added, removed } = diff;
      if (!added.length && !removed.length) return `<div style="margin-bottom:14px"><b>${title}</b> — No changes</div>`;
      let h = `<div style="margin-bottom:14px"><b>${title}</b>`;
      if (added.length) {
        h += `<div style="margin:6px 0 2px;color:#2ecc71;font-weight:600">+ ${added.length} New</div>`;
        h += added.map(u => `<div style="padding:2px 8px"><a href="https://instagram.com/${escapeHtml(u)}" target="_blank" rel="noopener" class="ig-added">+ ${escapeHtml(u)}</a></div>`).join("");
      }
      if (removed.length) {
        h += `<div style="margin:6px 0 2px;color:#e74c3c;font-weight:600">- ${removed.length} Lost</div>`;
        h += removed.map(u => `<div style="padding:2px 8px"><a href="https://instagram.com/${escapeHtml(u)}" target="_blank" rel="noopener" class="ig-removed">- ${escapeHtml(u)}</a></div>`).join("");
      }
      return h + `</div>`;
    }

    const total = fDiff.added.length + fDiff.removed.length + gDiff.added.length + gDiff.removed.length;

    diffResultEl.innerHTML = `
      <div style="margin-bottom:10px;color:#aaa;font-size:12px">
        Comparing <b>${fmtDate(ts1)}</b> → <b>${fmtDate(ts2)}</b> for <b>@${escapeHtml(username)}</b>
      </div>
      ${total === 0
        ? `<div style="text-align:center;padding:20px;color:#2ecc71;font-size:16px;font-weight:600">✓ Identical — No changes</div>
           <div style="text-align:center;color:#888;font-size:12px">Followers: ${newer.followers.length} | Following: ${newer.following.length}</div>`
        : `<div style="display:flex;gap:20px;flex-wrap:wrap">
            <div style="flex:1;min-width:300px">${renderSection("Followers (" + older.followers.length + " → " + newer.followers.length + ")", fDiff)}</div>
            <div style="flex:1;min-width:300px">${renderSection("Following (" + older.following.length + " → " + newer.following.length + ")", gDiff)}</div>
          </div>
          <div style="margin-top:10px;padding:10px;background:#111;border-radius:6px;font-size:12px;color:#ccc">
            <b>Summary (${total} change${total !== 1 ? "s" : ""}):</b>
            New followers: <span class="ig-added"><b>${fDiff.added.length}</b></span> |
            Lost followers: <span class="ig-removed"><b>${fDiff.removed.length}</b></span> |
            Started following: <span class="ig-added"><b>${gDiff.added.length}</b></span> |
            Stopped following: <span class="ig-removed"><b>${gDiff.removed.length}</b></span>
          </div>`
      }`;
  });

  // --- Main fetch ---
  startBtn.addEventListener("click", async () => {
    const target = usernameInput.value.trim().replace(/^@/, "").toLowerCase();
    if (!target) { setStatus("Please enter a username."); return; }

    startBtn.disabled = true;
    startBtn.style.opacity = "0.5";
    currentTarget = target;
    followers = [];
    following = [];
    updateTabCounts();
    setProgress(0);

    try {
      setStatus(`Looking up @${target}…`);
      profileInfo = await fetchProfile(target);
    } catch (e) {
      log("Profile fetch failed: " + e.message);
      setStatus(`Could not find @${target}. Are you logged in? Is the account public?`);
      startBtn.disabled = false;
      startBtn.style.opacity = "1";
      return;
    }

    if (profileInfo.isPrivate) {
      setStatus(`@${target} is PRIVATE. You can only fetch if they accept your follow or you already follow them.`);
      log("Account is private");
    }

    const { id, followerCount, followingCount } = profileInfo;
    setStatus(`@${target}: ${followerCount} followers, ${followingCount} following. Fetching…`);
    log(`Profile: id=${id}, followers=${followerCount}, following=${followingCount}, private=${profileInfo.isPrivate}`);

    // Fetch followers
    followers = await smartFetch(id, "followers", followerCount);
    setStatus(`Followers: ${followers.length}/${followerCount}. Now fetching following…`);
    setProgress(50);

    // Fetch following
    following = await smartFetch(id, "following", followingCount);
    setProgress(100);

    // Save
    saveSnapshot(target, followers, following);
    refreshHistoryDropdown();
    updateTabCounts();
    renderList();

    const fSet = new Set(followers.map(u => u.username));
    const gSet = new Set(following.map(u => u.username));

    const summary = `Done! @${target}: ` +
      `${followers.length}/${followerCount} followers, ` +
      `${following.length}/${followingCount} following, ` +
      `${following.filter(u => !fSet.has(u.username)).length} not following back, ` +
      `${followers.filter(u => !gSet.has(u.username)).length} fans only. Snapshot saved.`;
    setStatus(summary);
    log(summary);

    exportBtn.disabled = false; exportBtn.style.background = "#0095f6";
    copyBtn.disabled = false; copyBtn.style.background = "#0095f6";
    startBtn.disabled = false; startBtn.style.opacity = "1";
    histUser.value = target;
  });

  usernameInput.addEventListener("keydown", e => { if (e.key === "Enter") startBtn.click(); });
  setStatus(`Ready. ${tracked.length} user(s) tracked. Enter a username to start.`);
  log("IG Tracker v3 loaded");
})();
