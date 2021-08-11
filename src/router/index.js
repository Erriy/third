const Vue = require('vue').default;
const VueRouter = require('vue-router').default;
const login = require('../views/login.vue').default;

Vue.use(VueRouter);

const routes = [
    {
        path     : '/',
        component: login,
    },
    {
        path     : '/login',
        component: login
    },
];

const router = new VueRouter({
    routes
});

module.exports = router;