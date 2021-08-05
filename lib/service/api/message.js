const express = require('express');
const {message} = require('../routine');

function router () {
    const r = express.Router();

    r.use(express.text({type: 'text/plain'}));

    r.put('', async (req, res)=>{
        try {
            await message.recv(req.body);
        }catch (err) {
            return res.build({code: 400, message: err.message});
        }
        return res.build();
    });

    return r;
}

module.exports = router;
