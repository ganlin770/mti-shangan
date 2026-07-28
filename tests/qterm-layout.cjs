const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = process.env.MTI_BASE_URL || 'http://127.0.0.1:4173/';
const viewports = [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 320, height: 640 }
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const pageErrors = [];

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      const url = new URL(base);
      url.searchParams.set('__qterm_layout', `${viewport.width}-${Date.now()}`);
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });

      const cards = await page.evaluate(async () => {
        const wanted = ['加沙地带', 'Gaza Strip', 'GNP'];
        const results = [];
        for (const question of wanted) {
          const item = POOL.find((entry) => entry.type === '词条' && entry.q === question);
          if (!item) {
            results.push({ question, missing: true });
            continue;
          }

          queue = [item];
          qi = 0;
          document.getElementById('ovl').classList.add('on');
          renderQuiz();
          document.getElementById('qc').classList.add('flip');
          if (document.fonts && document.fonts.ready) await document.fonts.ready;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const answer = document.querySelector('.qterm-answer');
          const source = document.querySelector('.qterm-source');
          const primary = document.querySelector('.qterm-section.is-primary');
          const style = getComputedStyle(answer);
          results.push({
            question,
            missing: false,
            answer: answer.textContent,
            source: source.textContent,
            answerWhiteSpace: style.whiteSpace,
            answerFitsWidth: answer.scrollWidth <= answer.clientWidth + 1,
            sourceClientHeight: source.clientHeight,
            sourceScrollHeight: source.scrollHeight,
            sourceInsideCard: source.getBoundingClientRect().bottom <= primary.getBoundingClientRect().bottom + 1
          });
        }
        return results;
      });

      for (const card of cards) {
        assert.equal(card.missing, false, `${viewport.width}px: missing ${card.question}`);
        assert.equal(card.answerWhiteSpace, 'nowrap', `${viewport.width}px: English answer wrapped for ${card.question}`);
        assert.equal(card.answerFitsWidth, true, `${viewport.width}px: English answer overflowed for ${card.question}`);
        assert.ok(
          card.sourceClientHeight >= card.sourceScrollHeight,
          `${viewport.width}px: Chinese answer clipped for ${card.question} (${card.sourceClientHeight}/${card.sourceScrollHeight})`
        );
        assert.equal(card.sourceInsideCard, true, `${viewport.width}px: Chinese answer escaped card for ${card.question}`);
      }

      await page.close();
    }

    const resumePage = await browser.newPage({ viewport: viewports[0] });
    resumePage.on('pageerror', (error) => pageErrors.push(error.message));
    const resumeUrl = new URL(base);
    resumeUrl.searchParams.set('__quiz_resume', `${Date.now()}`);
    await resumePage.goto(resumeUrl.href, { waitUntil: 'domcontentloaded' });
    const resumed = await resumePage.evaluate(() => {
      tdGen();
      const cards = POOL.filter((entry) => entry.type === '词条').slice(0, 3);
      st.daily.qzMap['词条'] = { keys: cards.map((entry) => entry.key), pos: 2 };
      openQuiz('词条');
      const initial = {
        counter: document.querySelector('#quizbox .pg span:last-child').textContent,
        question: document.querySelector('#qc .tm').textContent,
        previousDisabled: document.getElementById('qprev').disabled,
        queueLength: queue.length,
        queueIndex: qi,
        aiPanelMounted: !!document.getElementById('aiQuizPanel'),
        aiLaunchMounted: !!document.getElementById('aiQuizLaunch'),
        aiPanelVisible: document.getElementById('aiQuizPanel').getBoundingClientRect().width > 0,
        aiPanelLeftOfQuiz: document.getElementById('aiQuizPanel').getBoundingClientRect().right <= document.getElementById('quizbox').getBoundingClientRect().left
      };
      document.getElementById('qprev').click();
      const previous = {
        counter: document.querySelector('#quizbox .pg span:last-child').textContent,
        question: document.querySelector('#qc .tm').textContent,
        previousDisabled: document.getElementById('qprev').disabled,
        queueIndex: qi
      };
      document.getElementById('qflip').click();
      return {
        expectedCurrent: cards[2].q,
        expectedPrevious: cards[1].q,
        initial,
        previous,
        flipped: document.getElementById('qc').classList.contains('flip')
      };
    });
    assert.deepEqual(resumed.initial, {
      counter: '3 / 3',
      question: resumed.expectedCurrent,
      previousDisabled: false,
      queueLength: 3,
      queueIndex: 2,
      aiPanelMounted: true,
      aiLaunchMounted: true,
      aiPanelVisible: true,
      aiPanelLeftOfQuiz: true
    });
    assert.deepEqual(resumed.previous, {
      counter: '2 / 3',
      question: resumed.expectedPrevious,
      previousDisabled: false,
      queueIndex: 1
    });
    assert.equal(resumed.flipped, true, 'resumed card did not flip');
    await resumePage.close();

    assert.deepEqual(pageErrors, []);
    console.log('PASS qterm layout and resumed quiz navigation');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
