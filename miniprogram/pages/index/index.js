"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lockBiz_1 = require("../../utils/lockBiz");
const bleProtocol_1 = require("../../utils/bleProtocol");
const config_1 = require("../../utils/config");
const configView_1 = require("../../utils/configView");
const SERVICE_CANDIDATES = [
    '0734594a-a8e7-4b1a-a6b1-cd5243059a57',
    '14839ac4-7d7e-415c-9a42-167340cf2339'
];
const DISCOVERY_TIMEOUT = 10000;
const READ_TIMEOUT = 5000;
const USER_ACK_TIMEOUT = 3500;
const FLOW_TIMEOUT = 45000;
const PREWARM_SCAN_DURATION = 600;
const LAST_DEVICE_STORAGE_KEY = 'lastDoorDeviceMap';
let quickUnlockSessionUsed = false;
function callWx(fn, options = {}) {
    return new Promise((resolve, reject) => {
        try {
            fn({
                ...options,
                success: (res) => resolve(res),
                fail: (err) => reject(err)
            });
        }
        catch (error) {
            reject(error);
        }
    });
}
function pad(num) {
    return num.toString().padStart(2, '0');
}
function normalizeMacForCompare(mac) {
    return mac.replace(/[^0-9A-F]/g, '').toUpperCase();
}
function readDeviceCache() {
    try {
        const raw = wx.getStorageSync(LAST_DEVICE_STORAGE_KEY);
        if (raw && typeof raw === 'object') {
            return { ...raw };
        }
    }
    catch (err) {
        console.warn('[BLE] 读取缓存设备信息失败', err);
    }
    return {};
}
function writeDeviceCache(map) {
    try {
        wx.setStorageSync(LAST_DEVICE_STORAGE_KEY, map);
    }
    catch (err) {
        console.warn('[BLE] 写入缓存设备信息失败', err);
    }
}
function getDoorCacheKey(config) {
    if (config && config.id) {
        return `id:${config.id}`;
    }
    const mac = config && typeof config.mac === 'string' ? config.mac.trim() : '';
    if (mac) {
        return `mac:${normalizeMacForCompare(mac)}`;
    }
    return '';
}
function readCachedDeviceId(config) {
    const key = getDoorCacheKey(config);
    if (!key) {
        return null;
    }
    const map = readDeviceCache();
    return typeof map[key] === 'string' ? map[key] : null;
}
function cacheDeviceId(config, deviceId) {
    const key = getDoorCacheKey(config);
    if (!key || !deviceId) {
        return;
    }
    const map = readDeviceCache();
    map[key] = deviceId;
    writeDeviceCache(map);
}
function removeCachedDeviceId(config) {
    const key = getDoorCacheKey(config);
    if (!key) {
        return;
    }
    const map = readDeviceCache();
    if (map[key]) {
        delete map[key];
        writeDeviceCache(map);
    }
}
function deriveHeaderFromMac(mac) {
    const segments = mac.toUpperCase().split(':').filter(Boolean);
    if (segments.length === 6) {
        return segments.slice(2).map((segment) => parseInt(segment, 16));
    }
    const compact = mac.replace(/[^0-9A-F]/gi, '').toUpperCase();
    if (compact.length === 12) {
        const bytes = [];
        for (let i = 0; i < 12; i += 2) {
            bytes.push(parseInt(compact.substr(i, 2), 16));
        }
        return bytes.slice(2);
    }
    throw new Error('MAC 地址格式不合法，无法生成握手标识');
}
function reverseMacHex(mac) {
    const pairs = [];
    for (let i = mac.length; i > 0; i -= 2) {
        pairs.push(mac.substring(i - 2, i));
    }
    return pairs.join('');
}
function asciiToHex(text) {
    return Array.from(text)
        .map((char) => char.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}
function createBleState() {
    return {
        handshakeSent: false,
        handshakeOk: false,
        randomSeedHex: '',
        commKeyRequested: false,
        communicateBuffer: '',
        timeSyncBuffer: '',
        cardSyncBuffer: '',
        tempCommKey: '',
        openAckHandled: false
    };
}
function updateBleState(page, patch) {
    const current = page && page.data && page.data.ble ? page.data.ble : (createBleState());
    const next = { ...current, ...patch };
    page.setData({ ble: next });
    return next;
}
function resolvePlatformInfo() {
    const wxAny = wx;
    const readers = [
        () => (typeof wxAny.getAppBaseInfo === 'function' ? wxAny.getAppBaseInfo() : null),
        () => (typeof wxAny.getDeviceInfo === 'function' ? wxAny.getDeviceInfo() : null),
        () => (typeof wxAny.getWindowInfo === 'function' ? wxAny.getWindowInfo() : null)
    ];
    for (const reader of readers) {
        try {
            const info = reader();
            const platform = info && typeof info.platform === 'string' ? info.platform.trim() : '';
            if (platform) {
                const lower = platform.toLowerCase();
                return { platform: lower, isDevtools: lower === 'devtools' };
            }
        }
        catch (err) {
            console.debug('[index] 读取平台信息失败', err);
        }
    }
    return { platform: '', isDevtools: false };
}
Page({
    data: {
        form: (0, configView_1.normalizeConfigForForm)(config_1.DEFAULT_CONFIG),
        state: {
            loading: false,
            message: ''
        },
        canSubmit: false,
        logs: [],
        consoleSync: false,
        configs: [],
        configNames: [],
        configOptions: [],
        selectedConfigIndex: 0,
        selectorOpen: false,
        ble: createBleState(),
        isIOS: false,
        quickUnlockEnabled: false,
        disclaimerVisible: false,
        disclaimerCountdown: 0
    },
    onShow() {
        const self = this;
        self._quickUnlockTriggered = quickUnlockSessionUsed;
        this.refreshConfig();
        if (this.data.disclaimerVisible && this.data.disclaimerCountdown > 0 && !this._disclaimerTimer) {
            this.startDisclaimerCountdown();
        }
    },
    showDisclaimer() {
        this.clearDisclaimerTimer();
        this.setData({ disclaimerVisible: true, disclaimerCountdown: 10 });
        this.startDisclaimerCountdown();
    },
    startDisclaimerCountdown() {
        const tick = () => {
            const current = this.data.disclaimerCountdown;
            if (current <= 1) {
                this.setData({ disclaimerCountdown: 0 });
                this.clearDisclaimerTimer();
                return;
            }
            this.setData({ disclaimerCountdown: current - 1 });
        };
        const timer = setInterval(tick, 1000);
        this._disclaimerTimer = timer;
    },
    clearDisclaimerTimer() {
        const timer = this._disclaimerTimer;
        if (typeof timer === 'number') {
            clearInterval(timer);
            this._disclaimerTimer = undefined;
        }
    },
    onDisclaimerConfirm() {
        if (this.data.disclaimerCountdown > 0) {
            return;
        }
        this.clearDisclaimerTimer();
        wx.setStorageSync('globalDisclaimerAccepted', true);
        wx.setStorageSync('guideDisclaimerAccepted', true);
        this.setData({ disclaimerVisible: false }, () => {
            wx.switchTab?.({
                url: '/pages/guide/index',
                fail: () => {
                    wx.navigateTo({
                        url: '/pages/guide/index',
                        fail: () => {
                            wx.showToast({ title: '请从菜单进入帮助页', icon: 'none' });
                        }
                    });
                }
            });
        });
    },
    noop() { },
    onHide() {
        this.clearDisclaimerTimer();
    },
    async processBleNotification(hex, buffer) {
        const self = this;
        const bleState = (this.data.ble || createBleState());
        const header = hex.slice(0, 2).toUpperCase();
        const command = hex.length >= 6 ? hex.substr(4, 2).toUpperCase() : '';
        const tail = hex.slice(-2).toUpperCase();
        const type = hex.length >= 20 ? hex.substr(18, 2).toUpperCase() : '';
        const resolveAck = (payload = buffer) => {
            if (self._ackResolve) {
                const resolver = self._ackResolve;
                self._ackResolve = null;
                self._stage = 'idle';
                resolver(payload);
            }
        };
        if (header !== 'A5') {
            return;
        }
        if (command === '04') {
            this.clearAckTimer();
            const payloadLength = hex.length;
            const statusField = hex.substr(14, 4);
            const statusWord = `${statusField.substr(2, 2)}${statusField.substr(0, 2)}`.toUpperCase();
            const isHandshakeSuccess = payloadLength > 24;
            if (!isHandshakeSuccess) {
                const hint = statusWord === '000B' ? '（密钥或 SN 可能不匹配，设备拒绝握手）' : '';
                resolveAck(null);
                this.finalizeBleFlow(false, `握手失败，设备返回码 0x${statusWord}${hint}`);
                return;
            }
            updateBleState(this, { handshakeOk: true, handshakeSent: false });
            this.addLog('握手成功，已发送开锁指令');
            resolveAck(buffer);
            this.finalizeBleFlow(true, '握手成功，等待门锁执行');
            return;
        }
        if (command === '08') {
            resolveAck(null);
            const codeWord = hex.slice(-6, -2).toUpperCase();
            const hint = codeWord === 'E36F' ? '（门锁拒绝协商，通常是密钥或授权信息不匹配）' : '';
            this.finalizeBleFlow(false, `通讯密钥协商失败，设备返回码 0x${codeWord}${hint}`);
            return;
        }
        if (type === '87' && tail === '5A') {
            const result = (0, bleProtocol_1.decodeOpenResult)(hex, this.data.form.key);
            resolveAck(buffer);
            const success = result.code === '00' || result.code === '02';
            this.finalizeBleFlow(success, result.message);
            return;
        }
        if (!bleState.handshakeOk) {
            if (command === '04' && tail === '5A') {
                const codeHigh = hex.slice(-4, -2);
                const codeLow = hex.slice(-6, -4);
                const codeWord = `${codeHigh}${codeLow}`;
                this.finalizeBleFlow(false, `握手失败，设备返回 0x${codeWord}`);
                return;
            }
            return;
        }
        if (type === '89') {
            updateBleState(this, { communicateBuffer: hex });
            this.addLog('设备开始下发通讯密钥片段');
            return;
        }
        if (type === '86') {
            updateBleState(this, { timeSyncBuffer: hex });
            this.addLog('设备返回时间同步片段');
            return;
        }
        if (type === '82') {
            updateBleState(this, { cardSyncBuffer: hex });
            this.addLog('设备返回黑名单同步片段');
            return;
        }
        if (tail === '5A' && bleState.communicateBuffer) {
            const concatBuffer = `${bleState.communicateBuffer}${hex}`;
            const bodyHex = concatBuffer.substr(24, 32);
            const tempKey = (0, bleProtocol_1.decryptCommKey)(bodyHex, this.data.form.key);
            if (tempKey) {
                updateBleState(this, {
                    tempCommKey: tempKey,
                    communicateBuffer: ''
                });
                this.addLog('通信密钥协商成功');
            }
            else {
                updateBleState(this, { communicateBuffer: concatBuffer });
            }
            return;
        }
        if (tail === '5A' && bleState.timeSyncBuffer && bleState.tempCommKey) {
            const concatBuffer = `${bleState.timeSyncBuffer}${hex}`;
            const bodyHex = concatBuffer.substr(24, 16);
            const resultHex = (0, bleProtocol_1.decryptWithSessionKey)(bodyHex, bleState.tempCommKey);
            if (resultHex === '0000000000000000') {
                this.addLog('门锁时间同步成功');
                updateBleState(this, { timeSyncBuffer: '' });
                this.startAckTimer('时间同步完成，等待门锁最终回执...');
            }
            else {
                updateBleState(this, { timeSyncBuffer: concatBuffer });
            }
            return;
        }
    },
    onLoad() {
        const self = this;
        self._stage = 'idle';
        self._valueChangeHandler = this.handleValueChange.bind(this);
        wx.onBLECharacteristicValueChange(self._valueChangeHandler);
        const platformInfo = resolvePlatformInfo();
        self._isDevtools = platformInfo.isDevtools;
        if (platformInfo.platform) {
            this.setData({ isIOS: platformInfo.platform === 'ios' });
        }
        else {
            this.setData({ isIOS: false });
        }
        this.setData({
            canSubmit: this.canSubmitForm()
        });
        wx.showShareMenu({
            menus: ['shareAppMessage', 'shareTimeline']
        });
        const acceptedDisclaimer = wx.getStorageSync('globalDisclaimerAccepted') || wx.getStorageSync('guideDisclaimerAccepted');
        if (!acceptedDisclaimer) {
            this.showDisclaimer();
        }
        else {
            this.setData({ disclaimerVisible: false, disclaimerCountdown: 0 });
        }
    },
    onShareAppMessage() {
        return {
            title: 'BaiyunKeys',
            path: '/pages/index/index'
        };
    },
    onShareTimeline() {
        return {
            title: 'BaiyunKeys'
        };
    },
    async onUnload() {
        const self = this;
        this.clearDisclaimerTimer();
        if (self._valueChangeHandler) {
            wx.offBLECharacteristicValueChange();
            self._valueChangeHandler = null;
        }
        this.clearQuickUnlockTimer();
        await this.cleanupBluetooth();
    },
    onMacInput(event) {
        const value = (0, lockBiz_1.sanitizeMacInput)(event.detail.value || '');
        this.setData({
            'form.mac': value,
            canSubmit: this.canSubmitForm()
        });
    },
    onKeyInput(event) {
        const value = (0, lockBiz_1.sanitizeKey)(event.detail.value || '');
        this.setData({
            'form.key': value,
            canSubmit: this.canSubmitForm()
        });
    },
    onBluetoothNameInput(event) {
        const value = (event.detail.value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
        this.setData({
            'form.bluetoothName': value,
            canSubmit: this.canSubmitForm()
        });
    },
    toggleConfigSelector() {
        const list = this.data.configs;
        if (!list.length) {
            wx.showToast({ title: '请先在配置页新增门禁', icon: 'none' });
            return;
        }
        this.setData({ selectorOpen: !this.data.selectorOpen });
    },
    onSelectConfig(event) {
        const id = event.currentTarget.dataset.id;
        if (!id) {
            this.setData({ selectorOpen: false });
            return;
        }
        const active = (0, config_1.setActiveDoorConfig)(id);
        const list = (0, config_1.readDoorConfigList)();
        this.applyConfigState(active, list);
    },
    canSubmitForm(targetForm) {
        const form = targetForm || this.data.form;
        const { mac, key, bluetoothName } = form;
        if (!(0, lockBiz_1.isValidMac)(mac) || !(0, lockBiz_1.isValidKey)(key)) {
            return false;
        }
        if (this.data.isIOS) {
            return !!bluetoothName;
        }
        return true;
    },
    applyConfigState(active, list) {
        const form = (0, configView_1.normalizeConfigForForm)(active);
        const logEnabled = (0, config_1.readLogPreference)();
        const quickUnlockEnabled = (0, config_1.readQuickUnlockPreference)();
        const nextForm = { ...form, logEnabled };
        const { configs, configNames, configOptions, selectedConfigIndex } = (0, configView_1.buildConfigCollections)(list, nextForm.id || null);
        const payload = {
            configs,
            configNames,
            configOptions,
            selectedConfigIndex,
            selectorOpen: false,
            form: nextForm,
            canSubmit: this.canSubmitForm(nextForm),
            consoleSync: logEnabled,
            quickUnlockEnabled
        };
        if (!logEnabled) {
            payload.logs = [];
            payload['state.message'] = '';
        }
        this.setData(payload);
        this.scheduleQuickUnlock();
    },
    refreshConfig() {
        const list = (0, config_1.readDoorConfigList)();
        const stored = (0, config_1.readDoorConfig)();
        this.applyConfigState(stored, list);
    },
    scheduleQuickUnlock() {
        const self = this;
        if (!this.data.quickUnlockEnabled) {
            this.clearQuickUnlockTimer();
            return;
        }
        if (quickUnlockSessionUsed || self._quickUnlockTriggered) {
            return;
        }
        this.clearQuickUnlockTimer();
        this.tryPrewarmQuickUnlock().catch(() => undefined);
        self._quickUnlockTimer = setTimeout(() => {
            self._quickUnlockTimer = null;
            this.triggerQuickUnlock();
        }, 400);
    },
    async tryPrewarmQuickUnlock() {
        const self = this;
        if (self._prewarmPromise || !this.data.quickUnlockEnabled || quickUnlockSessionUsed || self._quickUnlockTriggered) {
            return self._prewarmPromise;
        }
        self._prewarmPromise = (async () => {
            try {
                await callWx(wx.openBluetoothAdapter, {});
                await callWx(wx.startBluetoothDevicesDiscovery, {
                    allowDuplicatesKey: false,
                    interval: 0,
                    powerLevel: 'low',
                    services: SERVICE_CANDIDATES
                });
                await new Promise((resolve) => setTimeout(resolve, PREWARM_SCAN_DURATION));
            }
            catch (error) {
                const message = error && typeof error.errMsg === 'string' ? error.errMsg : error;
                console.debug('[BLE] 预热快速开锁失败', message);
            }
            finally {
                await callWx(wx.stopBluetoothDevicesDiscovery, {}).catch(() => undefined);
            }
        })().finally(() => {
            self._prewarmPromise = null;
        });
        return self._prewarmPromise;
    },
    clearQuickUnlockTimer() {
        const self = this;
        if (self._quickUnlockTimer) {
            clearTimeout(self._quickUnlockTimer);
            self._quickUnlockTimer = null;
        }
    },
    triggerQuickUnlock() {
        const self = this;
        if (!this.data.quickUnlockEnabled || self._quickUnlockTriggered || quickUnlockSessionUsed) {
            return;
        }
        if (this.data.state.loading) {
            return;
        }
        const form = this.data.form;
        if (!this.canSubmitForm(form)) {
            return;
        }
        self._quickUnlockTriggered = true;
        quickUnlockSessionUsed = true;
        this.setStateMessage('正在执行快速开锁...');
        wx.showToast({ title: '快速开锁执行中', icon: 'none', duration: 800 });
        this.onSubmit();
    },
    resetBleRuntime() {
        const self = this;
        if (self._ackTimeoutHandle) {
            clearTimeout(self._ackTimeoutHandle);
            self._ackTimeoutHandle = null;
        }
        self._bleFinalized = false;
        self._randomSeed = null;
        this.setData({
            ble: createBleState()
        });
    },
    finalizeBleFlow(success, message) {
        const self = this;
        if (self._bleFinalized) {
            return;
        }
        self._bleFinalized = true;
        if (success) {
            try {
                const form = this.data.form;
                if (form && self._currentDeviceId) {
                    cacheDeviceId(form, self._currentDeviceId);
                }
            }
            catch (err) {
                console.debug('[BLE] 缓存设备信息失败', err);
            }
        }
        this.clearAckTimer();
        if (self._ackResolve) {
            const resolver = self._ackResolve;
            self._ackResolve = null;
            self._stage = 'idle';
            resolver(null);
        }
        this.addLog(message, success);
        this.setStateMessage(message);
        wx.showToast({
            title: message,
            icon: success ? 'success' : 'none',
            duration: 3000
        });
        this.setData({ 'state.loading': false });
        this.cleanupBluetooth().catch(() => undefined);
    },
    startAckTimer(message) {
        const self = this;
        if (self._ackTimeoutHandle) {
            clearTimeout(self._ackTimeoutHandle);
        }
        if (message) {
            this.setStateMessage(message);
        }
        self._ackTimeoutHandle = setTimeout(() => {
            self._ackTimeoutHandle = null;
            this.addLog('超时：在限定时间内未收到门锁响应');
            this.setStateMessage('未收到门锁响应，请确认门锁状态后再次尝试');
        }, USER_ACK_TIMEOUT);
    },
    clearAckTimer() {
        const self = this;
        if (self._ackTimeoutHandle) {
            clearTimeout(self._ackTimeoutHandle);
            self._ackTimeoutHandle = null;
        }
    },
    async onSubmit() {
        if (this.data.state.loading || !this.data.canSubmit) {
            return;
        }
        const self = this;
        const form = this.data.form;
        const mac = (form.mac || '').trim().toUpperCase();
        this.resetBleRuntime();
        this.setData({
            'state.loading': true,
            'state.message': '正在检查权限...',
            logs: []
        });
        this.addLog('开始蓝牙开锁流程');
        try {
            await this.ensurePermissions();
            this.setStateMessage('正在初始化蓝牙...');
            await this.ensureBluetoothReady();
            this.addLog('蓝牙适配器已就绪');
            let deviceId = null;
            let deviceLabel = '';
            const cachedDeviceId = readCachedDeviceId(form);
            if (cachedDeviceId) {
                this.addLog(`尝试使用缓存设备：${cachedDeviceId}`);
                this.setStateMessage('正在连接门锁...');
                try {
                    await this.connectDevice(cachedDeviceId, 6000);
                    deviceId = cachedDeviceId;
                    deviceLabel = cachedDeviceId;
                    this.addLog('已直接连接缓存设备');
                }
                catch (error) {
                    const reason = error && typeof error.errMsg === 'string'
                        ? error.errMsg
                        : error instanceof Error
                            ? error.message
                            : '未知错误';
                    this.addLog(`缓存设备连接失败：${reason}`);
                    removeCachedDeviceId(form);
                    await callWx(wx.closeBLEConnection, {
                        deviceId: cachedDeviceId
                    }).catch(() => undefined);
                }
            }
            if (!deviceId) {
                this.setStateMessage('正在扫描门锁...');
                const device = await this.discoverDevice(mac);
                deviceId = device.deviceId;
                const aliasName = device && device && typeof device.localName === 'string'
                    ? device.localName
                    : undefined;
                deviceLabel = device.name || aliasName || device.deviceId;
                this.addLog(`找到设备：${deviceLabel}`);
                this.setStateMessage('正在连接门锁...');
                await this.connectDevice(device.deviceId);
            }
            else if (deviceLabel) {
                this.addLog(`继续使用缓存设备：${deviceLabel}`);
            }
            if (!deviceId) {
                throw new Error('未找到可用的门锁设备');
            }
            this.addLog('蓝牙连接成功');
            this.setStateMessage('正在初始化蓝牙服务...');
            const channel = await this.prepareChannel(deviceId);
            this.addLog('读取蓝牙特征成功');
            await this.enableNotifications(deviceId, channel.serviceId, channel.notifyIds);
            const seed = await this.readSeed(deviceId, channel.serviceId, channel.readId);
            const seedHex = (0, lockBiz_1.bufferToHex)(seed);
            this.addLog(`随机数：${seedHex}`);
            self._randomSeed = seed;
            updateBleState(this, { randomSeedHex: seedHex });
            const headerBytes = deriveHeaderFromMac(form.mac);
            const keyHex = (0, lockBiz_1.sanitizeKey)(form.key || '');
            if (!keyHex) {
                throw new Error('缺少可用的解锁 Key');
            }
            const handshake = (0, bleProtocol_1.buildHandshakeCommandWithHeader)(seed, headerBytes, keyHex);
            this.addLog(`握手指令：${(0, lockBiz_1.bytesToHex)(handshake)}`);
            await this.writeCommand(deviceId, channel.serviceId, channel.writeId, handshake);
            updateBleState(this, { handshakeSent: true });
            this.startAckTimer('握手指令已发送，等待门锁响应...');
            await this.waitForAck();
        }
        catch (err) {
            const reason = typeof err === 'string'
                ? err
                : err && typeof err.errMsg === 'string'
                    ? err.errMsg
                    : err instanceof Error
                        ? err.message
                        : '操作失败';
            this.setData({ 'state.loading': false });
            this.addLog(`错误：${reason}`);
            this.setStateMessage(reason);
        }
        finally {
            if (self._bleFinalized) {
                self._bleFinalized = false;
            }
            else {
                await this.cleanupBluetooth();
                this.setData({ 'state.loading': false });
            }
        }
    },
    addLog(message, consoleOverride) {
        const recordEnabled = consoleOverride !== undefined ? consoleOverride : this.data.consoleSync;
        if (!recordEnabled) {
            return;
        }
        const now = new Date();
        const stamp = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        const line = `${stamp} ${message}`;
        const syncToConsole = consoleOverride !== undefined ? consoleOverride : this.data.consoleSync;
        if (syncToConsole) {
            console.log(`[BLE] ${line}`);
        }
        const logs = [...this.data.logs.slice(-19), line];
        this.setData({ logs });
    },
    onClearLogs() {
        this.setData({ logs: [] });
        wx.showToast({ title: '日志已清空', icon: 'none', duration: 1500 });
    },
    onCopyLogs() {
        const logs = Array.isArray(this.data.logs) ? this.data.logs : [];
        if (!logs.length) {
            wx.showToast({ title: '暂无可复制的日志', icon: 'none', duration: 1500 });
            return;
        }
        const text = logs.join('\n');
        wx.setClipboardData({
            data: text,
            success: () => wx.showToast({ title: '日志已复制', icon: 'success', duration: 1200 })
        });
    },
    setStateMessage(message) {
        this.setData({ 'state.message': message });
    },
    async ensurePermissions() {
        this.addLog('检查系统权限状态');
        const wxAny = wx;
        let systemSetting = null;
        if (typeof wxAny.getSystemSetting === 'function') {
            try {
                systemSetting = wxAny.getSystemSetting();
                this.addLog(`[权限] getSystemSetting 成功：${JSON.stringify(systemSetting)}`);
            }
            catch (err) {
                const errMsg = err && typeof err.errMsg === 'string' ? err.errMsg : String(err);
                this.addLog(`[权限] getSystemSetting 失败：${errMsg}`);
            }
        }
        else {
            this.addLog('[权限] 当前基础库不支持 getSystemSetting，跳过系统状态检测');
        }
        if (systemSetting && systemSetting.bluetoothEnabled === false) {
            throw new Error('请先在手机系统设置中开启蓝牙功能后再试');
        }
        this.addLog('系统蓝牙状态正常');
    },
    async ensureBluetoothReady() {
        try {
            await callWx(wx.openBluetoothAdapter, {});
        }
        catch (err) {
            const code = err && err && typeof err.errCode !== 'undefined' ? err.errCode : undefined;
            const msg = err && typeof err.errMsg === 'string' ? err.errMsg : '';
            if (msg.includes('暂不支持') || msg.includes('not support')) {
                throw new Error('当前环境不支持蓝牙调试，请使用 Mac 开发者工具或真机测试');
            }
            if (code === 10001) {
                throw new Error('请先在手机系统设置中开启蓝牙功能');
            }
            throw err;
        }
    },
    async discoverDevice(mac) {
        const self = this;
        const page = this;
        const target = normalizeMacForCompare(mac);
        const reversed = reverseMacHex(target);
        const targetName = (this.data.form.bluetoothName || '').toUpperCase();
        const targetNameHex = targetName ? asciiToHex(targetName) : '';
        await callWx(wx.stopBluetoothDevicesDiscovery, {}).catch(() => undefined);
        await callWx(wx.startBluetoothDevicesDiscovery, {
            allowDuplicatesKey: false,
            interval: 0,
            powerLevel: 'high',
            services: SERVICE_CANDIDATES
        });
        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error('扫描蓝牙设备超时，请靠近门锁后重试'));
            }, DISCOVERY_TIMEOUT);
            const debugSeen = new Set();
            const discovered = [];
            const logDevice = (device) => {
                if (!device)
                    return;
                const cacheKey = device.deviceId || `${device.name || ''}-${discovered.length}`;
                if (debugSeen.has(cacheKey))
                    return;
                debugSeen.add(cacheKey);
                const localName = device && device && typeof device.localName === 'string'
                    ? device.localName
                    : undefined;
                const advertisData = device && device && device.advertisData;
                const advertisPreview = advertisData ? (0, lockBiz_1.bufferToHex)(advertisData).slice(0, 32) : '无广播';
                page.addLog(`发现设备: ${device.name || localName || '未知'} | ${device.deviceId} | ${advertisPreview}`);
            };
            const listener = (res) => {
                if (!res.devices)
                    return;
                for (const device of res.devices) {
                    logDevice(device);
                    discovered.push(device);
                    if (matchDevice(device)) {
                        cleanup();
                        resolve(device);
                        break;
                    }
                }
            };
            const matchDevice = (device) => {
                if (!device)
                    return false;
                const deviceId = device.deviceId ? normalizeMacForCompare(device.deviceId) : '';
                if (deviceId && deviceId === target) {
                    return true;
                }
                const altName = device && device && typeof device.localName === 'string'
                    ? device.localName
                    : '';
                const name = ((device && device.name) || altName || '').toUpperCase();
                if (name && targetName && name === targetName) {
                    page.addLog(`匹配成功: 蓝牙名称 ${name}`);
                    return true;
                }
                const advertisData = device && device && device.advertisData;
                if (advertisData) {
                    const advertisHex = (0, lockBiz_1.bufferToHex)(advertisData);
                    if (target && advertisHex.includes(target)) {
                        page.addLog('匹配成功: 广播包含目标 MAC');
                        return true;
                    }
                    if (reversed && advertisHex.includes(reversed)) {
                        page.addLog('匹配成功: 广播包含反序 MAC');
                        return true;
                    }
                    if (targetNameHex && advertisHex.includes(targetNameHex)) {
                        page.addLog('匹配成功: 广播包含蓝牙名称 ASCII');
                        return true;
                    }
                }
                return false;
            };
            const cleanup = () => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                wx.offBluetoothDeviceFound();
                self._deviceFoundListener = null;
                self._lastScanDevices = discovered;
                page.addLog(`停止扫描，共记录设备 ${discovered.length} 个`);
                callWx(wx.stopBluetoothDevicesDiscovery, {}).catch(() => undefined);
            };
            self._deviceFoundListener = listener;
            wx.onBluetoothDeviceFound(listener);
        });
    },
    async connectDevice(deviceId, timeout = 8000) {
        const self = this;
        await callWx(wx.createBLEConnection, {
            deviceId,
            timeout
        });
        self._currentDeviceId = deviceId;
    },
    async prepareChannel(deviceId) {
        const servicesRes = await callWx(wx.getBLEDeviceServices, {
            deviceId
        });
        const services = servicesRes.services || [];
        const service = services.find((item) => SERVICE_CANDIDATES.includes(item.uuid.toLowerCase()));
        if (!service) {
            throw new Error('未找到目标蓝牙服务，请确认门锁已开启蓝牙广播');
        }
        const characteristicsRes = await callWx(wx.getBLEDeviceCharacteristics, {
            deviceId,
            serviceId: service.uuid
        });
        const characteristics = characteristicsRes.characteristics || [];
        const readable = characteristics.find((item) => item.properties.read);
        const writable = characteristics.find((item) => item.properties.write || item.properties.writeNoResponse);
        const notifyIds = characteristics
            .filter((item) => item.properties.notify || item.properties.indicate)
            .map((item) => item.uuid);
        if (!readable || !writable) {
            throw new Error('未找到可读写的蓝牙特征');
        }
        const self = this;
        self._serviceId = service.uuid;
        self._readId = readable.uuid;
        self._writeId = writable.uuid;
        self._notifyIds = notifyIds;
        return {
            serviceId: service.uuid,
            readId: readable.uuid,
            writeId: writable.uuid,
            notifyIds
        };
    },
    async enableNotifications(deviceId, serviceId, notifyIds) {
        for (const characteristicId of notifyIds) {
            await callWx(wx.notifyBLECharacteristicValueChange, {
                deviceId,
                serviceId,
                characteristicId,
                state: true
            }).catch(() => undefined);
        }
    },
    async readSeed(deviceId, serviceId, characteristicId) {
        const self = this;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (self._stage === 'waitingSeed') {
                    self._stage = 'idle';
                    self._seedResolve = null;
                    self._seedReject = null;
                    reject(new Error('读取蓝牙随机数超时'));
                }
            }, READ_TIMEOUT);
            self._stage = 'waitingSeed';
            self._seedResolve = (buffer) => {
                clearTimeout(timer);
                self._seedResolve = null;
                self._seedReject = null;
                resolve(buffer);
            };
            self._seedReject = (error) => {
                clearTimeout(timer);
                self._seedResolve = null;
                self._seedReject = null;
                self._stage = 'idle';
                if (error instanceof Error) {
                    reject(error);
                }
                else {
                    const message = error && error && typeof error.errMsg === 'string'
                        ? error.errMsg
                        : '读取失败';
                    reject(new Error(message));
                }
            };
            callWx(wx.readBLECharacteristicValue, {
                deviceId,
                serviceId,
                characteristicId
            }).catch((err) => self._seedReject && self._seedReject(err));
        });
    },
    async writeCommand(deviceId, serviceId, characteristicId, command) {
        await callWx(wx.writeBLECharacteristicValue, {
            deviceId,
            serviceId,
            characteristicId,
            value: (0, lockBiz_1.sliceBuffer)(command)
        });
    },
    waitForAck() {
        const self = this;
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.clearAckTimer();
                if (self._stage === 'waitingAck') {
                    self._ackResolve = null;
                    self._stage = 'idle';
                    resolve(null);
                }
            }, FLOW_TIMEOUT);
            self._stage = 'waitingAck';
            self._ackResolve = (buffer) => {
                clearTimeout(timer);
                this.clearAckTimer();
                self._ackResolve = null;
                self._stage = 'idle';
                resolve(buffer);
            };
        });
    },
    handleValueChange(res) {
        const self = this;
        if (!res.value)
            return;
        if (self._stage === 'waitingSeed' && self._seedResolve) {
            const resolver = self._seedResolve;
            self._seedResolve = null;
            self._stage = 'idle';
            resolver(res.value);
            return;
        }
        const hex = (0, lockBiz_1.bufferToHex)(res.value).toUpperCase();
        this.addLog(`收到通知：${hex}`);
        this.processBleNotification(hex, res.value).catch((err) => {
            const message = err instanceof Error ? err.message : JSON.stringify(err);
            this.addLog(`处理通知异常：${message}`);
        });
    },
    async cleanupBluetooth() {
        const self = this;
        this.clearAckTimer();
        if (self._deviceFoundListener) {
            wx.offBluetoothDeviceFound();
            self._deviceFoundListener = null;
        }
        await callWx(wx.stopBluetoothDevicesDiscovery, {}).catch(() => undefined);
        if (self._currentDeviceId) {
            await callWx(wx.closeBLEConnection, {
                deviceId: self._currentDeviceId
            }).catch(() => undefined);
            self._currentDeviceId = undefined;
        }
        await callWx(wx.closeBluetoothAdapter, {}).catch(() => undefined);
        self._stage = 'idle';
        self._seedResolve = null;
        self._seedReject = null;
        self._ackResolve = null;
        self._randomSeed = null;
    }
});
