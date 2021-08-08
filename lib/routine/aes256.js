const crypto = require('crypto');
const random = require('random-string');

class aes256 {
    #key = null;
    #iv = null;

    /**
     * 根据data创建aes256对象
     * @param {string|{key: string, iv: string}|null} data - 反序列化数据解析
     */
    constructor (data = null) {
        if(!data) {
            data = {key: random({ length: 32 }), iv: random({ length: 16 }) };
        }
        else if (typeof data === 'string') {
            data = JSON.parse(data);
        }
        this.#iv = data.iv;
        this.#key = data.key;
    }

    toString () {
        return JSON.stringify(this.valueOf());
    }

    valueOf () {
        return {
            key: this.#key,
            iv : this.#iv,
        };
    }

    /**
     * 加密
     * @param {string} data - 要加密的数据
     * @param {string} [encoding=binary] - 加密后的编码
     * @returns {Buffer|string} 取决于encoding
     */
    encrypt (data, encoding = 'binary') {
        let cipher = crypto.createCipheriv('aes-256-cbc', this.#key, this.#iv);
        let encrypted = cipher.update(data, 'utf8', encoding);
        encrypted += cipher.final(encoding);
        return encrypted;
    }

    /**
     * 解密
     * @param {string|Buffer} data - 加密的数据
     * @param {string} [encoding=binary] - 加密的数据使用的编码
     * @returns {string}
     */
    decrypt (data, encoding = 'binary') {
        let decipher = crypto.createDecipheriv('aes-256-cbc', this.#key, this.#iv);
        let decrypted = decipher.update(data, encoding, 'utf8');
        return decrypted + decipher.final('utf8');
    }
}

module.exports = aes256;
