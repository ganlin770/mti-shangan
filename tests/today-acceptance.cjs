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
    try { localStorage.clear(); } catch (_) {}
    const speechProbe = { speak: 0, pause: 0, resume: 0, cancel: 0, current: null };
    class FakeSpeechSynthesisUtterance {
      constructor(text) {
        this.text = text;
        this.lang = '';
        this.rate = 1;
        this.voice = null;
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
      }
    }
    const fakeSpeech = {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => [],
      speak(utterance) {
        speechProbe.speak += 1;
        speechProbe.current = utterance;
        this.speaking = true;
        this.pending = false;
        this.paused = false;
        if (typeof utterance.onstart === 'function') utterance.onstart();
      },
      pause() {
        speechProbe.pause += 1;
        this.paused = true;
      },
      resume() {
        speechProbe.resume += 1;
        this.paused = false;
      },
      cancel() {
        speechProbe.cancel += 1;
        this.speaking = false;
        this.pending = false;
        this.paused = false;
        speechProbe.current = null;
      }
    };
    window.__speechProbe = speechProbe;
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeSpeechSynthesisUtterance, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', { value: fakeSpeech, configurable: true });
  }, Date.parse('2026-07-27T08:00:00+08:00'));

  const page = await context.newPage();
  const baseOrigin = new URL(base).origin;
  const freshUrl = (suffix) => {
    const url = new URL(base);
    url.searchParams.set('__today_acceptance', `${Date.now()}-${suffix}`);
    return url.href;
  };
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === baseOrigin ? route.continue() : route.abort();
  });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(freshUrl('desktop'), { waitUntil: 'domcontentloaded' });
  assert.equal(await page.title(), '南昌大学 · MTI 上岸日志');

  const result = await page.evaluate(async () => {
    const required = [
      'tdBuildDueQueue', 'tdBuildNewQueue', 'tdPsgEligible',
      'tdWriteTaskFor', 'td211TaskFor', 'tdPoliticsLessons', 'tdPoliticsCurrentLesson', 'tdPoliticsLessonFor', 'tdPoliticsLessonHtml', 'tdPoliticsReady', 'tdVocabUsable', 'tdNcuMsMeta', 'tdDrawDrill',
      'tdNcuDrillYear', 'tdTransMinUnits', 'tdNextAction', 'tdWeekPlanHtml',
      'tdRoadmapHtml', 'tdRetestReady', 'tdDraftSave', 'tdSetSession', 'tdQualification', 'tdGtBuild', 'tdOnJudged',
      'tdListenAudioToggle', 'tdListenAudioStop', 'tdListenAudioView'
    ];
    const missing = required.filter((name) => typeof window[name] !== 'function');
    if (missing.length) return { missing };

    const unique = [...new Map(POOL.map((item) => [item.key, item])).values()];
    const ci = unique.filter((item) => item.type === '词条');
    const ms = unique.filter((item) => item.type === '名解');
    const actionKeyOf = (action) => String(
      typeof action === 'string' ? action : (action && (action.key || action.task || action.id || action.type)) || ''
    ).toLowerCase();
    const actionLabelOf = (action) => String(
      typeof action === 'string' ? action : (action && (action.label || action.title || action.text || action.button)) || ''
    ).trim();
    const outputForTranslation = (passage, units) => passage && passage.d === '英译汉'
      ? '译'.repeat(Math.max(0, units))
      : Array.from({ length: Math.max(0, units) }, () => 'word').join(' ');
    const visible = (element) => !!element && getComputedStyle(element).display !== 'none'
      && getComputedStyle(element).visibility !== 'hidden' && element.getBoundingClientRect().height > 0;
    st = { srs: {}, streak: 0, lastDay: '', todayDay: '', todayCount: 0, history: {}, totalRev: 0, log: [] };
    st.srs[ci[0].key] = { l: 1, due: Date.now() - 1000, lapse: 0 };
    st.srs[ms[0].key] = { l: 1, due: Date.now() - 1000, lapse: 0 };
    st.srs[ci[1].key] = { l: 1, due: Date.now() + 86400000, lapse: 0 };

    const due = tdBuildDueQueue();
    const fresh = tdBuildNewQueue('词条', 10);
    const dueNewOverlap = due.some((x) => fresh.some((y) => y.key === x.key));

    delete st.daily;
    tdGen();
    const politicsLessons = tdPoliticsLessons();
    const initialPoliticsLesson = tdPoliticsLessonFor(st.daily);
    st.politicsLearning.completed[initialPoliticsLesson.id] = st.daily.date;
    const nextPoliticsLesson = tdPoliticsCurrentLesson();
    delete st.politicsLearning.completed[initialPoliticsLesson.id];
    cur = 'today';
    render();
    const initialNext = tdNextAction(st.daily);
    const initialNextButton = document.querySelector('[data-testid="td-next-button"]');
    const initialNextState = {
      key: actionKeyOf(initialNext),
      label: actionLabelOf(initialNext),
      panel: !!document.querySelector('[data-testid="td-next-action"]'),
      button: visible(initialNextButton),
      buttonText: initialNextButton ? initialNextButton.textContent.trim() : ''
    };
    const weekHost = document.createElement('div');
    weekHost.innerHTML = tdWeekPlanHtml(st.daily);
    const weekPlanState = {
      days: weekHost.querySelectorAll('.td-week-day').length,
      today: weekHost.querySelectorAll('.td-week-day.today').length,
      has211: /211/.test(weekHost.textContent),
      has448: /448/.test(weekHost.textContent)
    };
    openQuiz(null, 'due', 1);
    const actualDueQueue = queue.map((x) => x.key);
    const actualDueAllValid = queue.every((x) => st.srs[x.key] && st.srs[x.key].due <= Date.now());
    closeQuiz();
    openQuiz('词条', 'new', 2);
    const actualNewQueue = queue.map((x) => x.key);
    const actualNewAllValid = queue.every((x) => !st.srs[x.key]);
    closeQuiz();
    const generated = PSG[st.daily.psg];
    const monday = tdWriteTaskFor('2026-07-27');
    const tuesday = tdWriteTaskFor('2026-07-28');
    const thursday = tdWriteTaskFor('2026-07-30');
    const saturday = tdWriteTaskFor('2026-08-01');
    const weekDates = Array.from({ length: 7 }, (_, offset) => {
      const d = new Date(Date.UTC(2026, 6, 27 + offset));
      return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
    });
    const week211 = weekDates.map((date) => td211TaskFor(date));
    const week448 = weekDates.map((date) => tdWriteTaskFor(date));
    let exactProposal = '';
    for (let offset = -21; offset <= 21; offset += 1) {
      const d = new Date(Date.UTC(2026, 6, 27 + offset));
      const task = tdWriteTaskFor(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`);
      if (task.taskId === 'ncu-2022-448-proposal' && task.type === 'proposal') exactProposal = task.question;
    }
    const ncuPassages = PSG.filter((p) => String(p.s || '').includes('南昌大学'));
    const ncuMeta = ncuPassages.map((p) => ({ eligible: tdPsgEligible(p), meta: tdPsgMeta(p) }));
    const ncuMappings = TD_NCU_MS.map(([term, year]) => {
      const normalized = tdTermNorm(term);
      const matches = ms.filter((item) => tdTermNorm(item.q) === normalized);
      const correctlyMapped = matches.filter((item) => {
        const meta = tdNcuMsMeta(item);
        return meta && Number(meta.year) === Number(year);
      });
      return { term, year, matches: matches.length, correctlyMapped: correctlyMapped.length };
    });
    const ncuMissing = ncuMappings.filter((item) => item.correctlyMapped < 1);
    const ncuWrongCardinality = ncuMappings.filter((item) => item.matches !== 1);
    const scheduledNcuYear = Number(tdNcuDrillYear(st.daily.date, st.daily));
    const ncuDrillSample = [];
    st.daily.drillSeen = {};
    for (let i = 0; i < 6; i += 1) {
      const item = tdDrawDrill();
      const meta = tdNcuMsMeta(item);
      ncuDrillSample.push({ mapped: !!meta, year: meta ? Number(meta.year) : null, key: item && item.key });
      st.daily.drillSeen[item.key] = 1;
    }
    const eligiblePassages = PSG.filter((passage) => tdPsgEligible(passage));
    const transThresholds = eligiblePassages.map((passage) => ({
      direction: passage.d,
      sourceUnits: passage.d === '英译汉'
        ? String(passage.src || '').trim().split(/\s+/).filter(Boolean).length
        : String(passage.src || '').replace(/\s/g, '').length,
      minUnits: Number(tdTransMinUnits(passage, st.daily))
    })).filter((item) => Number.isFinite(item.minUnits) && item.minUnits > 0);
    const thresholdByDirection = ['英译汉', '汉译英'].map((direction) => {
      const rows = transThresholds.filter((item) => item.direction === direction).sort((a, b) => a.sourceUnits - b.sourceUnits);
      return {
        direction,
        count: rows.length,
        shortest: rows[0] || null,
        longest: rows[rows.length - 1] || null,
        monotonic: rows.every((row, index) => index === 0 || row.minUnits >= rows[index - 1].minUnits)
      };
    });
    const todayPassage = PSG[st.daily.psg];
    const todayTransMin = Number(tdTransMinUnits(todayPassage, st.daily));
    const politicsBlank = tdPoliticsReady(st.daily);

    TD_DONE_KEYS.forEach((key) => { st.daily.done[key] = 1; });
    const validPoliticsEvidence = {
      lessonId: initialPoliticsLesson.id,
      conceptChecked: 1,
      resource: '肖秀荣《精讲精练》与1000题',
      scope: '马克思主义基本原理第1至2章：物质观、实践观与认识论',
      answered: st.daily.politicsPlan.target,
      correct: st.daily.politicsPlan.target - 3,
      wrongNote: '今天三道错题分别源于概念边界混淆、材料关键词漏看和干扰项绝对化，明天先重做后再核对。',
      framework: '闭卷框架：先写核心概念与适用条件，再写相邻概念区别，最后用一道材料题验证判断路径。'
    };
    st.daily.politics = { ...validPoliticsEvidence, resource: '' };
    const politicsMissingResource = tdPoliticsReady(st.daily);
    st.daily.politics = { ...validPoliticsEvidence, scope: '' };
    const politicsMissingScope = tdPoliticsReady(st.daily);
    st.daily.politics = { ...validPoliticsEvidence, conceptChecked: 0 };
    const politicsMissingConcept = tdPoliticsReady(st.daily);
    st.daily.politics = { ...validPoliticsEvidence };
    const politicsComplete = tdPoliticsReady(st.daily);
    st.daily.protocol = 1;
    st.daily.quality.vocab = { seen: {}, firstCorrect: 8, total: 10 };
    st.daily.quality.drill = { seen: {}, firstCorrect: 5, total: 6 };
    st.daily.quality.read = { score: st.daily.e211.pass, outputUnits: st.daily.e211.minUnits };
    st.daily.quality.trans = {
      sourceEligible: true, sourceGrade: 'C', score: 70, corrected: 1, outputUnits: todayTransMin
    };
    st.daily.quality.write = {
      promptValid: true, sourceGrade: st.daily.wTask.sourceGrade,
      score: st.daily.wTask.pass, corrected: 1, outputUnits: st.daily.wTask.minUnits
    };
    st.daily.transRevision = '理解：第一句主语范围判断有误。逻辑：转折层级未体现。术语：两个固定译法需统一。语法：时态和主谓一致各一处。表达：三处中式搭配。可复用表达一至八逐项整理。最差句一完整重译并说明调整，最差句二完整重译并说明调整。'.repeat(2);
    st.daily.writeRevision = '本次得分达到当日线。修改一补足受众和目的，修改二把空泛论据换成具体事实，修改三重写结尾以回应题目。最弱段落已经按观点句、论据、分析和回扣四步完整改写。'.repeat(2);
    st.daily.retest = {
      politics: '重做今天三道政治错题并闭卷复述完整知识框架。',
      english: '重测五个错词、一个长句和今天的阅读证据定位。',
      translation: '遮住答案重译两个最差句并核对三个术语选择。',
      writing: '重答两个漏点名解并闭卷复述今天的写作提纲。'
    };
    st.daily.quality.listen = { materialId: 'daily-source', minutes: 15, retell: true };
    st.daily.gt = null;
    const beforeNight = tdQualification(st.daily);
    cur = 'today';
    render();
    const countSnapshot = () => ({
      tasks: document.querySelector('[data-testid="td-task-count"]')?.textContent.trim() || '',
      subjects: document.querySelector('[data-testid="td-subject-count"]')?.textContent.trim() || '',
      gates: document.querySelector('[data-testid="td-gate-count"]')?.textContent.trim() || ''
    });
    const beforeNightCounts = countSnapshot();

    st.log = [
      { t: VOCAB[0][0], ty: '词汇', ok: false, d: '2026-7-27' },
      { t: ci[0].q, ty: '词条', ok: false, d: '2026-7-27' },
      { t: ms[0].q, ty: '名解', ok: true, d: '2026-7-27' }
    ];
    const night = tdGtBuild();
    st.daily.gt = { done: 1, passed: 1, list: night, pos: night.length, ok: night.length, wrong: 0 };
    const afterNight = tdQualification(st.daily);
    st.daily.protocol = 0;
    const gateRecoveryAction = tdNextAction(st.daily);
    st.daily.protocol = 1;
    render();
    const afterNightCounts = countSnapshot();

    const savedPoliticsCorrect = st.daily.politics.correct;
    st.daily.politics.correct = 0;
    const lowPolitics = tdQualification(st.daily);
    st.daily.politics.correct = savedPoliticsCorrect;
    const savedRetestEnglish = st.daily.retest.english;
    st.daily.retest.english = '';
    const incompleteRetest = tdQualification(st.daily);
    st.daily.retest.english = savedRetestEnglish;

    const savedTransRevision = st.daily.transRevision;
    st.daily.transRevision = '';
    const missingTransRevision = tdQualification(st.daily);
    st.daily.transRevision = savedTransRevision;
    const savedWriteRevision = st.daily.writeRevision;
    st.daily.writeRevision = '';
    const missingWriteRevision = tdQualification(st.daily);
    st.daily.writeRevision = savedWriteRevision;

    st.daily.quality.trans.score = 69;
    const transBelow = tdQualification(st.daily);
    st.daily.quality.trans.score = 70;
    st.daily.quality.write.score = st.daily.wTask.pass - 1;
    const writeBelow = tdQualification(st.daily);
    st.daily.quality.write.score = st.daily.wTask.pass;
    st.daily.gt.passed = 0;
    const nightBelow = tdQualification(st.daily);
    st.daily.gt.passed = 1;

    const writeScoreBeforeManual = st.daily.quality.write.score;
    aiMode = 'write';
    aiWReq = st.daily.wReq;
    tdSetSession(null);
    tdOnJudged(null, `【得分】${st.daily.wTask.max}/${st.daily.wTask.max}`, 'manual writing outside today task', { mode: 'write', wReq: st.daily.wReq });
    const generalWriteIgnored = st.daily.quality.write.score === writeScoreBeforeManual;
    const transScoreBeforeManual = st.daily.quality.trans.score;
    aiMode = 'trans';
    aiPsg = st.daily.psg;
    tdSetSession(null);
    tdOnJudged(null, '【得分】100/100', 'manual translation outside today task', { mode: 'trans', psg: st.daily.psg });
    const generalTransIgnored = st.daily.quality.trans.score === transScoreBeforeManual;

    const qualifiedSnapshot = JSON.stringify(st.daily);
    const resetQualifiedDaily = () => {
      st.daily = JSON.parse(qualifiedSnapshot);
      tdSetSession(null);
      aiChain = false;
    };
    const retryState = (buttonId) => {
      cur = 'today';
      render();
      const button = document.getElementById(buttonId);
      return { visible: visible(button), text: button ? button.textContent.trim() : '' };
    };

    resetQualifiedDaily();
    st.daily.done.read = 1;
    aiMode = 'read';
    tdSetSession({ task: 'read', taskId: st.daily.e211.taskId });
    tdOnJudged(
      null,
      `【得分】${st.daily.e211.pass - 1}/${st.daily.e211.max}`,
      'word '.repeat(st.daily.e211.minUnits + 2),
      { mode: 'read' }
    );
    const lowReadState = {
      done: st.daily.done.read,
      action: actionKeyOf(tdNextAction(st.daily)),
      retry: retryState('tdBtnRead')
    };

    resetQualifiedDaily();
    st.daily.done.trans = 1;
    aiMode = 'trans';
    aiPsg = st.daily.psg;
    tdSetSession({ task: 'trans', psg: st.daily.psg });
    tdOnJudged(
      null,
      '【得分】69/100',
      outputForTranslation(PSG[st.daily.psg], todayTransMin),
      { mode: 'trans', psg: st.daily.psg }
    );
    const lowTransState = {
      done: st.daily.done.trans,
      action: actionKeyOf(tdNextAction(st.daily)),
      retry: retryState('tdBtnTr')
    };

    resetQualifiedDaily();
    st.daily.done.write = 1;
    aiMode = 'write';
    aiWReq = st.daily.wReq;
    tdSetSession({ task: 'write', taskId: st.daily.wTask.taskId, req: st.daily.wReq });
    tdOnJudged(
      null,
      `【得分】${st.daily.wTask.pass - 1}/${st.daily.wTask.max}`,
      '写'.repeat(st.daily.wTask.minUnits),
      { mode: 'write', wReq: st.daily.wReq }
    );
    const lowWriteState = {
      done: st.daily.done.write,
      action: actionKeyOf(tdNextAction(st.daily)),
      retry: retryState('tdBtnWr')
    };

    resetQualifiedDaily();
    st.daily.done.trans = 1;
    aiMode = 'trans';
    aiPsg = st.daily.psg;
    tdSetSession({ task: 'trans', psg: st.daily.psg });
    tdOnJudged(
      null,
      '【得分】100/100',
      outputForTranslation(PSG[st.daily.psg], todayTransMin - 1),
      { mode: 'trans', psg: st.daily.psg }
    );
    const shortTransRejected = st.daily.done.trans === 0;

    resetQualifiedDaily();
    st.daily.done.write = 1;
    aiMode = 'write';
    aiWReq = st.daily.wReq;
    tdSetSession({ task: 'write', taskId: st.daily.wTask.taskId, req: st.daily.wReq });
    tdOnJudged(
      null,
      `【得分】${st.daily.wTask.max}/${st.daily.wTask.max}`,
      '写'.repeat(st.daily.wTask.minUnits - 1),
      { mode: 'write', wReq: st.daily.wReq }
    );
    const shortWriteRejected = st.daily.done.write === 0;

    resetQualifiedDaily();

    const readSnapshot = { ...st.daily.quality.read };
    st.daily.done.read = 1;
    aiMode = 'read';
    tdSetSession({ task: 'read', taskId: st.daily.e211.taskId });
    tdOnJudged(null, 'AI response without a score line', 'word '.repeat(st.daily.e211.minUnits), { mode: 'read' });
    const scorelessReadState = { done: st.daily.done.read, score: st.daily.quality.read.score, taskId: st.daily.e211.taskId };
    const scorelessReadRejected = st.daily.done.read === 0 && st.daily.quality.read.score === null;
    st.daily.quality.read = readSnapshot;
    st.daily.done.read = 1;
    const transSnapshot = { ...st.daily.quality.trans };
    st.daily.done.trans = 1;
    aiMode = 'trans';
    aiPsg = st.daily.psg;
    tdSetSession({ task: 'trans', psg: st.daily.psg });
    tdOnJudged(null, 'AI response without a score line', '译文有效输出'.repeat(20), { mode: 'trans', psg: st.daily.psg });
    const scorelessTransRejected = st.daily.done.trans === 0 && st.daily.quality.trans.score === null;
    st.daily.quality.trans = transSnapshot;
    st.daily.done.trans = 1;
    const writeSnapshot = { ...st.daily.quality.write };
    st.daily.done.write = 1;
    aiMode = 'write';
    aiWReq = st.daily.wReq;
    tdSetSession({ task: 'write', taskId: st.daily.wTask.taskId, req: st.daily.wReq });
    tdOnJudged(null, 'AI response without a score line', '写作有效输出'.repeat(20), { mode: 'write', wReq: st.daily.wReq });
    const scorelessWriteRejected = st.daily.done.write === 0 && st.daily.quality.write.score === null;
    st.daily.quality.write = writeSnapshot;
    st.daily.done.write = 1;

    let draftPushes = 0;
    const realCloudPush = cloudPush;
    cloudPush = () => { draftPushes += 1; };
    tdDraftSave();
    tdDraftSave();
    await new Promise((resolve) => setTimeout(resolve, 950));
    cloudPush = realCloudPush;

    cur = 'today';
    render();
    const completionText = document.querySelector('[data-testid="td-completion"]')?.textContent || '';
    const qualificationText = document.querySelector('[data-testid="td-qualified"]')?.textContent || '';
    const planTotal = document.querySelector('[data-testid="td-plan-total"]')?.textContent || '';
    const politicsProof = !!document.querySelector('[data-testid="td-politics-proof"]');
    const politicsResource = document.querySelector('[data-testid="td-politics-resource"]');
    const politicsScope = document.querySelector('[data-testid="td-politics-scope"]');
    const politicsLesson = document.querySelector('[data-testid="td-politics-lesson"]');
    const politicsConcept = document.querySelector('[data-testid="td-politics-concept"]');
    const politicsTree = document.querySelector('[data-testid="td-politics-tree"]');
    const politicsPointCount = document.querySelectorAll('[data-testid="td-politics-points"] li').length;
    const politicsTreeLessonCount = document.querySelectorAll('[data-testid="td-politics-tree-lesson"]').length;
    if (politicsConcept) politicsConcept.dispatchEvent(new Event('change', { bubbles: true }));
    const politicsCompletionSaved = !!(st.politicsLearning && st.politicsLearning.completed && st.politicsLearning.completed[st.daily.politics.lessonId]);
    const pageWidth = document.documentElement.scrollWidth;
    const viewportWidth = document.documentElement.clientWidth;
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const stageProgress = [...document.querySelectorAll('.td-stage-progress')].map((node) => ({
      role: node.getAttribute('role'),
      label: node.getAttribute('aria-label'),
      now: node.getAttribute('aria-valuenow'),
      max: node.getAttribute('aria-valuemax')
    }));
    const rushRoadmap = tdRoadmapHtml({ ...st.daily, politicsPlan: { ...st.daily.politicsPlan, phase: '冲刺整合', minutes: 90 } });

    return {
      missing,
      dueLen: due.length,
      dueAllValid: due.every((x) => st.srs[x.key] && st.srs[x.key].due <= Date.now()),
      newLen: fresh.length,
      newAllValid: fresh.every((x) => !st.srs[x.key]),
      dueNewOverlap,
      actualDueQueue,
      actualDueAllValid,
      actualNewQueue,
      actualNewAllValid,
      badPracticeEligible: tdPsgEligible(PSG[74]),
      badVocabUsable: tdVocabUsable(['adj', '形容词']),
      generatedEligible: tdPsgEligible(generated),
      initialNextState,
      weekPlanState,
      ncuMeta,
      ncuTermCount: TD_NCU_MS.length,
      ncuMissing,
      ncuWrongCardinality,
      scheduledNcuYear,
      ncuDrillSample,
      transThresholds,
      thresholdByDirection,
      todayTransMin,
      monday,
      exactProposal,
      applicationLinked: monday.taskId === thursday.taskId,
      essayLinked: tuesday.taskId === saturday.taskId,
      week211Kinds: week211.map((x) => x.kind),
      week211Grades: week211.map((x) => x.sourceGrade),
      week211WritingMins: week211.filter((x) => x.kind === 'writing').map((x) => x.minUnits),
      week448Mins: week448.map((x) => x.minUnits),
      politicsLessonCount: politicsLessons.length,
      politicsSubjectCount: TD_POLITICS_TREE.length,
      initialPoliticsLesson,
      nextPoliticsLesson,
      politicsBlank,
      politicsMissingResource,
      politicsMissingScope,
      politicsMissingConcept,
      politicsComplete,
      beforeNight,
      beforeNightCounts,
      afterNight,
      afterNightCounts,
      gateRecoveryAction,
      lowPolitics,
      incompleteRetest,
      missingTransRevision,
      missingWriteRevision,
      transBelow,
      writeBelow,
      nightBelow,
      generalWriteIgnored,
      generalTransIgnored,
      lowReadState,
      lowTransState,
      lowWriteState,
      shortTransRejected,
      shortWriteRejected,
      scorelessReadRejected,
      scorelessReadState,
      scorelessTransRejected,
      scorelessWriteRejected,
      draftPushes,
      night,
      expectedNight: ['v|' + VOCAB[0][0], ci[0].key, ms[0].key],
      completionText,
      qualificationText,
      planTotal,
      politicsProof,
      politicsResource: politicsResource ? politicsResource.value : null,
      politicsScope: politicsScope ? politicsScope.value : null,
      politicsLessonVisible: visible(politicsLesson),
      politicsConceptChecked: politicsConcept ? politicsConcept.checked : false,
      politicsTreeVisible: visible(politicsTree),
      politicsPointCount,
      politicsTreeLessonCount,
      politicsCompletionSaved,
      duplicateIds,
      stageProgress,
      rushRoadmap,
      noHorizontalOverflow: pageWidth <= viewportWidth + 1
    };
  });

  assert.deepEqual(result.missing, [], 'today acceptance API is incomplete');
  assert.equal(result.dueLen, 2, 'due queue must contain due cards only');
  assert(result.dueAllValid);
  assert.equal(result.newLen, 10, 'new queue must respect its explicit limit');
  assert(result.newAllValid);
  assert.equal(result.dueNewOverlap, false);
  assert.equal(result.actualDueQueue.length, 1, 'the live due-only button ignored its limit');
  assert.equal(result.actualDueAllValid, true, 'live due queue contains a non-due card');
  assert.equal(result.actualNewQueue.length, 2, 'the live new-only button ignored its limit');
  assert.equal(result.actualNewAllValid, true, 'live new queue contains a learned card');
  assert.equal(result.badPracticeEligible, false, 'PSG[74] is a substitute passage and must be excluded');
  assert.equal(result.badVocabUsable, false, 'POS-only OCR rows must not enter daily vocabulary');
  assert.equal(result.generatedEligible, true, 'daily translation must pass the source filter');
  assert(result.initialNextState.key, `the top next action has no executable key: ${JSON.stringify(result.initialNextState)}`);
  assert(result.initialNextState.label || result.initialNextState.buttonText, 'the top next action has no user-facing label');
  assert.equal(result.initialNextState.panel, true, 'the top next-action panel is missing');
  assert.equal(result.initialNextState.button, true, 'the top next-action button is not visible');
  assert.deepEqual(result.weekPlanState, { days: 7, today: 1, has211: true, has448: true }, 'weekly 211/448 route is incomplete');
  assert(result.ncuMeta.length >= 2, 'the two NCU 357 recall passages should be discoverable');
  assert(result.ncuMeta.every((x) => x.eligible), 'usable NCU question text must not be excluded by a weak reference translation');
  assert(result.ncuMeta.some((x) => x.meta.referenceGrade === 'D'), 'weak NCU references must remain visibly D-grade');
  assert.equal(result.ncuTermCount, 48, 'the NCU 2021/2022 recall list must contain all 48 terms');
  assert.deepEqual(result.ncuMissing, [], `NCU recall terms missing or mapped to the wrong year: ${JSON.stringify(result.ncuMissing)}`);
  assert.deepEqual(result.ncuWrongCardinality, [], `each NCU recall term must map to exactly one drill card: ${JSON.stringify(result.ncuWrongCardinality)}`);
  assert([2021, 2022].includes(result.scheduledNcuYear), `invalid scheduled NCU drill year: ${result.scheduledNcuYear}`);
  assert(result.ncuDrillSample.every((item) => item.mapped), `daily 448 drill left the NCU recall pool: ${JSON.stringify(result.ncuDrillSample)}`);
  assert(result.ncuDrillSample.every((item) => item.year === result.scheduledNcuYear), `daily 448 drill mixed recall years: ${JSON.stringify(result.ncuDrillSample)}`);
  assert(result.transThresholds.length >= 2, 'dynamic 357 output thresholds were not generated');
  assert(new Set(result.transThresholds.map((item) => item.minUnits)).size > 1, '357 output threshold is still a fixed constant');
  assert(result.thresholdByDirection.every((item) => item.count > 0 && item.monotonic), `357 thresholds must grow with passage length: ${JSON.stringify(result.thresholdByDirection)}`);
  assert(Number.isFinite(result.todayTransMin) && result.todayTransMin > 1, `invalid current 357 threshold: ${result.todayTransMin}`);
  assert(result.monday.question.trim().length >= 40, 'daily writing prompt is incomplete');
  assert(result.monday.requiredPoints.length >= 3, 'daily writing prompt lacks required points');
  assert.equal(result.applicationLinked, true, 'Monday outline and Thursday application must use the same task');
  assert.equal(result.essayLinked, true, 'Tuesday outline and Saturday essay must use the same task');
  assert.match(result.exactProposal, /垃圾分类成为急待解决的问题/);
  assert.deepEqual(result.week211Kinds.sort(), ['precision', 'precision', 'read', 'read', 'weekly', 'writing', 'writing']);
  assert.equal(result.week211Grades.filter((grade) => grade === 'C').length, 2, 'the two weekly 211 writing slots should use verified multi-school recall questions');
  assert.equal(result.week211Grades.filter((grade) => grade === 'D').length, 5, 'non-writing 211 ability training must remain visibly D-grade');
  assert(result.week211WritingMins.length > 0 && result.week211WritingMins.every((min) => min >= 400), `211 recall writing must require about 400 words: ${result.week211WritingMins}`);
  assert.equal(result.week448Mins.length, 7, 'every weekday needs a 448 output threshold');
  [100, 150, 300, 400, 400, 800, 200].forEach((minimum, index) => {
    assert(result.week448Mins[index] >= minimum, `448 day ${index + 1} minUnits ${result.week448Mins[index]} is below ${minimum}`);
  });
  assert.equal(result.politicsSubjectCount, 5, 'the political knowledge tree must contain all five subjects');
  assert.equal(result.politicsLessonCount, 53, 'the political knowledge tree must contain all 53 course units');
  assert.equal(result.initialPoliticsLesson.id, 'marx-01', 'a fresh learner must start from the first knowledge unit');
  assert.notEqual(result.nextPoliticsLesson.id, result.initialPoliticsLesson.id, 'the next day must advance after a unit is completed');
  assert.equal(result.politicsBlank, false, 'blank political evidence must not pass');
  assert.equal(result.politicsMissingResource, false, '101 must require the textbook or question-bank name');
  assert.equal(result.politicsMissingScope, false, '101 must require the chapter or knowledge scope');
  assert.equal(result.politicsMissingConcept, false, '101 must require an active closed-book knowledge-point check');
  assert.equal(result.politicsComplete, true, 'complete 101 evidence should pass');
  assert.equal(result.beforeNight.qualified, false, 'completion must not bypass the evening test');
  assert.match(result.beforeNightCounts.tasks, /9\s*\/\s*9/, `task count is not independently rendered: ${JSON.stringify(result.beforeNightCounts)}`);
  assert.match(result.beforeNightCounts.subjects, /4\s*\/\s*4/, `subject count is not independently rendered: ${JSON.stringify(result.beforeNightCounts)}`);
  assert.match(result.beforeNightCounts.gates, /3\s*\/\s*4/, `gate count must remain 3/4 before the evening retention gate: ${JSON.stringify(result.beforeNightCounts)}`);
  assert.equal(result.afterNight.qualified, true, `all four gates should qualify the day: ${JSON.stringify(result.afterNight)}`);
  assert.equal(result.gateRecoveryAction.key, 'quality', `an incomplete qualification gate must not generate the daily report: ${JSON.stringify(result.gateRecoveryAction)}`);
  assert.match(result.afterNightCounts.gates, /4\s*\/\s*4/, `all four gates should render independently after qualification: ${JSON.stringify(result.afterNightCounts)}`);
  assert.equal(result.lowPolitics.qualified, false, '0% political accuracy must not pass with notes alone');
  assert.equal(result.incompleteRetest.qualified, false, 'all four next-day retest fields are required');
  assert.equal(result.missingTransRevision.qualified, false, 'translation requires a structured revision artifact');
  assert.equal(result.missingWriteRevision.qualified, false, 'writing requires a revision artifact');
  assert.equal(result.transBelow.qualified, false, '69% translation must remain below the 70% line');
  assert.equal(result.writeBelow.qualified, false, 'writing below its task-specific line must fail');
  assert.equal(result.nightBelow.qualified, false, 'failed evening retention must block qualification');
  assert.equal(result.generalWriteIgnored, true, 'general writing AI must not overwrite the daily writing task');
  assert.equal(result.generalTransIgnored, true, 'general translation AI must not overwrite the daily translation task');
  assert.equal(result.lowReadState.done, 0, `a below-pass 211 score must remain incomplete: ${JSON.stringify(result.lowReadState)}`);
  assert.match(result.lowReadState.action, /read|211/, `211 low score is not the next retry action: ${JSON.stringify(result.lowReadState)}`);
  assert.equal(result.lowReadState.retry.visible, true, '211 low score has no visible retry button');
  assert.equal(result.lowTransState.done, 0, `a 69% 357 score must remain incomplete: ${JSON.stringify(result.lowTransState)}`);
  assert.match(result.lowTransState.action, /trans|357/, `357 low score is not the next retry action: ${JSON.stringify(result.lowTransState)}`);
  assert.equal(result.lowTransState.retry.visible, true, '357 low score has no visible retry button');
  assert.equal(result.lowWriteState.done, 0, `a below-pass 448 score must remain incomplete: ${JSON.stringify(result.lowWriteState)}`);
  assert.match(result.lowWriteState.action, /write|448/, `448 low score is not the next retry action: ${JSON.stringify(result.lowWriteState)}`);
  assert.equal(result.lowWriteState.retry.visible, true, '448 low score has no visible retry button');
  assert.equal(result.shortTransRejected, true, '357 output below its dynamic minimum must not complete');
  assert.equal(result.shortWriteRejected, true, '448 output below the day-specific minimum must not complete');
  assert.equal(result.scorelessReadRejected, true, `scoreless 211 output must not complete the daily task: ${JSON.stringify(result.scorelessReadState)}`);
  assert.equal(result.scorelessTransRejected, true, 'scoreless 357 output must not complete the daily task');
  assert.equal(result.scorelessWriteRejected, true, 'scoreless 448 output must not complete the daily task');
  assert.equal(result.draftPushes, 1, 'draft cloud sync should debounce rapid typing');
  for (const key of result.expectedNight) assert(result.night.includes(key), `evening test omitted ${key}`);
  assert.match(result.completionText, /任务(?:完成)?\s*9\/9/);
  assert.match(result.qualificationText, /今日四科训练合格/);
  assert.match(result.planTotal, /420\s*分钟/);
  assert.equal(result.politicsProof, true, '101 evidence form is missing');
  assert.equal(result.politicsResource, '肖秀荣《精讲精练》与1000题', '101 resource input did not persist into the rendered form');
  assert.equal(result.politicsScope, '马克思主义基本原理第1至2章：物质观、实践观与认识论', '101 scope input did not persist into the rendered form');
  assert.equal(result.politicsLessonVisible, true, 'today political knowledge unit is not visible');
  assert.equal(result.politicsConceptChecked, true, 'today political knowledge check did not persist');
  assert.equal(result.politicsTreeVisible, true, 'the complete nested political knowledge tree is missing');
  assert(result.politicsPointCount >= 3, 'today political unit lacks concrete knowledge points');
  assert.equal(result.politicsTreeLessonCount, 53, 'the rendered nested tree is incomplete');
  assert.equal(result.politicsCompletionSaved, true, 'finishing today political unit did not update the persistent progression');
  assert.deepEqual(result.duplicateIds, [], `duplicate ids in today view: ${result.duplicateIds.join(', ')}`);
  assert(result.stageProgress.length >= 4 && result.stageProgress.every((item) => item.role === 'progressbar' && item.label && item.now !== null && item.max !== null), `stage progress lacks accessible semantics: ${JSON.stringify(result.stageProgress)}`);
  assert.match(result.rushRoadmap, /435 分钟/);
  assert.match(result.rushRoadmap, /知识点学习25 \+ 选择题45 \+ 错因\/框架20/);
  assert.equal(result.noHorizontalOverflow, true, 'desktop today view overflows horizontally');
  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join('; ')}`);

  await page.evaluate(() => {
    tdListenAudioStop('');
    Object.assign(window.__speechProbe, { speak: 0, pause: 0, resume: 0, cancel: 0, current: null });
    cur = 'today';
    render();
  });
  const listenToggle = page.getByTestId('td-listen-toggle');
  const listenStatus = page.getByTestId('td-listen-status');
  const listenUi = async () => page.evaluate(() => {
    const toggle = document.querySelector('[data-testid="td-listen-toggle"]');
    const status = document.querySelector('[data-testid="td-listen-status"]');
    return {
      state: toggle?.getAttribute('data-state') || '',
      pressed: toggle?.getAttribute('aria-pressed') || '',
      text: toggle?.textContent.trim() || '',
      status: status?.textContent.trim() || '',
      probe: { ...window.__speechProbe, current: !!window.__speechProbe.current }
    };
  });
  let audioState = await listenUi();
  assert.equal(audioState.state, 'idle');
  assert.equal(audioState.pressed, 'false');
  assert.match(audioState.text, /开始播放|重新播放/);

  await listenToggle.click();
  audioState = await listenUi();
  assert.equal(audioState.state, 'playing', `listen did not enter playing: ${JSON.stringify(audioState)}`);
  assert.equal(audioState.pressed, 'true');
  assert.match(audioState.text, /暂停/);
  assert.match(audioState.status, /正在播放/);
  assert.equal(audioState.probe.speak, 1, 'today listening did not start one utterance');

  await listenToggle.click();
  audioState = await listenUi();
  assert.equal(audioState.state, 'paused', `listen did not pause: ${JSON.stringify(audioState)}`);
  assert.match(audioState.text, /继续/);
  assert.equal(audioState.probe.pause, 1, 'pause was not forwarded to speechSynthesis');

  await listenToggle.click();
  audioState = await listenUi();
  assert.equal(audioState.state, 'playing', `listen did not resume: ${JSON.stringify(audioState)}`);
  assert.equal(audioState.probe.resume, 1, 'resume was not forwarded to speechSynthesis');
  assert.equal(audioState.probe.speak, 1, 'resume restarted the material instead of continuing it');

  await page.evaluate(() => render());
  audioState = await listenUi();
  assert.equal(audioState.state, 'playing', `Today re-render lost the active listening state: ${JSON.stringify(audioState)}`);
  assert.match(audioState.text, /暂停/);

  await page.locator('#tdListenStop').click();
  audioState = await listenUi();
  assert.equal(audioState.state, 'idle');
  assert.match(audioState.status, /已停止/);
  assert(audioState.probe.cancel >= 1, 'stop did not cancel speechSynthesis');

  await listenToggle.click();
  const cancelBeforeLeave = await page.evaluate(() => window.__speechProbe.cancel);
  await page.evaluate(() => go('dash'));
  assert((await page.evaluate(() => window.__speechProbe.cancel)) > cancelBeforeLeave, 'leaving Today did not stop listening audio');
  await page.evaluate(() => go('today'));
  audioState = await listenUi();
  assert.equal(audioState.state, 'idle', `listening state leaked after navigation: ${JSON.stringify(audioState)}`);

  const desktopListenLayout = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const card = rect('[data-testid="td-listen-card"]');
    const controls = rect('[data-testid="td-listen-controls"]');
    const retell = rect('[data-testid="td-listen-retell"]');
    const toggle = rect('[data-testid="td-listen-toggle"]');
    const inside = (child, parent) => !!child && !!parent && child.left >= parent.left - 1
      && child.right <= parent.right + 1 && child.top >= parent.top - 1 && child.bottom <= parent.bottom + 1;
    const host = document.querySelector('[data-testid="td-listen-card"]');
    return {
      noOverflow: !!host && host.scrollWidth <= host.clientWidth + 1,
      controlsInside: inside(controls, card),
      retellInside: inside(retell, card),
      ordered: !!controls && !!retell && controls.bottom <= retell.top + 1,
      toggleHeight: toggle?.height || 0
    };
  });
  assert.equal(desktopListenLayout.noOverflow, true, `desktop listening card overflows: ${JSON.stringify(desktopListenLayout)}`);
  assert.equal(desktopListenLayout.controlsInside, true, 'desktop listening controls escaped their card');
  assert.equal(desktopListenLayout.retellInside, true, 'desktop retell field escaped its card');
  assert.equal(desktopListenLayout.ordered, true, 'desktop listening controls overlap the retell field');
  assert(desktopListenLayout.toggleHeight >= 44, `desktop listening control is below 44px: ${desktopListenLayout.toggleHeight}`);

  const mobile = await context.newPage();
  const mobileErrors = [];
  mobile.on('pageerror', (error) => mobileErrors.push(error.message));
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === baseOrigin ? route.continue() : route.abort();
  });
  await mobile.goto(freshUrl('mobile'), { waitUntil: 'domcontentloaded' });
  await mobile.evaluate(() => {
    st = { srs: {}, streak: 0, lastDay: '', todayDay: '', todayCount: 0, history: {}, totalRev: 0, log: [] };
    tdGen();
    cur = 'today';
    render();
  });
  const mobileState = await mobile.evaluate(() => {
    const isVisible = (element) => !!element && getComputedStyle(element).display !== 'none'
      && getComputedStyle(element).visibility !== 'hidden' && element.getBoundingClientRect().height > 0;
    const columns = (selector) => {
      const element = document.querySelector(selector);
      return element ? getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length : 0;
    };
    const mnav = document.getElementById('mnav');
    const mnavRect = mnav ? mnav.getBoundingClientRect() : null;
    const majorButtons = [...document.querySelectorAll('.td-next-btn,.td-go,.td-tech>.ai-send,.td-sumbox>.ai-send,.td-listen-toggle,.td-listen-stop')]
      .filter(isVisible)
      .map((button) => ({ id: button.id, text: button.textContent.trim(), height: button.getBoundingClientRect().height }));
    const listenCard = document.querySelector('[data-testid="td-listen-card"]');
    const listenControls = document.querySelector('[data-testid="td-listen-controls"]');
    const listenRetell = document.querySelector('[data-testid="td-listen-retell"]');
    const listenToggle = document.querySelector('[data-testid="td-listen-toggle"]');
    const listenComplete = document.querySelector('.td-listen-complete');
    const politicsLesson = document.querySelector('[data-testid="td-politics-lesson"]');
    const politicsTree = document.querySelector('[data-testid="td-politics-tree"]');
    const cardRect = listenCard?.getBoundingClientRect();
    const controlsRect = listenControls?.getBoundingClientRect();
    const retellRect = listenRetell?.getBoundingClientRect();
    const toggleRect = listenToggle?.getBoundingClientRect();
    const completeRect = listenComplete?.getBoundingClientRect();
    const insideCard = (child) => !!child && !!cardRect && child.left >= cardRect.left - 1
      && child.right <= cardRect.right + 1 && child.top >= cardRect.top - 1 && child.bottom <= cardRect.bottom + 1;
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      planColumns: columns('.td-plan-grid'),
      proofColumns: columns('.td-proof'),
      gateColumns: columns('.td-qgates'),
      politicsPointColumns: columns('.td-pol-points'),
      politicsLessonInside: !!politicsLesson && politicsLesson.getBoundingClientRect().left >= -1 && politicsLesson.getBoundingClientRect().right <= innerWidth + 1,
      politicsTreeInside: !!politicsTree && politicsTree.getBoundingClientRect().left >= -1 && politicsTree.getBoundingClientRect().right <= innerWidth + 1,
      total: document.querySelector('[data-testid="td-plan-total"]')?.textContent || '',
      mnav: {
        visible: isVisible(mnav),
        display: mnav ? getComputedStyle(mnav).display : '',
        height: mnavRect ? mnavRect.height : 0,
        insideViewport: !!mnavRect && mnavRect.bottom <= innerHeight + 1 && mnavRect.bottom >= innerHeight - 2
      },
      majorButtons,
      listen: {
        noOverflow: !!listenCard && listenCard.scrollWidth <= listenCard.clientWidth + 1,
        controlsInside: insideCard(controlsRect),
        retellInside: insideCard(retellRect),
        controlsBeforeRetell: !!controlsRect && !!retellRect && controlsRect.bottom <= retellRect.top + 1,
        toggleHeight: toggleRect?.height || 0,
        completeHeight: completeRect?.height || 0,
        toggleWidth: toggleRect?.width || 0,
        controlsWidth: controlsRect?.width || 0
      }
    };
  });
  assert.equal(mobileState.overflow, false, '390px today view overflows horizontally');
  assert.equal(mobileState.planColumns, 1, '390px roadmap must collapse to one column');
  assert.equal(mobileState.proofColumns, 1, '390px politics proof must collapse to one column');
  assert.equal(mobileState.gateColumns, 1, '390px qualification gates must collapse to one column');
  assert.equal(mobileState.politicsPointColumns, 1, '390px political knowledge points must collapse to one column');
  assert.equal(mobileState.politicsLessonInside, true, '390px political lesson escaped the viewport');
  assert.equal(mobileState.politicsTreeInside, true, '390px political tree escaped the viewport');
  assert.equal(mobileState.mnav.visible, true, `390px mobile navigation is hidden: ${JSON.stringify(mobileState.mnav)}`);
  assert.notEqual(mobileState.mnav.display, 'none', '390px mobile navigation computed display is none');
  assert.equal(mobileState.mnav.insideViewport, true, `mobile navigation is outside the viewport: ${JSON.stringify(mobileState.mnav)}`);
  assert(mobileState.mnav.height >= 44, `mobile navigation tap area is below 44px: ${mobileState.mnav.height}`);
  assert(mobileState.majorButtons.length >= 3, `not enough visible primary actions for mobile QA: ${JSON.stringify(mobileState.majorButtons)}`);
  assert(mobileState.majorButtons.every((button) => button.height >= 44), `mobile primary action below 44px: ${JSON.stringify(mobileState.majorButtons)}`);
  assert.equal(mobileState.listen.noOverflow, true, `390px listening card overflows: ${JSON.stringify(mobileState.listen)}`);
  assert.equal(mobileState.listen.controlsInside, true, '390px listening controls escaped their card');
  assert.equal(mobileState.listen.retellInside, true, '390px retell field escaped its card');
  assert.equal(mobileState.listen.controlsBeforeRetell, true, '390px listening controls overlap the retell field');
  assert(mobileState.listen.toggleHeight >= 44, `390px listening toggle is below 44px: ${mobileState.listen.toggleHeight}`);
  assert(mobileState.listen.completeHeight >= 44, `390px completion control is below 44px: ${mobileState.listen.completeHeight}`);
  assert(mobileState.listen.toggleWidth >= mobileState.listen.controlsWidth * 0.55, `390px play control is still squeezed: ${JSON.stringify(mobileState.listen)}`);
  assert.match(mobileState.total, /420\s*分钟/);
  assert.deepEqual(mobileErrors, [], `mobile page errors: ${mobileErrors.join('; ')}`);

  await browser.close();
  console.log('PASS today qualification acceptance');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
