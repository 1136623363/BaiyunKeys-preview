"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lockBiz_1 = require("../../utils/lockBiz");
const config_1 = require("../../utils/config");
const api_1 = require("../../utils/api");
const configView_1 = require("../../utils/configView");
function createLoginForm() {
    return { phone: '', idcardNo: '' };
}
function createForm(partial) {
    return (0, configView_1.normalizeConfigForForm)((0, config_1.createEmptyDoorConfig)(partial));
}
function resolvePlatform() {
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
                return platform.toLowerCase();
            }
        }
        catch (err) {
            console.debug('[config] 读取平台信息失败', err);
        }
    }
    return '';
}
const DRAFT_STORAGE_KEY = 'configDraft';
function buildCopyPayload(config) {
    const name = config.doorName || '（未命名）';
    const mac = config.mac || '（缺失）';
    const key = config.key || '（缺失）';
    const bluetooth = config.bluetoothName || '（缺失）';
    return `门禁名称：${name}\nMAC：${mac}\nKey：${key}\n蓝牙名称：${bluetooth}`;
}
function readDraftState() {
    try {
        const raw = wx.getStorageSync(DRAFT_STORAGE_KEY);
        if (raw && typeof raw === 'object') {
            return raw;
        }
    }
    catch (err) {
        console.warn('[config] 读取草稿失败', err);
    }
    return {};
}
function writeDraftState(state) {
    try {
        if (!state || !Object.keys(state).length) {
            wx.removeStorageSync(DRAFT_STORAGE_KEY);
            return;
        }
        wx.setStorageSync(DRAFT_STORAGE_KEY, state);
    }
    catch (err) {
        console.warn('[config] 写入草稿失败', err);
    }
}
Page({
    data: {
        form: (0, configView_1.normalizeConfigForForm)(config_1.DEFAULT_CONFIG),
        saving: false,
        canSave: false,
        loginForm: createLoginForm(),
        fetchingRemote: false,
        configs: [],
        configNames: [],
        configOptions: [],
        selectedConfigIndex: 0,
        selectorOpen: false,
        isIOS: false,
        logEnabled: false,
        quickUnlockEnabled: false,
        copyPrompt: {
            visible: false,
            lines: [],
            copyText: ''
        }
    },
    onLoad() {
        wx.showShareMenu({
            menus: ['shareAppMessage', 'shareTimeline']
        });
    },
    onShow() {
        this.detectPlatform();
        this.refreshConfigState();
    },
    onShareAppMessage() {
        return {
            title: 'BaiyunKeys',
            path: '/pages/config/index'
        };
    },
    onShareTimeline() {
        return {
            title: 'BaiyunKeys'
        };
    },
    detectPlatform() {
        const platform = resolvePlatform();
        if (platform) {
            this.setData({ isIOS: platform === 'ios' });
            return;
        }
        this.setData({ isIOS: false });
    },
    refreshConfigState() {
        const list = (0, config_1.readDoorConfigList)();
        const active = (0, config_1.readDoorConfig)();
        this.applyConfigState(active, list);
        this.restoreDraft();
    },
    applyConfigState(active, list) {
        const form = (0, configView_1.normalizeConfigForForm)(active);
        const logEnabled = (0, config_1.readLogPreference)();
        const quickUnlockEnabled = (0, config_1.readQuickUnlockPreference)();
        const nextForm = { ...form, logEnabled };
        const { configs, configNames, configOptions, selectedConfigIndex } = (0, configView_1.buildConfigCollections)(list, form.id || null);
        this.setData({
            form: nextForm,
            configs,
            configNames,
            configOptions,
            selectedConfigIndex,
            selectorOpen: false,
            logEnabled,
            quickUnlockEnabled
        });
        this.updateCanSave(nextForm);
    },
    getCurrentForm() {
        return this.data.form;
    },
    updateCanSave(targetForm) {
        const form = targetForm || this.getCurrentForm();
        const requireBluetooth = this.data.isIOS;
        const ready = !!form.doorName &&
            (0, lockBiz_1.isValidMac)(form.mac) &&
            (0, lockBiz_1.isValidKey)(form.key) &&
            (!requireBluetooth || !!form.bluetoothName);
        this.setData({ canSave: ready });
    },
    updateFormField(field, value) {
        this.setData({ [`form.${field}`]: value });
        this.updateCanSave();
    },
    getActiveDraftKey() {
        const form = this.getCurrentForm();
        return form.id || '__temp__';
    },
    cacheDraft(partial) {
        const draftState = readDraftState();
        const key = this.getActiveDraftKey();
        const existing = draftState[key] || {};
        draftState[key] = { ...existing, ...partial, timestamp: Date.now() };
        writeDraftState(draftState);
    },
    restoreDraft() {
        const draftState = readDraftState();
        const key = this.getActiveDraftKey();
        const draft = draftState[key];
        const current = this.getCurrentForm();
        const merged = {
            ...current,
            doorName: draft && typeof draft.doorName === 'string' ? draft.doorName : current.doorName,
            mac: draft && typeof draft.mac === 'string' ? draft.mac : current.mac,
            key: draft && typeof draft.key === 'string' ? draft.key : current.key,
            bluetoothName: draft && typeof draft.bluetoothName === 'string' ? draft.bluetoothName : current.bluetoothName,
            logEnabled: current.logEnabled
        };
        this.setData({
            form: merged
        });
        this.updateCanSave(merged);
    },
    clearDraft() {
        const draftState = readDraftState();
        const key = this.getActiveDraftKey();
        if (draftState[key]) {
            delete draftState[key];
        }
        writeDraftState(draftState);
    },
    showCopyReminder(copyText) {
        const lines = copyText.split('\n').filter((line) => line.trim().length > 0);
        const contentLines = [
            '已自动获取门禁参数，请立即备份（建议收藏到微信），以便随时恢复使用。'
        ].concat(lines).concat(['提示：iOS 需保留蓝牙名称，安卓用户也建议一并保存。']);
        return new Promise((resolve) => {
            const self = this;
            self._copyResolve = resolve;
            this.setData({
                copyPrompt: {
                    visible: true,
                    lines: contentLines,
                    copyText
                }
            });
        });
    },
    closeCopyPrompt() {
        const self = this;
        const resolver = self._copyResolve;
        self._copyResolve = null;
        this.setData({
            copyPrompt: {
                visible: false,
                lines: [],
                copyText: ''
            }
        });
        if (typeof resolver === 'function') {
            resolver();
        }
    },
    onDoorNameInput(event) {
        const value = (event.detail.value || '').trim();
        this.updateFormField('doorName', value);
        this.cacheDraft({ doorName: value });
    },
    onMacInput(event) {
        const value = (0, lockBiz_1.sanitizeMacInput)(event.detail.value || '');
        this.updateFormField('mac', value);
        this.cacheDraft({ mac: value });
    },
    onKeyInput(event) {
        const value = (0, lockBiz_1.sanitizeKey)(event.detail.value || '');
        this.updateFormField('key', value);
        this.cacheDraft({ key: value });
    },
    onBluetoothNameInput(event) {
        if (!this.data.isIOS) {
            return;
        }
        const value = (event.detail.value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
        this.updateFormField('bluetoothName', value);
        this.cacheDraft({ bluetoothName: value });
    },
    onPhoneInput(event) {
        const value = (event.detail.value || '').replace(/\D/g, '').slice(0, 11);
        this.setData({ 'loginForm.phone': value });
    },
    onIdcardInput(event) {
        const value = (event.detail.value || '').toUpperCase().replace(/[^0-9X]/g, '').slice(0, 18);
        this.setData({ 'loginForm.idcardNo': value });
    },
    onCopyConfirm() {
        const text = this.data.copyPrompt.copyText || '';
        if (!text) {
            this.closeCopyPrompt();
            return;
        }
        wx.setClipboardData({
            data: text,
            success: () => {
                wx.showToast({ title: '配置已复制', icon: 'success', duration: 1200 });
                this.closeCopyPrompt();
            },
            fail: () => {
                wx.showToast({ title: '复制失败，请手动复制', icon: 'none', duration: 1800 });
                this.closeCopyPrompt();
            }
        });
    },
    toggleConfigSelector() {
        if (!this.data.configs.length) {
            wx.showToast({ title: '请先新增并保存门禁', icon: 'none' });
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
        this.clearDraft();
        const active = (0, config_1.setActiveDoorConfig)(id);
        const list = (0, config_1.readDoorConfigList)();
        this.applyConfigState(active, list);
    },
    onAddConfig() {
        const nextForm = createForm({ logEnabled: this.data.logEnabled });
        this.clearDraft();
        this.setData({
            form: nextForm,
            selectorOpen: false
        });
        this.updateCanSave(nextForm);
        wx.showToast({ title: '已创建新门禁，请填写参数', icon: 'none' });
    },
    onDeleteConfig() {
        const current = this.getCurrentForm();
        if (!current.id) {
            wx.showToast({ title: '尚未保存的门禁无需删除', icon: 'none' });
            return;
        }
        wx.showModal({
            title: '确认删除',
            content: '删除后将无法使用该门禁配置，确定继续？',
            success: (res) => {
                if (!res.confirm) {
                    return;
                }
                (0, config_1.deleteDoorConfig)(current.id);
                this.refreshConfigState();
                this.clearDraft();
                wx.showToast({ title: '已删除', icon: 'none' });
            }
        });
    },
    onLogToggle(event) {
        const next = !!event.detail.value;
        (0, config_1.saveLogPreference)(next);
        this.setData({
            logEnabled: next,
            'form.logEnabled': next
        });
        wx.showToast({ title: next ? '已开启调试日志' : '已关闭调试日志', icon: 'none', duration: 1200 });
    },
    onQuickUnlockToggle(event) {
        const next = !!event.detail.value;
        (0, config_1.saveQuickUnlockPreference)(next);
        this.setData({ quickUnlockEnabled: next });
        wx.showToast({ title: next ? '已开启快速开锁' : '已关闭快速开锁', icon: 'none', duration: 1200 });
    },
    normalizeFetchedConfig(item) {
        const current = this.getCurrentForm();
        const base = {
            id: undefined,
            doorName: ((item && item.address) || item.name || current.doorName || '').trim(),
            mac: item && item.macNum ? item.macNum : '',
            key: item && item.productKey ? item.productKey : '',
            bluetoothName: item && item.bluetoothName ? item.bluetoothName : '',
            logEnabled: this.data.logEnabled
        };
        const normalized = (0, configView_1.normalizeConfigForForm)(base);
        if (!(0, lockBiz_1.isValidMac)(normalized.mac) || !(0, lockBiz_1.isValidKey)(normalized.key) || !normalized.bluetoothName) {
            throw new Error('返回的门锁参数不完整或格式无效');
        }
        return normalized;
    },
    async onFetchRemoteConfig() {
        if (this.data.fetchingRemote) {
            return;
        }
        const phone = (this.data.loginForm.phone || '').trim();
        const idcardNo = (this.data.loginForm.idcardNo || '').trim().toUpperCase();
        if (!idcardNo) {
            wx.showToast({ title: '请填写身份证号', icon: 'none' });
            return;
        }
        this.setData({ fetchingRemote: true });
        let auth = null;
        try {
            auth = await (0, api_1.login)(phone, idcardNo);
            const list = await (0, api_1.fetchEntranceGuardList)(auth);
            if (!list.length) {
                throw new Error('未获取到门禁信息');
            }
            const config = this.normalizeFetchedConfig(list[0]);
            const existingList = (0, config_1.readDoorConfigList)();
            const duplicate = existingList.find((item) => item.doorName === config.doorName &&
                item.mac === config.mac &&
                item.key === config.key &&
                item.bluetoothName === config.bluetoothName &&
                item.logEnabled === config.logEnabled);
            if (duplicate) {
                const active = (0, config_1.setActiveDoorConfig)(duplicate.id);
                const refreshed = (0, config_1.readDoorConfigList)();
                this.applyConfigState(active, refreshed);
                wx.showToast({ title: '已存在相同门禁，已为你选中', icon: 'none' });
                this.setData({ loginForm: createLoginForm() });
                this.clearDraft();
                await this.showCopyReminder(buildCopyPayload(active));
                return;
            }
            const stored = (0, config_1.saveDoorConfig)(config);
            const refreshed = (0, config_1.readDoorConfigList)();
            this.applyConfigState(stored, refreshed);
            this.setData({ loginForm: createLoginForm() });
            this.clearDraft();
            await this.showCopyReminder(buildCopyPayload(stored));
        }
        catch (err) {
            const message = err instanceof Error ? err.message : '获取配置失败';
            console.error('[config] 获取远程配置失败', err);
            wx.showToast({ title: message, icon: 'none' });
        }
        finally {
            this.setData({ fetchingRemote: false });
            if (auth) {
                await (0, api_1.logout)(auth);
            }
        }
    },
    async onSave() {
        if (this.data.saving || !this.data.canSave) {
            return;
        }
        this.setData({ saving: true });
        try {
            const payload = (0, configView_1.normalizeConfigForForm)({
                ...this.getCurrentForm(),
                logEnabled: this.data.logEnabled
            });
            const stored = (0, config_1.saveDoorConfig)(payload);
            const refreshed = (0, config_1.readDoorConfigList)();
            this.applyConfigState(stored, refreshed);
            wx.showToast({ title: '保存成功', icon: 'success', duration: 1200 });
            this.clearDraft();
        }
        catch (err) {
            console.error('[config] 保存失败', err);
            wx.showToast({ title: '保存失败，请重试', icon: 'none' });
        }
        finally {
            this.setData({ saving: false });
        }
    }
});
