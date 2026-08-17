import https from "https";
import http from "http";
import { URL } from "url";

const TARGET_HOST = "https://www.noira.sbs";
const MEDIA_PATH = "/api/media?key=chat_media%2F4e8ccfec-26ff-445a-884a-bf02e761b9e0_VID_20260815_071611_506.mp4&v=v1";
const FULL_URL = `${TARGET_HOST}${MEDIA_PATH}`;

function requestUrl(urlStr, options = {}, throttledBps = 0, latencyMs = 0) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const client = parsed.protocol === "https:" ? https : http;

    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: options.headers || {},
    };

    const startTime = Date.now();
    let ttfb = null;
    let bytesReceived = 0;
    let chunkCount = 0;

    const req = client.request(reqOpts, (res) => {
      ttfb = Date.now() - startTime;
      let lastTokenTime = Date.now();

      res.on("data", async (chunk) => {
        if (latencyMs > 0 && chunkCount === 0) {
          await new Promise(r => setTimeout(r, latencyMs));
        }

        chunkCount++;
        bytesReceived += chunk.length;

        if (throttledBps > 0) {
          const now = Date.now();
          const elapsedSec = (now - lastTokenTime) / 1000;
          lastTokenTime = now;
          const targetTimeSec = chunk.length / throttledBps;
          const delayMs = Math.max(0, (targetTimeSec - elapsedSec) * 1000);
          if (delayMs > 0) {
            res.pause();
            setTimeout(() => res.resume(), delayMs);
          }
        }
      });

      res.on("end", () => {
        const totalDuration = Date.now() - startTime;
        const throughputBps = totalDuration > 0 ? (bytesReceived * 8) / (totalDuration / 1000) : 0;
        const throughputMbps = throughputBps / 1_000_000;
        const throughputMBps = bytesReceived / 1024 / 1024 / (totalDuration / 1000);

        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          ttfb,
          totalDuration,
          bytesReceived,
          chunkCount,
          throughputMbps,
          throughputMBps
        });
      });

      res.on("error", (err) => reject(err));
    });

    req.on("error", (err) => reject(err));
    req.end();
  });
}

