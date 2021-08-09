const gpg = require('gpg');
const axios = require('axios').default;
const openpgp = require('openpgp');
const urljoin = require('url-join');
const command_exists = require('command-exists');
const events = require('events');
const runtime = require('./runtime');
const ticket = require('./ticket');
const session = require('./session');

const obj = {
    account: {
        fingerprint: null,
        /**
         * @type {{pubkey:string, signed:string}}
         */
        ticket     : null,
        created    : 0,
        expire     : 0,
        object     : null
    },
    event_emitter: new events.EventEmitter()
};

/**
 * 监听事件
 * @param {string} event - 事件名
 *
 * login.success - 登录成功
 *
 * login.failed - 登录失败
 *
 * login.wait - 等待授权
 *
 * login.request - 接收到新的登录请求
 * 
 * logout - 主动或被动下线
 *
 * device.change - 设备更新
 *
 * change - 以上所有消息会附带发送changed消息
 *
 * @param {function} callback - 回调函数
 */
function on (event, callback) {
    obj.event_emitter.on(event, callback);
}

function emit (event) {
    if(-1 !== obj.event_emitter.eventNames().indexOf(event)) {
        obj.event_emitter.emit(event);
    }
    if(-1 !== obj.event_emitter.eventNames().indexOf('change')) {
        obj.event_emitter.emit('change');
    }
}

async function fetch_and_publish () {
    // 如果本机账户信息未设置，则直接返回
    if(!obj.account.fingerprint) {
        return;
    }
    // 获取最新的账户ticket
    const t = await ticket.get(obj.account.fingerprint, {discover: true, refresh: true});
    if(t) {
        if(t.created > obj.account.created) {
            // 有最新的ticket，设置最新的account信息
            await account_ticket(ticket.merge(t));
        }
    }
    // 设置完新的ticket后可能存在被踢出账户的情况
    if(!obj.account.fingerprint) {
        return;
    }
    // 发布最新的ticket
    await ticket.publish(obj.account.ticket);
}

/**
 * 设置或返回账户ticket
 * @param {string|undefined} strtk - ticket
 * @returns {{pubkey:string, signed:string}}
 */
async function account_ticket (strtk = undefined) {
    if(!strtk) {
        return obj.account.ticket;
    }
    const t = await ticket.analysis(strtk);
    if(obj.account.fingerprint !== t.fingerprint) {
        throw new Error('非本机登录账户，拒绝更新ticket');
    }

    // 本机从账户中退出
    const tk_obj = JSON.parse(t.text);
    if(!(tk_obj.device instanceof Array)
        || -1 === tk_obj.device.indexOf(runtime.key.getFingerprint().toUpperCase())
    ) {
        logout();
    }
    else {
        obj.account.ticket = strtk;
        obj.account.created = t.created;
        obj.account.expire = t.expire;
        const new_obj = JSON.parse(t.text);
        if(obj.account.object) {
            const union_size = new Set([... new_obj.device, ...obj.account.object.device]).size;
            // 通知设备变动
            if(union_size !== new_obj.device.length || union_size !== obj.account.object.device.length) {
                emit('device.change');
            }
        }
        obj.account.object = new_obj;
    }
    // 保存到数据库
    await runtime.kv.set('account', obj.account);
    // 拉取更新并推送
    await fetch_and_publish();
}

/**
 * 发布新的ticket
 * @param {Object} ticket_object - ticket中携带的对象
 * @param  {...string} devices - 受影响的设备
 */
async function publish_new_account_ticket (
    ticket_object,
    ...devices
) {
    const gpg_sign = (text)=>{
        return new Promise((resolve, reject) => {
            gpg.clearsign(
                text,
                ['--digest-algo', 'sha512', '--default-key', obj.account.fingerprint],
                (error, stdout) => {
                    if (error) {
                        return reject(error);
                    }
                    return resolve(stdout.toString());
                }
            );
        });
    };

    const get_pubkey = ()=>{
        return new Promise((resolve, reject) => {
            gpg.call(
                '',
                ['--export', '--armor', obj.account.fingerprint],
                (error, stdout, stderr) => {
                    if (error) {
                        return reject(error);
                    }
                    return resolve(stdout.toString());
                }
            );
        });
    };

    const new_ticket = {
        pubkey: await get_pubkey(),
        signed: await gpg_sign(JSON.stringify(ticket_object))
    };
    // 保存本机ticket
    await account_ticket(new_ticket);
    await ticket.store(new_ticket);
    // 提交到其他主机
    const this_fpr = runtime.key.getFingerprint().toUpperCase();
    // 推送到其他客户端，包括删除的终端和新增的终端
    await Promise.all(devices.map(async fpr=>{
        // 不用再向本机服务提交了
        if(fpr === this_fpr) {
            return;
        }
        try {
            (await session.select(fpr)).put('api/account/ticket', new_ticket);
        }
        catch(e) {}
    }));
}

