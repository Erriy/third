const express = require('express');
const pubkey = require('./pubkey');
const ticket = require('./ticket');
const message = require('./message');

async function router (server) {
    const r = express.Router();

    r.use(express.text(), express.json());
    r.use('/pubkey', await pubkey());
    r.use('/ticket', await ticket());
    r.use('/message', await message());

    return r;
}

module.exports = router;