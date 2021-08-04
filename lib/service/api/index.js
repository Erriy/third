const express = require('express');
const ticket = require('./ticket');
const account = require('./account');
const message = require('./message');

async function router (server) {
    const r = express.Router();
    r.use(express.json());
    r.use('/ticket', ticket());
    r.use('/account', account());
    r.use('/message', message());
    return r;
}

module.exports = router;