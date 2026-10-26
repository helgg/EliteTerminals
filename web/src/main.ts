import { mount } from 'svelte';
import './hud.css';
import App from './App.svelte';
import IconSheet from './IconSheet.svelte';
import { startViewport } from './lib/viewport.svelte.ts';

startViewport(); // before the first render, so the first layout is already the right one

// ?sheet=icons opens the icon design sheet instead of the panel.
const sheet = new URLSearchParams(location.search).get('sheet') === 'icons';
mount(sheet ? IconSheet : App, { target: document.getElementById('app')! });
