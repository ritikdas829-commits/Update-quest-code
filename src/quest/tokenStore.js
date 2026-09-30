import * as crypto from 'node:crypto';
import mongoose from 'mongoose';

const ALGORITHM = 'aes-256-gcm';

// Mongoose Schema for Tokens
const tokenSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    encryptedData: { type: String, required: true }
});

const TokenModel = mongoose.models.BotToken || mongoose.model('BotToken', tokenSchema);

function deriveKey(secret) {
    return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(text, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        data: encrypted.toString('hex'),
    });
}

function decrypt(stored, key) {
    try {
        const { iv, tag, data } = JSON.parse(stored);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(tag, 'hex'));
        return decipher.update(Buffer.from(data, 'hex')) + decipher.final('utf8');
    } catch {
        return null;
    }
}

export class TokenStore {
    constructor(secret) {
        this.key = deriveKey(secret);
    }

    async save(userId, token) {
        const encryptedData = encrypt(token, this.key);
        await TokenModel.findOneAndUpdate(
            { userId },
            { encryptedData },
            { upsert: true, new: true }
        );
    }

    async get(userId) {
        const doc = await TokenModel.findOne({ userId });
        if (!doc) return null;
        return decrypt(doc.encryptedData, this.key);
    }

    async remove(userId) {
        const result = await TokenModel.deleteOne({ userId });
        return result.deletedCount > 0;
    }

    async has(userId) {
        const count = await TokenModel.countDocuments({ userId });
        return count > 0;
    }

    // Yahan 'async get size()' ko 'async getSize()' kar diya hai
    async getSize() {
        return await TokenModel.countDocuments();
    }

    async listUserIds() {
        const docs = await TokenModel.find({}, 'userId');
        return docs.map(d => d.userId);
    }
}
