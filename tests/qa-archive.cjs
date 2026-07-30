const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.MTI_BASE_URL || 'http://127.0.0.1:4173/';

function archiveFixture() {
  const now = Date.now();
  const longAnswer = Array.from({ length: 24 }, (_, i) =>
    `第 ${i + 1} 个辨析步骤：先确定题干边界，再核对关键词，最后用真题语境复述结论。`
  ).join('\n\n');
  const fixture = {
    'ci|GDP': {
      x: 'GDP 是按地域统计的国内生产总值。',
      t: now - 5 * 86400000,
      u: now - 2 * 86400000,
      m: 'kimi-k3',
      e: 'high',
      qa: [
        { id: 'gdp-1', q: '为什么不能写成 GNP？', a: `因为 **GDP 按地域**，GNP 按国民。纪律约束是先看统计边界。\n\n${longAnswer}`, t: now - 5 * 86400000, m: 'kimi-k3', e: 'high' },
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
  for (let i = 1; i <= 12; i += 1) {
    fixture[`removed|archive-${i}`] = {
      x: `归档卡 ${i} 的旧讲解。`,
      t: now - (i + 4) * 3600000,
      u: now - (i + 4) * 3600000,
      m: 'kimi-k3',
      e: i % 3 === 0 ? 'max' : 'high',
      qa: [{
        id: `archive-${i}-qa`,
        q: `归档问题 ${i} 应该怎样复习？`,
        a: i === 8 ? longAnswer : `这是归档回答 ${i}，用于确认卡片切换不会跳回第一张。`,
        t: now - (i + 4) * 3600000,
        m: 'kimi-k3',
        e: i % 3 === 0 ? 'max' : 'high'
      }]
    };
  }
  return fixture;
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
  await page.waitForFunction(() => !document.querySelector('[data-testid="qa-sync-status"]')?.textContent.includes('正在'));
  return { context, page, errors, externalRequests: () => externalRequests };
}

async function assertReaderFrame(page, viewport) {
  const layout = await page.evaluate(() => {
    const reader = document.querySelector('[data-testid="qa-reader"]');
    const head = document.querySelector('[data-testid="qa-reader-head"]');
    const scroll = document.querySelector('[data-testid="qa-reader-scroll"]');
    const foot = document.querySelector('[data-testid="qa-reader-foot"]');
    const paperStyle = getComputedStyle(document.querySelector('.qa-reader-paper'));
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, bottom: r.bottom };
    };
    return {
      reader: rect(reader), head: rect(head), scroll: rect(scroll), foot: rect(foot),
      rootOverflow: reader.scrollWidth - reader.clientWidth,
      scrollOverflow: scroll.scrollWidth - scroll.clientWidth,
      position: getComputedStyle(reader).position,
      paperPadding: paperStyle.padding,
      paperMaxWidth: paperStyle.maxWidth,
      paperColor: paperStyle.backgroundColor.match(/[\d.]+/g).slice(0, 3).map(Number)
    };
  });
  assert.equal(layout.position, 'fixed');
  assert.ok(Math.abs(layout.reader.x) <= 1 && Math.abs(layout.reader.y) <= 1);
  assert.ok(Math.abs(layout.reader.width - viewport.width) <= 1);
  assert.ok(Math.abs(layout.reader.height - viewport.height) <= 1);
  assert.ok(layout.head.top >= -1 && layout.foot.bottom <= viewport.height + 1);
  assert.ok(layout.rootOverflow <= 1, `${viewport.width}px reader root overflowed horizontally`);
  assert.ok(layout.scrollOverflow <= 1, `${viewport.width}px reader content overflowed horizontally`);
  assert.equal(layout.paperPadding, '0px', 'global main padding leaked into the reader paper');
  assert.equal(layout.paperMaxWidth, 'none', 'global main max-width leaked into the reader paper');
  assert.ok(layout.paperColor.every((channel) => channel > 220), `reader paper was not cream: ${layout.paperColor}`);
  return layout;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const desktopViewport = { width: 1280, height: 900 };
    const desktop = await openArchive(browser, desktopViewport);
    const page = desktop.page;

    assert.match(await page.locator('[data-testid="qa-summary"]').innerText(), /17\s*条追问/);
    assert.match(await page.locator('[data-testid="qa-summary"]').innerText(), /16\s*张学习卡/);
    assert.equal(await page.locator('[data-testid="qa-card"]').count(), 12);
    assert.equal(await page.locator('.qa-turn-answer').count(), 0, 'full answers leaked into the archive home');
    assert.equal(await page.locator('[data-testid="qa-pager"]').isVisible(), true);
    assert.match(await page.locator('[data-testid="qa-sync-status"]').innerText(), /本机|云端/);

    const homeLayout = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-testid="qa-card"]')];
      const heroColor = getComputedStyle(document.querySelector('.qa-hero')).backgroundColor.match(/[\d.]+/g).slice(0, 3).map(Number);
      return {
        firstTop: cards[0].getBoundingClientRect().top,
        secondTop: cards[1].getBoundingClientRect().top,
        heroColor,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      };
    });
    assert.ok(Math.abs(homeLayout.firstTop - homeLayout.secondTop) <= 1, 'desktop cards were not laid out as a compact grid');
    assert.ok(homeLayout.heroColor.every((channel) => channel > 220), `archive hero was not cream: ${homeLayout.heroColor}`);
    assert.ok(homeLayout.scrollWidth <= homeLayout.clientWidth + 1);

    await page.locator('[data-testid="qa-search"]').fill('纪律约束');
    assert.equal(await page.locator('[data-testid="qa-card"]').count(), 1);
    assert.match(await page.locator('[data-testid="qa-card"]').innerText(), /GDP/);
    await page.locator('[data-testid="qa-search"]').fill('');

    await page.locator('[data-qa-type="vocab"]').click();
    assert.equal(await page.locator('[data-testid="qa-card"]').count(), 1);
    assert.match(await page.locator('[data-testid="qa-card"]').innerText(), /rambunctious/);
    await page.locator('[data-qa-type="all"]').click();

    await page.locator('[data-testid="qa-filter-period"]').selectOption('7');
    assert.match(await page.locator('#qaVisibleCount').innerText(), /15 张追问卡片/);
    await page.locator('[data-testid="qa-filter-period"]').selectOption('all');
    await page.locator('.qa-page-next').click();
    assert.equal(await page.locator('[data-testid="qa-card"]').count(), 4);
    assert.match(await page.locator('[data-testid="qa-pager"]').innerText(), /第 2 \/ 2 页/);
    await page.locator('.qa-page-prev').click();

    const target = page.locator('[data-testid="qa-card"]', { hasText: 'archive-8' });
    await target.scrollIntoViewIfNeeded();
    const backgroundScroll = await page.evaluate(() => window.scrollY);
    const targetTitle = await target.locator('strong').innerText();
    await target.click();
    await page.locator('[data-testid="qa-reader"]').waitFor();
    assert.equal(await page.locator('#qaReaderTitle').innerText(), targetTitle);
    assert.equal(await page.evaluate(() => window.scrollY), backgroundScroll, 'opening reader moved the archive page');
    await assertReaderFrame(page, desktopViewport);
    assert.deepEqual(await page.evaluate(() => ({
      backgroundInert: document.querySelector('.layout').inert,
      backgroundHidden: document.querySelector('.layout').getAttribute('aria-hidden'),
      focusInside: document.querySelector('[data-testid="qa-reader"]').contains(document.activeElement)
    })), { backgroundInert: true, backgroundHidden: 'true', focusInside: true });
    for (let i = 0; i < 15; i += 1) await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.querySelector('[data-testid="qa-reader"]').contains(document.activeElement)), true, 'Tab escaped the modal reader');

    const fixedBefore = await page.evaluate(() => ({
      headTop: document.querySelector('[data-testid="qa-reader-head"]').getBoundingClientRect().top,
      footBottom: document.querySelector('[data-testid="qa-reader-foot"]').getBoundingClientRect().bottom
    }));
    const readerOverflow = await page.locator('[data-testid="qa-reader-scroll"]').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return { scrollTop: el.scrollTop, overflow: el.scrollHeight - el.clientHeight };
    });
    assert.ok(readerOverflow.overflow > 100, 'fixture did not create a scrollable answer');
    const fixedAfter = await page.evaluate(() => ({
      headTop: document.querySelector('[data-testid="qa-reader-head"]').getBoundingClientRect().top,
      footBottom: document.querySelector('[data-testid="qa-reader-foot"]').getBoundingClientRect().bottom
    }));
    assert.ok(Math.abs(fixedBefore.headTop - fixedAfter.headTop) <= 1);
    assert.ok(Math.abs(fixedBefore.footBottom - fixedAfter.footBottom) <= 1);

    await page.locator('[data-testid="qa-reader-next"]').click();
    assert.equal(await page.locator('#qaReaderTitle').innerText(), 'archive-9');
    assert.ok(await page.locator('[data-testid="qa-reader-scroll"]').evaluate((el) => el.scrollTop) <= 1);
    assert.equal(await page.evaluate(() => window.scrollY), backgroundScroll, 'switching cards moved the archive page');
    assert.equal(await page.evaluate(() => document.querySelector('[data-testid="qa-reader"]').contains(document.activeElement)), true, 'card switch lost focus outside the reader');
    await page.locator('.qa-reader-x').click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="qa-reader"]'));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const restored = await page.evaluate(() => ({
      scrollY: window.scrollY,
      activeText: document.activeElement?.querySelector?.('strong')?.textContent || '',
      activeCard: document.activeElement?.classList?.contains('qa-card') || false,
      locked: document.body.classList.contains('qa-reader-open'),
      backgroundInert: document.querySelector('.layout').inert,
      backgroundHidden: document.querySelector('.layout').getAttribute('aria-hidden')
    }));
    assert.equal(restored.scrollY, backgroundScroll);
    assert.equal(restored.activeCard, true);
    assert.equal(restored.activeText, 'archive-9');
    assert.equal(restored.locked, false);
    assert.equal(restored.backgroundInert, false);
    assert.equal(restored.backgroundHidden, null);

    const pageBoundaryCard = page.locator('[data-testid="qa-card"]', { hasText: 'archive-11' });
    await pageBoundaryCard.click();
    assert.equal(await page.locator('#qaReaderTitle').innerText(), 'archive-11');
    await page.locator('[data-testid="qa-reader-next"]').click();
    assert.equal(await page.locator('#qaReaderTitle').innerText(), 'archive-12');
    await page.locator('.qa-reader-x').click();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.match(await page.locator('[data-testid="qa-pager"]').innerText(), /第 2 \/ 2 页/);
    assert.equal(await page.locator('.qa-card.is-active strong').innerText(), 'archive-12');
    assert.equal(await page.evaluate(() => document.activeElement?.querySelector?.('strong')?.textContent || ''), 'archive-12');

    await page.locator('[data-testid="qa-search"]').fill('GDP');
    await page.locator('[data-testid="qa-card"]').click();
    assert.equal(await page.locator('.qa-reader-question').count(), 2);
    await page.locator('.qa-reader-question').first().click();
    assert.match(await page.locator('.qa-reader-answer').innerText(), /为什么不能写成 GNP/);
    await page.locator('[data-testid="qa-reader-scroll"]').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.locator('.qa-reader-question').nth(1).click();
    assert.match(await page.locator('.qa-reader-answer').innerText(), /考场怎么一眼区分/);
    assert.ok(await page.locator('[data-testid="qa-reader-scroll"]').evaluate((el) => el.scrollTop) <= 1);
    const requestsBeforeOpen = desktop.externalRequests();
    await page.locator('[data-testid="qa-back-to-card"]').click();
    assert.equal(await page.locator('#ovl').evaluate((el) => el.classList.contains('on')), true);
    assert.match(await page.locator('#quizbox').innerText(), /GDP/);
    assert.match(await page.locator('#aiQuizPanel').innerText(), /为什么不能写成 GNP/);
    assert.equal(desktop.externalRequests(), requestsBeforeOpen, 'opening a saved card triggered a model request');
    await page.locator('.qclose').click();

    await page.locator('.nav[data-v="aiqa"]').click();
    await page.locator('[data-testid="qa-search"]').fill('old-card');
    await page.locator('[data-testid="qa-card"]').click();
    assert.equal(await page.locator('[data-testid="qa-back-to-card"]').isDisabled(), true);
    assert.match(await page.locator('[data-testid="qa-reader"]').innerText(), /历史追问仍会永久保留/);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-testid="qa-reader"]'));
    assert.equal(await page.evaluate(() => document.body.classList.contains('qa-reader-open')), false);
    assert.deepEqual(desktop.errors, []);
    await desktop.context.close();

    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }]) {
      const mobile = await openArchive(browser, viewport);
      const mobilePage = mobile.page;
      const home = await mobilePage.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        navVisible: !!document.querySelector('.mtab[data-v="aiqa"]') && document.querySelector('.mtab[data-v="aiqa"]').getBoundingClientRect().left < innerWidth,
        cardHeight: document.querySelector('.qa-card').getBoundingClientRect().height,
        searchHeight: document.querySelector('.qa-search').getBoundingClientRect().height,
        refreshHeight: document.querySelector('.qa-refresh').getBoundingClientRect().height
      }));
      assert.ok(home.scrollWidth <= home.clientWidth + 1, `${viewport.width}px archive overflowed horizontally`);
      assert.equal(home.navVisible, true, `${viewport.width}px follow-up tab was not visible in the mobile nav`);
      assert.ok(home.cardHeight >= 44);
      assert.ok(home.searchHeight >= 44);
      assert.ok(home.refreshHeight >= 44);

      await mobilePage.locator('[data-testid="qa-search"]').fill('GDP');
      await mobilePage.locator('[data-testid="qa-card"]').click();
      const mobileFrame = await assertReaderFrame(mobilePage, viewport);
      const controls = await mobilePage.evaluate(() => ['qa-reader-close', 'qa-reader-prev', 'qa-reader-next'].map((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        const r = el.getBoundingClientRect();
        return { id, width: r.width, height: r.height };
      }));
      controls.forEach((control) => {
        assert.ok(control.height >= 44, `${viewport.width}px ${control.id} height was below 44px`);
        assert.ok(control.width >= 44, `${viewport.width}px ${control.id} width was below 44px`);
      });
      await mobilePage.locator('[data-testid="qa-reader-scroll"]').evaluate((el) => { el.scrollTop = el.scrollHeight; });
      const chromeVisible = await mobilePage.evaluate(() => ({
        head: document.querySelector('[data-testid="qa-reader-head"]').getBoundingClientRect(),
        foot: document.querySelector('[data-testid="qa-reader-foot"]').getBoundingClientRect()
      }));
      assert.ok(chromeVisible.head.top >= -1);
      assert.ok(chromeVisible.foot.bottom <= viewport.height + 1);
      assert.ok(Math.abs(chromeVisible.head.top - mobileFrame.head.top) <= 1, `${viewport.width}px reader head moved with content`);
      assert.ok(Math.abs(chromeVisible.foot.bottom - mobileFrame.foot.bottom) <= 1, `${viewport.width}px reader footer moved with content`);
      await mobilePage.locator('.qa-reader-x').click();
      assert.equal(await mobilePage.locator('[data-testid="qa-reader"]').count(), 0);
      assert.deepEqual(mobile.errors, []);
      await mobile.context.close();
    }

    console.log('PASS AI follow-up archive cream grid, fullscreen reader, stable scroll, exact switching and mobile layout');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
