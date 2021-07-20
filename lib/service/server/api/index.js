const express = require('express');
const pubkey = require('./pubkey');

async function router (server) {
    const r = express.Router();

    r.use(express.text(), express.json(), express.urlencoded());
    r.use('/pubkey', await pubkey());

    return r;
}

module.exports = router;