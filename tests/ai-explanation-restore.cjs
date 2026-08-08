const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.MTI_BASE_URL || 'http://127.0.0.1:4173/';

const supabaseMock = `
(function () {
  window.__sbExplanationReads = [];
  function decodeCardId(id) {
    var prefix = 'ganlin770_expcard_';
    if (String(id).indexOf(prefix) !== 0) return '';
    try { return decodeURIComponent(String(id).slice(prefix.length).replace(/~/g, '%')); }
    catch (_) { return ''; }
  }
  function Builder(table) {
    this.table = table;
    this.eqValue = '';
    this.likeValue = '';
  }
  Builder.prototype.select = function () { return this; };
  Builder.prototype.eq = function (_column, value) { this.eqValue = value; return this; };
  Builder.prototype.like = function (_column, value) { this.likeValue = value; return this; };
  Builder.prototype.order = function () {
    window.__sbExplanationReads.push({ kind: 'followup', value: this.likeValue });
    return Promise.resolve({ data: [], error: null });
  };
  Builder.prototype.maybeSingle = function () {
    if (this.eqValue === 'ganlin770_exp') return Promise.resolve({ data: null, error: null });
    var cardKey = decodeCardId(this.eqValue);
    window.__sbExplanationReads.push({ kind: 'main', value: this.eqValue, cardKey: cardKey });
    if (!cardKey) return Promise.resolve({ data: null, error: null });
    return Promise.resolve({
      data: {
        payload: {
          v: 3,
          kind: 'main',
          card_key: cardKey,
          record: {
            x: '云端永久讲解已恢复：' + cardKey,
            t: 1786100000000,
            u: 1786100000000,
            m: 'deepseek-v4-flash',
            e: 'max'
          }
        }
      },
      error: null
    });
  };
  Builder.prototype.upsert = function (rows) { return Promise.resolve({ data: rows, error: null }); };
  window.supabase = {
    createClient: function () {
      return { from: function (table) { return new Builder(table); } };
    }
  };
})();
`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  const origin = new URL(base).origin;
  const pageErrors = [];
  const aiRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2')) {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: supabaseMock });
      return;
    }
    if (url.includes('/v1/chat/completions')) {
      aiRequests.push(request.postDataJSON());
      await route.abort();
      return;
    }
    if (new URL(url).origin !== origin) {
      await route.abort();
      return;
    }
    await route.continue();
  });

  try {
    await page.addInitScript(() => localStorage.clear());
    const url = new URL(base);
    url.searchParams.set('__explanation_restore', String(Date.now()));
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => openQuiz('词条', 'new', 2));

    const panel = page.locator('#aiQuizPanel');
    await panel.locator('text=云端永久讲解已恢复').waitFor();
    const firstKey = await panel.getAttribute('data-ai-card-key');
    assert.ok(firstKey, 'initial quiz card was not bound to the explanation panel');
    assert.match(await panel.innerText(), /已永久保存到云端/);
    assert.match(await page.locator('#aiQuizBtn').innerText(), /查看讲解（已保存）/);

    await page.locator('#qnext').click();
    await page.waitForFunction((oldKey) => {
      const panel = document.getElementById('aiQuizPanel');
      return panel && panel.getAttribute('data-ai-card-key') && panel.getAttribute('data-ai-card-key') !== oldKey;
    }, firstKey);
    const secondKey = await panel.getAttribute('data-ai-card-key');
    await page.waitForFunction((key) => document.getElementById('aiQuizBody')?.textContent.includes('云端永久讲解已恢复：' + key), secondKey);

    const state = await page.evaluate(([first, second]) => {
      const rows = JSON.parse(localStorage.getItem('mti_ai_explain') || '{}');
      return {
        first: rows[first],
        second: rows[second],
        reads: window.__sbExplanationReads
      };
    }, [firstKey, secondKey]);
    assert.equal(state.first.c, 1);
    assert.equal(state.second.c, 1);
    assert.ok(state.reads.filter((row) => row.kind === 'main').length >= 2);
    assert.equal(aiRequests.length, 0, 'restoring saved explanations unexpectedly started a new AI request');
    assert.deepEqual(pageErrors, []);
    console.log('PASS saved AI explanations hydrate from Supabase on quiz open and card switch without regeneration');
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
