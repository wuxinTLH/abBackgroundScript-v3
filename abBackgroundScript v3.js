// ==UserScript==
// @name         AB站网页背景更改 V3
// @namespace    SakuraBackgroundScript
// @description  AB站背景更改油猴脚本第三代，重构架构，优化UI/性能/兼容性，支持远程图库接口。
// @icon         http://github.smiku.site/sakura.png
// @license      MIT
// @version      3.0.0
// @author       SakuraMikku
// @copyright    2023-2099, SakuraMikku
// @bilibili     https://space.bilibili.com/29058270
// @github       https://github.com/wuxinTLH
// @updateURL    https://github.com/wuxinTLH/abBackgroundScript-v3/blob/master/abBackgroundScript%20v3.js
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

    // ============================================================
    // 防重复注入：同一页面只执行一次
    // ============================================================
    if (global.__SAKURA_BG_LOADED__) return;
    global.__SAKURA_BG_LOADED__ = true;

    // ============================================================
    // CONFIG — 远程图库接口配置（预留，填写 url 后自动启用）
    // 接口返回格式：{ "code": 0, "data": { "list": [{ "url": "...", "title": "..." }], "total": 100 } }
    // ============================================================
    var REMOTE_CONFIG = {
        enabled: false,   // 设为 true 启用远程图库
        url: "",      // 远程接口地址
        cacheMinutes: 30,      // 本地缓存时长（分钟）
        retryTimes: 2,       // 请求失败重试次数
        retryDelay: 800,     // 重试基础间隔 ms（指数退避）
        pageSize: 12,      // 每页图片数量
        timeout: 8000,    // 请求超时 ms
    };

    // 本地默认图库 —— 扩展至 6 张
    var DEFAULT_GALLERY = [
        { url: "https://img2.imgtp.com/2024/04/19/36tGMJgW.png", title: "默认 1" },
        { url: "https://img2.imgtp.com/2024/04/19/1lWtTop9.png", title: "默认 2" },
        { url: "https://img2.imgtp.com/2024/04/19/JffVHaEc.png", title: "默认 3" },
        { url: "https://img2.imgtp.com/2024/04/19/BipHyk4y.png", title: "默认 4" },
        { url: "https://img2.imgtp.com/2024/04/19/sakura5.png", title: "默认 5" },
        { url: "https://img2.imgtp.com/2024/04/19/sakura6.png", title: "默认 6" },
    ];

    // 作者信息
    var AUTHOR = {
        name: "SakuraMikku",
        bilibili: "https://space.bilibili.com/29058270",
        github: "https://github.com/wuxinTLH",
        qqGroup: "793513923",
    };

    // ============================================================
    // 工具函数
    // ============================================================
    /**
     * 安全的 setTimeout 包装，返回 Promise
     * @param {number} ms
     */
    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    /**
     * 带超时的 fetch
     * @param {string} url
     * @param {object} options
     * @param {number} timeout
     */
    function fetchWithTimeout(url, options, timeout) {
        // 兼容不支持 AbortController 的环境
        if (typeof AbortController === "undefined") {
            return fetch(url, options);
        }
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, timeout);
        return fetch(url, Object.assign({}, options, { signal: controller.signal }))
            .finally(function () { clearTimeout(timer); });
    }

    /**
     * 将 DOM 元素 id 查询封装，避免重复书写 document.getElementById
     * @param {string} id
     */
    function $id(id) { return document.getElementById(id); }

    /**
     * 对字符串做 HTML 转义，防止 XSS
     * @param {string} str
     */
    function escHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // ============================================================
    // LOGGER
    // ============================================================
    var Logger = (function () {
        var PREFIX = "[SakuraBG v3]";
        function ts() {
            var d = new Date();
            return d.toLocaleDateString() + " " + d.toLocaleTimeString();
        }
        return {
            info: function () { console.info.apply(console, [PREFIX, ts()].concat(Array.prototype.slice.call(arguments))); },
            warn: function () { console.warn.apply(console, [PREFIX, ts()].concat(Array.prototype.slice.call(arguments))); },
            error: function () { console.error.apply(console, [PREFIX, ts()].concat(Array.prototype.slice.call(arguments))); },
        };
    })();

    // ============================================================
    // REMOTE GALLERY PROVIDER（预留向外请求接口）
    // ============================================================
    var RemoteGalleryProvider = (function () {
        var _cache = null;
        var _cacheTime = 0;

        return {
            /**
             * 获取远程图库列表，内置缓存 + 指数退避重试
             * @param {number} page
             * @returns {Promise<Array|null>}
             */
            fetchList: async function (page) {
                page = page || 1;
                if (!REMOTE_CONFIG.enabled || !REMOTE_CONFIG.url) return null;

                var now = Date.now();
                if (_cache && (now - _cacheTime) < REMOTE_CONFIG.cacheMinutes * 60000) {
                    Logger.info("远程图库命中缓存，共", _cache.length, "张");
                    return _cache;
                }

                var attempt = 0;
                while (attempt <= REMOTE_CONFIG.retryTimes) {
                    try {
                        var res = await fetchWithTimeout(
                            REMOTE_CONFIG.url + "?page=" + page + "&pageSize=" + REMOTE_CONFIG.pageSize,
                            { method: "GET", headers: { "Accept": "application/json" } },
                            REMOTE_CONFIG.timeout
                        );
                        if (!res.ok) throw new Error("HTTP " + res.status);
                        var json = await res.json();
                        if (json.code === 0 && Array.isArray(json.data && json.data.list)) {
                            _cache = json.data.list;
                            _cacheTime = now;
                            Logger.info("远程图库加载成功，共", _cache.length, "张");
                            return _cache;
                        }
                        throw new Error("接口数据格式错误");
                    } catch (err) {
                        attempt++;
                        Logger.warn("远程图库请求失败（第" + attempt + "次）:", err.message || err);
                        if (attempt > REMOTE_CONFIG.retryTimes) return null;
                        // 指数退避
                        await sleep(REMOTE_CONFIG.retryDelay * Math.pow(2, attempt - 1));
                    }
                }
                return null;
            },

            clearCache: function () {
                _cache = null;
                _cacheTime = 0;
            }
        };
    })();

    // ============================================================
    // STORAGE MODULE
    // 降级链：IndexedDB → localStorage → sessionStorage → 内存
    // ============================================================
    var StorageModule = (function () {
        var DB_NAME = "SakuraBGv3";
        var DB_STORE = "bgData";
        var DB_VER = 1;
        var LS_KEY = "SakuraBGv3_url";
        var CHUNK = 4 * 1024 * 1024; // 4MB 分片（留余量）

        var _memFallback = null;
        var _dbPromise = null; // 单例 DB 连接，避免重复 open

        // ---- IndexedDB ----
        function getDB() {
            if (_dbPromise) return _dbPromise;
            _dbPromise = new Promise(function (resolve, reject) {
                var idb = global.indexedDB || global.mozIndexedDB || global.webkitIndexedDB || global.msIndexedDB;
                if (!idb) { _dbPromise = null; return reject(new Error("不支持 IndexedDB")); }
                var req = idb.open(DB_NAME, DB_VER);
                req.onerror = function () { _dbPromise = null; reject(req.error); };
                req.onblocked = function () { _dbPromise = null; reject(new Error("IndexedDB 被阻塞")); };
                req.onupgradeneeded = function (e) {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains(DB_STORE)) {
                        db.createObjectStore(DB_STORE, { keyPath: "id" });
                    }
                };
                req.onsuccess = function (e) { resolve(e.target.result); };
            });
            return _dbPromise;
        }

        async function idbSet(url) {
            var db = await getDB();
            var chunks = [];
            for (var i = 0; i < url.length; i += CHUNK) chunks.push(url.slice(i, i + CHUNK));
            return new Promise(function (resolve, reject) {
                var tx = db.transaction([DB_STORE], "readwrite");
                var store = tx.objectStore(DB_STORE);
                store.clear(); // 先清空旧数据
                chunks.forEach(function (c, idx) { store.add({ id: idx, data: c }); });
                tx.oncomplete = resolve;
                tx.onerror = function () { reject(tx.error); };
            });
        }

        async function idbGet() {
            var db = await getDB();
            var result = await new Promise(function (resolve, reject) {
                var tx = db.transaction([DB_STORE], "readonly");
                var req = tx.objectStore(DB_STORE).getAll();
                req.onsuccess = function () { resolve(req.result); };
                req.onerror = function () { reject(req.error); };
            });
            if (!result || !result.length) return null;
            // 按 id 排序再拼接，防止 getAll 顺序不一致
            result.sort(function (a, b) { return a.id - b.id; });
            return result.map(function (r) { return r.data; }).join("");
        }

        async function idbDel() {
            var db = await getDB();
            return new Promise(function (resolve, reject) {
                var tx = db.transaction([DB_STORE], "readwrite");
                tx.objectStore(DB_STORE).clear();
                tx.oncomplete = resolve;
                tx.onerror = function () { reject(tx.error); };
            });
        }

        // ---- localStorage / sessionStorage ----
        function tryStorageSet(storage, url) {
            try { storage.setItem(LS_KEY, url); return true; }
            catch (e) { return false; }
        }
        function tryStorageGet(storage) {
            try { return storage.getItem(LS_KEY); } catch (e) { return null; }
        }
        function tryStorageDel(storage) {
            try { storage.removeItem(LS_KEY); } catch (e) { }
        }

        // ---- 公开 API ----
        return {
            /**
             * 保存背景 URL / base64，按降级链写入
             */
            save: async function (url) {
                // IndexedDB
                try {
                    await idbSet(url);
                    Logger.info("背景已保存至 IndexedDB");
                    return;
                } catch (e) { Logger.warn("IndexedDB 存储失败:", e.message); }

                // localStorage
                if (tryStorageSet(localStorage, url)) {
                    Logger.info("背景已保存至 localStorage");
                    return;
                }

                // sessionStorage（兜底）
                if (tryStorageSet(sessionStorage, url)) {
                    Logger.warn("背景已保存至 sessionStorage（刷新后失效）");
                    return;
                }

                // 内存
                _memFallback = url;
                Logger.warn("背景已保存至内存（刷新后失效）");
            },

            /**
             * 读取背景，按降级链查询
             */
            load: async function () {
                // IndexedDB
                try {
                    var v = await idbGet();
                    if (v) { Logger.info("从 IndexedDB 加载背景"); return v; }
                } catch (e) { Logger.warn("IndexedDB 读取失败:", e.message); }

                // localStorage
                var v2 = tryStorageGet(localStorage);
                if (v2) { Logger.info("从 localStorage 加载背景"); return v2; }

                // sessionStorage
                var v3 = tryStorageGet(sessionStorage);
                if (v3) { Logger.info("从 sessionStorage 加载背景"); return v3; }

                // 内存
                if (_memFallback) { Logger.info("从内存加载背景"); return _memFallback; }

                return null;
            },

            /**
             * 清除所有存储层
             */
            remove: async function () {
                try { await idbDel(); } catch (e) { Logger.warn("IndexedDB 删除失败:", e.message); }
                tryStorageDel(localStorage);
                tryStorageDel(sessionStorage);
                _memFallback = null;
                Logger.info("背景存储已全部清除");
            }
        };
    })();

    // ============================================================
    // BACKGROUND MODULE
    // ============================================================
    var BackgroundModule = (function () {
        var isAB = location.host.indexOf("bilibili.com") !== -1 ? "bili" : "acfun";

        // 按优先级排列的根节点选择器
        var BILI_SELECTORS = ["#app", "#i_cecream", ".p-relative main", "#main", "body"];
        var ACFUN_SELECTORS = [".home-main-content", ".search__main", "div.list-container",
            "#main", "#app .layout", "#ac-space", "body"];

        /**
         * 选取最合适的背景容器
         */
        function findRoot() {
            var list = isAB === "bili" ? BILI_SELECTORS : ACFUN_SELECTORS;
            for (var i = 0; i < list.length; i++) {
                var el = document.querySelector(list[i]);
                if (el) return el;
            }
            return document.body;
        }

        /**
         * 图片预加载（base64 直接 resolve）
         */
        function preload(url) {
            if (!url || url.indexOf("data:") === 0) return Promise.resolve(url);
            return new Promise(function (resolve, reject) {
                var img = new Image();
                // 避免 CORS 报错影响判断
                img.crossOrigin = "anonymous";
                img.onload = function () { resolve(url); };
                img.onerror = function () { reject(new Error("预加载失败: " + url)); };
                img.src = url;
            });
        }

        var BG_STYLE = {
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center center",
            backgroundAttachment: "fixed",
            backgroundSize: "cover",
        };

        /**
         * 将背景样式应用到元素
         */
        function applyStyle(el, url) {
            Object.assign(el.style, BG_STYLE, { backgroundImage: "url(" + url + ")" });
            // 旧版 WebKit 兼容
            el.style.webkitBackgroundSize = "cover";
        }

        return {
            getSite: function () { return isAB; },

            /**
             * 应用背景，预加载完成后切换以避免闪烁
             */
            apply: async function (url) {
                try { await preload(url); }
                catch (e) { Logger.warn("预加载失败，直接应用:", e.message); }

                var root = findRoot();
                applyStyle(root, url);

                // body 兜底（部分页面容器不满屏）
                if (root !== document.body) {
                    document.body.style.backgroundImage = "url(" + url + ")";
                    document.body.style.backgroundSize = "cover";
                    document.body.style.backgroundAttachment = "fixed";
                }

                Logger.info("背景已应用 →", root.tagName + (root.id ? "#" + root.id : ""));
            },

            /**
             * 清除所有背景样式
             */
            clear: function () {
                var selectors = BILI_SELECTORS.concat(ACFUN_SELECTORS);
                selectors.forEach(function (sel) {
                    var el = document.querySelector(sel);
                    if (el) el.style.backgroundImage = "";
                });
                document.body.style.backgroundImage = "";
            }
        };
    })();

    // ============================================================
    // UI MODULE
    // ============================================================
    var UIModule = (function () {

        // ---- CSS ----
        var CSS = [
            // 主触发按钮
            "#skbg-trigger{position:fixed;bottom:32px;left:0;z-index:2147483647;",
            "width:44px;height:86px;background:linear-gradient(180deg,#ff6eb4,#ff9de2);",
            "border-radius:0 22px 22px 0;display:flex;align-items:center;justify-content:center;",
            "cursor:pointer;box-shadow:3px 3px 14px rgba(255,110,180,.45);",
            "transition:width .22s cubic-bezier(.4,0,.2,1),box-shadow .2s;overflow:hidden;user-select:none;}",
            "#skbg-trigger:hover{width:56px;box-shadow:4px 4px 20px rgba(255,110,180,.65);}",
            "#skbg-trigger-icon{font-size:24px;pointer-events:none;}",

            // 主面板
            "#skbg-panel{position:fixed;bottom:0;left:0;z-index:2147483646;width:390px;max-height:92vh;",
            "background:rgba(255,255,255,.92);-webkit-backdrop-filter:blur(20px) saturate(180%);",
            "backdrop-filter:blur(20px) saturate(180%);border-radius:0 28px 0 0;",
            "box-shadow:4px 0 36px rgba(0,0,0,.16);display:flex;flex-direction:column;",
            "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans SC',sans-serif;",
            "transform:translateX(-100%);transition:transform .32s cubic-bezier(.4,0,.2,1);overflow:hidden;}",
            "#skbg-panel.open{transform:translateX(0);}",

            // 头部
            "#skbg-header{padding:18px 18px 12px;background:linear-gradient(135deg,#ff6eb4,#ffb3dd);",
            "display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}",
            "#skbg-title{color:#fff;font-size:16px;font-weight:700;letter-spacing:.5px;",
            "text-shadow:0 1px 4px rgba(0,0,0,.15);display:flex;align-items:center;gap:6px;}",
            "#skbg-close{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.3);",
            "border:none;color:#fff;font-size:15px;cursor:pointer;display:flex;",
            "align-items:center;justify-content:center;transition:background .18s;line-height:1;padding:0;}",
            "#skbg-close:hover{background:rgba(255,255,255,.52);}",

            // 作者栏
            "#skbg-author-bar{display:flex;align-items:center;gap:10px;padding:8px 18px;",
            "background:rgba(255,110,180,.07);border-bottom:1px solid rgba(255,110,180,.12);",
            "flex-shrink:0;}",
            "#skbg-author-bar a{display:inline-flex;align-items:center;gap:5px;",
            "color:#cc4488;font-size:12px;text-decoration:none;font-weight:600;",
            "padding:3px 8px;border-radius:20px;background:rgba(255,110,180,.10);",
            "transition:background .18s,color .18s;}",
            "#skbg-author-bar a:hover{background:rgba(255,110,180,.22);color:#ff6eb4;}",
            "#skbg-author-bar img.site-icon{width:14px;height:14px;border-radius:2px;vertical-align:middle;}",

            // 标签页
            "#skbg-tabs{display:flex;padding:0 14px;background:#fff9fd;",
            "border-bottom:1px solid #ffd6ee;flex-shrink:0;overflow-x:auto;}",
            "#skbg-tabs::-webkit-scrollbar{display:none;}",
            ".skbg-tab{padding:9px 13px;font-size:13px;font-weight:600;color:#bbb;cursor:pointer;",
            "border-bottom:2.5px solid transparent;transition:color .18s,border-color .18s;",
            "user-select:none;white-space:nowrap;}",
            ".skbg-tab.active{color:#ff6eb4;border-bottom-color:#ff6eb4;}",

            // 内容滚动区
            "#skbg-content{flex:1;overflow-y:auto;padding:14px;",
            "scrollbar-width:thin;scrollbar-color:#ffb3dd transparent;}",
            "#skbg-content::-webkit-scrollbar{width:4px;}",
            "#skbg-content::-webkit-scrollbar-thumb{background:#ffb3dd;border-radius:4px;}",
            ".skbg-pane{display:none;}.skbg-pane.active{display:block;}",

            // 图库网格
            "#skbg-gallery-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:10px;}",
            ".skbg-gi{position:relative;border-radius:12px;overflow:hidden;cursor:pointer;",
            "aspect-ratio:4/3;background:#f5e6f0;transition:transform .17s,box-shadow .17s;}",
            ".skbg-gi:hover{transform:scale(1.04);box-shadow:0 5px 20px rgba(255,110,180,.32);}",
            ".skbg-gi img{width:100%;height:100%;object-fit:cover;display:block;}",
            ".skbg-gi-ov{position:absolute;inset:0;background:linear-gradient(to top,rgba(255,110,180,.5) 0,transparent 60%);",
            "opacity:0;transition:opacity .18s;display:flex;align-items:flex-end;padding:7px;}",
            ".skbg-gi:hover .skbg-gi-ov{opacity:1;}",
            ".skbg-gi-lbl{color:#fff;font-size:11px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,.4);}",
            ".skbg-gi.loading{background:linear-gradient(90deg,#f5e6f0 25%,#ffd6ee 50%,#f5e6f0 75%);",
            "background-size:200% 100%;animation:skbg-shimmer 1.1s infinite;}",
            "@keyframes skbg-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}",
            "#skbg-gallery-refresh{width:100%;padding:8px;background:none;",
            "border:1.5px dashed #ffb3dd;border-radius:10px;color:#ff6eb4;",
            "font-size:13px;cursor:pointer;transition:background .18s;margin-top:4px;}",
            "#skbg-gallery-refresh:hover{background:#fff0f8;}",

            // 表单
            ".skbg-lbl{font-size:11px;font-weight:700;color:#ff6eb4;letter-spacing:.4px;",
            "text-transform:uppercase;margin:14px 0 7px;}",
            ".skbg-row{display:flex;gap:8px;margin-bottom:9px;}",
            ".skbg-input{flex:1;padding:9px 12px;border:1.5px solid #ffd6ee;border-radius:10px;",
            "font-size:13px;outline:none;transition:border-color .18s;background:#fff;",
            "color:#333;font-family:inherit;min-width:0;}",
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

            // 文件拖拽区
            "#skbg-drop{border:2px dashed #ffd6ee;border-radius:14px;padding:26px 14px;",
            "text-align:center;cursor:pointer;transition:border-color .18s,background .18s;",
            "position:relative;color:#bbb;font-size:13px;}",
            "#skbg-drop:hover,#skbg-drop.dragover{border-color:#ff6eb4;background:#fff5fb;color:#ff6eb4;}",
            "#skbg-drop .di{font-size:30px;display:block;margin-bottom:7px;}",
            "#skbg-file-inp{display:none;}",
            "#skbg-file-prev{margin-top:10px;display:none;}",
            "#skbg-file-prev img{width:100%;border-radius:10px;max-height:130px;object-fit:cover;}",

            // 当前背景预览（设置页）
            "#skbg-cur-prev{width:100%;height:96px;border-radius:12px;",
            "background:#f5e6f0 center/cover no-repeat;margin-bottom:12px;",
            "border:2px solid #ffd6ee;display:flex;align-items:center;justify-content:center;",
            "color:#ccc;font-size:13px;}",

            // 设置页关于区块
            ".skbg-about{font-size:12px;color:#aaa;line-height:2;padding:10px 12px;",
            "background:#fff5fb;border-radius:10px;margin-top:8px;}",
            ".skbg-about a{color:#ff6eb4;text-decoration:none;}",
            ".skbg-about a:hover{text-decoration:underline;}",

            // Toast
            "#skbg-toast{position:fixed;bottom:22px;right:22px;z-index:2147483648;",
            "background:#333;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;",
            "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;",
            "pointer-events:none;opacity:0;transform:translateY(10px);",
            "transition:opacity .22s,transform .22s;max-width:260px;line-height:1.5;}",
            "#skbg-toast.show{opacity:1;transform:translateY(0);}",
            "#skbg-toast.success{background:linear-gradient(135deg,#ff6eb4,#ff9de2);}",
            "#skbg-toast.error{background:linear-gradient(135deg,#ff6b6b,#ff9999);}",
        ].join("");

        // ---- 状态 ----
        var _open = false;
        var _tab = "gallery";
        var _b64 = null;   // 本地文件 base64
        var _toastTmr = null;
        var _galleryLoaded = false;

        // ---- Toast ----
        function toast(msg, type, duration) {
            type = type || "success";
            duration = duration || 2600;
            var el = $id("skbg-toast");
            if (!el) return;
            el.textContent = msg;
            el.className = "show " + type;
            clearTimeout(_toastTmr);
            _toastTmr = setTimeout(function () { el.className = ""; }, duration);
        }

        // ---- 更新设置页预览 ----
        function updatePreview(url) {
            var el = $id("skbg-cur-prev");
            if (!el) return;
            el.style.backgroundImage = url ? "url(" + url + ")" : "";
            el.textContent = url ? "" : "暂无背景";
        }

        // ---- 应用并保存 ----
        async function applyAndSave(url) {
            if (!url) return;
            toast("正在应用…", "success", 60000);
            try {
                await BackgroundModule.apply(url);
                await StorageModule.save(url);
                updatePreview(url);
                toast("✓ 背景设置成功");
            } catch (e) {
                Logger.error("应用背景失败:", e);
                toast("✗ 应用失败，请检查图片地址", "error");
            }
        }

        // ---- 图库渲染 ----
        async function renderGallery(forceRefresh) {
            var grid = $id("skbg-gallery-grid");
            var refreshBtn = $id("skbg-gallery-refresh");
            if (!grid) return;

            if (!forceRefresh && _galleryLoaded) return; // 避免重复渲染

            // 骨架屏
            var skeletons = "";
            for (var s = 0; s < 6; s++) skeletons += '<div class="skbg-gi loading"></div>';
            grid.innerHTML = skeletons;

            var list = DEFAULT_GALLERY;

            if (REMOTE_CONFIG.enabled && REMOTE_CONFIG.url) {
                refreshBtn && (refreshBtn.style.display = "block");
                var remote = await RemoteGalleryProvider.fetchList(1);
                if (remote && remote.length) list = remote;
            } else {
                refreshBtn && (refreshBtn.style.display = "none");
            }

            // 用 DocumentFragment 批量插入，减少重排
            var frag = document.createDocumentFragment();
            list.forEach(function (item) {
                var div = document.createElement("div");
                div.className = "skbg-gi";
                div.dataset.url = item.url;
                div.title = item.title || "";
                div.innerHTML = [
                    '<img src="', escHtml(item.url), '" alt="', escHtml(item.title || "背景图"), '"',
                    ' loading="lazy" decoding="async"',
                    ' onerror="this.parentElement.style.display=\'none\'">',
                    '<div class="skbg-gi-ov"><span class="skbg-gi-lbl">', escHtml(item.title || ""), '</span></div>'
                ].join("");
                frag.appendChild(div);
            });
            grid.innerHTML = "";
            grid.appendChild(frag);

            _galleryLoaded = true;

            // 事件委托
            grid.onclick = function (e) {
                var item = e.target.closest ? e.target.closest(".skbg-gi")
                    : (function (el) { while (el && !el.classList.contains("skbg-gi")) el = el.parentNode; return el; })(e.target);
                if (!item) return;
                applyAndSave(item.dataset.url);
            };
        }

        // ---- Tab 切换 ----
        function switchTab(name) {
            _tab = name;
            var tabs = document.querySelectorAll(".skbg-tab");
            var panes = document.querySelectorAll(".skbg-pane");
            for (var i = 0; i < tabs.length; i++)
                tabs[i].classList.toggle("active", tabs[i].dataset.tab === name);
            for (var j = 0; j < panes.length; j++)
                panes[j].classList.toggle("active", panes[j].id === "skbg-pane-" + name);
        }

        // ---- 本地文件处理 ----
        function handleFile(file) {
            if (!file || !file.type.match(/^image\//)) {
                toast("请选择图片文件", "error"); return;
            }
            // 大于 8MB 警告
            if (file.size > 8 * 1024 * 1024) {
                toast("图片较大，存储可能失败，建议压缩后使用", "error", 4000);
            }
            var reader = new FileReader();
            reader.onload = function (e) {
                _b64 = e.target.result;
                var prev = $id("skbg-file-prev");
                var prevImg = prev && prev.querySelector("img");
                if (prevImg) prevImg.src = _b64;
                if (prev) prev.style.display = "block";
                var applyBtn = $id("skbg-local-apply");
                if (applyBtn) applyBtn.style.display = "block";
            };
            reader.onerror = function () { toast("文件读取失败", "error"); };
            reader.readAsDataURL(file);
        }

        // ---- 构建 HTML ----
        function buildHTML() {
            var wrapper = document.createElement("div");
            wrapper.id = "skbg-root";
            wrapper.innerHTML = [
                // 触发按钮
                '<div id="skbg-trigger" role="button" tabindex="0" aria-label="打开背景面板" title="更换背景">',
                '  <span id="skbg-trigger-icon">🌸</span>',
                '</div>',

                // 面板
                '<div id="skbg-panel" role="dialog" aria-label="背景更换面板">',

                // 头部
                '<div id="skbg-header">',
                '  <span id="skbg-title">🌸 背景更换</span>',
                '  <button id="skbg-close" aria-label="关闭">✕</button>',
                '</div>',

                // 作者栏：bilibili + github 带 site icon
                '<div id="skbg-author-bar">',
                '  <a href="', AUTHOR.bilibili, '" target="_blank" rel="noopener" title="作者B站主页">',
                '    <img class="site-icon" src="https://www.bilibili.com/favicon.ico" alt="B站" onerror="this.style.display=\'none\'">',
                '    <span>@SakuraMikku</span>',
                '  </a>',
                '  <a href="', AUTHOR.github, '" target="_blank" rel="noopener" title="作者GitHub">',
                '    <img class="site-icon" src="https://github.com/favicon.ico" alt="GitHub" onerror="this.style.display=\'none\'">',
                '    <span>GitHub</span>',
                '  </a>',
                '</div>',

                // Tab 栏
                '<div id="skbg-tabs" role="tablist">',
                '  <div class="skbg-tab active" role="tab" data-tab="gallery">图库</div>',
                '  <div class="skbg-tab" role="tab" data-tab="url">链接</div>',
                '  <div class="skbg-tab" role="tab" data-tab="local">本地</div>',
                '  <div class="skbg-tab" role="tab" data-tab="settings">设置</div>',
                '</div>',

                // 内容区
                '<div id="skbg-content">',

                // 图库
                '<div id="skbg-pane-gallery" class="skbg-pane active" role="tabpanel">',
                '  <div id="skbg-gallery-grid"></div>',
                '  <button id="skbg-gallery-refresh" style="display:none">↻ 刷新远程图库</button>',
                '</div>',

                // URL
                '<div id="skbg-pane-url" class="skbg-pane" role="tabpanel">',
                '  <div class="skbg-lbl">输入图片地址</div>',
                '  <div class="skbg-row">',
                '    <input id="skbg-url-inp" class="skbg-input" type="url" placeholder="https://example.com/bg.jpg" autocomplete="off">',
                '  </div>',
                '  <button id="skbg-url-apply" class="skbg-btn" style="width:100%">应用背景</button>',
                '</div>',

                // 本地
                '<div id="skbg-pane-local" class="skbg-pane" role="tabpanel">',
                '  <div class="skbg-lbl">拖拽或选择图片</div>',
                '  <div id="skbg-drop">',
                '    <span class="di">🖼️</span>点击或拖拽图片至此',
                '    <input id="skbg-file-inp" type="file" accept="image/*">',
                '  </div>',
                '  <div id="skbg-file-prev"><img src="" alt="预览"></div>',
                '  <button id="skbg-local-apply" class="skbg-btn" style="width:100%;margin-top:10px;display:none">应用该图片</button>',
                '</div>',

                // 设置
                '<div id="skbg-pane-settings" class="skbg-pane" role="tabpanel">',
                '  <div class="skbg-lbl">当前背景预览</div>',
                '  <div id="skbg-cur-prev">暂无背景</div>',
                '  <button id="skbg-del-btn" class="skbg-btn danger" style="width:100%">清除背景存储</button>',
                '  <div class="skbg-lbl" style="margin-top:14px">关于</div>',
                '  <div class="skbg-about">',
                '    <strong>SakuraBG v3.1</strong> &nbsp;·&nbsp; 作者 <a href="', AUTHOR.bilibili, '" target="_blank">SakuraMikku</a><br>',
                '    <a href="', AUTHOR.github, '" target="_blank">GitHub 源码</a> &nbsp;·&nbsp; QQ群：', AUTHOR.qqGroup, '<br>',
                '    当前网站：', escHtml(location.host), '<br>',
                '    存储：IndexedDB → localStorage → 内存',
                '  </div>',
                '  <button id="skbg-help-btn" class="skbg-btn secondary" style="width:100%;margin-top:10px">查看使用说明</button>',
                '</div>',

                '</div>', // #skbg-content
                '</div>',  // #skbg-panel

                '<div id="skbg-toast" role="alert" aria-live="polite"></div>',
            ].join("");

            document.body.appendChild(wrapper);
        }

        // ---- 绑定事件 ----
        function bindEvents() {
            // 触发按钮（同时支持键盘回车）
            var trigger = $id("skbg-trigger");
            function togglePanel() {
                _open = !_open;
                $id("skbg-panel").classList.toggle("open", _open);
                if (_open && !_galleryLoaded) renderGallery(false);
            }
            trigger.addEventListener("click", togglePanel);
            trigger.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") togglePanel(); });

            // 关闭
            $id("skbg-close").addEventListener("click", function () {
                _open = false;
                $id("skbg-panel").classList.remove("open");
            });

            // Tab 切换（事件委托）
            $id("skbg-tabs").addEventListener("click", function (e) {
                var tab = e.target.closest ? e.target.closest(".skbg-tab")
                    : (function (el) { while (el && !el.classList.contains("skbg-tab")) el = el.parentNode; return el; })(e.target);
                if (tab && tab.dataset.tab) switchTab(tab.dataset.tab);
            });

            // URL 应用
            $id("skbg-url-apply").addEventListener("click", function () {
                var url = ($id("skbg-url-inp").value || "").trim();
                if (!url) { toast("请输入图片地址", "error"); return; }
                applyAndSave(url);
            });
            $id("skbg-url-inp").addEventListener("keydown", function (e) {
                if (e.key === "Enter") $id("skbg-url-apply").click();
            });

            // 拖拽上传
            var drop = $id("skbg-drop");
            drop.addEventListener("click", function () { $id("skbg-file-inp").click(); });
            drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("dragover"); });
            drop.addEventListener("dragleave", function () { drop.classList.remove("dragover"); });
            drop.addEventListener("dragenter", function (e) { e.preventDefault(); });
            drop.addEventListener("drop", function (e) {
                e.preventDefault(); drop.classList.remove("dragover");
                var file = e.dataTransfer && e.dataTransfer.files[0];
                if (file) handleFile(file);
            });
            $id("skbg-file-inp").addEventListener("change", function (e) {
                var file = e.target.files && e.target.files[0];
                if (file) handleFile(file);
            });

            // 本地应用
            $id("skbg-local-apply").addEventListener("click", function () {
                if (!_b64) { toast("请先选择图片", "error"); return; }
                applyAndSave(_b64);
            });

            // 清除存储
            $id("skbg-del-btn").addEventListener("click", async function () {
                await StorageModule.remove();
                BackgroundModule.clear();
                updatePreview(null);
                toast("✓ 背景存储已清除");
            });

            // 使用说明
            $id("skbg-help-btn").addEventListener("click", function () {
                alert(
                    "SakuraBG v3 使用说明\n\n" +
                    "【图库】点击预设图片直接应用\n" +
                    "【链接】粘贴图片 URL 后点击应用\n" +
                    "【本地】拖拽/点击选择本地图片（支持大图）\n" +
                    "【设置】清除已存储背景\n\n" +
                    "存储优先级：IndexedDB > localStorage > 内存\n" +
                    "问题反馈：QQ群 " + AUTHOR.qqGroup
                );
            });

            // 远程图库刷新
            $id("skbg-gallery-refresh").addEventListener("click", function () {
                _galleryLoaded = false;
                RemoteGalleryProvider.clearCache();
                renderGallery(true);
            });
        }

        // ---- 注入样式 ----
        function injectCSS() {
            if (typeof GM_addStyle !== "undefined") {
                GM_addStyle(CSS);
            } else {
                var style = document.createElement("style");
                style.textContent = CSS;
                (document.head || document.documentElement).appendChild(style);
            }
        }

        return {
            init: function () {
                injectCSS();
                buildHTML();
                bindEvents();
            },
            toast: toast,
            updatePreview: updatePreview,
            applyAndSave: applyAndSave,
        };
    })();

    // ============================================================
    // BOOT
    // ============================================================
    (async function boot() {
        // 首次欢迎提示
        function showWelcome() {
            try {
                if (!localStorage.getItem("SakuraBGv3_welcomed")) {
                    localStorage.setItem("SakuraBGv3_welcomed", "1");
                    setTimeout(function () {
                        alert("欢迎使用 SakuraBG v3 🌸\n\n点击左下角的 🌸 按钮打开背景面板。\n此提示不再重复显示。\n\n遇到问题欢迎在 GitHub 或 B站 反馈！");
                    }, 1000);
                }
            } catch (e) { /* localStorage 可能被禁用 */ }
        }

        async function run() {
            try {
                UIModule.init();
                showWelcome();

                // 恢复上次背景
                var saved = await StorageModule.load();
                var initUrl = saved || DEFAULT_GALLERY[0].url;
                await BackgroundModule.apply(initUrl);
                UIModule.updatePreview(initUrl);

                Logger.info("脚本启动成功 ✓");
            } catch (e) {
                Logger.error("脚本启动失败:", e);
            }
        }

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", run);
        } else {
            // 延迟一帧，确保页面 JS 完成初始渲染
            setTimeout(run, 60);
        }
    })();

})(typeof unsafeWindow !== "undefined" ? unsafeWindow : window);