const express = require('express');
const pubkey = require('../pubkey');

async function router () {
    const r = express.Router();

    r.get('', async (req, res)=>{
        return res.build({pubkey: await pubkey.get()});
    });

    r.put('', async (req, res)=>{
        try {
            const fpr = await pubkey.store(req.body);
            return res.build({fingerprint: fpr});
        }
        catch (err) {
            return res.build({code: 400, message: '指纹格式不正确'});
        }
    });

    r.get('/:fingerprint', async (req, res)=>{
        const pk = await pubkey.get(req.params.fingerprint);
        if(pk) {
            return res.build({pubkey: pk});
        }
        return res.build({code: 404, message: '找不到公钥'});
    });

    return r;
}

module.exports = router;
