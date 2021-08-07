<template>
    <div>
        <div v-if="account.info.fingerprint">
            <h4>已登录指纹</h4>
            {{account.info.fingerprint.replace(/(.{4})/g, '$1 ')}}
            <br>
            账户下设备:
            <div
                v-for="fpr, i in account.info.object.device"
                :key = i
            >
                {{fpr}}
            </div>
            <h4>账号下设备列表</h4>
            <a-table title="账号下设备" :columns="columns" :data-source="data" size="small" />
        </div>
    </div>
</template>

<script>
export default {
    data() {
        return {
            account: {
                info: {}
            }
        }
    },
    async mounted() {
        this.account.info = await this.$api.account.info();
        if(!this.account.info.fingerprint) {
            return this.$router.go('/login');
        }
    }
}
</script>

<style>

</style>