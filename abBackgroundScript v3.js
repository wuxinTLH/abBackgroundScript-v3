// ==UserScript==
// @name         AB站网页背景更改 V3
// @namespace    SakuraBackgroundScript
// @description  AB站背景更改油猴脚本第三代，重构架构，优化UI/性能/兼容性，支持远程图库接口。
// @icon         http://github.smiku.site/sakura.png
// @license      MIT
// @version      v3.0.4
// @author       SakuraMikku
// @copyright    2023-2099, SakuraMikku
// @bilibili     https://space.bilibili.com/29058270
// @github       https://github.com/wuxinTLH
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @match        *www.bilibili.com/*
// @match        *://*.bilibili.com/*
// @match        *message.bilibili.com/*
// @match        *t.bilibili.com/*
// @match        *manga.bilibili.com/*
// @match        *live.bilibili.com/blackboard/*
// @match        *www.bilibili.com/page-proxy/*
// @match        *www.acfun.cn/*
// @match        *.acfun.cn/*
// @exclude      *live.bilibili.com/p/html/live-lottery/*
// @exclude      *message.bilibili.com/pages/nav/index_new_pc_sync*
// @exclude      *t.bilibili.com/pages/nav/index_new*
// @exclude      *member.bilibili.com/x2/creative/*
// @exclude      *member.bilibili.com/video/*
// @exclude      *ink.bilibili.com/p/center/course/index.html*
// @exclude      *www.bilibili.com/v/pay/charge*
// @exclude      *message.acfun.cn/*
// @exclude      *www.bilibili.com/bangumi*
// @exclude      *account.bilibili.com/account/*
// @exclude      *cm.bilibili.com/quests/*
// @exclude      *member.bilibili.com/platform*
// @exclude      *pay.bilibili.com/pay-v2-web*
// ==/UserScript==

; (function (global) {
    "use strict";

    if (global.__SAKURA_BG_LOADED__) return;
    global.__SAKURA_BG_LOADED__ = true;

    // ============================================================
    // CONFIG
    // ============================================================
    var REMOTE_CONFIG = {
        enabled: true,
        url: "https://api1.node.syjx.space:30443/api/images/bg/imgs",
        cacheMinutes: 43200,
        retryTimes: 5,
        retryDelay: 1000,
        timeout: 8000,
    };

    var DEFAULT_GALLERY = [
        { url: "https://picui.ogmua.cn/s1/2026/03/12/69b27894a3fb9.webp", title: "默认 1" },
        { url: "https://picui.ogmua.cn/s1/2026/03/12/69b27895c9ace.webp", title: "默认 2" },
        { url: "https://picui.ogmua.cn/s1/2026/03/12/69b2789652dda.webp", title: "默认 3" },
        { url: "https://picui.ogmua.cn/s1/2026/03/12/69b27896690ce.webp", title: "默认 4" },
        { url: "https://picui.ogmua.cn/s1/2026/03/12/69b2789672e0f.webp", title: "默认 5" },
        { url: "https://picui.ogmua.cn/s1/2026/03/12/69b2789d06cea.webp", title: "默认 6" },
    ];

    var AUTHOR = {
        name: "SakuraMikku",
        bilibili: "https://space.bilibili.com/29058270",
        github: "https://github.com/wuxinTLH",
        qqGroup: "793513923",
    };

    // ============================================================
    // SITE CONFIG
    // ============================================================
    /**
     * 设计原则（针对截图问题的根本修复）：
     *
     * ❌ 旧方案的三个核心错误：
     *   1. 在 opaqueSelectors 上强制 background-color:#fff → 深色模式下导航栏变白色/不可见
     *   2. 在任何选择器上使用 background-image:none → 删除了 banner 图、用户主页封面图
     *   3. 在 opaqueSelectors 上强制 z-index:100 → 阻挡了动态弹窗、hover卡片、登录框等
     *
     * ✅ 新方案：
     *   1. transparentSelectors：只设置 background-color:transparent，绝不动 background-image
     *      - 选择器只针对"纯内容容器"，不包含任何含 banner/图片的元素
     *      - 不包含 #app（太宽泛，会把头部也透明化）
     *   2. opaqueSelectors CSS 块：完全废除，不注入任何强制覆盖规则
     *   3. guardSelectors：仅针对页面 JS 会动态将 alpha 设为 ~0 的元素（如空间页顶部导航）
     *      由 AlphaGuard 智能读取元素原始颜色后恢复，不再硬编码 #fff
     *
     * transparentSelectors 只应包含"主内容区容器"，特征：
     *   - 纯色背景（白/暗），无 background-image
     *   - 不包含导航栏、banner 区域、弹窗根节点
     */
    var MIN_ALPHA = 0.85;

    var SITE_CONFIG = (function () {
        var host = location.host;
        var path = location.pathname;

        // ── B 站 ───────────────────────────────────────────────────
        if (host.indexOf("bilibili.com") !== -1) {

            // 空间页 space.bilibili.com
            // DOM 层级：html → body → #app → [div.header.space-header (兄弟)] + main.space-main
            //
            // ★ 关键：.header.space-header 是 main.space-main 的【兄弟元素】，不是祖先/后代。
            //   若在 html/body 上设置背景图，会穿透 .space-header 的透明区域，
            //   把用户的 bilibili 个人 banner 覆盖掉。
            //
            // ✅ 正确方案：CSS 直接给 main.space-main 设置 background-image。
            //   main.space-main 的背景只作用于自身区域，.space-header 完全不受影响。
            //   新版页面（有 main.space-main）→ CSS 直接生效
            //   旧版页面（无 main.space-main）→ SpacePageInjector 回退到 #app
            if (host.indexOf("space.bilibili.com") !== -1) {
                return {
                    site: "bili",
                    // 透明选择器：用于透明度滑块控制内容区白色遮罩
                    // 注意：不包含 main.space-main（它由 buildCSS 直接设背景图）
                    transparentSelectors: [
                        "#app",
                        ".space-page",
                        ".s-upinfo",
                        ".col-body",
                        ".s-content",
                    ],
                    guardSelectors: [
                        // AlphaGuard 防止 B站 JS 将 .space-header 背景色 alpha→0
                        { selector: ".header.space-header" },
                        { selector: ".space-header" },
                    ],
                    // ChainTransparifier 向上遍历锚点（处理未知中间容器）
                    anchorSelectors: [".col-body", ".s-content", ".space-page"],
                };
            }

            // 直播页
            if (host.indexOf("live.bilibili.com") !== -1) {
                return {
                    site: "bili",
                    transparentSelectors: ["#app", ".live-room-app", ".room-container-box"],
                    guardSelectors: [],
                    anchorSelectors: ["#app"],
                };
            }

            // 视频页
            if (path.indexOf("/video/") !== -1 || path.indexOf("/list/") !== -1) {
                return {
                    site: "bili",
                    transparentSelectors: ["#app", "#mirror-vdcon", ".video-container-v1"],
                    guardSelectors: [],
                    anchorSelectors: ["#mirror-vdcon", "#app"],
                };
            }

            // 搜索页
            if (host.indexOf("search.bilibili.com") !== -1) {
                return {
                    site: "bili",
                    transparentSelectors: ["#app", ".search-content", ".search-layout"],
                    guardSelectors: [],
                    anchorSelectors: [".search-content", "#app"],
                };
            }

            // 首页及通用
            return {
                site: "bili",
                transparentSelectors: ["#app", "#i_cecream", "#bili-feed4", ".recommended-container_floor-aside"],
                guardSelectors: [],
                anchorSelectors: ["#bili-feed4", "#app"],
            };
        }

        // ── A 站 acfun.cn ──────────────────────────────────────────
        if (host.indexOf("acfun.cn") !== -1) {

            if (path.indexOf("/v/") !== -1 || path.indexOf("/video/") !== -1) {
                return {
                    site: "acfun",
                    transparentSelectors: ["#app", ".ac-section", ".player-area"],
                    guardSelectors: [{ selector: ".header" }, { selector: ".fixed-header" }],
                    anchorSelectors: [".ac-section", "#app"],
                };
            }

            if (path.indexOf("/search") !== -1) {
                return {
                    site: "acfun",
                    transparentSelectors: ["#app", ".search-content", ".search__main"],
                    guardSelectors: [{ selector: ".header" }, { selector: ".fixed-header" }],
                    anchorSelectors: [".search-content", "#app"],
                };
            }

            return {
                site: "acfun",
                transparentSelectors: ["#app", ".home-main-content", ".list-container", ".channel-main"],
                guardSelectors: [{ selector: ".header" }, { selector: ".fixed-header" }],
                anchorSelectors: [".home-main-content", ".list-container", "#app"],
            };
        }

        return {
            site: "unknown",
            transparentSelectors: [],
            guardSelectors: [],
            anchorSelectors: [],
        };
    })();

    // ============================================================
    // 工具函数
    // ============================================================
    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function fetchWithTimeout(url, options, timeout) {
        if (typeof AbortController === "undefined") return fetch(url, options);
        var ctrl = new AbortController();
        var timer = setTimeout(function () { ctrl.abort(); }, timeout);
        return fetch(url, Object.assign({}, options, { signal: ctrl.signal }))
            .finally(function () { clearTimeout(timer); });
    }

    function $id(id) { return document.getElementById(id); }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    /**
     * 解析 CSS color 字符串 → [r, g, b, a]
     * 注意：空串/"transparent" → [0,0,0,0]（符合 CSS 规范，transparent = rgba(0,0,0,0)）
     */
    function parseColor(str) {
        if (!str || str === "transparent" || str === "") return [0, 0, 0, 0];
        str = str.trim();
        var m = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
        if (m) return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1];
        m = str.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 1];
        m = str.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
        if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16), 1];
        return [0, 0, 0, 1];
    }

    // ============================================================
    // LOGGER
    // ============================================================
    var Logger = (function () {
        var P = "[SakuraBG v3]";
        function ts() { var d = new Date(); return d.toLocaleDateString() + " " + d.toLocaleTimeString(); }
        return {
            info: function () { console.info.apply(console, [P, ts()].concat([].slice.call(arguments))); },
            warn: function () { console.warn.apply(console, [P, ts()].concat([].slice.call(arguments))); },
            error: function () { console.error.apply(console, [P, ts()].concat([].slice.call(arguments))); },
        };
    })();

    // ============================================================
    // REMOTE GALLERY PROVIDER
    // ============================================================
    var RemoteGalleryProvider = (function () {
        var _cache = null, _cacheTime = 0;
        return {
            fetchList: async function () {
                if (!REMOTE_CONFIG.enabled || !REMOTE_CONFIG.url) return null;
                var now = Date.now();
                if (_cache && (now - _cacheTime) < REMOTE_CONFIG.cacheMinutes * 60000) return _cache;
                var attempt = 0;
                while (attempt <= REMOTE_CONFIG.retryTimes) {
                    try {
                        var res = await fetchWithTimeout(REMOTE_CONFIG.url,
                            { method: "GET", headers: { Accept: "application/json" } },
                            REMOTE_CONFIG.timeout);
                        if (!res.ok) throw new Error("HTTP " + res.status);
                        var json = await res.json();
                        if (json.code === 200 && json.data && Array.isArray(json.data.list) && json.data.list.length) {
                            _cache = json.data.list.map(function (i) {
                                return { url: i.url, title: i.title || i.name || "" };
                            });
                            _cacheTime = now;
                            Logger.info("远程图库加载成功，共", _cache.length, "张");
                            return _cache;
                        }
                        throw new Error("接口数据格式错误");
                    } catch (err) {
                        attempt++;
                        Logger.warn("远程图库请求失败（第" + attempt + "次）:", err.message || err);
                        if (attempt > REMOTE_CONFIG.retryTimes) { Logger.warn("远程图库全部失败，降级至默认"); return null; }
                        await sleep(REMOTE_CONFIG.retryDelay * Math.pow(2, attempt - 1));
                    }
                }
                return null;
            },
            clearCache: function () { _cache = null; _cacheTime = 0; }
        };
    })();

    // ============================================================
    // STORAGE MODULE
    // ============================================================
    var StorageModule = (function () {
        var DB_NAME = "SakuraBGv3", DB_STORE = "bgData", DB_VER = 1;
        var LS_KEY = "SakuraBGv3_url";
        var CHUNK = 4 * 1024 * 1024;
        var _mem = null, _dbP = null;

        function getDB() {
            if (_dbP) return _dbP;
            _dbP = new Promise(function (resolve, reject) {
                var idb = global.indexedDB || global.mozIndexedDB || global.webkitIndexedDB;
                if (!idb) { _dbP = null; return reject(new Error("no IDB")); }
                var r = idb.open(DB_NAME, DB_VER);
                r.onerror = function () { _dbP = null; reject(r.error); };
                r.onblocked = function () { _dbP = null; reject(new Error("IDB blocked")); };
                r.onupgradeneeded = function (e) {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains(DB_STORE))
                        db.createObjectStore(DB_STORE, { keyPath: "id" });
                };
                r.onsuccess = function (e) { resolve(e.target.result); };
            });
            return _dbP;
        }
        async function idbSet(url) {
            var db = await getDB(), chunks = [];
            for (var i = 0; i < url.length; i += CHUNK) chunks.push(url.slice(i, i + CHUNK));
            return new Promise(function (res, rej) {
                var tx = db.transaction([DB_STORE], "readwrite"), st = tx.objectStore(DB_STORE);
                st.clear();
                chunks.forEach(function (c, idx) { st.add({ id: idx, data: c }); });
                tx.oncomplete = res; tx.onerror = function () { rej(tx.error); };
            });
        }
        async function idbGet() {
            var db = await getDB();
            var r = await new Promise(function (res, rej) {
                var tx = db.transaction([DB_STORE], "readonly"), req = tx.objectStore(DB_STORE).getAll();
                req.onsuccess = function () { res(req.result); }; req.onerror = function () { rej(req.error); };
            });
            if (!r || !r.length) return null;
            r.sort(function (a, b) { return a.id - b.id; });
            return r.map(function (x) { return x.data; }).join("");
        }
        async function idbDel() {
            var db = await getDB();
            return new Promise(function (res, rej) {
                var tx = db.transaction([DB_STORE], "readwrite");
                tx.objectStore(DB_STORE).clear(); tx.oncomplete = res; tx.onerror = function () { rej(tx.error); };
            });
        }
        function lsSet(s, v) { try { s.setItem(LS_KEY, v); return true; } catch (e) { return false; } }
        function lsGet(s) { try { return s.getItem(LS_KEY); } catch (e) { return null; } }
        function lsDel(s) { try { s.removeItem(LS_KEY); } catch (e) { } }

        return {
            save: async function (url) {
                try { await idbSet(url); Logger.info("→ IDB"); return; } catch (e) { Logger.warn("IDB写失败:", e.message); }
                if (lsSet(localStorage, url)) { Logger.info("→ localStorage"); return; }
                if (lsSet(sessionStorage, url)) { Logger.warn("→ sessionStorage"); return; }
                _mem = url; Logger.warn("→ memory");
            },
            load: async function () {
                try { var v = await idbGet(); if (v) return v; } catch (e) { Logger.warn("IDB读失败:", e.message); }
                return lsGet(localStorage) || lsGet(sessionStorage) || _mem || null;
            },
            remove: async function () {
                try { await idbDel(); } catch (e) { }
                lsDel(localStorage); lsDel(sessionStorage); _mem = null;
                Logger.info("存储已清除");
            }
        };
    })();

    // ============================================================
    // ALPHA GUARD MODULE
    // ============================================================
    /**
     * 解决的核心问题：
     *   B站空间页等页面的 JS 会在 scroll 事件中动态给导航元素设置
     *   element.style.backgroundColor = "rgba(R,G,B,0~1)"
     *   —— 这是 inline style，优先级高于任何 CSS 规则（包括 !important）
     *   因此纯 CSS 方案无法阻止这种动态透明化。
     *
     * 本模块策略（三层防御）：
     *   [1] MutationObserver：监听 style 属性变化，立即检测并修复
     *   [2] requestAnimationFrame 轮询：每帧主动兜底检查
     *   [3] DOM 变化监听：SPA 路由后重新扫描新出现的元素
     *
     * 颜色恢复算法（解决"不是所有元素都是 #fff"问题）：
     *   不硬编码任何颜色，按优先级自动推断：
     *   ① lastGoodColor —— 该元素上次处于不透明状态时的 inline 颜色（最准确）
     *   ② cssColor       —— 去掉 inline style 后，CSS 规则层的 computed 颜色（深/浅模式均正确）
     *   ③ cssImage       —— CSS 规则层有背景图时，恢复图片（颜色保持透明）
     *   ④ inline RGB     —— JS 设的 rgba(R,G,B,0) 中的 RGB 就是目标颜色，只需 alpha→1
     *   ⑤ 白色兜底
     *
     * readCSSBg 安全性说明：
     *   临时 removeProperty → getComputedStyle → 立即恢复
     *   JS 同步执行期间浏览器不 repaint，只做 style recalc，用户看不到闪烁。
     *   为防止 MutationObserver 被 removeProperty 触发递归，使用 _fixing 标志位。
     */
    var AlphaGuard = (function () {
        // WeakMap: element → { cssColor, cssImage, lastColor, lastImage, _fixing }
        var _wMap = typeof WeakMap !== "undefined" ? new WeakMap() : null;
        var _watchers = [];   // [{ el, observer }]
        var _rafId = null;
        var _rootObs = null;
        var _active = false;

        function cacheGet(el) { return _wMap ? (_wMap.get(el) || null) : null; }
        function cacheSet(el, v) { if (_wMap) _wMap.set(el, v); }

        /**
         * 读取 CSS 规则层的背景（排除 inline style）
         * 通过临时移除 inline 背景属性后调用 getComputedStyle 实现
         */
        function readCSSBg(el) {
            // 保存当前 inline 值（含 priority）
            var oc = el.style.getPropertyValue("background-color");
            var ocp = el.style.getPropertyPriority("background-color");
            var oi = el.style.getPropertyValue("background-image");
            var oip = el.style.getPropertyPriority("background-image");

            // 临时移除，让 getComputedStyle 读 CSS 规则层
            el.style.removeProperty("background-color");
            el.style.removeProperty("background-image");

            var cs = window.getComputedStyle(el);
            var color = cs.backgroundColor;
            var image = cs.backgroundImage;

            // 同步恢复（JS 执行期间不触发 repaint，无闪烁）
            if (oc) el.style.setProperty("background-color", oc, ocp);
            if (oi) el.style.setProperty("background-image", oi, oip);

            return { color: color, image: image };
        }

        /**
         * 核心修复函数
         * 判断 inline backgroundColor 的 alpha 是否过低，若是则智能恢复
         */
        function fixElement(el) {
            var info = cacheGet(el);

            // _fixing: 防止 readCSSBg 内的 removeProperty 触发 MutationObserver 递归
            if (info && info._fixing) return;

            var inlineColor = el.style.getPropertyValue("background-color");
            // 没有设置 inline background-color → 完全由 CSS 规则控制，不干预
            if (!inlineColor) return;

            var parts = parseColor(inlineColor);
            var alpha = parts[3];

            if (!info) {
                info = {
                    cssColor: null, cssImage: null,
                    lastColor: null, lastImage: null, _fixing: false
                };
                cacheSet(el, info);
            }

            if (alpha >= MIN_ALPHA) {
                // 好状态：记录为"最后一次已知不透明颜色"（下次透明时用于恢复）
                info.lastColor = inlineColor;
                info.lastImage = el.style.getPropertyValue("background-image") || "";
                return;
            }

            // ── 需要修复 ──────────────────────────────────────────
            // 懒初始化：首次遇到坏状态时，读取 CSS 层颜色
            if (info.cssColor === null) {
                info._fixing = true;
                var css = readCSSBg(el);
                info.cssColor = css.color || "";
                info.cssImage = css.image || "";
                info._fixing = false;
            }

            var restoreColor = null;
            var restoreImage = null;
            var cssAlpha = parseColor(info.cssColor)[3];

            if (info.lastColor) {
                // ① 最优：上次见过的不透明 inline 颜色（深/浅模式均正确）
                var lc = parseColor(info.lastColor);
                restoreColor = "rgba(" + lc[0] + "," + lc[1] + "," + lc[2] + ",1)";
                if (info.lastImage && info.lastImage !== "none") restoreImage = info.lastImage;

            } else if (cssAlpha >= MIN_ALPHA) {
                // ② CSS 规则定义了不透明颜色（无论深色/浅色主题）
                restoreColor = info.cssColor;
                if (info.cssImage && info.cssImage !== "none") restoreImage = info.cssImage;

            } else if (info.cssImage && info.cssImage !== "none") {
                // ③ CSS 有背景图（透明色是为了让图片显示，我们只需恢复图片）
                // 不修改颜色，只确保图片存在
                restoreImage = info.cssImage;

            } else if (parts[0] + parts[1] + parts[2] > 0) {
                // ④ 滚动渐变模式：rgba(R,G,B,0) 中的 RGB 就是目标色，强制 alpha→1
                // 适用于 B站 space-header: rgba(255,255,255,0) → rgba(255,255,255,1)
                restoreColor = "rgba(" + parts[0] + "," + parts[1] + "," + parts[2] + ",1)";

            } else {
                // ⑤ rgba(0,0,0,0) 且 CSS 也透明：再读一次 CSS（应对时序问题）
                info._fixing = true;
                var css2 = readCSSBg(el);
                info._fixing = false;
                var cp = parseColor(css2.color || "");
                if (cp[3] >= MIN_ALPHA || cp[0] + cp[1] + cp[2] > 0) {
                    restoreColor = css2.color;
                } else {
                    // 终极兜底：白色（此情况极少出现）
                    restoreColor = "rgba(255,255,255,1)";
                }
            }

            if (restoreColor !== null) {
                el.style.setProperty("background-color", restoreColor, "important");
            }
            if (restoreImage !== null) {
                el.style.setProperty("background-image", restoreImage, "important");
            }
        }

        /** 对单个元素建立监视 */
        function watchEl(el) {
            for (var i = 0; i < _watchers.length; i++) {
                if (_watchers[i].el === el) return; // 已在监视中
            }
            fixElement(el); // 立即修复一次

            var obs = new MutationObserver(function (mutations) {
                for (var j = 0; j < mutations.length; j++) {
                    if (mutations[j].attributeName === "style") {
                        fixElement(el);
                        break;
                    }
                }
            });
            obs.observe(el, { attributes: true, attributeFilter: ["style"] });
            _watchers.push({ el: el, observer: obs });
            Logger.info("AlphaGuard: 接管", el.className || el.tagName);
        }

        /** 扫描所有 guardSelectors，建立监视 */
        function scanAndWatch() {
            (SITE_CONFIG.guardSelectors || []).forEach(function (rule) {
                var els = document.querySelectorAll(rule.selector);
                for (var i = 0; i < els.length; i++) watchEl(els[i]);
            });
        }

        /** rAF 轮询：兜底检查（MutationObserver 极少情况下可能延迟） */
        function rafLoop() {
            _watchers.forEach(function (w) {
                if (document.contains(w.el)) {
                    fixElement(w.el);
                } else {
                    w.observer.disconnect();
                    w._stale = true;
                }
            });
            _watchers = _watchers.filter(function (w) { return !w._stale; });
            if (_active) _rafId = requestAnimationFrame(rafLoop);
        }

        /** 监听 DOM 结构变化（SPA 路由后元素重新插入） */
        function watchRootDOM() {
            if (_rootObs) return;
            _rootObs = new MutationObserver(function (mutations) {
                var hasNew = false;
                for (var i = 0; i < mutations.length; i++) {
                    if (mutations[i].addedNodes.length) { hasNew = true; break; }
                }
                if (hasNew) scanAndWatch();
            });
            _rootObs.observe(document.body || document.documentElement,
                { childList: true, subtree: true });
        }

        return {
            start: function () {
                if (_active) return;
                _active = true;
                scanAndWatch();
                watchRootDOM();
                _rafId = requestAnimationFrame(rafLoop);
                Logger.info("AlphaGuard 已启动，守护", (SITE_CONFIG.guardSelectors || []).length, "条规则");
            },
            stop: function () {
                _active = false;
                if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
                _watchers.forEach(function (w) { w.observer.disconnect(); });
                _watchers = [];
                if (_rootObs) { _rootObs.disconnect(); _rootObs = null; }
                Logger.info("AlphaGuard 已停止");
            },
            rescan: function () {
                _watchers.forEach(function (w) { w.observer.disconnect(); });
                _watchers = [];
                scanAndWatch();
            }
        };
    })();

    // ============================================================
    // CHAIN TRANSPARIFIER MODULE
    // ============================================================
    /**
     * 两个问题的根本修复：
     *
     * 问题①：仅监听 childList 无法捕获 Vue 直接修改 style 属性的情况
     *   e.g. el.style.backgroundColor = 'rgb(22,22,22)'  ← 不触发 childList
     *   修复：对每个被透明化的元素额外挂载 attributeFilter:["style"] 的 observer，
     *         style 一变就立即重新透明化（per-element style guard）
     *
     * 问题②：新版空间页 main.space-main 可能有独立层叠上下文（transform/will-change），
     *   导致外层 html 背景无法穿透。对这类元素，背景图设在外层毫无用处。
     *   修复：由 SpacePageInjector 在 main.space-main 内部注入固定背景 div。
     */
    var ChainTransparifier = (function () {
        var _savedMap = typeof WeakMap !== "undefined" ? new WeakMap() : null;
        var _savedEls = [];
        // per-element style attribute observers（防 Vue 直接重置 style）
        var _styleGuards = typeof WeakMap !== "undefined" ? new WeakMap() : null;
        var _styleGuardArr = [];
        // 全局 childList observer（检测新节点插入）
        var _waitObs = null;
        var _active = false;
        var _debTimer = null;

        function isProtected(el) {
            if (!el) return true;
            if (el.id && el.id.indexOf("skbg-") === 0) return true;
            var uiRoot = document.getElementById("skbg-root");
            if (uiRoot && uiRoot.contains(el)) return true;
            var guards = SITE_CONFIG.guardSelectors || [];
            for (var i = 0; i < guards.length; i++) {
                try { if (el.matches && el.matches(guards[i].selector)) return true; }
                catch (e) { }
            }
            return false;
        }

        /**
         * 给单个元素挂载 style 属性监听器
         * 当 Vue 重置 style.backgroundColor 为不透明时立即重新透明化
         * 解决"背景瞬间出现后被遮挡"的核心问题
         */
        function ensureStyleGuard(el) {
            if (_styleGuards && _styleGuards.has(el)) return;

            var obs = new MutationObserver(function () {
                if (!_active) return;
                var cs = window.getComputedStyle(el);
                // 有 background-image 的元素不干预
                if (cs.backgroundImage && cs.backgroundImage !== "none") return;
                var parts = parseColor(cs.backgroundColor);
                if (parts[3] >= 0.05) {
                    // background 被重置为不透明 → 立即重新透明化
                    el.style.setProperty("background-color", "transparent", "important");
                }
            });
            obs.observe(el, { attributes: true, attributeFilter: ["style"] });
            if (_styleGuards) _styleGuards.set(el, obs);
            _styleGuardArr.push(obs);
        }

        function transparifyOne(el) {
            if (!el || el === document.documentElement || el === document.body) return;
            if (isProtected(el)) return;
            var cs = window.getComputedStyle(el);
            if (cs.backgroundImage && cs.backgroundImage !== "none") return;
            var parts = parseColor(cs.backgroundColor);
            if (parts[3] < 0.05) {
                // 已透明：仍需挂载 guard，防止之后被重置
                ensureStyleGuard(el);
                return;
            }
            if (_savedMap && !_savedMap.has(el)) {
                _savedMap.set(el, {
                    orig: el.style.getPropertyValue("background-color"),
                    pri: el.style.getPropertyPriority("background-color"),
                });
                _savedEls.push(el);
            }
            el.style.setProperty("background-color", "transparent", "important");
            // 挂载 per-element guard，防止 Vue 重置后丢失透明化效果
            ensureStyleGuard(el);
        }

        function walkUp(anchor) {
            var cur = anchor;
            while (cur && cur !== document.body && cur !== document.documentElement) {
                transparifyOne(cur);
                cur = cur.parentElement;
            }
        }

        function runAll() {
            if (!_active) return;
            (SITE_CONFIG.anchorSelectors || []).forEach(function (sel) {
                var el = document.querySelector(sel);
                if (el) walkUp(el);
            });
        }

        function scheduleRun() {
            clearTimeout(_debTimer);
            _debTimer = setTimeout(runAll, 150);
        }

        return {
            start: function () {
                if (_active) return;
                _active = true;
                runAll();
                _waitObs = new MutationObserver(function (mutations) {
                    for (var i = 0; i < mutations.length; i++) {
                        if (mutations[i].addedNodes.length > 0) {
                            scheduleRun();
                            return;
                        }
                    }
                });
                _waitObs.observe(document.body || document.documentElement,
                    { childList: true, subtree: true });
                Logger.info("ChainTransparifier 已启动，锚点:",
                    (SITE_CONFIG.anchorSelectors || []).join(", ") || "（无）");
            },
            stop: function () {
                _active = false;
                clearTimeout(_debTimer);
                if (_waitObs) { _waitObs.disconnect(); _waitObs = null; }
                _styleGuardArr.forEach(function (o) { o.disconnect(); });
                _styleGuardArr = [];
                _styleGuards = typeof WeakMap !== "undefined" ? new WeakMap() : null;
                _savedEls.forEach(function (el) {
                    if (!document.contains(el)) return;
                    var saved = _savedMap ? _savedMap.get(el) : null;
                    if (!saved) return;
                    if (saved.orig) el.style.setProperty("background-color", saved.orig, saved.pri);
                    else el.style.removeProperty("background-color");
                });
                _savedEls = [];
                _savedMap = typeof WeakMap !== "undefined" ? new WeakMap() : null;
                Logger.info("ChainTransparifier 已停止并还原");
            },
            rescan: function () {
                _styleGuardArr.forEach(function (o) { o.disconnect(); });
                _styleGuardArr = [];
                _styleGuards = typeof WeakMap !== "undefined" ? new WeakMap() : null;
                _savedEls = [];
                _savedMap = typeof WeakMap !== "undefined" ? new WeakMap() : null;
                runAll();
                Logger.info("ChainTransparifier 重新扫描");
            },
        };
    })();

    // ============================================================
    // SPACE PAGE INJECTOR  （旧版空间页回退处理）
    // ============================================================
    /**
     * 新版空间页（有 main.space-main）：
     *   buildCSS 生成的 CSS 规则 "main.space-main { background-image: url(...) }"
     *   会由浏览器自动应用，无需 JS 注入。CSS 选择器在 Vue 渲染后依然生效。
     *   ✅ 背景仅作用于 main.space-main 区域，.space-header 完全不受影响。
     *
     * 旧版空间页（无 main.space-main）：
     *   CSS 规则无法匹配，本模块作为回退：
     *   等待 500ms（Vue 初始化窗口），若仍未出现 main.space-main，
     *   则将背景直接注入到 #app 的 inline style（原 v3.0.3 方案）。
     */
    var SpacePageInjector = (function () {
        var _url = null;
        var _active = false;
        var _oldMode = false;   // 是否已切换到旧版 #app 回退
        var _timer = null;

        function esc(u) { return u.replace(/'/g, "\\'"); }

        /** 旧版回退：直接给 #app 设置 background-image inline style */
        function applyOldPage(url) {
            var app = document.getElementById("app");
            if (!app) return;
            app.style.setProperty("background-image", "url('" + esc(url) + "')", "important");
            app.style.setProperty("background-size", "cover", "important");
            app.style.setProperty("background-position", "center top", "important");
            app.style.setProperty("background-attachment", "fixed", "important");
            app.style.setProperty("background-repeat", "no-repeat", "important");
            _oldMode = true;
            Logger.info("SpacePageInjector: 旧版空间页，背景已注入 #app");
        }

        /** 清除旧版 #app 注入 */
        function clearOldPage() {
            var app = document.getElementById("app");
            if (!app || !_oldMode) return;
            ["background-image", "background-size", "background-position",
                "background-attachment", "background-repeat"]
                .forEach(function (p) { app.style.removeProperty(p); });
            _oldMode = false;
        }

        return {
            start: function (url) {
                _url = url;
                _active = true;
                _oldMode = false;

                // 等待 Vue 渲染窗口（500ms）
                // 若新版页面，main.space-main 应已出现，CSS 规则已生效，无需额外处理
                // 若旧版页面，main.space-main 不会出现，回退到 #app 注入
                clearTimeout(_timer);
                _timer = setTimeout(function () {
                    if (!_active) return;
                    var hasNewPage = !!document.querySelector("main.space-main");
                    if (!hasNewPage) {
                        Logger.warn("SpacePageInjector: 未检测到 main.space-main，回退到旧版 #app 注入");
                        applyOldPage(_url);
                    } else {
                        Logger.info("SpacePageInjector: 检测到新版空间页，CSS 规则已覆盖，无需额外注入");
                    }
                }, 500);
            },

            update: function (url) {
                _url = url;
                if (_oldMode) applyOldPage(url);
                // 新版页面：buildCSS 重新注入 CSS 规则即可（由 BackgroundModule.updateOpacity 调用）
            },

            stop: function () {
                _active = false;
                clearTimeout(_timer);
                clearOldPage();
                // 清理可能残留的旧版固定背景 div（兼容历史版本）
                var old = document.getElementById("skbg-space-bg");
                if (old && old.parentNode) old.parentNode.removeChild(old);
                _url = null;
            },

            isActive: function () { return _active; },
        };
    })();

    // ============================================================
    // BACKGROUND MODULE
    // ============================================================
    var BackgroundModule = (function () {
        var _styleEl = null;
        var _currentUrl = null;

        function preload(url) {
            if (!url || url.indexOf("data:") === 0) return Promise.resolve(url);
            return new Promise(function (resolve, reject) {
                var img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = function () { resolve(url); };
                img.onerror = function () { reject(new Error("preload fail")); };
                img.src = url;
            });
        }

        /**
         * 生成注入 CSS
         *
         * ── 非空间页（首页/视频页/直播页等）──────────────────────────
         *   html { background-image: url(...) }  背景设在根元素，视口全覆盖
         *   body / transparentSelectors → background-color: transparent
         *   这样背景图透过内容容器显示
         *
         * ── B站空间页 space.bilibili.com ─────────────────────────────
         *   background-image 直接设在 main.space-main（CSS 选择器规则）
         *   原因：.header.space-header 是 main.space-main 的【兄弟元素】，
         *   若用 html 背景，会穿透 .space-header 的透明区域，覆盖用户 bilibili 个人 banner。
         *   直接设在 main.space-main 则背景只作用于内容区，兄弟元素完全不受影响。
         *   旧版空间页（无 main.space-main）由 SpacePageInjector 回退处理。
         */
        function buildCSS(url, opacityAlpha) {
            opacityAlpha = (typeof opacityAlpha === "number") ? opacityAlpha : 1.0;

            var lines = [];
            var escaped = url.replace(/'/g, "\\'");
            // opacityAlpha=1 → rgba(255,255,255,0.00) 完全透明，背景完全显示
            // opacityAlpha=0 → rgba(255,255,255,1.00) 完全遮住，看不到背景
            var bgColorValue = "rgba(255,255,255," + (1 - opacityAlpha).toFixed(2) + ")";

            var isSpacePage = (location.host.indexOf("space.bilibili.com") !== -1);

            if (isSpacePage) {
                // ─ 空间页专用：背景仅作用于内容区，不影响 .space-header（个人banner区）──
                lines.push(
                    // 清除 html/body 自身背景，防止透过 .space-header 显示
                    "html { background-image: none !important; }",
                    "body { background-color: transparent !important;",
                    "       background-image: none !important; }",

                    // 背景图直接设在 main.space-main（新版空间页专用容器）
                    // CSS 规则在 Vue 渲染后自动生效，无需 JS 等待
                    "main.space-main {",
                    "  background-image: url('" + escaped + "') !important;",
                    "  background-size: cover !important;",
                    "  background-position: center top !important;",
                    "  background-attachment: fixed !important;",
                    "  background-repeat: no-repeat !important;",
                    "}"
                );
                // 透明度滑块：控制 main.space-main 内部元素的白色遮罩（显现程度）
                if (SITE_CONFIG.transparentSelectors && SITE_CONFIG.transparentSelectors.length) {
                    lines.push(
                        SITE_CONFIG.transparentSelectors.join(", ") + " {",
                        "  background-color: " + bgColorValue + " !important;",
                        "}"
                    );
                }
            } else {
                // ─ 非空间页：html 背景 + 透明链路 ─────────────────────
                lines.push(
                    "html {",
                    "  background-image: url('" + escaped + "') !important;",
                    "  background-repeat: no-repeat !important;",
                    "  background-position: center center !important;",
                    "  background-attachment: fixed !important;",
                    "  background-size: cover !important;",
                    "}",
                    "body {",
                    "  background-color: transparent !important;",
                    "  background-image: none !important;",
                    "}"
                );
                if (SITE_CONFIG.transparentSelectors && SITE_CONFIG.transparentSelectors.length) {
                    lines.push(
                        SITE_CONFIG.transparentSelectors.join(", ") + " {",
                        "  background-color: " + bgColorValue + " !important;",
                        "}"
                    );
                }
            }

            return lines.join("\n");
        }

        function injectCSS(url, opacityAlpha) {
            var css = buildCSS(url, opacityAlpha);
            if (!_styleEl) {
                _styleEl = document.createElement("style");
                _styleEl.id = "skbg-layer-style";
                (document.head || document.documentElement).appendChild(_styleEl);
            }
            _styleEl.textContent = css;
        }

        function removeCSS() {
            if (_styleEl && _styleEl.parentNode) _styleEl.parentNode.removeChild(_styleEl);
            _styleEl = null;
        }

        return {
            apply: async function (url, opacityAlpha) {
                try { await preload(url); } catch (e) { Logger.warn("预加载失败，直接应用:", e.message); }
                _currentUrl = url;
                injectCSS(url, opacityAlpha);
                AlphaGuard.start();
                ChainTransparifier.start();

                // 新版空间页：在 main.space-main 内注入固定背景 div
                // 旧版空间页（无 main.space-main）：依赖 html/body CSS 背景
                if (location.host.indexOf("space.bilibili.com") !== -1) {
                    SpacePageInjector.start(url);
                }

                Logger.info("背景已应用 →", SITE_CONFIG.site, location.pathname);
            },
            updateOpacity: function (opacityAlpha) {
                if (_currentUrl) injectCSS(_currentUrl, opacityAlpha);
                // 透明度调节不影响注入 div 本身（div 始终全尺寸显示）
            },
            clear: function () {
                _currentUrl = null;
                removeCSS();
                AlphaGuard.stop();
                ChainTransparifier.stop();
                SpacePageInjector.stop();
                Logger.info("背景已清除");
            },
            reapply: function (opacityAlpha) {
                if (!_currentUrl) return;
                injectCSS(_currentUrl, opacityAlpha);
                AlphaGuard.rescan();
                ChainTransparifier.rescan();
                // SPA 路由后重新检查是否需要注入（可能从其他页跳转到空间页）
                if (location.host.indexOf("space.bilibili.com") !== -1) {
                    SpacePageInjector.start(_currentUrl);
                } else {
                    SpacePageInjector.stop();
                }
                Logger.info("背景已重新注入（路由变化）");
            }
        };
    })();

    // ============================================================
    // SPA 路由监听
    // ============================================================
    (function watchRouter() {
        function patch(method) {
            var orig = history[method];
            history[method] = function () {
                orig.apply(this, arguments);
                setTimeout(function () { BackgroundModule.reapply(); }, 300);
            };
        }
        try { patch("pushState"); patch("replaceState"); } catch (e) { }
        window.addEventListener("popstate", function () {
            setTimeout(function () { BackgroundModule.reapply(); }, 300);
        });
    })();

    // ============================================================
    // UI MODULE
    // ============================================================
    var UIModule = (function () {

        var CSS = [
            "#skbg-hot{position:fixed;bottom:0;left:0;z-index:2147483646;",
            "width:12px;height:100vh;pointer-events:auto;}",

            "#skbg-trigger{position:fixed;bottom:120px;left:0;z-index:2147483647;",
            "width:42px;height:80px;",
            "background:linear-gradient(160deg,#ff6eb4 0%,#ff9de2 100%);",
            "border-radius:0 20px 20px 0;",
            "display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4px;",
            "cursor:pointer;user-select:none;",
            "box-shadow:2px 2px 10px rgba(255,110,180,.35);",
            "transform:translateX(calc(-100% + 4px));",
            "transition:transform .28s cubic-bezier(.4,0,.2,1),box-shadow .22s,opacity .22s;",
            "opacity:.75;}",

            "#skbg-hot:hover ~ #skbg-trigger,",
            "#skbg-trigger:hover,#skbg-trigger:focus-visible,#skbg-trigger.peeked{",
            "transform:translateX(0);opacity:1;box-shadow:3px 3px 16px rgba(255,110,180,.55);}",

            "#skbg-trigger.panel-open{transform:translateX(-100%) !important;",
            "opacity:0 !important;pointer-events:none !important;}",

            "#skbg-trigger-icon{font-size:20px;pointer-events:none;line-height:1;}",
            "#skbg-trigger-label{font-size:9px;font-weight:700;color:rgba(255,255,255,.9);",
            "pointer-events:none;letter-spacing:.5px;writing-mode:vertical-rl;",
            "text-orientation:mixed;line-height:1;}",

            "#skbg-panel{position:fixed;bottom:0;left:0;z-index:2147483646;",
            "width:390px;height:92vh;max-height:640px;min-height:480px;",
            "background:rgba(255,255,255,.92);-webkit-backdrop-filter:blur(20px) saturate(180%);",
            "backdrop-filter:blur(20px) saturate(180%);border-radius:0 28px 0 0;",
            "box-shadow:4px 0 36px rgba(0,0,0,.16);display:flex;flex-direction:column;",
            "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans SC',sans-serif;",
            "transform:translateX(-100%);transition:transform .32s cubic-bezier(.4,0,.2,1);",
            "overflow:hidden;}",
            "#skbg-panel.open{transform:translateX(0);}",

            "#skbg-header{padding:18px 18px 12px;",
            "background:linear-gradient(135deg,#ff6eb4,#ffb3dd);",
            "display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}",
            "#skbg-title{color:#fff;font-size:16px;font-weight:700;letter-spacing:.5px;",
            "text-shadow:0 1px 4px rgba(0,0,0,.15);display:flex;align-items:center;gap:6px;}",
            "#skbg-close{width:28px;height:28px;border-radius:50%;",
            "background:rgba(255,255,255,.3);border:none;color:#fff;font-size:15px;",
            "cursor:pointer;display:flex;align-items:center;justify-content:center;",
            "transition:background .18s;line-height:1;padding:0;}",
            "#skbg-close:hover{background:rgba(255,255,255,.52);}",

            "#skbg-author-bar{display:flex;align-items:center;gap:10px;padding:8px 18px;",
            "background:rgba(255,110,180,.07);",
            "border-bottom:1px solid rgba(255,110,180,.12);flex-shrink:0;}",
            "#skbg-author-bar a{display:inline-flex;align-items:center;gap:5px;",
            "color:#cc4488;font-size:12px;text-decoration:none;font-weight:600;",
            "padding:3px 8px;border-radius:20px;background:rgba(255,110,180,.10);",
            "transition:background .18s,color .18s;}",
            "#skbg-author-bar a:hover{background:rgba(255,110,180,.22);color:#ff6eb4;}",
            "#skbg-author-bar img.site-icon{width:14px;height:14px;border-radius:2px;vertical-align:middle;}",

            "#skbg-tabs{display:flex;padding:0 14px;background:#fff9fd;",
            "border-bottom:1px solid #ffd6ee;flex-shrink:0;overflow-x:auto;}",
            "#skbg-tabs::-webkit-scrollbar{display:none;}",
            ".skbg-tab{padding:9px 13px;font-size:13px;font-weight:600;color:#bbb;",
            "cursor:pointer;border-bottom:2.5px solid transparent;",
            "transition:color .18s,border-color .18s;user-select:none;white-space:nowrap;}",
            ".skbg-tab.active{color:#ff6eb4;border-bottom-color:#ff6eb4;}",

            "#skbg-content{flex:1;min-height:0;overflow-y:auto;padding:14px;",
            "scrollbar-width:thin;scrollbar-color:#ffb3dd transparent;}",
            "#skbg-content::-webkit-scrollbar{width:4px;}",
            "#skbg-content::-webkit-scrollbar-thumb{background:#ffb3dd;border-radius:4px;}",
            ".skbg-pane{display:none;}.skbg-pane.active{display:block;}",

            "#skbg-gallery-grid{display:grid;grid-template-columns:repeat(2,1fr);",
            "gap:10px;margin-bottom:10px;}",
            ".skbg-gi{position:relative;border-radius:12px;overflow:hidden;cursor:pointer;",
            "aspect-ratio:4/3;background:#f5e6f0;transition:transform .17s,box-shadow .17s;}",
            ".skbg-gi:hover{transform:scale(1.04);box-shadow:0 5px 20px rgba(255,110,180,.32);}",
            ".skbg-gi img{width:100%;height:100%;object-fit:cover;display:block;}",
            ".skbg-gi-ov{position:absolute;inset:0;",
            "background:linear-gradient(to top,rgba(255,110,180,.5) 0,transparent 60%);",
            "opacity:0;transition:opacity .18s;display:flex;align-items:flex-end;padding:7px;}",
            ".skbg-gi:hover .skbg-gi-ov{opacity:1;}",
            ".skbg-gi-lbl{color:#fff;font-size:11px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,.4);}",
            ".skbg-gi.loading{",
            "background:linear-gradient(90deg,#f5e6f0 25%,#ffd6ee 50%,#f5e6f0 75%);",
            "background-size:200% 100%;animation:skbg-shimmer 1.1s infinite;}",
            "@keyframes skbg-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}",
            "#skbg-gallery-refresh{width:100%;padding:8px;background:none;",
            "border:1.5px dashed #ffb3dd;border-radius:10px;color:#ff6eb4;",
            "font-size:13px;cursor:pointer;transition:background .18s;margin-top:4px;}",
            "#skbg-gallery-refresh:hover{background:#fff0f8;}",

            ".skbg-lbl{font-size:11px;font-weight:700;color:#ff6eb4;letter-spacing:.4px;",
            "text-transform:uppercase;margin:14px 0 7px;}",
            ".skbg-row{display:flex;gap:8px;margin-bottom:9px;}",
            ".skbg-input{flex:1;padding:9px 12px;border:1.5px solid #ffd6ee;border-radius:10px;",
            "font-size:13px;outline:none;transition:border-color .18s;background:#fff;color:#333;",
            "font-family:inherit;min-width:0;}",
            ".skbg-input:focus{border-color:#ff6eb4;}",
            ".skbg-btn{padding:9px 15px;background:linear-gradient(135deg,#ff6eb4,#ff9de2);",
            "color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;",
            "cursor:pointer;white-space:nowrap;transition:opacity .18s,transform .14s;",
            "font-family:inherit;display:inline-flex;align-items:center;justify-content:center;}",
            ".skbg-btn:hover{opacity:.87;transform:translateY(-1px);}",
            ".skbg-btn:active{transform:translateY(0);}",
            ".skbg-btn.secondary{background:none;border:1.5px solid #ffd6ee;color:#ff6eb4;}",
            ".skbg-btn.secondary:hover{background:#fff0f8;}",
            ".skbg-btn.danger{background:linear-gradient(135deg,#ff6b6b,#ff9999);}",
            ".skbg-btn:disabled{opacity:.5;cursor:not-allowed;transform:none;}",

            "#skbg-drop{border:2px dashed #ffd6ee;border-radius:14px;padding:26px 14px;",
            "text-align:center;cursor:pointer;transition:border-color .18s,background .18s;",
            "position:relative;color:#bbb;font-size:13px;}",
            "#skbg-drop:hover,#skbg-drop.dragover{border-color:#ff6eb4;background:#fff5fb;color:#ff6eb4;}",
            "#skbg-drop .di{font-size:30px;display:block;margin-bottom:7px;}",
            "#skbg-file-inp{display:none;}",
            "#skbg-file-prev{margin-top:10px;display:none;}",
            "#skbg-file-prev img{width:100%;border-radius:10px;max-height:130px;object-fit:cover;}",

            "#skbg-opacity-row{display:flex;align-items:center;gap:10px;margin:10px 0 6px;}",
            "#skbg-opacity-slider{flex:1;accent-color:#ff6eb4;cursor:pointer;}",
            "#skbg-opacity-val{font-size:12px;color:#ff6eb4;font-weight:700;min-width:32px;text-align:right;}",

            "#skbg-cur-prev{width:100%;height:96px;border-radius:12px;",
            "background:#f5e6f0 center/cover no-repeat;margin-bottom:12px;",
            "border:2px solid #ffd6ee;display:flex;align-items:center;justify-content:center;",
            "color:#ccc;font-size:13px;}",

            ".skbg-about{font-size:12px;color:#aaa;line-height:2;padding:10px 12px;",
            "background:#fff5fb;border-radius:10px;margin-top:8px;}",
            ".skbg-about a{color:#ff6eb4;text-decoration:none;}",
            ".skbg-about a:hover{text-decoration:underline;}",

            "#skbg-toast{position:fixed;bottom:22px;right:22px;z-index:2147483648;",
            "background:#333;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;",
            "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;",
            "pointer-events:none;opacity:0;transform:translateY(10px);",
            "transition:opacity .22s,transform .22s;max-width:260px;line-height:1.5;}",
            "#skbg-toast.show{opacity:1;transform:translateY(0);}",
            "#skbg-toast.success{background:linear-gradient(135deg,#ff6eb4,#ff9de2);}",
            "#skbg-toast.error{background:linear-gradient(135deg,#ff6b6b,#ff9999);}",
        ].join("");

        var _open = false, _tab = "gallery", _b64 = null;
        var _toastTmr = null, _galleryLoaded = false;
        // 透明度：0=内容完全不透明(背景不可见), 1=内容完全透明(背景完全显示)
        var _opacityAlpha = 1.0;

        function toast(msg, type, duration) {
            type = type || "success"; duration = duration || 2600;
            var el = $id("skbg-toast");
            if (!el) return;
            el.textContent = msg; el.className = "show " + type;
            clearTimeout(_toastTmr);
            _toastTmr = setTimeout(function () { el.className = ""; }, duration);
        }

        function updatePreview(url) {
            var el = $id("skbg-cur-prev");
            if (!el) return;
            el.style.backgroundImage = url ? "url(" + url + ")" : "";
            el.textContent = url ? "" : "暂无背景";
        }

        async function applyAndSave(url) {
            if (!url) return;
            toast("正在应用…", "success", 60000);
            try {
                await BackgroundModule.apply(url, _opacityAlpha);
                await StorageModule.save(url);
                updatePreview(url);
                toast("✓ 背景设置成功");
            } catch (e) {
                Logger.error("应用失败:", e);
                toast("✗ 应用失败，请检查图片地址", "error");
            }
        }

        async function renderGallery(forceRefresh) {
            var grid = $id("skbg-gallery-grid"), btn = $id("skbg-gallery-refresh");
            if (!grid) return;
            if (!forceRefresh && _galleryLoaded) return;

            var sk = ""; for (var s = 0; s < 6; s++) sk += '<div class="skbg-gi loading"></div>';
            grid.innerHTML = sk;

            var list = DEFAULT_GALLERY;
            if (REMOTE_CONFIG.enabled && REMOTE_CONFIG.url) {
                btn && (btn.style.display = "block");
                var remote = await RemoteGalleryProvider.fetchList();
                if (remote && remote.length) {
                    list = remote;
                } else {
                    toast("远程图库加载失败，已使用默认图库", "error", 3000);
                }
            } else {
                btn && (btn.style.display = "none");
            }

            var frag = document.createDocumentFragment();
            list.forEach(function (item) {
                var div = document.createElement("div");
                div.className = "skbg-gi"; div.dataset.url = item.url; div.title = item.title || "";
                div.innerHTML = [
                    '<img src="', escHtml(item.url), '" alt="', escHtml(item.title || "背景图"), '"',
                    ' loading="lazy" decoding="async"',
                    ' onerror="this.parentElement.style.display=\'none\'">',
                    '<div class="skbg-gi-ov"><span class="skbg-gi-lbl">',
                    escHtml(item.title || ""), '</span></div>',
                ].join("");
                frag.appendChild(div);
            });
            grid.innerHTML = ""; grid.appendChild(frag); _galleryLoaded = true;

            grid.onclick = function (e) {
                var item = e.target.closest ? e.target.closest(".skbg-gi")
                    : (function (el) { while (el && !el.classList.contains("skbg-gi")) el = el.parentNode; return el; })(e.target);
                if (!item) return;
                applyAndSave(item.dataset.url);
            };
        }

        function switchTab(name) {
            _tab = name;
            document.querySelectorAll(".skbg-tab").forEach(function (t) {
                t.classList.toggle("active", t.dataset.tab === name);
            });
            document.querySelectorAll(".skbg-pane").forEach(function (p) {
                p.classList.toggle("active", p.id === "skbg-pane-" + name);
            });
        }

        function handleFile(file) {
            if (!file || !file.type.match(/^image\//)) { toast("请选择图片文件", "error"); return; }
            if (file.size > 8 * 1024 * 1024) toast("图片较大，建议压缩后使用", "error", 4000);
            var reader = new FileReader();
            reader.onload = function (e) {
                _b64 = e.target.result;
                var prev = $id("skbg-file-prev");
                var img = prev && prev.querySelector("img");
                if (img) img.src = _b64;
                if (prev) prev.style.display = "block";
                var btn = $id("skbg-local-apply");
                if (btn) btn.style.display = "block";
            };
            reader.onerror = function () { toast("文件读取失败", "error"); };
            reader.readAsDataURL(file);
        }

        function buildHTML() {
            var w = document.createElement("div");
            w.id = "skbg-root";
            w.innerHTML = [
                '<div id="skbg-hot" aria-hidden="true"></div>',
                '<div id="skbg-trigger" role="button" tabindex="0"',
                '  aria-label="打开背景面板" title="更换背景">',
                '  <span id="skbg-trigger-icon">🌸</span>',
                '  <span id="skbg-trigger-label">背景</span>',
                '</div>',

                '<div id="skbg-panel" role="dialog" aria-label="背景更换面板">',

                '<div id="skbg-header">',
                '  <span id="skbg-title">🌸 背景更换</span>',
                '  <button id="skbg-close" aria-label="关闭">✕</button>',
                '</div>',

                '<div id="skbg-author-bar">',
                '  <a href="', AUTHOR.bilibili, '" target="_blank" rel="noopener">',
                '    <img class="site-icon"',
                '         src="https://www.bilibili.com/favicon.ico" alt="B站"',
                '         onerror="this.style.display=\'none\'">',
                '    <span>@SakuraMikku</span>',
                '  </a>',
                '  <a href="', AUTHOR.github, '" target="_blank" rel="noopener">',
                '    <img class="site-icon"',
                '         src="https://github.com/favicon.ico" alt="GitHub"',
                '         onerror="this.style.display=\'none\'">',
                '    <span>GitHub</span>',
                '  </a>',
                '</div>',

                '<div id="skbg-tabs" role="tablist">',
                '  <div class="skbg-tab active" role="tab" data-tab="gallery">图库</div>',
                '  <div class="skbg-tab" role="tab" data-tab="url">链接</div>',
                '  <div class="skbg-tab" role="tab" data-tab="local">本地</div>',
                '  <div class="skbg-tab" role="tab" data-tab="settings">设置</div>',
                '</div>',

                '<div id="skbg-content">',

                '<div id="skbg-pane-gallery" class="skbg-pane active" role="tabpanel">',
                '  <div id="skbg-gallery-grid"></div>',
                '  <button id="skbg-gallery-refresh" style="display:none">↻ 刷新远程图库</button>',
                '</div>',

                '<div id="skbg-pane-url" class="skbg-pane" role="tabpanel">',
                '  <div class="skbg-lbl">输入图片地址</div>',
                '  <div class="skbg-row">',
                '    <input id="skbg-url-inp" class="skbg-input" type="url"',
                '           placeholder="https://example.com/bg.jpg" autocomplete="off">',
                '  </div>',
                '  <button id="skbg-url-apply" class="skbg-btn" style="width:100%">应用背景</button>',
                '</div>',

                '<div id="skbg-pane-local" class="skbg-pane" role="tabpanel">',
                '  <div class="skbg-lbl">拖拽或选择图片</div>',
                '  <div id="skbg-drop">',
                '    <span class="di">🖼️</span>点击或拖拽图片至此',
                '    <input id="skbg-file-inp" type="file" accept="image/*">',
                '  </div>',
                '  <div id="skbg-file-prev"><img src="" alt="预览"></div>',
                '  <button id="skbg-local-apply" class="skbg-btn"',
                '          style="width:100%;margin-top:10px;display:none">应用该图片</button>',
                '</div>',

                '<div id="skbg-pane-settings" class="skbg-pane" role="tabpanel">',
                '  <div class="skbg-lbl">当前背景预览</div>',
                '  <div id="skbg-cur-prev">暂无背景</div>',
                '  <div class="skbg-lbl">背景显现程度</div>',
                '  <div id="skbg-opacity-row">',
                '    <input id="skbg-opacity-slider" type="range" min="0" max="100" value="100">',
                '    <span id="skbg-opacity-val">100%</span>',
                '  </div>',
                '  <button id="skbg-del-btn" class="skbg-btn danger"',
                '          style="width:100%">清除背景存储</button>',
                '  <div class="skbg-lbl" style="margin-top:14px">关于</div>',
                '  <div class="skbg-about">',
                '    <strong>SakuraBG v3.0.4</strong>',
                '    &nbsp;·&nbsp; 作者 <a href="', AUTHOR.bilibili, '" target="_blank">SakuraMikku</a><br>',
                '    <a href="', AUTHOR.github, '" target="_blank">GitHub</a>',
                '    &nbsp;·&nbsp; QQ群：', AUTHOR.qqGroup, '<br>',
                '    当前页面：', escHtml(location.host + location.pathname),
                '  </div>',
                '  <button id="skbg-help-btn" class="skbg-btn secondary"',
                '          style="width:100%;margin-top:10px">查看使用说明</button>',
                '</div>',

                '</div>',
                '</div>',

                '<div id="skbg-toast" role="alert" aria-live="polite"></div>',
            ].join("");
            document.body.appendChild(w);
        }

        function bindEvents() {
            var trigger = $id("skbg-trigger");
            var panel = $id("skbg-panel");
            var hot = $id("skbg-hot");

            function setPanelOpen(open) {
                _open = open;
                panel.classList.toggle("open", open);
                trigger.classList.toggle("panel-open", open);
                if (hot) hot.style.pointerEvents = open ? "none" : "auto";
            }
            function togglePanel() {
                setPanelOpen(!_open);
                if (_open && !_galleryLoaded) renderGallery(false);
            }
            trigger.addEventListener("click", togglePanel);
            trigger.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); togglePanel(); }
            });
            $id("skbg-close").addEventListener("click", function () { setPanelOpen(false); });

            $id("skbg-tabs").addEventListener("click", function (e) {
                var t = e.target.closest ? e.target.closest(".skbg-tab")
                    : (function (el) { while (el && !el.classList.contains("skbg-tab")) el = el.parentNode; return el; })(e.target);
                if (t && t.dataset.tab) switchTab(t.dataset.tab);
            });

            $id("skbg-url-apply").addEventListener("click", function () {
                var url = ($id("skbg-url-inp").value || "").trim();
                if (!url) { toast("请输入图片地址", "error"); return; }
                applyAndSave(url);
            });
            $id("skbg-url-inp").addEventListener("keydown", function (e) {
                if (e.key === "Enter") $id("skbg-url-apply").click();
            });

            var drop = $id("skbg-drop");
            drop.addEventListener("click", function () { $id("skbg-file-inp").click(); });
            drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("dragover"); });
            drop.addEventListener("dragleave", function () { drop.classList.remove("dragover"); });
            drop.addEventListener("dragenter", function (e) { e.preventDefault(); });
            drop.addEventListener("drop", function (e) {
                e.preventDefault(); drop.classList.remove("dragover");
                var f = e.dataTransfer && e.dataTransfer.files[0];
                if (f) handleFile(f);
            });
            $id("skbg-file-inp").addEventListener("change", function (e) {
                var f = e.target.files && e.target.files[0];
                if (f) handleFile(f);
            });
            $id("skbg-local-apply").addEventListener("click", function () {
                if (!_b64) { toast("请先选择图片", "error"); return; }
                applyAndSave(_b64);
            });

            $id("skbg-del-btn").addEventListener("click", async function () {
                await StorageModule.remove();
                BackgroundModule.clear();
                updatePreview(null);
                toast("✓ 背景存储已清除");
            });

            $id("skbg-help-btn").addEventListener("click", function () {
                alert(
                    "SakuraBG v3.0.4 使用说明\n\n" +
                    "【图库】点击预设图片直接应用\n" +
                    "【链接】粘贴图片 URL 后点击应用\n" +
                    "【本地】拖拽/点击选择本地图片\n" +
                    "【设置】调节背景显现程度、清除存储\n\n" +
                    "✅ 导航栏、Banner、弹窗均不受影响\n" +
                    "✅ 深色/浅色主题自动兼容\n" +
                    "✅ AlphaGuard 实时守护导航透明问题\n\n" +
                    "问题反馈：QQ群 " + AUTHOR.qqGroup
                );
            });

            $id("skbg-gallery-refresh").addEventListener("click", function () {
                _galleryLoaded = false;
                RemoteGalleryProvider.clearCache();
                renderGallery(true);
            });

            // 背景显现程度调节
            var slider = $id("skbg-opacity-slider");
            var valEl = $id("skbg-opacity-val");
            if (slider) {
                function applyOpacity(sliderVal) {
                    // sliderVal: 0~100，100=背景完全显示，0=背景完全被遮住
                    _opacityAlpha = sliderVal / 100;
                    if (valEl) valEl.textContent = sliderVal + "%";
                    BackgroundModule.updateOpacity(_opacityAlpha);
                    try { localStorage.setItem("SakuraBGv3_opacity", String(sliderVal)); } catch (e) { }
                }
                // 读取已保存值
                try {
                    var saved = localStorage.getItem("SakuraBGv3_opacity");
                    if (saved !== null) {
                        var sv = parseInt(saved, 10);
                        slider.value = sv;
                        applyOpacity(sv);
                    }
                } catch (e) { }
                slider.addEventListener("input", function () {
                    applyOpacity(parseInt(slider.value, 10));
                });
            }
        }

        function injectCSS() {
            if (typeof GM_addStyle !== "undefined") {
                GM_addStyle(CSS);
            } else {
                var s = document.createElement("style");
                s.textContent = CSS;
                (document.head || document.documentElement).appendChild(s);
            }
        }

        return {
            init: function () { injectCSS(); buildHTML(); bindEvents(); },
            toast: toast,
            updatePreview: updatePreview,
            applyAndSave: applyAndSave,
            getOpacity: function () { return _opacityAlpha; },
        };
    })();

    // ============================================================
    // BOOT
    // ============================================================
    (async function boot() {
        function showWelcome() {
            try {
                if (!localStorage.getItem("SakuraBGv3_welcomed")) {
                    localStorage.setItem("SakuraBGv3_welcomed", "1");
                    setTimeout(function () {
                        alert("欢迎使用 SakuraBG v3 🌸\n\n点击左下角的 🌸 按钮打开背景面板。\n此提示不再重复显示。");
                    }, 1000);
                }
            } catch (e) { }
        }

        async function run() {
            try {
                UIModule.init();
                showWelcome();

                var saved = await StorageModule.load();
                var initUrl = saved || null;

                if (!initUrl) {
                    if (REMOTE_CONFIG.enabled && REMOTE_CONFIG.url) {
                        var remote = await RemoteGalleryProvider.fetchList();
                        initUrl = (remote && remote.length) ? remote[0].url : DEFAULT_GALLERY[0].url;
                    } else {
                        initUrl = DEFAULT_GALLERY[0].url;
                    }
                }

                var opacityAlpha = UIModule.getOpacity();
                await BackgroundModule.apply(initUrl, opacityAlpha);
                UIModule.updatePreview(initUrl);

                Logger.info("启动成功 ✓ 站点:", SITE_CONFIG.site,
                    "| transparent:", (SITE_CONFIG.transparentSelectors || []).length,
                    "| guard:", (SITE_CONFIG.guardSelectors || []).length);
            } catch (e) {
                Logger.error("启动失败:", e);
            }
        }

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", run);
        } else {
            setTimeout(run, 60);
        }
    })();

})(typeof unsafeWindow !== "undefined" ? unsafeWindow : window);