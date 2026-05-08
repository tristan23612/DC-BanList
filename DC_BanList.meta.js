// ==UserScript==
// @name             DC_BanList
// @name:ko          디시인사이드 차단 내역 관리
// @namespace        https://github.com/tristan23612/DC-BanList
// @author           망고스틴
// @version          1.7.3-release
// @description      디시인사이드 차단 내역 관리
// @description:ko   디시인사이드 차단 내역 관리
// @match            https://gall.dcinside.com/*/board/lists*
// @match            https://gall.dcinside.com/board/lists*
// @match            https://m.dcinside.com/board/*
// @match            https://m.dcinside.com/mini*
// @exclude          https://m.dcinside.com/board/*/*
// @exclude          https://m.dcinside.com/mini/*/*
// @connect          *
// @grant            GM_xmlhttpRequest
// @grant            GM_getResourceText
// @grant            GM_setValue
// @grant            GM_getValue
// @grant            GM_registerMenuCommand
// @grant            GM_unregisterMenuCommand
// @grant            GM_listValues
// @grant            GM_deleteValue
// @run-at           document-end
// @resource         cssRaw https://raw.githubusercontent.com/tristan23612/DC-BanList/refs/heads/main/resources/DC_BanList.css
// @resource         urlConfig https://raw.githubusercontent.com/tristan23612/DC-BanList/refs/heads/main/resources/UrlConfig.json
// @license          MIT
// @icon             https://github.com/tristan23612/DC-BanList/blob/main/resources/DC_BanList_icon.png?raw=true
// @downloadURL https://github.com/tristan23612/DC-BanList/releases/latest/download/DC_BanList.user.js
// @updateURL https://github.com/tristan23612/DC-BanList/releases/latest/download/DC_BanList.meta.js
// ==/UserScript==