const path = require('path');
const fse = require('fs-extra');
const exit_hook = require('exit-hook');
const openpgp = require('openpgp');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

const obj = {
    root : null,
    key  : null,
    db   : null,
    relay: null,
};

async function init_file_lock () {
    // 单实例运行
    await fse.ensureDir(obj.root);
    const lock_path = path.join(obj.root, 'run.lock');
    let lockfd = null;
    try {
        lockfd = fse.openSync(lock_path, 'wx');
    }
    catch(e) {
        console.error(`已有服务启动，无法启动第二个服务实例，如果确定服务并未启动，请手动删除'${lock_path}'文件锁`);
        process.exit(-1);
    }
    exit_hook(()=>{
        if(lockfd) {
            fse.closeSync(lockfd);
            fse.removeSync(lock_path);
        }
    });
}

async function init_db () {
    // todo 数据库加密
    obj.db = await sqlite.open({
        filename: path.join(obj.root, 'database'),
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

async function init ({root, relay}) {
    obj.root = root;
    obj.relay = relay;
    await fse.ensureDir(obj.root);
    await init_file_lock();
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
};