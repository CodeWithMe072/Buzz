const fs = require("fs");
const path = require("path");
const {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand,
} = require("@aws-sdk/client-s3");

const client = new S3Client({
    region: "auto",
    endpoint: "https://cb8d35e4d499e103d842f989dbba21d3.r2.cloudflarestorage.com",
    credentials: {
        accessKeyId: "f1dddf33ae50aae22b3de084d6952c3e",
        secretAccessKey: "1f7e9fe5ac02cd8d34625a589a99bf757c655b738cbbceac6c211caf35913caa",
    },
});


const CLOUDFLARE_ACCOUNT_ID = "cb8d35e4d499e103d842f989dbba21d3"
const BUCKET = "buzz-chat";

async function downloadAll() {
    let token;

    do {
        const result = await client.send(
            new ListObjectsV2Command({
                Bucket: BUCKET,
                ContinuationToken: token,
            })
        );

        for (const obj of result.Contents || []) {
            const key = obj.Key;

            const response = await client.send(
                new GetObjectCommand({
                    Bucket: BUCKET,
                    Key: key,
                })
            );

            const filePath = path.join("./backup", key);

            fs.mkdirSync(path.dirname(filePath), { recursive: true });

            const writeStream = fs.createWriteStream(filePath);

            await new Promise((resolve, reject) => {
                response.Body.pipe(writeStream);
                response.Body.on("error", reject);
                writeStream.on("finish", resolve);
            });

            console.log("Downloaded:", key);
        }

        token = result.NextContinuationToken;
    } while (token);
}

downloadAll();