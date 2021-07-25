const openpgp = require('openpgp');
const runtime = require('./runtime');
const ticket = require('./ticket');
const kv = require('./kv');

const obj = {
    account: {
        fingerprint: null,
        /**
         * @type {{pubkey:string, signed:string}}
         */
        ticket     : null,
        created    : null,
    }
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
    obj.account = (await kv.get('account')) || {fingerprint: null, ticket: null};

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
            await set_ticket(str_tk);
        }
    }
    // 设置完新的ticket后可能存在被踢出账户的情况
    if(!obj.account || !obj.account.fingerprint) {
        return;
    }
    // 发布最新的ticket
    await ticket.publish(obj.account.ticket);
}

async function new_login_request (ticket) {
    // todo 添加进登录请求表格
}

async function get_login_request (keyid) {

}

async function set_ticket (account_ticket) {
    if(typeof account_ticket === 'string') {
        account_ticket = JSON.parse(account_ticket);
    }
    const t = await ticket.analysis(account_ticket);
    if(-1 === t.object.device.indexOf(runtime.key.getFingerprint().toUpperCase())) {
        // 设备已经从账户中剔除
        obj.account = {
            fingerprint: null,
            ticket     : null,
            created    : null
        };
        return;
    }

    obj.account.fingerprint = t.fingerprint;
    obj.account.ticket = account_ticket;
    obj.account.created = t.created;
    // todo 检查expire超时
    await kv.set('account', obj.account);
}

module.exports = {
    init,
    set_ticket,
};