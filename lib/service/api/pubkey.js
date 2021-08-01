const express = require('express');
const {pubkey} = require('../routine');

function router () {
    const r = express.Router();

    r.get('', async (req, res)=>{
        return res.build({pubkey: await pubkey.get()});
    });

    return r;
}

module.exports = router;