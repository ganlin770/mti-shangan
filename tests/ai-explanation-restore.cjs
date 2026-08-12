const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.MTI_BASE_URL || 'http://127.0.0.1:4173/';

const supabaseMock = `
(function () {
  window.__sbExplanationReads = [];
  function scenario() {
    return new URLSearchParams(location.search).get('__exp_cloud') || 'saved';
  }
  function delay(value) {
    var wait = scenario() === 'late' ? 320 : 0;
    return new Promise(function (resolve) { setTimeout(function () { resolve(value); }, wait); });
  }
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
    if (scenario() === 'error') return delay({ data: null, error: { message: 'offline test' } });
    return delay({ data: [], error: null });
  };
  Builder.prototype.maybeSingle = function () {
    if (this.eqValue === 'ganlin770_exp') return Promise.resolve({ data: null, error: null });
    var cardKey = decodeCardId(this.eqValue);
    if (!cardKey) return Promise.resolve({ data: null, error: null });
    window.__sbExplanationReads.push({ kind: 'main', value: this.eqValue, cardKey: cardKey });
    if (scenario() === 'error') return delay({ data: null, error: { message: 'offline test' } });
    if (scenario() === 'missing') return delay({ data: null, error: null });
    return delay({
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

function savedCloudText(key) {
  return `云端永久讲解已恢复：${key}`;
}

async function openHarness(browser, options = {}) {
  const viewport = options.viewport || { width: 1440, height: 1000 };
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
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
      await new Promise((resolve) => setTimeout(resolve, 280));
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"choices":[{"delta":{"content":"后台生成完成但不得串卡"}}]}\n\ndata: [DONE]\n\n'
      });
      return;
    }
    if (new URL(url).origin !== origin) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.addInitScript(({ withAiKey }) => {
    localStorage.clear();
    if (withAiKey) {
      localStorage.setItem('mti_ai_v1', JSON.stringify({
        url: 'https://ganlin-ai-token-gateway.ganlin-ai-gateway.workers.dev',
        key: 'test-only-key'
      }));
    }
  }, { withAiKey: !!options.withAiKey });
  const url = new URL(base);
  url.searchParams.set('__explanation_restore', String(Date.now()));
  url.searchParams.set('__exp_cloud', options.cloud || 'saved');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  return { context, page, pageErrors, aiRequests, viewport };
}

async function mountCards(page, count, options = {}) {
  return page.evaluate(({ count: cardCount, index, localFirst }) => {
    const cards = POOL.filter((entry) => entry.type === '词条').slice(0, cardCount);
    assertCards(cards, cardCount);
    if (localFirst) {
      const rows = {};
      rows[cards[0].key] = {
        x: '本机保存讲解：' + cards[0].key,
        t: 1786200000000,
        u: 1786200000000,
        m: 'gpt-5.6-luna',
        e: 'max',
        c: 1,
        qa: []
      };
      localStorage.setItem('mti_ai_explain', JSON.stringify(rows));
    }
    openQuiz('词条', 'new', cardCount);
    queue = cards;
    qi = index || 0;
    renderQuiz();
    return cards.map((card) => ({ key: card.key, question: card.q }));

    function assertCards(rows, expected) {
      if (rows.length !== expected) throw new Error('not enough term cards for explanation test');
    }
  }, { count, index: options.index || 0, localFirst: !!options.localFirst });
}

async function panelState(page) {
  return page.evaluate(() => {
    const panel = document.getElementById('aiQuizPanel');
    const body = document.getElementById('aiQuizBody');
    const button = document.getElementById('aiQuizBtn');
    return {
      panelKey: panel?.getAttribute('data-ai-card-key'),
      panelShow: panel?.classList.contains('show') || false,
      bodyShow: body?.classList.contains('show') || false,
      bodyText: body?.textContent.trim() || '',
      buttonKey: button?.getAttribute('data-ai-explain-key'),
      buttonText: button?.textContent.trim() || '',
      buttonDisabled: !!button?.disabled,
      panelWidth: panel?.getBoundingClientRect().width || 0
    };
  });
}

function assertSilent(state, key, message) {
  assert.equal(state.panelKey, null, `${message}: explanation panel stayed bound to a card`);
  assert.equal(state.panelShow, false, `${message}: explanation panel opened without user intent`);
  assert.equal(state.bodyShow, false, `${message}: explanation body was marked visible`);
  assert.equal(state.bodyText, '', `${message}: explanation text leaked into the panel`);
  assert.equal(state.buttonKey, key, `${message}: explanation button did not follow the current card`);
}

async function waitForSavedButton(page, key) {
  await page.waitForFunction((expectedKey) => {
    const button = document.getElementById('aiQuizBtn');
    return button?.getAttribute('data-ai-explain-key') === expectedKey && /查看讲解（已保存）/.test(button.textContent);
  }, key);
}

async function assertSavedButHidden(page, key, message) {
  await waitForSavedButton(page, key);
  const state = await panelState(page);
  assert.match(state.buttonText, /查看讲解（已保存）/, `${message}: saved state was not reflected on the button`);
  assertSilent(state, key, message);
  return state;
}

async function revealSaved(page, key, expectedText) {
  await page.locator('#aiQuizBtn').click();
  await page.waitForFunction(({ expectedKey, text }) => {
    const panel = document.getElementById('aiQuizPanel');
    const body = document.getElementById('aiQuizBody');
    return panel?.getAttribute('data-ai-card-key') === expectedKey && panel.classList.contains('show') && body?.textContent.includes(text);
  }, { expectedKey: key, text: expectedText });
  const state = await panelState(page);
  assert.equal(state.panelKey, key);
  assert.equal(state.panelShow, true);
  assert.match(state.bodyText, new RegExp(expectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

async function waitForCurrentCard(page, key) {
  await page.waitForFunction((expectedKey) => document.getElementById('aiQuizBtn')?.getAttribute('data-ai-explain-key') === expectedKey, key);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const allPageErrors = [];
  try {
    {
      const harness = await openHarness(browser);
      allPageErrors.push(harness.pageErrors);
      const { page, aiRequests } = harness;
      const cards = await mountCards(page, 4);

      const initial = await assertSavedButHidden(page, cards[0].key, 'initial desktop restore');
      assert.ok(initial.panelWidth > 0, 'desktop AI column should remain mounted while its answer is hidden');
      await revealSaved(page, cards[0].key, savedCloudText(cards[0].key));

      await page.locator('#qnext').click();
      await assertSavedButHidden(page, cards[1].key, 'qnext switch');
      await revealSaved(page, cards[1].key, savedCloudText(cards[1].key));

      await page.locator('#qprev').click();
      await assertSavedButHidden(page, cards[0].key, 'A to B to A return');
      await revealSaved(page, cards[0].key, savedCloudText(cards[0].key));

      await page.locator('#qnext').click();
      await assertSavedButHidden(page, cards[1].key, 'second qnext switch');
      await revealSaved(page, cards[1].key, savedCloudText(cards[1].key));

      await page.locator('#qyes').click();
      await assertSavedButHidden(page, cards[2].key, 'qyes switch');
      await revealSaved(page, cards[2].key, savedCloudText(cards[2].key));

      await page.locator('#qno').click();
      await assertSavedButHidden(page, cards[3].key, 'qno switch');
      await revealSaved(page, cards[3].key, savedCloudText(cards[3].key));

      await page.locator('.qret').click();
      await page.waitForFunction(() => document.getElementById('aiQuizBtn')?.disabled);
      const completed = await panelState(page);
      assert.equal(completed.panelKey, null, 'permanent mastery completion left the explanation bound');
      assert.equal(completed.panelShow, false, 'permanent mastery completion left the explanation open');
      assert.equal(completed.bodyText, '', 'permanent mastery completion left explanation text visible');
      assert.equal(completed.buttonKey, null, 'completed quiz kept a stale explanation button key');
      assert.equal(completed.buttonDisabled, true);

      const restored = await page.evaluate((keys) => {
        const rows = JSON.parse(localStorage.getItem('mti_ai_explain') || '{}');
        return {
          records: keys.map((key) => rows[key]),
          reads: window.__sbExplanationReads.filter((row) => row.kind === 'main')
        };
      }, cards.map((card) => card.key));
      restored.records.forEach((record, index) => {
        assert.equal(record.c, 1, `cloud explanation ${index + 1} was not silently restored`);
      });
      assert.ok(restored.reads.length >= cards.length, 'not every visited card was checked for a saved cloud explanation');
      assert.equal(aiRequests.length, 0, 'restoring or revealing saved explanations unexpectedly started an AI request');
      await harness.context.close();
    }

    {
      const harness = await openHarness(browser, { cloud: 'error' });
      allPageErrors.push(harness.pageErrors);
      const { page, aiRequests } = harness;
      const cards = await mountCards(page, 2, { localFirst: true });
      await waitForSavedButton(page, cards[0].key);
      assertSilent(await panelState(page), cards[0].key, 'local cache with cloud failure');
      await revealSaved(page, cards[0].key, `本机保存讲解：${cards[0].key}`);
      assert.equal(aiRequests.length, 0, 'opening a locally saved explanation after cloud failure regenerated it');
      await harness.context.close();
    }

    {
      const harness = await openHarness(browser, { cloud: 'late' });
      allPageErrors.push(harness.pageErrors);
      const { page, aiRequests } = harness;
      const cards = await mountCards(page, 2);
      assertSilent(await panelState(page), cards[0].key, 'late cloud restore before response');
      await assertSavedButHidden(page, cards[0].key, 'late cloud restore after response');
      assert.equal(aiRequests.length, 0, 'late cloud restore unexpectedly generated a new explanation');
      await harness.context.close();
    }

    {
      const harness = await openHarness(browser, { cloud: 'error' });
      allPageErrors.push(harness.pageErrors);
      const { page, aiRequests } = harness;
      const cards = await mountCards(page, 2);
      await page.waitForFunction((key) => window.__sbExplanationReads.some((row) => row.kind === 'main' && row.cardKey === key), cards[0].key);
      assertSilent(await panelState(page), cards[0].key, 'failed cloud restore');
      assert.equal(aiRequests.length, 0, 'a failed passive restore started an AI request');
      await harness.context.close();
    }

    {
      const harness = await openHarness(browser, { cloud: 'missing', withAiKey: true });
      allPageErrors.push(harness.pageErrors);
      const { page, aiRequests } = harness;
      const cards = await mountCards(page, 2);
      await page.waitForFunction((key) => window.__sbExplanationReads.some((row) => row.kind === 'main' && row.cardKey === key), cards[0].key);
      await page.locator('#aiQuizBtn').click();
      await page.waitForFunction(() => /后台生成中/.test(document.getElementById('aiQuizBtn')?.textContent || ''));
      await page.locator('#qnext').click();
      await waitForCurrentCard(page, cards[1].key);
      assertSilent(await panelState(page), cards[1].key, 'switch during background generation');
      await page.waitForFunction((key) => {
        const rows = JSON.parse(localStorage.getItem('mti_ai_explain') || '{}');
        return rows[key]?.x?.includes('后台生成完成但不得串卡');
      }, cards[0].key);
      assertSilent(await panelState(page), cards[1].key, 'background completion after card switch');
      assert.equal(aiRequests.length, 1, 'background generation should issue exactly one AI request');
      await harness.context.close();
    }

    {
      const harness = await openHarness(browser, { viewport: { width: 390, height: 844 } });
      allPageErrors.push(harness.pageErrors);
      const { page, aiRequests } = harness;
      const cards = await mountCards(page, 2);
      await assertSavedButHidden(page, cards[0].key, '390px initial restore');
      await revealSaved(page, cards[0].key, savedCloudText(cards[0].key));
      await page.locator('#qnext').evaluate((button) => button.click());
      const mobileHidden = await assertSavedButHidden(page, cards[1].key, '390px qnext switch');
      assert.equal(mobileHidden.panelShow, false, '390px explanation popup remained open after switching cards');
      assert.equal(aiRequests.length, 0, '390px saved explanation flow unexpectedly generated a new explanation');
      await harness.context.close();
    }

    assert.deepEqual(allPageErrors.flat(), []);
    console.log('PASS saved AI explanations stay hidden until explicitly opened across quiz navigation, restore paths, and mobile');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
