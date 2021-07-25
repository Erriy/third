const express = require('express');
const ticket = require('../ticket');

async function router () {
    const r = express.Router();

    r.get('/:fingerprint', async (req, res)=>{
        let t = await ticket.get(req.params.fingerprint, {discover: true});
        if(!t) {
            return res.build({code: 404, message: '找不到资源'});
        }

        t = await ticket.analysis(t);
        return res.build({object: t.object});
    });

    return r;
}

module.exports = router;
