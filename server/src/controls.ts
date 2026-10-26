// Turns command names from the UI into key chords for the game, using the player's own bindings.
import { EventEmitter } from 'node:events';
import { filesSignature, loadBindings, presetFiles, resolveChord, type ResolvedChord } from './binds.ts';
import type { KeySender } from './input.ts';
import { scanKey } from './keys.ts';

const RELOAD_MS = 5000;
const HOLD_CLICK_MS = 3000;
const ACTION_NAME = /^[A-Za-z0-9_]{1,64}$/;
/** Keys the game reads as typing, not as a bind: they work only in a text field (galaxy map search). */
const TEXT_KEYS: Record<string, ResolvedChord> = {
  TextEnter: { key: scanKey('Key_Enter')!, modifiers: [], label: 'Enter' },
  /** Up arrow, then Space, puts the galaxy map's search field in typing mode (the arrow, not UI_Up: that may be W). */
  KeyUp: { key: scanKey('Key_UpArrow')!, modifiers: [], label: 'Up' },
  /** Down arrow, then Space, picks the search's first suggestion (the arrow, not the player's UI_Down: that may be S). */
  KeyDown: { key: scanKey('Key_DownArrow')!, modifiers: [], label: 'Down' },
};
const PASTE: ResolvedChord = { key: scanKey('Key_V')!, modifiers: [scanKey('Key_LeftControl')!], label: 'Ctrl+V' };

export class Controls extends EventEmitter {
  presets: string[] = [];
  /** Action → chord, only for actions with a keyboard binding we can send. */
  private chords = new Map<string, ResolvedChord>();
  private signature = '';
  private queue: Promise<unknown> = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;
  readonly bindingsDir: string;
  readonly gameDir: string | null;
  readonly sender: KeySender | null;

  constructor(bindingsDir: string, gameDir: string | null, sender: KeySender | null) {
    super();
    this.bindingsDir = bindingsDir;
    this.gameDir = gameDir;
    this.sender = sender;
  }

  start() {
    this.reload();
    this.timer = setInterval(() => this.reload(), RELOAD_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Re-reads the presets when the player changes or edits them in the game's options. */
  reload() {
    const { names, files } = presetFiles(this.bindingsDir, this.gameDir);
    const signature = names.join(',') + '#' + filesSignature(files);
    if (signature === this.signature) return;
    this.signature = signature;
    this.presets = names;
    this.chords.clear();
    for (const [action, chord] of loadBindings(files)) {
      const resolved = resolveChord(chord);
      if (resolved) this.chords.set(action, resolved);
    }
    this.emit('change');
  }

  /** Action → key label ("LShift+F"), for button hints and to disable unbound buttons. */
  keyLabels(): Record<string, string> {
    return Object.fromEntries([...this.chords].map(([a, c]) => [a, c.label]));
  }

  /** Runs commands one at a time so two chords never interleave. */
  run(action: string): Promise<void> {
    const job = this.queue.then(() => this.execute(action));
    this.queue = job.catch(() => {});
    return job;
  }

  /** Ctrl+V in the game: pastes the PC's clipboard into the text field that has the focus. */
  paste(): Promise<void> {
    const job = this.queue.then(() => this.press(PASTE));
    this.queue = job.catch(() => {});
    return job;
  }

  private async execute(action: string) {
    if (!ACTION_NAME.test(action)) throw new Error('invalid command');
    if (action === 'MouseHoldCenter') return this.holdClick();
    const chord = TEXT_KEYS[action] ?? this.chords.get(action);
    if (!chord) throw new Error(`"${action}" has no keyboard key in your binds`);
    await this.press(chord);
  }

  /** Left mouse button held 3 s in the middle of the game: the galaxy map plots a route to the system there. */
  private async holdClick() {
    if (!this.sender) throw new Error('sending keys only works on Windows');
    const focusError = await this.sender.focusGame();
    if (focusError) throw new Error(focusError);
    await this.sender.holdClickCenter(HOLD_CLICK_MS);
  }

    private async press(chord: ResolvedChord) {
    if (!this.sender) throw new Error('sending keys only works on Windows');
    const focusError = await this.sender.focusGame();
    if (focusError) throw new Error(focusError);
    await this.sender.tap(chord);
  }
}
