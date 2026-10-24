// Turns command names from the UI into key chords for the game, using the player's own bindings.
import { EventEmitter } from 'node:events';
import { filesSignature, loadBindings, presetFiles, resolveChord, type ResolvedChord } from './binds.ts';
import type { KeySender } from './input.ts';

const RELOAD_MS = 5000;
const ACTION_NAME = /^[A-Za-z0-9_]{1,64}$/;

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

  private async execute(action: string) {
    if (!ACTION_NAME.test(action)) throw new Error('invalid command');
    const chord = this.chords.get(action);
    if (!chord) throw new Error(`"${action}" has no keyboard key in your binds`);
    if (!this.sender) throw new Error('sending keys only works on Windows');
    const focusError = await this.sender.focusGame();
    if (focusError) throw new Error(focusError);
    await this.sender.tap(chord);
  }
}
