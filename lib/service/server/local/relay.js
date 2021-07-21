const express = require('express');
const aes256 = require('../../aes256');
const runtime = require('../../runtime');
const socketio_client = require('socket.io-client');
const axios = require('axios').default;
const uuid = require('uuid');
const events = require('events');
const urljoin = require('url-join');
const openpgp = require('openpgp');

const obj = {
    /**
     * @type {Array.<client>}
     */
    list: []
};

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
        const aes = new aes256();
        const io = socketio_client.connect(relay, {
            reconnection        : true,
            reconnectionDelay   : 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 99999
        });

        // 断开处理
        io.on('connect_error', ()=>{
            this.#events.emit('error');
        });
        io.on('connect_failed', ()=>{
            this.#events.emit('error');
        });
        io.on('disconnect', ()=>{
            this.#sio.close();
            this.#events.emit('reconnect');
            this.connect(relay);
        });
        // 连接
        io.on('connect', async ()=>{
            const login_data = await this.#generate_login_data(relay, aes);
            const ans = await this.#login(login_data);
            const path = JSON.parse(aes.decrypt(ans)).path;
            this.#relay = urljoin(relay, path);
            this.#events.emit('connected');
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

function router () {
    const r = express.Router();
    r.get('', (req, res) => {
        return res.build({list: obj.list.map(c=>({port: c.port, relay: c.relay}))});
    });

    r.put('', (req, res) => {
        const j = req.body;
        const rc = new client(j.port, j.relay);

        obj.list.push(rc);
        rc.on('connected', ()=>{
            // console.log(rc.relay);
        });
        rc.on('reconnect', ()=>{
            // console.log('连接断开，正在重新连接');
        });
        rc.on('error', ()=>{
            // console.log('连接错误');
        });
        return res.build();
    });

    r.delete('', (req, res) => {
        for(let i in obj.list) {
            const c = obj.list[i];
            if(req.query.port === c.port || req.query.relay === c.relay) {
                c.close();
            }
            delete obj.list[i];
        }
        obj.list = obj.list.filter(c=>c !== undefined);

        return res.build();
    });
    return r;
}

module.exports = router;
