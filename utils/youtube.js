
/**
 * Helper to perform YouTube Data API requests with automatic key rotation on quota exhaustion or rate limits.
 * @param {string} endpoint - The API endpoint (e.g., "search")
 * @param {Record<string, string>} params - Query parameters (excluding key)
 * @param {string[]} preferredKeyOrder - Order of key environment variable names to try (e.g. ["YOUTUBE_API_KEY_1", "YOUTUBE_API_KEY_2"])
 */
export async function youtubeApiRequest(endpoint, params, preferredKeyOrder = []) {
  // Dynamically resolve all keys in the environment that start with YOUTUBE_API_KEY
  const allEnvKeys = Object.keys(process.env)
    .filter(key => key.startsWith("YOUTUBE_API_KEY"))
    .sort((a, b) => {
      if (a === "YOUTUBE_API_KEY") return -1;
      if (b === "YOUTUBE_API_KEY") return 1;
      return a.localeCompare(b);
    });

  // Combine preferred order with any other dynamically discovered keys
  const finalKeyOrder = (preferredKeyOrder && preferredKeyOrder.length > 0)
    ? Array.from(new Set([...preferredKeyOrder, ...allEnvKeys]))
    : allEnvKeys;

  // Resolve key environment variable names to actual values
  const keys = finalKeyOrder.map(name => process.env[name]).filter(Boolean);
  
  if (keys.length === 0) {
    throw new Error("No YouTube API keys available in environment");
  }

  let lastError = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const keyName = finalKeyOrder[i] || `KEY_${i}`;
    const queryParams = new URLSearchParams(params);
    queryParams.set("key", key);
    
    const url = `https://www.googleapis.com/youtube/v3/${endpoint}?${queryParams.toString()}`;
    
    try {
      console.log(`[YouTube API] Attempting request using key ${keyName} (suffix: ...${key.slice(-6)})`);
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        return data;
      }
      
      // Parse error body if possible
      let errData = {};
      try {
        errData = await response.json();
      } catch (jsonErr) {
        // Response might not be JSON
      }
      
      const status = response.status;
      const errorMessage = errData.error?.message || "";
      const errorReason = errData.error?.errors?.[0]?.reason || "";
      
      const isQuotaOrRateLimit = status === 429 || 
        (status === 403 && (errorReason === "quotaExceeded" || errorMessage.toLowerCase().includes("quota") || errorMessage.toLowerCase().includes("limit")));
      
      if (isQuotaOrRateLimit) {
        console.warn(`[YouTube API] Key ${keyName} reached quota/rate limit (Status ${status}, Reason: ${errorReason || "Limit"}). Rotating to next key...`);
        lastError = new Error(`Key ${keyName} reached limit: ${errorMessage || "Quota exceeded"}`);
        continue; // Try next key
      }
      
      // For non-quota errors (e.g. invalid query parameter), fail immediately without rotating
      throw new Error(`YouTube API returned status ${status}: ${errorMessage || "Unknown error"}`);
    } catch (err) {
      console.error(`[YouTube API] Error with key ${keyName}:`, err.message);
      lastError = err;
      
      // If it's a network error, we can try the next key as a fallback
      if (err.message.includes("fetch") || err.message.includes("network") || err.message.includes("ENOTFOUND")) {
        continue;
      }
      // If it's a non-quota API error that was explicitly thrown, raise it immediately
      throw err;
    }
  }
  
  throw lastError || new Error("All YouTube API keys failed");
}
