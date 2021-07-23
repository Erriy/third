const express = require('express');
const {client} = require('../relay');

const obj = {
    /**
     * @type {Array.<client>}
     */
    list: []
};

function router () {
    const r = express.Router();
    r.get('', (req, res) => {
        return res.build({list: obj.list.map(c=>({port: c.port, relay: c.relay}))});
    });

    r.put('', (req, res) => {
        const j = req.body;
        const rc = new client(j.port, j.relay);

        obj.list.push(rc);
        rc.on('connected', ()=>{
            // console.log(rc.relay);
        });
        rc.on('reconnect', ()=>{
            // console.log('连接断开，正在重新连接');
        });
        rc.on('error', ()=>{
            // console.log('连接错误');
        });
        return res.build();
    });

    r.delete('', (req, res) => {
        for(let i in obj.list) {
            const c = obj.list[i];
            if(req.query.port === c.port || req.query.relay === c.relay) {
                c.close();
            }
            delete obj.list[i];
        }
        obj.list = obj.list.filter(c=>c !== undefined);

        return res.build();
    });
    return r;
}

module.exports = router;
