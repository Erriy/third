const { Command } = require('commander');
const openpgp = require('openpgp');
const gpg = require('gpg');
const axios = require('axios').default;
const urljoin = require('url-join');
const cmd = new Command('account');
const {driver} = require('../lib');
const command_exists = require('command-exists');
const inquirer = require('inquirer');
const fuzzy = require('fuzzy');
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

/**
 * 1. 先去搜索是否存在ticket
 * 2. 如果已经存在ticket
 *      1. 如果本地存在私钥，则尝试本地更新ticket后再去将ticket推送ticket服务和已存在的机器上
 *      2. 如果本地不存在私钥，则向已有的主机发送登录请求
 * 3. 托管ticket推送
 */

async function gpg_find_key (keyid) {
    // 如果本机没有gpg命令，则直接返回空
    if(!await command_exists('gpg')) {
        return null;
    }

    const finder = (keyid, secret)=>{
        // gpg 包中按照英文处理，如果shell中使用非英文输出，则会导致gpg模块解析错误
        process.env.LC_ALL = 'C';
        return new Promise(function (resolve, reject) {
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
                        list.push({
                            fingerprint: i.groups.fpr.split(':')[9],
                            uid        : i.groups.uid.split(':')[9],
                        });
                    }
                    return resolve(list);
                }
            );
        });
    };

    const pubkeys = await finder(keyid, false);
    if(pubkeys.length === 0) {
        return null;
    }
    const pubkey = pubkeys[0];
    const secrets = await finder(pubkey.fingerprint, true);
    const can_sign = secrets.length > 0;

    const get_pubkey = (fingerprint)=>{
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
    };

    return {
        can_sign,
        pubkey     : await get_pubkey(pubkey.fingerprint),
        fingerprint: pubkey.fingerprint
    };
}

async function openpgp_find_key (keyid, keyserver) {
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
    const fingerprint = pubkey.getFingerprint().toUpperCase();
    return {can_sign: false, fingerprint, pubkey: pubkey.armor()};
}

/**
 *
 * @param {string} keyid
 * @param {string} keyserver
 * @returns {{fingerprint: string, can_sign: boolean, pubkey: string}}
 */
async function find_key (keyid, keyserver) {
    if(!keyid.startsWith('0x')) {
        keyid = '0x' + keyid;
    }

    const d = await gpg_find_key(keyid);
    if(d) {
        return d;
    }
    return await openpgp_find_key(keyid, keyserver);
}

async function device_keyid () {
    return await driver.key.fingerprint();
}

async function login_request (fingerprint) {
    // todo 向其他主机发送登录请求
    const r = await driver.account.login_require(fingerprint);
    if(200 === r.code) {
        console.log('\t ===已向其他终端提交登陆请求===');
        console.log('账户指纹:\t', fingerprint.replace(/(.{4})/g, '$1 '));
        console.log('本机指纹:\t', (await device_keyid()).replace(/(.{4})/g, '$1 '));
    }
    else {
        console.error(r.message);
        process.exit(-1);
    }
}

async function publish (fingerprint, pubkey, old_ticket_object, new_device_fingerprint) {
    // todo 设置expire字段
    // todo 重新生成ticket并托管ticket
    const ticket = old_ticket_object || {};
    ticket.device = ticket.device || [];

    const gpg_sign = async (text)=>{
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
    };

    // 签名新的device
    ticket.device.push(new_device_fingerprint);
    ticket.device = Array.from(new Set(ticket.device));
    const new_ticket = {
        pubkey,
        signed: await gpg_sign(JSON.stringify(ticket))
    };
    // 托管账户ticket
    await driver.account.set_ticket(new_ticket);
    // 推送到其他客户端
    await Promise.all(ticket.device.map(async fpr=>{
        const d = await driver.ticket.lookup(fpr);
        if(!d || !d.service || !d.service.third) {
            return;
        }
        await axios.put(urljoin(d.service.third, 'api/account/ticket'), new_ticket);
    }));

    return new_ticket;
}

cmd
    .command('login')
    .option('--keyserver <string>', '指定keyserver', 'https://keyserver.ubuntu.com')
    .arguments('<keyid>')
    .action(async (keyid, opts)=>{
        /** 根据keyid查找pubkey */
        const d = await find_key(keyid, opts.keyserver);
        if(!d) {
            console.error('找不到key，请确认keyid存在');
            process.exit(-1);
        }
        /** 查找用户的ticket */
        await driver.init();

        let ticket_object = null;
        try {
            // 找到了ticket
            ticket_object = await driver.ticket.lookup(d.fingerprint);
        }
        catch (e) {
        }
        // 本机不具备签发能力
        if(!d.can_sign) {
            // 本机不具备签发能力且未找到具有签发能力的主机
            if(!ticket_object) {
                console.error('指定的keyid尚未加入third网络');
                process.exit(-1);
            }
            // 本机不具备签发能力，但是找到了其他下属设备
            await login_request(d.fingerprint);
        }
        // 本机具有签发能力
        else {
            // 创建ticket并发布到ticket网络和下属主机
            await publish(d.fingerprint, d.pubkey, ticket_object, await device_keyid());
        }

    });

cmd
    .command('allow')
    .action(async ()=>{
        await driver.init();
        const r = await driver.account.get_login_request();
        if(r.list.length === 0) {
            console.log('没有登录请求');
            return;
        }

        function search_fingerprint (input) {
            input = input || '';
            return new Promise((resolve, reject) => {
                resolve(fuzzy.filter(input, r.list).map(el=>el.original.replace(/(.{4})/g, '$1 ')));
            });
        }

        inquirer.prompt({
            type     : 'autocomplete',
            name     : 'fingerprint',
            message  : '请选择指纹',
            emptyText: '找不到结果',
            source   : (answers, input) => {
                return search_fingerprint(input);
            },
            pageSize: 4,
        }).then(async answer=>{
            const r = await driver.account.get_object();
            await publish(r.fingerprint, r.pubkey, r.object, answer.fingerprint.replace(/ /g, ''));
        });
    });

cmd
    .action(async ()=>{
        await driver.init();
        const r = await driver.account.get_object();
        if(200 !== r.code) {
            console.error('本机未登录账户');
            return;
        }
        else {
            console.log('账户指纹:\t', r.fingerprint.replace(/(.{4})/g, '$1 '));
            console.log('账户下的设备指纹：');
            r.object.device.forEach((df, i)=>{
                console.log(i, '=>', df.replace(/(.{4})/g, '$1 '));
            });
        }
    });

module.exports = cmd;
