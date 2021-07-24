const express = require('express');
const message = require('../message');

async function router () {
    const r = express.Router();

    r.put('', async (req, res)=>{
        try {
            await message.recv(req.body);
            return res.build();
        }
        catch (e) {
            return res.build({code: e.status || 400, message: e.message});
        }
    });

    return r;
}

module.exports = router;
