# 图瘦 PicLean

> 很喜欢 [图压](https://tuya.xinxiao.tech) 的交互逻辑，可惜很长一段时间没有更新，且不支持 ARM 架构的 Mac。期间也用过一些替代品，但交互逻辑怪怪的。于是参考「图压」的交互界面与用到的开源库重构一下吧，很感谢大家的支持 OwO。
>



## 这是什么

一个基于「图压」项目衍生的图片压缩工具，让图片瘦下来～

参考了「图压」那种很顺手的压缩流程，项目不包含原「图压」源码，只基于公开信息进行重构。

## 功能

- 批量添加图片，支持点击选择和拖拽导入
- 支持 JPEG、PNG、SVG、WebP、AVIF、HEIF/HEIC
- 支持按压缩强度或目标文件大小压缩
- 支持限制宽高、保持原始宽高比、覆盖原图、保留元数据、跳过变大结果
- PNG 默认使用 sharp 基础压缩，并可自动检测本机的 pngquant、OxiPNG、pngcrush
- SVG 使用 SVGO
- JPEG 使用 sharp 的 mozjpeg 参数
- HEIF 优先走 sharp/libvips，macOS 下用系统 ImageIO/sips 兜底

## 开发

```bash
npm install
npm run dev
```

## 常用命令

```bash
npm run typecheck
npm run build
npm run icon
npm run package:mac
npm run package:win
npm run package:linux
```

`package:mac` 会构建 macOS x64 和 arm64 包，覆盖 Intel Mac 与 Apple Silicon。正式发布前仍需要配置 Apple Developer 证书、签名和公证。

`package:win` 会生成 Windows x64 的 NSIS 安装包和 zip。`package:linux` 会生成 Linux x64/arm64 的 AppImage、deb 与 tar.gz。

由于 sharp/libvips 是原生依赖，Windows/Linux 正式包建议放到对应系统或 CI runner 上构建，别硬跨平台赌运气。

## 可选压缩命令

为了降低安装体积和审计成本，pngquant、OxiPNG、pngcrush 不默认塞进 npm 依赖里。应用会在运行时自动检测 PATH 里的同名命令。

macOS 可以按需安装：

```bash
brew install pngquant oxipng pngcrush
```

没有这些命令也能用，只是 PNG 会回落到基础压缩。

## 目录

```text
src/main/        Electron 主进程与压缩逻辑
src/preload/     安全暴露给 renderer 的桥
src/renderer/    React 界面
scripts/         图标生成与打包裁剪脚本
build/           应用图标资源
```

## 许可

图瘦（PicLean）以 GPL-3.0-or-later 发布。详见 [LICENSE](./LICENSE)。

第三方组件的许可与鸣谢请见下方。



## 鸣谢

感谢「图压」提供过那么顺手的产品体验，也感谢这些项目撑起了图片压缩这件小事：

- UUI
- Electron
- React
- sharp / libvips
- SVGO
- OxiPNG
- pngcrush
- pngquant
- mozjpeg



## 开源项目

| 项目                             | 用途                            | 许可                          |
| -------------------------------- | ------------------------------- | ----------------------------- |
| Electron                         | 桌面应用壳与跨平台打包          | MIT                           |
| React                            | 渲染界面                        | MIT                           |
| lucide-react                     | 图标                            | ISC                           |
| sharp                            | 图片处理、压缩、格式转换        | Apache-2.0                    |
| libvips                          | sharp 使用的底层图像库          | LGPL-2.1-or-later             |
| sharp-libvips npm binary package | sharp 使用的预编译 libvips 包   | LGPL-3.0-or-later             |
| SVGO                             | SVG 压缩                        | MIT                           |
| UUI                              | 原「图压」相关开源项目参考      | MIT                           |
| OxiPNG                           | 可选 PNG 外部压缩命令           | MIT                           |
| pngcrush                         | 可选 PNG 外部压缩命令           | zlib                          |
| pngquant                         | 可选 PNG 外部压缩命令           | GPL-3.0-or-later / commercial |
| mozjpeg                          | JPEG 编码参数参考及底层实现方向 | BSD-3-Clause                  |



## 许可说明

图瘦（PicLean）源码以 GPL-3.0-or-later 发布。第三方项目仍遵循各自原始许可证。

- 本项目参考「图压」的公开产品信息、交互逻辑和界面方向。
- 本项目没有使用、复制或反编译「图压」源码。
- 「图压」相关名称、网站与原项目归原作者所有。

当前仓库没有把 pngquant、OxiPNG、pngcrush 作为 npm 依赖捆绑；应用只会在运行时检测用户本机 PATH 中是否存在对应命令。
