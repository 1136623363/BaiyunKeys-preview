"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDeviceIdParts = extractDeviceIdParts;
exports.buildHandshakeCommand = buildHandshakeCommand;
exports.buildHandshakeCommandWithHeader = buildHandshakeCommandWithHeader;
exports.buildCommKeyCommand = buildCommKeyCommand;
exports.buildTimeSyncCommand = buildTimeSyncCommand;
exports.generateTimeHex = generateTimeHex;
exports.decryptCommKey = decryptCommKey;
exports.decryptWithSessionKey = decryptWithSessionKey;
exports.decodeOpenResult = decodeOpenResult;
exports.hexToArray = hexToArray;
exports.arrayToHex = arrayToHex;
exports.bufferToHexUpper = bufferToHexUpper;
const lockBiz_1 = require("./lockBiz");
const des_1 = require("./des");
const HEX_REGEX = /[^0-9A-F]/gi;
function normalizeHex(hex) {
    if (!hex)
        return '';
    const clean = hex.replace(HEX_REGEX, '').toUpperCase();
    return clean.length % 2 === 0 ? clean : `0${clean}`;
}
function hexToArray(hex) {
    const clean = normalizeHex(hex);
    const result = [];
    for (let i = 0; i < clean.length; i += 2) {
        result.push(parseInt(clean.substr(i, 2), 16));
    }
    return result;
}
function arrayToHex(bytes) {
    return (0, lockBiz_1.bytesToHex)(new Uint8Array(bytes));
}
function bufferToHexUpper(buffer) {
    return (0, lockBiz_1.bytesToHex)(new Uint8Array(buffer));
}
function complementByte(sum) {
    return (~(sum & 0xff) + 256) & 0xff;
}
function extractDeviceIdParts(name) {
    const clean = (name || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (clean.length < 11) {
        throw new Error('蓝牙名称格式不合法，无法解析设备标识');
    }
    return [
        parseInt(clean.substr(3, 2), 16),
        parseInt(clean.substr(5, 2), 16),
        parseInt(clean.substr(7, 2), 16),
        parseInt(clean.substr(9, 2), 16)
    ];
}
function sumBytes(bytes) {
    let total = 0;
    for (let i = 0; i < bytes.length; i++) {
        total += bytes[i];
    }
    return total;
}
function xorBytes(bytes) {
    if (!bytes || bytes.length === 0)
        return 0;
    let acc = bytes[0];
    for (let i = 1; i < bytes.length; i++) {
        acc ^= bytes[i];
    }
    return acc & 0xff;
}
function desEncrypt(keyHex, payloadHex) {
    return (0, des_1.desEncryptBlockHex)(keyHex, payloadHex);
}
function desDecrypt(keyHex, payloadHex) {
    return (0, des_1.desDecryptBlockHex)(keyHex, payloadHex);
}
function buildHandshakeCommand(random, bluetoothName, productKey) {
    const randomBytes = new Uint8Array(random);
    const ids = extractDeviceIdParts(bluetoothName);
    return buildHandshakeCommandWithHeader(randomBytes, ids, productKey);
}
function buildHandshakeCommandWithHeader(random, headerBytes, productKey) {
    const randomBytes = random instanceof Uint8Array ? random : new Uint8Array(random);
    if (!headerBytes || headerBytes.length !== 4) {
        throw new Error('握手指令头部需提供 4 个字节');
    }
    let sum = sumBytes(randomBytes);
    const keyBytes = (0, lockBiz_1.hexToBytes)(normalizeHex(productKey));
    sum += sumBytes(keyBytes);
    const low = sum & 0xff;
    const high = (sum >> 8) & 0xff;
    const temp = new Uint8Array([low, high, randomBytes[0], randomBytes[1], randomBytes[2], randomBytes[3], 0, 0]);
    const encryptedHex = desEncrypt(productKey, arrayToHex(temp));
    const frame = [
        0xa5,
        0x14,
        0x05,
        ...headerBytes,
        0x00,
        0x01,
        0x07,
        parseInt(encryptedHex.substr(0, 2), 16),
        parseInt(encryptedHex.substr(2, 2), 16),
        parseInt(encryptedHex.substr(4, 2), 16),
        parseInt(encryptedHex.substr(6, 2), 16),
        parseInt(encryptedHex.substr(8, 2), 16),
        parseInt(encryptedHex.substr(10, 2), 16),
        parseInt(encryptedHex.substr(12, 2), 16),
        parseInt(encryptedHex.substr(14, 2), 16),
        0x00,
        0x5a
    ];
    const checksum = sumBytes(frame);
    frame[frame.length - 2] = complementByte(checksum);
    return new Uint8Array(frame);
}
function buildCommKeyCommand(random, derivedName, productKey) {
    const randomBytes = new Uint8Array(random);
    const ids = extractDeviceIdParts(derivedName);
    void lockBiz_1.hexToBytes;
    const pivot = new Uint8Array([randomBytes[0], randomBytes[1], randomBytes[2], randomBytes[3], 0, 0]);
    const encryptedHex = desEncrypt(productKey, arrayToHex(pivot));
    const deviceHex = arrayToHex(ids);
    const bodyHex = deviceHex + '0000' + bufferToHexUpper(random);
    const bodyBytes = hexToArray(bodyHex);
    const sumBody = sumBytes(bodyBytes) & 0xff;
    const xorBody = xorBytes(bodyBytes);
    const frame = [
        0xa5,
        0x16,
        0x01,
        ...ids,
        0x00,
        0x00,
        sumBody,
        xorBody,
        0x09,
        parseInt(encryptedHex.substr(0, 2), 16),
        parseInt(encryptedHex.substr(2, 2), 16),
        parseInt(encryptedHex.substr(4, 2), 16),
        parseInt(encryptedHex.substr(6, 2), 16),
        parseInt(encryptedHex.substr(8, 2), 16),
        parseInt(encryptedHex.substr(10, 2), 16),
        parseInt(encryptedHex.substr(12, 2), 16),
        parseInt(encryptedHex.substr(14, 2), 16),
        0x00,
        0x5a
    ];
    const checksum = sumBytes(frame);
    frame[frame.length - 2] = complementByte(checksum);
    return new Uint8Array(frame);
}
function buildTimeSyncCommand(timeBytes, derivedName, sessionKey) {
    const payload = new Uint8Array([...timeBytes, 0]);
    const ids = extractDeviceIdParts(derivedName);
    const encryptedHex = desEncrypt(sessionKey, arrayToHex(payload));
    const bodyHex = arrayToHex(ids) + '0000' + arrayToHex(timeBytes);
    const bodyBytes = hexToArray(bodyHex);
    const sumBody = sumBytes(bodyBytes) & 0xff;
    const xorBody = xorBytes(bodyBytes);
    const frame = [
        0xa5,
        0x16,
        0x01,
        ...ids,
        0x00,
        0x00,
        sumBody,
        xorBody,
        0x06,
        parseInt(encryptedHex.substr(0, 2), 16),
        parseInt(encryptedHex.substr(2, 2), 16),
        parseInt(encryptedHex.substr(4, 2), 16),
        parseInt(encryptedHex.substr(6, 2), 16),
        parseInt(encryptedHex.substr(8, 2), 16),
        parseInt(encryptedHex.substr(10, 2), 16),
        parseInt(encryptedHex.substr(12, 2), 16),
        parseInt(encryptedHex.substr(14, 2), 16),
        0x00,
        0x5a
    ];
    const checksum = sumBytes(frame);
    frame[frame.length - 2] = complementByte(checksum);
    return new Uint8Array(frame);
}
function generateTimeHex(date) {
    const now = date ? new Date(date) : new Date();
    const year = now.getFullYear() - 2000;
    const yearHigh = Math.floor(year / 10);
    const yearLow = year % 10;
    const yearHex = ((yearHigh << 4) | yearLow).toString(16).padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hour = now.getHours().toString().padStart(2, '0');
    const minute = now.getMinutes().toString().padStart(2, '0');
    const second = now.getSeconds().toString().padStart(2, '0');
    const weekdayMap = ['00', '01', '02', '03', '04', '05', '06'];
    const weekday = weekdayMap[now.getDay()];
    return `${yearHex}${month}${day}${hour}${minute}${second}${weekday}`.toUpperCase();
}
function decryptCommKey(bodyHex, productKey) {
    const decrypted = desDecrypt(productKey, bodyHex);
    if (decrypted.length < 32)
        return '';
    return decrypted.substr(16, 16).toUpperCase();
}
function decryptWithSessionKey(bodyHex, sessionKey) {
    return desDecrypt(sessionKey, bodyHex);
}
function decodeOpenResult(frameHex, productKey) {
    const clean = normalizeHex(frameHex);
    if (clean.length < 36) {
        return { code: 'FF', message: '数据长度不足，无法解析回执' };
    }
    const msgBodyHex = clean.substr(20, 16);
    const decrypted = desDecrypt(productKey, msgBodyHex);
    if (decrypted.length !== 16) {
        return { code: 'FF', message: '回执解密失败' };
    }
    const status = decrypted.substr(4, 2);
    if (status === '00') {
        return { code: status, message: '开门成功' };
    }
    if (status === '02') {
        return { code: status, message: '门已打开' };
    }
    return { code: status, message: '开门失败，密码无效' };
}
