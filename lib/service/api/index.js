const express = require('express');
const ticket = require('./ticket');
const account = require('./account');

async function router (server) {
    const r = express.Router();
    r.use('/ticket', ticket());
    r.use('/account', account());
    return r;
}

module.exports = router;