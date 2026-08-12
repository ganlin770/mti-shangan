const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.MTI_BASE_URL || 'http://127.0.0.1:4173/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await context.addInitScript((fixed) => {
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [fixed])); }
      static now() { return fixed; }
    }
    Object.setPrototypeOf(FixedDate, RealDate);
    window.Date = FixedDate;
    try {
      if (!sessionStorage.getItem('__politics_hub_test_ready')) {
        localStorage.clear();
        sessionStorage.setItem('__politics_hub_test_ready', '1');
      }
    } catch (_) {}
  }, Date.parse('2026-07-28T08:00:00+08:00'));

  const page = await context.newPage();
  const baseOrigin = new URL(base).origin;
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === baseOrigin ? route.continue() : route.abort();
  });

  try {
    const url = new URL(base);
    url.searchParams.set('__politics_hub', String(Date.now()));
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { sb = null; });

    const first = await page.evaluate(() => {
      const required = ['tdPolPracticeItems', 'tdPolPracticeSummary', 'tdPolQuarkCoursePath', 'tdPolHubSaveEvidence'];
      const missing = required.filter((name) => typeof window[name] !== 'function');
      if (missing.length) return { missing };
      delete st.daily;
      tdGen();
      go('politics');
      const lesson = tdPoliticsLessonFor(st.daily);
      const items = tdPolPracticeItems(lesson);
      const firstItem = items[0];
      const correct = document.querySelector('[data-pol-q="' + firstItem.id + '"][data-pol-choice="' + firstItem.answer + '"]');
      correct.click();
      const answerState = st.politicsPractice.answers[firstItem.id];
      const ids = Array.from(document.querySelectorAll('[id]')).map((node) => node.id);
      return {
        missing,
        lesson,
        itemCount: items.length,
        answerState,
        summary: tdPolPracticeSummary(lesson),
        path: tdPolQuarkCoursePath(lesson),
        text: document.getElementById('view').textContent,
        mapSubjects: document.querySelectorAll('[data-testid="politics-course-map"] details').length,
        duplicateIds: ids.length - new Set(ids).size,
        navCurrent: document.querySelector('.nav.on span').textContent.trim()
      };
    });

    assert.deepEqual(first.missing, []);
    assert.equal(first.lesson.total, 53);
    assert.ok(first.itemCount >= 3, 'current lesson has too few original self-check questions');
    assert.equal(first.answerState.correct, 1);
    assert.equal(typeof first.answerState.at, 'number');
    assert.equal(first.summary.answered, 1);
    assert.equal(first.summary.correct, 1);
    assert.match(first.path, /^考研政治 \/ 00_只学这个_MTI政治主线/);
    assert.match(first.text, /原创章节定位自测（非肖1000、非政治真题）/);
    assert.match(first.text, /不储存题面/);
    assert.equal(first.mapSubjects, 5);
    assert.equal(first.duplicateIds, 0);
    assert.equal(first.navCurrent, '101 政治系统');

    const saved = await page.evaluate(() => {
      const L = tdPoliticsLessonFor(st.daily);
      document.getElementById('polHubResource').value = '27版肖1000题';
      document.getElementById('polHubScope').value = L.questions;
      document.getElementById('polHubAnswered').value = String(st.daily.politicsPlan.target);
      document.getElementById('polHubCorrect').value = String(Math.ceil(st.daily.politicsPlan.target * st.daily.politicsPlan.passRate));
      document.getElementById('polHubConcept').checked = true;
      document.getElementById('polHubWrong').value = '第一道题把概念的适用条件混在一起，第二道题漏看了材料中的限定词，第三道题把相邻概念当作同义词，明天先遮住答案重做。';
      document.getElementById('polHubFramework').value = '闭卷框架：先写本节核心概念，再写三个相邻概念的边界；随后写出概念之间的逻辑关系，最后用一道材料选择题验证判断路径。';
      document.getElementById('polHubSave').click();
      return {
        ready: tdPoliticsReady(st.daily),
        done: st.daily.done.politics,
        completed: st.politicsLearning.completed[L.id],
        resource: st.daily.politics.resource,
        scope: st.daily.politics.scope,
        status: document.getElementById('polHubStatus').textContent
      };
    });

    assert.equal(saved.ready, true);
    assert.equal(saved.done, 1);
    assert.equal(saved.resource, '27版肖1000题');
    assert.ok(saved.completed);
    assert.match(saved.status, /已满足今日 101 政治/);

    await page.reload({ waitUntil: 'domcontentloaded' });
    const restored = await page.evaluate(() => {
      sb = null;
      go('politics');
      const L = tdPoliticsLessonFor(st.daily);
      return {
        savedAnswers: Object.keys(st.politicsPractice.answers).length,
        currentLesson: L.id,
        completed: !!st.politicsLearning.completed[st.daily.politics.lessonId],
        questionButtons: document.querySelectorAll('[data-pol-q]').length
      };
    });
    assert.ok(restored.savedAnswers >= 1, 'original self-check answer was not persisted');
    assert.equal(restored.completed, true);
    assert.ok(restored.questionButtons >= 12);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => {
      go('politics');
      return {
        viewport: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        cards: document.querySelectorAll('.polquiz-card').length,
        panels: document.querySelectorAll('.polhub-panel').length
      };
    });
    assert.ok(mobile.scrollWidth <= mobile.viewport + 1, `390px page overflowed horizontally (${mobile.scrollWidth}/${mobile.viewport})`);
    assert.ok(mobile.cards >= 3);
    assert.ok(mobile.panels >= 3);
    assert.deepEqual(pageErrors, []);
    console.log('PASS politics hub: private course path, original self-check, evidence sync, persistence, mobile layout');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
