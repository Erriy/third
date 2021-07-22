const express = require('express');
const pubkey = require('./pubkey');
const ticket = require('./ticket');

async function router (server) {
    const r = express.Router();

    r.use(express.text(), express.json(), express.urlencoded());
    r.use('/pubkey', await pubkey());
    r.use('/ticket', await ticket());

    return r;
}

module.exports = router;