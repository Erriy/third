const runtime = require('./runtime');

async function init () {
    await runtime.db.run(`
        create table if not exists trust(
            fingerprint text primary key,
            config text not null
        )
    `);
}

async function set (fingerprint, config) {
    await runtime.db.run(
        'replace into trust(fingerprint, config) values(?,?)',
        fingerprint.toUpperCase(), JSON.stringify(config)
    );
    runtime.emit('trust.set', fingerprint, config);
}

async function remove (fingerprint) {
    await runtime.db.run(
        'delete from trust where fingerprint = ?',
        fingerprint.toUpperCase(),
    );
    runtime.emit('trust.remove', fingerprint);
}

async function get (fingerprint) {
    const d = await runtime.db.get(
        'select config from trust where fingerprint = ?',
        fingerprint.toUpperCase()
    );
    if(d) {
        return JSON.parse(d.config);
    }
    return null;
}

async function list () {
    return (await runtime.db.all('select * from trust')).map(r=>{
        return {fingerprint: r.fingerprint, config: JSON.parse(r.config)};
    });
}

module.exports = {
    init,
    set,
    remove,
    get,
    list,
};