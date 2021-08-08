const uuid = require('uuid');
const axios = require('axios').default;
const events = require('events');
const socketio_client = require('socket.io-client');
const openpgp = require('openpgp');
const urljoin = require('url-join');
const net = require('net');
const {runtime, aes256} = require('../routine');

class client {
    #port = null;
    #insid = null;
    #events = null;
    #io = null;
    #relay = null;

    constructor (port, relay) {
        this.#port = port;
        // todo 用uuid v1产生的instance id 会暴露启动时间，是否有必要换成其他形式的id？例如基于时间的hash、路径的hash等
        this.#insid = port; // uuid.v1().split('-').slice(0, -1).join('');
        this.#events = new events.EventEmitter();
        this.#connect(relay);
    }

    #connect (relay) {
        // 初始化socketio客户端
        const io = socketio_client.connect(relay, {
            reconnection        : true,
            reconnectionDelay   : 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 99999
        });
        // 设置加密组件
        io.aes256 = new aes256();
        io.smap = {};

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
            this.#io.close();
            if(-1 !== this.#events.eventNames().indexOf('reconnect')) {
                this.#events.emit('reconnect');
            }
            this.#connect(relay);
        });

        // 连接到relay服务器成功，进行登录操作
        io.on('connect', async ()=>{
            const login_data = await this.#generate_login_data(relay, io.aes256);
            const ans = await this.#login(login_data);
            const path = JSON.parse(io.aes256.decrypt(ans)).path;
            this.#relay = urljoin(relay, path, '/');
            if(-1 !== this.#events.eventNames().indexOf('connected')) {
                this.#events.emit('connected');
            }
        });
        // 处理中继转发来的请求
        io.on('request', async o=>{
            const new_socket = (id)=>{
                return new Promise((resolve, reject) => {
                    const s = net.Socket();
                    s.connect(this.port, '127.0.0.1', ()=>{
                        io.smap[id] = s;
                        // 将接收到的数据转发给服务端
                        s.on('data', (data) => {
                            io.emit('response', {
                                id  : io.aes256.encrypt(id),
                                data: io.aes256.encrypt(data)
                            });
                        });
                        // 关闭信息转发给服务端
                        s.on('close', ()=>{
                            io.emit('close', io.aes256.encrypt(id));
                            s.destroy();
                            delete io.smap[id];
                        });
                        return resolve(s);
                    });
                    s.on('error', ()=>{
                        const content = '上游客户端连接错误';
                        io.emit('response', {
                            id  : io.aes256.encrypt(id),
                            data: io.aes256.encrypt(
                                'HTTP/1.1 500 Internal Server Error\r\n'
                                + `Content-Length: ${Buffer.from(content).length}\r\n`
                                + 'Content-Type: text/html; charset=utf-8\r\n'
                                + '\r\n'
                                + content
                            )
                        });
                        io.emit('close', io.aes256.encrypt(id));
                        s.destroy();
                        return resolve();
                    });
                });
            };
            const id = io.aes256.decrypt(o.id);
            const s = io.smap[id] || await new_socket(id);
            if(!s){
                return;
            }
            // 将解密的数据转发给真正的服务
            s.write(io.aes256.decrypt(o.data));
        });
        this.#io = io;
    }

    async #generate_login_data (relay, aes) {
        const pubkey = await (await axios.get(urljoin(relay, 'api/ticket'))).data.pubkey;
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
                this.#io.emit('login', data, ans=>{
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
        this.#io.removeAllListeners();
        this.#io.disconnect();
        this.#io.close();
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

module.exports = client;