const express = require('express');
const message = require('../message');

function router () {
    const r = express.Router();

    r.put('', async (req, res)=>{
        try {
            await message.send({
                to     : req.body.to,
                type   : req.body.type,
                message: req.body.message
            });
        }
        catch(e) {
            return res.build({code: 400, message: e.message});
        }
        return res.build();
    });

    return r;
}

module.exports = router;
