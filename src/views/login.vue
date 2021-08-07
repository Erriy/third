<template>
    <div>
        test
    </div>
</template>

<script>
export default {

    async mounted() {
        const fprs = await this.$api.account.lookup('77777777');
        // await this.$api.account.login(fprs[0]);
        console.log(await this.$api.account.device.list());
    }
}
</script>

<style>

</style>