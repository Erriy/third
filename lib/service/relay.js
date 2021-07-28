const http = require('http');
const express = require('express');
const sio = require('socket.io');
const openpgp = require('openpgp');
const runtime = require('./runtime');
const aes256 = require('./aes256');
const socketio_client = require('socket.io-client');
const axios = require('axios').default;
const uuid = require('uuid');
const events = require('events');
const urljoin = require('url-join');
const concat = require('concat-stream');
const obj = {
    client_map: {}
};

async function decrypt_and_verify (encrypted_message, pubkey_armored_for_verify) {
    const pubkey = await openpgp.readKey({ armoredKey: pubkey_armored_for_verify});

    const { data, signatures } = await openpgp.decrypt({
        message         : await openpgp.readMessage({ armoredMessage: encrypted_message }),
        verificationKeys: pubkey,
        decryptionKeys  : runtime.key,
    });
    const result = { text: data };
    const s = signatures[0];
    if (await s.verified) {
        result.fingerprint = pubkey.getFingerprint().toUpperCase();
        result.created = new Date(s.signature.packets[0].created).getTime() / 1000;
    } else {
        throw new Error('签名验证失败');
    }

    return result;
}

/**
 * @param {http.Server} server
 */
async function server (server) {
    const io = new sio.Server(server);
    io.on('connection', client => {
        const auto_disconnect = setTimeout(()=>{
            client.disconnect();
        }, 1000);
        client.on('login', async (data, answer)=>{
            // todo 增加白名单机制
            clearTimeout(auto_disconnect);

            const r = await decrypt_and_verify(data.encrypt, data.pubkey);
            if(new Date().getTime() / 1000 - r.created > 60) {
                answer({error: '签名数据已超时，拒绝认证'});
                client.disconnect();
                return;
            }
            const d = JSON.parse(r.text);
            const aes = new aes256(d.aes256);
            const relayid = `${r.fingerprint}.${d.instance.id}`;
            const relay_path = `/relay/${relayid}`;
            client.relayid = relayid;
            obj.client_map[relayid] = {
                aes256: aes,
                client,
            };
            answer(aes.encrypt(JSON.stringify({path: relay_path})));
            console.log(`[+] ${relayid}`);
        });
        client.on('disconnect', () => {
            delete obj.client_map[client.relayid];
            console.log(`[-] ${client.relayid}`);
        });
    });

    const r = express.Router();
    // 解析所有数据
    r.use(function (req, res, next){
        req.pipe(concat(function (data){
            req.body = data.toString();
            next();
        }));
    });
    // 转发所有接口
    r.all(/.*/, async (req, res)=>{
        const relayid = /\/(?<id>[^/]*)/.exec(req.path).groups.id;
        if(!(relayid in obj.client_map)) {
            return res.status(404).end();
        }
        const {client, aes256} = obj.client_map[relayid];
        const new_url = req.url.replace(/\/[^/?]*/, '');
        const request = JSON.stringify({
            method : req.method,
            url    : new_url,
            headers: req.headers,
            body   : req.body
        });
        // fixme 处理中途断开的情况
        client.emit(
            'request',
            aes256.encrypt(request),
            response=>{
                const r = JSON.parse(aes256.decrypt(response));
                if(typeof r.code !== 'number'
                    || typeof (r.headers || {}) !== 'object'
                    || (typeof (r.body || '') !== 'string'
                        && (typeof (r.body || {}) !== 'object'))
                ) {
                    return res.status(500).send('上游数据格式错误');
                }
                res.status(r.code).header(r.headers || {}).send(r.body || '').end();
            }
        );
    });
    return r;
}

class client {
    #port = null;
    #insid = null;
    #events = null;
    #sio = null;
    #relay = null;

    constructor (port, relay) {
        this.#port = port;
        // todo 用uuid v1产生的instance id 会暴露启动时间，是否有必要换成其他形式的id？例如基于时间的hash、路径的hash等
        this.#insid = uuid.v1().split('-').slice(0, -1).join('');
        this.#events = new events.EventEmitter();
        this.#connect(relay);
    }

    #connect (relay) {
        const aes = new aes256();

        const io = socketio_client.connect(relay, {
            reconnection        : true,
            reconnectionDelay   : 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 99999
        });

        // 断开处理
        io.on('connect_error', ()=>{
            if(-1 !== this.#events.eventNames().indexOf('error')) {
                this.#events.emit('error');
            }
        });
        io.on('connect_failed', ()=>{
            if(-1 !== this.#events.eventNames().indexOf('error')) {
                this.#events.emit('error');
            }
        });
        io.on('disconnect', ()=>{
            this.#sio.close();
            if(-1 !== this.#events.eventNames().indexOf('reconnect')) {
                this.#events.emit('reconnect');
            }
            this.#connect(relay);
        });
        // 连接
        io.on('connect', async ()=>{
            const login_data = await this.#generate_login_data(relay, aes);
            const ans = await this.#login(login_data);
            const path = JSON.parse(aes.decrypt(ans)).path;
            this.#relay = urljoin(relay, path);
            if(-1 !== this.#events.eventNames().indexOf('connected')) {
                this.#events.emit('connected');
            }
        });

        // 转发请求
        io.on('request', (req, answer)=>{
            req = JSON.parse(aes.decrypt(req));
            const send_response = (code, headers = {}, body = '')=>{
                answer(aes.encrypt(JSON.stringify({code,headers,body})));
            };
            axios({
                method : req.method,
                url    : urljoin(`http://127.0.0.1:${this.#port}`, req.url),
                headers: req.headers,
                data   : req.body
            }).then(res=>{
                send_response(res.status, res.headers, res.data);
            }).catch(error=>{
                const res = error.response;
                send_response(res.status, res.headers, res.data);
            });
        });
        this.#sio = io;
    }

    async #generate_login_data (relay, aes) {
        const pubkey = await (await axios.get(urljoin(relay, 'api/pubkey'))).data.pubkey;
        const encrypt = await openpgp.encrypt({
            message: await openpgp.createMessage({ text: JSON.stringify({
                aes256  : aes.valueOf(),
                instance: {id: this.#insid}
            })}),
            encryptionKeys: await openpgp.readKey({armoredKey: pubkey}),
            signingKeys   : runtime.key,
        });
        return {encrypt, pubkey: runtime.key.toPublic().armor()};
    }

    #login (data) {
        return new Promise((resolve, reject) => {
            try {
                this.#sio.emit('login', data, ans=>{
                    return resolve(ans);
                });
            } catch (e) {
                reject(e);
            }
            // 5秒超时
            setTimeout(reject, 5000);
        });
    }

    close () {
        this.#sio.removeAllListeners();
        this.#sio.disconnect();
        this.#sio.close();
        this.#relay = null;
        this.#events.emit('close');
    }

    /**
     * 监听事件
     * @param {string} event - 事件名
     *
     * connected - 连接成功
     *
     * error - 连接错误
     *
     * reconnect - 连接断开，正在重新连接
     *
     * close - 关闭连接
     *
     * @param {function} callback - 回调函数
     */
    on (event, callback) {
        this.#events.on(event, callback);
    }

    removeListener (event, callback) {
        this.#events.removeListener(event, callback);
    }

    get relay () {
        return this.#relay;
    }

    get port () {
        return this.#port;
    }
}

module.exports = {
    server,
    client,
};