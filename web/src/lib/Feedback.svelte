<script lang="ts">
  import type { EdState } from '@et/shared';
  import Dialog from './Dialog.svelte';
  import { PROJECT } from './project.ts';
  import { viewport } from './viewport.svelte.ts';

  // A bug report or an idea, written here and sent as a GitHub issue. Nothing leaves this PC until the GitHub page opens, and
  // that page shows exactly the text below: the app sends nothing itself, and keeps no account or key.
  let { open = $bindable(false), s, tab }: { open: boolean; s: EdState; tab: string } = $props();

  let kind = $state<'bug' | 'idea'>('bug');
  let title = $state('');
  let text = $state('');
  let withInfo = $state(true);
  let copied = $state(false);
  let preview = $state<HTMLTextAreaElement>();

  // What helps to reproduce a bug. Never the commander, the system, the journal's path or anything typed in the game.
  const info = $derived(
    [
      `- ${PROJECT.name} ${PROJECT.version}`,
      `- Screen: ${tab} · layout ${viewport.vp} ${viewport.width}×${viewport.height}`,
      `- Game: ${s.meta.online ? 'online' : 'offline'}${s.meta.gameVersion ? ` · ${s.meta.gameVersion}` : ''}${s.meta.odyssey ? ' · Odyssey' : ''}`,
      `- Browser: ${navigator.userAgent}`,
    ].join('\n'),
  );
  const heading = $derived(kind === 'bug' ? '**What happened, and what did you expect?**' : '**The idea, and what it would help you do**');
  const body = $derived(`${heading}\n\n${text.trim() || '(write here)'}\n${withInfo ? `\n**Details**\n\n${info}\n` : ''}`);
  const url = $derived(
    `${PROJECT.repo}/issues/new?labels=${kind === 'bug' ? 'bug' : 'enhancement'}&title=${encodeURIComponent(title.trim())}&body=${encodeURIComponent(body)}`,
  );
  // the page address has a length limit
  const tooLong = $derived(url.length > 7500);
  const ready = $derived(title.trim().length > 2 && text.trim().length > 5 && !tooLong);

  async function copy() {
    const all = `${title.trim()}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(all);
    } catch {
      // a page opened by network address (not localhost) has no clipboard API: select the text and let the browser copy it
      preview?.select();
      document.execCommand('copy');
    }
    copied = true;
    setTimeout(() => (copied = false), 1800);
  }
</script>

<Dialog bind:open title="REPORT A BUG · SUGGEST AN IDEA" width={520}>
  <div class="kinds">
    <button class:on={kind === 'bug'} onclick={() => (kind = 'bug')}>BUG</button>
    <button class:on={kind === 'idea'} onclick={() => (kind = 'idea')}>IDEA</button>
  </div>

  <label>
    <span class="k">TITLE</span>
    <input bind:value={title} maxlength="120" placeholder={kind === 'bug' ? 'Short: what is wrong, and where' : 'Short: what you would like'} spellcheck="false" />
  </label>

  <label>
    <span class="k">{kind === 'bug' ? 'WHAT HAPPENED' : 'THE IDEA'}</span>
    <textarea bind:value={text} rows="5" placeholder={kind === 'bug' ? 'Steps, what you saw and what you expected. If it is about a system, write its name here.' : 'What it would do, and when you would use it.'}></textarea>
  </label>

  <button class="tog" class:on={withInfo} onclick={() => (withInfo = !withInfo)}>
    {withInfo ? '✓' : '○'} ADD TECHNICAL DETAILS (version, screen, layout, browser)
  </button>

  <label>
    <span class="k">THIS IS WHAT GITHUB WILL RECEIVE</span>
    <textarea bind:this={preview} readonly rows="6" value={`${title.trim()}\n\n${body}`}></textarea>
  </label>

  {#if tooLong}<p class="warn">Too long for the link: shorten it, or use COPY and paste it in a new issue on GitHub.</p>{/if}

  <div class="acts">
    <a class="go" class:off={!ready} href={ready ? url : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!ready}>OPEN ON GITHUB ↗</a>
    <button class="copy" onclick={copy}>{copied ? 'COPIED' : 'COPY'}</button>
  </div>
  <p class="dim">GitHub asks you to sign in and press <b>Submit new issue</b>: nothing is sent before that.</p>
</Dialog>

<style>
  .kinds { display: flex; gap: 4px; }
  .kinds button, .tog, .copy {
    background: var(--steel); border: 1px solid var(--rule); color: var(--muted); font: inherit; font-size: 11px; letter-spacing: 0.1em; padding: 7px 12px; cursor: pointer;
  }
  .kinds button.on { background: var(--hud); border-color: var(--hud); color: #1b0f05; font-weight: 800; }
  .tog { text-align: left; }
  .tog.on { color: var(--telemetry); border-color: color-mix(in srgb, var(--telemetry) 60%, transparent); }
  label { display: flex; flex-direction: column; gap: 3px; }
  .k { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; }
  input, textarea {
    background: var(--void); border: 1px solid var(--rule); color: var(--text); font: 12px var(--mono); padding: 7px 8px; resize: vertical; min-width: 0;
  }
  textarea[readonly] { color: var(--muted); background: var(--rail); }
  input:focus, textarea:focus { outline: none; border-color: var(--hud); }
  .acts { display: flex; gap: 6px; }
  .go {
    flex: 1; text-align: center; text-decoration: none; background: var(--hud); border: 1px solid var(--hud); color: #1b0f05;
    font-size: 12px; font-weight: 800; letter-spacing: 0.1em; padding: 9px 10px;
  }
  .go.off { background: var(--steel); border-color: var(--rule); color: var(--faint); pointer-events: none; }
  .warn { margin: 0; color: var(--danger); font-size: 11px; }
  .dim { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.5; }
  .dim b { color: var(--text); }
</style>
