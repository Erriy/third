const express = require('express');
const rpc = require('../rpc');

function router () {
    const r = express.Router();
    r.use(express.text({type: 'text/plain'}));

    r.post('', async (req, res)=>{
        try {
            const r = await rpc.handle(req.body);
            return res.status(200).send(r).end();
        }
        catch (e) {
            return res.build({code: 400, message: e.message});
        }
    });

    return r;
}

module.exports = router;