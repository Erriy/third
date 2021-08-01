const express = require('express');
const {client} = require('../relay');
const {runtime} = require('../routine');

const obj = {
    /**
     * @type {Object.<number, {client:client, status: {reconnect: boolean}}>}
     */
    record: {}
};

function router () {
    const r = express.Router();

    // 增加中继端口
    r.put('', async (req, res)=>{
        const port = req.body.port;
        const relay = req.body.relay || runtime.relay;
        if(obj.record[port]) {
            return res.build({code: 409, message: '拒绝重复映射'});
        }
        const c = new client(port, relay);
        obj.record[port] = {client: c, status: {reconnect: false}};
        c.on('reconnect', ()=>{
            obj.record[port].status.reconnect = true;
        });
        c.on('connected', ()=>{
            obj.record[port].status.reconnect = false;
        });

        return res.build();
    });

    // 删除中继端口
    r.delete('', async (req, res)=>{

    });

    // 获取中继端口状态
    r.get('', async (req, res)=>{
        return res.build({
            list: Object.values(obj.record).map(r=>({
                port  : r.client.port,
                relay : r.client.relay,
                status: r.status.reconnect ? 'reconnect' : 'running',
            }))
        });
    });

    return r;
}

module.exports = router;