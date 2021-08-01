const express = require('express');
const pubkey = require('./pubkey');

async function router (server) {
    const r = express.Router();
    r.use('/pubkey', pubkey());
    return r;
}

module.exports = router;