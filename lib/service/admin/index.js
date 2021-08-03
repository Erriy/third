const express = require('express');
const ip = require('ip');
const relay = require('./relay');
const account = require('./account');

async function router (server) {
    const r = express.Router();
    r.use((req, res, next) => {
        // fixme 对请求的证书签名进行验证
        if(ip.isLoopback(req.socket.remoteAddress)) {
            return next();
        }
        return res.build({code: 403, message: '控制端口仅允许本地访问'});
    });
    r.use(express.json());
    r.use('/relay', relay());
    r.use('/account', account());
    return r;
}

module.exports = router;