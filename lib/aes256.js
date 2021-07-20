const crypto = require('crypto');
const random = require('random-string');
const stream = require('stream');

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
     * @returns {string}
     */
    encrypt (data) {
        const cipher = crypto.createCipheriv('aes-256-cbc', this.#key, this.#iv);
        return Buffer.concat([cipher.update(Buffer.from(data)),cipher.final()]);
    }

    /**
     * 解密
     * @param {string|Buffer} data - 加密的数据
     * @returns {string}
     */
    decrypt (data) {
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.#key, this.#iv);
        return Buffer.concat([decipher.update(Buffer.from(data)) , decipher.final()]);
    }

    encrypt_cipher () {
        const cipher = crypto.createCipheriv('aes-256-cbc', this.#key, this.#iv);
        return cipher;
    }

    decrypt_cipher () {
        const cipher = crypto.createDecipheriv('aes-256-cbc', this.#key, this.#iv);
        return cipher;
    }

}

module.exports = aes256;
