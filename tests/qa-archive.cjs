const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.MTI_BASE_URL || 'http://127.0.0.1:4173/';

function archiveFixture() {
  const now = Date.now();
  return {
    'ci|GDP': {
      x: 'GDP 是按地域统计的国内生产总值。',
      t: now - 5 * 86400000,
      u: now - 2 * 86400000,
      m: 'kimi-k3',
      e: 'high',
      qa: [
        { id: 'gdp-1', q: '为什么不能写成 GNP？', a: '因为 **GDP 按地域**，GNP 按国民。纪律约束是先看统计边界。', t: now - 5 * 86400000, m: 'kimi-k3', e: 'high' },
        { id: 'gdp-2', q: '考场怎么一眼区分？', a: '看到 domestic 就联想到境内；看到 national 就联想到国民。', t: now - 2 * 86400000, m: 'deepseek-v4-pro', e: 'low' }
      ]
    },
    'v|rambunctious': {
      x: 'rambunctious 的核心是喧闹且难以控制。',
      t: now - 20 * 86400000,
      u: now - 20 * 86400000,
      m: 'kimi-k3',
      e: 'max',
      qa: [
        { id: 'vocab-1', q: '和 boisterous 有什么区别？', a: 'rambunctious 更强调失控，boisterous 偏声音大、热闹。', t: now - 20 * 86400000, m: 'kimi-k3', e: 'max' }
      ]
    },
    'ms|市场经济': {
      x: '市场经济是主要依靠市场机制配置资源的经济体制。',
      t: now - 3600000,
      u: now - 3600000,
      m: 'kimi-k3',
      e: 'max',
      qa: [
        { id: 'market-1', q: '社会主义市场经济如何表述？', a: '答题必须同时写出市场配置资源和更好发挥政府作用。', t: now - 3600000, m: 'kimi-k3', e: 'max' }
      ]
    },
    'removed|old-card': {
      x: '旧卡讲解。',
      t: now - 3 * 86400000,
      u: now - 3 * 86400000,
      m: 'kimi-k3',
      e: 'high',
      qa: [
        { id: 'orphan-1', q: '旧卡还能看吗？', a: '即使原卡变更，历史回答也应继续保留。', t: now - 3 * 86400000, m: 'kimi-k3', e: 'high' }
      ]
    }
  };
}

async function openArchive(browser, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  await context.addInitScript((fixture) => {
    localStorage.setItem('mti_ai_explain', JSON.stringify(fixture));
  }, archiveFixture());
  const page = await context.newPage();
  const origin = new URL(base).origin;
  let externalRequests = 0;
  await page.route('**/*', (route) => {
    const target = new URL(route.request().url());
    if (target.origin !== origin) {
      externalRequests += 1;
      return route.abort();
    }
    return route.continue();
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const url = new URL(base);
  url.searchParams.set('__qa_archive', `${viewport.width}-${Date.now()}`);
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  const nav = viewport.width <= 760 ? '.mtab[data-v="aiqa"]' : '.nav[data-v="aiqa"]';
  await page.locator(nav).click();
  await page.locator('[data-testid="qa-archive"]').waitFor();
  return { context, page, errors, externalRequests: () => externalRequests };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await openArchive(browser, { width: 1280, height: 900 });
    const page = desktop.page;

    assert.match(await page.locator('[data-testid="qa-summary"]').innerText(), /5\s*条追问/);
    assert.match(await page.locator('[data-testid="qa-summary"]').innerText(), /4\s*张学习卡/);
    assert.equal(await page.locator('[data-testid="qa-card"]').count(), 4);
    assert.match(await page.locator('[data-testid="qa-detail"]').innerText(), /市场经济/);
    assert.match(await page.locator('[data-testid="qa-sync-status"]').innerText(), /本机记录/);

    await page.locator('[data-testid="qa-search"]').fill('纪律约束');
    assert.equal(await page.locator('[data-testid="qa-card"]').count(), 1);
    assert.match(await page.locator('[data-testid="qa-detail"]').innerText(), /为什么不能写成 GNP/);
    await page.locator('[data-testid="qa-search"]').fill('');

    await page.locator('[data-qa-type="vocab"]').click();
    assert.equal(await page.locator('[data-testid="qa-card"]').count(), 1);
    assert.match(await page.locator('[data-testid="qa-detail"]').innerText(), /rambunctious/);
    await page.locator('[data-qa-type="all"]').click();

    await page.locator('[data-testid="qa-filter-period"]').selectOption('7');
    assert.equal(await page.locator('[data-testid="qa-card"]').count(), 3);
    await page.locator('[data-testid="qa-filter-period"]').selectOption('all');

    await page.locator('[data-testid="qa-card"]', { hasText: 'old-card' }).click();
    const orphanButton = page.locator('[data-testid="qa-back-to-card"]');
    assert.equal(await orphanButton.isDisabled(), true);
    assert.match(await page.locator('[data-testid="qa-detail"]').innerText(), /历史追问仍会永久保留/);

    await page.locator('[data-testid="qa-card"]', { hasText: 'GDP' }).click();
    const requestsBeforeOpen = desktop.externalRequests();
    await page.locator('[data-testid="qa-back-to-card"]').click();
    assert.equal(await page.locator('#ovl').evaluate((el) => el.classList.contains('on')), true);
    assert.match(await page.locator('#quizbox').innerText(), /GDP/);
    assert.match(await page.locator('#aiQuizPanel').innerText(), /为什么不能写成 GNP/);
    assert.equal(desktop.externalRequests(), requestsBeforeOpen, 'opening a saved card triggered a model request');
    assert.deepEqual(desktop.errors, []);
    await desktop.context.close();

    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }]) {
      const mobile = await openArchive(browser, viewport);
      const mobilePage = mobile.page;
      const layout = await mobilePage.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        navVisible: !!document.querySelector('.mtab[data-v="aiqa"]') && document.querySelector('.mtab[data-v="aiqa"]').getBoundingClientRect().left < innerWidth,
        cardHeight: document.querySelector('.qa-card').getBoundingClientRect().height,
        searchHeight: document.querySelector('.qa-search').getBoundingClientRect().height,
        refreshHeight: document.querySelector('.qa-refresh').getBoundingClientRect().height
      }));
      assert.ok(layout.scrollWidth <= layout.clientWidth + 1, `${viewport.width}px archive overflowed horizontally`);
      assert.equal(layout.navVisible, true, `${viewport.width}px follow-up tab was not visible in the mobile nav`);
      assert.ok(layout.cardHeight >= 44);
      assert.ok(layout.searchHeight >= 44);
      assert.ok(layout.refreshHeight >= 44);

      await mobilePage.locator('[data-testid="qa-card"]').first().click();
      assert.equal(await mobilePage.locator('[data-testid="qa-detail"]').isVisible(), true);
      assert.equal(await mobilePage.locator('[data-testid="qa-results"]').isVisible(), false);
      await mobilePage.locator('[data-testid="qa-mobile-back"]').click();
      assert.equal(await mobilePage.locator('[data-testid="qa-results"]').isVisible(), true);
      assert.deepEqual(mobile.errors, []);
      await mobile.context.close();
    }

    console.log('PASS AI follow-up archive desktop/mobile, filters, orphan retention and exact card return');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
