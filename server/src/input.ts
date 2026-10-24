// Sends key chords to the Elite Dangerous window through Win32 SendInput (scancode mode).
import koffi from 'koffi';
import type { ResolvedChord } from './binds.ts';
import type { ScanKey } from './keys.ts';

const GAME_WINDOW_TITLE = 'Elite - Dangerous (CLIENT)';
const INPUT_KEYBOARD = 1;
const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_SCANCODE = 0x0008;
/** The game polls input per frame; shorter taps get dropped at low frame rates. */
const HOLD_MS = 60;
const GAP_MS = 15;
/** After a focus change the game needs a frame or two before it reads the keyboard again. */
const FOCUS_SETTLE_MS = 150;

export interface KeySender {
  /** Presses modifiers + key, holds, releases in reverse order. */
  tap(chord: ResolvedChord, holdMs?: number): Promise<void>;
  /** Makes sure keys will reach the game; returns an error message when they would not. */
  focusGame(): Promise<string | null>;
}

export function createWin32Sender(): KeySender {
  const user32 = koffi.load('user32.dll');
  const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
    wVk: 'uint16', wScan: 'uint16', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr_t',
  });
  const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
    dx: 'int32', dy: 'int32', mouseData: 'uint32', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr_t',
  });
  const INPUT = koffi.struct('INPUT', {
    type: 'uint32',
    u: koffi.union('INPUT_UNION', { mi: MOUSEINPUT, ki: KEYBDINPUT }),
  });
  const SendInput = user32.func('uint32 __stdcall SendInput(uint32 cInputs, INPUT *pInputs, int cbSize)');
  const FindWindowW = user32.func('void * __stdcall FindWindowW(const char16_t *cls, const char16_t *name)');
  const GetForegroundWindow = user32.func('void * __stdcall GetForegroundWindow()');
  const SetForegroundWindow = user32.func('bool __stdcall SetForegroundWindow(void *hwnd)');
  const IsIconic = user32.func('bool __stdcall IsIconic(void *hwnd)');
  const ShowWindow = user32.func('bool __stdcall ShowWindow(void *hwnd, int cmd)');
  const BringWindowToTop = user32.func('bool __stdcall BringWindowToTop(void *hwnd)');
  const GetWindowThreadProcessId = user32.func('uint32 __stdcall GetWindowThreadProcessId(void *hwnd, void *pid)');
  const AttachThreadInput = user32.func('bool __stdcall AttachThreadInput(uint32 idAttach, uint32 idAttachTo, bool attach)');
  const GetCurrentThreadId = koffi.load('kernel32.dll').func('uint32 __stdcall GetCurrentThreadId()');
  const size = koffi.sizeof(INPUT);
  const ALT: ScanKey = { scan: 0x38, extended: false };

  const send = (k: ScanKey, up: boolean) => {
    const flags = KEYEVENTF_SCANCODE | (k.extended ? KEYEVENTF_EXTENDEDKEY : 0) | (up ? KEYEVENTF_KEYUP : 0);
    const input = { type: INPUT_KEYBOARD, u: { ki: { wVk: 0, wScan: k.scan, dwFlags: flags, time: 0, dwExtraInfo: 0 } } };
    if (SendInput(1, [input], size) !== 1) throw new Error('SendInput was blocked (UIPI or secure desktop)');
  };

  const sameWindow = (a: unknown, b: unknown) => a && b && koffi.address(a) === koffi.address(b);

  return {
    async tap(chord, holdMs = HOLD_MS) {
      for (const m of chord.modifiers) {
        send(m, false);
        await sleep(GAP_MS);
      }
      send(chord.key, false);
      await sleep(holdMs);
      send(chord.key, true);
      for (const m of [...chord.modifiers].reverse()) {
        await sleep(GAP_MS);
        send(m, true);
      }
    },

    async focusGame() {
      const hwnd = FindWindowW(null, GAME_WINDOW_TITLE);
      if (!hwnd) return 'Elite Dangerous não está aberto';
      if (sameWindow(GetForegroundWindow(), hwnd)) return null;
      if (IsIconic(hwnd)) ShowWindow(hwnd, 9 /* SW_RESTORE */);

      // Windows' foreground lock stops a background process (us) from taking focus.
      // Escalate through the usual workarounds until the game is in front.
      const attempts = [
        () => SetForegroundWindow(hwnd),
        () => {
          // Borrow the foreground thread's input state so the focus change counts as "its" action.
          const fgThread = GetWindowThreadProcessId(GetForegroundWindow(), null);
          const me = GetCurrentThreadId();
          AttachThreadInput(me, fgThread, true);
          try {
            BringWindowToTop(hwnd);
            SetForegroundWindow(hwnd);
          } finally {
            AttachThreadInput(me, fgThread, false);
          }
        },
        () => {
          // A synthetic key event makes us the last input source, which lifts the lock.
          send(ALT, false);
          send(ALT, true);
          SetForegroundWindow(hwnd);
        },
      ];
      for (const attempt of attempts) {
        attempt();
        await sleep(60);
        if (sameWindow(GetForegroundWindow(), hwnd)) {
          await sleep(FOCUS_SETTLE_MS);
          return null;
        }
      }
      // Still refused: never type into whatever app is in front instead.
      return 'o Windows não deixou focar o jogo (clique na janela do Elite)';
    },
  };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
