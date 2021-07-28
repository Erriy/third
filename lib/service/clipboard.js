const clipboardy = require('clipboardy');
const account = require('./account');
const ticket = require('./ticket');
const axios = require('axios').default;
const urljoin = require('url-join');
const openpgp = require('openpgp');
const runtime = require('./runtime');
const pubkey = require('./pubkey');

const obj = {
    stop_watching: false,
    text         : null,
};

function init () {
    setInterval(async ()=>{
        if(obj.stop_watching) {
            return;
        }
        const text = await clipboardy.read();
        if(text === obj.text) {
            return;
        }
        obj.text = text;

        await Promise.all(account.device.map(async df=>{
            if(df === runtime.key.getFingerprint().toUpperCase()) {
                return;
            }
            const t = await ticket.get(df, {discover: true});
            if(!t) {
                return;
            }
            let service = null;
            let pubkey = null;
            try {
                const {pubkey:pk, object} = await ticket.analysis(t);
                service = object.service.third;
                pubkey = pk;
            }
            catch(e) {
                return;
            }
            if(!service) return;
            const data = await openpgp.encrypt({
                message       : await openpgp.createMessage({text: obj.text}),
                signingKeys   : runtime.key,
                encryptionKeys: await openpgp.readKey({armoredKey: pubkey})
            });
            try {
                await axios.put(urljoin(service, 'api/clipboard'), data, {timeout: 1000, headers: {'Content-Type': 'text/plain'}});
            }
            catch(e) {
            }
        }));

    }, 1000);
}

async function set (encrypted) {
    let d = null;
    let fpr = null;
    try {
        d = await openpgp.decrypt({
            message: await openpgp.readMessage({
                armoredMessage: encrypted
            }),
            decryptionKeys: runtime.key,
        });
        fpr = Buffer.from(d.signatures[0].signature.packets[0].issuerFingerprint).toString('hex').toUpperCase();
    }
    catch(e) {
        return;
    }

    if(-1 === account.device.indexOf(fpr)) {
        return ;
    }

    const pk = await pubkey.get(fpr);
    if(!pk) {
        return;
    }
    const sender_pubkey = await openpgp.readKey({armoredKey: pk});
    const v = await openpgp.verify({
        message         : await openpgp.createMessage({text: d.data}),
        date            : new Date(Date.now() + 1000),
        signature       : d.signatures[0].signature,
        verificationKeys: sender_pubkey
    });
    if(!await v.signatures[0].verified) {
        return;
    }
    obj.stop_watching = true;
    obj.text = d.data;
    await clipboardy.write(d.data);
    obj.stop_watching = false;
}

module.exports = {
    init,
    set,
};