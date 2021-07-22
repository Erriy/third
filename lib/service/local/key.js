const express = require('express');
const runtime = require('../runtime');

function router () {
    const r = express.Router();

    r.get('/fingerprint', function (req, res) {
        return res.build({fingerprint: runtime.key.getFingerprint().toUpperCase()});
    });

    return r;
}

module.exports = router;
