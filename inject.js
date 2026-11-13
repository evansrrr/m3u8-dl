// M3U8 注入下载器（跨域方案）
// 用法：在视频源站页面 F12 控制台执行注入代码（由主工具页"复制跨域代码"生成），
// 本脚本随后在源站同源上下文运行，从而绕过 CORS 限制下载 m3u8 分片。
// 自包含：不依赖主工具页面的 DOM，仅按需从 base 地址加载 mux.js 用于 TS→MP4 转封装。
//
// v2.2 能力：
// - 自动嗅探页面已请求过的 m3u8（performance / fetch / XHR / video 元素）
// - master playlist 清晰度选择，解析前即显示分片数与时长
// - 分片级重试与并发调节，速度快照与剩余时间
// - 支持 #EXT-X-MAP（fMP4，直接拼接输出）与 #EXT-X-BYTERANGE（Range 请求）
// - 真 AbortController 取消、深浅色自适应、面板位置记忆、单例复用
(function () {
    'use strict';

    var SCRIPT_SRC = (function () {
        try {
            return document.currentScript && document.currentScript.src || '';
        } catch (e) {
            return '';
        }
    })();

    if (window.__m3u8InjectV2Loaded__) {
        if (window.__m3u8InjectV2Show__) window.__m3u8InjectV2Show__();
        return;
    }
    window.__m3u8InjectV2Loaded__ = true;

    // ---------- 文案 ----------
    // UI language follows the browser: Chinese stays Chinese, everything else is English.
    var TEXT = (function () {
        var tags = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
        var tag = String(tags[0] || '');
        if (/^zh(\b|-|_)/i.test(tag)) {
            return {
                title: 'M3U8 注入下载', close: '关闭',
                urlLabel: 'm3u8 地址', formatLabel: '保存格式', nameLabel: '文件名',
                concurrencyLabel: '并发', start: '开始下载', cancel: '取消下载',
                ready: '就绪', needUrl: '请输入 m3u8 地址',
                canceled: '已取消', parsing: '解析播放列表...', probing: '解析中...',
                noVariant: '未在 master playlist 中找到可用清晰度',
                noSegments: '未解析到视频分片',
                missingKey: '缺少 AES 密钥', needIv: 'AES-128 加密的初始化片段缺少 IV',
                merging: '合并文件...', done: '完成：', failed: '出错：',
                muxLoad: 'mux.js 加载失败',
                muxLoadHint: 'mux.js 加载失败（请确认工具已通过 http(s) 部署，file:// 打开时源站无法加载）',
                downloadFailed: '下载失败', qualityLabel: '清晰度',
                badKeyLength: 'AES-128 密钥长度异常：',
                mp4Failed: 'MP4 转封装失败，请改用 TS',
                detected: '检测到的 m3u8', rescan: '重新扫描',
                autoFilled: '已自动填入最近请求的 m3u8 地址',
                emptyDetected: '暂未检测到，可先播放视频或手动粘贴地址',
                summarySegments: ' 个分片', summaryDuration: '时长 ',
                probingHint: '共 ', probeFailed: '地址暂时无法解析：',
                partial: '已跳过失败分片：', partialUnit: ' 个',
                audioGroup: '该清晰度使用独立音轨，注入下载暂不支持，请回到主工具页下载',
                sampleAes: 'SAMPLE-AES 加密暂不支持，请回到主工具页下载',
                fmp4Note: 'fMP4 源将直接拼接为 MP4',
                liveNote: '直播播放列表，仅下载当前已存在的分片',
                keyGroupMismatch: '不支持的密钥格式：',
                retrying: '重试第 ',
                noMap: '缺少 fMP4 初始化片段'
            };
        }
        return {
            title: 'M3U8 injected download', close: 'Close',
            urlLabel: 'm3u8 URL', formatLabel: 'Format', nameLabel: 'File name',
            concurrencyLabel: 'Concurrency', start: 'Start download', cancel: 'Cancel download',
            ready: 'Ready', needUrl: 'Enter an m3u8 URL',
            canceled: 'Canceled', parsing: 'Parsing playlist...', probing: 'Parsing...',
            noVariant: 'No usable quality in this master playlist',
            noSegments: 'No video segments found',
            missingKey: 'AES key missing', needIv: 'Encrypted init segment is missing its IV',
            merging: 'Merging files...', done: 'Done: ', failed: 'Error: ',
            muxLoad: 'Failed to load mux.js',
            muxLoadHint: 'Failed to load mux.js (deploy the tool over http(s); file:// cannot load scripts cross-origin)',
            downloadFailed: 'download failed', qualityLabel: 'Quality',
            badKeyLength: 'Unexpected AES-128 key length: ',
            mp4Failed: 'MP4 remux failed, use TS instead',
            detected: 'm3u8 requests detected', rescan: 'Rescan',
            autoFilled: 'Filled with the most recent m3u8 request',
            emptyDetected: 'Nothing detected yet — start playback or paste a URL',
            summarySegments: ' segments', summaryDuration: 'duration ',
            probingHint: '', probeFailed: 'Cannot parse this URL yet: ',
            partial: 'Skipped failed segments: ', partialUnit: '',
            audioGroup: 'This quality uses a separate audio track, which the injected downloader cannot merge. Use the main tool page instead.',
            sampleAes: 'SAMPLE-AES is not supported. Use the main tool page instead.',
            fmp4Note: 'fMP4 source is concatenated into MP4 directly',
            liveNote: 'Live playlist — only segments currently listed will be downloaded',
            keyGroupMismatch: 'Unsupported key format: ',
            retrying: 'Retry ',
            noMap: 'Missing fMP4 init segment'
        };
    })();

    var BASE = (function () {
        var explicit = window.__M3U8_BASE__;
        if (explicit) return String(explicit).replace(/\/?$/, '/');
        if (SCRIPT_SRC) {
            try {
                return new URL('.', SCRIPT_SRC).href;
            } catch (e) { /* fall through */ }
        }
        return location.origin + '/';
    })();

    var STORE_KEY = 'm3u8-inject-prefs-v2';
    var state = {
        panel: null,
        refs: {},
        format: 'mp4',
        controller: null,
        running: false,
        candidates: [],
        variants: [],
        selectedVariantUrl: '',
        playlist: null,
        probedUrl: '',
        probeController: null,
        probeTimer: 0,
        autoFilled: false,
        lastFileBase: '',
        prefs: {}
    };

    // ---------- 工具函数 ----------
    function resolveUrl(url, base) {
        try {
            return new URL(url, base).href;
        } catch (e) {
            return url;
        }
    }

    function shortUrl(url, max) {
        var text = String(url || '');
        var limit = max || 52;
        if (text.length <= limit) return text;
        var path = text;
        try {
            var parsed = new URL(text);
            path = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
        } catch (e) { /* keep full text */ }
        return path.length > limit ? path.slice(0, limit - 1) + '…' : path;
    }

    function fmtBytes(n) {
        if (!Number.isFinite(n) || n < 0) return '0 B';
        var units = ['B', 'KB', 'MB', 'GB'];
        var i = 0;
        var v = n;
        while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
        return (i === 0 ? v : v.toFixed(1)) + ' ' + units[i];
    }

    function fmtSpeed(bytesPerSecond) {
        if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '';
        return fmtBytes(bytesPerSecond) + '/s';
    }

    function fmtDuration(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) return '--:--';
        var total = Math.round(seconds);
        var h = Math.floor(total / 3600);
        var m = Math.floor((total % 3600) / 60);
        var s = total % 60;
        function pad(v) { return v < 10 ? '0' + v : String(v); }
        return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
    }

    function parseKeyValueAttrs(str) {
        // 解析类似 METHOD=AES-128,URI="xx",IV=0x... 的属性串
        var attrs = {};
        var re = /([A-Z0-9-]+)\s*=\s*(?:"([^"]*)"|([^,]*))/gi;
        var m;
        while ((m = re.exec(str)) !== null) {
            attrs[m[1].toUpperCase()] = m[2] !== undefined ? m[2] : (m[3] || '').trim();
        }
        return attrs;
    }

    function hexToBytes(hex) {
        var s = String(hex || '').replace(/^0x/i, '');
        if (s.length % 2) s = '0' + s;
        var out = new Uint8Array(s.length / 2);
        for (var i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
        return out;
    }

    function decodeText(bytes) {
        try {
            return new TextDecoder('utf-8').decode(bytes);
        } catch (e) {
            return '';
        }
    }

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function sanitizeFilename(name) {
        return String(name || '')
            .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120);
    }

    function fileBaseFromUrl(url) {
        try {
            var path = new URL(url, location.href).pathname;
            var base = decodeURIComponent(path.split('/').pop() || 'video');
            base = base.replace(/\.(m3u8|m3u|mpd)$/i, '');
            return sanitizeFilename(base) || 'video';
        } catch (e) {
            return 'video';
        }
    }

    function normalizeInputUrl(raw) {
        var value = String(raw || '').trim();
        if (!value) return '';
        if (value.indexOf('//') === 0) return location.protocol + value;
        if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
            try {
                return new URL(value, location.href).href;
            } catch (e) {
                return value;
            }
        }
        return value;
    }

    function loadPrefs() {
        try {
            var raw = localStorage.getItem(STORE_KEY);
            var parsed = raw ? JSON.parse(raw) : null;
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function savePrefs(patch) {
        try {
            var merged = loadPrefs();
            Object.keys(patch).forEach(function (key) { merged[key] = patch[key]; });
            localStorage.setItem(STORE_KEY, JSON.stringify(merged));
            state.prefs = merged;
        } catch (e) { /* localStorage 可能不可用 */ }
    }

    // ---------- 地址嗅探 ----------
    function looksLikeM3u8(url) {
        var text = String(url || '');
        if (!/^https?:|^\/\//i.test(text)) return false;
        return /\.m3u8(\?|#|$)/i.test(text)
            || /\/m3u8(?:\/|\?|#|$)/i.test(text)
            || /[?&](?:format|type|ext)=m3u8(?:&|$)/i.test(text);
    }

    function rememberCandidate(url) {
        if (!looksLikeM3u8(url)) return;
        var absolute;
        try {
            absolute = new URL(url, location.href).href;
        } catch (e) {
            return;
        }
        var existing = state.candidates.indexOf(absolute);
        if (existing !== -1) {
            state.candidates.splice(existing, 1);
        }
        state.candidates.unshift(absolute);
        if (state.candidates.length > 12) state.candidates.length = 12;
        renderCandidates();
        maybeAutoFill();
    }

    function scanPageForM3u8() {
        try {
            if (window.performance && performance.getEntriesByType) {
                performance.getEntriesByType('resource').forEach(function (entry) {
                    rememberCandidate(entry && entry.name);
                });
            }
        } catch (e) { /* ignore */ }
        try {
            var nodes = document.querySelectorAll('video, video source, source');
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                if (node.currentSrc) rememberCandidate(node.currentSrc);
                if (node.src) rememberCandidate(node.src);
            }
        } catch (e) { /* ignore */ }
    }

    function installNetworkSniffer() {
        try {
            var originalFetch = window.fetch;
            if (typeof originalFetch === 'function' && !originalFetch.__m3u8Hooked__) {
                var wrapped = function (input, init) {
                    try {
                        // 忽略注入面板自己发起的请求，避免把内部分片/清晰度地址当成页面候选
                        if (!(init && init.__m3u8Internal)) {
                            var target = typeof input === 'string' ? input : (input && input.url);
                            rememberCandidate(target);
                        }
                    } catch (e) { /* ignore */ }
                    return originalFetch.apply(this, arguments);
                };
                wrapped.__m3u8Hooked__ = true;
                window.fetch = wrapped;
            }
        } catch (e) { /* ignore */ }

        try {
            var XHR = window.XMLHttpRequest;
            if (XHR && XHR.prototype && !XHR.prototype.__m3u8Hooked__) {
                var originalOpen = XHR.prototype.open;
                XHR.prototype.open = function (method, url) {
                    try { rememberCandidate(url); } catch (e) { /* ignore */ }
                    return originalOpen.apply(this, arguments);
                };
                XHR.prototype.__m3u8Hooked__ = true;
            }
        } catch (e) { /* ignore */ }
    }

    // ---------- m3u8 解析 ----------
    function parseByteRange(text) {
        var parts = String(text || '').trim().split('@');
        var length = Number(parts[0]);
        if (!Number.isFinite(length) || length <= 0) return null;
        var offset = parts.length > 1 ? Number(parts[1]) : null;
        return { length: length, offset: Number.isFinite(offset) && offset >= 0 ? offset : null };
    }

    function mapKey(segment) {
        var map = segment && segment.map;
        if (!map || !map.url) return '';
        var range = map.byteRange;
        return map.url + '|' + (range ? range.offset + '+' + range.length : 'full');
    }

    function parsePlaylist(text, baseUrl) {
        var lines = String(text || '').split(/\r?\n/);
        var result = {
            type: 'media',
            variants: [],
            renditions: [],
            segments: [],
            container: 'ts',
            error: '',
            isLive: true,
            hasMap: false,
            encrypted: false
        };
        var pendingVariant = null;
        var activeKey = null;
        var activeMap = null;
        var pendingByteRange = null;
        var pendingDuration = 0;
        var mediaSequence = 0;
        var rangeEnds = Object.create(null);
        var sawEndList = false;
        var segmentIndex = 0;

        function resolveRange(range, url) {
            if (!range) return null;
            var offset = range.offset;
            if (offset === null || offset === undefined) {
                offset = rangeEnds[url] || 0;
            }
            rangeEnds[url] = offset + range.length;
            return { offset: offset, length: range.length };
        }

        for (var i = 0; i < lines.length; i++) {
            var raw = lines[i];
            var line = raw.replace(/^\uFEFF/, '').trim();
            if (!line) continue;

            if (line.charAt(0) === '#') {
                if (line.indexOf('#EXT-X-STREAM-INF') === 0) {
                    var variantAttrs = parseKeyValueAttrs(line.slice(line.indexOf(':') + 1));
                    pendingVariant = {
                        bandwidth: Number(variantAttrs.BANDWIDTH) || 0,
                        averageBandwidth: Number(variantAttrs['AVERAGE-BANDWIDTH']) || 0,
                        resolution: variantAttrs.RESOLUTION || '',
                        codecs: variantAttrs.CODECS || '',
                        frameRate: variantAttrs['FRAME-RATE'] || '',
                        audioGroupId: variantAttrs.AUDIO || '',
                        subtitleGroupId: variantAttrs.SUBTITLES || '',
                        name: variantAttrs.NAME || '',
                        url: ''
                    };
                } else if (line.indexOf('#EXT-X-MEDIA:') === 0) {
                    var mediaAttrs = parseKeyValueAttrs(line.slice(line.indexOf(':') + 1));
                    result.renditions.push({
                        type: (mediaAttrs.TYPE || '').toUpperCase(),
                        groupId: mediaAttrs['GROUP-ID'] || '',
                        name: mediaAttrs.NAME || '',
                        language: mediaAttrs.LANGUAGE || '',
                        uri: mediaAttrs.URI ? resolveUrl(mediaAttrs.URI, baseUrl) : '',
                        isDefault: String(mediaAttrs.DEFAULT || '').toUpperCase() === 'YES'
                    });
                } else if (line.indexOf('#EXT-X-MEDIA-SEQUENCE') === 0) {
                    var sequenceValue = Number(line.slice(line.indexOf(':') + 1).trim());
                    mediaSequence = Number.isFinite(sequenceValue) && sequenceValue >= 0 ? sequenceValue : 0;
                } else if (line.indexOf('#EXT-X-KEY') === 0) {
                    var keyAttrs = parseKeyValueAttrs(line.slice(line.indexOf(':') + 1));
                    var method = String(keyAttrs.METHOD || '').toUpperCase();
                    if (!method || method === 'NONE') {
                        activeKey = null;
                    } else if (method === 'AES-128') {
                        var keyFormat = String(keyAttrs.KEYFORMAT || 'identity').toLowerCase();
                        if (keyFormat && keyFormat !== 'identity') {
                            result.error = TEXT.keyGroupMismatch + keyFormat;
                        }
                        if (!keyAttrs.URI) {
                            result.error = TEXT.missingKey;
                        }
                        activeKey = {
                            method: method,
                            uri: keyAttrs.URI ? resolveUrl(keyAttrs.URI, baseUrl) : '',
                            iv: keyAttrs.IV ? hexToBytes(keyAttrs.IV) : null
                        };
                        result.encrypted = true;
                    } else {
                        result.error = TEXT.sampleAes;
                        activeKey = null;
                    }
                } else if (line.indexOf('#EXT-X-MAP') === 0) {
                    var mapAttrs = parseKeyValueAttrs(line.slice(line.indexOf(':') + 1));
                    if (!mapAttrs.URI) {
                        result.error = TEXT.noMap;
                    } else {
                        var mapUrl = resolveUrl(mapAttrs.URI, baseUrl);
                        activeMap = {
                            url: mapUrl,
                            byteRange: mapAttrs.BYTERANGE ? resolveRange(parseByteRange(mapAttrs.BYTERANGE), mapUrl) : null,
                            key: activeKey ? { method: activeKey.method, uri: activeKey.uri, iv: activeKey.iv } : null
                        };
                        result.hasMap = true;
                        result.container = 'fmp4';
                    }
                } else if (line.indexOf('#EXT-X-BYTERANGE') === 0) {
                    pendingByteRange = parseByteRange(line.slice(line.indexOf(':') + 1));
                } else if (line.indexOf('#EXTINF') === 0) {
                    var durationText = line.slice(line.indexOf(':') + 1).split(',')[0].trim();
                    var durationValue = parseFloat(durationText);
                    pendingDuration = Number.isFinite(durationValue) && durationValue > 0 ? durationValue : 0;
                } else if (line.indexOf('#EXT-X-ENDLIST') === 0) {
                    sawEndList = true;
                }
                continue;
            }

            if (pendingVariant) {
                pendingVariant.url = resolveUrl(line, baseUrl);
                result.variants.push(pendingVariant);
                pendingVariant = null;
                continue;
            }

            var segmentUrl = resolveUrl(line, baseUrl);
            var byteRange = pendingByteRange ? resolveRange(pendingByteRange, segmentUrl) : null;
            result.segments.push({
                url: segmentUrl,
                sequence: mediaSequence + segmentIndex,
                duration: pendingDuration,
                byteRange: byteRange,
                map: activeMap,
                key: activeKey ? { method: activeKey.method, uri: activeKey.uri, iv: activeKey.iv } : null
            });
            segmentIndex += 1;
            pendingByteRange = null;
            pendingDuration = 0;
        }

        if (result.variants.length > 0 && result.segments.length === 0) {
            result.type = 'master';
        }
        result.isLive = !sawEndList && result.type !== 'master';
        return result;
    }

    function totalDuration(segments) {
        var sum = 0;
        segments.forEach(function (segment) {
            if (segment && segment.duration) sum += segment.duration;
        });
        return sum;
    }

    // ---------- AES-128 解密 ----------
    function aesIvForSequence(sequence) {
        // 未显式指定 IV 时，按 HLS 规范：IV 为 16 字节，最后 4 字节为大端序号
        var iv = new Uint8Array(16);
        var seq = sequence >>> 0;
        iv[12] = (seq >>> 24) & 0xff;
        iv[13] = (seq >>> 16) & 0xff;
        iv[14] = (seq >>> 8) & 0xff;
        iv[15] = seq & 0xff;
        return iv;
    }

    async function decryptAes128(data, keyBytes, ivBytes) {
        var cryptoApi = window.crypto || window.msCrypto;
        if (!cryptoApi || !cryptoApi.subtle) throw new Error('WebCrypto unavailable');
        var key = await cryptoApi.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
        var plain = await cryptoApi.subtle.decrypt({ name: 'AES-CBC', iv: ivBytes }, key, data);
        return new Uint8Array(plain);
    }

    // ---------- 网络请求 ----------
    function abortError() {
        var error = new Error('__cancelled__');
        error.name = 'AbortError';
        return error;
    }

    function isAbortError(error) {
        return !!error && (error.name === 'AbortError' || error.message === '__cancelled__');
    }

    function requestBytes(url, options) {
        var opts = options || {};
        var signal = opts.signal;
        if (signal && signal.aborted) return Promise.reject(abortError());
        var headers = {};
        var range = opts.byteRange;
        if (range && range.length > 0) {
            var start = range.offset || 0;
            headers.Range = 'bytes=' + start + '-' + (start + range.length - 1);
        }
        return fetch(url, {
            credentials: 'include',
            headers: headers,
            signal: signal,
            __m3u8Internal: true
        }).then(function (res) {
            if (!res.ok) {
                var error = new Error('HTTP ' + res.status + ' ' + shortUrl(url));
                error.status = res.status;
                throw error;
            }
            return res.arrayBuffer().then(function (buffer) {
                var bytes = new Uint8Array(buffer);
                // 服务器忽略 Range 时返回整个文件，这里按需切片。
                if (range && range.length > 0 && bytes.length > range.length) {
                    var offset = range.offset || 0;
                    bytes = bytes.subarray(offset, offset + range.length);
                }
                return bytes;
            });
        });
    }

    async function fetchBytes(url, options, attempts) {
        var opts = options || {};
        var maxAttempts = attempts || 3;
        var lastError = null;
        for (var attempt = 0; attempt < maxAttempts; attempt++) {
            if (opts.signal && opts.signal.aborted) throw abortError();
            try {
                return await requestBytes(url, opts);
            } catch (error) {
                lastError = error;
                if (isAbortError(error)) throw error;
                var status = error && error.status;
                var retryable = !status || status === 408 || status === 425 || status === 429 || status >= 500;
                if (!retryable || attempt === maxAttempts - 1) throw error;
                if (opts.onRetry) opts.onRetry(attempt + 1, maxAttempts);
                await sleep(220 * Math.pow(2, attempt));
            }
        }
        throw lastError || new Error(TEXT.downloadFailed);
    }

    async function fetchPlaylist(url, options) {
        var bytes = await fetchBytes(url, options, 3);
        return decodeText(bytes);
    }

    // ---------- 下载 ----------
    async function loadKey(uri, cache, options) {
        if (cache.has(uri)) return cache.get(uri);
        var promise = (async function () {
            try {
                var bytes = await fetchBytes(uri, options, 3);
                if (bytes.length !== 16) throw new Error(TEXT.badKeyLength + uri);
                return bytes;
            } catch (error) {
                cache.delete(uri);
                throw error;
            }
        })();
        cache.set(uri, promise);
        return promise;
    }

    async function loadInitSegments(segments, options) {
        var cache = new Map();
        var pending = new Map();
        segments.forEach(function (segment) {
            var key = mapKey(segment);
            if (!key || pending.has(key) || cache.has(key)) return;
            pending.set(key, segment);
        });
        var keys = Array.from(pending.keys());
        for (var i = 0; i < keys.length; i++) {
            if (options.signal && options.signal.aborted) throw abortError();
            var key = keys[i];
            var map = pending.get(key).map;
            var bytes = await fetchBytes(map.url, { signal: options.signal, byteRange: map.byteRange }, 3);
            if (map.key && map.key.method === 'AES-128') {
                if (!map.key.iv || map.key.iv.length !== 16) throw new Error(TEXT.needIv);
                var keyBytes = await loadKey(map.key.uri, options.keyCache, options);
                bytes = await decryptAes128(bytes, keyBytes, map.key.iv);
            }
            cache.set(key, bytes);
        }
        return cache;
    }

    async function downloadSegments(segments, options) {
        var results = new Array(segments.length);
        var failed = [];
        var keyCache = options.keyCache;
        var cursor = 0;
        var concurrency = Math.max(1, Math.min(options.concurrency || 6, segments.length || 1));

        async function worker() {
            while (true) {
                var index = cursor;
                cursor += 1;
                if (index >= segments.length) return;
                if (options.signal && options.signal.aborted) throw abortError();
                var segment = segments[index];
                try {
                    var bytes = await fetchBytes(segment.url, {
                        signal: options.signal,
                        byteRange: segment.byteRange,
                        onRetry: options.onRetry
                    }, 3);
                    if (segment.key && segment.key.method === 'AES-128') {
                        var keyBytes = await loadKey(segment.key.uri, keyCache, options);
                        var iv = segment.key.iv && segment.key.iv.length === 16
                            ? segment.key.iv
                            : aesIvForSequence(segment.sequence);
                        bytes = await decryptAes128(bytes, keyBytes, iv);
                    }
                    results[index] = bytes;
                    options.onSegment(index, bytes.length, false);
                } catch (error) {
                    if (isAbortError(error)) throw error;
                    failed.push({ index: index, error: error });
                    options.onSegment(index, 0, true);
                }
            }
        }

        var workers = [];
        for (var i = 0; i < concurrency; i++) workers.push(worker());
        await Promise.all(workers);
        return { results: results, failed: failed };
    }

    // ---------- MP4 转封装（mux.js） ----------
    function loadMux() {
        if (window.muxjs && window.muxjs.mp4 && window.muxjs.mp4.Transmuxer) return Promise.resolve(window.muxjs);
        return new Promise(function (resolve, reject) {
            var settled = false;
            var timer = setTimeout(function () {
                if (settled) return;
                settled = true;
                reject(new Error(TEXT.muxLoadHint));
            }, 15000);
            function finish(error) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (error) reject(error);
                else resolve(window.muxjs);
            }
            var script = document.createElement('script');
            script.src = BASE + 'vendor/mux.min.js?v=202611140001';
            script.onload = function () {
                if (window.muxjs && window.muxjs.mp4 && window.muxjs.mp4.Transmuxer) finish();
                else finish(new Error(TEXT.muxLoad));
            };
            script.onerror = function () { finish(new Error(TEXT.muxLoadHint)); };
            document.head.appendChild(script);
        });
    }

    // mux.js 依赖分片 PTS 连续；源站 PTS 回跳时它会按 +2^33 修正，
    // 导致导出 MP4 时长多出几十小时。这里按样本时长重建时间轴并修正异常样本时长。
    function readMp4Boxes(view, bytes, start, end) {
        var boxes = [];
        var offset = start;
        while (offset + 8 <= end) {
            var size = view.getUint32(offset);
            var type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
            var headerSize = 8;
            if (size === 1 && offset + 16 <= end) {
                size = Number(view.getBigUint64(offset + 8));
                headerSize = 16;
            } else if (size === 0) {
                size = end - offset;
            }
            if (size < headerSize || offset + size > end) break;
            boxes.push({ type: type, payload: offset + headerSize, end: offset + size });
            offset += size;
        }
        return boxes;
    }

    function writeMp4Uint64(view, offset, value) {
        var normalized = Math.max(0, Math.round(value));
        view.setUint32(offset, Math.floor(normalized / 4294967296));
        view.setUint32(offset + 4, normalized >>> 0);
    }

    function createMp4TimebaseNormalizer(initSegment) {
        var bytes = initSegment;
        var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        var tracks = new Map();
        var movieTimescale = 1000;
        var movieHeader = null;

        readMp4Boxes(view, bytes, 0, bytes.length).forEach(function (box) {
            if (box.type !== 'moov') return;
            readMp4Boxes(view, bytes, box.payload, box.end).forEach(function (child) {
                if (child.type === 'mvhd') {
                    var version = bytes[child.payload];
                    movieTimescale = view.getUint32(child.payload + (version === 1 ? 20 : 12)) || 1000;
                    movieHeader = { version: version, offset: child.payload + (version === 1 ? 24 : 16) };
                } else if (child.type === 'trak') {
                    var trackId = 0;
                    var timescale = 90000;
                    var mediaHeader = null;
                    var trackHeader = null;
                    readMp4Boxes(view, bytes, child.payload, child.end).forEach(function (part) {
                        if (part.type === 'tkhd') {
                            var tkhdVersion = bytes[part.payload];
                            trackId = view.getUint32(part.payload + (tkhdVersion === 1 ? 20 : 12));
                            trackHeader = { version: tkhdVersion, offset: part.payload + (tkhdVersion === 1 ? 28 : 20) };
                        } else if (part.type === 'mdia') {
                            readMp4Boxes(view, bytes, part.payload, part.end).forEach(function (media) {
                                if (media.type !== 'mdhd') return;
                                var mdhdVersion = bytes[media.payload];
                                timescale = view.getUint32(media.payload + (mdhdVersion === 1 ? 20 : 12)) || timescale;
                                mediaHeader = { version: mdhdVersion, offset: media.payload + (mdhdVersion === 1 ? 24 : 16) };
                            });
                        }
                    });
                    if (trackId) tracks.set(trackId, { timescale: timescale, mediaHeader: mediaHeader, trackHeader: trackHeader, cursor: 0 });
                }
            });
        });

        return { bytes: bytes, view: view, tracks: tracks, movieTimescale: movieTimescale, movieHeader: movieHeader };
    }

    function normalizeMp4FragmentTimebase(normalizer, fragment) {
        var bytes = fragment;
        var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        readMp4Boxes(view, bytes, 0, bytes.length).forEach(function (moof) {
            if (moof.type !== 'moof') return;
            readMp4Boxes(view, bytes, moof.payload, moof.end).forEach(function (traf) {
                if (traf.type !== 'traf') return;
                var trackId = 0;
                var baseMediaDecodeTime = null;
                var sampleDurations = [];
                readMp4Boxes(view, bytes, traf.payload, traf.end).forEach(function (box) {
                    if (box.type === 'tfhd') {
                        trackId = view.getUint32(box.payload + 4);
                    } else if (box.type === 'tfdt') {
                        baseMediaDecodeTime = { version: bytes[box.payload], offset: box.payload + 4 };
                    } else if (box.type === 'trun') {
                        var flags = view.getUint32(box.payload) & 0xffffff;
                        if (!(flags & 0x100)) return;
                        var sampleCount = view.getUint32(box.payload + 4);
                        var cursor = box.payload + 8;
                        if (flags & 0x1) cursor += 4;
                        if (flags & 0x4) cursor += 4;
                        var stride = 4 + ((flags & 0x200) ? 4 : 0) + ((flags & 0x400) ? 4 : 0) + ((flags & 0x800) ? 4 : 0);
                        for (var index = 0; index < sampleCount; index += 1) {
                            sampleDurations.push({ offset: cursor, value: view.getUint32(cursor) });
                            cursor += stride;
                        }
                    }
                });

                var track = normalizer.tracks.get(trackId);
                if (!track || !baseMediaDecodeTime) return;
                if (sampleDurations.length > 3) {
                    var sorted = sampleDurations.slice().map(function (sample) { return sample.value; }).sort(function (left, right) { return left - right; });
                    var median = sorted[Math.floor(sorted.length / 2)];
                    var maxAllowed = Math.max(median * 8, Math.round(track.timescale * 0.5));
                    if (median > 0) {
                        sampleDurations.forEach(function (sample) {
                            if (sample.value <= maxAllowed) return;
                            sample.value = median;
                            view.setUint32(sample.offset, median);
                        });
                    }
                }

                var duration = 0;
                sampleDurations.forEach(function (sample) { duration += sample.value; });

                if (baseMediaDecodeTime.version === 1) writeMp4Uint64(view, baseMediaDecodeTime.offset, track.cursor);
                else view.setUint32(baseMediaDecodeTime.offset, track.cursor >>> 0);
                track.cursor += duration;
            });
        });
    }

    function finalizeMp4Timebase(normalizer) {
        var longestSeconds = 0;
        normalizer.tracks.forEach(function (track) {
            var seconds = track.cursor / track.timescale;
            longestSeconds = Math.max(longestSeconds, seconds);
            if (track.mediaHeader) {
                if (track.mediaHeader.version === 1) writeMp4Uint64(normalizer.view, track.mediaHeader.offset, track.cursor);
                else normalizer.view.setUint32(track.mediaHeader.offset, track.cursor >>> 0);
            }
            if (track.trackHeader) {
                var movieTicks = Math.round(seconds * normalizer.movieTimescale);
                if (track.trackHeader.version === 1) writeMp4Uint64(normalizer.view, track.trackHeader.offset, movieTicks);
                else normalizer.view.setUint32(track.trackHeader.offset, movieTicks >>> 0);
            }
        });
        if (normalizer.movieHeader) {
            var totalTicks = Math.round(longestSeconds * normalizer.movieTimescale);
            if (normalizer.movieHeader.version === 1) writeMp4Uint64(normalizer.view, normalizer.movieHeader.offset, totalTicks);
            else normalizer.view.setUint32(normalizer.movieHeader.offset, totalTicks >>> 0);
        }
        return longestSeconds;
    }

    async function transmuxToMp4(parts) {
        var muxjs = await loadMux();
        var Transmuxer = muxjs.mp4.Transmuxer;
        var out = [];
        var normalizer = null;
        var transmuxer = new Transmuxer();
        transmuxer.on('data', function (seg) {
            if (!normalizer && seg.initSegment) {
                normalizer = createMp4TimebaseNormalizer(seg.initSegment);
                out.push(seg.initSegment);
            }
            if (normalizer && seg.data) {
                normalizeMp4FragmentTimebase(normalizer, seg.data);
                out.push(seg.data);
            }
        });
        parts.forEach(function (part) {
            if (part && part.length) transmuxer.push(part);
        });
        transmuxer.flush();
        if (typeof transmuxer.dispose === 'function') transmuxer.dispose();
        if (out.length === 0) throw new Error(TEXT.mp4Failed);
        finalizeMp4Timebase(normalizer);
        return out;
    }

    // fMP4 源本身已是 init + moof/mdat 结构，直接按顺序拼接即可，无需 mux.js。
    function assembleFmp4(parts, segments, initCache) {
        var out = [];
        var lastMapKey = null;
        for (var i = 0; i < segments.length; i++) {
            var part = parts[i];
            if (!part || !part.length) continue;
            var key = mapKey(segments[i]);
            if (key && key !== lastMapKey) {
                var init = initCache.get(key);
                if (init && init.length) out.push(init);
                lastMapKey = key;
            }
            out.push(part);
        }
        return out;
    }

    function triggerDownload(blob, filename) {
        var anchor = document.createElement('a');
        var url = URL.createObjectURL(blob);
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    }

    // ---------- 注入 UI ----------
    function ensureStyle() {
        if (document.getElementById('m3u8-inject-style-v2')) return;
        var style = document.createElement('style');
        style.id = 'm3u8-inject-style-v2';
        style.textContent = [
            '.m3u8-inject-panel{--ij-bg:#fff;--ij-fg:#1a1a1a;--ij-muted:#6b6b70;--ij-faint:#9a9aa2;--ij-border:#e3e3e5;',
            '--ij-input:#fafafa;--ij-head:#1a1a1a;--ij-head-fg:#fff;--ij-accent:#1a1a1a;--ij-accent-fg:#fff;',
            '--ij-track:#ececef;--ij-danger:#c0392b;--ij-chip:#f5f5f7;',
            'position:fixed;right:16px;bottom:16px;width:380px;max-width:calc(100vw - 24px);z-index:2147483647;',
            'background:var(--ij-bg);color:var(--ij-fg);border:1px solid var(--ij-border);border-radius:12px;',
            'box-shadow:0 16px 40px rgba(0,0,0,.18);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;',
            'font-size:13px;line-height:1.5;overflow:hidden;}',
            '@media (prefers-color-scheme: dark){.m3u8-inject-panel{--ij-bg:#1c1c1e;--ij-fg:#f2f2f4;--ij-muted:#9a9aa2;',
            '--ij-faint:#84848c;--ij-border:#333338;--ij-input:#26262a;--ij-head:#0d0d0f;--ij-head-fg:#f2f2f4;',
            '--ij-accent:#f2f2f4;--ij-accent-fg:#161618;--ij-track:#2c2c30;--ij-danger:#ff6b5e;--ij-chip:#26262a;}}',
            '.m3u8-inject-panel *{box-sizing:border-box;margin:0;padding:0;font-family:inherit;}',
            '.m3u8-inject-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;',
            'background:var(--ij-head);color:var(--ij-head-fg);cursor:move;user-select:none;touch-action:none;}',
            '.m3u8-inject-head .t{font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.m3u8-inject-acts{display:flex;align-items:center;gap:2px;flex:0 0 auto;}',
            '.m3u8-inject-ic{width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:6px;',
            'cursor:pointer;opacity:.72;font-size:15px;line-height:1;}',
            '.m3u8-inject-ic:hover{opacity:1;background:rgba(127,127,127,.22);}',
            '.m3u8-inject-body{padding:12px;max-height:min(72vh,560px);overflow:auto;}',
            '.m3u8-inject-panel.collapsed .m3u8-inject-body{display:none;}',
            '.m3u8-inject-row{margin-bottom:10px;}',
            '.m3u8-inject-label{display:block;font-size:11.5px;color:var(--ij-muted);margin-bottom:4px;}',
            '.m3u8-inject-input,.m3u8-inject-select{width:100%;padding:7px 9px;border:1px solid var(--ij-border);border-radius:8px;',
            'font-size:12.5px;background:var(--ij-input);color:var(--ij-fg);}',
            '.m3u8-inject-input:focus,.m3u8-inject-select:focus{outline:none;border-color:var(--ij-accent);}',
            '.m3u8-inject-grid{display:grid;grid-template-columns:1fr 88px;gap:8px;}',
            '.m3u8-inject-sniff{margin-top:8px;border-top:1px dashed var(--ij-border);padding-top:8px;}',
            '.m3u8-inject-sniff-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}',
            '.m3u8-inject-sniff-head .lbl{font-size:11px;color:var(--ij-muted);}',
            '.m3u8-inject-link{background:none;border:none;color:var(--ij-muted);font-size:11px;cursor:pointer;text-decoration:underline;}',
            '.m3u8-inject-link:hover{color:var(--ij-fg);}',
            '.m3u8-inject-chips{display:flex;flex-direction:column;gap:4px;max-height:112px;overflow:auto;}',
            '.m3u8-inject-chip{display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:5px 8px;border:1px solid var(--ij-border);',
            'border-radius:7px;background:var(--ij-chip);color:var(--ij-fg);font-size:11.5px;cursor:pointer;overflow:hidden;}',
            '.m3u8-inject-chip:hover{border-color:var(--ij-accent);}',
            '.m3u8-inject-chip .p{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.m3u8-inject-chip .n{flex:0 0 auto;color:var(--ij-faint);font-variant-numeric:tabular-nums;}',
            '.m3u8-inject-chip.on{border-color:var(--ij-accent);box-shadow:inset 0 0 0 1px var(--ij-accent);}',
            '.m3u8-inject-note{font-size:11px;color:var(--ij-muted);margin-top:-4px;margin-bottom:8px;word-break:break-word;}',
            '.m3u8-inject-empty{font-size:11px;color:var(--ij-faint);padding:2px 0;}',
            '.m3u8-inject-formats{display:flex;gap:8px;}',
            '.m3u8-inject-fmt{flex:1;text-align:center;padding:7px;border:1px solid var(--ij-border);border-radius:8px;cursor:pointer;',
            'font-size:12px;color:var(--ij-muted);}',
            '.m3u8-inject-fmt.on{background:var(--ij-accent);color:var(--ij-accent-fg);border-color:var(--ij-accent);}',
            '.m3u8-inject-fmt.off{opacity:.42;cursor:not-allowed;}',
            '.m3u8-inject-btn{width:100%;padding:9px;background:var(--ij-accent);color:var(--ij-accent-fg);border:none;border-radius:8px;',
            'font-size:13px;font-weight:600;cursor:pointer;}',
            '.m3u8-inject-btn:hover{opacity:.88;}',
            '.m3u8-inject-btn:disabled{opacity:.5;cursor:not-allowed;}',
            '.m3u8-inject-btn.stop{background:var(--ij-danger);color:#fff;}',
            '.m3u8-inject-progress{height:5px;background:var(--ij-track);border-radius:3px;overflow:hidden;margin:10px 0 6px;}',
            '.m3u8-inject-progress .bar{height:100%;background:var(--ij-accent);width:0;transition:width .18s;}',
            '.m3u8-inject-foot{display:flex;align-items:baseline;gap:8px;font-size:11.5px;min-height:16px;}',
            '.m3u8-inject-count{flex:0 0 auto;color:var(--ij-fg);font-variant-numeric:tabular-nums;font-weight:600;}',
            '.m3u8-inject-status{flex:1;color:var(--ij-muted);word-break:break-word;}',
            '.m3u8-inject-status.err{color:var(--ij-danger);}'
        ].join('\n');
        document.head.appendChild(style);
    }

    function createUI() {
        var existing = document.querySelector('.m3u8-inject-panel');
        if (existing) {
            existing.style.display = '';
            state.panel = existing;
            return;
        }

        ensureStyle();

        var panel = document.createElement('div');
        panel.className = 'm3u8-inject-panel';
        panel.innerHTML =
            '<div class="m3u8-inject-head">' +
            '<span class="t"></span>' +
            '<span class="m3u8-inject-acts">' +
            '<span class="m3u8-inject-ic m3u8-inject-min" role="button" tabindex="0">–</span>' +
            '<span class="m3u8-inject-ic m3u8-inject-x" role="button" tabindex="0">×</span>' +
            '</span></div>' +
            '<div class="m3u8-inject-body">' +
            '<div class="m3u8-inject-row">' +
            '<label class="m3u8-inject-label">' + TEXT.urlLabel + '</label>' +
            '<input class="m3u8-inject-input m3u8-inject-url" type="text" spellcheck="false" placeholder="https://.../index.m3u8">' +
            '<div class="m3u8-inject-sniff" hidden>' +
            '<div class="m3u8-inject-sniff-head"><span class="lbl">' + TEXT.detected + '</span>' +
            '<button type="button" class="m3u8-inject-link m3u8-inject-rescan">' + TEXT.rescan + '</button></div>' +
            '<div class="m3u8-inject-chips"></div>' +
            '</div></div>' +
            '<div class="m3u8-inject-row m3u8-inject-qrow" hidden>' +
            '<label class="m3u8-inject-label">' + TEXT.qualityLabel + '</label>' +
            '<select class="m3u8-inject-select m3u8-inject-quality"></select>' +
            '</div>' +
            '<div class="m3u8-inject-grid">' +
            '<div class="m3u8-inject-row">' +
            '<label class="m3u8-inject-label">' + TEXT.nameLabel + '</label>' +
            '<input class="m3u8-inject-input m3u8-inject-name" type="text" spellcheck="false" placeholder="video">' +
            '</div>' +
            '<div class="m3u8-inject-row">' +
            '<label class="m3u8-inject-label">' + TEXT.concurrencyLabel + '</label>' +
            '<select class="m3u8-inject-select m3u8-inject-conc">' +
            '<option value="2">2</option><option value="4">4</option><option value="6" selected>6</option>' +
            '<option value="8">8</option><option value="12">12</option>' +
            '</select></div></div>' +
            '<div class="m3u8-inject-row">' +
            '<label class="m3u8-inject-label">' + TEXT.formatLabel + '</label>' +
            '<div class="m3u8-inject-formats">' +
            '<span class="m3u8-inject-fmt m3u8-inject-fmt-ts" data-fmt="ts" role="button" tabindex="0">TS</span>' +
            '<span class="m3u8-inject-fmt on m3u8-inject-fmt-mp4" data-fmt="mp4" role="button" tabindex="0">MP4</span>' +
            '</div></div>' +
            '<div class="m3u8-inject-note" hidden></div>' +
            '<button class="m3u8-inject-btn m3u8-inject-start" type="button">' + TEXT.start + '</button>' +
            '<div class="m3u8-inject-progress"><div class="bar"></div></div>' +
            '<div class="m3u8-inject-foot">' +
            '<span class="m3u8-inject-count"></span>' +
            '<span class="m3u8-inject-status">' + TEXT.ready + '</span>' +
            '</div></div>';
        document.body.appendChild(panel);

        state.prefs = loadPrefs();
        applyStoredPosition(panel);

        var refs = state.refs;
        refs.panel = panel;
        refs.head = panel.querySelector('.m3u8-inject-head');
        refs.title = panel.querySelector('.m3u8-inject-head .t');
        refs.url = panel.querySelector('.m3u8-inject-url');
        refs.name = panel.querySelector('.m3u8-inject-name');
        refs.qualityRow = panel.querySelector('.m3u8-inject-qrow');
        refs.quality = panel.querySelector('.m3u8-inject-quality');
        refs.conc = panel.querySelector('.m3u8-inject-conc');
        refs.sniff = panel.querySelector('.m3u8-inject-sniff');
        refs.chips = panel.querySelector('.m3u8-inject-chips');
        refs.note = panel.querySelector('.m3u8-inject-note');
        refs.bar = panel.querySelector('.m3u8-inject-progress .bar');
        refs.count = panel.querySelector('.m3u8-inject-count');
        refs.status = panel.querySelector('.m3u8-inject-status');
        refs.start = panel.querySelector('.m3u8-inject-start');
        refs.fmtTs = panel.querySelector('.m3u8-inject-fmt-ts');
        refs.fmtMp4 = panel.querySelector('.m3u8-inject-fmt-mp4');

        refs.title.textContent = TEXT.title;
        state.panel = panel;

        // 恢复偏好
        if (state.prefs.format === 'ts' || state.prefs.format === 'mp4') state.format = state.prefs.format;
        if (state.prefs.concurrency) {
            var concValue = String(state.prefs.concurrency);
            if (refs.conc.querySelector('option[value="' + concValue + '"]')) refs.conc.value = concValue;
        }
        syncFormatButtons();

        // 交互
        panel.querySelector('.m3u8-inject-x').addEventListener('click', function () {
            panel.style.display = 'none';
        });
        var minBtn = panel.querySelector('.m3u8-inject-min');
        minBtn.addEventListener('click', function () {
            panel.classList.toggle('collapsed');
            minBtn.textContent = panel.classList.contains('collapsed') ? '+' : '–';
        });

        refs.fmtTs.addEventListener('click', function () { selectFormat('ts'); });
        refs.fmtMp4.addEventListener('click', function () { selectFormat('mp4'); });
        refs.url.addEventListener('input', function () {
            resetQuality();
            scheduleProbe();
            syncFilenamePlaceholder();
        });
        refs.url.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                handlePrimaryAction();
            }
        });
        refs.start.addEventListener('click', handlePrimaryAction);
        refs.conc.addEventListener('change', function () {
            savePrefs({ concurrency: Number(refs.conc.value) || 6 });
        });
        refs.quality.addEventListener('change', function () {
            state.selectedVariantUrl = refs.quality.value;
            refreshVariantSummary();
        });
        panel.querySelector('.m3u8-inject-rescan').addEventListener('click', function () {
            scanPageForM3u8();
            renderCandidates();
        });

        installDrag(panel, refs.head);

        var seed = '';
        try { seed = String(window.__M3U8_SEED_URL__ || '').trim(); } catch (e) { seed = ''; }
        if (seed) {
            refs.url.value = seed;
            state.autoFilled = true;
        }

        scanPageForM3u8();
        renderCandidates();
        maybeAutoFill(true);
        syncFilenamePlaceholder();
        if (refs.url.value.trim()) scheduleProbe(true);
    }

    function applyStoredPosition(panel) {
        var pos = state.prefs && state.prefs.pos;
        if (!pos || !Number.isFinite(pos.left) || !Number.isFinite(pos.top)) return;
        var maxLeft = Math.max(8, window.innerWidth - 120);
        var maxTop = Math.max(8, window.innerHeight - 60);
        panel.style.left = Math.min(Math.max(8, pos.left), maxLeft) + 'px';
        panel.style.top = Math.min(Math.max(8, pos.top), maxTop) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    }

    function installDrag(panel, head) {
        var drag = null;
        head.addEventListener('pointerdown', function (event) {
            if (event.target && event.target.classList && event.target.classList.contains('m3u8-inject-ic')) return;
            var rect = panel.getBoundingClientRect();
            drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
            event.preventDefault();
        });
        document.addEventListener('pointermove', function (event) {
            if (!drag) return;
            var left = drag.left + event.clientX - drag.x;
            var top = drag.top + event.clientY - drag.y;
            var maxLeft = window.innerWidth - 80;
            var maxTop = window.innerHeight - 40;
            left = Math.min(Math.max(-panel.offsetWidth + 100, left), maxLeft);
            top = Math.min(Math.max(0, top), maxTop);
            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
        });
        function endDrag() {
            if (!drag) return;
            drag = null;
            var rect = panel.getBoundingClientRect();
            savePrefs({ pos: { left: Math.round(rect.left), top: Math.round(rect.top) } });
        }
        document.addEventListener('pointerup', endDrag);
        document.addEventListener('pointercancel', endDrag);
    }

    function syncFormatButtons() {
        var refs = state.refs;
        if (!refs.fmtTs) return;
        refs.fmtTs.classList.toggle('on', state.format === 'ts');
        refs.fmtMp4.classList.toggle('on', state.format === 'mp4');
    }

    function selectFormat(format) {
        if (format === 'ts' && state.playlist && state.playlist.container === 'fmp4') {
            setNote(TEXT.fmp4Note);
            return;
        }
        state.format = format;
        syncFormatButtons();
        savePrefs({ format: format });
    }

    function setStatus(message, isError) {
        if (!state.refs.status) return;
        state.refs.status.textContent = message || '';
        state.refs.status.className = 'm3u8-inject-status' + (isError ? ' err' : '');
    }

    function setNote(message) {
        var note = state.refs.note;
        if (!note) return;
        if (!message) {
            note.hidden = true;
            note.textContent = '';
            return;
        }
        note.hidden = false;
        note.textContent = message;
    }

    function setCount(text) {
        if (state.refs.count) state.refs.count.textContent = text || '';
    }

    function setProgress(ratio) {
        if (!state.refs.bar) return;
        var pct = Math.max(0, Math.min(1, ratio || 0));
        state.refs.bar.style.width = (pct * 100).toFixed(1) + '%';
    }

    function setBusy(busy) {
        var refs = state.refs;
        if (!refs.start) return;
        refs.start.textContent = busy ? TEXT.cancel : TEXT.start;
        refs.start.classList.toggle('stop', busy);
        refs.url.disabled = busy;
        refs.name.disabled = busy;
        refs.quality.disabled = busy;
        refs.conc.disabled = busy;
    }

    function syncFilenamePlaceholder() {
        var refs = state.refs;
        if (!refs.name || !refs.url) return;
        var base = refs.url.value.trim() ? fileBaseFromUrl(refs.url.value.trim()) : 'video';
        refs.name.placeholder = base;
        if (!refs.name.value) state.lastFileBase = base;
    }

    function renderCandidates() {
        var refs = state.refs;
        if (!refs.chips) return;
        var hasAny = state.candidates.length > 0;
        refs.sniff.hidden = false;
        refs.chips.innerHTML = '';
        if (!hasAny) {
            var empty = document.createElement('div');
            empty.className = 'm3u8-inject-empty';
            empty.textContent = TEXT.emptyDetected;
            refs.chips.appendChild(empty);
            return;
        }
        state.candidates.slice(0, 6).forEach(function (url) {
            var chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'm3u8-inject-chip' + (refs.url && refs.url.value.trim() === url ? ' on' : '');
            chip.title = url;
            var label = document.createElement('span');
            label.className = 'p';
            label.textContent = shortUrl(url, 46);
            chip.appendChild(label);
            chip.addEventListener('click', function () {
                refs.url.value = url;
                resetQuality();
                syncFilenamePlaceholder();
                renderCandidates();
                scheduleProbe(true);
            });
            refs.chips.appendChild(chip);
        });
    }

    function maybeAutoFill(force) {
        var refs = state.refs;
        if (!refs.url) return;
        if (refs.url.value.trim()) return;
        if (!state.candidates.length) return;
        if (state.autoFilled && !force) return;
        state.autoFilled = true;
        refs.url.value = state.candidates[0];
        syncFilenamePlaceholder();
        setStatus(TEXT.autoFilled);
        scheduleProbe(true);
    }

    function resetQuality() {
        state.variants = [];
        state.playlist = null;
        state.probedUrl = '';
        state.selectedVariantUrl = '';
        if (!state.refs.qualityRow) return;
        state.refs.qualityRow.hidden = true;
        state.refs.quality.innerHTML = '';
        state.refs.fmtTs.classList.remove('off');
        setNote('');
    }

    function findVariant(url) {
        for (var i = 0; i < state.variants.length; i++) {
            if (state.variants[i].url === url) return state.variants[i];
        }
        return null;
    }

    function variantLabel(variant, index) {
        var parts = [];
        if (variant.resolution) parts.push(variant.resolution.replace('x', '×'));
        else if (variant.name) parts.push(variant.name);
        else parts.push('#' + (index + 1));
        if (variant.bandwidth) parts.push((variant.bandwidth / 1000).toFixed(0) + ' kbps');
        if (variant.frameRate) parts.push(Math.round(Number(variant.frameRate)) + 'fps');
        return parts.join(' · ');
    }

    function renderQualityOptions(variants, preferredUrl) {
        var refs = state.refs;
        state.variants = variants.slice();
        if (!refs.qualityRow) return;
        refs.quality.innerHTML = '';
        var sorted = variants.slice().sort(function (a, b) { return b.bandwidth - a.bandwidth; });
        sorted.forEach(function (variant) {
            var option = document.createElement('option');
            option.value = variant.url;
            option.textContent = variantLabel(variant, variants.indexOf(variant));
            refs.quality.appendChild(option);
        });
        var preferred = preferredUrl && variants.some(function (variant) { return variant.url === preferredUrl; })
            ? preferredUrl
            : (sorted[0] ? sorted[0].url : '');
        if (preferred) refs.quality.value = preferred;
        state.selectedVariantUrl = preferred;
        refs.qualityRow.hidden = variants.length === 0;
    }

    function renderPlaylistSummary(playlist) {
        var refs = state.refs;
        if (!playlist || playlist.type !== 'media') return;
        var count = playlist.segments.length;
        var duration = totalDuration(playlist.segments);
        var summary = TEXT.probingHint + count + TEXT.summarySegments;
        if (duration > 0) summary += ' · ' + TEXT.summaryDuration + fmtDuration(duration);
        setStatus(summary);
        if (playlist.container === 'fmp4') {
            setNote(TEXT.fmp4Note);
            state.refs.fmtTs.classList.add('off');
            if (state.format === 'ts') {
                state.format = 'mp4';
                syncFormatButtons();
            }
        } else {
            state.refs.fmtTs.classList.remove('off');
            setNote(playlist.isLive ? TEXT.liveNote : '');
        }
    }

    // ---------- 走查解析（不下载） ----------
    function scheduleProbe(immediate) {
        clearTimeout(state.probeTimer);
        if (state.running) return;
        state.probeTimer = setTimeout(function () { probePlaylist(); }, immediate ? 0 : 600);
    }

    async function probePlaylist() {
        var refs = state.refs;
        var url = normalizeInputUrl(refs.url.value);
        if (!url || url === state.probedUrl) return;
        if (state.probeController) state.probeController.abort();
        var controller = new AbortController();
        state.probeController = controller;
        state.probedUrl = url;
        setStatus(TEXT.probing);
        try {
            var text = await fetchPlaylist(url, { signal: controller.signal });
            if (controller.signal.aborted) return;
            var playlist = parsePlaylist(text, url);
            if (playlist.error) {
                setStatus(playlist.error, true);
                state.probedUrl = '';
                return;
            }
            if (playlist.type === 'master') {
                renderQualityOptions(playlist.variants, state.selectedVariantUrl);
                var variant = findVariant(state.selectedVariantUrl);
                if (variant) {
                    var mediaText = await fetchPlaylist(variant.url, { signal: controller.signal });
                    if (controller.signal.aborted) return;
                    var media = parsePlaylist(mediaText, variant.url);
                    if (media.error) {
                        setStatus(media.error, true);
                        return;
                    }
                    state.playlist = media;
                    renderPlaylistSummary(media);
                }
            } else {
                state.variants = [];
                state.selectedVariantUrl = '';
                refs.qualityRow.hidden = true;
                state.playlist = playlist;
                renderPlaylistSummary(playlist);
            }
        } catch (error) {
            if (isAbortError(error)) return;
            state.probedUrl = '';
            setStatus(TEXT.probeFailed + (error && error.message ? error.message : error), true);
        }
    }

    async function refreshVariantSummary() {
        if (state.running) return;
        var variant = findVariant(state.selectedVariantUrl);
        if (!variant || !variant.url) return;
        if (state.probeController) state.probeController.abort();
        var controller = new AbortController();
        state.probeController = controller;
        setStatus(TEXT.probing);
        try {
            var text = await fetchPlaylist(variant.url, { signal: controller.signal });
            if (controller.signal.aborted) return;
            var media = parsePlaylist(text, variant.url);
            if (media.error) {
                setStatus(media.error, true);
                return;
            }
            state.playlist = media;
            renderPlaylistSummary(media);
        } catch (error) {
            if (isAbortError(error)) return;
            setStatus(TEXT.probeFailed + (error && error.message ? error.message : error), true);
        }
    }

    // ---------- 下载主流程 ----------
    function handlePrimaryAction() {
        if (state.running) {
            if (state.controller) state.controller.abort();
            setStatus(TEXT.canceled);
            return;
        }
        startDownload();
    }

    async function startDownload() {
        var refs = state.refs;
        var inputUrl = normalizeInputUrl(refs.url.value);
        if (!inputUrl) {
            setStatus(TEXT.needUrl, true);
            refs.url.focus();
            return;
        }

        var controller = new AbortController();
        state.controller = controller;
        state.running = true;
        setBusy(true);
        setProgress(0);
        setCount('');
        setStatus(TEXT.parsing);
        setNote('');

        var startedAt = Date.now();
        var totalBytes = 0;
        var doneCount = 0;
        var failCount = 0;
        var totalCount = 0;
        var keyCache = new Map();

        function renderStats() {
            if (!totalCount) return;
            setCount(doneCount + '/' + totalCount);
            var elapsed = (Date.now() - startedAt) / 1000;
            var speed = elapsed > 0.6 ? totalBytes / elapsed : 0;
            var parts = [fmtBytes(totalBytes)];
            var speedText = fmtSpeed(speed);
            if (speedText) parts.push(speedText);
            if (speed > 0 && doneCount > 0 && doneCount < totalCount) {
                var remainBytes = (totalBytes / doneCount) * (totalCount - doneCount);
                parts.push('~' + fmtDuration(remainBytes / speed));
            }
            if (failCount) parts.push(failCount + ' ✕');
            setStatus(parts.join(' · '));
        }

        try {
            var playlistText = await fetchPlaylist(inputUrl, { signal: controller.signal });
            var playlist = parsePlaylist(playlistText, inputUrl);
            if (playlist.error) throw new Error(playlist.error);

            var mediaUrl = inputUrl;
            if (playlist.type === 'master') {
                renderQualityOptions(playlist.variants, state.selectedVariantUrl);
                var variant = findVariant(state.selectedVariantUrl) || playlist.variants.slice().sort(function (a, b) {
                    return b.bandwidth - a.bandwidth;
                })[0];
                if (!variant) throw new Error(TEXT.noVariant);
                var audioRendition = playlist.renditions.filter(function (rendition) {
                    return rendition.type === 'AUDIO' && rendition.groupId === variant.audioGroupId && rendition.uri;
                })[0];
                if (audioRendition) throw new Error(TEXT.audioGroup);
                mediaUrl = variant.url;
                var mediaText = await fetchPlaylist(mediaUrl, { signal: controller.signal });
                playlist = parsePlaylist(mediaText, mediaUrl);
                if (playlist.error) throw new Error(playlist.error);
                if (playlist.type === 'master') throw new Error(TEXT.noSegments);
            }
            if (controller.signal.aborted) throw abortError();

            var segments = playlist.segments.filter(function (segment) { return segment && segment.url; });
            if (!segments.length) throw new Error(TEXT.noSegments);
            totalCount = segments.length;
            state.playlist = playlist;
            renderPlaylistSummary(playlist);

            var isFmp4 = playlist.container === 'fmp4';
            var outputFormat = isFmp4 ? 'mp4' : state.format;
            if (isFmp4 && state.format === 'ts') {
                state.format = 'mp4';
                syncFormatButtons();
            }

            setStatus(TEXT.parsing);
            var initCache = isFmp4
                ? await loadInitSegments(segments, { signal: controller.signal, keyCache: keyCache })
                : new Map();
            if (controller.signal.aborted) throw abortError();

            setProgress(0);
            renderStats();

            var outcome = await downloadSegments(segments, {
                signal: controller.signal,
                concurrency: Number(refs.conc.value) || 6,
                keyCache: keyCache,
                onSegment: function (index, bytes, isFailed) {
                    if (isFailed) failCount += 1;
                    else { doneCount += 1; totalBytes += bytes; }
                    setProgress((doneCount + failCount) / segments.length);
                    renderStats();
                },
                onRetry: function (attempt, attempts) {
                    var last = state.refs.status ? state.refs.status.textContent : '';
                    setStatus(TEXT.retrying + attempt + '/' + attempts + (last ? ' · ' + last : ''));
                }
            });

            if (controller.signal.aborted) throw abortError();

            var parts = outcome.results;
            var validCount = parts.filter(function (part) { return part && part.length; }).length;
            if (!validCount) throw new Error(TEXT.downloadFailed);

            setStatus(TEXT.merging);
            var filenameBase = sanitizeFilename(refs.name.value) || state.lastFileBase || fileBaseFromUrl(mediaUrl);

            var output;
            if (isFmp4) {
                output = assembleFmp4(parts, segments, initCache);
                triggerDownload(new Blob(output, { type: 'video/mp4' }), filenameBase + '.mp4');
            } else if (outputFormat === 'mp4') {
                output = await transmuxToMp4(parts.filter(function (part) { return part && part.length; }));
                triggerDownload(new Blob(output, { type: 'video/mp4' }), filenameBase + '.mp4');
            } else {
                output = parts.filter(function (part) { return part && part.length; });
                triggerDownload(new Blob(output, { type: 'video/mp2t' }), filenameBase + '.ts');
            }

            setProgress(1);
            var sizeText = fmtBytes(totalBytes);
            var summary = TEXT.done + filenameBase + '.' + (isFmp4 || outputFormat === 'mp4' ? 'mp4' : 'ts') + ' (' + sizeText + ')';
            if (failCount > 0) summary += ' · ' + TEXT.partial + failCount + TEXT.partialUnit;
            setStatus(summary, failCount > 0);
            setCount(doneCount + '/' + totalCount);
        } catch (error) {
            if (isAbortError(error)) {
                setStatus(TEXT.canceled);
            } else {
                setStatus(TEXT.failed + (error && error.message ? error.message : error), true);
            }
        } finally {
            state.controller = null;
            state.running = false;
            setBusy(false);
        }
    }

    // ---------- 启动 ----------
    function boot() {
        installNetworkSniffer();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createUI);
        } else {
            createUI();
        }
        window.__m3u8InjectV2Show__ = function () {
            if (state.panel) {
                state.panel.style.display = '';
                state.panel.classList.remove('collapsed');
            } else {
                createUI();
            }
            scanPageForM3u8();
        };
    }

    boot();
})();
