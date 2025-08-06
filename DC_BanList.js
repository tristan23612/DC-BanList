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
// @downloadURL https://raw.githubusercontent.com/tristan23612/DC-BanList/refs/heads/main/DC_BanList.js
// @updateURL https://raw.githubusercontent.com/tristan23612/DC-BanList/refs/heads/main/DC_BanList.js
// ==/UserScript==

class ModalManager {
    #config;
    #state;
    #eventHandlers;
    #uiManager;

    #exportBanListModal;

    constructor(config, state, eventHandlers, uiManager) {
        this.#config = config;
        this.#state = state;
        this.#eventHandlers = eventHandlers;
        this.#uiManager = uiManager;

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

    #getOrCreateExportBanListModal = () => {
        if (this.#exportBanListModal) return this.#exportBanListModal;

        const modal = this.#_createModal(this.#config.UI.EXPORT_BAN_LIST_MODAL_ID, '차단 내역 내보내기');
        this.#exportBanListModal = modal;
        this.#state.exportModalElement = modal;
        return modal;
    }

    hideExportBanListModal() {
        if (this.#exportBanListModal) this.#exportBanListModal.style.display = 'none';
    }

    showExportBanListModal() {
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

        const storedSheetId = GM_getValue('spreadsheetId', '시트 ID를 입력해주세요.');

        let currentStep = 'SheetIdConfirmation'; // confirm, Parsing, ReadyToUpload
        let banList = [];
        let resultMessage = ''
        let sheetId = ''

        const updateContent = () => {
            if (currentStep === 'SheetIdConfirmation') {
                contentDiv.innerHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep: currentStep,
                    sheetId: storedSheetId,
                });
                footer.style.display = 'none';

                contentDiv.querySelector('#sheetIdConfirmBtn').onclick = async () => {
                    sheetId = contentDiv.querySelector('#sheetIdInput').value.trim() || storedSheetId;
                    if (!sheetId || sheetId === '시트 ID를 입력해주세요.') {
                        alert('시트 ID를 입력해주세요.');
                        return;
                    }
                    GM_setValue('spreadsheetId', sheetId);
                    currentStep = 'OAuthConfirmation';
                    updateContent();
                };

                contentDiv.querySelector('#sheetIdCancelBtn').onclick = async () => {
                    this.hideExportBanListModal()
                }
            }
            else if (currentStep === 'OAuthConfirmation') {
                contentDiv.innerHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep: currentStep,
                    sheetId: storedSheetId,
                });

                footer.style.display = 'none';
                contentDiv.querySelector('#oauthConfirmBtn').onclick = async () => {
                    currentStep = 'ExportConfirmation';
                    updateContent();
                };

                contentDiv.querySelector('#oauthCancelBtn').onclick = async () => {
                    this.hideExportBanListModal()
                };
            }
            else if (currentStep === 'ExportConfirmation') {
                contentDiv.innerHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep,
                });
                footer.style.display = 'none';

                contentDiv.querySelector('#parseConfirmBtn').onclick = () => {
                    currentStep = 'Parsing';
                    updateContent();
                }

                contentDiv.querySelector('#parseCancelBtn').onclick = async () => {
                    this.hideExportBanListModal()
                }
            }
            else if (currentStep === 'Parsing') {
                const progressText = ''
                contentDiv.innerHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep: currentStep,
                    progressText,
                });
                footer.style.display = 'none';
                this.#eventHandlers.onStartParsing((progressMsg) => {
                    contentDiv.innerHTML = this.#uiManager.renderBanExportModalContent({
                        currentStep: 'Parsing',
                        progressText: progressMsg
                    });
                }).then(result => {
                    banList = result;
                    if (banList.length === 0) {
                        currentStep = 'UploadComplete';
                        resultMessage = '갱신할 차단 내역이 없습니다. 업로드를 건너뜁니다.';
                        updateContent();
                    }
                    else {
                        currentStep = 'ReadyToUpload';
                        updateContent();
                    }
                }).catch(err => {
                    console.error('[Gallscope] 수집 중 오류 발생:', err);
                    if (err.name === 'PermissionError') {
                        currentStep = 'PermissionError';
                        resultMessage = err.message;
                        updateContent();
                    }
                    else if (err.name === 'NotLoggedInError') {
                        currentStep = 'NotLoggedInError';
                        updateContent();
                    }
                    else if (err.name === 'OAuthUnauthorizedError') {
                        currentStep = 'OAuthUnauthorizedError';
                        updateContent();
                    }
                    else if (err.name === 'SheetAccessDeniedError') {
                        currentStep = 'SheetAccessDeniedError';
                        updateContent();
                    }
                    else {
                        currentStep = 'ParseError';
                        resultMessage = err.message || '알 수 없는 오류가 발생했습니다.';
                        console.error('[Gallscope] 차단 내역 수집 중 오류 발생:', resultMessage);
                        this.#eventHandlers.log(`[Gallscope] 차단 내역 수집 중 오류 발생: ${resultMessage}`);
                        updateContent();
                    }
                });
            }
            else if (currentStep === 'ReadyToUpload') {
                contentDiv.innerHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep: currentStep,
                    sheetId: storedSheetId,
                    banListLength: banList.length,
                });
                footer.style.display = 'none';

                contentDiv.querySelector('#uploadConfirmBtn').onclick = async () => {
                    currentStep = 'UploadInProgress';
                    updateContent();
                };

                contentDiv.querySelector('#uploadCancelBtn').onclick = async () => {
                    this.hideExportBanListModal()
                }
            }
            else if (currentStep === 'UploadInProgress') {
                contentDiv.innerHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep,
                });
                footer.style.display = 'none';

                (async () => {
                    try {
                        resultMessage = await this.#eventHandlers.sendToGoogleSheet(sheetId, banList);
                        currentStep = 'UploadComplete'
                        console.log(`[Gallscope] 차단 내역 업로드 완료: ${resultMessage}`);
                        updateContent();
                    }
                    catch (e) {
                        resultMessage = e
                        if (e.name === 'NotLoggedInError') {
                            currentStep = 'NotLoggedInError';
                            updateContent();
                        }
                        else if (e.name === 'OAuthUnauthorizedError') {
                            currentStep = 'OAuthUnauthorizedError';
                            updateContent();
                        }
                        else if (e.name === 'SheetAccessDeniedError') {
                            currentStep = 'SheetAccessDeniedError';
                            updateContent();
                        }
                        else {
                            currentStep = 'UploadError'
                            resultMessage = e.message || '알 수 없는 오류가 발생했습니다.';
                            updateContent();
                        }
                    }
                })();
            }
            else if (currentStep === 'NotLoggedInError') {
                contentDiv.innerHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep: currentStep,
                    resultMessage,
                });
                footer.style.display = 'none';

                contentDiv.querySelector('#backToSheetIdConfirmationBtn').onclick = async () => {
                    currentStep = 'SheetIdConfirmation';
                    updateContent();
                };

                contentDiv.querySelector('#uploadCancelBtn').onclick = async () => {
                    this.hideExportBanListModal()
                }
            }
            else if (currentStep === 'OAuthUnauthorizedError') {
                contentDiv.innerHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep: currentStep,
                    resultMessage,
                });
                footer.style.display = 'none';

                contentDiv.querySelector('#backToSheetIdConfirmationBtn').onclick = async () => {
                    currentStep = 'SheetIdConfirmation';
                    updateContent();
                };

                contentDiv.querySelector('#uploadCancelBtn').onclick = async () => {
                    this.hideExportBanListModal()
                }
            }
            else if (currentStep === 'SheetAccessDeniedError') {
                contentDiv.innerHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep: currentStep,
                    resultMessage,
                });
                footer.style.display = 'none';
                contentDiv.querySelector('#backToSheetIdConfirmationBtn').onclick = async () => {
                    currentStep = 'SheetIdConfirmation';
                    updateContent();
                }
                contentDiv.querySelector('#uploadCancelBtn').onclick = async () => {
                    this.hideExportBanListModal()
                }
            }
            else if (currentStep === 'UploadError') {
                contentDiv.innerHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep: currentStep,
                    resultMessage,
                });
                footer.style.display = 'none';

                contentDiv.querySelector('#backToUploadBtn').onclick = async () => {
                    currentStep = 'ReadyToUpload';
                    updateContent();
                };

                contentDiv.querySelector('#uploadCancelBtn').onclick = async () => {
                    this.hideExportBanListModal()
                }
            }
            else if (currentStep === 'UploadComplete') {
                contentDiv.innerHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep: currentStep,
                    resultMessage
                });
                footer.style.display = 'none';
            }
            else {
                contentDiv.innerHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep: currentStep,
                    resultMessage
                });
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
        if (this.#state.analysisBoxElement && Object.keys(this.#state.lastCalculatedStats).length > 0) {
            this.renderAnalysisBox(this.#state.lastCalculatedStats);
        }
    }

    async injectStyles() {
        if (document.getElementById('gallscope-styles')) return;

        console.log('Loading CSS from remote source...');
        const res = await fetch('https://raw.githubusercontent.com/tristan23612/DC-ModScope/refs/heads/main/data/css.css');

        if (!res.ok) throw new Error("CSS fetch failed")
        else console.log('CSS loaded successfully');

        const cssRaw = await res.text();

        const css = cssRaw
            .replaceAll('___SCOPE_BOX_ID___', this.#config.UI.SCOPE_BOX_ID)
            .replaceAll('___TOGGLE_BUTTON_ID___', this.#config.UI.TOGGLE_BUTTON_ID)
            .replaceAll('___ICON_URL___', this.#config.ICON_URL)
            .replaceAll('___USER_POSTS_MODAL_ID___', this.#config.UI.USER_POSTS_MODAL_ID)
            .replaceAll('___AI_USER_ANALYSIS_MODAL_ID___', this.#config.UI.AI_USER_ANALYSIS_MODAL_ID)
            .replaceAll('___SCOPE_INPUT_MODAL_ID___', this.#config.UI.SCOPE_INPUT_MODAL_ID)
            .replaceAll('___EXPORT_BAN_LIST_MODAL_ID___', this.#config.UI.EXPORT_BAN_LIST_MODAL_ID)
            .replaceAll('___GRAPH_MODAL_ID___', this.#config.UI.GRAPH_MODAL_ID)
            .replaceAll('___AI_MODAL_ID___', this.#config.UI.AI_MODAL_ID)
            .replaceAll('___TOOLTIP_ID___', this.#config.UI.TOOLTIP_ID)
            .replaceAll('___NEW_USER_HIGHLIGHT_CLASS___', this.#config.UI.NEW_USER_HIGHLIGHT_CLASS)
            .replace(/\s+/g, ' ').trim();

        const styleEl = document.createElement('style');
        styleEl.id = 'dc-modscope-styles';
        styleEl.textContent = css;
        document.head.appendChild(styleEl);
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
            차단 내역 내보내기
            </button>
        `;
        leftContainer.appendChild(container);

        document.getElementById('gallscopeExportBanListBtn').addEventListener('click', () => this.#eventHandlers.onShowExportBanListModal());

        console.log('Gallscope: 차단 내역 내보내기 버튼 삽입 완료.');
    }

    renderBanExportModalContent(state = {}) {
        const {
            currentStep = 'confirm', // 'confirm' | 'Parsing' | 'ReadyToUpload' | 'done'
            progressText = '',
            sheetId = '',
            resultMessage = '',
            banListLength = 0,
        } = state;

        let innerHTML = '';
        if (currentStep === 'SheetIdConfirmation') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">기존 데이터 확인을 위해 시트 ID가 먼저 필요합니다.</div>
                <div>구글 시트 ID를 입력해주세요.</div>
                <div style="font-size: 13px; color: gray;">https://docs.google.com/spreadsheets/d/*/~~</div>
                <div style="font-size: 13px; color: gray;">* 부분 문자열을 입력해주세요.</div>
                <div style="font-size: 13px; color: gray;">공란일시 이전에 입력한 ID가 적용됩니다.</div>
                <div style="font-size: 13px; color: gray;">변경을 원치 않으시면 바로 확인을 눌러주세요.</div>
                <div class="sheet-id-input-group">
                    <input type="text" id="sheetIdInput" class="sheet-id-input" 
                        placeholder="${sheetId}"/>
                </div>
                <div class="export-ban-list-modal-footer">
                    <div class="modal-buttons">
                        <button id="sheetIdConfirmBtn" class="modal-confirm-btn">확인</button>
                        <button id="sheetIdCancelBtn" class="modal-cancel-btn">취소</button>
                    </div>
                </div>
            </div>`;
        }
        else if (currentStep === 'OAuthConfirmation') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">Google Apps Script 권한 승인</div>
                <div>GAS를 사용하려면 OAuth 권한 승인이 필요합니다.</div>
                <div>아래 링크를 클릭하여 권한을 확인해주세요.</div>
                <a href="${this.#config.APPS_SCRIPT_URL}" target="_blank" style="font-size: 13px; color: #007BFF;">
                    GAS 승인 페이지로 이동
                </a>
                <a href="${this.#config.APPS_SCRIPT_AUTH_DEMONSTRATION_URL}" target="_blank" style="font-size: 13px; color: #007BFF;">
                    GAS 승인 가이드 영상
                </a>
                <div style="font-size: 13px; color: gray;">오랜 기간이 지나면 인증이 초기화되었을 가능성이 있습니다.</div>
                <div style="font-size: 13px; color: gray;">지속적으로 문제 발생시 다음 미니갤로 제보해주세요.</div>
                <a href="https://gall.dcinside.com/mini/mangonote" target="_blank" style="font-size: 13px; color: gray;">
                    https://gall.dcinside.com/mini/mangonote
                </a>
                <div><br></div>
                <div class="export-ban-list-modal-footer">
                    <div class="modal-buttons">
                        <button id="oauthConfirmBtn" class="modal-confirm-btn">권한 인증 완료</button>
                        <button id="oauthCancelBtn" class="modal-cancel-btn">취소</button>
                    </div>
                </div>
            </div>`;
        }
        else if (currentStep === 'ExportConfirmation') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">차단 내역을 불러오시겠습니까?</div>
                <div>차단 내역을 수집하여 Google 시트에 업로드합니다.</div>
                <div>매니저의 권한으로 마스킹이 제거된 리스트를 수집합니다.</div>
                <div><br></div>
                <div class="export-ban-list-modal-footer">
                    <div class="modal-buttons">
                        <button id="parseConfirmBtn" class="modal-confirm-btn">확인</button>
                        <button id="parseCancelBtn" class="modal-cancel-btn">취소</button>
                    </div>
                </div>
            </div>`
        }
        else if (currentStep === 'Parsing') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div>차단 내역을 수집 중입니다...</div>
                <div style="font-size: 13px; color: gray;">${progressText || '시작중...'}</div>
            </div>`;
        }
        else if (currentStep === 'ParseError') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div>차단 내역 수집 중 다음 오류가 발생했습니다.</div>
                <div style="color: red;">${resultMessage}</div>
                <div style="font-size: 13px; color: gray;">지속적으로 문제 발생시 다음 미니갤로 제보해주세요.</div>
                <a href="https://gall.dcinside.com/mini/mangonote" target="_blank" style="font-size: 13px; color: gray;">
                    https://gall.dcinside.com/mini/mangonote
                </a>
            </div>`;
        }
        else if (currentStep === 'ReadyToUpload') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">${banListLength}건의 신규 차단내역을 구글시트에 업로드하시겠습니까?</div>
                <div><br></div>
                <div class="export-ban-list-modal-footer">
                    <div class="modal-buttons">
                        <button id="uploadConfirmBtn" class="modal-confirm-btn">확인</button>
                        <button id="uploadCancelBtn" class="modal-cancel-btn">취소</button>
                    </div>
                </div>
            </div>`;
        }
        else if (currentStep === 'PermissionError') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">권한 오류</div>
                <div>차단 내역을 수집하는 과정에서 권한 오류가 발생했습니다.</div>
                <div>이 기능을 사용하려면 매니저 권한이 필요합니다.</div>
                <div style="font-size: 13px; color: gray;">지속적으로 문제 발생시 다음 미니갤로 제보해주세요.</div>
                <a href="https://gall.dcinside.com/mini/mangonote" target="_blank" style="font-size: 13px; color: gray;">
                    https://gall.dcinside.com/mini/mangonote
                </a>
            </div>`;
        }
        else if (currentStep === 'UploadInProgress') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">업로드 중...</div>
            </div>`;
        }
        else if (currentStep === 'NotLoggedInError') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">로그인되지 않은 상태로 감지됨</div>
                <div>Google 계정으로 로그인되어 있지 않습니다.</div>
                <div>혹은 GAS 링크가 만료되었을 수 있습니다.(불확실)</div>
                <div style="font-size: 13px; color: gray;">로그인 후 다시 시도해주세요.</div>
                <a href="https://accounts.google.com/" target="_blank" style="font-size: 13px; color: gray;">
                    https://accounts.google.com/
                </a>
                <div><br></div>
                <div class="export-ban-list-modal-footer">
                    <div class="modal-buttons">
                        <button id="backToSheetIdConfirmationBtn" class="modal-confirm-btn">이전</button>
                        <button id="uploadCancelBtn" class="modal-cancel-btn">취소</button>
                    </div>
                </div>
            </div>`;
        }
        else if (currentStep === 'OAuthUnauthorizedError') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">OAuth 미승인 상태로 감지됨</div>
                <div>아래 링크를 클릭하여 권한을 확인해주세요.</div>
                <a href="${this.#config.APPS_SCRIPT_URL}" target="_blank" style="font-size: 13px; color: #007BFF;">
                    GAS 승인 페이지로 이동
                </a>
                <a href="${this.#config.APPS_SCRIPT_AUTH_DEMONSTRATION_URL}" target="_blank" style="font-size: 13px; color: #007BFF;">
                    GAS 승인 가이드 영상
                </a>
                <div style="font-size: 13px; color: gray;">오랜 기간이 지나면 인증이 초기화되었을 가능성이 있습니다.</div>
                <div style="font-size: 13px; color: gray;">지속적으로 문제 발생시 다음 미니갤로 제보해주세요.</div>
                <a href="https://gall.dcinside.com/mini/mangonote" target="_blank" style="font-size: 13px; color: gray;">
                    https://gall.dcinside.com/mini/mangonote
                </a>
                <div><br></div>
                <div class="export-ban-list-modal-footer">
                    <div class="modal-buttons">
                        <button id="backToSheetIdConfirmationBtn" class="modal-confirm-btn">권한 인증 완료</button>
                        <button id="uploadCancelBtn" class="modal-cancel-btn">취소</button>
                    </div>
                </div>
            </div>`;
        }
        else if (currentStep === 'SheetAccessDeniedError') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">시트 접근 권한이 없습니다</div>
                <div>본인의 시트가 아닌 경우 공유 상태를 확인해주세요.</div>
                <div style="font-size: 13px; color: gray;">지속적으로 문제 발생시 다음 미니갤로 제보해주세요.</div>
                <a href="https://gall.dcinside.com/mini/mangonote" target="_blank" style="font-size: 13px; color: gray;">
                    https://gall.dcinside.com/mini/mangonote
                </a>
                <div><br></div>
                <div class="export-ban-list-modal-footer">
                    <div class="modal-buttons">
                        <button id="backToSheetIdConfirmationBtn" class="modal-confirm-btn">이전</button>
                        <button id="uploadCancelBtn" class="modal-cancel-btn">취소</button>
                    </div>
                </div>
            </div>`;
        }
        else if (currentStep === 'UploadError') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">업로드 실패</div>
                <div style="color: red;">${resultMessage}</div>
                <div style="font-size: 13px; color: gray;">구글 로그인 상태와 시트 수정 권한을 확인해주세요.</div>
                <a href="https://accounts.google.com/" target="_blank" style="font-size: 13px; color: gray;">
                    https://accounts.google.com/
                </a>
                <div style="font-size: 13px; color: gray;">지속적으로 문제 발생시 다음 미니갤로 제보해주세요.</div>
                <a href="https://gall.dcinside.com/mini/mangonote" target="_blank" style="font-size: 13px; color: gray;">
                    https://gall.dcinside.com/mini/mangonote
                </a>
                <div><br></div>
                <div class="export-ban-list-modal-footer">
                    <div class="modal-buttons">
                        <button id="backToUploadBtn" class="modal-confirm-btn">이전</button>
                        <button id="uploadCancelBtn" class="modal-cancel-btn">취소</button>
                    </div>
                </div>
            </div>`;
        }
        else if (currentStep === 'UploadComplete') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">업로드 성공</div>
                <div>${resultMessage}</div>
            </div>`;
        }
        else {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">알 수 없는 상태</div>
                <div>현재 상태를 식별할 수 없습니다.</div>
                <div style="font-size: 13px; color: gray;">지속적으로 문제 발생시 다음 미니갤로 제보해주세요.</div>
                <a href="https://gall.dcinside.com/mini/mangonote" target="_blank" style="font-size: 13px; color: gray;">
                    https://gall.dcinside.com/mini/mangonote
                </a>
            </div>`;
        }

        return `<div class="ban-export-modal-content">${innerHTML}</div>`;
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
        await this.#uiManager.injectStyles();
        this.#uiManager.updateTheme();
        this.#uiManager.injectExportBanListButton();
    }

    #createEventHandlers() {
        return {
            log: this.#utils.log,
            getFormattedTimestamp: this.#utils.getFormattedTimestamp,
            sleep: this.#utils.sleep,
            escapeHtml: this.#utils.escapeHtml,
            onShowScopeInput: () => this.#modalManager.showScopeInput(),
            onShowExportBanListModal: () => this.#modalManager.showExportBanListModal(),
            onStartParsing: async (progressCallback) => this.exportBanList(progressCallback),
            sendToGoogleSheet: async (sheetId, banList) => this.sendToGoogleSheet(sheetId, banList),
        };
    }

    async exportBanList(progressCallback) {
        const galleryId = galleryParser.galleryId;
        const gallType = galleryParser.galleryType === 'mgallery' ? 'M' : (galleryParser.galleryType === 'mini' ? 'MI' : '');
        const allBanRecords = [];

        try {
            const sheetId = GM_getValue('spreadsheetId');
            console.log(sheetId)
            const result = await this.getLastKnownRecord(sheetId);
            const lastKnownRecord = result.lastKnownRecord;
            console.log(`[Gallscope] 마지막 차단 내역:`, lastKnownRecord);

            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            const reportProgress = (msg) => {
                console.log(`[Gallscope] ${msg}`);
                if (typeof progressCallback === 'function') {
                    progressCallback(msg);
                }
            };

            const isSameEntry = (a, b) => {
                return (
                    a.nickname === b.nickname &&
                    a.identifier === b.identifier &&
                    a.content === b.content &&
                    a.reason === b.reason &&
                    a.duration === b.duration &&
                    a.dateTime === b.dateTime &&
                    a.manager === b.manager
                );
            };

            let consecutiveEmptyPageCount = 0;

            const makeBatch = (start, size) => Array.from({ length: size }, (_, j) => start + j);
            for (let i = 1; i <= this.#config.CONSTANTS.MAX_BAN_LIST_PAGES_LIMIT; i += this.#config.CONSTANTS.BAN_LIST_BATCH_SIZE) {
                const batch = makeBatch(i, this.#config.CONSTANTS.BAN_LIST_BATCH_SIZE);

                let results
                try {
                    results = await Promise.all(batch.map(page => this.fetchBanPage(galleryId, gallType, page)));
                }
                catch (err) {
                    if (err.name === 'PermissionError') throw err;

                    reportProgress(`페이지 ${i} 요청 중 오류 발생, 재시도합니다. ${err.message}`);
                    i -= this.#config.CONSTANTS.BAN_LIST_BATCH_SIZE;
                    continue;
                }

                let shouldStop = false;
                let foundAnomaly = false;
                for (const result of results) {
                    if (result.status === 'empty') {
                        consecutiveEmptyPageCount++;
                        if (consecutiveEmptyPageCount > 4) {
                            shouldStop = true;
                            break;
                        }
                    } else {
                        if (consecutiveEmptyPageCount > 0) {
                            foundAnomaly = true;
                            break;
                        }
                        consecutiveEmptyPageCount = 0;
                    }

                    for (const record of result.parsed) {
                        if (isSameEntry(record, lastKnownRecord)) {
                            reportProgress(`중복 데이터 감지됨: 나머지는 건너뜁니다.`);
                            shouldStop = true;
                            break;
                        }
                        allBanRecords.push(record);
                    }

                    if (shouldStop) break;

                    reportProgress(`페이지 ${result.page} 처리 완료 - 누적 ${allBanRecords.length}건`);
                }

                if (shouldStop) {
                    reportProgress(`차단 내역 수집 완료 - 총 ${allBanRecords.length}건`);
                    break;
                }

                if (foundAnomaly) {
                    reportProgress(`비정상적인 빈 페이지 감지됨, 다시 시도해주세요.`);
                    throw new Error(`[Gallscope] 비정상적인 빈 페이지 감지됨`);
                }

                await delay(this.#config.CONSTANTS.BAN_LIST_FETCH_DELAY_MS);
            }

            if (typeof progressCallback === 'function') {
                progressCallback(`총 ${allBanRecords.length}건 수집 완료`);
                await delay(2000);
            }

            console.log('[Gallscope] 최종 차단 내역:', allBanRecords);
            return allBanRecords;
        }
        catch (err) {
            console.error('[Gallscope] 차단 내역 수집 중 오류 발생:', err);
            throw err;
        }
    }

    async fetchBanPage(galleryId, galleryType, page) {
        // baseBanListUrl URL 결정
        let baseBanListUrl = '';
        if (galleryType === 'MI') {
            baseBanListUrl = 'https://gall.dcinside.com/mini/management/block';
        } else if (galleryType === 'M') {
            baseBanListUrl = 'https://gall.dcinside.com/mgallery/management/block';
        } else {
            throw new Error(`Invalid galleryType: ${galleryType}`);
        }

        // 쿼리 파라미터 구성
        const url = `${baseBanListUrl}?id=${encodeURIComponent(galleryId)}&p=${page}`;

        try {
            const res = await Promise.race([
                new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url,
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        onload: resolve,
                        onerror: reject,
                    });
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), this.#config.CONSTANTS.BAN_LIST_FETCH_TIMEOUT_MS)
                )
            ]);

            // 리디렉션 스크립트가 포함된 경우 매니저 권한이 없음을 의미
            if (res.responseText.includes(galleryParser.baseUrl)) {
                console.warn(`[Gallscope] 차단 페이지에서 리디렉션 감지됨`);
                const err = new Error('차단 페이지 리디렉션 감지됨 - 매니저 권한이 없을 수 있습니다.');
                err.name = 'PermissionError';
                throw err;
            }
            else {
                const parsed = this.parseBanList(res.responseText);
                if (parsed.length === 0) {
                    return {
                        status: 'empty',
                        page,
                        parsed,
                    };
                }
                else {
                    console.log(`[Gallscope] ${galleryId} 갤러리의 ${page}페이지 차단 내역 파싱 완료.`);
                    return {
                        status: 'success',
                        page,
                        parsed,
                    };
                }
            }
        } catch (err) {
            throw err; // 에러를 그대로 던져서 상위에서 처리
        }
    }

    async sendToGoogleSheet(sheetId, banList) {
        try {
            return new Promise((resolve, reject) => {
                console.log(`[Gallscope] ${banList.length}건의 차단 내역을 Google 스프레드시트에 업로드합니다.`);
                if (banList.length === 0) {
                    resolve('갱신할 데이터가 없습니다.');
                }
                else {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: this.#config.APPS_SCRIPT_URL,
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        data: JSON.stringify({
                            action: 'uploadToGoogleSheet',
                            sheetId,
                            galleryId: galleryParser.galleryId,
                            banList,
                        }),

                        onload: (res) => {
                            try {
                                const response = JSON.parse(res.responseText);
                                if (response.status === 'success') {
                                    // 업로드된 데이터의 개수를 포함한 메시지 반환
                                    const message = `${banList.length}건의 차단 내역이 업로드되었습니다.`;
                                    console.log(message);
                                    resolve(message);
                                }
                                else {
                                    console.error('Google 스프레드시트 업데이트 실패:', response.message);
                                    reject(`Google 스프레드시트 업데이트 실패: ${response.message}`);
                                }
                            } catch (e) {
                                console.error('응답 파싱 실패', e);
                                reject(`응답 파싱 실패: ${e}`);
                            }
                        },
                        onerror: (err) => {
                            console.error('Google 스프레드시트 요청 실패:', err);
                            reject(`Google 스프레드시트 요청 실패: ${err}`);
                        }
                    });
                }
            });
        }
        catch (err) {
            throw err;
        }
    }

    parseBanList(htmlText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        const rows = Array.from(doc.querySelectorAll('table.minor_block_list tbody tr'));

        if (rows.length === 0) {
            return []; // 빈 배열 반환
        }

        const parsedData = rows.map(row => {
            const cells = row.querySelectorAll('td');

            // 차단 대상: 닉네임 + 식별자 (닉네임은 두 번째 <p>, 식별자는 네 번째 <p>)
            const blockNikCell = cells[2];
            const pTags = Array.from(blockNikCell.querySelectorAll('p'))
                .map(p => p.textContent.trim())
                .filter(t => t); // 빈 텍스트 제거

            const nickname = pTags[0] || '';
            const identifier = (pTags[1] || '').replace(/[()]/g, '');

            // 게시글/댓글 내용
            const content = `[${cells[3]?.querySelector('em')?.textContent.trim() || ''}] ${cells[3]?.querySelector('a')?.textContent.trim() || ''}`;

            // 사유
            const reason = cells[4]?.textContent.trim() || '';

            // 차단 기간
            const duration = cells[5]?.textContent.trim() || '';

            // 날짜 + 시간 + 처리자
            const date = cells[6]?.querySelector('.block_date')?.textContent.trim() || '';

            const time = cells[6]?.querySelector('.block_time')?.textContent.replace('처리 시간 :', '').trim() || '';
            const managerRaw = cells[6]?.querySelector('.block_conduct')?.textContent || '';
            const managerMatch = managerRaw.match(/처리자\s*:\s*(.+)/);
            const manager = managerMatch?.[1]?.trim() || '';

            return {
                nickname,
                identifier,
                content,
                reason,
                duration,
                dateTime: `${date} ${time}`,
                manager,
            };
        });

        return parsedData;
    }

    async getLastKnownRecord(sheetId) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: this.#config.APPS_SCRIPT_URL,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({
                    action: 'getLastKnownRecord',
                    sheetId,
                    galleryId: galleryParser.galleryId,
                }),

                onload: (res) => {
                    try {
                        const contentType = res.responseHeaders?.toLowerCase() || '';

                        if (
                            res.responseText.trim().startsWith('<!DOCTYPE html') ||
                            res.responseText.includes('<html') ||
                            contentType?.includes('text/html')
                        ) {
                            const html = res.responseText;
                            console.warn('[Gallscope] HTML 응답을 받음:', html);
                            if (this.isNotLoggedIn(html)) {
                                const err = new Error('로그인되지 않은 상태로 감지됨');
                                err.name = 'NotLoggedInError';
                                console.warn('[Gallscope] 로그인되지 않은 상태로 감지됨');
                                reject(err);
                            }
                            else if (this.isOAuthUnauthorized(html)) {
                                const err = new Error('OAuth 미승인 상태로 감지됨');
                                err.name = 'OAuthUnauthorizedError';
                                console.warn('[Gallscope] OAuth 미승인 상태로 감지됨');
                                reject(err);
                            }
                            else if (this.isSheetAccessDenied(html)) {
                                const err = new Error('시트 접근 권한이 없음');
                                err.name = 'SheetAccessDeniedError';
                                console.warn('[Gallscope] 시트 접근 권한이 없음');
                                reject(err);
                            }
                            else {
                                const err = new Error('알 수 없는 HTML 응답을 받음');
                                err.name = 'UnknownHtmlResponseError';
                                console.warn('[Gallscope] HTML 응답을 받았지만 상태를 식별하지 못함');
                                reject(err);
                            }
                        }
                        else {
                            console.log('응답:', res.responseText);
                            const response = JSON.parse(res.responseText);
                            if (response.status === 'success') {
                                console.log('데이터 추출 성공');

                                const lastKnownRecord = response.lastKnownRecord;
                                resolve({
                                    lastKnownRecord,
                                });
                            } else {
                                reject(`데이터 추출 실패: ${response.message}`);
                            }
                        }
                    } catch (e) {
                        reject(`응답 파싱 실패: ${e}`);
                    }
                },
                onerror: (err) => {
                    console.warn('응답 원문:', res.responseText);
                    console.error('요청 실패:', err);
                    reject(`요청 실패: ${err}`);
                }
            });
        });
    };

    isNotLoggedIn(html) {
        return html.includes('현재 파일을 열 수 없습니다.') ||
            html.includes('<title>페이지를 찾을 수 없음</title>') ||
            html.includes('drive.google.com/start/apps');
    }

    isOAuthUnauthorized(html) {
        return html.includes('DC_BanList_GAS (Unverified)') ||
            html.includes('권한이 필요합니다') ||
            html.includes('이 앱은 Google에서 인증되지 않았습니다') ||
            html.includes('Review Permissions') ||
            html.includes('Review Permissions');
    }

    isSheetAccessDenied(html) {
        return html.includes('요청한 문서를 액세스할 권한이 없습니다.') ||
            html.includes('You do not have permission to access the requested document');
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
            this.baseUrl = window.location.href.split('?')[0].replace(/\/$/, '');
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
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbz_Nw-Itlu4vxvlt_JWI1uvtcCRnnMGvDZrN8yPDroOVmH4ETkx8OWmCf9wfAWL_bTf/exec', // 실제 URL로 교체
    APPS_SCRIPT_AUTH_DEMONSTRATION_URL: 'https://github.com/tristan23612/DC-BanList/blob/main/GasOauth.gif', // 실제 URL로 교체

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
        BAN_LIST_FETCH_DELAY_MS: 200,
        BAN_LIST_FETCH_TIMEOUT_MS: 8000,
        MAX_BAN_LIST_PAGES_LIMIT: 200,
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