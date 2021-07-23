const openpgp = require('openpgp');
const runtime = require('./runtime');

async function auto_delete () {
    await runtime.db.run(`
        delete from pubkey where expire < ?
    `, new Date().getTime() / 1000);
}

async function init () {
    await runtime.db.run(`
        create table if not exists pubkey(
            fingerprint text primary key,
            pubkey text not null,
            expire number not null
        )
    `);

    await auto_delete();
    setInterval(auto_delete, 1000 * 60 * 5);
}

/**
 * 保存pubkey，一天后自动删除
 * @param {string} pubkey - 要保存的gpg公钥
 * @returns {Promise<string>} 返回指纹
 */
async function store (pubkey) {
    const p = await openpgp.readKey({armoredKey: pubkey});
    const fingerprint = p.getFingerprint().toUpperCase();
    // 默认保存一天，超过后则自动删除，防止数据库pubkey表无限增长
    const expire = new Date().getTime() / 1000 + 1000 * 60 * 60 * 24;
    await runtime.db.run(
        'replace into pubkey (fingerprint, pubkey, expire) values (?,?,?)',
        fingerprint, pubkey, expire
    );
    return fingerprint;
}

/**
 * 根据指纹获取公钥，不存在则返回null
 * @param {string} [fingerprint=null] - 指纹，不指定指纹则获取本机key的公钥
 * @return {Promise<string|null>} 公钥
 */
async function get (fingerprint = null) {
    if(!fingerprint) {
        return runtime.key.toPublic().armor();
    }
    const r = await runtime.db.get(
        'select pubkey from pubkey where fingerprint=?',
        fingerprint.toUpperCase()
    );

    return r ? r.pubkey : null;
}

module.exports = {
    init,
    store,
    get,
};