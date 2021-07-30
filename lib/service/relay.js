const http = require('http');
const sio = require('socket.io');
const openpgp = require('openpgp');
const runtime = require('./runtime');
const aes256 = require('./aes256');
const socketio_client = require('socket.io-client');
const axios = require('axios').default;
const uuid = require('uuid');
const events = require('events');
const urljoin = require('url-join');
const net = require('net');

const obj = {
    iomap: {},
    smap : {}
};

setInterval(()=>{
    for(let id of Object.keys(obj.smap)) {
        const s = obj.smap[id].socket;
        console.log('[!]', s.remoteAddress + ' ' + s.remotePort, s.localPort);
    }
}, 1000 * 5);

async function decrypt_and_verify (encrypted_message, pubkey_armored_for_verify) {
    const pubkey = await openpgp.readKey({ armoredKey: pubkey_armored_for_verify});

    const { data, signatures } = await openpgp.decrypt({
        message         : await openpgp.readMessage({ armoredMessage: encrypted_message }),
        verificationKeys: pubkey,
        date            : new Date(Date.now() + 1000),
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
    // socketio server
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
            obj.iomap[relayid] = {
                aes256: aes,
                client,
            };
            answer(aes.encrypt(JSON.stringify({path: relay_path})));
            console.log(`[+] ${relayid}`);
        });
        client.on('response', (o)=>{
            // 拒绝keep-alive，会导致错误
            const s = obj.smap[o.id];
            let data = obj.smap[o.id].aes256.decrypt(o.data);
            if(!s.response_header_handled) {
                // 处理响应头
                // fixme 分析http header，防止替换掉内容中的字段
                data = data.toString();
                const data_list = data.split('\r\n\r\n');
                data_list[0] = data_list[0].replace(/\r\nconnection: *keep-alive *\r\n/i, '\r\nConnection: close\r\n');
                data_list[0] = data_list[0].replace(/\r\nkeep-alive:.*\r\n/i, '\r\nConnection: close\r\n');
                data = Buffer.from(data_list.join('\r\n\r\n'), 'utf-8');
                s.response_header_handled = true;
            }
            obj.smap[o.id].socket.write(data);
        });

        client.on('close', id=>{
            if(obj.smap[id]) {
                obj.smap[id].socket.destroy();
                delete obj.smap[id];
            }
        });

        client.on('disconnect', () => {
            delete obj.iomap[client.relayid];
            console.log(`[-] ${client.relayid}`);
        });
    });

    // 接收并转发请求
    server.on('connection', socket => {
        let io = null;
        let follow = true;
        socket.on('data', data=>{
            if(!follow) {
                return;
            }
            // 刚开始接受数据
            if(null == io) {
                // 提取relayid
                data = data.toString('utf-8');
                const r = /^(?<method>[A-Za-z]+) \/relay\/(?<id>[^/ ?]*)(?<path>[^ ]*)/.exec(data.toString());
                if(!r || !(io = obj.iomap[r.groups.id])) {
                    // 找不到relayid 或 无socketio客户端链接，都直接返回
                    follow = false;
                    return;
                }
                // 修正路径
                const method = r.groups.method;
                const path = r.groups.path.startsWith('/') ? r.groups.path : '/' + r.groups.path;
                data = data.replace(r[0], `${method} ${path}`);
                // 删除keep-alive
                const data_list = data.split('\r\n\r\n');
                data_list[0] = data_list[0].replace(/\r\nconnection: *keep-alive *\r\n/i, '\r\nConnection: close\r\n');
                data = Buffer.from(data_list.join('\r\n\r\n'), 'utf-8');
                // 指定socketid
                socket.uuid = uuid.v1().split('-').slice(0, -1).join('');
                obj.smap[socket.uuid] = {socket, aes256: io.aes256};
            }
            // 向客户端发送请求数据
            io.client.emit('request', {id: socket.uuid, data: io.aes256.encrypt(data)});
        });

        socket.on('close', ()=>{
            if(!follow || !io) {
                return;
            }
            io.client.emit('close', socket.uuid);
            if(obj.smap[socket.uuid]) {
                obj.smap[socket.uuid].socket.destroy();
                delete obj.smap[socket.uuid];
            }
        });
    });
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

        io.on('close', (id)=>{
            if(obj.smap[id]) {
                obj.smap[id].socket.destroy();
                delete obj.smap[id];
            }
        });

        // 转发请求
        io.on('request', async o=>{
            const new_client = (id)=>{
                return new Promise((resolve, reject) => {
                    const s = net.Socket();
                    s.connect(this.port, '127.0.0.1', ()=>{
                        obj.smap[o.id] = {socket: s, aes256: aes};
                        s.on('data', (data) => {
                            io.emit('response', {id, data: aes.encrypt(data)});
                        });
                        s.on('close', ()=>{
                            io.emit('close', id);
                            s.destroy();
                            delete obj.smap[id];
                        });
                        return resolve(obj.smap[o.id]);
                    });
                });
            };

            const s = obj.smap[o.id] || await new_client(o.id);
            s.socket.write(s.aes256.decrypt(o.data));
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