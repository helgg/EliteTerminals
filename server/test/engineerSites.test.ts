import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINEER_SITES, engineerSite } from '@et/shared';

// The table of where each engineer lives is checked against Spansh by hand (see the header of the file): here only its shape.
test('every engineer site has a system, a base and coordinates', () => {
  const names = Object.keys(ENGINEER_SITES);
  assert.ok(names.length >= 20, 'the table has the engineers that were verified');
  for (const [name, s] of Object.entries(ENGINEER_SITES)) {
    assert.ok(s.system.trim() && s.base.trim(), `${name}: system and base`);
    assert.equal(s.pos.length, 3, `${name}: pos`);
    assert.ok(s.pos.every(Number.isFinite), `${name}: pos is numbers`);
  }
  assert.equal(engineerSite('Felicity Farseer')?.system, 'Deciat');
  assert.equal(engineerSite('Colonel Bris Dekker')?.system, 'Sol');
  assert.equal(engineerSite('Nobody'), undefined);
});

test('the engineers of the commander are in the table where known', () => {
  // names as the journal writes them (EngineerProgress)
  for (const n of ["Tod 'The Blaster' McQuinn", 'The Dweller', 'Hera Tani', 'Liz Ryder', 'Selene Jean']) {
    assert.ok(engineerSite(n), `${n} has a site`);
  }
});
