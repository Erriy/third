const express = require('express');
const runtime = require('../../runtime');

async function router () {
    const r = express.Router();

    r.get('', function (req, res) {
        return res.build({pubkey: runtime.key.toPublic().armor()});
    });

    return r;
}

module.exports = router;
