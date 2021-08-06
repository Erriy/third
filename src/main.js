const Vue = require('vue').default;
const App = require('./App.vue').default;
const router = require('./router');
const Antd = require('ant-design-vue').default;
require('ant-design-vue/dist/antd.css');
const api = require('./api');

Vue.config.productionTip = false;
Vue.use(Antd);
Vue.use(api);

new Vue({
    router,
    render: function (h) { return h(App); }
}).$mount('#app');