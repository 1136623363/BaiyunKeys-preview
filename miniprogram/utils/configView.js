"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveConfigName = resolveConfigName;
exports.normalizeConfigForForm = normalizeConfigForForm;
exports.buildConfigCollections = buildConfigCollections;
const lockBiz_1 = require("./lockBiz");
function resolveConfigName(entry) {
    const doorName = (entry.doorName || '').trim();
    if (doorName) {
        return doorName;
    }
    if (entry.bluetoothName) {
        return entry.bluetoothName;
    }
    return '未命名门禁';
}
function normalizeConfigForForm(config) {
    return {
        id: config.id,
        doorName: (config.doorName || '').trim(),
        mac: (0, lockBiz_1.sanitizeMacInput)(config.mac || ''),
        key: (0, lockBiz_1.sanitizeKey)(config.key || ''),
        bluetoothName: (config.bluetoothName || '').toUpperCase().replace(/[^0-9A-Z]/g, ''),
        logEnabled: config.logEnabled === true
    };
}
function buildConfigCollections(list, activeId) {
    const configs = Array.isArray(list) ? list.slice() : [];
    const configNames = configs.map((item) => resolveConfigName(item));
    const configOptions = configs.map((item) => ({ id: item.id, name: resolveConfigName(item) }));
    let selectedConfigIndex = 0;
    if (configs.length === 0) {
        selectedConfigIndex = 0;
    }
    else if (activeId) {
        const matchedIndex = configs.findIndex((item) => item.id === activeId);
        selectedConfigIndex = matchedIndex >= 0 ? matchedIndex : 0;
    }
    return {
        configs,
        configNames,
        configOptions,
        selectedConfigIndex
    };
}
