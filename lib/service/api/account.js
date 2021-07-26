const express = require('express');
const account = require('../account');

async function router () {
    const r = express.Router();

    r.get('/ticket', async (req, res)=>{
        const t = account.get();
        if(t) {
            return res.build({ticket: t});
        }
        else {
            return res.build({code: 404, message: '未登录账号'});
        }
    });

    r.put('/ticket', async (req, res)=>{
        try {
            await account.set(req.body, false);
            return res.build();
        }
        catch (e) {
            return res.build({code: 400, message: e.message});
        }
    });

    r.put('/request', async (req, res)=>{
        await account.new_login_request(req.body);
        return res.build();
    });

    return r;
}

module.exports = router;