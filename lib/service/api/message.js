const express = require('express');
const message = require('../message');

async function router () {
    const r = express.Router();

    r.put('', async (req, res)=>{
        console.log(req.headers);
        try {
            await message.recv(req.body);
            return res.build();
        }
        catch (e) {
            return res.build({code: 400, message: e.message});
        }
    });

    return r;
}

module.exports = router;
