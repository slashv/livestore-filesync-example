import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const baseUrl = (import.meta as any).env?.VITE_WORKER_API_URL || 'http://localhost:8787/api'
    const filesBaseUrl = `${baseUrl}/files`
    const token = (import.meta as any).env?.VITE_WORKER_AUTH_TOKEN || ''
    const url = `/sw.js?filesBaseUrl=${encodeURIComponent(filesBaseUrl)}&token=${encodeURIComponent(token)}`
    navigator.serviceWorker.register(url).catch(() => {})
  })
}
