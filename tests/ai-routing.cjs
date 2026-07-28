const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.MTI_BASE_URL || 'http://127.0.0.1:4173/';
const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert.match(source, /aiCfg\.routing='kimi-primary-v2'/);
assert.match(source, /var AI_MODEL='kimi-k3'/);
assert.match(source, /\['kimi-k3','Kimi K3 · 首选模型'\]/);
assert.match(source, /\['deepseek-v4-pro','DeepSeek V4 Pro · 自动备用'\]/);
assert.match(source, /\['gpt-5\.6-terra','GPT-5\.6 Terra · 最终备用'\]/);
assert.match(source, /function aiExpModelName\(m\)\{\s*return aiModelPriorityName\(m\);/);
assert.match(source, /var model=aiModelPriorityName\(rec\.m\);/);
assert.doesNotMatch(source, /aiCfg\.routing='deepseek-primary-v1'/);

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block'
    });
    await context.addInitScript(() => {
      localStorage.setItem('mti_ai_v1', JSON.stringify({
        routing: 'deepseek-primary-v1',
        model: 'kimi-k3',
        fast: false,
        key: 'test-only-key',
        efforts: { explain: 'max', free: 'low' }
      }));
    });
    const page = await context.newPage();
    const origin = new URL(base).origin;
    await page.route('**/*', (route) => {
      const target = new URL(route.request().url());
      return target.origin === origin ? route.continue() : route.abort();
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const url = new URL(base);
    url.searchParams.set('__ai_routing', Date.now());
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(() => {
      cur = 'ai';
      render();
      document.getElementById('aiCfgEdit').click();
      const config = JSON.parse(localStorage.getItem('mti_ai_v1'));
      return {
        routing: config.routing,
        model: config.model,
        explainEffort: config.efforts.explain,
        freeEffort: config.efforts.free,
        text: document.getElementById('aiSetupBox').textContent.replace(/\s+/g, ' ').trim()
      };
    });

    assert.equal(result.routing, 'kimi-primary-v2');
    assert.equal(result.model, 'kimi-k3');
    assert.equal(result.explainEffort, 'max');
    assert.equal(result.freeEffort, 'low');
    assert.match(result.text, /Kimi K3 首选/);
    assert.match(result.text, /DeepSeek 自动备用/);
    assert.match(result.text, /Terra 最终备用/);
    assert.match(result.text, /Low 更快、High 均衡、Max 更深入/);
    assert.deepEqual(errors, []);
    console.log('PASS Kimi K3 primary routing labels and migration');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
