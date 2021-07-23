const express = require('express');
const urljoin = require('url-join');
const axios = require('axios').default;
const runtime = require('../runtime');
const ticket = require('../ticket');

async function router () {
    const r = express.Router();

    r.get('/:fingerprint', async (req, res)=>{
        let t = null;
        await ticket.dynamic_lookup_neighbor(
            req.params.fingerprint,
            async (s)=>{
                try {
                    // 向服务端查询是否有ticket
                    const r = await axios.get(urljoin(s, 'api/ticket', req.params.fingerprint));
                    await ticket.store(r.data.ticket);
                }
                catch(e) {}
            },
            async ()=>{
                t = await ticket.get(req.params.fingerprint);
                return t;
            }
        );
        if(!t) {
            return res.build({code: 404, message: '找不到资源'});
        }

        t = await ticket.analysis(t);
        return res.build({service: t.object.service});

    });

    r.get('/xxxx/:fingerprint', async (req, res)=>{
        let t = null;
        // 向服务端查询
        let services = ticket.bootstrap;
        const history_set = new Set(); // 记录已经请求过的服务
        while (!t && services.length > 0) {
            // 本地缓存中找到直接返回
            t = await ticket.get(req.params.fingerprint);
            if(t) {
                return res.build({ticket: t});
            }
            // 向其他服务查询
            await Promise.all(services.map(async s=>{
                try {
                    // 向服务端查询是否有ticket
                    const r = await axios.get(urljoin(s, 'api/ticket', req.params.fingerprint));
                    await ticket.store(r.data.ticket);
                }
                catch(e) {
                    try {
                        const r = await axios.get(urljoin(s, 'api/ticket', req.params.fingerprint, 'neighbor'));
                        await ticket.store(... r.data.list);
                    }
                    catch(e) {}
                }
                history_set.add(s);
            }));
            const nearest_services = await ticket.neighbor(req.params.fingerprint, 'service');
            services = Array.from(new Set(nearest_services.filter(k=>!history_set.has(k))));
        }
        return res.build({code: 404, message: '找不到资源'});
    });

    return r;
}

module.exports = router;
