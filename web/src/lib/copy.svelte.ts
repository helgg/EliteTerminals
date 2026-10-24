// Tap a station or system name to copy it: onto the PC's clipboard (through the server, so it can be
// pasted into the game's galaxy map even from a tablet) and onto this device's own clipboard.

export const copied = $state({ text: '', ok: true, at: 0 });

export async function copyName(text: string) {
  copyHere(text);
  let ok = true;
  try {
    const res = await fetch('/api/clipboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    ok = res.ok;
  } catch {
    ok = false;
  }
  Object.assign(copied, { text, ok, at: Date.now() });
}

/** navigator.clipboard needs https; the panel is served over plain http on the LAN. */
function copyHere(text: string) {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  } catch {
    // the PC clipboard is the one that matters
  }
}
