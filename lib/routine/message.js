const events = require('events');
const openpgp = require('openpgp');
const session = require('./session');
const runtime = require('./runtime');
const ticket = require('./ticket');

const obj = {
    /**
     * @type {events.EventEmitter}
     */
    event: null,
};

/**
 * 接收消息
 * @param {string} message
 */
async function recv (message) {
    const msg = {
        type     : 'message',
        data     : '',
        encrypted: false,
        from     : null,
        time     : {
            recv: new Date().getTime() / 1000,
            sign: undefined,
        }
    };

    // 处理加密消息
    if(typeof message === 'string') {
        // 解密
        const d = await openpgp.decrypt({
            message: await openpgp.readMessage({
                armoredMessage: message
            }),
            decryptionKeys: runtime.key
        });
        // 如果有签名则验证签名
        if(d.signatures && d.signatures.length > 0) {
            const fpr = Buffer.from(d.signatures[0].signature.packets[0].issuerFingerprint).toString('hex').toUpperCase();
            const t = await ticket.get(fpr, {discover: true});
            if(!t) {
                throw new Error('无法验证身份，请确保自己已加入third网络');
            }
            const sender_pubkey = await openpgp.readKey({armoredKey: t.pubkey});
            const v = await openpgp.verify({
                message         : await openpgp.createMessage({text: d.data}),
                date            : new Date(Date.now() + 1000),
                signature       : d.signatures[0].signature,
                verificationKeys: sender_pubkey
            });
            if(!await v.signatures[0].verified) {
                throw new Error('签名验证失败');
            }
            msg.from = sender_pubkey.getFingerprint().toUpperCase();
            msg.time.sign = new Date(
                v.signatures[0].signature.packets[0].created
            ).getTime() / 1000;
        }
        try {
            const o = JSON.parse(d.data);
            if(o.data) {
                msg.data = o.data;
            }
            if(typeof o.type === 'string') {
                msg.type = o.type;
            }
        }
        catch(e) {
            throw new Error('携带数据格式不正确');
        }
        msg.encrypted = true;
    }
    else {
        throw new Error('不支持的消息类型');
    }

    if(-1 !== obj.event.eventNames().indexOf(msg.type)) {
        obj.event.emit(msg.type, msg);
    }
}

/**
 * @callback message_on_event_callback
 * @param {Object} msg
 * @param {string} msg.type - 消息类型
 * @param {*} msg.data - 消息实体
 * @param {boolean} msg.encrypted - 原始消息是否加密
 * @param {string|null} msg.from - 消息来源，指纹类型
 */

/**
 * @param {string} type
 * @param {message_on_event_callback} callback
 */
function on (type, callback) {
    obj.event.on(type, callback);
}

async function send ({
    fingerprint = null,
    data = undefined,
    type = undefined,
}) {
    const msg = {type, data};
    const t = await ticket.get(fingerprint, {discover: true});
    if(!t) { throw new Error('对方未加入third网络');}

    const message = await openpgp.encrypt({
        message       : await openpgp.createMessage({text: JSON.stringify(msg)}),
        signingKeys   : runtime.key,
        encryptionKeys: await openpgp.readKey({armoredKey: t.pubkey})
    });
    try {
        await (await session.select(fingerprint)).put('api/message', message);
    }
    catch(e) {}
}

async function init () {
    // todo 保存消息，支持设备间聊天
    obj.event = new events.EventEmitter();
}

module.exports = {
    init,
    recv,
    send,
    on,
};