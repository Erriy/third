/**
 * todo 增加黑白名单机制，限制用户连接，防止私有服务被乱用
 */
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const openpgp = require('openpgp');
const uuid = require('uuid');
const runtime = require('../runtime');
const aes256 = require('../aes256');

const obj = {
    /**
     * @type {Object.<string, socketio.Socket>}
     */
    iomap: {},
};

/**
 * 解密并验证来源
 * @param {string} encrypted_message
 * @param {string} pubkey_armored_for_verify
 * @throw
 * @returns {aes256: aes256, relayid: string}
 */
async function login_data_analysis (encrypted_message, pubkey_armored_for_verify) {
    const pubkey = await openpgp.readKey({ armoredKey: pubkey_armored_for_verify});

    // 解密数据
    const { data, signatures } = await openpgp.decrypt({
        message         : await openpgp.readMessage({ armoredMessage: encrypted_message }),
        verificationKeys: pubkey,
        date            : new Date(Date.now() + 1000), // 增加一秒误差允许
        decryptionKeys  : runtime.key,
    });
    // 验证签名是否有效
    const s = signatures[0];
    if (await s.verified) {
        const created = new Date(s.signature.packets[0].created).getTime() / 1000;
        if(new Date().getTime() / 1000 - created > 15) {
            throw new Error('为防止重放攻击，只接受15秒内的签名认证数据');
        }
    }
    else {
        throw new Error('签名验证失败，拒绝执行');
    }
    // 检查数据是否有效
    try {
        const obj = JSON.parse(data);
        const aes = new aes256(obj.aes256);
        const relayid = `${pubkey.getFingerprint().toUpperCase()}:${obj.instance.id}`;
        return {aes256: aes, relayid};
    }
    catch(e) {
        throw new Error('携带数据格式不正确，拒绝执行');
    }
}

/**
 * 初始化客户端的socketio服务
 * @param {http.Server} server
 */
function init_socketio (server) {
    const io = new socketio.Server(server);
    io.on('connection', client=>{
        // 设置超时自动断开
        const auto_disconnect = setTimeout(()=>{
            client.disconnect();
        }, 1000);
        // 客户端登录操作
        client.on('login', async (o, answer)=>{
            // 清除自动断开操作
            clearTimeout(auto_disconnect);
            // 验证身份
            let r = null;
            try {
                r = await login_data_analysis(o.encrypt, o.pubkey);
            } catch(e) {
                answer({error: e.message});
                client.disconnect();
                return;
            }
            // 保存对象状态
            client.relayid = r.relayid;
            client.aes256 = r.aes256;
            obj.iomap[r.relayid] = client;
            client.smap = {};
            // 返回响应数据
            answer(r.aes256.encrypt(JSON.stringify({
                path: `/relay/${r.relayid}`
            })));

            runtime.logger.info(`[relay.client.new] + ${r.relayid}`);
        });
        // 客户端对请求的响应数据处理
        client.on('response', o=>{
            // fixme 数据格式有问题则强制断开连接
            // 拒绝keep-alive，会导致错误
            const id = client.aes256.decrypt(o.id);
            let data = client.aes256.decrypt(o.data);
            const s = client.smap[id];
            if(!s.response_header_handled) {
                // 处理响应头
                // fixme 分析http header，防止替换掉内容中的字段
                let i = data.indexOf('\r\n\r\n');
                if(-1 === i) i = data.length;
                let header = data.slice(0, i).toString('utf8');
                const body = data.slice(i, data.length);
                header = header.replace(/\r\nconnection: *keep-alive *\r\n/i, '\r\nConnection: close\r\n');
                header = header.replace(/\r\nkeep-alive:.*\r\n/i, '\r\nConnection: close\r\n');
                data = Buffer.concat([Buffer.from(header, 'ascii'), body]);
                s.response_header_handled = true;
            }
            s.write(data);
        });
        // 客户端对请求的关闭连接处理
        client.on('close', id=>{
            id = client.aes256.decrypt(id);
            if(client.smap[id]) {
                client.smap[id].end();
                client.smap[id].destroy();
                delete client.smap[id];
            }
        });
        // 客户端掉线
        client.on('disconnect', () => {
            if(!client.relayid) {
                return;
            }
            // 断开所有相关链接
            Object.values(client.smap || {}).forEach(s=>{
                s.end();
                s.destroy();
            });
            // 删除保存的client对象
            delete obj.iomap[client.relayid];
            runtime.logger.info(`[relay.client.close] - ${client.relayid}`);
        });
    });
}

