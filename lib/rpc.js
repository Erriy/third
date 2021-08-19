const axios = require('axios').default;
const openpgp = require('openpgp');
const urljoin = require('url-join');
const stream = require('stream');
const crypto = require('crypto');
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
    // todo 单次防重放攻击，1分钟内nonce不允许相同
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

function stream_wrapper (type, content_stream) {
    return new Promise((resolve, reject)=>{
        if(enums.STREAM === type) {
            return resolve(content_stream);
        }

        const buffers = [];
        content_stream.on('data', data=>{
            buffers.push(data);
        });
        content_stream.on('end', ()=>{
            const str = Buffer.concat(buffers).toString();
            try {
                return resolve(JSON.parse(str));
            }
            catch(e) {
                return reject(new Error('返回数据格式有误，JSON反序列化失败'));
            }
        });
        content_stream.on('error', e=>{
            return reject(e);
        });
    });
}

function stream_analysis (encrypt_stream, aes) {
    // todo 流处理可优化
    // 解密流
    const orig_stream = encrypt_stream.pipe(aes.decrypt_cipher());
    const sha512 = crypto.createHash('sha512');

    // type + content_stream + sha512_base64 = orig_stream
    let type = undefined;
    const content_stream = new stream.Readable({read (){}});
    let sha512_base64 = Buffer.alloc(0);
    const sha512_length = 88; // sha512的base64编码长度为88

    return new Promise((resolve, reject)=>{

        let timeoutid;
        const timeout = (timeout)=>{
            let ws = stream.Writable({});
            ws._write = function (chunk, enc, next) {
                if (timeoutid) clearTimeout(timeoutid);
                timeoutid = setTimeout(function () {
                    ws.emit('timeout');
                }, timeout);
                next();
            };
            return ws;
        };

        // 超时自动断开
        orig_stream.pipe(timeout(1000)).on('timeout', () => {
            encrypt_stream.req.abort();
            content_stream.emit('error', new Error('数据传输超时断开'));
        });

        // 传输数据完成，验证数据是否正确
        orig_stream.on('end', ()=>{
            clearTimeout(timeoutid);
            // 检查sha512是否一致
            if(sha512.digest('base64') !== sha512_base64.toString()) {
                content_stream.emit('error', new Error('sha512 校验错误，数据传输过程出错'));
            }
            else {
                content_stream.push(null);
            }
        });

        // 错误信息转发
        orig_stream.on('error', e=>{
            clearTimeout(timeoutid);
            content_stream.emit('error', e);
        });

        // 处理数据
        orig_stream.on('data', data=>{
            if(undefined === type) {
                // 第一次调用
                type = data[0];
                stream_wrapper(type, content_stream).then(resolve, reject);
                sha512.update(data.slice(0, 1));
                data = data.slice(1);
            }
            // 滑动窗口保存最后的88字节数据
            data = Buffer.concat([sha512_base64, data]);
            const split_pos = data.length - sha512_length;
            sha512_base64 = data.slice(split_pos >= 0 ? split_pos : 0);
            data = data.slice(0, split_pos >= 0 ? split_pos : 0);
            // 计算hash
            sha512.update(data);
            content_stream.push(data);
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

    // 调用处理函数获取处理结果
    let result = obj.handler_map[r.name](...r.args, d);
    if(result instanceof Promise) {
        result = await result;
    }
    if(undefined === result) {
        //undefined 无法反序列化，自动设置为null
        result = null;
    }

    // 返回的如果是对象，则自动转换成stream
    const type_buffer = Buffer.alloc(1);
    type_buffer[0] = enums.STREAM;
    if(typeof result !== 'object' || typeof result.pipe !== 'function') {
        result = stream.Readable.from(Buffer.from(JSON.stringify(result)));
        type_buffer[0] = enums.OBJECT;
    }

    // 数据加密以及计算sha512
    const sha512 = crypto.createHash('sha512');
    const aes = (new aes256(r.aes256)).encrypt_cipher();

    aes.write(type_buffer);
    sha512.update(type_buffer);
    result.on('data', data=>{
        sha512.update(data);
        aes.write(data);
    });
    result.on('end', ()=>{
        aes.write(sha512.digest('base64'));
        aes.end();
    });

    return aes;
}

/**
 * 注册处理函数
 * @param {string} name
 * @param {function} handler
 */
function regist (name, handler) {
    // todo 增加一个参数，不指定则默认只允许同一账户下同步，指定后才接收所有设备数据
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