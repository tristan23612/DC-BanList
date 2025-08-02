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

class ModalManager {
    #config;
    #state;
    #eventHandlers;
    #uiManager;

    #userPostsModal;
    #exportBanListModal;

    constructor(config, state, eventHandlers, uiManager) {
        this.#config = config;
        this.#state = state;
        this.#eventHandlers = eventHandlers;
        this.#uiManager = uiManager;

        this.#userPostsModal = null;

        this.#exportBanListModal = null;
    }

    #createAndAppendElement(tagName, id, className) {
        const el = document.createElement(tagName);
        if (id) el.id = id;
        if (className) el.className = className;
        document.body.appendChild(el);
        return el;
    }

    #_createModal(id, title) {
        const modal = this.#createAndAppendElement('div', id, 'gallscope-modal-base');
        modal.innerHTML = `
            <div class="modal-header">
                <div class="modal-title"><img src="${this.#config.ICON_URL}" class="modal-icon"><span>${title}</span></div>
                <button class="close-btn">×</button>
            </div>
            <div class="modal-content"></div>
            <div class="modal-footer" style="display: none;"></div>
        `;
        modal.dataset.defaultTitle = title;
        modal.querySelector('.close-btn').onclick = () => (modal.style.display = 'none');
        this.#uiManager.updateTheme();
        return modal;
    }

    #getOrCreateUserPostsModal = () => {
        if (this.#userPostsModal) return this.#userPostsModal;

        const modal = this.#_createModal(this.#config.UI.USER_POSTS_MODAL_ID, '유저 작성글');
        this.#userPostsModal = modal;
        this.#state.userPostsModalElement = modal;
        return modal;
    };

    #getOrCreateExportBanListModal = () => {
        if (this.#exportBanListModal) return this.#exportBanListModal;

        const modal = this.#_createModal(this.#config.UI.EXPORT_BAN_LIST_MODAL_ID, '차단 내역 내보내기');
        this.#exportBanListModal = modal;
        this.#state.exportModalElement = modal;
        return modal;
    }

    showUserPosts(targetUserInfo, posts, startPage, endPage, isLoading = false) {
        this.#eventHandlers.log('ModalManager', `유저 작성글 팝업 표시. 유저: ${targetUserInfo?.titleDisplay || '정보 없음'}, 글 개수: ${posts.length}, 로딩 중: ${isLoading}`);
        const modal = this.#getOrCreateUserPostsModal();
        const titleSpan = modal.querySelector('.modal-title > span');
        const contentDiv = modal.querySelector('.modal-content');

        const titleDisplay = targetUserInfo?.titleDisplay || '알 수 없는 유저';
        titleSpan.textContent = `${titleDisplay}의 작성글 (${startPage} ~ ${endPage}페이지)`;

        let footer = modal.querySelector('.modal-footer');
        if (!footer) {
            footer = document.createElement('div');
            footer.className = 'modal-footer';
            modal.appendChild(footer);
        }

        if (isLoading) {
            contentDiv.innerHTML = `<p>게시물을 불러오는 중... (0%)</p><small>페이지 양에 따라 시간이 소요될 수 있습니다.</small>`;
            footer.style.display = 'none';
        } else {
            if (posts.length === 0) {
                contentDiv.innerHTML = '<p>해당 범위에서 유저가 작성한 글을 찾지 못했습니다.</p>';
                footer.style.display = 'none';
            } else {
                const galleryId = galleryParser.galleryId;
                const basePath = window.location.pathname.replace(/\/lists\/?/, '/view/');
                let listHtml = `<p>총 ${posts.length}개의 글을 찾았습니다. (최대 ${this.#config.CONSTANTS.MAX_USER_POSTS_TO_DISPLAY}개 표시)</p><ul class="user-posts-list">`;

                for (const post of posts) {
                    const postDate = post.timestamp ? ((d, p) => `${d.getFullYear().toString().slice(-2)}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`)(new Date(post.timestamp), n => String(n).padStart(2, '0')) : '날짜 없음';
                    const postViewUrl = (galleryId && post.post_no) ? `${basePath}?id=${galleryId}&no=${post.post_no}` : '#';
                    const escapedTitle = this.#eventHandlers.escapeHtml(post.title || '제목 없음');
                    listHtml += `<li style="margin-bottom: 5px;"><a href="${postViewUrl}" target="_blank" rel="noopener noreferrer">${escapedTitle}</a><small style="opacity: 0.7;">(글번호: ${post.post_no}, ${postDate}, 조회: ${post.views}, 추천: ${post.reco})</small></li>`;
                }
                contentDiv.innerHTML = listHtml + '</ul>';

                footer.style.display = 'flex';
                footer.innerHTML = `<button id="${this.#config.UI.ANALYZE_USER_BUTTON_ID}" class="ai-summary-btn">AI 유저 분석</button>`;
                document.getElementById(this.#config.UI.ANALYZE_USER_BUTTON_ID)?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const postTitles = posts.map(p => p.title).filter(Boolean);
                    if (postTitles.length > 0) {
                        this.#eventHandlers.onAnalyzeUserRequest(targetUserInfo, postTitles);
                    } else {
                        alert('분석할 게시글 제목이 없습니다.');
                    }
                });
            }
        }
        modal.style.display = 'block';
        this.#uiManager.updateTheme();
    }

    showExportBanListModal(preParsedRecords = []) {
        const modal = this.#getOrCreateExportBanListModal();
        const titleSpan = modal.querySelector('.modal-title > span');
        const contentDiv = modal.querySelector('.modal-content');

        const titleDisplay = '차단 내역 내보내기';
        titleSpan.textContent = titleDisplay;

        let footer = modal.querySelector('.modal-footer');
        if (!footer) {
            footer = document.createElement('div');
            footer.className = 'modal-footer';
            modal.appendChild(footer);
        }

        const storedSheetId = GM_getValue('spreadsheetId', '');

        let currentState = 'confirm'; // confirm, parsing, parsed
        let parsedRecords = preParsedRecords;

        const updateContent = () => {
            if (currentState === 'confirm') {
                contentDiv.innerHTML = this.#uiManager.renderParseConfirmModalContent();
                footer.style.display = 'none';
                contentDiv.querySelector('#parseConfirmBtn').onclick = async () => {
                    currentState = 'parsing';
                    updateContent();

                    parsedRecords = await this.#eventHandlers.onStartParsing((progressMsg) => {
                        contentDiv.innerHTML = `<p>${progressMsg}</p>`;
                    });
                    currentState = 'parsed';
                    updateContent();
                };
            } else if (currentState === 'parsed') {
                contentDiv.innerHTML = this.#uiManager.renderUploadConfirmModalContent();
                footer.style.display = 'none';

                contentDiv.querySelector('#uploadConfirmBtn').onclick = () => {
                    const sheetId = contentDiv.querySelector('#sheetIdInput').value.trim();
                    if (!sheetId) {
                        alert('시트 ID를 입력해주세요.');
                        return;
                    }
                    GM_setValue('spreadsheetId', sheetId);
                    this.#eventHandlers.onUploadParsed(sheetId, parsedRecords);
                    modal.style.display = 'none';
                };
            } else {
                contentDiv.innerHTML = `<p>불러오는 중...</p>`;
                footer.style.display = 'none';
            }
        };

        updateContent();
        modal.style.display = 'block';
        this.#uiManager.updateTheme();
    }
}

