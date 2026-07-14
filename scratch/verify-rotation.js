import { youtubeApiRequest } from "../utils/youtube.js";

// Mock global environment variables
process.env.YOUTUBE_API_KEY_1 = "MOCK_KEY_1_EXHAUSTED_KEY";
process.env.YOUTUBE_API_KEY_2 = "MOCK_KEY_2_VALID_KEY";

const originalFetch = globalThis.fetch;

try {
  console.log("----------------------------------------------------------------");
  console.log("Starting YouTube API Key Rotation Verification Script...");
  console.log("----------------------------------------------------------------");

  // Mock globalThis.fetch
  globalThis.fetch = async (url) => {
    console.log(`[Mock Fetch] Intercepted request to: ${url}`);
    
    // Check which key is in the request
    if (url.includes("key=MOCK_KEY_1_EXHAUSTED_KEY")) {
      console.log("[Mock Fetch] Simulating 403 Quota Exceeded error for KEY 1...");
      return {
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            message: "The request cannot be completed because you have exceeded your quota.",
            errors: [{ reason: "quotaExceeded", domain: "youtube.quota" }]
          }
        })
      };
    }
    
    if (url.includes("key=MOCK_KEY_2_VALID_KEY")) {
      console.log("[Mock Fetch] Simulating 200 OK success for KEY 2...");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          kind: "youtube#searchListResponse",
          items: [
            {
              id: { videoId: "rotated_success_vid" },
              snippet: {
                title: "Rotated Success Song",
                channelTitle: "Rotated Artist",
                thumbnails: { default: { url: "https://example.com/thumb.jpg" } }
              }
            }
          ]
        })
      };
    }
    
    throw new Error(`Unexpected request URL in E2E validation: ${url}`);
  };

  // Execute request
  const results = await youtubeApiRequest(
    "search",
    { part: "snippet", q: "test query" },
    ["YOUTUBE_API_KEY_1", "YOUTUBE_API_KEY_2"]
  );

  console.log("----------------------------------------------------------------");
  console.log("Response data received:", JSON.stringify(results, null, 2));
  console.log("----------------------------------------------------------------");

  // Validate results
  if (results && results.items && results.items[0].id.videoId === "rotated_success_vid") {
    console.log("SUCCESS: Key rotation worked correctly and fallback key was invoked!");
    process.exit(0);
  } else {
    console.error("FAILURE: Received unexpected results or empty response.");
    process.exit(1);
  }

} catch (err) {
  console.error("FAILURE: Verification script threw an unexpected error:", err);
  process.exit(1);
} finally {
  // Restore original fetch
  globalThis.fetch = originalFetch;
}
