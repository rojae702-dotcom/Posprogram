// service-worker.js — Yul POS 배포용 PWA
const CACHE_NAME = 'yul-pos-local-v1';

// 오프라인에서도 동작할 핵심 파일
const ASSETS = [
    './',
    './index.html',
    './local-pos.html',
    './local-inventory.html',
    './local-storage.js',
    './manifest.json',
];

// ── 설치: 핵심 파일 캐시에 저장 ──
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ── 활성화: 이전 버전 캐시 삭제 ──
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ── 요청 처리: 캐시 우선 → 없으면 네트워크 ──
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // 외부 리소스(폰트 등)는 네트워크 그대로 통과
    if (url.origin !== location.origin) return;

    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(response => {
                // 응답을 캐시에도 저장
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                return response;
            });
        })
    );
});
