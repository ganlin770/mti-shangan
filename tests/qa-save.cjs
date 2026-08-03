const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.MTI_BASE_URL || 'http://127.0.0.1:4173/';

const supabaseMock = `
window.__sbCreates = [];
window.__sbUpserts = [];
window.supabase = {
  createClient: function (url, key, options) {
    window.__sbCreates.push({ url: url, keyKind: String(key).indexOf('sb_publishable_') === 0 ? 'publishable' : 'other', options: options });
    return {
      from: function (table) {
        var builder = {
          select: function () { return builder; },
          eq: function () { return builder; },
          like: function () { return builder; },
          order: function () { return builder; },
          range: function () { return Promise.resolve({ data: [], error: null }); },
          maybeSingle: function () { return Promise.resolve({ data: null, error: null }); },
          upsert: function (rows) {
            window.__sbUpserts.push({ table: table, rows: JSON.parse(JSON.stringify(Array.isArray(rows) ? rows : [rows])) });
            return Promise.resolve({ data: rows, error: null });
          }
        };
        return builder;
      }
    };
  }
};
`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const origin = new URL(base).origin;
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2')) {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: supabaseMock });
      return;
    }
    if (new URL(url).origin !== origin) {
      await route.abort();
      return;
    }
    await route.continue();
  });

  try {
    const url = new URL(base);
    url.searchParams.set('__qa_save', String(Date.now()));
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });

    const client = await page.evaluate(() => window.__sbCreates[0]);
    assert.equal(client.keyKind, 'publishable');
    assert.deepEqual(client.options.auth, {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    });

    const result = await page.evaluate(() => {
      window.__qaCloudCallback = null;
      const saved = window.__qaSavePut(
        'ci|qa-save-regression',
        '追问保存路径正常吗？',
        '正常，本机和云端都应保留。',
        { model: 'gpt-5.6-luna', effort: 'max' },
        '已有主讲解',
        (ok) => { window.__qaCloudCallback = ok; }
      );
      return saved;
    });
    assert.equal(result.ok, true);
    assert.equal(result.local, true);
    assert.equal(result.cloud, true);

    await page.waitForFunction(() => window.__qaCloudCallback === true);
    const savedState = await page.evaluate(() => {
      const local = JSON.parse(localStorage.getItem('mti_ai_explain') || '{}');
      return {
        local: local['ci|qa-save-regression'],
        batches: window.__sbUpserts
      };
    });
    assert.equal(savedState.local.qa.length, 1);
    assert.equal(savedState.local.qa[0].q, '追问保存路径正常吗？');
    assert.equal(savedState.local.qa[0].m, 'gpt-5.6-luna');
    assert.equal(savedState.local.qa[0].e, 'max');
    assert.equal(savedState.batches.length, 1);
    assert.equal(savedState.batches[0].table, 'progress');
    assert.equal(savedState.batches[0].rows.length, 2);
    assert.ok(savedState.batches[0].rows.some((row) => row.payload.kind === 'followup'));
    assert.ok(savedState.batches[0].rows.some((row) => row.payload.kind === 'main'));
    const followup = savedState.batches[0].rows.find((row) => row.payload.kind === 'followup');
    assert.equal(followup.payload.qa.m, 'gpt-5.6-luna');
    assert.equal(followup.payload.qa.e, 'max');

    const otherSaves = await page.evaluate(() => {
      const route = { model: 'deepseek-v4-flash', effort: 'max', label: 'DeepSeek V4 Flash · Max' };
      const mainOk = window.__qaMainSavePut('ci|main-save-regression', '主讲解保存模型测试', route);
      const judge = window.__qaJudgeSavePut(
        { key: 'v|judge-save-regression', kind: 'vocab', q: 'regression', sig: 'sig-v1' },
        '作答',
        '【判定】✓ 得分\n\n批改保存模型测试',
        true,
        route,
        'cache-max'
      );
      const explanations = JSON.parse(localStorage.getItem('mti_ai_explain') || '{}');
      const judgments = JSON.parse(localStorage.getItem('mti_ai_judge_v1') || '{}');
      return { mainOk, main: explanations['ci|main-save-regression'], judge, judgment: judgments['v|judge-save-regression'] };
    });
    assert.equal(otherSaves.mainOk, true);
    assert.equal(otherSaves.main.m, 'deepseek-v4-flash');
    assert.equal(otherSaves.main.e, 'max');
    assert.equal(otherSaves.judgment.m, 'deepseek-v4-flash');
    assert.equal(otherSaves.judgment.e, 'max');

    await page.reload({ waitUntil: 'domcontentloaded' });
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('mti_ai_explain') || '{}')['ci|qa-save-regression']);
    assert.equal(restored.qa.length, 1);
    assert.equal(restored.qa[0].a, '正常，本机和云端都应保留。');

    const migration = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '20260801073000_allow_ai_followup_progress_roles.sql'),
      'utf8'
    );
    assert.match(migration, /to anon, authenticated/i);
    assert.match(migration, /grant select, insert, update on table public\.progress to anon, authenticated/i);
    assert.deepEqual(pageErrors, []);
    console.log('PASS AI follow-up saves locally, queues granular cloud rows, survives reload, and disables inherited auth sessions');
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
