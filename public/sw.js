// public/sw.js — Service Worker to cache decrypted media files and serve HTTP 206 Range Requests locally.

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            cleanExpiredCache()
        ])
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.pathname === '/api/media') {
        event.respondWith(handleMediaRequest(event.request));
        event.waitUntil(cleanExpiredCache());
    }
});

// Cache expiration: 4 hours (in milliseconds)
const CACHE_EXPIRATION_TIME = 4 * 60 * 60 * 1000;

async function handleMediaRequest(request) {
    const cache = await caches.open('decrypted-media-cache');
    const url = new URL(request.url);
    const cacheKey = url.searchParams.get('key');

    if (!cacheKey) {
        return fetch(request);
    }

    let cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
        // Validate cache age using metadata
        const metaResponse = await cache.match(cacheKey + '_meta');
        if (metaResponse) {
            try {
                const meta = await metaResponse.json();
                const age = Date.now() - meta.timestamp;
                if (age > CACHE_EXPIRATION_TIME) {
                    console.log(`[ServiceWorker] Cache expired for: ${cacheKey}`);
                    await cache.delete(cacheKey);
                    await cache.delete(cacheKey + '_meta');
                    cachedResponse = null;
                }
            } catch (err) {
                // If metadata is corrupted, remove cache item to be safe
                await cache.delete(cacheKey);
                await cache.delete(cacheKey + '_meta');
                cachedResponse = null;
            }
        } else {
            // No metadata found, create it starting from now
            await cache.put(cacheKey + '_meta', new Response(JSON.stringify({ timestamp: Date.now() }), {
                headers: { 'Content-Type': 'application/json' }
            }));
        }
    }

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
                // Cache the timestamp metadata
                await cache.put(cacheKey + '_meta', new Response(JSON.stringify({ timestamp: Date.now() }), {
                    headers: { 'Content-Type': 'application/json' }
                }));
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

// Helper to clean up all expired items from cache
async function cleanExpiredCache() {
    try {
        const cache = await caches.open('decrypted-media-cache');
        const keys = await cache.keys();
        const now = Date.now();

        for (const req of keys) {
            if (req.url.endsWith('_meta')) {
                const metaResponse = await cache.match(req);
                if (metaResponse) {
                    try {
                        const meta = await metaResponse.json();
                        if (now - meta.timestamp > CACHE_EXPIRATION_TIME) {
                            const mainUrl = req.url.replace(/_meta$/, '');
                            await cache.delete(mainUrl);
                            await cache.delete(req);
                            console.log('[ServiceWorker] Cleaned up expired cache item:', mainUrl);
                        }
                    } catch (e) {
                        await cache.delete(req);
                    }
                }
            }
        }
    } catch (err) {
        console.error('[ServiceWorker] Failed to clean expired cache:', err);
    }
}
