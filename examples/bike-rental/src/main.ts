import { httpApi } from './api';
import { createApp } from './app';

const root = document.getElementById('app');
if (root) createApp(root, { api: httpApi() });
