/* 番茄工作台 Service Worker
   - 离线可用 + 缓存策略（同源）
   - 锁屏通知 + 通知按钮回调（回到 App 执行动作）
   注意：跨域请求（api.github.com 等）一律不进缓存，直连。
   改动 index.html/manifest 不需要 bump；改动图标需 bump CACHE。 */
const CACHE = 'pomo-v1';
const ASSETS = [
  './', './index.html', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;   // 跨域直连，不进缓存

  // 导航请求走网络优先：发新版后免清缓存即可生效
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // 静态资源走缓存优先
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});

/* 通知被点击/按钮被按下 → 聚焦已打开的窗口并转交动作；否则新开窗口带 action 参数 */
self.addEventListener('notificationclick', (e) => {
  const action = e.action || 'open';
  e.notification.close();
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      try { await c.focus(); } catch (err) { /* 忽略 */ }
      c.postMessage({ type: 'pomo-notif', action: action });
      return;
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow('./?action=' + encodeURIComponent(action));
    }
  })());
});

self.addEventListener('notificationclose', () => { /* 用户划掉通知，不做事 */ });

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
