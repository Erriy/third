const express = require('express');
const kns = require('../kns');

function router () {
    const r = express.Router();
    r.use(express.json());

    // 获取本机record
    r.get('/record', async (req, res)=>{
        // todo 返回account record
        return res.build({device: await kns.record.valueOf()});
    });

    // 保存record
    r.put('/record', async (req, res)=>{
        await kns.store(req.body);
        return res.build();
    });

    // 获取指纹的record
    r.get('/record/:fingerprint', async (req, res)=>{
        const r = await kns.get(req.params.fingerprint, {discover: false, refresh: false});
        if(!r) {
            return res.build({code: 404, message: '找不到记录'});
        }
        return res.build({record: await kns.merge(r)});
    });

    // 获取指纹的邻居provider
    r.get('/record/:fingerprint/neighbor', async (req, res)=>{
        return res.build({list: await kns.neighbor(req.params.fingerprint)});
    });

    return r;
}

module.exports = router;