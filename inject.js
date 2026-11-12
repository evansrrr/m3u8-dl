// M3U8 注入下载器（跨域方案）
// 用法：在视频源站页面 F12 控制台执行注入代码（由主工具页"复制跨域代码"生成），
// 本脚本随后在源站同源上下文运行，从而绕过 CORS 限制下载 m3u8 分片。
// 自包含：不依赖主工具页面的 DOM，仅按需从 base 地址加载 mux.js 用于 MP4 转封装。
(function () {
    'use strict';

    if (window.__m3u8InjectV2Loaded__) {
        window.__m3u8InjectV2Show__ && window.__m3u8InjectV2Show__();
        return;
    }
    window.__m3u8InjectV2Loaded__ = true;

    // UI language follows the browser: Chinese stays Chinese, everything else is English.
    var TEXT = (function () {
        var tags = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
        var tag = String(tags[0] || '');
        if (/^zh(\b|-|_)/i.test(tag)) {
            return {
                title: 'M3U8 注入下载', close: '关闭', urlLabel: 'm3u8 地址', formatLabel: '保存格式',
                start: '开始下载', cancel: '取消下载', ready: '就绪', needUrl: '请输入 m3u8 地址',
                canceled: '已取消', parsing: '解析播放列表...', noVariant: '未在 master playlist 中找到可用清晰度',
                noSegments: '未解析到视频分片（若为 fMP4/Byte Range 请改用主工具页的 TS/MP4 下载）',
                missingKey: '缺少 AES 密钥', merging: '合并文件...', done: '完成：', failed: '出错：',
                muxLoad: 'mux.js 加载失败', muxLoadHint: 'mux.js 加载失败（请确认工具已部署）',
                downloadFailed: '下载失败', quality: '选择清晰度：', badKeyLength: 'AES-128 密钥长度异常：',
                mp4Failed: 'MP4 转封装失败，请改用 TS'
            };
        }
        return {
            title: 'M3U8 injected download', close: 'Close', urlLabel: 'm3u8 URL', formatLabel: 'Format',
            start: 'Start download', cancel: 'Cancel download', ready: 'Ready', needUrl: 'Enter an m3u8 URL',
            canceled: 'Canceled', parsing: 'Parsing playlist...', noVariant: 'No usable quality in this master playlist',
            noSegments: 'No video segments found (for fMP4/byte range, use TS/MP4 on the main page)',
            missingKey: 'AES key missing', merging: 'Merging files...', done: 'Done: ', failed: 'Error: ',
            muxLoad: 'Failed to load mux.js', muxLoadHint: 'Failed to load mux.js (make sure the tool is deployed)',
            downloadFailed: 'download failed', quality: 'Selected quality: ', badKeyLength: 'Unexpected AES-128 key length: ',
            mp4Failed: 'MP4 remux failed, use TS instead'
        };
    })();

    var BASE = (window.__M3U8_BASE__ || (location.origin + '/')).replace(/\/?$/, '/');

    // ---------- 工具函数 ----------
    function resolveUrl(url, base) {
        try {
            return new URL(url, base).href;
        } catch (e) {
            return url;
        }
    }

    function fmtBytes(n) {
        if (!Number.isFinite(n) || n < 0) return '0 B';
        var units = ['B', 'KB', 'MB', 'GB'];
        var i = 0;
        var v = n;
        while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
        return (i === 0 ? v : v.toFixed(1)) + ' ' + units[i];
    }

    function parseKeyValueAttrs(str) {
        // 解析类似 METHOD=AES-128,URI="xx",IV=0x... 的属性串
        var attrs = {};
        var re = /([A-Z0-9-]+)\s*=\s*(?:"([^"]*)"|([^,]*))/gi;
        var m;
        while ((m = re.exec(str)) !== null) {
            attrs[m[1]] = m[2] !== undefined ? m[2] : (m[3] || '').trim();
        }
        return attrs;
    }

    function hexToBytes(hex) {
        var s = hex.replace(/^0x/i, '');
        if (s.length % 2) s = '0' + s;
        var out = new Uint8Array(s.length / 2);
        for (var i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
        return out;
    }

    function bytesToHex(bytes) {
        var out = '';
        for (var i = 0; i < bytes.length; i++) out += ('0' + bytes[i].toString(16)).slice(-2);
        return out;
    }

    // ---------- m3u8 解析 ----------
    function parsePlaylist(text, baseUrl) {
        var lines = String(text || '').split(/\r?\n/);
        var isMaster = false;
        var variants = [];
        var segments = [];
        var key = null;
        var pendingVariant = null;
        var mediaSequence = 0;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || line[0] === '#') {
                if (line.indexOf('#EXT-X-STREAM-INF') === 0) {
                    isMaster = true;
                    var attrs = parseKeyValueAttrs(line.slice('#EXT-X-STREAM-INF'.length));
                    pendingVariant = { bandwidth: Number(attrs.BANDWIDTH) || 0, resolution: attrs.RESOLUTION || '', codecs: attrs.CODECS || '' };
                } else if (line.indexOf('#EXT-X-MEDIA-SEQUENCE') === 0) {
                    mediaSequence = Number(line.split(':')[1]) || 0;
                } else if (line.indexOf('#EXT-X-KEY') === 0) {
                    var kattrs = parseKeyValueAttrs(line.slice('#EXT-X-KEY'.length));
                    if (kattrs.METHOD && kattrs.METHOD.toUpperCase() !== 'NONE') {
                        key = {
                            method: kattrs.METHOD.toUpperCase(),
                            uri: kattrs.URI ? resolveUrl(kattrs.URI, baseUrl) : '',
                            iv: kattrs.IV ? hexToBytes(kattrs.IV) : null,
                            keyFormat: kattrs.KEYFORMAT || ''
                        };
                    } else {
                        key = null;
                    }
                } else if (line.indexOf('#EXT-X-MAP') === 0 || line.indexOf('#EXT-X-BYTERANGE') === 0) {
                    // fmp4 / byte range 不支持，标记
                    if (line.indexOf('#EXT-X-MAP') === 0) {
                        segments.push({ unsupported: 'fmp4' });
                    }
                }
                continue;
            }
            // 非注释行 = URI
            if (pendingVariant) {
                pendingVariant.url = resolveUrl(line, baseUrl);
                variants.push(pendingVariant);
                pendingVariant = null;
            } else {
                var seg = { url: resolveUrl(line, baseUrl), sequence: mediaSequence + segments.length, key: key ? { method: key.method, uri: key.uri, iv: key.iv, keyFormat: key.keyFormat } : null };
                segments.push(seg);
            }
        }

        if (isMaster && variants.length > 0) {
            return { type: 'master', variants: variants };
        }
        return { type: 'media', segments: segments, mediaSequence: mediaSequence };
    }

    // ---------- AES-128 解密 ----------
    function aesIvForSegment(seg) {
        // 未显式指定 IV 时，按 HLS 规范：IV 为 16 字节，最后 4 字节为大端序号
        var iv = new Uint8Array(16);
        var seq = seg.sequence >>> 0;
        iv[12] = (seq >>> 24) & 0xff;
        iv[13] = (seq >>> 16) & 0xff;
        iv[14] = (seq >>> 8) & 0xff;
        iv[15] = seq & 0xff;
        return iv;
    }

    async function decryptAes128(data, keyBytes, ivBytes) {
        var cryptoApi = window.crypto || window.msCrypto;
        var key = await cryptoApi.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
        var plain = await cryptoApi.subtle.decrypt({ name: 'AES-CBC', iv: ivBytes }, key, data);
        return new Uint8Array(plain);
    }

    // ---------- 下载核心 ----------
    function fetchArrayBuffer(url) {
        return fetch(url, { credentials: 'include' }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + TEXT.downloadFailed + ': ' + url);
            return res.arrayBuffer();
        });
    }

    function downloadWithConcurrency(items, worker, concurrency) {
        var index = 0;
        var cancelled = false;
        var results = new Array(items.length);
        function run() {
            if (cancelled) return Promise.resolve();
            var i = index++;
            if (i >= items.length) return Promise.resolve();
            return worker(items[i], i).then(function (r) {
                results[i] = r;
            }).then(run);
        }
        var workers = [];
        var n = Math.min(concurrency || 4, items.length || 1);
        for (var w = 0; w < n; w++) workers.push(run());
        return {
            promise: Promise.all(workers).then(function () { return results; }),
            cancel: function () { cancelled = true; }
        };
    }

    async function buildKeyCache(segments) {
        // 预取各 key，缓存 key -> bytes
        var cache = new Map();
        var keyUris = [];
        segments.forEach(function (seg) {
            if (seg && seg.key && seg.key.method === 'AES-128' && seg.key.uri && !cache.has(seg.key.uri)) {
                keyUris.push(seg.key.uri);
                cache.set(seg.key.uri, null); // 占位
            }
        });
        await Promise.all(keyUris.map(async function (uri) {
            var bytes = new Uint8Array(await fetchArrayBuffer(uri));
            if (bytes.length !== 16) throw new Error(TEXT.badKeyLength + uri);
            cache.set(uri, bytes);
        }));
        return cache;
    }

    // ---------- 注入 UI ----------
    function createUI() {
        var style = document.createElement('style');
        style.textContent = [
            '.m3u8-inject-panel{position:fixed;right:16px;bottom:16px;width:360px;max-width:calc(100vw - 32px);z-index:2147483647;',
            'background:#ffffff;color:#1a1a1a;border:1px solid #e3e3e5;border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.16);',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:13px;overflow:hidden;}',
            '.m3u8-inject-panel *{box-sizing:border-box;margin:0;padding:0;}',
            '.m3u8-inject-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#1a1a1a;color:#fff;cursor:move;user-select:none;}',
            '.m3u8-inject-head .t{font-weight:600;font-size:13px;}',
            '.m3u8-inject-head .x{cursor:pointer;opacity:.7;padding:0 4px;font-size:16px;line-height:1;}',
            '.m3u8-inject-head .x:hover{opacity:1;}',
            '.m3u8-inject-body{padding:14px;}',
            '.m3u8-inject-row{margin-bottom:10px;}',
            '.m3u8-inject-label{display:block;font-size:12px;color:#6b6b70;margin-bottom:4px;}',
            '.m3u8-inject-input{width:100%;padding:8px 10px;border:1px solid #d8d8da;border-radius:8px;font-size:13px;background:#fafafa;color:#1a1a1a;}',
            '.m3u8-inject-input:focus{outline:none;border-color:#1a1a1a;}',
            '.m3u8-inject-formats{display:flex;gap:8px;}',
            '.m3u8-inject-fmt{flex:1;text-align:center;padding:8px;border:1px solid #d8d8da;border-radius:8px;cursor:pointer;font-size:12px;color:#4a4a4f;}',
            '.m3u8-inject-fmt.on{background:#1a1a1a;color:#fff;border-color:#1a1a1a;}',
            '.m3u8-inject-btn{width:100%;padding:10px;background:#1a1a1a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;}',
            '.m3u8-inject-btn:hover{background:#2c2c2c;}',
            '.m3u8-inject-btn:disabled{background:#c7c7ca;cursor:not-allowed;}',
            '.m3u8-inject-progress{height:6px;background:#eee;border-radius:3px;overflow:hidden;margin:12px 0 6px;}',
            '.m3u8-inject-progress .bar{height:100%;background:#1a1a1a;width:0;transition:width .15s;}',
            '.m3u8-inject-status{font-size:12px;color:#6b6b70;min-height:16px;word-break:break-all;}',
            '.m3u8-inject-status.err{color:#c0392b;}'
        ].join('\n');
        document.head.appendChild(style);

        var panel = document.createElement('div');
        panel.className = 'm3u8-inject-panel';
        panel.innerHTML =
            '<div class="m3u8-inject-head"><span class="t"></span><span class="x" title="' + TEXT.close + '">×</span></div>' +
            '<div class="m3u8-inject-body">' +
            '<div class="m3u8-inject-row"><label class="m3u8-inject-label">' + TEXT.urlLabel + '</label><input class="m3u8-inject-input" type="text" placeholder="https://.../index.m3u8"></div>' +
            '<div class="m3u8-inject-row"><label class="m3u8-inject-label">' + TEXT.formatLabel + '</label><div class="m3u8-inject-formats"><span class="m3u8-inject-fmt" data-fmt="ts">TS</span><span class="m3u8-inject-fmt on" data-fmt="mp4">MP4</span></div></div>' +
            '<button class="m3u8-inject-btn">' + TEXT.start + '</button>' +
            '<div class="m3u8-inject-progress"><div class="bar"></div></div>' +
            '<div class="m3u8-inject-status">' + TEXT.ready + '</div>' +
            '</div>';
        document.body.appendChild(panel);

        panel.querySelector('.m3u8-inject-head .t').textContent = TEXT.title;
        var head = panel.querySelector('.m3u8-inject-head');
        var input = panel.querySelector('.m3u8-inject-input');
        var fmtEls = panel.querySelectorAll('.m3u8-inject-fmt');
        var btn = panel.querySelector('.m3u8-inject-btn');
        var bar = panel.querySelector('.m3u8-inject-progress .bar');
        var status = panel.querySelector('.m3u8-inject-status');
        var closeBtn = panel.querySelector('.m3u8-inject-head .x');

        var format = 'mp4';
        fmtEls.forEach(function (el) {
            el.addEventListener('click', function () {
                fmtEls.forEach(function (e) { e.classList.remove('on'); });
                el.classList.add('on');
                format = el.getAttribute('data-fmt');
            });
        });

        closeBtn.addEventListener('click', function () {
            panel.style.display = 'none';
            window.__m3u8InjectV2Loaded__ = false; // 允许再次注入
        });

        // 可拖动
        var dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
        head.addEventListener('mousedown', function (e) {
            dragging = true; sx = e.clientX; sy = e.clientY;
            var r = panel.getBoundingClientRect();
            ox = r.left; oy = r.top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', function (e) {
            if (!dragging) return;
            panel.style.right = 'auto'; panel.style.bottom = 'auto';
            panel.style.left = (ox + e.clientX - sx) + 'px';
            panel.style.top = (oy + e.clientY - sy) + 'px';
        });
        document.addEventListener('mouseup', function () { dragging = false; });

        var currentCancel = null;
        btn.addEventListener('click', function () {
            var url = input.value.trim();
            if (!url) { setStatus(TEXT.needUrl, true); return; }
            if (currentCancel) {
                // 视为取消
                currentCancel();
                currentCancel = null;
                btn.textContent = TEXT.start;
                btn.disabled = false;
                setStatus(TEXT.canceled);
                return;
            }
            startDownload(url, format);
        });

        function setStatus(msg, isErr) {
            status.textContent = msg;
            status.className = 'm3u8-inject-status' + (isErr ? ' err' : '');
        }
        function setProgress(p) {
            bar.style.width = Math.round(p * 100) + '%';
        }

        async function startDownload(url, fmt) {
            btn.textContent = TEXT.cancel;
            btn.disabled = false;
            setProgress(0);
            setStatus(TEXT.parsing);
            var cancelRequested = false;
            currentCancel = function () { cancelRequested = true; };

            try {
                var playlistText = await fetchArrayBuffer(url).then(function (ab) {
                    return new TextDecoder('utf-8').decode(ab);
                });
                if (cancelRequested) return;

                var parsed = parsePlaylist(playlistText, url);
                var segments;
                var chosenUrl = url;

                if (parsed.type === 'master') {
                    // 自动选择最高码率的 variant
                    var v = parsed.variants.slice().sort(function (a, b) { return b.bandwidth - a.bandwidth; })[0];
                    if (!v) throw new Error(TEXT.noVariant);
                    chosenUrl = v.url;
                    setStatus(TEXT.quality + (v.resolution || v.bandwidth + ' bps'));
                    var mediaText = await fetchArrayBuffer(v.url).then(function (ab) {
                        return new TextDecoder('utf-8').decode(ab);
                    });
                    if (cancelRequested) return;
                    parsed = parsePlaylist(mediaText, v.url);
                }

                segments = (parsed.segments || []).filter(function (s) { return s && s.url && !s.unsupported; });
                if (segments.length === 0) {
                    throw new Error(TEXT.noSegments);
                }

                var keyCache = await buildKeyCache(segments);
                if (cancelRequested) return;

                var completed = 0;
                var totalBytes = 0;
                setStatus('Segments 0/' + segments.length);

                var dl = downloadWithConcurrency(segments, async function (seg) {
                    if (cancelRequested) throw new Error('__cancelled__');
                    var ab = await fetchArrayBuffer(seg.url);
                    var bytes = new Uint8Array(ab);
                    if (seg.key && seg.key.method === 'AES-128') {
                        var keyBytes = keyCache.get(seg.key.uri);
                        if (!keyBytes) throw new Error(TEXT.missingKey);
                        var iv = seg.key.iv && seg.key.iv.length === 16 ? seg.key.iv : aesIvForSegment(seg);
                        bytes = await decryptAes128(bytes, keyBytes, iv);
                    }
                    totalBytes += bytes.length;
                    completed++;
                    setStatus('Segments ' + completed + '/' + segments.length + ' (' + fmtBytes(totalBytes) + ')');
                    setProgress(completed / segments.length);
                    return bytes;
                }, 6);

                var parts = await dl.promise;
                if (cancelRequested) return;

                setStatus(TEXT.merging);
                var validParts = parts.filter(function (p) { return p instanceof Uint8Array; });

                var filename = (function () {
                    try {
                        var p = new URL(chosenUrl).pathname.split('/').pop() || 'video';
                        return p.replace(/\.(m3u8|m3u)$/i, '') || 'video';
                    } catch (e) { return 'video'; }
                })();

                if (fmt === 'mp4') {
                    var blob = await transmuxToMp4(validParts);
                    triggerDownload(blob, filename + '.mp4', 'video/mp4');
                } else {
                    var tsBlob = new Blob(validParts, { type: 'video/mp2t' });
                    triggerDownload(tsBlob, filename + '.ts', 'video/mp2t');
                }
                setStatus(TEXT.done + filename + '.' + fmt + ' (' + fmtBytes(totalBytes) + ')');
                setProgress(1);
            } catch (e) {
                if (e && e.message === '__cancelled__') { setStatus(TEXT.canceled); }
                else setStatus(TEXT.failed + (e && e.message ? e.message : e), true);
            } finally {
                currentCancel = null;
                btn.textContent = TEXT.start;
                btn.disabled = false;
            }
        }

        window.__m3u8InjectV2Show__ = function () { panel.style.display = ''; };
    }

    // ---------- MP4 转封装（mux.js） ----------
    function loadMux() {
        if (window.muxjs && window.muxjs.mp4 && window.muxjs.mp4.Transmuxer) return Promise.resolve(window.muxjs);
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = BASE + 'vendor/mux.min.js';
            s.onload = function () {
                if (window.muxjs && window.muxjs.mp4 && window.muxjs.mp4.Transmuxer) resolve(window.muxjs);
                else reject(new Error(TEXT.muxLoad));
            };
            s.onerror = function () { reject(new Error(TEXT.muxLoadHint)); };
            document.head.appendChild(s);
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
        parts.forEach(function (p) { transmuxer.push(p); });
        transmuxer.flush();
        if (typeof transmuxer.dispose === 'function') transmuxer.dispose();
        if (out.length === 0) throw new Error(TEXT.mp4Failed);
        finalizeMp4Timebase(normalizer);
        return new Blob(out, { type: 'video/mp4' });
    }

    function triggerDownload(blob, filename, mime) {
        var a = document.createElement('a');
        var url = URL.createObjectURL(blob);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }

    // ---------- 启动 ----------
    function boot() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createUI);
        } else {
            createUI();
        }
    }
    boot();
})();
