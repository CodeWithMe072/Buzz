import fs from "fs-extra";
import path from "path";
import { spawn } from "child_process";
import https from "https";
import os from "os";

const BIN_DIR = path.join(process.cwd(), "bin");
const YTDLP_PATH = path.join(BIN_DIR, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

/**
 * Ensures yt-dlp binary is present in the bin folder. Downloads it if missing.
 */
export async function ensureYtdlp() {
  await fs.ensureDir(BIN_DIR);
  if (await fs.pathExists(YTDLP_PATH)) {
    return YTDLP_PATH;
  }

  console.log(`[ytDownloader] yt-dlp binary not found. Downloading for platform: ${process.platform}...`);
  const url = process.platform === "win32"
    ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    : process.platform === "darwin"
      ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
      : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

  await downloadFile(url, YTDLP_PATH);

  if (process.platform !== "win32") {
    await fs.chmod(YTDLP_PATH, 0o755); // Make it executable
  }
  console.log("[ytDownloader] yt-dlp downloaded successfully.");
  return YTDLP_PATH;
}

/**
 * Downloads a file from a URL, following redirects.
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    function get(requestUrl) {
      https.get(requestUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          get(response.headers.location);
        } else if (response.statusCode === 200) {
          response.pipe(file);
          file.on("finish", () => {
            file.close(resolve);
          });
        } else {
          fs.unlink(dest, () => {
            reject(new Error(`Failed to download: status ${response.statusCode}`));
          });
        }
      }).on("error", (err) => {
        fs.unlink(dest, () => reject(err));
      });
    }

    get(url);
  });
}

/**
 * Formats duration in seconds to M:SS.
 */
function formatDuration(sec) {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/**
 * Helper to write cookies content to a file if configured in environment variables.
 * Returns { cookiesPath, useBrowserCookies } to inform callers how to authenticate.
 */
async function getCookiesConfig() {
  // 1. Check for explicit cookies file/content via env var
  if (process.env.YOUTUBE_COOKIES) {
    try {
      const cookiesPath = path.join(os.tmpdir(), "youtube_cookies.txt");
      let content = process.env.YOUTUBE_COOKIES;
      // If it looks like base64, decode it
      if (!content.includes("\n") && !content.includes("\t") && content.length > 100) {
        try {
          content = Buffer.from(content, 'base64').toString('utf-8');
        } catch (e) {
          // ignore, use raw
        }
      }
      await fs.writeFile(cookiesPath, content.trim());
      return { cookiesPath, useBrowserCookies: false };
    } catch (err) {
      console.error("[ytDownloader] Failed to write cookies file:", err.message);
    }
  }

  // 2. Check for explicit cookie browser preference via env var (e.g. "chrome", "firefox", "edge")
  if (process.env.YOUTUBE_COOKIES_BROWSER) {
    return { cookiesPath: null, useBrowserCookies: process.env.YOUTUBE_COOKIES_BROWSER };
  }

  // 3. No cookies configured — rely on JS runtime + web player client to bypass bot checks
  return { cookiesPath: null, useBrowserCookies: false };
}

/**
 * Builds common yt-dlp arguments for JS runtime and cookie authentication.
 */
async function buildCommonArgs() {
  const args = [];

  // Use Node.js as the JavaScript runtime for signature decryption
  args.push("--js-runtimes", "node");

  // Use a web player client which is less aggressive on bot checks
  args.push("--extractor-args", "youtube:player_client=web");

  // Cookie authentication
  const { cookiesPath, useBrowserCookies } = await getCookiesConfig();
  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  } else if (useBrowserCookies) {
    args.push("--cookies-from-browser", useBrowserCookies);
  }

  return args;
}

/**
 * Retrieves video metadata (title, uploader, duration, thumbnail) from YouTube URL.
 */
export async function getMetadata(videoUrl) {
  const binaryPath = await ensureYtdlp();
  const commonArgs = await buildCommonArgs();
  return new Promise((resolve, reject) => {
    const args = [...commonArgs, "--dump-json", "--no-playlist", videoUrl];
    const proc = spawn(binaryPath, args);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(stderr.trim() || `Failed to extract metadata (exit code ${code})`));
      }
      try {
        const data = JSON.parse(stdout);
        resolve({
          title: data.title,
          uploader: data.uploader || data.channel || "Unknown Artist",
          thumbnail: data.thumbnail || (data.thumbnails && data.thumbnails.length ? data.thumbnails[data.thumbnails.length - 1].url : ""),
          duration: data.duration || 0,
          formattedDuration: formatDuration(data.duration),
          tags: data.tags || [],
          description: data.description || "",
          categories: data.categories || [],
        });
      } catch (err) {
        reject(new Error("Failed to parse video metadata"));
      }
    });
  });
}

/**
 * Downloads a YouTube video's audio stream and transcodes it to MP3 locally.
 * outputPath should be the full path ending in .mp3, but yt-dlp can append suffix on post-processing,
 * so we use a template and let it output.
 */
export async function downloadAudioStream(videoUrl, outputPath) {
  const binaryPath = await ensureYtdlp();
  const commonArgs = await buildCommonArgs();
  
  // yt-dlp -o format: we use the parent dir + filename template
  const parsedPath = path.parse(outputPath);
  const templatePath = path.join(parsedPath.dir, `${parsedPath.name}.%(ext)s`);

  return new Promise((resolve, reject) => {
    const args = [
      ...commonArgs,
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", "0", // Best VBR
      "--no-playlist",
      "-o", templatePath,
      videoUrl
    ];

    console.log(`[ytDownloader] Downloading and transcoding audio for: ${videoUrl}`);
    const proc = spawn(binaryPath, args);
    let stderr = "";

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", async (code) => {
      if (code !== 0) {
        return reject(new Error(stderr.trim() || `yt-dlp download failed (exit code ${code})`));
      }
      
      // Since yt-dlp converts to mp3, ensure it outputted the expected path.mp3
      if (await fs.pathExists(outputPath)) {
        resolve(outputPath);
      } else {
        // If not, check if it placed it in another similar name
        const dirFiles = await fs.readdir(parsedPath.dir);
        const match = dirFiles.find(f => f.startsWith(parsedPath.name) && f.endsWith(".mp3"));
        if (match) {
          resolve(path.join(parsedPath.dir, match));
        } else {
          reject(new Error("Converted MP3 file was not found on disk"));
        }
      }
    });
  });
}
