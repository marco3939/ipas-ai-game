// 09-errorreports-export-filename.test.js — ErrorReports.export 檔名 & 內容
const { makeSandbox, loadStorage, loadWrongbook, loadErrorReports, makeAssert } = require('./_helpers');
const vm = require('vm');

console.log('=== ErrorReports.export filename tests ===');
const A = makeAssert();

// 自訂 sandbox:抓 Blob content / a.download / a.click()
function setup() {
  const sb = makeSandbox();
  loadStorage(sb);
  loadWrongbook(sb);
  // 替換 Blob constructor 以抓 content
  const blobs = [];
  sb.Blob = function (parts, opts) {
    blobs.push({ parts, opts, content: (parts && parts.join) ? parts.join('') : String(parts) });
    return { _isBlob: true };
  };
  const urlCalls = [];
  sb.URL = {
    createObjectURL: (b) => { urlCalls.push(b); return 'blob:fake-' + urlCalls.length; },
    revokeObjectURL: () => {},
  };
  const anchorsCreated = [];
  // 把 createElement override 改成捕 a tag 的 download/href
  const origCreate = sb.document.createElement;
  sb.document.createElement = (tag) => {
    const e = origCreate.call(sb.document, tag);
    if (tag === 'a') {
      anchorsCreated.push(e);
      const desc = {};
      Object.defineProperty(e, 'download', {
        get() { return desc.download; }, set(v) { desc.download = v; }, configurable: true
      });
      Object.defineProperty(e, 'href', {
        get() { return desc.href; }, set(v) { desc.href = v; }, configurable: true
      });
    }
    return e;
  };
  const ER = loadErrorReports(sb);
  return { sb, ER, blobs, anchors: anchorsCreated };
}

// ----- 1. 空 export -----
console.log('\n[1] empty export still produces blob');
{
  const { sb, ER, blobs, anchors } = setup();
  ER.export();
  A.eq(blobs.length, 1, '1 blob created');
  A.eq(anchors.length, 1, '1 anchor created');
  A.ok(anchors[0].download.startsWith('ipas-error-reports-'),
    `filename starts with ipas-error-reports- (got "${anchors[0].download}")`);
  A.ok(anchors[0].download.endsWith('.json'), 'ends with .json');
}

// ----- 2. 檔名格式 ISO timestamp 化(冒號 / 點變 -)-----
console.log('\n[2] filename uses ISO timestamp with - separators');
{
  const { sb, ER, anchors } = setup();
  ER.export();
  const fn = anchors[0].download;
  // 不能含 : 或 . (除了 .json)
  const beforeJson = fn.replace(/\.json$/, '');
  A.ok(!beforeJson.includes(':'), `no colon in filename: "${fn}"`);
  A.ok(!beforeJson.includes('..'), 'no consecutive dots');
}

// ----- 3. 內容含 version / generated_at / device_info / reports -----
console.log('\n[3] export content shape');
{
  const { sb, ER, blobs } = setup();
  ER.add('q1', ['wrong_answer'], 'note1');
  ER.export();
  const data = JSON.parse(blobs[0].content);
  A.eq(data.version, '1.0', 'version=1.0');
  A.ok(typeof data.generated_at === 'number', 'generated_at present');
  A.ok(data.device_info, 'device_info present');
  A.eq(data.device_info.ua, 'test', 'device_info.ua');
  A.eq(data.device_info.lang, 'en', 'device_info.lang');
  A.eq(data.reports.length, 1, '1 report');
  A.eq(data.reports[0].qid, 'q1', 'q1 in export');
}

// ----- 4. 攻擊:qid 含路徑分隔符 / 控制字元(看 export 是否安全)-----
console.log('\n[4] attack: qid with path traversal chars');
{
  const { sb, ER, blobs, anchors } = setup();
  // export 檔名是 ts-based(不含 user qid),所以 qid 不會出現在 filename
  // 我們驗證:即使 qid='../../etc/passwd',filename 不包含這個 string
  ER.add('../../etc/passwd', ['wrong_answer'], 'pwn');
  ER.export();
  A.ok(!anchors[0].download.includes('etc/passwd'),
    `filename safe from qid injection: "${anchors[0].download}"`);
  A.ok(!anchors[0].download.includes('..'),
    'no parent-dir escape in filename');
  A.ok(!anchors[0].download.includes('/'),
    'no slash in filename');
  // qid 仍在內容中(這是 by design — 內容是 JSON 字串)
  const data = JSON.parse(blobs[0].content);
  A.eq(data.reports[0].qid, '../../etc/passwd', 'qid preserved in JSON body');
}

// ----- 5. 攻擊:qid 含 null byte -----
console.log('\n[5] attack: qid with null byte');
{
  const { sb, ER, blobs } = setup();
  ER.add('q\0null', ['wrong_answer'], 'n');
  A.nothrow(() => ER.export(), 'null byte qid: export no throw');
  const data = JSON.parse(blobs[0].content);
  A.eq(data.reports[0].qid, 'q\0null', 'null byte preserved in JSON');
}

// ----- 6. 多筆 reports 全 export -----
console.log('\n[6] export many reports');
{
  const { sb, ER, blobs } = setup();
  for (let i = 0; i < 50; i++) ER.add(`q_${i}`, ['wrong_answer'], `note ${i}`);
  ER.export();
  const data = JSON.parse(blobs[0].content);
  A.eq(data.reports.length, 50, '50 reports in export');
}

// ----- 7. export toast 訊息 -----
console.log('\n[7] export toast message');
{
  const { sb, ER } = setup();
  ER.add('q1', ['wrong_answer'], 'n');
  ER.export();
  const toasts = sb.__toasts;
  A.ok(toasts.some(t => t.includes('已匯出')), `toast shown: ${JSON.stringify(toasts)}`);
}

// ----- 8. JSON 內含 unicode / emoji 安全保留 -----
console.log('\n[8] unicode/emoji preserved');
{
  const { sb, ER, blobs } = setup();
  ER.add('q1', ['wrong_answer'], '備註中文 😈');
  ER.export();
  const data = JSON.parse(blobs[0].content);
  A.eq(data.reports[0].note, '備註中文 😈', 'unicode + emoji preserved');
}

// ----- 9. export 不應修改 reports state -----
console.log('\n[9] export does NOT mutate reports state');
{
  const { sb, ER, blobs } = setup();
  ER.add('q1', ['wrong_answer'], 'n');
  const before = JSON.stringify(ER.load());
  ER.export();
  const after = JSON.stringify(ER.load());
  A.eq(before, after, 'reports state unchanged after export');
}

// ----- 10. JSON 內容格式 indented (2 spaces) -----
console.log('\n[10] JSON indented for readability');
{
  const { sb, ER, blobs } = setup();
  ER.add('q1', ['wrong_answer'], 'n');
  ER.export();
  // JSON.stringify(data, null, 2) → 換行 + 縮排
  A.ok(blobs[0].content.includes('\n'), 'JSON output has newlines');
  A.ok(blobs[0].content.includes('  '), 'JSON indented with spaces');
}

process.exit(A.summary('ErrorReports.export'));
