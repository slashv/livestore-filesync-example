import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = (import.meta as any).env?.VITE_DOWNLOAD_URL || 'http://localhost:8787/api/files'
    const url = `/sw.js?filesBaseUrl=${encodeURIComponent(base)}`
    navigator.serviceWorker.register(url).catch(() => {})
  })
}
