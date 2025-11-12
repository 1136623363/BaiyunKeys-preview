"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
exports.fetchEntranceGuardList = fetchEntranceGuardList;
exports.logout = logout;
const BASE_URL = 'https://www.pinganbaiyun.cn';
const BASE_HEADERS = {
    Host: 'www.pinganbaiyun.cn',
    'Content-Type': 'application/json',
    Connection: 'keep-alive',
    Accept: '*/*',
    'Accept-Language': 'zh-Hans-US;q=1, en-US;q=0.9'
};
function extractSystemVersion(raw, fallback) {
    if (typeof raw !== 'string' || !raw) {
        return fallback;
    }
    const parts = raw.split(' ');
    return parts.length > 1 ? parts[1] : parts[0] || fallback;
}
function parseEntranceGuardResponse(response) {
    if (Array.isArray(response)) {
        for (const item of response) {
            if (item && Array.isArray(item.data_list) && item.data_list.length) {
                return item.data_list;
            }
        }
        return [];
    }
    if (response && typeof response === 'object') {
        const payload = response;
        if (payload.state === true && payload.code === '0000') {
            return Array.isArray(payload.obj) ? payload.obj : [];
        }
        throw new Error(payload.msg || '获取门禁列表失败');
    }
    return [];
}
function request(options) {
    const { path, method = 'POST', data, header } = options;
    return new Promise((resolve, reject) => {
        wx.request({
            url: `${BASE_URL}${path}`,
            method,
            data,
            header: { ...BASE_HEADERS, ...header },
            dataType: 'json',
            success: (res) => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`请求失败：HTTP ${res.statusCode}`));
                    return;
                }
                let payload = null;
                const raw = res.data;
                if (raw && typeof raw === 'object') {
                    payload = raw;
                }
                else if (typeof raw === 'string') {
                    try {
                        payload = JSON.parse(raw);
                    }
                    catch (err) {
                        reject(new Error('返回数据解析失败'));
                        return;
                    }
                }
                if (!payload) {
                    reject(new Error('返回数据为空'));
                    return;
                }
                resolve(payload);
            },
            fail: (err) => {
                reject(new Error(err.errMsg || '网络请求失败'));
            }
        });
    });
}
function createDeviceProfile() {
    const defaults = {
        brand: 'Apple',
        model: 'iPhone15,3',
        osVersion: '26.0'
    };
    return defaults;
}
function buildLoginPayload(phone, idcardNo) {
    const profile = createDeviceProfile();
    const trimmedPhone = (phone || '').trim();
    const normalizedPhone = trimmedPhone ? trimmedPhone : '17777777777'; // 默认手机号，避免接口报错                
    return {
        sex: 0,
        idcardNo,
        deviceInfo: {
            osVersion: profile.osVersion,
            wifiMac: '02:00:00:00:00:00',
            brand: profile.brand,
            os: 0,
            udid: '00000000-0000-0000-0000-000000000000', 
            appVersion: '1.3.6',
            imsi: '46015',
            model: profile.model
        },
        faceUploadCount: 0,
        isreal: 0,
        age: 0,
        appVersion: '1.3.6',
        phone: normalizedPhone
    };
}
async function login(phone, idcardNo) {
    const payload = buildLoginPayload(phone, idcardNo);
    const response = await request({
        path: '/baiyunuser/account/login/v1',
        method: 'POST',
        data: payload
    });
    if (!response.state || response.code !== '0000') {
        throw new Error(response.msg || '登录失败');
    }
    const token = response.extension || '';
    const loginUser = response && response.obj && response.obj.id ? response.obj.id : '';
    if (!token || !loginUser) {
        throw new Error('登录返回数据缺失，请稍后重试');
    }
    return { token, loginUser, phone: payload.phone };
}
async function fetchEntranceGuardList(auth) {
    const response = await request({
        path: '/baiyunuser/entranceguard/getList',
        method: 'POST',
        data: {
            pageNum: 0,
            pages: 0,
            pageSize: 0
        },
        header: {
            TOKEN: auth.token,
            LOGIN_USER: auth.loginUser
        }
    });
    return parseEntranceGuardResponse(response);
}
async function logout(auth) {
    try {
        await request({
            path: '/baiyunuser/account/loginOut',
            method: 'POST',
            data: { phone: auth.phone },
            header: {
                TOKEN: auth.token,
                LOGIN_USER: auth.loginUser
            }
        });
    }
    catch (err) {
        console.warn('[api] 退出登录失败', err);
    }
}
