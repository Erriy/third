const uuid = require('uuid');
const axios = require('axios').default;
const socketio_client = require('socket.io-client');
const openpgp = require('openpgp');
const urljoin = require('url-join');
const net = require('net');
const aes256 = require('../aes256');
const runtime = require('../runtime');

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
        io.on('connect_error', (e)=>{
            runtime.logger.error(`[relay.connect.error] ${e.message}`);
            runtime.emit('relay.connect.error', e);
        });
        io.on('connect_failed', (e)=>{
            runtime.logger.error(`[relay.connect.failed] ${e.message}`);
            runtime.emit('relay.connect.failed', e);
        });
        io.on('disconnect', ()=>{
            runtime.logger.error('[relay.disconnect] 断开连接，尝试重连');
            this.#io.close();
            runtime.emit('relay.disconnect');
            this.#connect(relay);
        });

        // 连接到relay服务器成功，进行登录操作
        io.on('connect', async ()=>{
            runtime.logger.info('[relay.connect] socket.io 连接成功');
            const login_data = await this.#generate_login_data(relay, io.aes256);
            runtime.logger.info('[relay.connect] 创建login信息成功');
            const ans = await this.#login(login_data);
            if(ans.error) {
                runtime.logger.error(`[relay.connect.login] login返回错误，${ans.error}`);
                runtime.emit('relay.login.error', ans.error);
                return;
            }

            const path = JSON.parse(io.aes256.decrypt(ans)).path;
            this.#relay = urljoin(relay, path, '/');
            runtime.logger.info(`[relay.connected] 连接成功，中继地址:${this.relay}`);
            runtime.emit('relay.connected', this);
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
        const pubkey = await (await axios.get(urljoin(relay, 'kns/record'))).data.device.pubkey;
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

    get relay () {
        return this.#relay;
    }

    get port () {
        return this.#port;
    }
}

module.exports = client;