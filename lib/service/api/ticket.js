const express = require('express');
const openpgp = require('openpgp');
const runtime = require('../runtime');
const ticket = require('../ticket');

async function router () {
    const r = express.Router();

    /** 获取本机ticket */
    r.get('', async (req, res)=>{
        return res.build({ticket: await ticket.ticket.toString()});
    });

    /** 保存ticket服务 */
    r.put('', async (req, res)=>{
        try {
            await ticket.store(req.body);
            return res.build();
        }catch(e) {
            return res.build({code: 400, message: e.message});
        }
    });

    /** 查询ticket服务 */
    r.get('/:fingerprint', async (req, res)=>{
        const t = await ticket.get(req.params.fingerprint);
        if(t) {
            return res.build({ticket: t});
        }
        else {
            return res.build({code: 404, message: '找不到资源'});
        }
    });

    r.get('/:fingerprint/neighbor', async (req, res)=>{
        return res.build({
            list: await ticket.neighbor(req.params.fingerprint)
        });
    });

    return r;
}

module.exports = router;