// public/sw.js — Service Worker to cache decrypted media files and serve HTTP 206 Range Requests locally.

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.pathname === '/api/media') {
        event.respondWith(handleMediaRequest(event.request));
    }
});

async function handleMediaRequest(request) {
    const cache = await caches.open('decrypted-media-cache');
    const url = new URL(request.url);
    const cacheKey = url.searchParams.get('key');

    if (!cacheKey) {
        return fetch(request);
    }

    let cachedResponse = await cache.match(cacheKey);

    if (!cachedResponse) {
        // Fetch the full file from network (no range headers)
        // credentials: 'include' is required to preserve the session cookie
        const fetchRequest = new Request(request.url, {
            headers: {},
            credentials: 'include'
        });
        
        try {
            const response = await fetch(fetchRequest);
            if (response.status === 200) {
                // Cache the full response
                await cache.put(cacheKey, response.clone());
                cachedResponse = response;
            } else {
                return response;
            }
        } catch (err) {
            console.error('[ServiceWorker] network fetch failed:', err);
            return new Response('Network error', { status: 480 });
        }
    }

    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
        try {
            const blob = await cachedResponse.clone().blob();
            const parts = rangeHeader.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : blob.size - 1;
            
            if (start >= blob.size || end >= blob.size) {
                return new Response('', {
                    status: 416,
                    headers: { 'Content-Range': `bytes */${blob.size}` }
                });
            }
            
            const chunk = blob.slice(start, end + 1);
            
            return new Response(chunk, {
                status: 206,
                statusText: 'Partial Content',
                headers: {
                    'Content-Range': `bytes ${start}-${end}/${blob.size}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunk.size,
                    'Content-Type': cachedResponse.headers.get('content-type') || 'video/mp4'
                }
            });
        } catch (err) {
            console.error('[ServiceWorker] failed to slice cached response:', err);
            return cachedResponse.clone();
        }
    }

    return cachedResponse.clone();
}
