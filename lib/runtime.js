const openpgp = require('openpgp');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const os = require('os');
const default_gateway = require('default-gateway');
const fse = require('fs-extra');

const obj = {
    /**
     * @type {sqlite.Database}
     */
    db    : null,
    /**
     * @type {openpgp.Key}
     */
    key   : null,
    logger: null,
};

async function ipv4 () {
    const { interface: iface } = await default_gateway.v4();
    const interfaces = os.networkInterfaces();
    for (let i of interfaces[iface]) {
        if ('IPv4' === i.family) {
            return i.address;
        }
    }
}

async function init_db (database) {
    if(typeof database === 'string') {
        await fse.ensureFile(database);

        obj.db = await sqlite.open({
            filename: database,
            driver  : sqlite3.Database
        });
    }
    else {
        throw new Error('参数错误，不支持的数据库格式，无法完成初始化');
    }
}

class kv {
    static async init () {
        await obj.db.run(`
            create table if not exists kv(
                key text not null unique primary key,
                value text not null
            )
        `);
    }

    static async get (key) {
        const d = await obj.db.get('select value from kv where key=?', key);
        return d ? JSON.parse(d.value) : null;
    }

    static async set (key, value) {
        await obj.db.run(
            'replace into kv (key,value) values (?,?)',
            key,
            JSON.stringify(value)
        );
    }
}

async function init_key () {
    let device_key = await kv.get('device.key');
    if(!device_key) {
        const { privateKeyArmored } = await openpgp.generateKey({
            type   : 'ecc',
            curve  : 'curve25519',
            userIDs: [{name: 'third'}],
        });
        device_key = privateKeyArmored;
        await kv.set('device.key', device_key);
    }
    obj.key = await openpgp.readKey({armoredKey: device_key});
}

async function init ({
    database,
    port,
    logger,
}) {
    obj.port = port;
    obj.logger = logger;
    await init_db(database);
    await kv.init();
    await init_key();
}

module.exports = {
    init,
    kv,
    /**
     * @returns {sqlite.Database}
     */
    get db () {
        return obj.db;
    },
    /**
     * @returns {openpgp.Key}
     */
    get key () {
        return obj.key;
    },
    /**
     * @returns {number}
     */
    get port () {
        return obj.port;
    },

    /**
     * @return {{debug: function, info: function, warning: function, error: function}}
     */
    get logger () {
        return obj.logger;
    },
    ipv4,
};