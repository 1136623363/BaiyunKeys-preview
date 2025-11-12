"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.createEmptyDoorConfig = createEmptyDoorConfig;
exports.readDoorConfigList = readDoorConfigList;
exports.readDoorConfig = readDoorConfig;
exports.saveDoorConfig = saveDoorConfig;
exports.deleteDoorConfig = deleteDoorConfig;
exports.setActiveDoorConfig = setActiveDoorConfig;
exports.readLogPreference = readLogPreference;
exports.saveLogPreference = saveLogPreference;
exports.readQuickUnlockPreference = readQuickUnlockPreference;
exports.saveQuickUnlockPreference = saveQuickUnlockPreference;
const CONFIG_STORAGE_KEY = 'doorConfig';
const LOG_PREF_STORAGE_KEY = 'doorLogEnabled';
const QUICK_UNLOCK_PREF_STORAGE_KEY = 'quickUnlockEnabled';
const DEFAULT_STATE = {
    version: 2,
    currentId: null,
    items: []
};
function createEmptyDoorConfig(partial = {}) {
    return {
        id: partial.id,
        doorName: (partial.doorName || '').trim(),
        mac: (partial.mac || '').toUpperCase(),
        key: (partial.key || '').toUpperCase(),
        bluetoothName: (partial.bluetoothName || '').toUpperCase(),
        logEnabled: typeof partial.logEnabled === 'boolean' ? partial.logEnabled : false
    };
}
exports.DEFAULT_CONFIG = createEmptyDoorConfig();
function generateId() {
    return `door_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function sanitizeStoredConfig(input) {
    const base = createEmptyDoorConfig(input);
    return {
        ...base,
        id: input.id && typeof input.id === 'string' ? input.id : generateId()
    };
}
function migrateState(raw) {
    if (!raw) {
        return { ...DEFAULT_STATE };
    }
    if (typeof raw === 'object' && raw.version === 2 && Array.isArray(raw.items)) {
        const items = raw.items.map((item) => sanitizeStoredConfig(item));
        const currentId = typeof raw.currentId === 'string' && items.some((item) => item.id === raw.currentId)
            ? raw.currentId
            : items.length ? items[0].id : null;
        return {
            version: 2,
            currentId,
            items
        };
    }
    if (typeof raw === 'object') {
        const legacy = sanitizeStoredConfig(raw);
        return {
            version: 2,
            currentId: legacy.id,
            items: [legacy]
        };
    }
    return { ...DEFAULT_STATE };
}
function readState() {
    try {
        const raw = wx.getStorageSync(CONFIG_STORAGE_KEY);
        const state = migrateState(raw);
        if (state !== raw) {
            writeState(state);
        }
        return state;
    }
    catch (err) {
        console.warn('[config] 读取配置失败，将返回默认状态', err);
        return { ...DEFAULT_STATE };
    }
}
function writeState(state) {
    wx.setStorageSync(CONFIG_STORAGE_KEY, state);
}
function ensureActive(state) {
    if (state.items.length === 0) {
        return { ...state, currentId: null };
    }
    if (state.currentId && state.items.some((item) => item.id === state.currentId)) {
        return state;
    }
    return { ...state, currentId: state.items[0].id };
}
function readDoorConfigList() {
    const state = readState();
    return state.items.slice();
}
function readDoorConfig() {
    const state = ensureActive(readState());
    if (!state.currentId) {
        return createEmptyDoorConfig();
    }
    const active = state.items.find((item) => item.id === state.currentId);
    return active ? { ...active } : createEmptyDoorConfig();
}
function saveDoorConfig(config) {
    const state = readState();
    const normalized = sanitizeStoredConfig(config);
    const index = state.items.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
        state.items[index] = normalized;
    }
    else {
        state.items.push(normalized);
    }
    state.currentId = normalized.id;
    writeState(ensureActive(state));
    return normalized;
}
function deleteDoorConfig(id) {
    const state = readState();
    const filtered = state.items.filter((item) => item.id !== id);
    if (filtered.length === state.items.length) {
        return;
    }
    const nextState = ensureActive({
        version: 2,
        currentId: state.currentId === id ? null : state.currentId,
        items: filtered
    });
    writeState(nextState);
}
function setActiveDoorConfig(id) {
    const state = readState();
    if (!state.items.some((item) => item.id === id)) {
        return readDoorConfig();
    }
    state.currentId = id;
    writeState(state);
    const active = state.items.find((item) => item.id === id);
    return active ? { ...active } : createEmptyDoorConfig();
}
function readLogPreference() {
    try {
        const stored = wx.getStorageSync(LOG_PREF_STORAGE_KEY);
        if (typeof stored === 'boolean') {
            return stored;
        }
    }
    catch (err) {
        console.warn('[config] 读取日志偏好失败', err);
    }
    try {
        const active = readDoorConfig();
        return active.logEnabled === true;
    }
    catch (err) {
        return false;
    }
}
function saveLogPreference(enabled) {
    try {
        wx.setStorageSync(LOG_PREF_STORAGE_KEY, !!enabled);
    }
    catch (err) {
        console.warn('[config] 保存日志偏好失败', err);
    }
}
function readQuickUnlockPreference() {
    try {
        const stored = wx.getStorageSync(QUICK_UNLOCK_PREF_STORAGE_KEY);
        if (typeof stored === 'boolean') {
            return stored;
        }
    }
    catch (err) {
        console.warn('[config] 读取快速开锁偏好失败', err);
    }
    return false;
}
function saveQuickUnlockPreference(enabled) {
    try {
        wx.setStorageSync(QUICK_UNLOCK_PREF_STORAGE_KEY, !!enabled);
    }
    catch (err) {
        console.warn('[config] 保存快速开锁偏好失败', err);
    }
}
