// ==UserScript==
// @name             DC_BanList
// @name:ko          디시인사이드 차단 내역 관리
// @namespace        https://github.com/tristan23612/DC-BanList
// @author           망고스틴
// @version          0.0.1
// @description      디시인사이드 차단 내역 관리
// @description:ko   디시인사이드 차단 내역 관리
// @match            https://gall.dcinside.com/*/board/lists*
// @match            https://gall.dcinside.com/board/lists*
// @match            https://m.dcinside.com/board/*
// @match            https://m.dcinside.com/mini*
// @exclude          https://m.dcinside.com/board/*/*
// @exclude          https://m.dcinside.com/mini/*/*
// @grant            GM_xmlhttpRequest
// @grant            GM_setValue
// @grant            GM_getValue
// @grant            GM_registerMenuCommand
// @grant            GM_unregisterMenuCommand
// @grant            GM_listValues
// @grant            GM_deleteValue
// @run-at           document-end
// @license          MIT
// ==/UserScript==

function injectExportButton() {
    let leftContainer = document.querySelector('.page_head .fl');
    if (!leftContainer) {
        const viewtop = document.getElementById('viewtop');
        if (viewtop) {
            // 모바일 메인 헤더 아래
            leftContainer = document.createElement('div');
            viewtop.insertAdjacentElement('afterend', leftContainer);
        }
    }
    if (!leftContainer) return; // 못 찾으면 종료

    // 2) 중복 방지
    if (document.getElementById('gallscopeExportBtnContainer')) return;

    // 3) 버튼 컨테이너 생성
    const container = document.createElement('div');
    container.id = 'gallscopeExportBtnContainer';
    container.style.cssText = `
        display: inline-flex;
        align-items: center;
        margin-left: 10px;
    `;
    container.innerHTML = `
        <button id="gallscopeExportBtn"
                class="modal-confirm-btn"
                style="padding:4px 8px; font-size:13px;"
                title="차단 목록을 콘솔에 출력">
        차단목록 내보내기
        </button>
    `;
    leftContainer.appendChild(container);

    // 4) 클릭 핸들러 연결
    document.getElementById('gallscopeExportBtn').addEventListener('click', () => {
        exportBlockedList();
    });

    console.log('Gallscope: 차단목록 내보내기 버튼 삽입 완료.');
}

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyVXvHOuyQf1UkWze-PGwa2QLiButd1740ruVgtGhZphp1s-FbbTZRzjdx4vsuKn1VH/exec'; // 실제 URL로 교체

async function exportBlockedList() {
    const gallId = galleryParser.galleryId;
    const gallType = galleryParser.galleryType === 'mgallery' ? 'M' : (galleryParser.galleryType === 'mini' ? 'MI' : '');
    const allBanRecords = [];

    const MAX_TOTAL_PAGES = 1000;
    const MULTI_PAGE_FETCH_CHUNK_SIZE = 5;
    const MAX_EMPTY_PAGES_ALLOWED = 5;

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    let emptyPageCount = 0;

    for (let i = 1; i <= MAX_TOTAL_PAGES; i += MULTI_PAGE_FETCH_CHUNK_SIZE) {
        const batch = Array.from({ length: MULTI_PAGE_FETCH_CHUNK_SIZE }, (_, j) => i + j);

        let results
        try {
            results = await Promise.all(batch.map(page => fetchBanPage(gallId, gallType, page)));
        } catch (err) {
            console.error(`[Gallscope] 페이지 요청 중 오류 발생: ${err}`);
            continue; // 오류 발생 시 다음 배치로 넘어감
        }

        for (const result of results) {
            if (result.status === 'error') {
                console.warn(`[Gallscope] 페이지 ${result.page} 요청 실패: ${result.error}`);
                continue;
            }

            if (result.parsed.length === 0) {
                console.log(`[Gallscope] ${result.page}페이지 데이터 없음.`);
                break; // 빈 페이지가 발견되면 루프 종료
            }
        }

        await delay(200); // 배치 쿨타임
    }

    console.log('[Gallscope] 최종 차단 내역:', allBanRecords);
    // sendToGoogleSheet(gallId, allBanRecords);
}

