import { execFile } from "child_process";
import path from "path";
import os from "os";
import fs from "fs-extra";

const tempImage = path.join(os.tmpdir(), "test_img.jpg");
const tempAudio = path.join(os.tmpdir(), "test_aud.mp3");
const tempOutput = path.join(os.tmpdir(), "test_vid.mp4");

async function run() {
    const srcImage = path.join(process.cwd(), "public", "images", "flag.jpg");
    // Let's copy flag.jpg as both image and dummy audio (we can just verify it works)
    await fs.copy(srcImage, tempImage);
    await fs.copy(srcImage, tempAudio);

    console.log("Paths (Forward Slashes + Even Scale Filter):");
    const tempImageForward = tempImage.replace(/\\/g, "/");
    const tempAudioForward = tempAudio.replace(/\\/g, "/");
    const tempOutputForward = tempOutput.replace(/\\/g, "/");

    console.log("Image:", tempImageForward);
    console.log("Audio:", tempAudioForward);
    console.log("Output:", tempOutputForward);

    execFile(
        "ffmpeg",
        [
            "-y",
            "-loop", "1",
            "-i", tempImageForward,
            "-i", tempAudioForward,
            "-t", "15",
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-c:v", "libx264",
            "-tune", "stillimage",
            "-preset", "superfast",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            "-shortest",
            tempOutputForward
        ],
        (err, stdout, stderr) => {
            console.log("\n--- TEST RUN ---");
            if (err) {
                console.error("Error:", err.message);
                console.error("Stderr:", stderr);
            } else {
                console.log("Success! Video generated successfully!");
            }

            // Cleanup
            fs.removeSync(tempImage);
            fs.removeSync(tempAudio);
            fs.removeSync(tempOutput);
        }
    );
}

run().catch(console.error);
