const path = require('path');
const fse = require('fs-extra');
const openpgp = require('openpgp');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const default_gateway = require('default-gateway');
const os = require('os');

const obj = {
    root     : null,
    key      : null,
    db       : null,
    relay    : null,
    bootstrap: [],
    port     : null,
};

async function init_db () {
    // todo 数据库加密
    obj.db = await sqlite.open({
        filename: path.join(obj.root, `${obj.port}.db`,),
        driver  : sqlite3.Database
    });
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

async function ipv4 () {
    const { interface: iface } = await default_gateway.v4();
    const interfaces = os.networkInterfaces();
    for (let i of interfaces[iface]) {
        if ('IPv4' === i.family) {
            return i.address;
        }
    }
}

async function init ({root, relay, bootstrap, port}) {
    obj.root = root;
    obj.relay = relay;
    obj.bootstrap = typeof bootstrap === 'string' ? [bootstrap] : bootstrap;
    obj.port = port;
    await fse.ensureDir(obj.root);
    await init_db();
    await kv.init();
    await init_key();
}

module.exports = {
    init,
    /**
     * @returns {string}
     */
    get root () {
        return obj.root;
    },
    /**
     * @returns {string}
     */
    get relay () {
        return obj.relay;
    },
    /**
     * @returns {Array.<string>}
     */
    get bootstrap () {
        return obj.bootstrap;
    },
    /**
     * @returns {number}
     */
    get port () {
        return obj.port;
    },
    /**
     * @returns {openpgp.Key}
     */
    get key () {
        return obj.key;
    },
    /**
     * @returns {sqlite.Database}
     */
    get db () {
        return obj.db;
    },
    kv,
    ipv4,
};