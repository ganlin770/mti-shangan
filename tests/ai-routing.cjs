const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.MTI_BASE_URL || 'http://127.0.0.1:4173/';
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const DEEPSEEK = 'deepseek-v4-flash';
const LUNA = 'gpt-5.6-luna';

assert.match(source, /aiCfg\.routing='dual-max-v1'/);
assert.match(source, /AI_MODEL_DEEPSEEK='deepseek-v4-flash'/);
assert.match(source, /AI_MODEL_LUNA='gpt-5\.6-luna'/);
assert.match(source, /if\(model===AI_MODEL_DEEPSEEK\)route\.thinking=\{type:'enabled'\}/);
assert.match(source, /route\.reasoning_effort='max'/);
assert.match(source, /function aiModelPeer\(m\)/);
assert.match(source, /function aiRouteSwitch\(route,reason\)/);
assert.match(source, /双模型请求均失败/);
assert.doesNotMatch(source, /data-ai-effort=/);

function sse(text) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await context.addInitScript(() => {
      if (localStorage.getItem('mti_ai_v1')) return;
      localStorage.setItem('mti_ai_v1', JSON.stringify({
        routing: 'kimi-primary-v2',
        model: 'kimi-k3',
        fast: false,
        key: 'test-only-gateway-key',
        efforts: { explain: 'low', free: 'high' }
      }));
    });

    const page = await context.newPage();
    const origin = new URL(base).origin;
    const requests = [];
    const plans = [];
    await page.route('**/*', async (route) => {
      const request = route.request();
      const target = new URL(request.url());
      if (target.origin === origin) return route.continue();
      if (!target.pathname.endsWith('/v1/chat/completions')) return route.abort();
      const body = request.postDataJSON();
      requests.push(body);
      const plan = plans.shift() || { status: 200, text: '默认成功' };
      if (plan.delay) await new Promise((resolve) => setTimeout(resolve, plan.delay));
      if (plan.status && plan.status !== 200) {
        return route.fulfill({
          status: plan.status,
          headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
          body: plan.body || JSON.stringify({ error: { message: 'planned failure' } })
        });
      }
      return route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'text/event-stream' },
        body: sse(plan.text || '成功')
      });
    });

    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const url = new URL(base);
    url.searchParams.set('__ai_routing', Date.now());
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { cur = 'ai'; render(); });
    await page.locator('.ai-mode[data-m="free"]').click();

    let config = await page.evaluate(() => JSON.parse(localStorage.getItem('mti_ai_v1')));
    assert.equal(config.routing, 'dual-max-v1');
    assert.equal(config.model, DEEPSEEK);
    assert.ok(Object.values(config.efforts).every((value) => value === 'max'));
    assert.equal(await page.locator('[data-ai-model="deepseek-v4-flash"]').count() > 0, true);
    assert.equal(await page.locator('[data-ai-model="gpt-5.6-luna"]').count() > 0, true);
    assert.equal(await page.locator('[data-ai-model-picker]').first().textContent().then((text) => /Low|High/.test(text)), false);

    // 已发出的任务冻结 DeepSeek；切换只影响下一次请求。
    plans.push({ delay: 350, text: '冻结模型成功' });
    await page.locator('#aiInput').fill('检查运行中任务冻结模型');
    await page.locator('#aiSend').click();
    await page.waitForFunction(() => window.fetch && document.querySelector('#aiOut'));
    while (requests.length < 1) await page.waitForTimeout(20);
    await page.locator('[data-ai-model="gpt-5.6-luna"]').first().click();
    await page.locator('#aiOut').getByText('冻结模型成功').waitFor();
    assert.equal(requests[0].model, DEEPSEEK);
    assert.equal(requests[0].reasoning_effort, 'max');
    assert.deepEqual(requests[0].thinking, { type: 'enabled' });
    config = await page.evaluate(() => JSON.parse(localStorage.getItem('mti_ai_v1')));
    assert.equal(config.model, LUNA);

    plans.push({ text: 'Luna 直接成功' });
    await page.locator('#aiInput').fill('检查 Luna Max');
    await page.locator('#aiSend').click();
    await page.locator('#aiOut').getByText('Luna 直接成功').waitFor();
    assert.equal(requests[1].model, LUNA);
    assert.equal(requests[1].reasoning_effort, 'max');
    assert.equal(Object.hasOwn(requests[1], 'thinking'), false);

    // 后台讲解捕获启动时的 Luna；切换全局模型后仍独立完成并保存真实模型。
    const beforeBackground = requests.length;
    plans.push({ delay: 350, text: '后台冻结成功' });
    await page.evaluate(() => {
      window.__qaCardJobStart({
        key: 'ci|background-model-freeze',
        q: '后台任务模型冻结',
        a: 'background route remains stable',
        type: '词条'
      });
    });
    while (requests.length === beforeBackground) await page.waitForTimeout(20);
    await page.locator('[data-ai-model="deepseek-v4-flash"]').first().click();
    await page.waitForFunction(() => {
      const rows = JSON.parse(localStorage.getItem('mti_ai_explain') || '{}');
      return rows['ci|background-model-freeze']?.x === '后台冻结成功';
    });
    const background = await page.evaluate(() => ({
      job: window.__qaCardJobSnapshot('ci|background-model-freeze'),
      saved: JSON.parse(localStorage.getItem('mti_ai_explain') || '{}')['ci|background-model-freeze']
    }));
    assert.equal(requests[beforeBackground].model, LUNA);
    assert.equal(background.job.model, LUNA);
    assert.equal(background.job.state, 'done');
    assert.equal(background.saved.m, LUNA);
    assert.equal(background.saved.e, 'max');
    await page.locator('[data-ai-model="gpt-5.6-luna"]').first().click();

    // Luna 故障后只切换 DeepSeek。
    const beforeReverseFallback = requests.length;
    plans.push(
      { status: 503, body: JSON.stringify({ error: { message: 'luna-first-failure-complete' } }) },
      { text: '反向备用成功' }
    );
    await page.locator('#aiInput').fill('检查 Luna 到 DeepSeek 备用');
    await page.locator('#aiSend').click();
    await page.locator('#aiOut').getByText('反向备用成功').waitFor();
    assert.deepEqual(requests.slice(beforeReverseFallback).map((body) => body.model), [LUNA, DEEPSEEK]);
    assert.deepEqual(requests[beforeReverseFallback + 1].thinking, { type: 'enabled' });

    // DeepSeek 故障后只切换 Luna。
    await page.locator('[data-ai-model="deepseek-v4-flash"]').first().click();
    const beforeForwardFallback = requests.length;
    plans.push(
      { status: 503, body: JSON.stringify({ error: { message: 'deepseek-first-failure-complete' } }) },
      { text: '正向备用成功' }
    );
    await page.locator('#aiInput').fill('检查 DeepSeek 到 Luna 备用');
    await page.locator('#aiSend').click();
    await page.locator('#aiOut').getByText('正向备用成功').waitFor();
    assert.deepEqual(requests.slice(beforeForwardFallback).map((body) => body.model), [DEEPSEEK, LUNA]);
    assert.equal(Object.hasOwn(requests[beforeForwardFallback + 1], 'thinking'), false);

    // 两者均失败时显示两次完整错误，且不再产生第三个旧模型请求。
    const beforeBothFail = requests.length;
    plans.push(
      { status: 503, body: JSON.stringify({ error: { message: 'deepseek-full-error-marker' } }) },
      { status: 503, body: JSON.stringify({ error: { message: 'luna-full-error-marker' } }) }
    );
    await page.locator('#aiInput').fill('检查双模型完整错误');
    await page.locator('#aiSend').click();
    await page.locator('#aiOut').getByText('双模型请求均失败').waitFor();
    const failureText = await page.locator('#aiOut').textContent();
    assert.match(failureText, /deepseek-full-error-marker/);
    assert.match(failureText, /luna-full-error-marker/);
    assert.deepEqual(requests.slice(beforeBothFail).map((body) => body.model), [DEEPSEEK, LUNA]);

    // 全局选择刷新后仍保持。
    await page.locator('[data-ai-model="gpt-5.6-luna"]').first().click();
    await page.waitForFunction((model) => JSON.parse(localStorage.getItem('mti_ai_v1')).model === model, LUNA);
    await page.reload({ waitUntil: 'domcontentloaded' });
    config = await page.evaluate(() => JSON.parse(localStorage.getItem('mti_ai_v1')));
    assert.equal(config.model, LUNA);
    assert.deepEqual(errors, []);
    assert.equal(plans.length, 0);
    console.log('PASS dual Max model selection, request payloads, persistence and bidirectional fallback');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