class UIManager {
    #config;
    #state;
    #eventHandlers;
    #log;

    constructor(config, state, eventHandlers, log) {
        this.#config = config;
        this.#state = state;
        this.#state.lastRenderedStats = {};
        this.#eventHandlers = eventHandlers;
        this.#log = log || (() => { });
    }

    injectExportBanListButton() {
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

        if (document.getElementById('gallscopeExportBanListContainer')) return;

        const container = document.createElement('div');
        container.id = 'gallscopeExportBanListContainer';
        container.style.cssText = `
            display: inline-flex;
            align-items: center;
            margin-left: 10px;
        `;
        container.innerHTML = `
            <button id="gallscopeExportBanListBtn"
                    class="modal-confirm-btn"
                    style="padding:4px 8px; font-size:13px;"
                    title="차단 목록을 콘솔에 출력">
            차단목록 내보내기
            </button>
        `;
        leftContainer.appendChild(container);

        document.getElementById('gallscopeExportBanListBtn').addEventListener('click', () => this.#eventHandlers.onFetchBanList());

        console.log('Gallscope: 차단목록 내보내기 버튼 삽입 완료.');
    }

    renderParseConfirmModalContent() {
        return `
        <div class="export-ban-list-modal-content">
            <div>차단 내역을 불러오고 Google 시트에 업로드합니다.</div style="font-weight:700; font-size:15px;"><p>먼저 차단 내역을 불러오시겠습니까?</p>
            <div class="scope-modal-footer">
                <div class="scope-modal-buttons">
                    <button id="parseConfirmBtn" class="modal-confirm-btn">확인</button><button id="parseCancelBtn" class="modal-cancel-btn">취소</button>
                </div>
            </div>
        </div>`;
    }

    renderUploadConfirmModalContent() {
        return `
        <div class="export-ban-list-modal-content">
            <div>차단 내역을 Google 시트에 업로드합니다.</div>
            <div>업로드하시겠습니까?</div>
            <div class="scope-modal-footer">
                <div class="scope-modal-buttons">
                    <button id="uploadConfirmBtn" class="modal-confirm-btn">확인</button>
                    <button id="uploadCancelBtn" class="modal-cancel-btn">취소</button>
                </div>
            </div>
        </div>`;
    }

    isDarkMode() {
        if (!isMobile) {
            return !!document.getElementById('css-darkmode');
        }

        return !!document.documentElement.classList.contains('darkmode');
    }

    updateTheme() {
        const isDark = this.isDarkMode();
        document.body.classList.toggle('gallscope-dark-theme', isDark);
        document.body.classList.toggle('gallscope-light-theme', !isDark);
    }
}

class Gallscope {
    #config;
    #state;
    #utils;
    #uiManager;
    #modalManager;

