import path from "path";

// Calculate Levenshtein distance between two strings
export function levenshteinDistance(a, b) {
  const tmp = [];
  let i, j, al = a.length, bl = b.length, r = 0;
  if (al === 0) return bl;
  if (bl === 0) return al;
  for (i = 0; i <= al; i++) tmp[i] = [i];
  for (j = 0; j <= bl; j++) tmp[0][j] = j;
  for (i = 1; i <= al; i++) {
    for (j = 1; j <= bl; j++) {
      r = a[i - 1] === b[j - 1] ? 0 : 1;
      tmp[i][j] = Math.min(tmp[i - 1][j] + 1, tmp[i][j - 1] + 1, tmp[i - 1][j - 1] + r);
    }
  }
  return tmp[al][bl];
}

// Calculate similarity score between 0 and 1
export function getStringSimilarity(str1, str2) {
  str1 = str1.toLowerCase().trim();
  str2 = str2.toLowerCase().trim();
  if (str1 === str2) return 1.0;
  if (str1.includes(str2) || str2.includes(str1)) {
    return 0.8 + 0.2 * (Math.min(str1.length, str2.length) / Math.max(str1.length, str2.length));
  }
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshteinDistance(str1, str2);
  return (maxLen - distance) / maxLen;
}

/**
 * Automatically extracts descriptive tags and a category for a song based on metadata.
 */
export function generateKeywordsAndCategory(title, channelTitle, tags = [], description = "", categories = []) {
  const cleanTitle = (title || "").toLowerCase();
  const cleanChannel = (channelTitle || "").toLowerCase();
  const cleanDesc = (description || "").toLowerCase();
  const cleanTags = (tags || []).map(t => t.toLowerCase());
  const cleanCats = (categories || []).map(c => c.toLowerCase());

  // 1. Determine Category
  let category = "other";
  
  // Check common genres or styles
  const isRomantic = /romantic|love|dil|pyaar|ishq|mohabbat|couple|romance|romancing/i.test(cleanTitle + " " + cleanDesc) || cleanTags.some(t => /love|romantic|romance/i.test(t));
  const isSad = /sad|lofi|slowed|reverb|breakup|pain|emotional|bewafa|dilemma/i.test(cleanTitle + " " + cleanDesc) || cleanTags.some(t => /sad|breakup|lofi/i.test(t));
  const isParty = /party|dance|club|dj|remix|mashup|dhol|bhangra|groove/i.test(cleanTitle + " " + cleanDesc) || cleanTags.some(t => /party|dance|remix/i.test(t));
  const isPunjabi = /punjabi|jatt|singh|dosanjh|sidhu|moose|wala|amrit|maan|karan|aujla/i.test(cleanTitle + " " + cleanChannel) || cleanTags.some(t => /punjabi/i.test(t));
  const isHaryanvi = /haryanvi|hayana|desi|chhori|jaat|kharkiya|goswami|chhaniwala/i.test(cleanTitle + " " + cleanChannel) || cleanTags.some(t => /haryanvi/i.test(t));
  const isLofi = /lofi|slowed|reverb|chill|relax|study|sleep/i.test(cleanTitle) || cleanTags.some(t => /lofi|slowed/i.test(t));

  if (isRomantic) category = "romantic";
  else if (isSad) category = "sad";
  else if (isLofi) category = "lofi";
  else if (isParty) category = "party";
  else if (isPunjabi) category = "punjabi";
  else if (isHaryanvi) category = "haryanvi";

  // 2. Generate Keywords (tokens)
  const keywordsSet = new Set();

  // Helper to add word tokens
  const addTokens = (text) => {
    if (!text) return;
    const words = text
      .replace(/[^\w\s]/g, " ") // replace punctuation with spaces
      .split(/\s+/)
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 2); // only words with length > 2
    words.forEach(w => keywordsSet.add(w));
  };

  addTokens(title);
  addTokens(channelTitle);
  
  // Add tags
  cleanTags.forEach(tag => {
    keywordsSet.add(tag);
    addTokens(tag);
  });

  // Add determined category as a keyword
  if (category !== "other") {
    keywordsSet.add(category);
  }

  // Common language tags
  if (/hindi|bollywood|t-series|zeemusic/i.test(cleanTitle + " " + cleanChannel + " " + cleanDesc)) {
    keywordsSet.add("hindi");
    keywordsSet.add("bollywood");
  }
  if (/english|pop|hollywood|lyrics/i.test(cleanTitle + " " + cleanDesc)) {
    keywordsSet.add("english");
    keywordsSet.add("pop");
  }

  return {
    category,
    keywords: Array.from(keywordsSet)
  };
}

