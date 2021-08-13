const gpg = require('gpg');
const openpgp = require('openpgp');
const command_exists = require('command-exists');
const axios = require('axios').default;
const urljoin = require('url-join');

// gpg 包中按照英文处理，如果shell中使用非英文输出，则会导致gpg模块解析错误
process.env.LC_ALL = 'C';

async function gpg_find_key (keyid, secret) {
    // 如果本机没有gpg命令，则直接返回空
    if(!await command_exists('gpg')) {
        return [];
    }

    return await new Promise(function (resolve, reject) {
        gpg.call(
            '',
            [
                `--list${secret ? '-secret' : ''}-keys`,
                '--with-colons',
                '--fixed-list-mode',
                keyid
            ],
            (error, stdout, stderr)=>{
                if (error) {
                    return resolve([]);
                }
                let data = stdout.toString();
                let reg = /(sec|pub).*\r?\n?(?<fpr>fpr.*)\r?\n?(grp.*\r?\n)?(?<uid>uid.*)\r?\n?/gm;
                let i = null;
                let list = [];
                while ((i = reg.exec(data))) {
                    list.push(i.groups.fpr.split(':')[9]);
                }
                return resolve(list);
            }
        );
    });
}

async function openpgp_find_key (keyid, keyserver = 'https://keyserver.ubuntu.com') {
    let pubkey = null;
    try {
        const r = await axios.get(urljoin(keyserver, `/pks/lookup?op=get&search=${keyid}`));
        pubkey = r.data;
    }
    catch (e) {
        if(404 === e.response.status) {
            return null;
        }
    }
    pubkey = await openpgp.readKey({armoredKey: pubkey});
    return pubkey.getFingerprint().toUpperCase();
}

async function clearsign (fingerprint, text) {
    return new Promise((resolve, reject) => {
        gpg.clearsign(
            text,
            ['--digest-algo', 'sha512', '--default-key', fingerprint],
            (error, stdout) => {
                if (error) {
                    return reject(error);
                }
                return resolve(stdout.toString());
            }
        );
    });
}

function pubkey (fingerprint) {
    return new Promise((resolve, reject) => {
        gpg.call(
            '',
            ['--export', '--armor', fingerprint],
            (error, stdout, stderr) => {
                if (error) {
                    return reject(error);
                }
                return resolve(stdout.toString());
            }
        );
    });
}

async function lookup (keyid) {
    if(!keyid.startsWith('0x')) {
        keyid = '0x' + keyid;
    }

    let fpr = await gpg_find_key(keyid, false);
    if(fpr.length > 0) {
        return fpr[0];
    }
    fpr = await openpgp_find_key(keyid);
    return fpr || null;
}

async function have_prikey (fingerprint) {
    const fprs = await gpg_find_key(fingerprint, true);
    return fprs.length > 0;
}

module.exports = {
    lookup,
    have_prikey,
    pubkey,
    clearsign,
};