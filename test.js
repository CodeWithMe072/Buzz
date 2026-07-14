// test-youtube.js
// Minimal script to call YouTube Data API v3 and see the raw metadata response.
// This ONLY fetches metadata (title, channel, thumbnail, video ID) — it does
// NOT download any audio/video. YouTube's terms explicitly prohibit
// downloading/extracting media from their platform, so this script
// intentionally stops at metadata, which is what the API is designed for.
//
// SETUP:
// 1. Go to https://console.cloud.google.com/
// 2. Create a project (or use an existing one)
// 3. Enable "YouTube Data API v3" under APIs & Services > Library
// 4. Create an API key under APIs & Services > Credentials
// 5. Run: node test-youtube.js
//    (Node 18+ has fetch built in — no npm install needed)

const API_KEY = "AIzaSyAyZ23tHjBi4PL3ymiaESDaZjyDkN6tA0Q"; // <-- paste your API key

async function testYouTubeSearch() {
  const params = new URLSearchParams({
    key: API_KEY,
    part: "snippet",
    q: "Jadugarni harvni song",      // try: "punjabi trending songs", "hindi songs 2026"
    type: "video",
    maxResults: "5",
    order: "viewCount",          // sort by popularity — good proxy for "trending"
  });

  const url = `https://www.googleapis.com/youtube/v3/search?${params}`;
  console.log("Calling:", url.replace(API_KEY, "***HIDDEN***"));

  const res = await fetch(url);
  const data = await res.json();

  console.log("\n--- FULL RAW RESPONSE ---");
  console.log(JSON.stringify(data, null, 2));

  if (data.error) {
    console.log("\n(If you see an error above, double check your API key and that");
    console.log("YouTube Data API v3 is enabled for your Google Cloud project.)");
    return;
  }

  console.log("\n--- SIMPLIFIED (typical metadata you'd actually use) ---");
  const results = (data.items || []).map((item) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    thumbnailUrl: item.snippet.thumbnails?.medium?.url,
    watchUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`,
  }));
  console.log(JSON.stringify(results, null, 2));

  console.log("\nNote: 'watchUrl' is meant to link out to YouTube itself, or to");
  console.log("embed YouTube's official player — not to feed into any downloader.");
}

testYouTubeSearch().catch((err) => {
  console.error("Error calling YouTube Data API:", err.message);
});