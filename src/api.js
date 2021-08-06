const {ipcRenderer} = window.require('electron');

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
        Vue.prototype.$api = new Proxy({}, module_handler);
    }
};