async function getAuthToken() {
  console.log("🔑 Registering test account to get fresh JWT token...");
  const user = {
    username: "stress_user_" + Date.now(),
    email: "stress_" + Date.now() + "@example.com",
    password: "Password123!"
  };
  const body = JSON.stringify(user);

  return new Promise((resolve, reject) => {
    const req = https.request(`${TARGET_HOST}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.token) {
            console.log(`✅ Auth successful. User ID: ${json.user?.id}`);
            resolve(json.token);
          } else {
            reject(new Error("Failed to get token: " + data));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function runBenchmarks() {
  console.log("=================================================================");
  console.log("🚀 STARTING SERVER LOAD & VIDEO STREAMING STRESS TEST");
  console.log(`🎯 Target Endpoint: ${FULL_URL}`);
  console.log("=================================================================\n");

  const token = await getAuthToken();
  const headers = { Authorization: `Bearer ${token}` };

  const results = {};

  // -----------------------------------------------------------------
  // 1. FULL SPEED SINGLE STREAM TEST
  // -----------------------------------------------------------------
  console.log("\n📡 --- TEST 1: Full Speed Single Stream (Full File ~25.7MB) ---");
  const fullSpeedSingle = await requestUrl(FULL_URL, { headers });
  console.log(`Status Code         : ${fullSpeedSingle.statusCode}`);
  console.log(`Content-Type        : ${fullSpeedSingle.headers['content-type']}`);
  console.log(`Bytes Downloaded    : ${(fullSpeedSingle.bytesReceived / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Time To First Byte  : ${fullSpeedSingle.ttfb} ms`);
  console.log(`Total Download Time : ${(fullSpeedSingle.totalDuration / 1000).toFixed(2)} s`);
  console.log(`Average Throughput  : ${fullSpeedSingle.throughputMbps.toFixed(2)} Mbps (${fullSpeedSingle.throughputMBps.toFixed(2)} MB/s)`);
  results.fullSpeedSingle = fullSpeedSingle;

  // -----------------------------------------------------------------
  // 2. RANGE REQUEST STREAMING TEST (Simulates Video Seeking / Chunking)
  // -----------------------------------------------------------------
  console.log("\n🎬 --- TEST 2: Range Requests (Video Player Chunk Preloading) ---");
  const chunksToTest = [
    { name: "Initial Chunk (0-1MB)", range: "bytes=0-1048575" },
    { name: "Second Chunk (1-3MB)", range: "bytes=1048576-3145727" },
    { name: "Mid-Stream Seek (10-12MB)", range: "bytes=10485760-12582911" }
  ];

  results.rangeChunks = [];
  for (const chunk of chunksToTest) {
    const rangeHeaders = { ...headers, Range: chunk.range };
    const chunkRes = await requestUrl(FULL_URL, { headers: rangeHeaders });
    console.log(`\n🔹 ${chunk.name} [Range: ${chunk.range}]`);
    console.log(`   Status Code      : ${chunkRes.statusCode} ${chunkRes.statusCode === 206 ? '(Partial Content - OK)' : ''}`);
    console.log(`   Content-Range    : ${chunkRes.headers['content-range']}`);
    console.log(`   Bytes Received   : ${(chunkRes.bytesReceived / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   TTFB             : ${chunkRes.ttfb} ms`);
    console.log(`   Download Speed   : ${chunkRes.throughputMbps.toFixed(2)} Mbps`);
    results.rangeChunks.push({ name: chunk.name, ...chunkRes });
  }

  // -----------------------------------------------------------------
  // 3. CONCURRENT LOAD STRESS TEST (Full Speed)
  // -----------------------------------------------------------------
  console.log("\n⚡ --- TEST 3: Concurrent Streams Load Test ---");
  const concurrencyLevels = [3, 6, 10];
  results.concurrency = {};

  for (const level of concurrencyLevels) {
    console.log(`\n🔥 Running ${level} Concurrent Video Downloads...`);
    const startConcur = Date.now();
    const promises = Array.from({ length: level }, () => requestUrl(FULL_URL, { headers }));
    const concurResults = await Promise.all(promises);
    const totalConcurTime = Date.now() - startConcur;

    const successful = concurResults.filter(r => r.statusCode === 200).length;
    const rateLimited = concurResults.filter(r => r.statusCode === 429).length;
    const totalBytes = concurResults.reduce((acc, r) => acc + r.bytesReceived, 0);
    const avgTTFB = concurResults.reduce((acc, r) => acc + r.ttfb, 0) / concurResults.length;
    const aggregateMbps = (totalBytes * 8) / (totalConcurTime / 1000) / 1_000_000;
    const aggregateMBps = (totalBytes / 1024 / 1024) / (totalConcurTime / 1000);

    console.log(`   Level                : ${level} Concurrent Clients`);
    console.log(`   Successful (200 OK)  : ${successful}/${level}`);
    console.log(`   Rate Limited (429)   : ${rateLimited}/${level}`);
    console.log(`   Total Bytes Download : ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Total Duration       : ${(totalConcurTime / 1000).toFixed(2)} s`);
    console.log(`   Average TTFB         : ${avgTTFB.toFixed(1)} ms`);
    console.log(`   Aggregate Throughput : ${aggregateMbps.toFixed(2)} Mbps (${aggregateMBps.toFixed(2)} MB/s)`);

    results.concurrency[`level_${level}`] = {
      level, successful, rateLimited, totalBytes, totalConcurTime, avgTTFB, aggregateMbps, aggregateMBps
    };
  }

  // -----------------------------------------------------------------
  // 4. SIMULATED 4G NETWORK TEST
  // (~12 Mbps / 1.5 MB/s download, 50ms latency)
  // -----------------------------------------------------------------
  console.log("\n📱 --- TEST 4: Simulated 4G Network (12 Mbps, 50ms RTT) ---");
  const target4gBps = 12 * 1_000_000 / 8; // 1.5 MB/s
  const range4g = { ...headers, Range: "bytes=0-3145727" };
  const res4g = await requestUrl(FULL_URL, { headers: range4g }, target4gBps, 50);
  console.log(`   Status Code          : ${res4g.statusCode}`);
  console.log(`   Initial 3MB Buffer   : ${(res4g.totalDuration / 1000).toFixed(2)} s`);
  console.log(`   TTFB (Latency + RTT) : ${res4g.ttfb} ms`);
  console.log(`   Effective Speed      : ${res4g.throughputMbps.toFixed(2)} Mbps`);
  results.simulated4G = res4g;

  // -----------------------------------------------------------------
  // 5. SIMULATED SLOW 4G NETWORK TEST
  // (~1.5 Mbps / 187.5 KB/s download, 150ms latency)
  // -----------------------------------------------------------------
  console.log("\n🐢 --- TEST 5: Simulated Slow 4G Network (1.5 Mbps, 150ms RTT) ---");
  const targetSlow4gBps = 1.5 * 1_000_000 / 8; // 187.5 KB/s
  const rangeSlow4g = { ...headers, Range: "bytes=0-1048575" };
  const resSlow4g = await requestUrl(FULL_URL, { headers: rangeSlow4g }, targetSlow4gBps, 150);
  console.log(`   Status Code          : ${resSlow4g.statusCode}`);
  console.log(`   Initial 1MB Buffer   : ${(resSlow4g.totalDuration / 1000).toFixed(2)} s`);
  console.log(`   TTFB (Latency + RTT) : ${resSlow4g.ttfb} ms`);
  console.log(`   Effective Speed      : ${resSlow4g.throughputMbps.toFixed(2)} Mbps`);
  results.simulatedSlow4G = resSlow4g;

  // -----------------------------------------------------------------
  // 6. RATE LIMITER BURST STRESS TEST
  // -----------------------------------------------------------------
  console.log("\n🛡️ --- TEST 6: Rate Limiting & Burst Protection Test ---");
  console.log("Sending rapid requests to evaluate mediaRateLimiter (Limit: 150 req / 60s)...");

  let totalBurst = 160;
  let res200 = 0;
  let res429 = 0;
  let otherCodes = 0;

  const burstStart = Date.now();
  for (let i = 0; i < totalBurst; i += 20) {
    const batch = Array.from({ length: 20 }, () =>
      requestUrl(FULL_URL, { headers, Range: "bytes=0-100" })
    );
    const batchRes = await Promise.all(batch);
    for (const r of batchRes) {
      if (r.statusCode === 200 || r.statusCode === 206) res200++;
      else if (r.statusCode === 429) res429++;
      else otherCodes++;
    }
  }
  const burstDuration = Date.now() - burstStart;

  console.log(`   Total Requests Sent  : ${totalBurst}`);
  console.log(`   Accepted (200/206)   : ${res200}`);
  console.log(`   Rate Limited (429)   : ${res429}`);
  console.log(`   Other Statuses       : ${otherCodes}`);
  console.log(`   Burst Time Elapsed   : ${(burstDuration / 1000).toFixed(2)} s`);

  results.rateLimiter = { totalBurst, res200, res429, otherCodes, burstDuration };

  console.log("\n=================================================================");
  console.log("🎉 ALL STRESS TESTS COMPLETED SUCCESSFULLY!");
  console.log("=================================================================\n");
}

runBenchmarks().catch(console.error);
