const axios = require('axios').default;
const openpgp = require('openpgp');
const urljoin = require('url-join');
const stream = require('stream');
const runtime = require('./runtime');
const kns = require('./kns');
const aes256 = require('./aes256');

const obj = {
    /**
     * @type {Object.<string, function>}
     */
    handler_map: {}
};

class enums {
    static get OBJECT () {
        return 0;
    }

    static get STREAM () {
        return 1;
    }
}

async function do_request (r, encrypted) {
    const headers = {
        'Content-Type': 'text/plain'
    };

    // 尝试本地请求
    if(r.local_service) {
        runtime.logger.debug(`[rpc.invoke.do_request(${r.fingerprint})] 尝试本地连接`);
        try {
            const resp = await axios({
                method      : 'POST',
                url         : urljoin(r.local_service, 'rpc'),
                timeout     : 300,
                headers,
                data        : encrypted,
                responseType: 'stream',
            });
            runtime.logger.debug(`[rpc.invoke.do_request(${r.fingerprint})] 本地请求正确，返回流`);
            return resp.data;
        }
        catch (err) {
            runtime.logger.debug(`[rpc.invoke.do_request(${r.fingerprint})] 本地连接失败，清除本地服务缓存`);
            await kns.clear_local_service(r.fingerprint);
        }
    }

    // 尝试中继连接
    const object = JSON.parse(r.text);
    const service = object.service;
    runtime.logger.debug(`[rpc.invoke.do_request(${r.fingerprint})] 尝试连接远程服务`);
    try {
        const resp = await axios({
            method      : 'POST',
            url         : urljoin(service, 'rpc'),
            timeout     : 1000 * 5,
            headers,
            data        : encrypted,
            responseType: 'stream',
        });
        runtime.logger.debug(`[rpc.invoke] -> ${r.fingerprint} 远程请求正确，返回流`);
        return resp.data;
    }
    catch (err) {
        runtime.logger.debug(`[rpc.invoke] -> ${r.fingerprint} 请求失败`);
        runtime.emit('rpc.invoke.failed', r.fingerprint);
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

function stream_analysis (encrypt_stream, aes) {

    const res_stream = encrypt_stream.pipe(aes.decrypt_cipher());

    return new Promise((resolve, reject)=>{

        res_stream.once('readable', ()=>{
            const first = res_stream.read();
            if(enums.OBJECT === first[0]) {
                const buffer = Buffer.from(first.slice(1));
                res_stream.on('data', data=>{
                    buffer.concat(data);
                });
                res_stream.on('error', e=>{
                    return reject(e);
                });
                res_stream.on('end', ()=>{
                    return resolve(JSON.parse(buffer.toString()));
                });
            }
            else if(enums.STREAM === first[0]) {
                const s = new stream.Readable({read (){}});
                s.push(first.slice(1));
                res_stream.on('data', data=>{
                    s.push(data);
                });
                res_stream.on('error', e=>{
                    s.emit('error', e);
                });
                res_stream.on('end', ()=>{
                    s.push(null);
                });
                return resolve(s);
            }
            else {
                return reject('返回数据格式不正确');
            }
        });
    });
}

async function invoke (fingerprint, name, ...args) {
    // todo 使用multipart/form-data支持上传流，一部分签名的传输信息，后面跟随加密的流数据，支持流式上传    或直接使用openpgpjs的stream加密
    if(!fingerprint || !name) {
        throw new Error('必须指定指纹和name');
    }
    const aes = new aes256();
    let request_data = {name, args, aes256: aes.valueOf()};
    try {
        request_data = JSON.stringify(request_data);
    }
    catch (err) {
        runtime.logger.error(`[rpc.invoke(${fingerprint}, ${name})] 数据格式有误`);
        throw new Error('携带数据必须可以被json序列化');
    }

    // 查询对方record
    const r = await kns.get(fingerprint, {discover: true});
    if(!r) {
        runtime.logger.error(`[rpc.invoke(${fingerprint}, ${name})] 对方不在线`);
        throw new Error('找不到对方的信息');
    }

    // 请求并解密返回结果
    const encrypt_stream = await do_request(r, await encrypt_and_sign(request_data, r.pubkey));
    if(!encrypt_stream) {
        runtime.logger.error(`[rpc.invoke(${fingerprint}, ${name})] 请求没有响应`);
        throw new Error('没有返回消息，请求失败');
    }
    // 解密数据
    return await stream_analysis(encrypt_stream, aes);
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

    let result = obj.handler_map[r.name](...r.args, d);
    if(result instanceof Promise) {
        result = await result;
    }

    const type_buffer = Buffer.alloc(1);
    type_buffer[0] = enums.STREAM;
    if(typeof result !== 'object' || typeof result.pipe !== 'function') {
        result = stream.Readable.from(Buffer.from(JSON.stringify(result)));
        type_buffer[0] = enums.OBJECT;
    }

    const aes = (new aes256(r.aes256)).encrypt_cipher();
    const s = new stream.Readable({read (){}});

    // todo 计算hash值，最后传送hash给客户端，供客户端验证数据，hash如果结果不匹配，则throw error
    aes.write(type_buffer);
    result.pipe(aes);
    aes.on('error', (e)=>{
        s.emit('error', e);
    });
    aes.on('data', data=>{
        s.push(data);
    });
    aes.on('end', ()=>{
        s.push(null);
    });

    return s;
}

/**
 * 注册处理函数
 * @param {string} name
 * @param {function} handler
 */
function regist (name, handler) {
    if(obj.handler_map[name]) {
        throw new Error(`重复注册'${name}'rpc处理函数，拒绝执行`);
    }
    obj.handler_map[name] = handler;
}

module.exports = {
    invoke,
    handle,
    regist,
};