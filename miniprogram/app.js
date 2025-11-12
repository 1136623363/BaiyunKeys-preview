"use strict";
// app.ts
App({
    globalData: {},
    onLaunch() {
        const wxAny = wx;
        const logDeviceId = (source) => {
            const uuid = (source && source.deviceId)
                || (source && source.uuid)
                || (source && source.identifier)
                || (source && source.deviceIdWithOutEncrypt)
                || (source && source.model)
                || '未知';
            console.log('[Device] UUID:', uuid);
        };
        const handleError = (err) => {
            const message = err && err.errMsg ? err.errMsg : err;
            console.warn('[Device] 获取 UUID 失败', message);
        };
        if (typeof wxAny.getDeviceInfo === 'function') {
            try {
                const direct = wxAny.getDeviceInfo();
                if (direct) {
                    logDeviceId(direct);
                    return;
                }
            }
            catch (syncErr) {
                console.debug('[Device] 同步 getDeviceInfo 不支持，尝试回调形式', syncErr);
            }
            wxAny.getDeviceInfo({
                success: logDeviceId,
                fail: handleError
            });
            return;
        }
        try {
            const baseInfo = typeof wxAny.getAppBaseInfo === 'function' ? wxAny.getAppBaseInfo() : null;
            if (baseInfo) {
                logDeviceId(baseInfo);
                return;
            }
        }
        catch (err) {
            console.warn('[Device] getAppBaseInfo 不可用', err);
        }
        console.warn('[Device] 无法获取 UUID');
    }
});
