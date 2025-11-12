"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeMacInput = sanitizeMacInput;
exports.isValidMac = isValidMac;
exports.sanitizeKey = sanitizeKey;
exports.isValidKey = isValidKey;
exports.macToBytes = macToBytes;
exports.hexToBytes = hexToBytes;
exports.bytesToHex = bytesToHex;
exports.sliceBuffer = sliceBuffer;
exports.encryptUnlockCommand = encryptUnlockCommand;
exports.bufferToHex = bufferToHex;
const HEX_PATTERN = /^[0-9A-Fa-f]+$/;
const MIN_KEY_LENGTH = 16;
const MAX_KEY_LENGTH = 32;
function sanitizeMacInput(value) {
    return value.toUpperCase().replace(/[^0-9A-F:]/g, '');
}
function isValidMac(value) {
    return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(value.trim().toUpperCase());
}
function sanitizeKey(value) {
    return value.toUpperCase().replace(/[^0-9A-F]/g, '');
}
function isValidKey(value) {
    const sanitized = sanitizeKey(value);
    return sanitized.length >= MIN_KEY_LENGTH && sanitized.length <= MAX_KEY_LENGTH && sanitized.length % 2 === 0 && HEX_PATTERN.test(sanitized);
}
function macToBytes(mac) {
    if (!isValidMac(mac)) {
        throw new Error('MAC 格式错误');
    }
    const segments = mac.split(':');
    return new Uint8Array(segments.map((segment) => parseInt(segment, 16)));
}
function hexToBytes(hex) {
    if (hex.length % 2 !== 0) {
        throw new Error('十六进制字符串长度必须为偶数');
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}
function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}
function sliceBuffer(buffer) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
const des_1 = require("./des");
function encryptUnlockCommand(seed, mac, key) {
    const macBytes = macToBytes(mac);
    const seedBytes = new Uint8Array(seed);
    const sanitizedKey = sanitizeKey(key);
    const keyBytes = hexToBytes(sanitizedKey);
    let sum = 0;
    for (let i = 0; i < seedBytes.length; i++) {
        sum += seedBytes[i];
    }
    for (let i = 0; i < keyBytes.length; i++) {
        sum += keyBytes[i];
    }
    const sumBytes = new Uint8Array([sum & 0xff, (sum >> 8) & 0xff]);
    const paddedLength = Math.ceil((sumBytes.length + seedBytes.length) / 8) * 8;
    const padded = new Uint8Array(paddedLength);
    padded.set(sumBytes, 0);
    padded.set(seedBytes, sumBytes.length);
    const paddedHex = bytesToHex(padded);
    const encryptedHex = (0, des_1.desEncryptBlockHex)(sanitizedKey, paddedHex);
    const encryptedBytes = hexToBytes(encryptedHex);
    const headerSubset = macBytes.slice(2, 6);
    const totalLength = encryptedBytes.length + 12;
    const payload = new Uint8Array(totalLength);
    payload[0] = 0xa5;
    payload[1] = totalLength & 0xff;
    payload[2] = 0x05;
    payload.set(headerSubset, 3);
    payload[7] = 0x00;
    payload[8] = 0x01;
    payload[9] = 0x07;
    payload.set(encryptedBytes, 10);
    payload[totalLength - 2] = 0x00;
    payload[totalLength - 1] = 0x5a;
    let checksum = 0;
    for (let i = 0; i < payload.length; i++) {
        checksum += payload[i];
    }
    payload[totalLength - 2] = (~checksum) & 0xff;
    return payload;
}
function bufferToHex(buffer) {
    return bytesToHex(new Uint8Array(buffer));
}
