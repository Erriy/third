const express = require('express');
const {account} = require('../routine');

function router () {
    const r = express.Router();

    // 通过短id查询账户指纹
    r.get('/fingerprint', async (req, res)=>{
        const fprs = await account.lookup(req.query.keyid);
        if(fprs) {
            return res.build({list: fprs});
        }
        return res.build({code: 404, message: '找不到key，请确认keyid存在'});
    });
    // 账户登录
    r.post('/login', async (req, res)=>{
        try {
            await account.login(req.query.fingerprint);
            return res.build();
        }
        catch (e) {
            return res.build({code: 400, message: e.message});
        }
    });

    r.get('/request', async (req, res)=>{
        return res.build({
            list: await account.request()
        });
    });

    r.get('/device', (req, res)=>{
        return res.build({
            list: account.device.list()
        });
    });

    r.put('/device/:fingerprint', async (req, res)=>{
        await account.device.add(req.params.fingerprint);
        return res.build();
    });

    r.delete('/device/:fingerprint', async (req, res)=>{
        await account.device.remove(req.params.fingerprint);
        return res.build();
    });

    return r;
}

module.exports = router;