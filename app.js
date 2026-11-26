/* 실험첵! Lab-Check! — 앱 본체 */
(function () {
  "use strict";
  var APP_VERSION = "1.2.0";
  var ASSET = window.SCI_ASSETS || { logoH: "assets/logo-horizontal.png", logoS: "assets/logo-stacked.png" };
  var D = window.SCI_DATA;
  var $app = document.getElementById("app");
  var params = new URLSearchParams(location.search);
  var cfg = window.FIREBASE_CONFIG || {};
  var DEMO = params.get("demo") === "1" || !cfg.apiKey;
  var PREVIEW = !!window.SCI_PREVIEW; // 아티팩트 미리보기용(한 화면 안에서 교사·학생 오가기)

  // ─────────────── 공통 도구 ───────────────
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }
  function deviceId() {
    var k = "sci_device_id", v = null;
    try { v = localStorage.getItem(k); } catch (e) {}
    if (!v) {
      v = "d" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      try { localStorage.setItem(k, v); } catch (e) {}
    }
    return v;
  }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function makeCode() {
    var c = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ", s = "";
    for (var i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  }
  function expById(id) {
    for (var i = 0; i < D.experiments.length; i++) if (D.experiments[i].id === id) return D.experiments[i];
    return null;
  }
  function unitName(grade, sem, unit) {
    var list = (D.grades[String(grade)] || {})[String(sem)] || [];
    for (var i = 0; i < list.length; i++) if (list[i].unit === unit) return list[i].name;
    return "";
  }
  function pubName(id) {
    for (var i = 0; i < D.publishers.length; i++) if (D.publishers[i].id === id) return D.publishers[i].name;
    return id;
  }
  function pageText(p) {
    if (!p) return "";
    var a = [];
    if (p.sci) a.push("과학 " + p.sci + "쪽");
    if (p.obs) a.push("실험 관찰 " + p.obs + "쪽");
    return a.join(" · ");
  }
  function studentUrl(code) {
    var base = location.origin + location.pathname;
    return base + "?s=" + encodeURIComponent(code) + (DEMO ? "&demo=1" : "");
  }
  function qrSvg(text) {
    var qr = qrcode(0, "M");
    qr.addData(text); qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }

  // ─────────────── 저장소: 체험 모드(이 기기 안) ───────────────
  function DemoStore() {
    var KEY = "sci_demo_db_v1";
    var subs = [];
    var user = null;
    var authCbs = [];
    var mem = { teachers: {}, pages: {}, sessions: {} };
    function db() { var v = lsGet(KEY, null); return v || JSON.parse(JSON.stringify(mem)); }
    function save(d) { mem = d; lsSet(KEY, d); fire(); }
    function fire() { subs.slice().forEach(function (s) { try { s(); } catch (e) { console.error(e); } }); }
    window.addEventListener("storage", function (e) { if (e.key === KEY) fire(); });
    function sub(fn) { subs.push(fn); fn(); return function () { subs = subs.filter(function (x) { return x !== fn; }); }; }
    var signed = lsGet("sci_demo_signed", false);
    if (signed) user = { uid: "demo-teacher", name: "체험 선생님" };
    return {
      mode: "demo",
      onAuth: function (cb) { authCbs.push(cb); setTimeout(function () { cb(user); }, 0); },
      signInGoogle: function () {
        user = { uid: "demo-teacher", name: "체험 선생님" }; lsSet("sci_demo_signed", true);
        authCbs.forEach(function (cb) { cb(user); }); return Promise.resolve(user);
      },
      signOut: function () {
        user = null; lsSet("sci_demo_signed", false);
        authCbs.forEach(function (cb) { cb(null); }); return Promise.resolve();
      },
      ensureStudent: function () { return Promise.resolve(); },
      getTeacher: function (uid) { return Promise.resolve(db().teachers[uid] || null); },
      saveTeacher: function (uid, data) {
        var d = db(); d.teachers[uid] = Object.assign({}, d.teachers[uid] || {}, data); save(d); return Promise.resolve();
      },
      getPages: function (pub) { return Promise.resolve(db().pages[pub] || {}); },
      setPage: function (pub, expId, val) {
        var d = db(); d.pages[pub] = d.pages[pub] || {}; d.pages[pub][expId] = val; save(d); return Promise.resolve();
      },
      createSession: function (data) {
        var d = db(), code;
        do { code = makeCode(); } while (d.sessions[code]);
        d.sessions[code] = Object.assign({ createdAt: Date.now(), active: true, showResult: false, stage: 0, groups: {} }, data);
        save(d); return Promise.resolve(code);
      },
      updateSession: function (code, patch) {
        var d = db(); if (!d.sessions[code]) return Promise.resolve();
        Object.assign(d.sessions[code], patch); save(d); return Promise.resolve();
      },
      watchSession: function (code, cb) {
        return sub(function () {
          var s = db().sessions[code];
          if (!s) return cb(null);
          var c = Object.assign({}, s); delete c.groups; cb(c);
        });
      },
      watchGroups: function (code, cb) {
        return sub(function () {
          var s = db().sessions[code]; var g = (s && s.groups) || {};
          cb(Object.keys(g).map(function (k) { return g[k]; }));
        });
      },
      watchGroup: function (code, n, cb) {
        return sub(function () {
          var s = db().sessions[code]; cb((s && s.groups && s.groups[n]) || null);
        });
      },
      joinGroup: function (code, n, dev) {
        var d = db(), s = d.sessions[code]; if (!s || !s.active) return Promise.reject(new Error("closed"));
        var g = s.groups[n] || { group: n, done: [], members: {} };
        g.members[dev] = Date.now(); s.groups[n] = g; save(d); return Promise.resolve();
      },
      setStepDone: function (code, n, idx, on) {
        var d = db(), s = d.sessions[code]; if (!s || !s.active) return Promise.reject(new Error("closed"));
        var g = s.groups[n] || { group: n, done: [], members: {} };
        var set = g.done.filter(function (x) { return x !== idx; });
        if (on) set.push(idx);
        g.done = set; s.groups[n] = g; save(d); return Promise.resolve();
      }
    };
  }

  // ─────────────── 저장소: 파이어베이스 ───────────────
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("load " + src)); };
      document.head.appendChild(s);
    });
  }
  function FirebaseStore() {
    var V = "10.12.2", base = "https://www.gstatic.com/firebasejs/" + V + "/";
    var fs, auth, FV;
    var ready = loadScript(base + "firebase-app-compat.js")
      .then(function () { return Promise.all([loadScript(base + "firebase-auth-compat.js"), loadScript(base + "firebase-firestore-compat.js")]); })
      .then(function () {
        firebase.initializeApp(cfg);
        auth = firebase.auth(); fs = firebase.firestore(); FV = firebase.firestore.FieldValue;
      });
    function teacherUser(u) { return u && !u.isAnonymous ? { uid: u.uid, name: u.displayName || "선생님", email: u.email } : null; }
    function sref(code) { return fs.collection("sessions").doc(code); }
    return {
      mode: "firebase",
      ready: ready,
      onAuth: function (cb) { ready.then(function () { auth.onAuthStateChanged(function (u) { cb(teacherUser(u)); }); }); },
      signInGoogle: function () {
        return ready.then(function () { return auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); });
      },
      signOut: function () { return ready.then(function () { return auth.signOut(); }); },
      ensureStudent: function () {
        return ready.then(function () {
          if (auth.currentUser) return;
          return auth.signInAnonymously();
        });
      },
      getTeacher: function (uid) { return ready.then(function () { return fs.collection("teachers").doc(uid).get(); }).then(function (d) { return d.exists ? d.data() : null; }); },
      saveTeacher: function (uid, data) { return ready.then(function () { return fs.collection("teachers").doc(uid).set(data, { merge: true }); }); },
      getPages: function (pub) { return ready.then(function () { return fs.collection("pages").doc(pub).get(); }).then(function (d) { return d.exists ? d.data() : {}; }); },
      setPage: function (pub, expId, val) {
        var o = {}; o[expId] = val;
        return ready.then(function () { return fs.collection("pages").doc(pub).set(o, { merge: true }); });
      },
      createSession: function (data) {
        return ready.then(function tryOne(n) {
          var code = makeCode(); n = n || 0;
          return sref(code).get().then(function (d) {
            if (d.exists && n < 8) return tryOne(n + 1);
            return sref(code).set(Object.assign({ createdAt: Date.now(), active: true, showResult: false, stage: 0 }, data)).then(function () { return code; });
          });
        });
      },
      updateSession: function (code, patch) { return ready.then(function () { return sref(code).update(patch); }); },
      watchSession: function (code, cb) {
        var un = null, stop = false;
        ready.then(function () { if (stop) return; un = sref(code).onSnapshot(function (d) { cb(d.exists ? d.data() : null); }, function () { cb(null); }); });
        return function () { stop = true; if (un) un(); };
      },
      watchGroups: function (code, cb) {
        var un = null, stop = false;
        ready.then(function () {
          if (stop) return;
          un = sref(code).collection("groups").onSnapshot(function (q) { cb(q.docs.map(function (d) { return d.data(); })); });
        });
        return function () { stop = true; if (un) un(); };
      },
      watchGroup: function (code, n, cb) {
        var un = null, stop = false;
        ready.then(function () {
          if (stop) return;
          un = sref(code).collection("groups").doc(String(n)).onSnapshot(function (d) { cb(d.exists ? d.data() : null); });
        });
        return function () { stop = true; if (un) un(); };
      },
      joinGroup: function (code, n, dev) {
        var m = {}; m[dev] = Date.now();
        return ready.then(function () { return sref(code).collection("groups").doc(String(n)).set({ group: n, members: m }, { merge: true }); });
      },
      setStepDone: function (code, n, idx, on) {
        return ready.then(function () {
          return sref(code).collection("groups").doc(String(n)).set({ group: n, done: on ? FV.arrayUnion(idx) : FV.arrayRemove(idx) }, { merge: true });
        });
      }
    };
  }

  var store = DEMO ? DemoStore() : FirebaseStore();

  // ─────────────── 교사 쪽 상태 ───────────────
  var T = {
    user: null, settings: { publisher: "iscream", groupCount: 6, grade: 5, sem: 1 },
    pages: {}, session: null, groups: [], unsub: []
  };
  function clearSubs() { T.unsub.forEach(function (f) { f(); }); T.unsub = []; }

  function header(right) {
    return '<header class="top"><div class="brand"><img src="' + ASSET.logoH + '" alt="실험첵! Lab-Check!">' + (DEMO ? '<small>체험 모드</small>' : "") + "</div>" +
      '<div class="row">' + (right || "") + "</div></header>";
  }
  function footer() {
    return '<footer>실험첵! Lab-Check! ' + APP_VERSION + ' · 음악적체육인</footer>';
  }

  // 첫 화면(로그인 전)
  function renderLanding() {
    clearSubs();
    $app.innerHTML = header("") +
      '<div class="wrap narrow"><div class="hero"><img src="' + ASSET.logoS + '" alt="실험첵! Lab-Check!" style="width:200px;max-width:60%;height:auto;margin:0 auto 18px;display:block"><h1>실험 준비물과 순서를<br>아이들 손에 바로</h1>' +
      '<p class="muted">실험을 고르고 QR을 띄우면, 조마다 준비물·실험 순서·생각할 질문을 볼 수 있어요.<br>조별로 누른 "다했어요"는 선생님 화면에 바로 모여요.</p></div>' +
      '<div class="card stack center">' +
      '<button class="btn main big" id="login">' + (DEMO ? "체험 선생님으로 들어가기" : "구글 계정으로 로그인") + "</button>" +
      (DEMO ? '<div class="notice">지금은 체험 모드예요. 기록이 이 기기의 브라우저 안에만 저장돼요.</div>' : "") +
      "</div>" +
      '<div class="card stack" style="margin-top:14px"><b>학생이에요</b>' +
      '<div class="row"><input id="codeIn" maxlength="4" placeholder="수업 코드 4자리" style="flex:1;padding:12px;border:1px solid var(--line);border-radius:10px;text-transform:uppercase;font-size:18px;letter-spacing:4px">' +
      '<button class="btn" id="go">들어가기</button></div></div>' +
      "</div>" + footer();
    document.getElementById("login").onclick = function () {
      store.signInGoogle().catch(function (e) { toast("로그인하지 못했어요. 다시 시도해 주세요."); console.error(e); });
    };
    document.getElementById("go").onclick = function () {
      var c = document.getElementById("codeIn").value.trim().toUpperCase();
      if (c.length !== 4) return toast("코드 4자리를 넣어 주세요.");
      if (PREVIEW) return previewToStudent(c);
      location.href = studentUrl(c);
    };
  }

  // 메인: 실험 고르기
  function renderMain() {
    clearSubs();
    var s = T.settings;
    var units = (D.grades[String(s.grade)] || {})[String(s.sem)] || [];
    var html = header('<button class="btn" id="setBtn">설정</button><button class="btn" id="outBtn">로그아웃</button>') +
      '<div class="wrap"><div class="row" style="justify-content:space-between;margin:6px 0 10px">' +
      '<div><span class="tag">' + esc(pubName(s.publisher)) + '</span> <span class="muted" style="font-size:14px">' + s.grade + "학년 · 조 " + s.groupCount + "개</span></div></div>" +
      '<div class="tabs"><button data-sem="1" class="' + (s.sem === 1 ? "on" : "") + '">1학기</button><button data-sem="2" class="' + (s.sem === 2 ? "on" : "") + '">2학기</button></div>';
    units.forEach(function (u) {
      var list = D.experiments.filter(function (e) { return e.grade === s.grade && e.sem === s.sem && e.unit === u.unit; });
      html += '<h2 class="unit">' + u.unit + ". " + esc(u.name) + ' <span class="tag gray">' + list.length + "개</span></h2><div class=\"grid\">";
      list.forEach(function (e) {
        var p = pageText(T.pages[e.id]);
        html += '<button class="exp" data-id="' + e.id + '"><b>' + esc(e.title) + '</b><span class="muted" style="font-size:13px">' + esc(e.goal) + "</span>" +
          '<span class="page' + (p ? "" : " empty") + '">' + (p ? esc(p) : "교과서 쪽수 넣기") + "</span></button>";
      });
      html += "</div>";
    });
    html += "</div>" + footer();
    $app.innerHTML = html;
    $app.querySelectorAll(".tabs button").forEach(function (b) {
      b.onclick = function () { T.settings.sem = Number(b.dataset.sem); saveSettings(); renderMain(); };
    });
    $app.querySelectorAll(".exp").forEach(function (b) { b.onclick = function () { openExp(b.dataset.id); }; });
    document.getElementById("setBtn").onclick = openSettings;
    document.getElementById("outBtn").onclick = function () { store.signOut(); };
  }

  function saveSettings() {
    lsSet("sci_settings", T.settings);
    if (T.user) store.saveTeacher(T.user.uid, { settings: T.settings }).catch(function () {});
  }

  function askConfirm(msg, okLabel, cb) {
    var bg = modal('<div style="font-size:17px">' + esc(msg) + '</div>' +
      '<div class="row" style="margin-top:20px;justify-content:flex-end"><button class="btn" id="cNo">취소</button><button class="btn main" id="cYes">' + esc(okLabel) + '</button></div>');
    bg.querySelector("#cNo").onclick = function () { bg.remove(); };
    bg.querySelector("#cYes").onclick = function () { bg.remove(); cb(); };
  }

  function modal(inner) {
    var bg = document.createElement("div"); bg.className = "modal-bg";
    bg.innerHTML = '<div class="modal">' + inner + "</div>";
    bg.addEventListener("click", function (e) { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    return bg;
  }

  function expBody(e, showResult) {
    var h = '<div class="sec"><h4>준비물</h4><ul>' + e.materials.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ul></div>" +
      '<div class="sec safety"><h4>안전 주의</h4><ul>' + e.safety.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ul></div>" +
      '<div class="sec"><h4>예측해 봐요</h4><div>' + esc(e.predict) + "</div></div>" +
      '<div class="sec"><h4>실험 순서</h4><ol>' + e.steps.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ol></div>";
    if (showResult !== false) {
      h += '<div class="sec"><h4>예상 결과</h4><ul>' + e.results.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ul></div>";
    }
    h += '<div class="sec"><h4>생각해 볼 질문</h4><ul>' + e.questions.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ul></div>";
    return h;
  }

  function openExp(id) {
    var e = expById(id); if (!e) return;
    var p = T.pages[id] || {};
    var bg = modal(
      '<div class="muted" style="font-size:13px">' + e.sem + "학기 " + e.unit + ". " + esc(unitName(e.grade, e.sem, e.unit)) + "</div>" +
      "<h3>" + esc(e.title) + "</h3><div class=\"muted\">" + esc(e.goal) + "</div>" +
      '<div class="sec card" style="padding:12px"><h4 style="margin:0 0 8px">' + esc(pubName(T.settings.publisher)) + " 교과서 쪽수</h4>" +
      '<div class="row"><label class="field" style="flex:1"><span class="muted" style="font-size:12px">과학</span><input id="pSci" placeholder="예: 24~25" value="' + esc(p.sci || "") + '"></label>' +
      '<label class="field" style="flex:1"><span class="muted" style="font-size:12px">실험 관찰</span><input id="pObs" placeholder="예: 12" value="' + esc(p.obs || "") + '"></label>' +
      '<button class="btn" id="pSave" style="align-self:flex-end">저장</button></div>' +
      '<div class="muted" style="font-size:12px;margin-top:6px">같은 교과서를 쓰는 선생님들과 함께 쓰는 쪽수예요. 한 번 넣으면 모두에게 보여요.</div></div>' +
      expBody(e, true) +
      '<div class="row" style="margin-top:20px;justify-content:flex-end"><button class="btn" id="close">닫기</button><button class="btn main big" id="start">이 실험으로 수업 시작</button></div>'
    );
    bg.querySelector("#close").onclick = function () { bg.remove(); };
    bg.querySelector("#pSave").onclick = function () {
      var val = { sci: bg.querySelector("#pSci").value.trim(), obs: bg.querySelector("#pObs").value.trim() };
      store.setPage(T.settings.publisher, id, val).then(function () {
        T.pages[id] = val; toast("쪽수를 저장했어요."); renderMain(); bg.remove(); openExp(id);
      }).catch(function () { toast("저장하지 못했어요."); });
    };
    bg.querySelector("#start").onclick = function () {
      var btn = this; btn.disabled = true;
      store.createSession({
        owner: T.user.uid, expId: id, publisher: T.settings.publisher,
        page: T.pages[id] || null, groupCount: T.settings.groupCount
      }).then(function (code) {
        bg.remove();
        lsSet("sci_last_session", code);
        renderLive(code);
      }).catch(function (err) { btn.disabled = false; toast("수업을 시작하지 못했어요."); console.error(err); });
    };
  }

  function openSettings() {
    var s = T.settings;
    var opts = D.publishers.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === s.publisher ? " selected" : "") + (p.ready ? "" : " disabled") + ">" + esc(p.name) + (p.ready ? "" : " (준비 중)") + "</option>";
    }).join("");
    var gopts = ""; for (var i = 2; i <= 10; i++) gopts += '<option value="' + i + '"' + (i === s.groupCount ? " selected" : "") + ">" + i + "개</option>";
    var bg = modal("<h3>설정</h3>" +
      '<div class="stack sec"><label class="field"><span>학교에서 쓰는 교과서</span><select id="sPub">' + opts + "</select></label>" +
      '<label class="field"><span>학년</span><select id="sGrade"><option value="5" selected>5학년</option></select></label>' +
      '<label class="field"><span>우리 반 조 수</span><select id="sGroup">' + gopts + "</select></label></div>" +
      '<div class="row" style="margin-top:20px;justify-content:flex-end"><button class="btn" id="close">닫기</button><button class="btn main" id="save">저장</button></div>');
    bg.querySelector("#close").onclick = function () { bg.remove(); };
    bg.querySelector("#save").onclick = function () {
      var pub = bg.querySelector("#sPub").value;
      var changed = pub !== T.settings.publisher;
      T.settings.publisher = pub;
      T.settings.grade = Number(bg.querySelector("#sGrade").value);
      T.settings.groupCount = Number(bg.querySelector("#sGroup").value);
      saveSettings(); bg.remove();
      if (changed) loadPages().then(renderMain); else renderMain();
    };
  }

  function loadPages() {
    return store.getPages(T.settings.publisher).then(function (p) { T.pages = p || {}; }).catch(function () { T.pages = {}; });
  }

  // 수업 진행 화면(교사)
  function renderLive(code) {
    clearSubs();
    T.session = null; T.groups = [];
    var url = studentUrl(code);
    $app.innerHTML = header('<button class="btn" id="back">실험 목록</button>') +
      '<div class="wrap"><div class="live">' +
      '<div class="qrbox"><div class="muted" style="font-size:14px">휴대폰·태블릿으로 찍어요</div>' + qrSvg(url) +
      '<div class="muted" style="font-size:13px">수업 코드</div><div class="code" id="code">' + esc(code) + "</div>" +
      '<div class="row" style="justify-content:center;margin-top:10px">' +
      (PREVIEW ? '<button class="btn main" id="pvStu">학생 화면으로 바꿔 보기</button>' : '<a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">학생 화면 미리 보기</a>') +
      '</div></div>' +
      '<div class="stack" id="liveRight"></div></div></div>' + footer();
    document.getElementById("back").onclick = function () { renderMain(); };
    if (PREVIEW) document.getElementById("pvStu").onclick = function () { previewToStudent(code); };
    T.unsub.push(store.watchSession(code, function (s) { T.session = s; drawLive(code); }));
    T.unsub.push(store.watchGroups(code, function (g) { T.groups = g || []; drawLive(code); }));
  }

  function stageInfo(e, stage) {
    var N = e.steps.length;
    if (stage <= 0) return { label: "준비", text: "준비물 챙기기 · 안전 약속 읽기 · 결과 예측하기" };
    if (stage <= N) return { label: stage + "단계 / " + N, text: e.steps[stage - 1] };
    return { label: "결과", text: "예상 결과와 생각해 볼 질문" };
  }

  function drawLive(code) {
    var box = document.getElementById("liveRight"); if (!box) return;
    var s = T.session;
    if (!s) { box.innerHTML = '<div class="card">수업 정보를 불러오는 중이에요.</div>'; return; }
    var e = expById(s.expId), N = e.steps.length;
    var stage = Math.min(s.stage || 0, N + 1);
    var gc = s.groupCount || 6;
    var byNo = {}; T.groups.forEach(function (g) { byNo[g.group] = g; });
    var joined = T.groups.filter(function (g) { return g.group >= 1 && g.group <= gc; });
    var nJoin = joined.length;
    var devices = joined.reduce(function (a, g) { return a + Object.keys(g.members || {}).length; }, 0);
    var doneNow = joined.filter(function (g) { return (g.done || []).indexOf(stage) >= 0; });
    var waiting = joined.filter(function (g) { return (g.done || []).indexOf(stage) < 0; }).map(function (g) { return g.group; }).sort(function (a, b) { return a - b; });
    var allIn = nJoin > 0 && doneNow.length === nJoin;
    var info = stageInfo(e, stage);
    var nextLabel = stage === 0 ? "1단계 열기" : stage < N ? (stage + 1) + "단계 열기" : "결과 열기";
    var pct = nJoin ? Math.round(doneNow.length / nJoin * 100) : 0;

    var h = '<div class="card"><div class="muted" style="font-size:13px">' + e.sem + "학기 " + e.unit + ". " + esc(unitName(e.grade, e.sem, e.unit)) +
      (s.page ? " · " + esc(pageText(s.page)) : "") + "</div><h3 style=\"margin:2px 0 0\">" + esc(e.title) + "</h3>" +
      (s.active ? "" : '<div class="notice" style="margin-top:8px">끝난 수업이에요.</div>') + "</div>";

    h += '<div class="card cur"><div class="row" style="justify-content:space-between"><span class="tag">지금 학생 화면 · ' + esc(info.label) + "</span>" +
      '<span class="muted" style="font-size:13px">들어온 조 ' + nJoin + " / " + gc + " · 기기 " + devices + "대</span></div>" +
      '<div class="stxt" style="margin:10px 0 4px">' + esc(info.text) + "</div>";
    if (stage <= N) {
      h += '<div class="row" style="justify-content:space-between;align-items:flex-end;margin-top:10px"><div class="muted">다했어요 누른 조</div>' +
        '<div class="bigstat" id="nowCnt">' + doneNow.length + ' <small class="muted" style="font-size:15px">/ ' + nJoin + "조</small></div></div>" +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="muted" style="font-size:14px;margin-top:8px" id="waitList">' +
        (nJoin === 0 ? "아직 들어온 조가 없어요." : waiting.length ? "아직: " + waiting.map(function (g) { return g + "조"; }).join(", ") : "모든 조가 다했어요. 다음 단계를 열 수 있어요.") + "</div>" +
        '<div class="row" style="margin-top:14px;justify-content:space-between">' +
        (stage > 0 ? '<button class="btn" id="prevBtn"' + (s.active ? "" : " disabled") + ">이전 단계로</button>" : "<span></span>") +
        '<div class="row">' + (!allIn && nJoin > 0 ? '<button class="btn" id="forceBtn"' + (s.active ? "" : " disabled") + ">기다리지 않고 열기</button>" : "") +
        '<button class="btn main big" id="nextBtn"' + (allIn && s.active ? "" : " disabled") + ">" + nextLabel + "</button></div></div>";
    } else {
      h += '<div class="muted" style="margin-top:6px">학생 화면에 예상 결과와 질문이 열렸어요.</div>' +
        '<div class="row" style="margin-top:14px"><button class="btn" id="prevBtn"' + (s.active ? "" : " disabled") + ">이전 단계로</button></div>";
    }
    h += "</div>";

    h += '<div class="card"><b>조별 진행</b><div style="overflow-x:auto"><table class="board" style="margin-top:8px"><tr><th></th>';
    for (var k = 0; k <= N; k++) h += '<th class="' + (k === stage ? "now" : "") + '">' + (k === 0 ? "준비" : k) + "</th>";
    h += "</tr>";
    for (var g = 1; g <= gc; g++) {
      var gd = byNo[g]; var d = (gd && gd.done) || [];
      h += '<tr class="' + (gd ? "" : "off") + '"><td class="g">' + g + "조</td>";
      for (var j = 0; j <= N; j++) h += '<td class="' + (d.indexOf(j) >= 0 ? "done" : "") + (j > stage ? " later" : "") + '">' + (d.indexOf(j) >= 0 ? "끝" : "") + "</td>";
      h += "</tr>";
    }
    h += "</table></div></div>";
    h += '<div class="row" style="justify-content:flex-end"><button class="btn warn" id="endBtn"' + (s.active ? "" : " disabled") + ">수업 끝내기</button></div>";
    box.innerHTML = h;

    function go(n) { store.updateSession(code, { stage: n, showResult: n > N }); }
    var nb = document.getElementById("nextBtn"); if (nb) nb.onclick = function () { go(stage + 1); };
    var fb = document.getElementById("forceBtn");
    if (fb) fb.onclick = function () {
      askConfirm("아직 " + waiting.map(function (x) { return x + "조"; }).join(", ") + "가 끝내지 않았어요. 그래도 다음 화면을 열까요?", nextLabel, function () { go(stage + 1); });
    };
    var pb = document.getElementById("prevBtn"); if (pb) pb.onclick = function () { go(Math.max(0, stage - 1)); };
    var eb = document.getElementById("endBtn");
    if (eb) eb.onclick = function () {
      askConfirm("수업을 끝낼까요? 학생들은 더 이상 '다했어요'를 누를 수 없어요.", "수업 끝내기", function () {
        store.updateSession(code, { active: false });
      });
    };
  }

  // ─────────────── 학생 쪽 ───────────────
  var S = { code: null, session: null, group: null, gdata: null, unSession: null, unGroup: null };

  function studentStart(code) {
    S.code = code.toUpperCase();
    $app.innerHTML = '<div class="wrap narrow"><div class="card center" style="margin-top:40px">수업을 찾는 중이에요...</div></div>';
    store.ensureStudent().then(function () {
      S.unSession = store.watchSession(S.code, function (s) {
        S.session = s;
        if (!s) return renderNoSession();
        var saved = lsGet("sci_group_" + S.code, null);
        if (S.group == null && saved) { S.group = saved; joinAndWatch(); }
        else if (S.group == null) renderPickGroup();
        else renderStudent();
      });
    }).catch(function (e) { console.error(e); renderNoSession(); });
  }

  function renderNoSession() {
    $app.innerHTML = '<div class="wrap narrow"><div class="card center stack" style="margin-top:40px"><b>수업을 찾지 못했어요</b>' +
      '<div class="muted">코드 ' + esc(S.code) + "를 다시 확인해 주세요.</div>" +
      (PREVIEW ? '<button class="btn" id="pvBack">처음 화면으로</button>' : '<a class="btn" href="' + esc(location.pathname + (DEMO ? "?demo=1" : "")) + '">처음 화면으로</a>') + "</div></div>";
    var pb = document.getElementById("pvBack");
    if (pb) pb.onclick = function () { stopStudent(); if (T.user) renderMain(); else renderLanding(); };
  }

  function renderPickGroup() {
    var s = S.session, e = expById(s.expId);
    var gc = s.groupCount || 6, b = "";
    for (var i = 1; i <= gc; i++) b += '<button data-g="' + i + '">' + i + "조</button>";
    $app.innerHTML = '<div class="s-head"><div class="meta">' + e.sem + "학기 " + e.unit + ". " + esc(unitName(e.grade, e.sem, e.unit)) + "</div><h1>" + esc(e.title) + "</h1></div>" +
      '<div class="wrap narrow stack">' + (PREVIEW && T.user ? '<button class="btn" id="pvT2">선생님 화면으로 돌아가기</button>' : "") +
      '<div class="card stack"><b style="font-size:18px">우리 조를 골라요</b><div class="groups">' + b + "</div></div>" +
      (s.active ? "" : '<div class="notice">이 수업은 끝났어요.</div>') + "</div>";
    var pv2 = document.getElementById("pvT2");
    if (pv2) pv2.onclick = function () { previewToTeacher(S.code); };
    $app.querySelectorAll(".groups button").forEach(function (btn) {
      btn.onclick = function () {
        if (!S.session.active) return toast("끝난 수업이에요.");
        S.group = Number(btn.dataset.g); lsSet("sci_group_" + S.code, S.group); joinAndWatch();
      };
    });
  }

  function joinAndWatch() {
    store.joinGroup(S.code, S.group, deviceId()).catch(function () {});
    if (S.unGroup) S.unGroup();
    S.unGroup = store.watchGroup(S.code, S.group, function (g) { S.gdata = g; renderStudent(); });
    renderStudent();
  }

  function renderStudent() {
    var s = S.session; if (!s) return;
    var e = expById(s.expId), N = e.steps.length;
    var stage = Math.min(s.stage || 0, N + 1);
    var done = (S.gdata && S.gdata.done) || [];
    var meDone = done.indexOf(stage) >= 0;
    var checks = lsGet("sci_mat_" + S.code, {});
    var changed = S.lastStage !== stage; S.lastStage = stage;
    var y = changed ? 0 : window.scrollY;
    var info = stageInfo(e, stage);
    function li(a) { return a.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join(""); }

    var dots = ""; for (var k = 0; k <= N + 1; k++) dots += '<i class="' + (k <= stage ? "on" : "") + '"></i>';
    var h = '<div class="s-head"><div class="row" style="justify-content:space-between"><div class="meta">' + e.sem + "학기 " + e.unit + ". " + esc(unitName(e.grade, e.sem, e.unit)) + "</div>" +
      '<div class="row" style="gap:6px">' + (PREVIEW && T.user ? '<button class="btn" id="pvT" style="padding:4px 10px;font-size:13px">선생님 화면</button>' : "") +
      '<button class="btn" id="chg" style="padding:4px 10px;font-size:13px">' + S.group + "조 · 바꾸기</button></div></div>" +
      "<h1>" + esc(e.title) + "</h1>" + (s.page ? '<div class="meta" style="margin-top:4px">교과서 ' + esc(pageText(s.page)) + "</div>" : "") +
      '<div class="dots">' + dots + "</div></div>" +
      '<div class="wrap narrow stack">' +
      (s.active ? "" : '<div class="notice">수업이 끝났어요. 내용은 계속 볼 수 있어요.</div>');

    function doneBlock(label) {
      if (stage > N) return "";
      if (!meDone) return '<button class="go-btn" id="doneBtn"' + (s.active ? "" : " disabled") + ">" + label + "</button>";
      return '<div class="wait"><b>우리 조는 다했어요</b><div>다른 조를 기다리고 있어요. 선생님이 다음 장을 열면 화면이 바뀌어요.</div>' +
        '<button class="btn" id="undoBtn" style="margin-top:10px"' + (s.active ? "" : " disabled") + ">아직 덜 했어요(취소)</button></div>";
    }

    if (stage === 0) {
      h += '<div class="tag">준비</div><div class="muted">' + esc(e.goal) + "</div>" +
        '<div class="card"><b>준비물</b><div style="margin-top:6px">' +
        e.materials.map(function (m, i) {
          return '<label class="check"><input type="checkbox" data-m="' + i + '"' + (checks[i] ? " checked" : "") + "><span>" + esc(m) + "</span></label>";
        }).join("") + "</div></div>" +
        '<div class="safety"><h4 style="margin:0 0 4px;color:var(--warn)">안전 약속</h4><ul style="margin:0;padding-left:20px">' + li(e.safety) + "</ul></div>" +
        '<div class="predict"><b>예측해 봐요</b><div>' + esc(e.predict) + "</div></div>" +
        doneBlock("준비 다했어요");
    } else if (stage <= N) {
      h += '<div class="stepbig"><div class="tag">' + stage + " / " + N + ' 단계</div><div class="stxt">' + esc(info.text) + "</div></div>" +
        doneBlock("다했어요") +
        '<details class="card"><summary>안전 약속 다시 보기</summary><ul style="margin:8px 0 0;padding-left:20px">' + li(e.safety) + "</ul></details>" +
        (stage > 1 ? '<details class="card"><summary>앞 단계 다시 보기</summary><ol style="margin:8px 0 0;padding-left:20px">' + li(e.steps.slice(0, stage - 1)) + "</ol></details>" : "");
    } else {
      h += '<div class="predict"><b>처음에 예측한 것</b><div>' + esc(e.predict) + "</div></div>" +
        '<div class="card"><b>예상 결과</b><ul style="margin:6px 0 0;padding-left:20px">' + li(e.results) + "</ul></div>" +
        '<div class="card"><b>생각해 볼 질문</b><ul style="margin:6px 0 0;padding-left:20px">' + li(e.questions) + "</ul></div>" +
        '<details class="card"><summary>실험 순서 다시 보기</summary><ol style="margin:8px 0 0;padding-left:20px">' + li(e.steps) + "</ol></details>";
    }
    h += "</div>" + footer();
    $app.innerHTML = h;
    window.scrollTo(0, y);

    $app.querySelectorAll("input[data-m]").forEach(function (c) {
      c.onchange = function () { var o = lsGet("sci_mat_" + S.code, {}); o[c.dataset.m] = c.checked; lsSet("sci_mat_" + S.code, o); };
    });
    function mark(on, btn) {
      btn.disabled = true;
      store.setStepDone(S.code, S.group, stage, on).catch(function () { toast("저장하지 못했어요. 다시 눌러 주세요."); btn.disabled = false; });
    }
    var db = document.getElementById("doneBtn"); if (db) db.onclick = function () { mark(true, db); };
    var ub = document.getElementById("undoBtn"); if (ub) ub.onclick = function () { mark(false, ub); };
    var pv = document.getElementById("pvT");
    if (pv) pv.onclick = function () { previewToTeacher(S.code); };
    document.getElementById("chg").onclick = function () {
      if (S.unGroup) { S.unGroup(); S.unGroup = null; }
      S.group = null; S.gdata = null; lsSet("sci_group_" + S.code, null); renderPickGroup();
    };
  }

  function stopStudent() {
    if (S.unSession) S.unSession();
    if (S.unGroup) S.unGroup();
    S = { code: null, session: null, group: null, gdata: null, unSession: null, unGroup: null };
  }
  function previewToStudent(code) { clearSubs(); stopStudent(); window.scrollTo(0, 0); studentStart(code); }
  function previewToTeacher(code) { stopStudent(); window.scrollTo(0, 0); renderLive(code); }

  // ─────────────── 시작 ───────────────
  function boot() {
    var code = params.get("s");
    if (code) return studentStart(code);
    T.settings = Object.assign(T.settings, lsGet("sci_settings", {}));
    var first = true;
    store.onAuth(function (u) {
      T.user = u;
      if (!u) { first = false; return renderLanding(); }
      store.getTeacher(u.uid).then(function (t) {
        if (t && t.settings) T.settings = Object.assign(T.settings, t.settings);
      }).catch(function () {}).then(loadPages).then(function () {
        var last = lsGet("sci_last_session", null);
        if (first && params.get("live") && last) { first = false; return renderLive(last); }
        first = false; renderMain();
      });
    });
  }

  // 시험용으로 바깥에서 볼 수 있게
  window.__sciApp = { version: APP_VERSION, demo: DEMO, store: store };
  boot();
})();
