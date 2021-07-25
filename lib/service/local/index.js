const express = require('express');
const key = require('./key');
const relay = require('./relay');
const ticket = require('./ticket');
const message = require('./message');
const account = require('./account');
const ip = require('ip');

async function router (server) {
    const r = express.Router();
    r.use((req, res, next) => {
        if(ip.isLoopback(req.socket.remoteAddress)) {
            return next();
        }
        return res.build({code: 403, message: '控制端口仅允许本地访问'});
    });
    r.use(express.json());
    r.use('/key', key());
    r.use('/relay', relay());
    r.use('/ticket', await ticket());
    r.use('/message', message());
    r.use('/account', account());
    return r;
}

module.exports = router;