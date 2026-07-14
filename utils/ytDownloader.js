import fs from "fs-extra";
import path from "path";
import { spawn } from "child_process";
import https from "https";

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
 * Retrieves video metadata (title, uploader, duration, thumbnail) from YouTube URL.
 */
export async function getMetadata(videoUrl) {
  const binaryPath = await ensureYtdlp();
  return new Promise((resolve, reject) => {
    const proc = spawn(binaryPath, ["--dump-json", "--no-playlist", videoUrl]);
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
  
  // yt-dlp -o format: we use the parent dir + filename template
  const parsedPath = path.parse(outputPath);
  const templatePath = path.join(parsedPath.dir, `${parsedPath.name}.%(ext)s`);

  return new Promise((resolve, reject) => {
    const args = [
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
