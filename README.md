# BaiyunKeys 小程序项目简介

BaiyunKeys 是一款基于“平安回家”App复刻的蓝牙门禁微信小程序，为广州市白云区蓝牙门禁提供离线开锁方案。

## 核心能力
- 支持iOS和安卓。
- 支持离线和长期使用。
- 支持自动获取、数据库提取与抓包三种参数导入方式，方便迁移现有门禁信息。
- 支持多套门禁参数的配置与管理，适配多门禁场景。
- 支持创建快捷方式并快速开锁，降低重复操作。

## 使用截图：

<div align="center">
  <img src="./preview-pic/index.png" alt="首页" width="25%" />
  <img src="./preview-pic/config-page.png" alt="门禁参数配置页" width="25%" />
  <img src="./preview-pic/help-logs.png" alt="帮助与日志查看页" width="25%" />
</div>

## 小程序二维码：

<div align="center">
  <img src="./preview-pic/mini-program-qr.png" alt="BaiyunKeys 小程序二维码" width="40%" />
</div>

## 使用指南
1. 首次使用时，请在「帮助」页阅读免责声明，并选择适合的参数导入方式（自动获取、数据库提取或抓包）。
2. 选择自动获取时，在「配置」页填写手机号及身份证号，待接口返回后复制并备份生成的门禁参数。
3. 选择数据库提取或抓包方式时，请确保获取到 `MAC_NUM`、`PRODUCT_KEY`、`bluetoothName` 等关键字段，并在「配置」页完整录入。
4. 参数保存后，可在首页选择目标门禁进行蓝牙开锁；如需更高效率，可在「配置」页开启快速开锁与日志同步功能。
5. 遇到连接异常，可在首页查看实时日志，或使用「配置」页的复制提示导出门禁信息，便于排查与备份。

## 参考
- <https://github.com/dogproton/SafeBaiyun>
