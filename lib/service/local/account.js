const express = require('express');
const account = require('../account');

function router () {
    const r = express.Router();

    r.put('/ticket', async (req, res)=>{
        try {
            await account.set_ticket(req.body);
            return res.build();
        }
        catch (e) {
            return res.build({code: 400, message: e.message});
        }
    });

    return r;
}

module.exports = router;
