const runtime = require('./runtime');

async function init () {
    await runtime.db.run(`
        create table if not exists kv(
            key text not null unique primary key,
            value text not null
        )
    `);
}

async function get (key) {
    const d = await runtime.db.get('select value from kv where key=?', key);
    return d ? JSON.parse(d.value) : null;
}

async function set (key, value) {
    await runtime.db.run(
        'replace into kv (key,value) values (?,?)',
        key,
        JSON.stringify(value)
    );
}

module.exports = {
    init,
    get,
    set,
};
