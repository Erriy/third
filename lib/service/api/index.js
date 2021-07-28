const express = require('express');
const pubkey = require('./pubkey');
const ticket = require('./ticket');
const message = require('./message');
const account = require('./account');
const clipboard = require('./clipboard');

async function router (server) {
    const r = express.Router();

    r.use(express.text(), express.json());
    r.use('/pubkey', await pubkey());
    r.use('/ticket', await ticket());
    r.use('/message', await message());
    r.use('/account', await account());
    r.use('/clipboard', await clipboard());

    return r;
}

module.exports = router;