// 한 페이지 요청 및 파싱 함수
async function fetchBanPage(gallId, gallType, page) {
    const formData = new URLSearchParams();
    formData.append('gall_id', gallId);
    formData.append('_GALLTYPE_', gallType);
    formData.append('type', 'public');
    formData.append('search', '');
    formData.append('p', page.toString());

    try {
        const res = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://gall.dcinside.com/ajax/minor_ajax/manage_report',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                data: formData.toString(),
                onload: resolve,
                onerror: reject
            });
        });

        if (!res || res.status !== 200 || res.responseText.includes('<b>내역이 없습니다.</b>')) {
            return { status: 'empty', page, parsed: [] };
        }

        const parsed = parseBanList(res.responseText);
        return { status: 'success', page, parsed };

    } catch (err) {
        return { status: 'error', page, error: err };
    }
}

function sendToGoogleSheet(gallId, blockedList) {
    GM_xmlhttpRequest({
        method: 'POST',
        url: APPS_SCRIPT_URL,
        headers: {
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({
            gallId: gallId,
            data: blockedList,
        }),

        onload: (res) => {
            console.log('[Gallscope] Google 스프레드시트 업데이트 응답:', res.responseText);
            try {
                const response = JSON.parse(res.responseText);
                if (response.status === 'success') {
                    console.log('Google 스프레드시트 업데이트 성공');
                } else {
                    console.error('Google 스프레드시트 업데이트 실패:', response.message);
                }
            } catch (e) {
                console.error('응답 파싱 실패', e);
            }
        },
        onerror: (err) => {
            console.error('Google 스프레드시트 요청 실패:', err);
        }
    });
}

function parseBanList(htmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    const rows = Array.from(doc.querySelectorAll('table tbody tr'));
    const parsedData = rows.map(row => {
        const cells = row.querySelectorAll('td');
        return {
            nickname: cells[1]?.textContent.replace(/\s+/g, ' ').trim(),
            content: cells[2]?.textContent.replace(/\s+/g, ' ').trim(),
            reason: cells[3]?.textContent.replace(/\s+/g, ' ').trim(),
            duration: cells[4]?.textContent.replace(/\s+/g, ' ').trim(),
            date: cells[5]?.textContent.replace(/\s+/g, ' ').trim(),
            manager: cells[6]?.textContent.replace(/\s+/g, ' ').trim(),
        };
    });

    return parsedData;
}

class PostParser {
    constructor() {
        this.doc = null
    }

    async init() {
        if (isMobile) {
            this.galleryId = document.querySelector('div.gall-tit-box a').getAttribute('href').split('/')[2];
            this.postNo = this.#_extractPostId(window.location.href, this.galleryId);

            if (document.querySelector('span.mgall-tit')) {
                // 마이너 갤러리
                this.baseUrl = 'https://gall.dcinside.com/mgallery/board/' + (this.postNo ? 'view/' : 'lists/')
                this.galleryType = 'mgallery'
            }
            else if (document.querySelector('span.mngall-tit')) {
                // 미니 갤러리
                this.baseUrl = 'https://gall.dcinside.com/mini/board/' + (this.postNo ? 'view/' : 'lists/')
                this.galleryType = 'mini'
            }
            else {
                // 정식 갤러리
                this.baseUrl = 'https://gall.dcinside.com/board/' + (this.postNo ? 'view/' : 'lists/')
                this.galleryType = null
            }

            this.pcUrl = `${this.baseUrl}?id=${this.galleryId}` + (this.postNo ? `&no=${this.postNo}` : '');

            await this.#_loadPCDoc(this.pcUrl);
        }
        else {
            this.galleryId = new URLSearchParams(window.location.search).get('id');
            this.galleryType = window.location.href.includes('mgallery') ? 'mgallery' : (window.location.href.includes('mini') ? 'mini' : null);
            this.baseUrl = window.location.href.split('?')[0];
            this.doc = document; // 기본값은 현재 문서
        }
    }

    #_extractPostId(url, galleryId) {
        const pattern = new RegExp(`/board/${galleryId}/(\\d+)`);
        const match = url.match(pattern);
        return match ? match[1] : null;
    }

    async #_loadPCDoc(url) {
        const res = await this.#_fetchHTML(url);
        const parser = new DOMParser();
        this.doc = parser.parseFromString(res.responseText, "text/html");
    }

    async #_fetchHTML(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0 Safari/537.36'
                },
                onload: (res) => resolve(res),
                onerror: (err) => reject(err)
            });
        });
    }
}

const isMobile = location.hostname === 'm.dcinside.com';
const galleryParser = new PostParser();

const MAX_PAGE = 500;
const BATCH_SIZE = 5;
const PAGE_DELAY_MS = 300;

(async () => {
    // --- Script Entry Point ---

    'use strict';

    await galleryParser.init();
    injectExportButton();
})();