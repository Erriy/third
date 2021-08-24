const rpc = require('../rpc');
const pgp = require('./pgp');
const kns = require('../kns');
const runtime = require('../runtime');
const request = require('./request');

const obj = {
    fingerprint: null,
    get handler () {
        return obj.fingerprint === device_account.fingerprint ? device_account : account;
    }
};

/**
 * 推荐使用的账户信息处理方法
 */
class account {

    static obj = {
        fingerprint: null,
        /**
         * @type {{fingerprint: string, expire: number, created: number, text: string, pubkey:string, signature: string, provider: boolean}}
         */
        record     : null,
        object     : null,
    }

    static async publish (devices = []) {
        const record = this.record;
        if(!record) return;

        const promise_list = [];

        const this_dev_fpr = runtime.key.getFingerprint().toUpperCase();
        // 推送到其他受影响客户端
        for(let df of devices) {
            if(df === this_dev_fpr) continue;
            promise_list.push((async ()=>{
                try {
                    await rpc.invoke(df, 'third.account.record', record);
                }
                // todo 只忽略连接失败的错误
                catch(e) {}
            })());
        }

        // 推送到kns provider
        promise_list.push((async ()=>{
            try {
                await kns.publish(record);
            }
            catch (err) {}
        })());

        await Promise.all(promise_list);
    }

    static async fetch () {
        // 如果本机账户信息未设置，则直接返回
        if(!this.obj.fingerprint) return;
        // 拉取新数据
        const r = await kns.get(this.obj.fingerprint, {discover: true, refresh: true});
        // 未拉取到新的数据
        if(!r) return;
        // 本机比拉取到的更新直接返回
        if(this.obj.record && r.created <= this.obj.record.created) return;
        await this.set_new_record(r);
    }

    static async fetch_and_publish () {
        await this.fetch();
        await this.publish();
    }

    static async set_new_record (record) {
        const r = record.signed ? await kns.analysis(record) : record;
        if(this.obj.fingerprint !== r.fingerprint) {
            throw new Error('非本机登录账户，拒绝更新record');
        }

        const ro = JSON.parse(r.text);
        // 本机被新的踢出
        if(!(ro.device instanceof Array)
        || -1 === ro.device.indexOf(runtime.key.getFingerprint().toUpperCase())) {
            this.logout();
        }
        else {
            if(this.obj.object) {
                const union_size = new Set([... ro.device, ...this.obj.object.device]).size;
                // 通知设备变动
                if(union_size !== ro.device.length || union_size !== this.obj.object.device.length) {
                    runtime.emit('account.device.change');
                }
            }
            this.obj.record = r;
            this.obj.object = ro;
        }
        // 保存新的账户信息
        await runtime.kv.set('account.record', this.obj.record);
        // 下次消息循环调用，防止循环调用爆栈（虽然不太可能爆栈）
        setImmediate(this.fetch_and_publish);
    }

    static async init () {
        this.obj.record = await runtime.kv.get('account.record');
        if(this.obj.record) {
            this.obj.object = JSON.parse(this.obj.record.text);
        }
        this.obj.fingerprint = obj.fingerprint;
    }

    static async login (fingerprint) {
        this.obj.fingerprint = fingerprint;
        obj.fingerprint = fingerprint;
        console.log('login', fingerprint, this.obj.fingerprint);
        await runtime.kv.set('account.fingerprint', obj.fingerprint);
        // 发布新的record
        kns.record.belong = fingerprint;
        setImmediate(kns.publish);
        // 查询是否有旧的历史记录
        const old_record = await kns.get(fingerprint, {discover: true});
        const rec_obj = old_record ? JSON.parse(old_record.text) : {};
        const thisfpr = runtime.key.getFingerprint().toUpperCase();
        rec_obj.device = rec_obj.device || [];
        // 已登录过
        if(-1 !== rec_obj.device.indexOf(thisfpr)) {
            await this.set_new_record(kns.merge(old_record));
            runtime.emit('account.login.success');
            setImmediate(async ()=>await this.publish(rec_obj.device));
            return true;
        }
        // 本地有签发能力
        else if(await pgp.have_prikey(fingerprint)) {
            rec_obj.device = rec_obj.device || [];
            rec_obj.device.push(thisfpr);
            rec_obj.device = Array.from(new Set(rec_obj.device));
            await this.set_new_record({
                signed: await pgp.clearsign(fingerprint, JSON.stringify(rec_obj)),
                pubkey: await pgp.pubkey(fingerprint)
            });
            runtime.emit('account.login.success');
            setImmediate(async ()=>await this.publish(rec_obj.device));
            return true;
        }
        // 本地无签发能力
        else {
            await request.send([...rec_obj.device, fingerprint] );
            runtime.emit('account.login.request');
            return false;
        }
    }

    static async logout () {
        this.obj.fingerprint = null;
        this.obj.object = null;
        this.obj.record = null;
        obj.fingerprint = device_account.fingerprint;
        // 发布新的record
        kns.record.belong = device_account.fingerprint;
        setImmediate(kns.publish);
        await runtime.kv.set('account.fingerprint', obj.fingerprint);
        // todo 切换为本地设备key
        runtime.emit('account.change');
    }

    static async add_device (fingerprint) {
        fingerprint = fingerprint.toUpperCase();
        if(!(this.obj.object.device instanceof Array)) {
            this.obj.object.device = [];
        }
        if(-1 !== this.obj.object.device.indexOf(fingerprint)) {
            return;
        }
        const new_obj = JSON.parse(JSON.stringify(this.obj.object));
        new_obj.device.push(fingerprint);
        await this.set_new_record({
            signed: await pgp.clearsign(this.obj.fingerprint, JSON.stringify(new_obj)),
            pubkey: await pgp.pubkey(this.obj.fingerprint)
        });
        setImmediate(async ()=>await this.publish(new_obj.device));
    }

