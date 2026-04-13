/**
 * service-worker.js
 * Portfolio Dashboard - GitHub Pages PWA
 *
 * 전략:
 *  - 정적 UI 파일만 캐싱 (HTML, manifest, SW 자체)
 *  - portfolio.json / API key류 / 민감 파일은 절대 캐싱 금지
 *  - Macro API (외부 도메인) 캐싱 금지 — 항상 최신값 조회
 *  - 버전 변경 시 CACHE_NAME만 올리면 구버전 자동 삭제
 */

const CACHE_NAME = 'portfolio-dashboard-v2';

// ✅ 캐싱 허용 목록 (정적 UI 파일만)
const STATIC_ASSETS = [
  './index.html',
  './manifest.json'
];

// 🚫 절대 캐싱 금지 패턴 (민감 데이터 / 동적 API)
const EXCLUDE_PATTERNS = [
  'portfolio.json',
  '.env',
  'api_key',
  'secret',
  'token',
  'private',
  // 외부 Macro API
  'coingecko.com',
  'er-api.com',
  'alternative.me',
  'fonts.googleapis.com',   // 폰트는 브라우저 자체 캐시에 위임
  'fonts.gstatic.com'
];

// ─── INSTALL ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()) // 즉시 활성화
  );
});

// ─── ACTIVATE ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim()) // 즉시 페이지 제어
  );
});

// ─── FETCH ────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 🚫 민감 파일 / 외부 API: SW 개입 없이 네트워크 직접 요청
  if (EXCLUDE_PATTERNS.some(pattern => url.includes(pattern))) {
    // respondWith를 호출하지 않으면 브라우저가 직접 네트워크 요청
    return;
  }

  // GET 요청만 캐싱 (POST 등 제외)
  if (event.request.method !== 'GET') {
    return;
  }

  // 동일 오리진 리소스만 캐싱 (cross-origin 제외)
  const requestOrigin = new URL(url).origin;
  if (requestOrigin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // 캐시 히트: 반환 후 백그라운드에서 갱신 (stale-while-revalidate)
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return networkResponse;
        }).catch(() => {}); // 오프라인 시 무시
        return cached;
      }

      // 캐시 미스: 네트워크 요청 후 캐시 저장
      return fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          // 오프라인 fallback: index.html 반환
          return caches.match('./index.html');
        });
    })
  );
});
