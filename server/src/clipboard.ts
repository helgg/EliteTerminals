// Puts text on the PC's clipboard, so a name tapped on the tablet can be pasted into the game.
import { execFile } from 'node:child_process';

/** Station and system names only: one line, printable, short. */
export function clipText(text: unknown): string {
  return String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
}

export function setClipboard(text: string): Promise<void> {
  if (process.platform !== 'win32') return Promise.reject(new Error('clipboard only on Windows'));
  // Passed through the environment, so the text is never parsed as part of the command.
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Set-Clipboard -Value $env:ET_CLIP'],
      { env: { ...process.env, ET_CLIP: text }, timeout: 5000, windowsHide: true },
      (err) => (err ? reject(err) : resolve()),
    );
  });
}
