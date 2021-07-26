const express = require('express');
const axios = require('axios').default;
const runtime = require('../runtime');
const account = require('../account');
const ticket = require('../ticket');
const urljoin = require('url-join');
const openpgp = require('openpgp');

function router () {
    const r = express.Router();

    r.put('/ticket', async (req, res)=>{
        try {
            await account.set(req.body, true);
            return res.build();
        }
        catch (e) {
            return res.build({code: 400, message: e.message});
        }
    });

    r.post('/login', async (req, res)=>{
        const fpr = req.query.fingerprint;
        let tk = await ticket.get(fpr, {discover: true});
        if(!tk) {
            return res.build({code: 404, message: '找不到账户信息'});
        }
        tk = await ticket.analysis(tk);
        let success_count = 0;
        const login_request = {
            pubkey: runtime.key.toPublic().armor(),
            signed: await openpgp.sign({
                signingKeys: runtime.key,
                message    : await openpgp.createCleartextMessage({text: JSON.stringify({
                    expire: new Date().getTime() / 1000 + 60 * 5
                })})
            })
        };

        await Promise.all(tk.object.device.map(async dev_fpr=>{
            let t = await ticket.get(dev_fpr, {discover: true, refresh: true});
            if(!t) return;
            t = await ticket.analysis(t);

            if(!t.object.service || !t.object.service.third) {
                return;
            }
            try {
                await axios.put(urljoin(t.object.service.third, 'api/account/request'), login_request);
                success_count += 1;
            }
            catch(e) {

            }
        }));

        if(success_count === 0) {
            return res.build({code: 400, message: '无其他终端在线，无法请求登录'});
        }

        await account.set_fingerprint(req.query.fingerprint);
        return res.build();
    });

    r.get('/request', async (req, res)=>{
        return res.build({list: await account.get_login_request()});
    });

    r.get('/object', async (req, res)=>{
        const account_ticket = account.get();
        if(!account_ticket) {
            return res.build({code: 404, message: '本机未登录任何账户'});
        }
        const t = await ticket.analysis(account_ticket);
        return res.build({object: t.object, pubkey: t.pubkey, fingerprint: t.fingerprint});
    });

    return r;
}

module.exports = router;
