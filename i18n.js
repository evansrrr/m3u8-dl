/*
 * i18n runtime.
 *
 * Language follows the system/browser language: any zh-* tag renders the
 * original Chinese copy, every other language falls back to English.
 *
 * The app keeps Chinese as the source language in markup and scripts. This
 * module translates rendered text nodes and a small set of attributes on the
 * fly, so newly inserted UI (toasts, task rows, modal content) is localized
 * without touching every template. Exact matches come from the EN dictionary;
 * interpolated strings are handled by RULES.
 */
(function (global) {
    'use strict';

    var CJK_PATTERN = /[\u4e00-\u9fa5]/;

    function resolveLanguage() {
        var navigatorRef = global.navigator || {};
        var candidates = [];
        if (Array.isArray(navigatorRef.languages)) candidates = navigatorRef.languages.slice();
        if (navigatorRef.language) candidates.push(navigatorRef.language);
        if (navigatorRef.userLanguage) candidates.push(navigatorRef.userLanguage);
        for (var i = 0; i < candidates.length; i += 1) {
            var tag = String(candidates[i] || '').trim();
            if (!tag) continue;
            // First usable tag wins: Chinese keeps Chinese, everything else is English.
            return /^zh(\b|-|_)/i.test(tag) ? 'zh' : 'en';
        }
        return 'en';
    }

    var language = resolveLanguage();

    // Chinese source string -> English copy.
    var EN = {
        'M3U8下载': 'M3U8 Downloader',
        'M3U8下载是纯浏览器 HLS 下载与播放工具，支持 m3u8 在线预览、AES-128 解密、TS/MP4 保存、范围下载、跨域注入下载和页面内任务控制。': 'M3U8 Downloader is a browser-only HLS downloader and player with m3u8 preview, AES-128 decryption, TS/MP4 saving, range downloads, cross-origin injection and in-page task control.',
        '纯浏览器 m3u8 / HLS 下载与播放工具，支持在线预览、AES-128、TS 保存、范围下载和页面内任务控制。': 'Browser-only m3u8 / HLS downloader and player with preview, AES-128, TS saving, range downloads and in-page task control.',
        '纯浏览器 m3u8 / HLS 下载与播放工具，支持在线播放、分片下载、解密、保存和恢复。': 'Browser-only m3u8 / HLS downloader and player with playback, segment downloads, decryption, saving and resume.',
        '© 2026 M3U8下载. All rights reserved.': '© 2026 M3U8 Downloader. All rights reserved.',

        /* Header, hero, task list */
        '返回首页': 'Back to home',
        '设置': 'Settings',
        '帮助': 'Help',
        '打开旧版': 'Open legacy version',
        '在新标签页打开旧版': 'Open the legacy version in a new tab',
        '新建下载': 'New download',
        '新建下载 / 粘贴链接': 'New download / paste a link',
        '当前任务': 'Tasks',
        '全选': 'Select all',
        '开始': 'Start',
        '暂停': 'Pause',
        '删除': 'Delete',
        '任务筛选': 'Filter tasks',
        '全部状态': 'All statuses',
        '下载中': 'Downloading',
        '已暂停': 'Paused',
        '下载失败': 'Download failed',
        '已完成': 'Completed',
        '可继续': 'Recoverable',
        '已选 0 项': '0 selected',
        '没有符合筛选条件的任务': 'No tasks match the current filter',

        /* New download modal */
        '新建下载任务': 'New download task',
        'm3u8 地址': 'm3u8 URL',
        '请输入 m3u8 地址': 'Enter an m3u8 URL',
        '源站禁止跨域？': 'Source site blocking cross-origin requests?',
        '复制跨域代码': 'Copy cross-origin code',
        '，粘贴到视频源站 F12 控制台执行后即可下载。': ', paste it into the source site console (F12) and run it to download.',
        '保存标题': 'Title',
        '可选：自定义标题': 'Optional custom title',
        '下载范围': 'Download range',
        '全部下载': 'Download all',
        '指定区间': 'Custom range',
        '保存格式': 'Format',
        '保存模式': 'Save mode',
        '边下边存': 'Streaming save',
        '开启后会在下载过程中直接写入文件，显著降低页面内存占用。TS 直接追加，MP4 逐段转封装为分片结构写入；浏览器不支持时会自动降级为普通缓存。': 'Writes straight to disk while downloading, which sharply lowers page memory use. TS is appended directly; MP4 is remuxed segment by segment into a fragmented file. Falls back to regular caching when unsupported.',
        '并发数': 'Concurrency',
        '取消': 'Cancel',
        '预览': 'Preview',
        '开始下载': 'Start download',

        /* Download options modal */
        '下载选项': 'Download options',
        '关闭清晰度选择': 'Close quality selection',
        '分辨率': 'Resolution',
        '音轨': 'Audio',
        '字幕': 'Subtitles',
        '暂无可选清晰度，请返回检查播放列表内容。': 'No selectable quality. Go back and check the playlist.',
        '下载清晰度列表': 'Download quality list',
        '默认清晰度': 'Default quality',
        '等待加载码率、分辨率与分段信息': 'Waiting for bitrate, resolution and segment info',
        '推荐': 'Recommended',
        '下载音轨列表': 'Download audio list',
        '下载字幕列表': 'Download subtitle list',
        '已选择外部音轨或字幕，将分别保存多个文件；浏览器可能会请求权限，请选择允许多个文件下载。直接打开视频可能无声，需要手动加载音轨或合并后播放。': 'An external audio track or subtitles are selected, so several files will be saved. The browser may ask for permission: allow multiple downloads. The video may play without sound until the track is loaded or merged.',
        '确认下载': 'Confirm download',
        '不下载外部音轨': 'No external audio',
        '仅保存所选视频分辨率，可能得到无声视频': 'Saves only the selected video quality; the result may have no audio',
        '不下载字幕': 'No subtitles',
        '仅保存视频和已选音轨': 'Saves only the video and the selected audio track',
        '默认': 'Default',

        /* Range modal */
        '确认下载范围': 'Confirm download range',
        '关闭下载范围确认': 'Close range confirmation',
        '范围下载': 'Range download',
        '当前媒体共': 'This media has',
        '个视频碎片，请确认实际下载区间。': 'video segments. Confirm the range to download.',
        '起始片号': 'Start segment',
        '结束片号': 'End segment',
        '例如 1': 'e.g. 1',
        '例如 120': 'e.g. 120',
        '可输入 `1` 到总片数之间的片号，确认后仅下载该区间内的碎片。': 'Enter segment numbers between 1 and the total; only that range is downloaded.',
        '预计下载': 'Planned',
        '个碎片': 'segments',
        '请输入有效的下载范围': 'Enter a valid download range',
        '确认范围': 'Confirm range',

        /* Force merge modal */
        '强制合并': 'Force merge',
        '关闭强制合并': 'Close force merge',
        '部分导出': 'Partial export',
        '连续合并': 'Continuous merge',
        '将只使用当前已下载成功的视频碎片。': 'Only the video segments that already downloaded will be used.',
        '强制合并方式': 'Force merge mode',
        '从当前范围起点开始，只导出连续成功的碎片。': 'Exports only the consecutive successful segments starting at the range start.',
        '只会导出从当前范围起点开始连续成功的碎片。': 'Only consecutive successful segments from the range start are exported.',
        '开始合并': 'Start merge',
        '连续可导出': 'Continuous exportable',
        '选择合并方式': 'Choose merge mode',

        /* Confirm delete */
        '确认删除': 'Confirm delete',
        '关闭删除确认': 'Close delete confirmation',
        '确认删除所选任务？': 'Delete the selected tasks?',
        '删除后不会保留任务记录，正在进行的请求会被立即中止。': 'Task records are discarded and running requests are aborted immediately.',
        '删除后不会保留任务记录。': 'Task records are discarded.',
        '删除后不会保留任务记录，此操作不可撤销。': 'Task records are discarded. This cannot be undone.',
        '批量删除任务': 'Delete multiple tasks',

        /* Preview */
        '视频预览': 'Video preview',
        '关闭预览': 'Close preview',
        '准备预览...': 'Preparing preview...',
        '预览选项': 'Preview options',
        '预览清晰度列表': 'Preview quality list',
        '预览字幕列表': 'Preview subtitle list',
        '预览时不显示字幕': 'No subtitles in preview',
        '关闭字幕': 'Turn subtitles off',
        '正在加载预览...': 'Loading preview...',
        '正在解析预览地址...': 'Resolving preview source...',
        '已准备好预览，请点击播放器开始播放。': 'Preview ready. Press play to start.',
        '预览失败': 'Preview failed',
        '预览播放失败，请检查源站访问限制或编码兼容性。': 'Preview playback failed. Check the source site restrictions or codec support.',
        '当前浏览器不支持 m3u8 预览。': 'This browser cannot preview m3u8.',

        /* Task details */
        '任务详情': 'Task details',
        '任务分片': 'Task segments',
        '碎片总量': 'Total segments',
        '已下载碎片': 'Downloaded segments',
        '错误数量': 'Errors',
        '当前阶段': 'Current stage',
        '时长': 'Duration',
        '当前速度': 'Speed',
        '已下载大小': 'Downloaded size',
        '预计剩余': 'Remaining',
        '轨道进度': 'Track progress',
        '诊断信息': 'Diagnostics',
        '错误类型': 'Error type',
        '错误原因': 'Error cause',
        '建议处理': 'Suggested fix',
        '恢复状态': 'Resume state',
        '写入模式': 'Write mode',
        '加密方式': 'Encryption',
        '播放列表': 'Playlist',
        '实际范围': 'Actual range',
        '已选清晰度': 'Selected quality',
        '碎片状态图例': 'Segment status legend',
        '未命名任务': 'Untitled task',
        '未知': 'Unknown',
        '无': 'None',
        '全部': 'All',
        '未选择': 'Not set',
        '待识别': 'Detecting',
        '待确认': 'Pending',
        '待选清晰度': 'Choose quality',
        '待确认范围': 'Confirm range',
        '待选择保存位置': 'Choose save location',
        '准备中': 'Preparing',
        '排队中': 'Queued',
        '识别中': 'Detecting',
        '解析中': 'Parsing',
        '解析中...': 'Parsing...',
        '导出中': 'Exporting',
        '部分完成': 'Partially completed',
        '可继续恢复': 'Can resume',
        '下载成功': 'Downloaded',
        '未下载': 'Not downloaded',
        '重试中': 'Retrying',
        '失败': 'Failed',
        '已取消': 'Canceled',
        '链接解析失败': 'Link parsing failed',
        '链接已复制': 'Link copied',
        '操作失败': 'Action failed',
        '操作未完成，请稍后重试': 'Action incomplete. Try again later.',
        '设置已保存': 'Saved',
        '无加密': 'None',
        '无恢复请求': 'No resume request',
        '恢复单个分片': 'Resume segment',
        '恢复全部未完成分片': 'Resume all unfinished segments',
        '强制合并已开始导出': 'Force merge export started',
        '已加入重新下载队列': 'Added to the re-download queue',
        '重新下载': 'Re-download',
        '重新保存': 'Save again',
        '播放': 'Play',
        '选择清晰度': 'Choose quality',
        '选择保存位置': 'Choose save location',
        '继续': 'Resume',
        '关闭': 'Close',
        '保存': 'Save',
        '保存失败': 'Save failed',
        '下载失败（点击可重试）': 'Download failed (click to retry)',
        '下载失败：': 'Download failed: ',
        '出错：': 'Error: ',
        '完成：': 'Done: ',
        '下载分片': 'Downloading segments',
        '合并文件...': 'Merging files...',
        '正在生成文件': 'Generating file',
        '生成视频文件中': 'Generating video file',
        '下载字幕中': 'Downloading subtitles',
        '下载音轨中': 'Downloading audio',
        '保存字幕中': 'Saving subtitles',
        '保存音轨中': 'Saving audio',
        '正在保存外部音轨/字幕…': 'Saving external audio/subtitles...',
        '字幕加载中...': 'Loading subtitles...',
        '字幕已触发保存': 'Subtitle save started',
        '音轨已触发保存': 'Audio save started',
        '视频已触发保存': 'Video save started',
        '视频已完成': 'Video completed',
        '已触发保存': 'Save started',
        '已重新触发保存': 'Save restarted',
        '已取消文件保存': 'File save canceled',
        '已降级': 'Downgraded',
        '字幕格式暂不支持': 'Subtitle format not supported',
        '当前字幕格式暂不支持。': 'This subtitle format is not supported yet.',
        '当前字幕不是可直接合并保存的 WebVTT 字幕。': 'These subtitles are not WebVTT, so they cannot be merged and saved directly.',
        '可先保存视频和音轨，字幕文件需要换用 WebVTT 来源。': 'Save the video and audio first; use a WebVTT source for subtitles.',
        '音轨或字幕分别保存失败': 'Audio or subtitle saves failed',
        '强制字幕': 'Forced subtitles',
        '音频描述': 'Audio description',
        'AC-3（兼容性有限）': 'AC-3 (limited support)',
        'E-AC-3（兼容性有限）': 'E-AC-3 (limited support)',
        'Atmos（兼容性有限）': 'Atmos (limited support)',
        'MPEG-TS 视频': 'MPEG-TS video',
        '片段': 'segment',

        /* Status and errors */
        '地址不可识别': 'Unrecognized URL',
        '地址不可识别或不是 m3u8 资源': 'Unrecognized URL or not an m3u8 resource',
        '当前 m3u8 类型不支持': 'This m3u8 type is not supported',
        '当前 master playlist 没有可用清晰度': 'No usable quality in this master playlist',
        '未在 master playlist 中找到可用清晰度': 'No usable quality found in the master playlist',
        '当前链接没有可用清晰度': 'This link has no usable quality',
        '当前链接包含多个清晰度，需要先选择后再创建任务。': 'This link offers several qualities. Pick one before creating the task.',
        'master playlist 需要先选择清晰度后再创建任务': 'Select a quality in the master playlist before creating the task',
        '需要选择清晰度': 'Quality selection required',
        '请选择一个清晰度后继续下载。': 'Select a quality to continue.',
        '分辨率选择': 'Resolution selection',
        '选择清晰度：': 'Selected quality: ',
        '当前浏览器不支持 AES-128 解密': 'This browser cannot decrypt AES-128',
        '缺少 AES 密钥': 'AES key missing',
        '密钥下载失败': 'Key download failed',
        '请确认密钥地址可以访问；如果源站限制密钥请求，当前纯静态模式无法解密。': 'Check that the key URL is reachable. If the source site restricts key requests, this static mode cannot decrypt.',
        '请确认浏览器支持 AES-128 解密，并检查密钥地址、IV 或源文件是否完整。': 'Check AES-128 support in the browser and verify the key URL, IV and source file.',
        'AES-128 加密的 fMP4 初始化片段缺少 IV，无法安全解密。': 'The AES-128 fMP4 init segment has no IV, so it cannot be decrypted safely.',
        'AES-128 密钥长度异常：': 'Unexpected AES-128 key length: ',
        '分片解密失败': 'Segment decryption failed',
        '分片下载失败': 'Segment download failed',
        '分片下载失败：字节范围信息无效': 'Segment download failed: invalid byte-range info',
        '分片下载失败：缺少下载地址': 'Segment download failed: missing download URL',
        '分片响应长度超过服务器声明值。': 'The segment response is longer than the server declared.',
        'HTTP 分片被浏览器拦截': 'HTTP segments blocked by the browser',
        '源播放列表包含 HTTP 分片，HTTPS 页面无法直接请求这些不安全资源。': 'The playlist uses HTTP segments; an HTTPS page cannot request those insecure resources.',
        '请使用 HTTPS 分片地址；若源站同域支持 HTTPS，系统会自动尝试升级为 HTTPS。': 'Use HTTPS segment URLs. If the source domain supports HTTPS, it is upgraded automatically.',
        '源站不支持 Range 请求': 'The source does not support Range requests',
        '源站不支持 Range 请求，无法下载字节范围 HLS。': 'The source does not support Range requests, so byte-range HLS cannot be downloaded.',
        '该 fMP4 播放列表需要按字节范围下载，但源站没有按浏览器请求返回局部内容。': 'This fMP4 playlist needs byte-range requests, but the source did not return partial content.',
        '请更换支持 Range 请求的源，或使用普通 TS 格式的 m3u8。': 'Use a source that supports Range requests, or a plain TS m3u8.',
        '字节范围信息不完整，无法解析该 fMP4 播放列表。': 'Byte-range info is incomplete, so this fMP4 playlist cannot be parsed.',
        'fMP4 初始化片段缺失': 'fMP4 init segment missing',
        'fMP4 初始化片段缺失，无法导出。': 'The fMP4 init segment is missing, so export is impossible.',
        'fMP4 媒体片段缺失，无法导出。': 'fMP4 media segments are missing, so export is impossible.',
        '当前 fMP4 输出缺少初始化片段，无法生成可播放 MP4。': 'This fMP4 output has no init segment, so a playable MP4 cannot be produced.',
        '当前 fMP4 音视频合成暂不支持，已分别保存；直接打开视频可能无声，需要手动加载音轨或合并后播放。': 'fMP4 audio/video muxing is not supported yet, so the files were saved separately. The video may play silently until the audio is loaded or merged.',
        '请重新下载该任务，或检查源播放列表中的 #EXT-X-MAP。': 'Re-download the task, or check #EXT-X-MAP in the source playlist.',
        'MP4 不兼容，建议改用 TS': 'MP4 is not compatible here, use TS',
        'MP4 转封装失败，请改用 TS': 'MP4 remux failed, use TS instead',
        '当前内容可能不适合导出为 MP4，建议改用 TS 保存。': 'This content may not fit MP4. Save as TS instead.',
        'MP4 输出通过 mux.js 将普通 TS 分片转封装；遇到不兼容编码时请改用 TS。': 'MP4 output remuxes standard TS segments with mux.js. Switch to TS if the codec is unsupported.',
        'mux.js 加载失败': 'Failed to load mux.js',
        'mux.js 加载失败（请确认工具已部署）': 'Failed to load mux.js (make sure the tool is deployed)',
        '当前任务缺少可保存数据，请重新下载': 'This task has no savable data. Download it again.',
        '当前没有可导出内容': 'Nothing to export',
        '内存分片不完整，请重新下载缺失内容。': 'Cached segments are incomplete. Re-download the missing ones.',
        '部分已成功分片缓存缺失，本次仅导出仍可用的内容': 'Some downloaded segments are no longer cached; only usable content is exported',
        '只会导出连续成功的片段；若片段过少或起点不含关键帧，仍可能无法播放。': 'Only consecutive successful segments are exported. Too few segments or a missing keyframe at the start may still break playback.',
        '连续片段暂不具备可播放结构，建议继续下载更多连续碎片后再合并。': 'These consecutive segments are not playable yet. Download more before merging.',
        '已暂停任务，可选择强制合并范围': 'Task paused. You can now choose the force merge range.',
        '边下边存模式无法强制合并': 'Force merge is unavailable in streaming save mode',
        '原生边下边存：分片会直接写入文件，强制合并不可用。': 'Native streaming save: segments go straight to disk, so force merge is unavailable.',
        'StreamSaver 边下边存：分片会通过兼容方案直接写入文件，强制合并不可用。': 'StreamSaver streaming save: segments are written to disk through a fallback path, so force merge is unavailable.',
        '普通缓存': 'Regular cache',
        '普通缓存下载：分片会先缓存到本地，完成后再保存。': 'Regular cache: segments are cached locally, then saved when finished.',
        '边下边存：正在等待下载开始后确认实际写入方式。': 'Streaming save: the actual write mode is confirmed once the download starts.',
        'fMP4 将先缓存后保存，暂不使用边下边存。': 'fMP4 is cached first, so streaming save is not used.',
        '已选择外部音轨或字幕，本次将分别缓存后保存；直接打开视频可能无声。': 'An external audio track or subtitles are selected, so files are cached and saved separately. The video may play silently.',
        '已降级为普通缓存下载：当前浏览器不支持边下边存，完成后会按普通方式保存。': 'Downgraded to regular caching: this browser cannot stream to disk, so the file is saved normally when done.',
        '当前浏览器不支持边下边存，已改为普通缓存下载': 'This browser cannot stream to disk, switched to regular caching',
        '未获得保存权限，请重新选择保存位置': 'Save permission denied. Choose the location again.',
        '无法选择保存位置，请重试': 'Cannot choose a save location. Try again.',
        '无法共享保存位置，请在下载执行页重新选择': 'The save location cannot be shared. Pick it again on the download page.',
        '此浏览器无法共享保存位置，请在支持文件选择的下载页重试': 'This browser cannot share the save location. Retry on a page that supports file picking.',
        '请重新选择保存位置': 'Choose the save location again',
        '请重新选择保存位置，或改用普通缓存下载后再保存。': 'Choose the save location again, or use regular caching and save afterwards.',
        '如需继续，请重新选择保存位置。': 'Choose the save location again to continue.',
        '文件分片未完整写入，请重新选择保存位置后继续': 'The segment file was not fully written. Choose the save location again to continue.',
        '已写入的外部文件可能不完整，网页无法替你删除，请自行检查保存位置。': 'The external file may be incomplete. The page cannot delete it, so check the save location yourself.',
        '请检查浏览器存储空间，或在缓存管理中清理无效缓存后重试。': 'Check browser storage, or clear invalid caches and try again.',
        '请点击继续重新下载未完成分片；如果缓存已清空，已完成但缺少数据的分片也需要重新获取。': 'Press resume to re-download unfinished segments. If the cache was cleared, finished segments without data are fetched again.',
        '恢复信息不完整': 'Resume info incomplete',
        '恢复信息不完整，请重新下载未完成内容': 'Resume info is incomplete. Re-download the unfinished content.',
        '本地缓存异常': 'Local cache error',
        '）。刷新或关闭页面会丢失未完成任务；大文件建议开启边下边存。': '). Refreshing or closing the page loses unfinished tasks; use streaming save for large files.',
        '项': 'items',
        '源站限制': 'Source restricted',
        '源站限制，当前纯静态模式无法下载': 'The source is restricted, so static mode cannot download',
        '先暂停再强制合并': 'Pause first, then force merge',
        '请确认粘贴的是 HLS 播放列表地址，而不是网页地址或普通视频文件地址。': 'Paste an HLS playlist URL, not a web page or a plain video file.',
        '请确认该链接在当前浏览器能直接访问；若源站禁止跨域，可点击“跨域下载”复制代码到源站控制台执行。': 'Check that this link opens in the browser. If the source blocks cross-origin requests, copy the cross-origin code and run it in the source console.',
        '请确认该链接在当前浏览器能直接访问；若源站需要 Cookie、Referer 或禁止跨域，可点击“跨域下载”复制代码到源站控制台执行。': 'Check that this link opens in the browser. If the source needs cookies or a Referer, or blocks cross-origin requests, copy the cross-origin code and run it in the source console.',
        '请稍后重试，或检查链接、网络和浏览器兼容性。': 'Try again later, or check the link, network and browser compatibility.',
        '可稍后继续下载或点击失败分片重试；若多次失败，通常是源站临时不可用或限制访问。': 'Resume later or click a failed segment to retry. Repeated failures usually mean the source is temporarily unavailable or restricted.',
        '该碎片缺少下载地址，无法重试。': 'This segment has no download URL, so it cannot be retried.',
        '当前仅支持普通 HLS 与 AES-128，加密方式或媒体结构不兼容时建议更换源地址。': 'Only plain HLS and AES-128 are supported; switch source if the encryption or media structure differs.',
        '请输入有效的起始片号和结束片号。': 'Enter a valid start and end segment.',
        '起始片号必须大于或等于 1。': 'The start segment must be 1 or greater.',
        '结束片号不能小于起始片号。': 'The end segment cannot be smaller than the start segment.',
        '跨域代码已复制，请到视频源站 F12 控制台粘贴执行': 'Cross-origin code copied. Paste it into the source site console (F12) and run it.',
        '复制失败，请在控制台查看代码后手动复制': 'Copy failed. Read the code in the console and copy it manually.',
        '所选视频、音轨和字幕无法组成同一 HLS 组合，请重新选择。': 'The selected video, audio and subtitles cannot form one HLS combination. Choose again.',
        '未解析到视频分片（若为 fMP4/Byte Range 请改用主工具页的 TS/MP4 下载）': 'No video segments found (for fMP4/byte-range, use TS/MP4 on the main page)',

        /* Help */
        '这里汇总常用下载流程和任务操作。所有下载都在本地浏览器中完成；遇到源站禁止跨域时，可使用“复制跨域代码”注入源站同源上下文下载。': 'Common download flows and task actions. Everything runs in the local browser; when a source blocks cross-origin requests, copy the cross-origin code to run the download in the source origin context.',
        '复制 m3u8 链接后回到本页会自动填入新建下载；首次使用需允许读取剪贴板，也可随时手动粘贴。以本地文件（file://）打开时浏览器无法记住该授权，此时请手动粘贴，或通过本地 HTTP 服务访问。': 'Copy an m3u8 link and return to this page: the new download form is filled in automatically after you allow clipboard access once. Pages opened from disk (file://) cannot keep that permission, so paste manually there or serve the folder over HTTP.',
        '快速开始': 'Quick start',
        '点击“新建下载”，粘贴 m3u8 地址。': 'Click "New download" and paste the m3u8 URL.',
        '按需填写保存标题、下载范围和分片并发数；默认保存为 MP4，也可切换为 TS。': 'Optionally set a title, download range and segment concurrency. MP4 is the default; TS is also available.',
        '点击“开始下载”，如存在多个清晰度，先选择分辨率。': 'Click "Start download"; if several qualities exist, pick a resolution first.',
        '下载完成后，浏览器会保存对应的视频文件。': 'When the download finishes, the browser saves the video file.',
        '任务操作': 'Task actions',
        '下载按钮用于开始或重新下载可恢复任务。': 'The download button starts or re-downloads a recoverable task.',
        '任务只保存在当前页面内存，并按创建顺序逐个执行；新标签页不会共享任务。': 'Tasks live in this page only and run one by one in creation order; new tabs do not share them.',
        '刷新或关闭页面会丢失未完成任务，离开前浏览器会请求确认。': 'Refreshing or closing the page discards unfinished tasks; the browser asks for confirmation first.',
        '暂停会中止当前网络请求，再次点击可继续未完成分片。': 'Pausing aborts the current request; press again to resume unfinished segments.',
        '播放可打开预览窗口，删除会先弹出确认。': 'Play opens the preview window; delete asks for confirmation.',
        '勾选任务后，可使用顶部批量开始、暂停、删除。': 'Select tasks to start, pause or delete them in bulk from the toolbar.',
        '高级能力': 'Advanced',
        '范围下载会在解析出真实分片后确认起止片号。': 'Range download asks for start and end segments once the real segments are parsed.',
        '普通下载分片保存在当前页面内存；占用较高时只提示一次，不会自动暂停。': 'Regular downloads cache segments in page memory; a high-usage warning shows once and never pauses automatically.',
        'fMP4、Byte Range、外部音轨/字幕和边下边存均已作为常规能力提供。': 'fMP4, byte range, external audio/subtitles and streaming save are all available as regular features.',
        '强制合并只导出从范围起点开始连续成功的本地分片。': 'Force merge exports only consecutive successful local segments from the range start.',
        '点击任务进度条可查看分片状态，失败分片可点击重试。': 'Click the task progress bar to inspect segment states; click a failed segment to retry.',
        '源站禁止跨域时：点击“复制跨域代码”→ 在视频源站按 F12 打开控制台 → 粘贴执行 → 注入面板会自动填入页面最近的 m3u8 请求，支持清晰度选择、分片重试、fMP4 拼接与边下边存。': 'When a source blocks cross-origin requests: click "Copy cross-origin code", open the source site console with F12, paste and run it; the injected panel auto-fills the most recent m3u8 request and supports quality selection, retries, fMP4 concatenation and streaming straight to disk.',
        'MP4 逐片输出为 moof+mdat 分片，播放器拖动进度条时可按片定位，比整段大分片更流畅。': 'MP4 is written as per-segment moof+mdat fragments, so players can seek by fragment instead of scanning one huge chunk.',
        '任务进度条右侧显示已下载大小与预计剩余时间，窄屏会隐藏剩余时间。': 'The task progress bar shows downloaded size and estimated time left; the ETA is hidden on narrow screens.',
        '快捷下载 URL 参数': 'Quick download URL parameters',
        '：m3u8 地址，推荐 URL 编码。': ': m3u8 URL, URL-encoding recommended.',
        '：预填保存标题。': ': prefill the save title.',
        '，默认': ', default',
        '：分片并发数，范围 1-8。': ': segment concurrency, 1-8.',
        '：从 source 内部移除指定参数。': ': strip the given parameters from source.',
        '快捷下载示例': 'Quick download example',
        '示例：': 'Example: ',
        '联系与反馈': 'Contact and feedback',
        '如果遇到无法下载、解析异常或界面问题，可以通过以下方式反馈。': 'If downloads fail, parsing misbehaves or the UI looks wrong, reach us through:',

        /* Injection panel (mirrored so pages that reuse app copy stay consistent) */
        'M3U8 注入下载': 'M3U8 injected download',
        '就绪': 'Ready',
        '取消下载': 'Cancel download',

        '保存标题模板': 'Title template',
        '默认并发数': 'Default concurrency',
        '作为默认偏好，新建任务时会自动带入；TS 与 MP4 均支持，浏览器不支持时会自动降级。': 'Used as the default for new tasks. Works for both TS and MP4, and falls back automatically when unsupported.',
        'MP4 视频': 'MP4 video',
        'MPEG-TS 视频': 'MPEG-TS video',
        '关闭帮助': 'Close help',
        '删除任务': 'Delete task',
        '导出失败': 'Export failed',
        '等待中': 'Waiting',
        '视频': 'Video',
        '个碎片，已下载': ' segments, downloaded',
        '个，约': ' segments, approx.',
        '只导出连续成功的片段；若片段过少或起点不含关键帧，仍可能无法播放。': 'Only consecutive successful segments are exported. Too few segments or a missing keyframe at the start may still break playback.',
        '字幕下载失败：HTTP': 'Subtitle download failed: HTTP ',
        '解析播放列表...': 'Parsing playlist...',
        '或': 'or',

        /* Clipboard watcher */
        '已从剪贴板填入 m3u8 链接': 'm3u8 link detected in the clipboard',
        '允许读取剪贴板以自动填入 m3u8 链接': 'Allow clipboard access to auto-fill m3u8 links',
        '剪贴板权限被拒绝，可随时手动粘贴链接': 'Clipboard access denied. You can still paste links manually.',
        '当前页面不是安全上下文，无法读取剪贴板': 'Clipboard access needs a secure context'
    };

    var TRACK_LABELS = {
            '视频': 'Video',
            '音轨': 'Audio',
            '字幕': 'Subtitles'
    };

    var ACTION_WORDS = {
            '暂停': 'Pause',
            '继续': 'Resume',
            '播放': 'Play',
            '删除': 'Delete',
            '强制合并': 'Force merge',
            '选择': 'Select',
            '重新下载': 'Re-download',
            '重新保存': 'Re-save',
            '查看': 'View'
    };

    // Stand-alone punctuation nodes appear when a sentence is split by inline tags.
    var PUNCTUATION = {
        '：': ': ',
        '。': '.',
        '，': ', ',
        '、': ', ',
        '；': '; ',
        '？': '?',
        '！': '!'
    };

    function tr(text) {
        return translateString(text, true);
    }

    function trackLabel(track) {
        return TRACK_LABELS[track] || track;
    }

    var RULES = [
        [/^已选 (\d+) 项$/, function (m) { return m[1] + ' selected'; }],
        [/^排队中 · 第 (\d+) 个$/, function (m) { return 'Queued · position ' + m[1]; }],
        [/^范围 (\d+)-(\d+) \/ (\d+) 片$/, function (m) { return 'Range ' + m[1] + '-' + m[2] + ' / ' + m[3] + ' segments'; }],
        [/^范围 (\d+)-(\d+)$/, function (m) { return 'Range ' + m[1] + '-' + m[2]; }],
        [/^全部 (\d+) 片$/, function (m) { return 'All ' + m[1] + ' segments'; }],
        [/^已下载 (\d+) \/ 共 (\d+) 片$/, function (m) { return m[1] + ' of ' + m[2] + ' segments'; }],
        [/^(\d+) \/ 原始 (\d+)$/, function (m) { return m[1] + ' / original ' + m[2]; }],
        [/^恢复第 (\d+) 片$/, function (m) { return 'Resume segment ' + m[1]; }],
        [/^已重试第 (\d+) 片$/, function (m) { return 'Retried segment ' + m[1]; }],
        [/^第 (\d+) 片重试失败$/, function (m) { return 'Segment ' + m[1] + ' retry failed'; }],
        [/^第 (\d+) 片 · (.+)$/, function (m) { return 'Segment ' + m[1] + ' · ' + tr(m[2]); }],
        [/^碎片 (\d+)，状态：(.*)$/, function (m) { return 'Segment ' + m[1] + ', status: ' + tr(m[2]); }],
        [/^(\d+) 秒$/, function (m) { return m[1] + ' s'; }],
        [/^清晰度 (\d+)$/, function (m) { return 'Quality ' + m[1]; }],
        [/^确认删除任务“(.*)”？$/, function (m) { return 'Delete task "' + m[1] + '"?'; }],
        [/^确认删除选中的 (\d+) 个任务？$/, function (m) { return 'Delete ' + m[1] + ' selected tasks?'; }],
        [/^其中 (\d+) 个任务正在进行中，确认后会立即中止相关请求。$/, function (m) { return m[1] + ' of them are running; confirming aborts their requests immediately.'; }],
        [/^结束片号不能大于总片数 (\d+)。$/, function (m) { return 'The end segment cannot exceed the total of ' + m[1] + '.'; }],
        [/^连续内容过短，建议继续下载到至少 (.+?) 后再合并。?$/, function (m) { return 'Continuous content is too short. Download at least ' + tr(m[1]) + ' more before merging.'; }],
        [/^剩余 (.+)$/, function (m) { return 'Remaining ' + tr(m[1]); }],
        [/^已下载大小 (.+)$/, function (m) { return 'Downloaded ' + tr(m[1]); }],
        [/^查看任务 (.+) 的视频碎片详情$/, function (m) { return 'View segment details for task ' + m[1]; }],
        [/^复制任务链接：(.*)$/, function (m) { return 'Copy task link: ' + m[1]; }],
        [/^查看错误：(.*)，(.*)$/, function (m) { return 'View error: ' + tr(m[1]) + ', ' + tr(m[2]); }],
        [/^建议：(.*)$/, function (m) { return 'Suggestion: ' + tr(m[1]); }],
        [/^密钥下载失败：HTTP (.*)$/, function (m) { return 'Key download failed: HTTP ' + m[1]; }],
        [/^视频已触发保存，但音轨或字幕分别保存失败。(.*)$/, function (m) { return 'Video save started, but audio or subtitle saves failed. ' + tr(m[1]); }],
        [/^下载失败：(.*)$/, function (m) { return 'Download failed: ' + tr(m[1]); }],
        [/^出错：(.*)$/, function (m) { return 'Error: ' + tr(m[1]); }],
        [/^完成：(.*)$/, function (m) { return 'Done: ' + tr(m[1]); }],
        [/^下载分片 (\d+)\/(\d+)$/, function (m) { return 'Segments ' + m[1] + '/' + m[2]; }],
        [/^已选清晰度：(.*)$/, function (m) { return 'Selected quality: ' + tr(m[1]); }],
        [/^下载(视频|音轨|字幕)(.*)$/, function (m) { return 'Downloading ' + trackLabel(m[1]).toLowerCase() + m[2]; }],
        [/^生成(视频|音轨|字幕)文件$/, function (m) { return 'Generating ' + trackLabel(m[1]).toLowerCase() + ' file'; }],
        [/^准备(视频|音轨|字幕)$/, function (m) { return 'Preparing ' + trackLabel(m[1]).toLowerCase(); }],
        [/^(视频|音轨|字幕)已触发保存$/, function (m) { return trackLabel(m[1]) + ' save started'; }],
        [/^(视频|音轨|字幕)已暂停$/, function (m) { return trackLabel(m[1]) + ' paused'; }],
        [/^(视频|音轨|字幕)下载失败$/, function (m) { return trackLabel(m[1]) + ' download failed'; }],
        [/^分片下载失败：HTTP (.*)$/, function (m) { return 'Segment download failed: HTTP ' + m[1]; }],
        [/^字幕下载失败：HTTP (.*)$/, function (m) { return 'Subtitle download failed: HTTP ' + m[1]; }],
        [/^分片下载失败：(.*)$/, function (m) { return 'Segment download failed: ' + tr(m[1]); }],
        [/^AES-128 密钥长度异常：(.*)$/, function (m) { return 'Unexpected AES-128 key length: ' + m[1]; }],
        [/^当前下载已占用较多内存（约 (.+)）。(.*)$/, function (m) { return 'Downloads are using a lot of memory (about ' + m[1] + '). ' + tr(m[2]); }],
        [/^(.+?)任务 (.+)$/, function (m) {
            var word = ACTION_WORDS[m[1]];
            return word ? word + ' task ' + m[2] : '';
        }]
    ];

    var ATTRS = ['title', 'aria-label', 'placeholder', 'data-tooltip', 'alt'];
    // Dynamic labels need the pattern rules; `title`/`alt` may hold URLs or file
    // names, so they stay on the exact-match dictionary only.
    var RULE_ATTRS = {'aria-label': true, 'data-tooltip': true};
    var SKIP_TAGS = {
        SCRIPT: true,
        STYLE: true,
        NOSCRIPT: true,
        TEXTAREA: true,
        IFRAME: true
    };

    function translateString(value, allowRules) {
        var text = String(value == null ? '' : value);
        if (language !== 'en') return text;

        var leading = text.match(/^\s*/)[0];
        var trailing = text.match(/\s*$/)[0];
        var core = text.slice(leading.length, text.length - trailing.length);
        if (!core) return text;

        if (!CJK_PATTERN.test(core)) {
            // Punctuation-only nodes are left behind when inline tags split a sentence.
            if (!Object.prototype.hasOwnProperty.call(PUNCTUATION, core)) return text;
            return leading + PUNCTUATION[core] + trailing;
        }

        var translated = Object.prototype.hasOwnProperty.call(EN, core) ? EN[core] : '';
        if (!translated && allowRules) {
            for (var i = 0; i < RULES.length; i += 1) {
                var match = core.match(RULES[i][0]);
                if (!match) continue;
                translated = RULES[i][1](match, core);
                if (translated) break;
            }
        }
        if (!translated || translated === core) return text;
        return leading + translated + trailing;
    }

    function translateTextNode(node) {
        var next = translateString(node.nodeValue, true);
        if (next !== node.nodeValue) node.nodeValue = next;
    }

    function translateElementAttributes(element) {
        for (var i = 0; i < ATTRS.length; i += 1) {
            var name = ATTRS[i];
            if (!element.hasAttribute(name)) continue;
            var current = element.getAttribute(name);
            var next = translateString(current, RULE_ATTRS[name] === true);
            if (next !== current) element.setAttribute(name, next);
        }
    }

    function translateTree(node) {
        if (!node) return;
        if (node.nodeType === 3) {
            translateTextNode(node);
            return;
        }
        if (node.nodeType !== 1) return;
        if (node.nodeType === 1 && SKIP_TAGS[node.tagName]) return;
        if (node.hasAttribute('data-i18n-skip')) return;
        translateElementAttributes(node);
        for (var child = node.firstChild; child; child = child.nextSibling) {
            translateTree(child);
        }
    }

    var observer = null;
    function startObserver() {
        if (language !== 'en' || observer || typeof global.MutationObserver !== 'function') return;
        observer = new global.MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i += 1) {
                var mutation = mutations[i];
                if (mutation.type === 'characterData') {
                    translateTextNode(mutation.target);
                } else if (mutation.type === 'attributes') {
                    translateElementAttributes(mutation.target);
                } else {
                    for (var j = 0; j < mutation.addedNodes.length; j += 1) {
                        translateTree(mutation.addedNodes[j]);
                    }
                }
            }
        });
        observer.observe(global.document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ATTRS
        });
    }

    function apply() {
        var doc = global.document;
        if (!doc || !doc.documentElement) return;
        doc.documentElement.setAttribute('lang', language === 'zh' ? 'zh-CN' : 'en');
        if (language !== 'en') return;
        translateTree(doc.documentElement);
        startObserver();
    }

    global.i18n = {
        language: language,
        isEnglish: language === 'en',
        translate: translateString,
        apply: apply
    };

    apply();
    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', apply, { once: true });
    }
})(window);
