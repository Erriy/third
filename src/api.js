const {ipcRenderer} = window.require('electron');

const proxy = {
    get (target, key) {
        if(key !== '__channel__' && undefined === target[key]) {
            const f = function (...args) {
                const real_channel = this.__channel__ ? this.__channel__ + '.' + key : key;
                return ipcRenderer.invoke(real_channel, ...args);
            };

            f.__channel__ = target.__channel__ ? target.__channel__ + '.' + key : key;
            target[key] = new Proxy(f, this);
        }
        return target[key];
    },
};

const method_handler = {
    get (target, key) {
        if(undefined === target[key]) {
            target[key] = (...args)=>(ipcRenderer.invoke(
                `${target.__module_name__}.${key}`, ...args
            ));
        }
        return target[key];
    }
};

const module_handler = {
    get (target, key) {
        if(undefined === target[key]) {
            target[key] = new Proxy({__module_name__: key}, method_handler);
        }
        return target[key];
    }
};

module.exports = {
    install (Vue) {
        Vue.prototype.$api = new Proxy({}, proxy);
    }
};
