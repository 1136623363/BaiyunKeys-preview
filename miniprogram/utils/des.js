"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.desEncryptBlockHex = desEncryptBlockHex;
exports.desDecryptBlockHex = desDecryptBlockHex;
const CryptoJS = __importStar(require("crypto-js"));
function normalizeKeyHex(keyHex) {
    if (!keyHex) {
        throw new Error('缺少 DES 密钥');
    }
    const clean = keyHex.replace(/[^0-9A-F]/gi, '').toUpperCase();
    if (clean.length < 16) {
        throw new Error('密钥长度不足 8 字节');
    }
    return clean.slice(0, 16);
}
function normalizeDataHex(dataHex) {
    if (!dataHex) {
        throw new Error('缺少 DES 数据块');
    }
    const clean = dataHex.replace(/[^0-9A-F]/gi, '').toUpperCase();
    if (clean.length !== 16) {
        throw new Error('DES 数据块必须为 8 字节（16 个十六进制字符）');
    }
    return clean;
}
function desEncryptBlockHex(keyHex, dataHex) {
    const normalizedKey = normalizeKeyHex(keyHex);
    const normalizedData = normalizeDataHex(dataHex);
    const key = CryptoJS.enc.Hex.parse(normalizedKey);
    const data = CryptoJS.enc.Hex.parse(normalizedData);
    const encrypted = CryptoJS.DES.encrypt(data, key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.NoPadding
    });
    return encrypted.ciphertext.toString(CryptoJS.enc.Hex).toUpperCase();
}
function desDecryptBlockHex(keyHex, dataHex) {
    const normalizedKey = normalizeKeyHex(keyHex);
    const normalizedData = normalizeDataHex(dataHex);
    const key = CryptoJS.enc.Hex.parse(normalizedKey);
    const cipherParams = CryptoJS.lib.CipherParams.create({
        ciphertext: CryptoJS.enc.Hex.parse(normalizedData)
    });
    const decrypted = CryptoJS.DES.decrypt(cipherParams, key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.NoPadding
    });
    return decrypted.toString(CryptoJS.enc.Hex).toUpperCase();
}
