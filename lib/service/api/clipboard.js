const express = require('express');
const clipboard = require('../clipboard');

async function router () {
    const r = express.Router();

    r.put('', async (req, res)=>{
        await clipboard.set(req.body);
        return res.build();
    });

    return r;
}

module.exports = router;