    /**
     *
     * @param {string} fingerprint
     * @returns {boolean}
     */
    static has_device (fingerprint) {
        return fingerprint === this.obj.fingerprint
        || (this.obj.object
            && this.obj.object.device instanceof Array
            && -1 !== this.obj.object.device.indexOf(fingerprint.toUpperCase()));
    }

    static async remove_device (fingerprint) {
        fingerprint = fingerprint.toUpperCase();
        if(!(this.obj.object.device instanceof Array)) {
            this.obj.object.device = [];
        }
        if(-1 === this.obj.object.device.indexOf(fingerprint)) {
            return;
        }
        const new_obj = JSON.parse(JSON.stringify(this.obj.object));
        new_obj.device.splice(new_obj.device.indexOf(fingerprint), 1);
        const devices = JSON.parse(JSON.stringify(this.obj.object.device));
        await this.set_new_record({
            signed: await pgp.clearsign(this.obj.fingerprint, JSON.stringify(new_obj)),
            pubkey: await pgp.pubkey(this.obj.fingerprint)
        });
        setImmediate(async ()=>await this.publish(devices));
    }

    static get device () {
        const that = this;
        return {
            has (fpr){return that.has_device(fpr);},
            remove: that.remove_device,
            add   : that.add_device,
            list () {
                return (that.obj.object ? that.obj.object.device : []) || [];
            }
        };
    }

    static get fingerprint () {
        return this.obj.fingerprint;
    }

    static get status () {
        const that = this;
        return {
            /**
             * 是否已登录
             * @returns {boolean}
             */
            get login () {
                return that.fingerprint && that.obj.object && that.obj.record;
            },
            /**
             * 是否等待登录确认
             * @returns {boolean}
             */
            get wait () {
                return that.fingerprint && !that.obj.object && !that.obj.record;
            }
        };
    }

    static get record () {
        return this.obj.record ? kns.merge(this.obj.record) : null;
    }

    static async have_prikey () {
        return await pgp.have_prikey(this.fingerprint);
    }

    static async handle_new_record (r) {
        if(typeof r !== 'object' || typeof r.pubkey !== 'string' || typeof r.signed !== 'string')
        {
            throw new Error('格式错误，拒绝处理');
        }

        const before = this.status.wait;

        await this.set_new_record(r);
        if (before && this.status.login) {
            runtime.emit('account.login.allowed');
        }
    }
}

/**
 * 把设备的key当作账户使用，**不推荐使用，但是方便普通用户使用**
 */
class device_account extends account {

    static obj = {
        record: null,
    }

    static async fetch () {}

    static async fetch_and_publish () {
        await this.publish();
    }

    static async logout () {}

    static async init () {
        runtime.on('kns.record.refresh', async ()=>{
            this.obj.record = await kns.record.valueOf();
        });
    }

    static get device () {
        const that = this;
        return {
            add: async (fpr)=>{
                kns.record.device.add(fpr);
                that.obj.record = await kns.record.valueOf();
                setImmediate(async ()=>await this.publish(kns.record.device.list()));
                runtime.emit('account.record.refresh');
            },
            remove: async (fpr)=>{
                const old_device = JSON.parse(JSON.stringify(kns.record.device.list()));
                kns.record.device.remove(fpr);
                that.obj.record = await kns.record.valueOf();
                setImmediate(async ()=>await this.publish(old_device));
                runtime.emit('account.record.refresh');
            },
            has : kns.record.device.has,
            list: ()=>{
                const l = kns.record.device.list();
                if(-1 === l.indexOf(that.fingerprint)){
                    l.push(that.fingerprint);
                }
                return l;
            }
        };
    }

    static get fingerprint () {
        return runtime.key.getFingerprint().toUpperCase();
    }

    static get status () {
        return {
            login: true,
            wait : false,
        };
    }

    static get record () {
        return this.obj.record || null;
    }

    static async have_prikey () {
        return true;
    }

    static async handle_new_record () {}
}

async function init () {

    // 加载本机account信息
    obj.fingerprint = (await runtime.kv.get('account.fingerprint')) || device_account.fingerprint;
    await account.init();
    await device_account.init();

    // 初始化登录请求模块
    await request.init();

    // 刷新record
    rpc.regist('third.account.record', async (r)=>{
        return await obj.handler.handle_new_record(r);
    });

    // 自动拉取和发布本机ticket
    const fetch_and_publish = async ()=> await obj.handler.fetch_and_publish();
    setImmediate(fetch_and_publish);
    setTimeout(fetch_and_publish, 1000 * 60 * 5);
}

module.exports = {
    init,
    lookup: pgp.lookup,
    async login (fpr){
        return await obj.handler.login(fpr);
    },
    async logout () {
        return await obj.handler.logout();
    },
    device: {
        async remove (fpr){
            await obj.handler.device.remove(fpr);
        },
        async add (fpr) {
            await obj.handler.device.add(fpr);
        },
        has (fpr) {
            return obj.handler.device.has(fpr);
        },
        /**
         * @returns {Array.<string>}
         */
        list () {
            return obj.handler.device.list();
        }
    },
    request: {
        list  : request.list,
        remove: request.remove
    },
    get fingerprint () {
        return obj.handler.fingerprint;
    },
    get status () {
        return obj.handler.status;
    },
    get record () {
        return obj.handler.record;
    },
    async have_prikey () {
        return await obj.handler.have_prikey();
    },
};