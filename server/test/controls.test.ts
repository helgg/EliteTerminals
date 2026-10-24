// T8 and the command path: bindings → chord → (fake) key sender.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseBinds, presetFiles, resolveChord, type ResolvedChord } from '../src/binds.ts';
import { scanKey, keyLabel } from '../src/keys.ts';
import { Controls } from '../src/controls.ts';
import type { KeySender } from '../src/input.ts';

const FIXTURES = resolve(import.meta.dirname, 'fixtures/bindings');

const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8" ?>
<Root PresetName="T" MajorVersion="4" MinorVersion="2"><KeyboardLayout>en-US</KeyboardLayout>${body}</Root>`;

test('T8 LandingGearToggle on Key_L resolves to scancode 0x26', () => {
  const binds = parseBinds(readFileSync(join(FIXTURES, 'Custom.4.2.binds'), 'utf8'));
  const chord = resolveChord(binds.get('LandingGearToggle')!);
  assert.deepEqual(chord?.key, { scan: 0x26, extended: false });
  assert.deepEqual(chord?.modifiers, []);
  assert.equal(chord?.label, 'L');
});

test('real binds: extended keys and unbound actions', () => {
  const binds = parseBinds(readFileSync(join(FIXTURES, 'Custom.4.2.binds'), 'utf8'));
  assert.equal(resolveChord(binds.get('Supercruise')!)?.key.extended, true); // Numpad Enter
  assert.equal(resolveChord(binds.get('IncreaseSystemsPower')!)?.key.extended, true); // Left arrow
  assert.equal(binds.has('CycleNextHostileTarget'), false); // {NoDevice} in this preset
  assert.ok(binds.size > 50);
});

test('modifiers, Secondary fallback and joystick-only bindings', () => {
  const binds = parseBinds(xml(`
    <A><Primary Device="Keyboard" Key="Key_3"><Modifier Device="Keyboard" Key="Key_LeftAlt" /></Primary>
       <Secondary Device="{NoDevice}" Key="" /></A>
    <B><Primary Device="231D0200" Key="Joy_5" /><Secondary Device="Keyboard" Key="Key_B" /></B>
    <C><Primary Device="231D0200" Key="Joy_1" /><Secondary Device="{NoDevice}" Key="" /></C>
    <D><Primary Device="Keyboard" Key="Key_D"><Modifier Device="Keyboard" Key="Key_LeftControl" />
       <Modifier Device="Keyboard" Key="Key_LeftAlt" /></Primary></D>`));
  assert.deepEqual(binds.get('A'), { key: 'Key_3', modifiers: ['Key_LeftAlt'] });
  assert.deepEqual(binds.get('B'), { key: 'Key_B', modifiers: [] });
  assert.equal(binds.has('C'), false);
  assert.equal(resolveChord(binds.get('D')!)?.label, 'LCtrl+LAlt+D');
});

test('unknown key names are not sendable', () => {
  assert.equal(scanKey('Key_Banana'), null);
  assert.equal(resolveChord({ key: 'Key_Banana', modifiers: [] }), null);
  assert.equal(keyLabel('Key_Numpad_Enter'), 'Numpad Enter');
});

test('preset resolution: ship preset first, newest user file, built-in fallback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'et-binds-'));
  try {
    const bindings = join(dir, 'Bindings');
    const game = join(dir, 'Game');
    await mkdir(bindings);
    await mkdir(join(game, 'ControlSchemes'), { recursive: true });
    await writeFile(join(bindings, 'StartPreset.4.start'), 'BuiltIn\nMine\nBuiltIn\nBuiltIn');
    await writeFile(join(bindings, 'Mine.4.0.binds'), xml('<X><Primary Device="Keyboard" Key="Key_A" /></X>'));
    await writeFile(join(bindings, 'Mine.4.2.binds'), xml('<X><Primary Device="Keyboard" Key="Key_B" /></X>'));
    await writeFile(join(game, 'ControlSchemes', 'BuiltIn.binds'), xml('<X><Primary Device="Keyboard" Key="Key_C" /></X>'));
    const { names, files } = presetFiles(bindings, game);
    assert.deepEqual(names, ['BuiltIn', 'Mine', 'BuiltIn', 'BuiltIn']);
    assert.deepEqual(files, [join(bindings, 'Mine.4.2.binds'), join(game, 'ControlSchemes', 'BuiltIn.binds')]);

    const sent: string[] = [];
    const controls = new Controls(bindings, game, fakeSender(sent));
    controls.reload();
    assert.deepEqual(controls.keyLabels(), { X: 'B' }); // user preset wins
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('commands: sent in order, refused when unbound or game not focused', async () => {
  const sent: string[] = [];
  let focusError: string | null = null;
  const controls = new Controls(FIXTURES, null, fakeSender(sent, () => focusError));
  controls.reload();

  await Promise.all([controls.run('LandingGearToggle'), controls.run('Supercruise')]);
  assert.deepEqual(sent, ['L', 'Numpad Enter']);

  await assert.rejects(controls.run('CycleNextHostileTarget'), /não tem tecla/);
  await assert.rejects(controls.run('../../evil'), /inválido/);

  focusError = 'Elite Dangerous não está aberto';
  await assert.rejects(controls.run('LandingGearToggle'), /não está aberto/);
  assert.equal(sent.length, 2);
});

function fakeSender(sent: string[], focus: () => string | null = () => null): KeySender {
  return {
    async tap(chord: ResolvedChord) {
      await new Promise((r) => setTimeout(r, 5));
      sent.push(chord.label);
    },
    async focusGame() {
      return focus();
    },
  };
}
