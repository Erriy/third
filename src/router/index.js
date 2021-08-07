const Vue = require('vue').default;
const VueRouter = require('vue-router').default;
const login = require('../views/login.vue').default;
const dashboard = require('../views/dashboard.vue').default;

Vue.use(VueRouter);

const routes = [
    {
        path     : '/',
        component: dashboard,
    },
    {
        path     : '/login',
        component: login
    },
    {
        path     : '/dashboard',
        component: dashboard,
    }
];

const router = new VueRouter({
    routes
});

module.exports = router;