/**
 * Searches a collection of songs with multi-word token scoring and fuzzy typo tolerance.
 */
export function fuzzySearch(query, songs) {
  if (!query) return songs;
  const searchTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
  if (searchTokens.length === 0) return songs;

  const scoredSongs = songs.map(song => {
    let bestScoreSum = 0;
    
    for (const token of searchTokens) {
      let maxTokenScore = 0;

      // 1. Match title (exact substring or fuzzy word match)
      const titleLower = (song.title || "").toLowerCase();
      if (titleLower.includes(token)) {
        maxTokenScore = Math.max(maxTokenScore, 0.9);
      } else {
        const titleWords = titleLower.split(/\s+/);
        for (const word of titleWords) {
          if (word.length > 2) {
            maxTokenScore = Math.max(maxTokenScore, getStringSimilarity(token, word) * 0.85);
          }
        }
      }

      // 2. Match channel/singer
      const channelLower = (song.channelTitle || "").toLowerCase();
      if (channelLower.includes(token)) {
        maxTokenScore = Math.max(maxTokenScore, 0.95);
      } else {
        const channelWords = channelLower.split(/\s+/);
        for (const word of channelWords) {
          if (word.length > 2) {
            maxTokenScore = Math.max(maxTokenScore, getStringSimilarity(token, word) * 0.9);
          }
        }
      }

      // 3. Match category
      const categoryLower = (song.category || "").toLowerCase();
      if (categoryLower.includes(token)) {
        maxTokenScore = Math.max(maxTokenScore, 0.85);
      }

      // 4. Match keywords
      const keywords = song.keywords || [];
      for (const keyword of keywords) {
        const kwLower = keyword.toLowerCase();
        if (kwLower.includes(token)) {
          maxTokenScore = Math.max(maxTokenScore, 0.8);
        } else {
          maxTokenScore = Math.max(maxTokenScore, getStringSimilarity(token, kwLower) * 0.7);
        }
      }

      bestScoreSum += maxTokenScore;
    }

    const finalScore = bestScoreSum / searchTokens.length;
    return { song, score: finalScore };
  });

  return scoredSongs
    .filter(item => item.score > 0.25)
    .sort((a, b) => b.score - a.score)
    .map(item => item.song);
}

/**
 * Automigration helper to populate keywords and categories for all legacy songs on boot.
 */
export async function autoMigrateSongs() {
  try {
    const Song = (await import("../models/song.model.js")).default;
    const { saveSongToBothDbs } = await import("./remoteDb.js");

    const unmigratedSongs = await Song.find({
      $or: [
        { category: { $exists: false } },
        { keywords: { $exists: false } },
        { category: "" },
        { keywords: { $size: 0 } }
      ]
    });

    if (unmigratedSongs.length === 0) {
      return;
    }

    console.log(`[AutoMigration] Found ${unmigratedSongs.length} songs requiring search keyword generation. Running migration...`);

    let migrated = 0;
    for (const song of unmigratedSongs) {
      const { category, keywords } = generateKeywordsAndCategory(
        song.title,
        song.channelTitle,
        [],
        "",
        []
      );

      song.category = category;
      song.keywords = keywords;
      await song.save();

      // Mirror to remote database
      await saveSongToBothDbs(song);
      migrated++;
    }

    console.log(`[AutoMigration] Completed search keyword migration for ${migrated} songs!`);
  } catch (err) {
    console.error("[AutoMigration] Failed to run auto-migration:", err.message);
  }
}
