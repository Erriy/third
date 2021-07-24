const { Command } = require('commander');
const cmd = new Command('account');
const openpgp = require('openpgp');
const axios = require('axios').default;
const urljoin = require('url-join');

cmd
    .command('login')
    .option('--keyserver <string>', '指定keyserver', 'https://keyserver.ubuntu.com')
    .arguments('<keyid>')
    .action(async (keyid, opts) => {
        if(!keyid.startsWith('0x')) {
            keyid = '0x' + keyid;
        }
        let pubkey = null;
        try {
            const r = await axios.get(urljoin(opts.keyserver, `/pks/lookup?op=get&search=${keyid}`));
            pubkey = r.data;
        }
        catch (e) {
            if(404 === e.response.status) {
                console.log('找不到公钥');
            }
            process.exit(-1);
        }

        pubkey = await openpgp.readKey({armoredKey: pubkey});
        const fingerprint = pubkey.getFingerprint().toUpperCase();
        pubkey.getUserIDs().forEach(uid=>{
            console.log('uid\t', uid);
        });
        console.log('指纹\t', fingerprint.replace(/(.{4})/g, '$1 '));
    });

module.exports = cmd;