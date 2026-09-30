import * as crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

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
    constructor(secret, db) {
        this.key = deriveKey(secret);
        this.collection = db.collection('tokens');
    }

    async save(userId, token) {
        const encryptedData = encrypt(token, this.key);
        await this.collection.updateOne(
            { userId },
            { $set: { encryptedData } },
            { upsert: true }
        );
    }

    async get(userId) {
        const doc = await this.collection.findOne({ userId });
        if (!doc) return null;
        return decrypt(doc.encryptedData, this.key);
    }

    async remove(userId) {
        const result = await this.collection.deleteOne({ userId });
        return result.deletedCount > 0;
    }

    async has(userId) {
        const count = await this.collection.countDocuments({ userId }, { limit: 1 });
        return count > 0;
    }

    async getSize() {
        return await this.collection.countDocuments();
    }

    async listUserIds() {
        const docs = await this.collection.find({}, { projection: { userId: 1 } }).toArray();
        return docs.map(d => d.userId);
    }
}
