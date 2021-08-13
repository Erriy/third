const runtime = require('../runtime');
const rpc = require('../rpc');

async function send (devices) {
    let success_count = 0;
    await Promise.all(devices.map(async (df)=>{
        try {
            await rpc.invoke(
                df,
                'third.account.login.request',
                new Date().getTime() / 1000 + 60 * 5
            );
            success_count++;
        }
        catch (err) {
        }
    }));

    if(success_count === 0) {
        throw new Error ('无其他终端在线，无法请求登录');
    }
}

async function list (limit = 5) {
    return (await runtime.db.all(
        'select fingerprint from account_login_request where expire > ? order by expire desc limit ?',
        new Date().getTime() / 1000,
        limit,
    )).map(lr=>(lr.fingerprint));
}

async function remove (fingerprint) {
    await runtime.db.run('delete from account_login_request where fingerprint = ?', fingerprint);
    runtime.emit('account.login.request.remove');
}

async function handle_new_request (expire, {fingerprint}) {
    if(typeof expire !== 'number' || expire <= new Date().getTime() / 1000) {
        throw new Error('请求已超时');
    }
    await runtime.db.run(
        'replace into account_login_request (fingerprint, expire) values (?,?)',
        fingerprint, expire
    );
    runtime.emit('account.login.request.new');
}

async function init () {
    // 创建登录请求表
    await runtime.db.run(`
        create table if not exists account_login_request(
            fingerprint text primary key,
            expire number not null
        )
    `);

    // 每5分钟清理一次登录请求
    setInterval(async ()=>{
        const now = new Date().getTime() / 1000;
        await runtime.db.run(
            'delete from account_login_request where expire < ?', now
        );
    }, 1000 * 60 * 5);

    rpc.regist('third.account.login.request', handle_new_request);
}

module.exports = {
    init,
    send,
    list,
    remove,
};