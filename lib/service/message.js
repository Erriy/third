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
 *  "id": "xxxxx",
 *  "from": "xxxxx",
 *  "to": "xxxx",
 *  "type": "",
 *  "data": *
 * }
 */

async function init () {
    await runtime.db.run(`
        create table if not exists message(
            id text primary key, -- 消息id，双方一致，包含在消息内部
            [from] text not null, -- 发送者指纹
            [to] text not null, -- 接收者指纹
            type text, -- 消息类型
            message text not null, -- 消息体的json序列化
            origin text not null, -- 真正发出去的加密和签名后的消息实体，为发送者和接受者加密
            created number not null, -- 以秒为单位的消息创建时间
            completed number not null -- 以秒为单位的消息接收/发送成功的时间
        )
    `);
}

async function save_message_to_database (
    id, from, to, type, message, origin, created, completed
) {
    await runtime.db.run(
        `
            replace into message (
                id, [from], [to], type, message, origin, created, completed
            ) values (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        id, from, to, type, message, origin, created, completed
    );
}

/**
 * 发送消息
 * @param {string} fingerprint
 * @param {{to:string, type?:string, message: *}} message - 发送的消息实体
 */
async function send (message) {
    const my_fpr = runtime.key.getFingerprint().toUpperCase();
    message.id = my_fpr + '.' + uuid.v1().split('-').slice(0, -1).join('');
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
    const encrypted = (await openpgp.encrypt({
        message       : await openpgp.createMessage({text: JSON.stringify(message)}),
        encryptionKeys: [
            runtime.key.toPublic(),
            await openpgp.readKey({armoredKey: pk})
        ],
        signingKeys: runtime.key,
    })).toString();

    /** 发送消息 */
    await axios.put(
        urljoin(third_service, 'api/message'), 
        encrypted,
        {headers: {'Content-Type': 'text/plain'}}
    );

    /** 保存到数据库 */
    // todo 发送失败的消息也保存一下
    const timestamp = new Date().getTime() / 1000;
    await save_message_to_database(
        message.id,
        my_fpr,
        message.to,
        message.type || null,
        JSON.stringify(message),
        encrypted,
        timestamp,
        timestamp,
    );

    return message.id;
}

async function recv (encrypted) {
    let d = null;
    let fpr = null;
    let message = null;
    const my_fpr = runtime.key.getFingerprint().toUpperCase();
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
    const sender_fpr = sender_pubkey.getFingerprint().toUpperCase();

    const v = await openpgp.verify({
        message         : await openpgp.createMessage({text: d.data}),
        signature       : d.signatures[0].signature,
        verificationKeys: sender_pubkey
    });
    if(!await v.signatures[0].verified) {
        throw new Error('签名验证失败');
    }
    // 验证是否是历史消息
    const created = new Date(v.signatures[0].signature.packets[0].created).getTime() / 1000;
    if(new Date().getTime() / 1000 - created > 60 * 5) {
        throw new Error('拒绝接受五分钟之前的信息');
    }

    // 验证内容格式
    try {
        message = JSON.parse(d.data);
    }
    catch(e) {
        throw new Error('消息格式不正确');
    }

    // 验证id是否正确
    if(typeof message.id !== 'string' || !message.id.startsWith(sender_fpr)) {
        throw new Error('消息id格式不正确');
    }
    // 验证是否指定消息接收者
    if(typeof message.to !== 'string' || message.to !== my_fpr) {
        throw new Error('未在签名中指定接收方，拒绝接受数据');
    }

    console.log(sender_fpr, '=>', runtime.key.getFingerprint().toUpperCase(), ':', d.data);

    const timestamp = new Date().getTime() / 1000;
    await save_message_to_database(
        message.id,
        sender_fpr,
        message.to,
        message.type || null,
        JSON.stringify(message),
        encrypted,
        created,
        timestamp,
    );
}

module.exports = {
    init,
    send,
    recv,
};