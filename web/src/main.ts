import { mount } from 'svelte';
import './hud.css';
import App from './App.svelte';
import { startViewport } from './lib/viewport.svelte.ts';

startViewport(); // before the first render, so the first layout is already the right one

mount(App, { target: document.getElementById('app')! });
