const rpc = require('../rpc');
const pgp = require('./pgp');
const kns = require('../kns');
const runtime = require('../runtime');
const request = require('./request');

const obj = {
    account: {
        fingerprint: null,
        /**
         * @type {{fingerprint: string, expire: number, created: number, text: string, pubkey:string, signature: string, provider: boolean}}
         */
        record     : null,
        object     : null,
    },
};

const status = {

    /**
     * 是否已登录
     * @returns {boolean}
     */
    get login () {
        return obj.account.fingerprint && obj.account.object && obj.account.record;
    },

    /**
     * 是否等待登录确认
     * @returns {boolean}
     */
    get wait () {
        return obj.account.fingerprint && !obj.account.object && !obj.account.record;
    }
};

async function set_new_record (record) {
    const r = record.signed ? await kns.analysis(record) : record;
    if(obj.account.fingerprint !== r.fingerprint) {
        throw new Error('非本机登录账户，拒绝更新record');
    }

    const ro = JSON.parse(r.text);
    // 本机被新的踢出
    if(!(ro.device instanceof Array)
    || -1 === ro.device.indexOf(runtime.key.getFingerprint().toUpperCase())) {
        logout();
    }
    else {
        if(obj.account.object) {
            const union_size = new Set([... ro.device, ...obj.account.object.device]).size;
            // 通知设备变动
            if(union_size !== ro.device.length || union_size !== obj.account.object.device.length) {
                runtime.emit('account.device.change');
            }
        }
        obj.account.record = r;
        obj.account.object = ro;
    }
    // 保存新的账户信息
    await runtime.kv.set('account', obj.account);
    // 下次消息循环调用，防止循环调用爆栈（虽然不太可能爆栈）
    setImmediate(fetch_and_publish);
}

async function fetch () {
    // 如果本机账户信息未设置，则直接返回
    if(!obj.account.fingerprint) return;
    // 拉取新数据
    const r = await kns.get(obj.account.fingerprint, {discover: true, refresh: true});
    // 未拉取到新的数据
    if(!r) return;
    // 本机比拉取到的更新直接返回
    if(r.created <= obj.account.record.created) return;
    await set_new_record(r);
}

async function publish (devices = []) {
    if(!obj.account.record) return;

    const promise_list = [];
    const record = kns.merge(obj.account.record);

    // 推送到kns provider
    promise_list.push(async ()=>{
        await kns.publish(record);
    });

    // 推送到其他受影响客户端
    for(let df of devices) {
        promise_list.push(async ()=>{
            try {
                await rpc.invoke(df, 'third.account.record', record);
            }
            // todo 只忽略连接失败的错误
            catch(e) {}
        });
    }

    await Promise.all(promise_list);
}

async function fetch_and_publish () {
    await fetch();
    await publish();
}

/**
 * 登录账号，返回true则登录成功，false则为已请求，throw为失败
 * @param {string} fingerprint
 * @throw
 * @returns {boolean}
 */
async function login (fingerprint) {
    obj.account.fingerprint = fingerprint;

    // todo 已登录则直接返回
    // 查询是否有旧的历史记录
    const old_record = await kns.get(fingerprint, {discover: true});
    const rec_obj = old_record ? JSON.parse(old_record.text) : {};

    // 本地有签发能力
    if(await pgp.have_prikey(fingerprint)) {
        rec_obj.device = rec_obj.device || [];
        rec_obj.device.push(runtime.key.getFingerprint().toUpperCase());
        rec_obj.device = Array.from(new Set(rec_obj.device));
        await set_new_record({
            signed: await pgp.clearsign(fingerprint, JSON.stringify(rec_obj)),
            pubkey: await pgp.pubkey(fingerprint)
        });
        runtime.emit('account.login.success');
        setImmediate(()=>publish(rec_obj.device));
        return true;
    }
    // 本地无签发能力
    else {
        await request.send(rec_obj.device);
        runtime.emit('account.login.request');
        return false;
    }
}

async function logout () {
    obj.account.fingerprint = null;
    obj.account.object = null;
    obj.account.record = null;
    await runtime.kv.set('account', obj.account);
    runtime.emit('account.logout');
}

async function add_device (fingerprint) {
    fingerprint = fingerprint.toUpperCase();
    if(!(obj.account.object.device instanceof Array)) {
        obj.account.object.device = [];
    }
    if(-1 !== obj.account.object.device.indexOf(fingerprint)) {
        return;
    }
    const new_obj = JSON.parse(JSON.stringify(obj.account.object));
    new_obj.device.push(fingerprint);
    await set_new_record({
        signed: await pgp.clearsign(obj.account.fingerprint, JSON.stringify(new_obj)),
        pubkey: await pgp.pubkey(obj.account.fingerprint)
    });
    setImmediate(()=>publish(new_obj.device));
}

async function remove_device (fingerprint) {
    fingerprint = fingerprint.toUpperCase();
    if(!(obj.account.object.device instanceof Array)) {
        obj.account.object.device = [];
    }
    if(-1 === obj.account.object.device.indexOf(fingerprint)) {
        return;
    }
    const new_obj = JSON.parse(JSON.stringify(obj.account.object));
    new_obj.device.splice(new_obj.device.indexOf(fingerprint), 1);
    const devices = JSON.parse(JSON.stringify(obj.account.object.device));
    await set_new_record({
        signed: await pgp.clearsign(fingerprint, JSON.stringify(new_obj)),
        pubkey: await pgp.pubkey(fingerprint)
    });
    setImmediate(()=>publish(devices));
}

async function handle_new_record (r) {
    if(typeof r !== 'object' || typeof r.pubkey !== 'string' || typeof r.signed !== 'string')
    {
        throw new Error('格式错误，拒绝处理');
    }

    await set_new_record(r);
}

async function init () {

    // 加载本机account信息
    obj.account = (await runtime.kv.get('account')) || {fingerprint: null, record: null, object: null};

    await request.init();

    rpc.regist('third.account.record', handle_new_record);

    // 自动拉取和发布本机ticket
    setImmediate(fetch_and_publish);
    setTimeout(fetch_and_publish, 1000 * 60 * 5);
}

module.exports = {
    init,
    lookup: pgp.lookup,
    login,
    logout,
    device: {
        remove: remove_device,
        add   : add_device,
        /**
         * @returns {Array.<string>}
         */
        list () {
            return (obj.account.object ? obj.account.object.device : []) || [];
        }
    },
    request: {
        list  : request.list,
        remove: request.remove
    },
    get fingerprint () {
        return obj.account.fingerprint || '';
    },
    status,
    get record () {
        return obj.account.record ? kns.merge(obj.account.record) : undefined;
    },
    have_prikey: pgp.have_prikey,
};