const path = require('path');
const fse = require('fs-extra');
const exit_hook = require('exit-hook');
const openpgp = require('openpgp');
const util = require('util');
const fs_readfile = util.promisify(fse.readFile);
const fs_writefile = util.promisify(fse.writeFile);
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

const obj = {
    root: path.join(process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'], '.third'),
    key : null,
    db  : null,
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

async function init_key () {
    const key_path = path.join(obj.root, 'key');
    let armored_key = null;
    if(await fse.pathExists(key_path)) {
        armored_key = (await fs_readfile(key_path)).toString();
    }
    else {
        const { privateKeyArmored } = await openpgp.generateKey({
            type   : 'ecc',
            curve  : 'curve25519',
            userIDs: [{name: 'third'}],
        });
        armored_key = privateKeyArmored;
        await fs_writefile(key_path, armored_key);
    }
    obj.key = await openpgp.readKey({armoredKey: armored_key});
}

async function init_db () {
    obj.db = await sqlite.open({
        filename: path.join(obj.root, 'database'),
        driver  : sqlite3.Database
    });
}

async function init () {
    await init_file_lock();
    await init_key();
    await init_db();
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
    }
};