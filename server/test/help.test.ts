import { test } from 'node:test';
import assert from 'node:assert/strict';

// Every screen has a tutorial, and every tutorial is filled in.
test('every screen has a complete tutorial', async () => {
  const { TABS } = await import('../../web/src/lib/tabs.ts');
  const { HELP } = await import('../../web/src/lib/help/index.ts');
  for (const tab of TABS) {
    const d = HELP[tab];
    assert.ok(d, `${tab} has no tutorial in web/src/lib/help`);
    assert.ok(d.about.trim(), `${tab}: about is empty`);
    assert.match(d.reviewed, /^\d+\.\d+\.\d+$/, `${tab}: reviewed must be an app version`);
    if (d.soon) {
      assert.ok(d.soon.length > 0, `${tab}: soon is empty`);
      continue;
    }
    assert.ok(d.setup.length > 0, `${tab}: no setup topics`);
    assert.ok(d.use.length > 0, `${tab}: no use topics`);
    assert.ok(d.data.trim(), `${tab}: data is empty`);
    for (const t of [...d.setup, ...d.use]) assert.ok(t.title.trim() && t.text.trim(), `${tab}: empty topic`);
  }
});