/**
 * 初始化relay代理网关
 * @param {http.Server} server
 */
function init_relay (server) {
    // 接收并转发请求
    server.on('connection', socket => {
        // 处理接收到的新数据
        socket.on('data', data=>{
            if(socket.do_not_follow) {
                return;
            }
            // 第一次接收数据
            if(!socket.relay_client) {
                // 提取relayid
                data = data.toString('ascii');
                const r = /^(?<method>[A-Za-z]+) \/relay\/(?<id>[^/ ?]*)(?<path>[^ ]*) (?<http_version>HTTP\/[\d.]+)\r\n/.exec(data.toString());
                if(!r) {
                    // 非relay接口数据，无需中继，返回
                    socket.do_not_follow = true;
                    return;
                }
                if(!(socket.relay_client = obj.iomap[r.groups.id])) {
                    // 无socketio客户端链接，直接返回 404
                    socket.do_not_follow = true;
                    socket.end(`${r.groups.http_version} 404 Not Found\r\nConnection: close\r\n\r\n`);
                    socket.destroy();
                    return;
                }

                const data_list = data.split('\r\n\r\n');
                // 禁止keep-alive
                data_list[0] = data_list[0].replace(/\r\nconnection: *keep-alive *\r\n/i, '\r\nConnection: close\r\n');
                // 删除旧的X-Forwarded-For
                data_list[0] = data_list[0].replace(/\r\nX-Forwarded-For:.*\r\n/i, '\r\n');
                // 修正路径，并添加X-Forwarded-For header
                const method = r.groups.method;
                const path = r.groups.path.startsWith('/') ? r.groups.path : '/' + r.groups.path;
                data_list[0] = data_list[0].replace(r[0], `${method} ${path} ${r.groups.http_version}\r\nX-Forwarded-For: ${socket.remoteAddress}\r\n`);
                data = Buffer.from(data_list.join('\r\n\r\n'), 'ascii');
                // 指定socketid
                socket.uuid = uuid.v1().split('-').slice(0, -1).join('');
                socket.relay_client.smap[socket.uuid] = socket;
            }
            // 将请求数据转发到客户端
            socket.relay_client.emit('request', {
                id  : socket.relay_client.aes256.encrypt(socket.uuid),
                data: socket.relay_client.aes256.encrypt(data)
            });
        });

        // 连接关闭处理
        socket.on('close', ()=>{
            // 不跟踪和没有client连接的直接返回
            if(socket.do_not_follow || !socket.relay_client) {
                return;
            }
            // 通知客户端socket连接断开
            socket.relay_client.emit('close', socket.relay_client.aes256.encrypt(socket.uuid));
            // 删除map数据
            socket.relay_client.smap[socket.uuid];
            socket.destroy();
        });
    });
}

/**
 * 初始化express router
 */
function init_router () {
    const r = express.Router();
    // 设置express不处理relay下的所有连接，不确定是否会导致内存泄漏。
    // 如果不处理则express会直接返回404，先这么用用看
    // todo 可以学习socketio的处理方法，hook掉request listener，需要转发的请求直接不转发给express和socketio
    // https://github.com/socketio/engine.io/blob/43606865e5299747cbb31f3ed9baf4567502a879/lib/server.js#L497-L508

    r.all(/.*/, ()=>{});

    return r;
}

/**
 * @param {http.Server} server
 * @returns {express.Router}
 */
async function router (server) {
    init_socketio(server);
    init_relay(server);
    return init_router();
}

module.exports = router;