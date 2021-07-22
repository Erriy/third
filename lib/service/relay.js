const http = require('http');
const express = require('express');
const sio = require('socket.io');
const openpgp = require('openpgp');
const runtime = require('./runtime');
const aes256 = require('./aes256');

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
    if (s.valid) {
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
async function relay (server) {
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

module.exports = relay;