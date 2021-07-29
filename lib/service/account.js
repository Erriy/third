const runtime = require('./runtime');
const ticket = require('./ticket');

const obj = {
    account: {
        fingerprint: null,
        /**
         * @type {{pubkey:string, signed:string}}
         */
        ticket     : null,
        created    : 0,
        device     : [],
    },
};

async function init () {
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
    obj.account = (await runtime.kv.get('account')) || {fingerprint: null, ticket: null, device: [], create: 0};

    // 自动拉取和发布本机ticket
    await fetch_and_publish();
    setTimeout(fetch_and_publish, 1000 * 60 * 5);
}

async function fetch_and_publish () {
    // 如果本机账户信息未设置，则直接返回
    if(!obj.account || !obj.account.fingerprint) {
        return;
    }
    // 获取最新的账户ticket
    const str_tk = await ticket.get(obj.account.fingerprint, {discover: true, refresh: true});
    if(str_tk) {
        const t = await ticket.analysis(str_tk);
        if(t.created > obj.account.created) {
            // 有最新的ticket，设置最新的account信息
            await set(str_tk);
        }
    }
    // 设置完新的ticket后可能存在被踢出账户的情况
    if(!obj.account || !obj.account.fingerprint) {
        return;
    }
    // 发布最新的ticket
    await ticket.publish(obj.account.ticket);
}

async function new_login_request (tk) {
    const t = await ticket.analysis(tk);
    await runtime.db.run(
        'replace into login_request (fingerprint, expire) values (?,?)',
        t.fingerprint, t.expire
    );
}

async function get_login_request () {
    return (await runtime.db.all(
        'select fingerprint from login_request where expire > ? limit 1000',
        new Date().getTime() / 1000
    )).map(lr=>(lr.fingerprint));
}

async function set_fingerprint (fingerprint) {
    if(obj.account.fingerprint !== fingerprint) {
        obj.account.ticket = null;
        obj.account.created = 0;
    }

    obj.account.fingerprint = fingerprint;
    await runtime.kv.set('account', obj.account);
}

async function set (account_ticket, force = false) {
    if(typeof account_ticket === 'string') {
        account_ticket = JSON.parse(account_ticket);
    }
    const t = await ticket.analysis(account_ticket);

    if(!force && t.fingerprint !== obj.account.fingerprint) {
        throw new Error('非本机使用的账户，拒绝保存');
    }

    if(obj.account.created > t.created) {
        throw new Error('拒绝使用旧的账户信息');
    }

    if(-1 === t.object.device.indexOf(runtime.key.getFingerprint().toUpperCase())) {
        // 设备已经从账户中剔除
        obj.account = {
            fingerprint: null,
            ticket     : null,
            created    : null
        };

        obj.account.device = [];
        return;
    }

    obj.account.fingerprint = t.fingerprint;
    obj.account.ticket = account_ticket;
    obj.account.created = t.created;
    obj.account.device = t.object.device;
    // todo 检查expire超时
    await runtime.kv.set('account', obj.account);
    await fetch_and_publish();
}

function get () {
    return obj.account.ticket;
}

module.exports = {
    init,
    get,
    set,
    set_fingerprint,
    new_login_request,
    get_login_request,
    get device () {
        return obj.account.device;
    }
};