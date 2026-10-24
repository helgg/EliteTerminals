import { mount } from 'svelte';
import './hud.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