    constructor(config, state, utils, UIManager, ModalManager) {
        this.#config = config;
        this.#state = state;
        this.#utils = utils;

        const eventHandlers = this.#createEventHandlers();

        this.#uiManager = new UIManager(config, state, eventHandlers, this.#utils.log);
        this.#modalManager = new ModalManager(config, state, eventHandlers, this.#uiManager);
    }

    async init() {
        this.#uiManager.injectExportBanListButton();
    }

    #createEventHandlers() {
        return {
            log: this.#utils.log,
            getFormattedTimestamp: this.#utils.getFormattedTimestamp,
            sleep: this.#utils.sleep,
            escapeHtml: this.#utils.escapeHtml,
            onShowScopeInput: () => this.#modalManager.showScopeInput(),
            onFetchBanList: () => this.#modalManager.showExportBanListModal(),
            onStartParsing: async (progressCallback) => this.exportBanList(progressCallback),
        };
    }

    async exportBanList(progressCallback) {
        const gallId = galleryParser.galleryId;
        const gallType = galleryParser.galleryType === 'mgallery' ? 'M' : (galleryParser.galleryType === 'mini' ? 'MI' : '');
        const allBanRecords = [];

        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        for (let i = 1; i <= this.#config.CONSTANTS.MAX_BAN_LIST_PAGES_LIMIT; i += this.#config.CONSTANTS.BAN_LIST_BATCH_SIZE) {
            const batch = Array.from({ length: this.#config.CONSTANTS.BAN_LIST_BATCH_SIZE }, (_, j) => i + j);

            let results
            try {
                results = await Promise.all(batch.map(page => this.fetchBanPage(gallId, gallType, page)));
            } catch (err) {
                console.error(`[Gallscope] 페이지 요청 중 오류 발생: ${err}`);
                i -= this.#config.CONSTANTS.BAN_LIST_BATCH_SIZE; // 현재 페이지를 다시 시도
                console.warn(`[Gallscope] 페이지 ${i} 재시도합니다.`);
                continue;
            }

            // 결과에 오류 있으면 다시 시도
            if (results.some(result => result.status === 'error')) {
                console.error(`[Gallscope] 일부 페이지 요청 실패, 다시 시도합니다.`);
                i -= this.#config.CONSTANTS.BAN_LIST_BATCH_SIZE; // 현재 페이지를 다시 시도
                console.warn(`[Gallscope] 페이지 ${i} 재시도합니다.`);
                continue;
            }

            let isEmpty = false;
            for (const result of results) {
                if (result.status === 'empty') {
                    isEmpty = true;
                    break; // 빈 페이지가 나오면 종료
                }

                allBanRecords.push(...result.parsed);
                console.log(`[Gallscope] ${result.page}페이지 처리 완료. 누적 ${allBanRecords.length}개`);

                if (typeof progressCallback === 'function') {
                    progressCallback(`페이지 ${result.page} 처리 완료 - 누적 ${allBanRecords.length}건`);
                }
            }

            if (isEmpty) {
                console.log(`[Gallscope] ${gallId} 갤러리의 차단 내역이 더 이상 없습니다.`);
                progressCallback(`빈 페이지 감지됨. 수집 종료.`);
                break; // 빈 페이지가 나오면 종료
            }

            await delay(this.#config.CONSTANTS.BAN_LIST_FETCH_DELAY_MS); // 배치 쿨타임
        }

        if (typeof progressCallback === 'function') {
            progressCallback(`총 ${allBanRecords.length}건 수집 완료`);
        }

        console.log('[Gallscope] 최종 차단 내역:', allBanRecords);
        //this.sendToGoogleSheet(gallId, allBanRecords);

        return allBanRecords;
    }

    async fetchBanPage(gallId, gallType, page) {
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

            const parsed = this.parseBanList(res.responseText);
            return {
                status: 'success',
                page,
                parsed
            };
        } catch (err) {
            return {
                status: 'error',
                page,
                error: err
            };
        }
    }

    sendToGoogleSheet(gallId, blockedList) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: this.#config.APPS_SCRIPT_URL,
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

    parseBanList(htmlText) {
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

    renderBanExportModalContent(state = {}) {
        const {
            currentStep = 'confirm', // 'confirm' | 'parsing' | 'readyToUpload' | 'done'
            progressText = '',
            sheetId = '',
            resultMessage = ''
        } = state;

        let innerHTML = '';

        if (currentStep === 'confirm') {
            innerHTML = `
                <div style="font-weight:700; font-size:15px;">차단 내역 내보내기</div>
                <p>차단 내역을 가져오고 시트에 업로드합니다.<br>진행하시겠습니까?</p>
                <div class="modal-footer" style="justify-content: flex-end;">
                    <button id="banExportConfirmBtn" class="modal-confirm-btn">확인</button>
                    <button id="banExportCancelBtn" class="modal-cancel-btn">취소</button>
                </div>
            `;
        } else if (currentStep === 'parsing') {
            innerHTML = `
                <p>차단 내역을 수집 중입니다...</p>
                <p style="font-size: 13px; color: gray;">${progressText || '0%'}</p>
            `;
        } else if (currentStep === 'readyToUpload') {
            innerHTML = `
                <p>총 ${state.totalCount}개의 차단 항목이 수집되었습니다.</p>
                <div style="margin-top: 12px;">
                    <label for="gallscopeSheetIdInput">스프레드시트 ID:</label><br>
                    <input id="gallscopeSheetIdInput" type="text" value="${sheetId}" style="width: 100%; padding: 5px; font-size: 13px;" />
                </div>
                <div class="modal-footer" style="justify-content: flex-end; margin-top: 12px;">
                    <button id="banExportUploadBtn" class="modal-confirm-btn">업로드</button>
                </div>
            `;
        } else if (currentStep === 'done') {
            innerHTML = `
                <p>${resultMessage}</p>
                <div class="modal-footer" style="justify-content: flex-end; margin-top: 12px;">
                    <button id="banExportCloseBtn" class="modal-confirm-btn">닫기</button>
                </div>
            `;
        }

        return `<div class="ban-export-modal-content">${innerHTML}</div>`;
    }
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

const config = {
    DEBUG_MODE: true,
    AI_SUMMARY_FEATURE_ENABLED: true,
    ICON_URL: 'https://pbs.twimg.com/media/GmykGIJbAAA98q1.png:orig',
    CHARTJS_CDN_URL: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js',
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxN7o_bERDYBRlqy_yR1fgfMBnGeysZwmt159DLG6Wxjwqvoim8W8j3veq5bPUDy-rV/exec', // 실제 URL로 교체

    DRAG_EVENTS: {
        START: 'mousedown',
        MOVE: 'mousemove',
        END: 'mouseup'
    },

    API: {
        GEMINI_API_KEY_ID: 'GEMINI_API_KEY_DCIMON_V2',
        GEMINI_MODEL_ID: 'GEMINI_MODEL_DCIMON_V1',
        DEFAULT_GEMINI_MODEL: 'gemini-2.0-flash',
        AVAILABLE_MODELS: ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite-preview-06-17'],
        API_MAX_RETRIES: 3,
        API_RETRY_BACKOFF_SECONDS: 2,
    },

    SELECTORS: {
        POST_ROW: 'tr.ub-content.us-post',
        POST_ROW_MOBILE: 'div.gall-detail-lnktb',
        POST_NOTICE_NUM: 'td.gall_num',
        POST_SUBJECT: 'td.gall_subject',
        POST_SUBJECT_MOBILE: 'div.gall-detail-lnktb ul.ginfo li:nth-child(1)',
        POST_WRITER: 'td.gall_writer',
        POST_WRITER_MOBILE: 'div.gall-detail-lnktb ul.ginfo li:nth-child(2)',
        POST_TITLE: 'td.gall_tit.ub-word > a',
        POST_VIEWS: 'td.gall_count',
        POST_VIEWS_MOIBLE: 'div.gall-detail-lnktb ul.ginfo li:nth-child(4)',
        POST_RECOMMEND: 'td.gall_recommend',
        POST_RECOMMEND_MOBILE: 'div.gall-detail-lnktb ul.ginfo li:nth-child(5) span',
        POST_REPLY_NUM: 'a.reply_numbox',
        POST_REPLY_NUM_MOBILE: 'div.gall-detail-lnktb span.ct',
        POST_ICON_IMG: 'em.icon_img',
        POST_DATE: 'td.gall_date',
        POST_DATE_MOBILE: 'div.gall-detail-lnktb ul.ginfo li:nth-child(3)',
        USER_POPUP_UL: 'ul.user_data_list',
    },

    UI: {
        SCOPE_BOX_ID: 'gallscopeBox',
        TOOLTIP_ID: 'gallscopeTooltip',
        AI_MODAL_ID: 'gallscopeAIModal',
        SCOPE_INPUT_MODAL_ID: 'gallscopeScopeInputModal',
        GRAPH_MODAL_ID: 'gallscopeGraphModal',
        USER_POSTS_MODAL_ID: 'gallscopeUserPostsModal',
        AI_USER_ANALYSIS_MODAL_ID: 'gallscopeAIUserAnalysisModal',
        AI_SUMMARY_BUTTON_ID: 'gallscopeAISummaryBtn',
        AI_ANALYSIS_BUTTON_ID: 'gallscopeAIAnaBtn',
        ANALYZE_USER_BUTTON_ID: 'gallscopeAnalyzeUserBtn',
        SCOPE_EXTENSION_MENU_ITEM_CLASS: 'gallscope-scope-extension-li',
        SCOPE_EXTENSION_MENU_ITEM_TEXT: '집중 스코프',
        GALLSCOPE_BOX_POSITION_ID: 'gallscopeBoxPosition',
        GALLSCOPE_BOX_EXPANDED_ID: 'gallscopeBoxExpanded',
        TOGGLE_BUTTON_ID: 'gallscope-toggle-btn',
        GALLSCOPE_BOX_VISIBILITY_ID: 'gallscopeBoxVisibility_v2',
        GALLSCOPE_TOGGLE_BUTTON_POSITION_ID: 'gallscopeToggleButtonPosition',
        NEW_USER_HIGHLIGHT_CLASS: 'gallscope-new-user-highlight',
        EXPORT_BAN_LIST_MODAL_ID: 'gallscopeExportBanListModal',
    },

    CONSTANTS: {
        USER_TYPE_ICON: {
            SEMI_FIXED: 'nik.gif'
        },
        USER_TYPES: {
            FIXED: 'fixed',
            SEMI: 'semi',
            GUEST: 'guest',
            UNKNOWN: 'unknown'
        },
        SENTIMENT_TYPES: {
            POSITIVE: 'positive',
            NEGATIVE: 'negative',
            NEUTRAL: 'neutral'
        },
        GPI_MIN_POST_THRESHOLD: 25,
        MAX_SCOPE_PAGES_LIMIT: 200,
        MULTI_PAGE_FETCH_CHUNK_SIZE: 5,
        MULTI_PAGE_FETCH_CHUNK_DELAY: 300,
        COPY_SUCCESS_MESSAGE_DURATION: 2000,
        MULTI_PAGE_FETCH_RETRY_COUNT: 2,
        MULTI_PAGE_FETCH_TIMEOUT_MS: 8000,
        MULTI_PAGE_ANALYSIS_TIMEOUT_MS: 120000,
        MIN_PERCENT_FOR_TEXT_IN_BAR: 15,
        MAX_USER_POSTS_TO_DISPLAY: 200,
        GPI_NORMALIZATION_POINTS: [{
            gpi: 0.000,
            normalized: 0.00
        }, {
            gpi: 0.040,
            normalized: 0.25
        }, {
            gpi: 0.055,
            normalized: 0.50
        }, {
            gpi: 0.080,
            normalized: 0.75
        }, {
            gpi: 0.150,
            normalized: 1.00
        },],
        KNOWN_USERS_CACHE_PREFIX: 'gallscope_known_users_v2_lru',
        KNOWN_USERS_CACHE_SIZE: 10000,
        NEW_USER_HIGHLIGHT_THRESHOLD: 0.8,
        KNOWN_USERS_EXPIRATION_DAYS: 15,
        CACHE_HIGHLIGHT_ENABLED_KEY: 'gallscope_cache_highlight_enabled',
        CACHE_EXPIRATION_DAYS_KEY: 'gallscope_cache_expiration_days',
        DEFAULT_CACHE_EXPIRATION_DAYS: 15,
        LOW_ACTIVITY_POST_THRESHOLD: 5,
        LOW_ACTIVITY_EXPIRATION_HOURS: 48,
        LAST_PRUNING_TIME_PREFIX: 'gallscope_last_pruning_time_',
        IP_LIST: null,
        IP_OWNER_LIST: null,
        IP_OWNER_LIST_KEY: null,
        VPN_LIST: null,
        VPN_LIST_KEY: null,
        MGALL_PERMABAN_LIST: null,
        MGALL_PERMABAN_LIST_KEY: null,
        DC_MEMO: null,
        BAN_LIST_BATCH_SIZE: 5,
        BAN_LIST_FETCH_DELAY_MS: 100,
        MAX_BAN_LIST_PAGES_LIMIT: 1000
    },

    STATUS_LEVELS: [{
        tag: '양호',
        icon: '🟢',
        textColor: '#19e650'
    }, {
        tag: '주의',
        icon: '🟡',
        textColor: '#ffc107'
    }, {
        tag: '경계',
        icon: '🟠',
        textColor: '#fd7e14'
    }, {
        tag: '심각',
        icon: '🔴',
        textColor: '#dc3545'
    }],

    TEXTS: {
        REPORT_HEALTH_INTERPRETATIONS: [
            '매우 안정적이고 활발한 상태입니다.',
            '일부 소수 유저의 활동이 두드러지기 시작하는 단계입니다.',
            '소수 유저의 점유율이 높고, 잠재적인 분쟁 위험이 있습니다.',
            '갤러리가 소수 인원에 의해 주도되고 있으며, 매우 높은 주의가 필요합니다.'
        ],
        REPORT_GPI_INTERPRETATIONS: {
            high: '소수 유저의 글 점유율이 매우 높은 상태입니다.',
            mediumHigh: '소수 유저의 글 점유율이 다소 높은 편입니다.',
            medium: '소수 유저의 글 점유율이 보통 수준입니다.',
            low: '다양한 유저가 글을 작성하는 건강한 상태입니다.'
        },
        REPORT_AI_INTERPRETATIONS: [
            '긍정/부정 여론이 적고 안정적인 상태입니다.',
            '부정적 여론이 일부 존재하나, 대체로 안정적입니다.',
            '부정적 여론이 상당수 존재하며, 분쟁 가능성이 있습니다.',
            '부정적 여론이 지배적이며, 갤러리 분위기가 매우 혼란합니다.'
        ]
    }
};

const state = {
    geminiApiKey: '',
    selectedGeminiModel: config.API.DEFAULT_GEMINI_MODEL,
    analysisBoxElement: null,
    boxElements: null,
    tooltipElement: null,
    aiModalElement: null,
    scopeInputModalElement: null,
    tableAnchorElement: null,
    isBoxExpanded: false,
    isBoxMovedByUser: false,
    userBoxPosition: null,
    isBoxVisible: true,
    lastCalculatedStats: {},
    debounceTimers: {
        analysis: null,
        resize: null
    },
    isAIFetching: false,
    chartJsLoadPromise: null,
    graphModalElement: null,
    isUserSpecificScopeMode: false,
    currentUserScopeTarget: null,
    userPostsModalElement: null,
    wasDragging: false,
    cacheExpirationMenuId: null,
    dragStartX: 0,
    dragStartY: 0,
    sessionCache: null,
    aiUserAnalysisModalElement: null,
    isCacheHighlightEnabled: false,
};

const utils = {
    log: (context, ...messages) => {
        if (config.DEBUG_MODE) console.log(`[Gallscope]${context ? `[${context}]` : ''}`, ...messages);
    },
    formatPercent: n => `${(n * 100).toFixed(1)}%`,
    getFormattedTimestamp: () => new Date().toLocaleString('sv-SE').replace(' ', ' ').substring(0, 16).replace('T', ' '),
    maskWriterInfo: (fullName) => {
        const namePart = fullName.trim();
        const match = namePart.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
        const maskOctet = octetStr => (!octetStr) ? '' : (octetStr.length === 1) ? '*' : `${octetStr.slice(0, -1)}*`;
        const isTwoOctetIP = str => typeof str === 'string' && str.split('.').length === 2 && str.split('.').every(part => part.length > 0 && /^\d+$/.test(part));

        if (!match) {
            if (isTwoOctetIP(namePart)) {
                const octets = namePart.split('.');
                return `${maskOctet(octets[0])}.${maskOctet(octets[1])}`;
            }
            if (namePart.length <= 1) return namePart;
            return namePart.length === 2 ? `${namePart[0]}*` : namePart.substring(0, 2) + '*'.repeat(namePart.length - 2);
        }

        const [, name, id] = match;
        let maskedName = name.length <= 1 ? name : (name.length === 2 ? `${name[0]}*` : name.substring(0, 2) + '*'.repeat(name.length - 2));
        let maskedId;
        if (isTwoOctetIP(id)) {
            const octets = id.split('.');
            maskedId = `${maskOctet(octets[0])}.${maskOctet(octets[1])}`;
        } else {
            maskedId = id.length <= 3 ? id : id.substring(0, 3) + '*'.repeat(id.length - 3);
        }
        return `${maskedName} (${maskedId})`;
    },
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    escapeHtml: text => {
        if (typeof text !== 'string') return text;
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    },
};

const isMobile = location.hostname === 'm.dcinside.com';
const galleryParser = new PostParser();
await galleryParser.init();

const MAX_PAGE = 500;
const BATCH_SIZE = 5;
const PAGE_DELAY_MS = 100;

(async () => {
    // --- Script Entry Point ---

    'use strict';

    const gallscope = new Gallscope(
        config,
        state,
        utils,
        UIManager,
        ModalManager
    );

    await gallscope.init();
})();