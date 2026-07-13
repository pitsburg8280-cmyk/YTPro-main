(function () {
  if (window.__ytproNativeEnhancements) return;
  window.__ytproNativeEnhancements = true;

  var HISTORY_KEY = "ytpro_native_history";
  var MAX_HISTORY = 200;
  var sleepTimerId = null;
  var sleepTimerEnd = 0;
  var userPauseUntil = 0;

  function enforceMobileViewport() {
    try {
      var vp = document.querySelector("meta[name='viewport']");
      if (!vp) {
        vp = document.createElement("meta");
        vp.setAttribute("name", "viewport");
        (document.head || document.documentElement).appendChild(vp);
      }
      vp.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover");

      if (!document.getElementById("ytproMobileRootCss")) {
        var st = document.createElement("style");
        st.id = "ytproMobileRootCss";
        st.textContent = "html,body{max-width:100vw !important;overflow-x:hidden !important;-webkit-text-size-adjust:100% !important;touch-action:manipulation;} ytm-app,ytm-mobile-topbar-renderer,ytm-watch{max-width:100vw !important;}";
        (document.head || document.documentElement).appendChild(st);
      }
    } catch (_e) {}
  }

  function getVideo() {
    return document.querySelector("video.video-stream") || document.querySelector("video");
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function readHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }

  function writeHistory(entries) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
    } catch (_e) {}
  }

  function getCurrentVideoMeta() {
    var url = location.href;
    var title = document.title || "YouTube";
    var thumb = "";
    var v = new URL(location.href).searchParams.get("v");
    if (!v && location.pathname.indexOf("/shorts/") > -1) {
      v = location.pathname.split("/shorts/")[1] || "";
      v = v.split("?")[0];
    }
    if (v) thumb = "https://i.ytimg.com/vi/" + v + "/hqdefault.jpg";
    return { url: url, title: title, thumb: thumb, savedAt: nowIso() };
  }

  function pushHistory() {
    if (location.href.indexOf("youtube.com/watch") === -1 && location.href.indexOf("youtube.com/shorts") === -1) return;
    var meta = getCurrentVideoMeta();
    var entries = readHistory();
    entries = entries.filter(function (x) { return x.url !== meta.url; });
    entries.unshift(meta);
    writeHistory(entries);
  }

  function continueWatchingIfPrompted() {
    var root = document.body;
    if (!root) return;
    var text = (root.innerText || "").toLowerCase();
    if (
      text.indexOf("video esta en pausa") === -1 &&
      text.indexOf("quieres seguir mirandolo") === -1 &&
      text.indexOf("still watching") === -1 &&
      text.indexOf("video paused") === -1 &&
      text.indexOf("continue watching") === -1
    ) {
      return;
    }

    var buttons = Array.prototype.slice.call(document.querySelectorAll("button, [role='button']"));
    for (var i = 0; i < buttons.length; i++) {
      var t = (buttons[i].innerText || buttons[i].ariaLabel || "").toLowerCase().trim();
      if (
        t.indexOf("si") > -1 ||
        t.indexOf("continuar") > -1 ||
        t.indexOf("seguir") > -1 ||
        t.indexOf("yes") > -1 ||
        t.indexOf("continue") > -1 ||
        t.indexOf("ok") > -1
      ) {
        buttons[i].click();
        break;
      }
    }

    var v = getVideo();
    if (v && v.paused && !v.ended) {
      v.play().catch(function () {});
    }
  }

  function setupAggressivePlaybackGuard() {
    var v = getVideo();
    if (!v) return;

    v.preload = "auto";
    v.setAttribute("playsinline", "true");
    v.setAttribute("webkit-playsinline", "true");

    if (!v.__ytproAutoResumeBound) {
      v.__ytproAutoResumeBound = true;

      v.addEventListener("pause", function () {
        if (v.ended) return;
        if (Date.now() < userPauseUntil) return;
        if (document.hidden || location.href.indexOf("youtube.com/watch") > -1 || location.href.indexOf("youtube.com/shorts") > -1) {
          setTimeout(function () {
            if (v.paused && !v.ended) v.play().catch(function () {});
          }, 80);
        }
      });

      v.addEventListener("waiting", function () {
        setTimeout(function () {
          if (v.paused && !v.ended) v.play().catch(function () {});
        }, 120);
      });

      if (!v.__ytproPausePatched) {
        v.__ytproPausePatched = true;
        var nativePause = v.pause.bind(v);
        v.pause = function () {
          nativePause();
          setTimeout(function () {
            if (Date.now() >= userPauseUntil && v.paused && !v.ended) {
              v.play().catch(function () {});
            }
          }, 90);
        };
      }

      v.addEventListener("play", pushHistory);
    }
  }

  function ensurePipVideoVisible() {
    var v = getVideo();
    if (!v) return;
    v.style.visibility = "visible";
    v.style.opacity = "1";
    v.style.display = "block";
    v.style.objectFit = "contain";
    v.style.background = "black";
    v.style.zIndex = "999999";
  }

  function addTimerOverlay() {
    if (document.getElementById("ytproNativeTimer")) return;
    var chip = document.createElement("div");
    chip.id = "ytproNativeTimer";
    chip.style.cssText = "position:fixed;right:10px;top:calc(env(safe-area-inset-top,0px) + 10px);max-width:calc(100vw - 20px);z-index:2147483647;padding:8px 12px;border-radius:999px;background:rgba(0,0,0,.72);color:#fff;font-size:12px;font-family:monospace;line-height:1;letter-spacing:.2px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(0,0,0,.28);";
    chip.textContent = "00:00 / 00:00";
    document.body.appendChild(chip);

    setInterval(function () {
      var v = getVideo();
      if (!v || !isFinite(v.duration) || v.duration <= 0 || (location.href.indexOf("watch") === -1 && location.href.indexOf("shorts") === -1)) {
        chip.style.display = "none";
        return;
      }
      chip.style.display = "block";
      var cur = Math.floor(v.currentTime || 0);
      var dur = Math.floor(v.duration || 0);
      var remain = Math.max(0, dur - cur);
      function fmt(s) {
        var h = Math.floor(s / 3600);
        var m = Math.floor((s % 3600) / 60);
        var ss = s % 60;
        if (h > 0) return (h < 10 ? "0" + h : "" + h) + ":" + (m < 10 ? "0" + m : "" + m) + ":" + (ss < 10 ? "0" + ss : "" + ss);
        return (m < 10 ? "0" + m : "" + m) + ":" + (ss < 10 ? "0" + ss : "" + ss);
      }
      chip.textContent = fmt(cur) + " / -" + fmt(remain);
    }, 500);
  }

  function openHistoryOverlay() {
    var existing = document.getElementById("ytproNativeHistoryOverlay");
    if (existing) {
      existing.remove();
      return;
    }

    var entries = readHistory();
    var wrap = document.createElement("div");
    wrap.id = "ytproNativeHistoryOverlay";
    wrap.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:2147483647;padding:10px 10px calc(env(safe-area-inset-bottom,0px) + 12px);overflow:auto;";

    var card = document.createElement("div");
    card.style.cssText = "width:100%;max-width:680px;box-sizing:border-box;margin:0 auto;background:#111;color:#fff;border-radius:14px;padding:12px;font-family:sans-serif;";
    card.innerHTML = "<div style='display:flex;flex-direction:column;gap:10px;'><b style='font-size:18px;line-height:1.2'>Historial de videos</b><div style='display:flex;gap:8px;flex-wrap:wrap;'><button id='ytproNativeClearHistory' style='flex:1 1 120px;min-height:42px;border:0;border-radius:11px;padding:8px 12px;background:#333;color:#fff;font-size:14px'>Limpiar</button><button id='ytproNativeCloseHistory' style='flex:1 1 120px;min-height:42px;border:0;border-radius:11px;padding:8px 12px;background:#cc2a2a;color:#fff;font-size:14px'>Cerrar</button></div></div><div id='ytproNativeHistoryList' style='margin-top:10px'></div>";

    var list = card.querySelector("#ytproNativeHistoryList");
    if (!entries.length) {
      list.innerHTML = "<p style='opacity:.8'>No hay videos en el historial.</p>";
    } else {
      var html = "";
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        html += "<a href='" + (e.url || "#") + "' style='display:flex;gap:10px;align-items:center;padding:8px;border-radius:11px;background:#1b1b1b;color:#fff;text-decoration:none;margin-bottom:8px'>" +
          "<img src='" + (e.thumb || "") + "' alt='' style='width:96px;height:54px;object-fit:cover;border-radius:8px;background:#000;flex:0 0 auto'>" +
          "<div style='min-width:0'><div style='display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14px;line-height:1.25'>" + (e.title || "Video") + "</div><div style='opacity:.7;font-size:12px;margin-top:3px'>" + (e.savedAt || "") + "</div></div>" +
          "</a>";
      }
      list.innerHTML = html;
    }

    wrap.appendChild(card);
    document.body.appendChild(wrap);

    card.querySelector("#ytproNativeCloseHistory").addEventListener("click", function () { wrap.remove(); });
    card.querySelector("#ytproNativeClearHistory").addEventListener("click", function () {
      writeHistory([]);
      wrap.remove();
    });
  }

  function askSleepTimer() {
    var mins = prompt("Temporizador de apagado (minutos). 0 para cancelar:", "30");
    if (mins === null) return;
    var m = parseInt(mins, 10);
    if (!isFinite(m) || m < 0) return;

    if (sleepTimerId) clearInterval(sleepTimerId);
    sleepTimerId = null;
    sleepTimerEnd = 0;

    if (m === 0) return;

    sleepTimerEnd = Date.now() + m * 60000;
    sleepTimerId = setInterval(function () {
      var left = sleepTimerEnd - Date.now();
      if (left <= 0) {
        clearInterval(sleepTimerId);
        sleepTimerId = null;
        var v = getVideo();
        if (v && !v.paused) v.pause();
        return;
      }
    }, 1000);
  }

  function createEnhancementSettings() {
    if (document.getElementById("ytproNativeTools")) return;
    var host = document.querySelector("#ssprodivI") || document.body;
    if (!host) return;

    var box = document.createElement("div");
    box.id = "ytproNativeTools";
    box.style.cssText = "display:block;height:auto;min-height:unset;padding:12px;margin-top:10px;border-radius:14px;background:rgba(127,127,127,.13);box-sizing:border-box;";
    box.innerHTML = "<style>#ytproNativeTools .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 10px 0}#ytproNativeTools .title{font-size:15px;font-weight:700;line-height:1.2}#ytproNativeTools label{font-size:13px}#ytproNativeTools select,#ytproNativeTools input{min-height:40px;box-sizing:border-box;border:0;border-radius:10px;padding:8px 10px;font-size:14px}#ytproNativeTools select{min-width:120px;flex:1}#ytproNativeTools input{width:88px}#ytproNativeTools button{min-height:42px;border:0;border-radius:11px;padding:8px 12px;font-size:14px}#ytproNativeTools .ghost{background:rgba(255,255,255,.9)}#ytproNativeTools .primary{background:#111;color:#fff}#ytproNativeTools .switch{display:flex;align-items:center;gap:8px;font-size:13px;flex-wrap:wrap}#ytproNativeTools .actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}@media (max-width:380px){#ytproNativeTools .actions{grid-template-columns:1fr}#ytproNativeTools input{width:100%}}</style>" +
      "<div class='row' style='justify-content:space-between'><b class='title'>Ajustes de red</b><label class='switch'><span>Enable Conscrypt</span><input type='checkbox' id='ytproEnableConscrypt'></label></div>" +
      "<div class='row'><label>DNS</label><select id='ytproDnsProvider'><option value='system'>System</option><option value='google'>Google</option><option value='cloudflare'>Cloudflare</option></select></div>" +
      "<div class='row'><label>Timeout (s)</label><input id='ytproTimeoutSec' type='number' min='5' max='120' step='1'><button id='ytproSaveNetwork' class='primary'>Guardar red</button></div>" +
      "<div class='actions'><button id='ytproBtnTimer' class='ghost'>Temporizador</button><button id='ytproBtnHistory' class='ghost'>Ver historial</button></div>";

    host.appendChild(box);

    var sw = box.querySelector("#ytproEnableConscrypt");
    var dns = box.querySelector("#ytproDnsProvider");
    var timeout = box.querySelector("#ytproTimeoutSec");
    try {
      sw.checked = !!(window.Android && Android.getEnableConscrypt && Android.getEnableConscrypt());
      if (window.Android && Android.getPreferredDnsProvider) {
        dns.value = (Android.getPreferredDnsProvider() || "system").toLowerCase();
      }
      if (window.Android && Android.getNetworkTimeoutSeconds) {
        timeout.value = String(Android.getNetworkTimeoutSeconds());
      }
    } catch (_e) {}

    sw.addEventListener("change", function () {
      try {
        if (window.Android && Android.setEnableConscrypt) {
          Android.setEnableConscrypt(!!sw.checked);
          if (window.Android.showToast) {
            Android.showToast("Conscrypt " + (sw.checked ? "activado" : "desactivado") + ". Reinicia la app para aplicar.");
          }
        }
      } catch (_e) {}
    });

    box.querySelector("#ytproSaveNetwork").addEventListener("click", function () {
      try {
        var sec = parseInt(timeout.value || "20", 10);
        if (!isFinite(sec)) sec = 20;
        sec = Math.max(5, Math.min(120, sec));
        timeout.value = String(sec);
        if (window.Android && Android.setNetworkTimeoutSeconds) {
          Android.setNetworkTimeoutSeconds(sec);
        }
        if (window.Android && Android.setPreferredDnsProvider) {
          Android.setPreferredDnsProvider(dns.value || "system");
        }
        if (window.Android && Android.showToast) {
          Android.showToast("Red guardada: DNS=" + dns.value + ", timeout=" + sec + "s.");
        }
      } catch (_e) {}
    });

    box.querySelector("#ytproBtnHistory").addEventListener("click", openHistoryOverlay);
    box.querySelector("#ytproBtnTimer").addEventListener("click", askSleepTimer);
  }

  function boot() {
    enforceMobileViewport();
    continueWatchingIfPrompted();
    setupAggressivePlaybackGuard();
    ensurePipVideoVisible();
    addTimerOverlay();
    createEnhancementSettings();
  }

  var obs = new MutationObserver(function () {
    boot();
  });
  obs.observe(document.documentElement || document.body, { childList: true, subtree: true });

  window.addEventListener("pageshow", boot);
  window.addEventListener("focus", boot);
  document.addEventListener("pointerdown", function (e) {
    var n = e.target;
    if (!n) return;
    var txt = ((n.innerText || n.ariaLabel || "") + "").toLowerCase();
    if (
      txt.indexOf("pause") > -1 ||
      txt.indexOf("pausar") > -1 ||
      txt.indexOf("pausa") > -1
    ) {
      userPauseUntil = Date.now() + 1800;
    }
  }, true);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) boot();
  });

  setInterval(function () {
    enforceMobileViewport();
    continueWatchingIfPrompted();
    setupAggressivePlaybackGuard();
    ensurePipVideoVisible();
  }, 800);

  setInterval(pushHistory, 10000);
  boot();
})();
