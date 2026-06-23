import crypto from "crypto";
import { Transform } from "stream";

// Helper to get versioned key
export function getKey(version) {
    const envName = version ? `MEDIA_ENCRYPTION_KEY_${version}` : "MEDIA_ENCRYPTION_KEY";
    const rawKey = process.env[envName] || process.env.MEDIA_ENCRYPTION_KEY;
    if (!rawKey) {
        // Fallback for development if no key is defined
        return crypto.createHash("sha256").update("default-secret-key-buzz-app-123456").digest();
    }
    return crypto.createHash("sha256").update(rawKey).digest();
}

// Increment IV counter for AES-CTR seek
export function incrementIV(iv, blockNumber) {
    const ivCopy = Buffer.from(iv);
    let carry = blockNumber;
    
    for (let i = ivCopy.length - 1; i >= 0; i--) {
        const sum = ivCopy[i] + carry;
        ivCopy[i] = sum & 0xff;
        carry = Math.floor(sum / 256);
        if (carry === 0) break;
    }
    return ivCopy;
}

// Encrypt a buffer (prepends 16-byte IV)
export function encryptBuffer(buffer, keyVersion) {
    const key = getKey(keyVersion);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-ctr", key, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return Buffer.concat([iv, encrypted]);
}

// Decrypt a buffer (strips 16-byte IV)
export function decryptBuffer(buffer, keyVersion) {
    if (buffer.length < 16) {
        throw new Error("Ciphertext too short (missing IV)");
    }
    const key = getKey(keyVersion);
    const iv = buffer.subarray(0, 16);
    const ciphertext = buffer.subarray(16);
    const decipher = crypto.createDecipheriv("aes-256-ctr", key, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// Create a stream that encrypts data and prepends IV
export function createEncryptStream(keyVersion) {
    const key = getKey(keyVersion);
    const iv = crypto.randomBytes(16);
    let ivSent = false;
    const cipher = crypto.createCipheriv("aes-256-ctr", key, iv);

    return new Transform({
        transform(chunk, encoding, callback) {
            if (!ivSent) {
                this.push(iv);
                ivSent = true;
            }
            this.push(cipher.update(chunk));
            callback();
        },
        flush(callback) {
            this.push(cipher.final());
            callback();
        }
    });
}

// Create a stream that decrypts data (strips prepended IV)
export function createDecryptStream(keyVersion) {
    const key = getKey(keyVersion);
    let iv = Buffer.alloc(0);
    let decipher = null;

    return new Transform({
        transform(chunk, encoding, callback) {
            if (!decipher) {
                const needed = 16 - iv.length;
                if (chunk.length < needed) {
                    iv = Buffer.concat([iv, chunk]);
                    return callback();
                } else {
                    iv = Buffer.concat([iv, chunk.subarray(0, needed)]);
                    decipher = crypto.createDecipheriv("aes-256-ctr", key, iv);
                    const remaining = chunk.subarray(needed);
                    if (remaining.length > 0) {
                        this.push(decipher.update(remaining));
                    }
                    return callback();
                }
            }
            this.push(decipher.update(chunk));
            callback();
        },
        flush(callback) {
            if (decipher) {
                this.push(decipher.final());
            }
            callback();
        }
    });
}
