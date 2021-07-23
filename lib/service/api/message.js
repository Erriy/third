const express = require('express');
const openpgp = require('openpgp');
const runtime = require('../runtime');
const pubkey = require('../pubkey');

async function decrypt_and_verify (encrypted) {
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
        throw new Error('解密失败');
    }
    const pk = await pubkey.get(fpr);
    if(!pk) {
        const e = new Error('公钥不存在，请提交公钥');
        e.status = 401;
        throw e;
    }
    const v = await openpgp.verify({
        message         : await openpgp.createMessage({text: d.data}),
        signature       : d.signatures[0].signature,
        verificationKeys: pk
    });
    if(!await v.signatures[0].verified) {
        throw new Error('签名验证失败');
    }

    return {fingerprint: fpr, text: d.data};
}

async function router () {
    const r = express.Router();

    r.put('', async (req, res)=>{
        try {
            const {fingerprint, text} = await decrypt_and_verify(req.body);
            console.log(fingerprint, text);
            return res.build();
        }
        catch(e) {
            return res.build({code: e.status || 400, message: e.message});
        }
    });

    return r;
}

module.exports = router;
