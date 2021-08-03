const express = require('express');
const {account} = require('../routine');

function router () {
    const r = express.Router();

    r.get('/ticket', async (req, res)=>{
        const t = await account.ticket();
        if(t) {
            return res.build({ticket: t});
        }
        else {
            return res.build({code: 404, message: '未登录账号'});
        }
    });

    r.get('/fingerprint', (req, res)=>{
        const fpr = account.fingerprint;
        if(fpr) {
            return res.build({fingerprint: fpr});
        }
        else {
            return res.build({code: 404, message: '未登录账号'});
        }
    });

    r.get('/ticket/object', (req, res)=>{
        const o = account.object;
        if(o) {
            return res.build({object: o});
        }
        else {
            return res.build({code: 404, message: '未登录账号'});
        }
    });

    r.put('/ticket', async (req, res)=>{
        try {
            await account.ticket(req.body);
            return res.build();
        }
        catch (e) {
            return res.build({code: 400, message: e.message});
        }
    });

    return r;
}

module.exports = router;