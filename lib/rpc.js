const axios = require('axios').default;
const openpgp = require('openpgp');
const urljoin = require('url-join');
const runtime = require('./runtime');
const kns = require('./kns');

const obj = {
    /**
     * @type {Object.<string, Array.<function>>}
     */
    handler_map: {}
};

async function do_request (r, encrypted) {
    const headers = {
        'Content-Type': 'text/plain'
    };

    // 尝试本地请求
    if(r.local_service) {
        try {
            const resp = await axios({
                method : 'POST',
                url    : urljoin(r.local_service, 'rpc'),
                timeout: 300,
                headers,
                data   : encrypted
            });
            return resp.data;
        }
        catch (err) {
            kns.clear_local_service(r.fingerprint);
        }
    }

    // 尝试中继连接
    const object = JSON.parse(r.text);
    const service = object.service;
    try {
        const resp = await axios({
            method : 'POST',
            url    : urljoin(service, 'rpc'),
            timeout: 1000 * 5,
            headers,
            data   : encrypted
        });
        return resp.data;
    }
    catch (err) {
        throw new Error('请求失败');
    }
}

async function encrypt_and_sign (data, pubkey) {
    return await openpgp.encrypt({
        message: await openpgp.createMessage({
            text: data
        }),
        signingKeys   : runtime.key,
        encryptionKeys: await openpgp.readKey({armoredKey: pubkey})
    });
}

async function decrypt_and_verify (encrypted, pubkey) {
    // 解密
    const d = await openpgp.decrypt({
        message: await openpgp.readMessage({
            armoredMessage: encrypted
        }),
        decryptionKeys: runtime.key
    });

    if(!d.signatures || d.signatures.length === 0) {
        throw new Error('请求必须签名');
    }

    const fpr = Buffer.from(d.signatures[0].signature.packets[0].issuerFingerprint).toString('hex').toUpperCase();
    if(!pubkey) {
        const r = await kns.get(fpr, {discover: true});
        if(!r) {
            throw new Error('找不到对方公钥信息，无法验证签名');
        }
        pubkey = r.pubkey;
    }

    pubkey = await openpgp.readKey({armoredKey: pubkey});
    const v = await openpgp.verify({
        message         : await openpgp.createMessage({text: d.data}),
        date            : new Date(Date.now() + 1000),
        signature       : d.signatures[0].signature,
        verificationKeys: pubkey
    });
    if(!await v.signatures[0].verified) {
        throw new Error('签名验证失败');
    }

    return {
        time: {
            sign: new Date(
                v.signatures[0].signature.packets[0].created
            ).getTime() / 1000,
            recv: new Date().getTime() / 1000,
        },
        fingerprint: pubkey.getFingerprint().toUpperCase(),
        data       : d.data,
        pubkey     : pubkey.armor()
    };
}

async function invoke (fingerprint, name, ...args) {
    if(!fingerprint || !name) {
        throw new Error('必须指定指纹和name');
    }
    let request_data = {name, args};
    try {
        request_data = JSON.stringify(request_data);
    }
    catch (err) {
        throw new Error('携带数据必须可以被json序列化');
    }

    // 查询对方record
    const r = await kns.get(fingerprint, {discover: true});
    if(!r) {
        throw new Error('找不到对方的kns record');
    }

    // 请求并解密返回结果
    const encrypted_response = await do_request(r, await encrypt_and_sign(request_data, r.pubkey));
    // 解密数据
    const result = await decrypt_and_verify(encrypted_response, r.pubkey);
    return JSON.parse(result.data);
}

/**
 *
 * @param {string} encrypted - 加密消息
 */
async function handle (encrypted) {
    if(typeof encrypted !== 'string' || encrypted.length === 0) {
        throw new Error('不支持的消息类型');
    }

    const d = await decrypt_and_verify(encrypted);
    let r = null;
    try {
        r = JSON.parse(d.data);
    }
    catch(e) {
        throw new Error('携带数据格式不正确，必须为json序列化');
    }

    if(typeof r.name !== 'string' || r.name.length === 0) {
        throw new Error('请求方法错误');
    }

    if(!obj.handler_map[r.name]) {
        throw new Error('未实现此接口');
    }

    let results = [];
    for(let handler of obj.handle_map(r.name)) {
        let result = handler(...r.args, d);
        if(result instanceof Promise) {
            result = await result;
        }
        if(undefined !== result) {
            results.push(result);
        }
    }

    if(results.length === 0) {
        results = undefined;
    }
    else if(results.length === 1) {
        results = results[0];
    }

    return await encrypt_and_sign(JSON.stringify(results), d.pubkey);
}

/**
 * @typedef {function({time: {sign: number, recv: number}, fingerprint: string, data: string, pubkey: string})} rpc_handler_callback
 */

/**
 * 注册处理函数
 * @param {string} name
 * @param {rpc_handler_callback} handler
 */
function regist (name, handler) {
    if(!(obj.handler_map[name] instanceof Array)) {
        obj.handler_map[name] = [];
    }
    obj.handler_map[name].push(handler);
}

module.exports = {
    invoke,
    handle,
    regist,
};