import https from "https";

const TARGET_HOST = "https://www.noira.sbs";
const MEDIA_PATH = "/api/media?key=chat_media%2F4e8ccfec-26ff-445a-884a-bf02e761b9e0_VID_20260815_071611_506.mp4&v=v1";
const FULL_URL = `${TARGET_HOST}${MEDIA_PATH}`;

async function getAuthToken() {
  const user = {
    username: "burst_user_" + Date.now(),
    email: "burst_" + Date.now() + "@example.com",
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
          resolve(json.token);
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function quickHeadRequest(token) {
  return new Promise((resolve) => {
    const req = https.request(FULL_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Range: "bytes=0-10"
      }
    }, (res) => {
      res.on("data", () => {});
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", () => resolve(500));
    req.end();
  });
}

async function testBurst() {
  const token = await getAuthToken();
  console.log("Testing 50 rapid sequential range requests...");
  let count206 = 0;
  let count429 = 0;
  let countOther = 0;

  const start = Date.now();
  for (let i = 0; i < 50; i++) {
    const code = await quickHeadRequest(token);
    if (code === 206 || code === 200) count206++;
    else if (code === 429) count429++;
    else countOther++;
  }
  const duration = Date.now() - start;

  console.log(`Results: 206/200 OK: ${count206}, 429 RateLimited: ${count429}, Other: ${countOther}`);
  console.log(`Duration: ${(duration / 1000).toFixed(2)}s, Req/sec: ${(50 / (duration / 1000)).toFixed(2)}`);
}

testBurst();
