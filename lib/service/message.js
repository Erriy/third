const runtime = require('./runtime');
const uuid = require('uuid');
const openpgp = require('openpgp');
const pubkey = require('./pubkey');
const ticket = require('./ticket');
const axios = require('axios').default;
const urljoin = require('url-join');

/**
 * message 结构
 * {
 *  "uuid": "xxxxx",
 *  "from": "xxxxx",
 *  "to": "xxxx",
 *  "type": "",
 *  "data": *
 * }
 */

async function init () {
    await runtime.db.run(`
        create table if not exists message(
            uuid text primary, -- 消息的uuid，双方一致，包含在消息内部
            from text not null, -- 发送者指纹
            to text not null, -- 接收者指纹
            type text not null, -- 消息类型
            data text not null, -- 消息体的json序列化
            origin text not null, -- 真正发出去的加密和签名后的消息实体，为发送者和接受者加密
            created number not null, -- 以秒为单位的消息创建时间
            completed number not null, -- 以秒为单位的消息接收/发送成功的时间
        )
    `);
}

/**
 * 发送消息
 * @param {string} fingerprint
 * @param {{to:string, uuid?: string, type?:string, message: *}} message - 发送的消息实体
 */
async function send (message) {
    if(!message.uuid) {
        message.uuid = uuid.v1();
    }
    /** 查找ticket和pubkey */
    let third_service = null;
    try {
        const t = await ticket.get(message.to, {discover: true});
        third_service = (await ticket.analysis(t)).object.service.third;
    }
    catch(e) {
        throw new Error('对方暂时未加入third服务');
    }
    if(!third_service) {
        throw new Error('对方未开启third服务');
    }

    const pk = await pubkey.get(message.to);
    if(!pk) {
        throw new Error('找不到对方的公钥，发送失败');
    }
    /** 加密数据 */
    const encrypted = await openpgp.encrypt({
        message       : await openpgp.createMessage({text: JSON.stringify(message)}),
        encryptionKeys: [
            runtime.key.toPublic(),
            await openpgp.readKey({armoredKey: pk})
        ],
        signingKeys: runtime.key,
    });

    /** 发送消息 */
    await axios.put(
        urljoin(third_service, 'api/message'), 
        encrypted.toString(),
        {headers: {'Content-Type': 'text/plain'}}
    );

    // todo 本地保存消息

    return message.uuid;
}

async function recv (encrypted) {
    let d = null;
    let fpr = null;
    let message = null;
    /** 解密数据 */
    try {
        d = await openpgp.decrypt({
            message: await openpgp.readMessage({
                armoredMessage: encrypted
            }),
            decryptionKeys: runtime.key,
        });
        fpr = Buffer.from(d.signatures[0].signature.packets[0].issuerFingerprint).toString('hex').toUpperCase();
    }
    catch(e) {
        throw new Error('解密失败');
    }
    /** 验证签名 */
    const pk = await pubkey.get(fpr);
    if(!pk) {
        const e = new Error('公钥不存在，请提交公钥');
        e.status = 401;
        throw e;
    }
    const sender_pubkey = await openpgp.readKey({armoredKey: pk});
    const v = await openpgp.verify({
        message         : await openpgp.createMessage({text: d.data}),
        signature       : d.signatures[0].signature,
        verificationKeys: sender_pubkey
    });
    if(!await v.signatures[0].verified) {
        throw new Error('签名验证失败');
    }

    try {
        message = JSON.parse(d.data);
    }
    catch(e) {
        throw new Error('消息格式不正确');
    }

    const from_fpr = sender_pubkey.getFingerprint().toUpperCase();

    console.log(from_fpr, '=>', runtime.key.getFingerprint().toUpperCase(), ':', d.data);
}

module.exports = {
    init,
    send,
    recv,
};