async function send_login_request (ticket_object) {
    let success_count = 0;
    const request_data = {
        pubkey: runtime.key.toPublic().armor(),
        signed: await openpgp.sign({
            signingKeys: runtime.key,
            message    : await openpgp.createCleartextMessage({text: JSON.stringify({
                expire: new Date().getTime() / 1000 + 60 * 5
            })})
        })
    };

    await Promise.all(ticket_object.device.map(async dev_fpr=>{

        try {
            await (await session.select(dev_fpr)).put('api/account/request', request_data);
            success_count += 1;
        }
        catch(e) {}
    }));

    if(success_count === 0) {
        throw new Error ('无其他终端在线，无法请求登录');
    }
}

async function authority () {
    if(!obj.account.fingerprint) {
        return false;
    }
    const fprs = await gpg_find_key(obj.account.fingerprint, true);
    return fprs.length > 0;
}

async function login (fingerprint) {
    // 设置本地账户指纹
    obj.account.fingerprint = fingerprint;
    // 查找是否已经有账户ticket
    let at = await ticket.get(fingerprint, {discover: true});
    // 查找本地是否有私钥
    if(await authority()) {
        // 本地具有签发能力
        const ticket_object = at ? JSON.parse(at.text) : {};
        ticket_object.device = ticket_object.device || [];
        ticket_object.device.push(runtime.key.getFingerprint().toUpperCase());
        ticket_object.device = Array.from(new Set(ticket_object.device));
        await publish_new_account_ticket(ticket_object, ...ticket_object.device);

        emit('login.success');
        return true;
    }
    else {
        // 本地不具备签发能力
        if(!at) {
            // 找不到账户
            emit('login.failed');
            throw new Error('要登录的账户尚未加入third网络');
        }
        // 找到账户，向其提交登录请求
        await send_login_request(JSON.parse(at.text));
        emit('login.wait');
        return false;
    }
}

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

async function lookup (keyid) {
    if(!keyid.startsWith('0x')) {
        keyid = '0x' + keyid;
    }

    let fprs = await gpg_find_key(keyid, false);
    if(fprs.length > 0) {
        return fprs;
    }
    fprs = await openpgp_find_key(keyid);
    return fprs ? [fprs] : null;
}

async function logout () {
    obj.account =  {
        fingerprint: null,
        ticket     : null,
        created    : 0,
        expire     : 0,
        object     : null
    };
    emit('logout');
}

/**
 *
 * @param {null|string} [t=null] - 不指定则为获取，指定为添加
 */
async function request (t = null) {
    // 新的请求
    if(t) {
        t = await ticket.analysis(t);
        await runtime.db.run(
            'replace into login_request (fingerprint, expire) values (?,?)',
            t.fingerprint, t.expire
        );
        emit('login.request');
        return;
    }
    // 获取请求列表
    return (await runtime.db.all(
        'select fingerprint from login_request where expire > ? limit 1000',
        new Date().getTime() / 1000
    )).map(lr=>(lr.fingerprint));
}

async function add_device (fingerprint) {
    fingerprint = fingerprint.toUpperCase();
    if(!(obj.account.object.device instanceof Array)) {
        obj.account.object.device = [];
    }
    if(-1 !== obj.account.object.device.indexOf(fingerprint)) {
        return;
    }
    obj.account.object.device.push(fingerprint);
    await publish_new_account_ticket(obj.account.object, ...obj.account.object.device);
}

async function remove_device (fingerprint) {
    let i = 0;
    fingerprint = fingerprint.toUpperCase();
    if(!(obj.account.object.device instanceof Array)) {
        obj.account.object.device = [];
    }
    if(-1 === (i = obj.account.object.device.indexOf(fingerprint))) {
        return;
    }
    obj.account.object.device.splice(i, 1);
    await publish_new_account_ticket(obj.account.object, fingerprint, ...obj.account.object.device);
    emit('device.change');
}

async function init () {
    // gpg 包中按照英文处理，如果shell中使用非英文输出，则会导致gpg模块解析错误
    process.env.LC_ALL = 'C';

    // 创建登录请求表
    await runtime.db.run(`
        create table if not exists login_request(
            fingerprint text primary key,
            expire number not null
        )
    `);

    // 每5分钟清理一次登录请求
    setInterval(async ()=>{
        const now = new Date().getTime() / 1000;
        await runtime.db.run(
            'delete from login_request where expire < ?', now
        );
    }, 1000 * 60 * 5);

    // 加载本机account信息
    obj.account = (await runtime.kv.get('account')) || {fingerprint: null, ticket: null, created: 0, expire: 0, object: null};

    // 自动拉取和发布本机ticket
    fetch_and_publish().then();
    setTimeout(fetch_and_publish, 1000 * 60 * 5);
}

module.exports = {
    init,
    login,
    logout,
    ticket: account_ticket,
    lookup,
    request,
    on,
    authority,
    device: {
        remove: remove_device,
        add   : add_device,
        /**
         * @returns {Array.<string>}
         */
        list () {
            return (obj.account.object ? obj.account.object.device : []) || [];
        }
    },
    get fingerprint () {
        return obj.account.fingerprint;
    },
    get object () {
        return obj.account.object;
    }
};