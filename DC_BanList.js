// ==UserScript==
// @name             DC_BanList
// @name:ko          디시인사이드 차단 내역 관리
// @namespace        https://github.com/tristan23612/DC-BanList
// @author           망고스틴
// @version          1.5.1-release
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
// @resource         cssRaw https://raw.githubusercontent.com/tristan23612/DC-BanList/refs/heads/main/css/DC_BanList.css
// @resource         urlConfig https://raw.githubusercontent.com/tristan23612/DC-BanList/refs/heads/main/UrlConfig.json
// @license          MIT
// @icon             https://github.com/tristan23612/DC-BanList/blob/main/DC_BanList_icon.png?raw=true
// @downloadURL https://github.com/tristan23612/DC-BanList/releases/latest/download/DC_BanList.js
// @updateURL https://github.com/tristan23612/DC-BanList/releases/latest/download/DC_BanList.js
// ==/UserScript==

class ModalManager {
    #config;
    #state;
    #eventHandlers;
    #log;
    #uiManager;
    #exportBanListModal;
    #commentSearchModal;

    constructor(config, state, eventHandlers, log, uiManager) {
        this.#config = config;
        this.#state = state;
        this.#eventHandlers = eventHandlers;
        this.#log = log || (() => { });
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
        const modal = this.#createAndAppendElement('div', id, 'dcBanList-modal-base');
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

    #getOrCreateCommentSearchModal = () => {
        if (this.#commentSearchModal) return this.#commentSearchModal;

        const modal = this.#_createModal(this.#config.UI.COMMENT_SEARCH_MODAL_ID, '댓글 검색');
        this.#commentSearchModal = modal;
        return modal;
    }

    hideCommentSearchModal(stopController = null) {
        if (this.#commentSearchModal) {
            if (stopController) {
                stopController.stop = true;
            }
            this.#commentSearchModal.style.display = 'none';
        }
    }

    showCommentSearchModal() {
        const modal = this.#getOrCreateCommentSearchModal();
        const titleSpan = modal.querySelector('.modal-title > span');
        const contentDiv = modal.querySelector('.modal-content');

        const titleDisplay = '댓글 검색';
        titleSpan.textContent = titleDisplay;

        let footer = modal.querySelector('.modal-footer');
        if (!footer) {
            footer = document.createElement('div');
            footer.className = 'modal-footer';
            modal.appendChild(footer);
        }

        let commentSearchModalContentHTML = '';
        let commentSearchModalFooterHTML = '';
        let commentSearchModalContentDiv = '';

        let currentStep = 'SearchTargetInput';
        let searchTarget = '';
        let nickname = '';
        let commentList = [];
        let page = 0;
        let searchPos = '';
        let prevRes = null;
        let stopController = { stop: false };

        this.#state.exportLogs = [];

        const updateContent = () => {
            if (currentStep === 'SearchTargetInput') {
                commentSearchModalContentHTML = this.#uiManager.renderCommentSearchModalContent({
                    currentStep: currentStep,
                    searchTarget: searchTarget,
                })
                commentSearchModalFooterHTML = this.#uiManager.renderCommentSearchModalFooter({
                    currentStep: currentStep,
                });
                contentDiv.innerHTML = commentSearchModalContentHTML + commentSearchModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered SearchTargetInput step of the comment search modal.');

                contentDiv.onclick = (event) => {
                    if (event.target && event.target.id === 'searchTargetConfirmBtn') {
                        searchTarget = contentDiv.querySelector('#searchTargetInput').value.trim();
                        if (!searchTarget) {
                            alert('검색할 대상을 입력해주세요.');
                            return;
                        }
                        this.#log('ModalManager', `댓글 검색 모달에서 검색 대상을 ${searchTarget}로 설정했습니다.`);
                        currentStep = 'GettingTargetNickName';
                        updateContent();
                    }
                    else if (event.target && event.target.id === 'searchTargetCancelBtn') {
                        this.hideCommentSearchModal()
                    }
                };
            }
            else if (currentStep === 'GettingTargetNickName') {
                commentSearchModalContentHTML = this.#uiManager.renderCommentSearchModalContent({
                    currentStep: currentStep,
                    searchTarget: searchTarget,
                })
                commentSearchModalFooterHTML = this.#uiManager.renderCommentSearchModalFooter({
                    currentStep: currentStep,
                });
                contentDiv.innerHTML = commentSearchModalContentHTML + commentSearchModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered TargetConfirmation step of the comment search modal.');

                this.#eventHandlers.getTargetNickName(searchTarget).then(result => {
                    nickname = result ? result : searchTarget;
                    modal.querySelector('.modal-title > span').textContent = `댓글 검색 - ${nickname} (${nickname !== searchTarget ? searchTarget : ''})`;
                    currentStep = 'Searching';
                    updateContent();
                }).catch(err => {
                    console.error('[DC-BanList] 댓글 검색 대상 확인 중 오류 발생:', err);
                    currentStep = 'SearchTargetInput';
                    alert('검색 대상의 닉네임을 확인하는 중 오류가 발생했습니다. 다시 시도해주세요.');
                    updateContent();
                });
            }
            else if (currentStep === 'Searching') {
                commentSearchModalContentHTML = this.#uiManager.renderCommentSearchModalContent({
                    currentStep: currentStep,
                    searchTarget: searchTarget,
                    commentList: commentList,
                    nickname: nickname,
                })
                commentSearchModalFooterHTML = this.#uiManager.renderCommentSearchModalFooter({
                    currentStep: currentStep,
                });
                contentDiv.innerHTML = commentSearchModalContentHTML + commentSearchModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered Searching step of the comment search modal.');

                contentDiv.onclick = (event) => {
                    if (event.target && event.target.id === 'stopSearchBtn') {
                        stopController.stop = true;

                        event.target.disabled = true;
                        event.target.textContent = '검색 중지 요청 중...';
                    }
                };

                this.#eventHandlers.exportCommentList((progressText, commentList) => {
                    commentSearchModalContentDiv = contentDiv.querySelector('.comment-search-modal-content')
                    commentSearchModalContentDiv.innerHTML = this.#uiManager.renderCommentSearchModalContent({
                        currentStep: 'Searching',
                        searchTarget: searchTarget,
                        commentList: commentList,
                        progressText,
                    })
                }, searchTarget, stopController, commentList, page, searchPos, prevRes).then(results => {
                    currentStep = 'SearchPaused';
                    commentList = results.commentList;
                    page = results.page;
                    searchPos = results.searchPos;
                    prevRes = results.prevRes;
                    updateContent(stopController);
                }).catch(err => {
                    console.error('[DC-BanList] 댓글 검색 중 오류 발생:', err);
                    currentStep = 'SearchPaused';
                    stopController.stop = true;
                    updateContent(stopController);
                });
            }
            else if (currentStep === 'SearchPaused') {
                commentSearchModalContentHTML = this.#uiManager.renderCommentSearchModalContent({
                    currentStep: currentStep,
                    searchTarget: searchTarget,
                    commentList: commentList,
                    page: page,
                })
                commentSearchModalFooterHTML = this.#uiManager.renderCommentSearchModalFooter({
                    currentStep: currentStep,
                });
                contentDiv.innerHTML = commentSearchModalContentHTML + commentSearchModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered SearchPaused step of the comment search modal.');

                contentDiv.onclick = (event) => {
                    if (event.target && event.target.id === 'closeSearchBtn') {
                        this.hideCommentSearchModal()
                    }
                    else if (event.target && event.target.id === 'SearchResumeBtn') {
                        stopController.stop = false;
                        currentStep = 'Searching';
                        updateContent();
                    }
                };
            }
        };

        updateContent();
        modal.style.display = 'block';
        this.#uiManager.updateTheme();
    }

    #getOrCreateExportBanListModal = () => {
        if (this.#exportBanListModal) return this.#exportBanListModal;

        const modal = this.#_createModal(this.#config.UI.EXPORT_BAN_LIST_MODAL_ID, '차단 내역 내보내기');
        this.#exportBanListModal = modal;
        this.#state.exportModalElement = modal;
        return modal;
    }

    hideExportBanListModal() {
        if (this.#exportBanListModal) {
            this.#exportBanListModal.style.display = 'none';
        }
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

        let currentStep = 'SheetIdConfirmation';
        let banList = [];
        let resultMessage = '';
        let sheetId = '';
        let lastKnownRecord = null;

        let banExportModalContentHTML = '';
        let banExportModalFooterHTML = '';
        let banExportModalConetntDiv = '';

        this.#state.exportLogs = [];

        const updateContent = () => {
            if (currentStep === 'SheetIdConfirmation') {
                banExportModalContentHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep,
                    sheetId: storedSheetId,
                });
                banExportModalFooterHTML = this.#uiManager.renderBanExportModalFooter({
                    currentStep,
                })
                contentDiv.innerHTML = banExportModalContentHTML + banExportModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered SheetIdConfirmation step of the export ban list modal.');

                contentDiv.onclick = (event) => {
                    if (event.target && event.target.id === 'sheetIdConfirmBtn') {
                        sheetId = contentDiv.querySelector('#sheetIdInput').value.trim() || storedSheetId;
                        if (!sheetId || sheetId === '시트 ID를 입력해주세요.') {
                            alert('시트 ID를 입력해주세요.');
                            return;
                        }
                        GM_setValue('spreadsheetId', sheetId);
                        this.#log('ModalManager', `차단 내역 내보내기 모달에서 시트 ID를 ${sheetId}로 설정했습니다.`);
                        currentStep = 'GettingLastKnownRecord';
                        updateContent();
                    }
                    else if (event.target && event.target.id === 'sheetIdCancelBtn') {
                        this.hideExportBanListModal()
                    }
                };
            }
            else if (currentStep === 'GettingLastKnownRecord') {
                banExportModalContentHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep,
                    sheetId: storedSheetId,
                });
                banExportModalFooterHTML = this.#uiManager.renderBanExportModalFooter({
                    currentStep,
                })
                contentDiv.innerHTML = banExportModalContentHTML + banExportModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered GettingLastKnownRecord step of the export ban list modal.');

                this.#eventHandlers.getLastKnownRecord(sheetId).then(result => {
                    lastKnownRecord = result.lastKnownRecord;
                    this.#log('ModalManager', `마지막으로 알려진 기록: ${lastKnownRecord.length == 0 ? '없음' : lastKnownRecord}`);
                    if (lastKnownRecord.length == 0) {
                        currentStep = 'CreateSheetConfirmation';
                        updateContent();
                    }
                    else {
                        currentStep = 'OAuthConfirmation';
                        updateContent();
                    }
                }).catch(err => {
                    console.error('[DC-BanList] 기존 데이터 확인 중 오류 발생:', err);
                    currentStep = 'SheetIdConfirmation';
                    resultMessage = err.message || '알 수 없는 오류가 발생했습니다.';
                    this.#eventHandlers.log(`[DC-BanList] 기존 데이터 확인 중 오류 발생: ${resultMessage}`);
                    updateContent();
                });
            }
            else if (currentStep === 'CreateSheetConfirmation') {
                banExportModalContentHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep,
                    sheetId: storedSheetId,
                });
                banExportModalFooterHTML = this.#uiManager.renderBanExportModalFooter({
                    currentStep,
                })
                contentDiv.innerHTML = banExportModalContentHTML + banExportModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered CreateSheetConfirmation step of the export ban list modal.');

                contentDiv.onclick = (event) => {
                    if (event.target && event.target.id === 'createSheetConfirmBtn') {
                        currentStep = 'OAuthConfirmation';
                        updateContent();
                    }
                    else if (event.target && event.target.id === 'createSheetCancelBtn') {
                        currentStep = 'SheetIdConfirmation';
                        updateContent();
                    }
                };
            }
            else if (currentStep === 'OAuthConfirmation') {
                banExportModalContentHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep,
                    sheetId: storedSheetId,
                });
                banExportModalFooterHTML = this.#uiManager.renderBanExportModalFooter({
                    currentStep,
                })
                contentDiv.innerHTML = banExportModalContentHTML + banExportModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered OAuthConfirmation step of the export ban list modal.');

                contentDiv.onclick = (event) => {
                    if (event.target && event.target.id === 'oauthConfirmBtn') {
                        currentStep = 'ExportConfirmation';
                        updateContent();
                    }
                    else if (event.target && event.target.id === 'oauthCancelBtn') {
                        this.hideExportBanListModal();
                    }
                };
            }
            else if (currentStep === 'ExportConfirmation') {
                banExportModalContentHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep,
                });
                banExportModalFooterHTML = this.#uiManager.renderBanExportModalFooter({
                    currentStep,
                })
                contentDiv.innerHTML = banExportModalContentHTML + banExportModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered ExportConfirmation step of the export ban list modal.');

                contentDiv.onclick = (event) => {
                    if (event.target && event.target.id === 'parseConfirmBtn') {
                        currentStep = 'Parsing';
                        updateContent();
                    }
                    else if (event.target && event.target.id === 'parseCancelBtn') {
                        this.hideExportBanListModal();
                    }
                };
            }
            else if (currentStep === 'Parsing') {
                let progressText = ''
                banExportModalContentHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep,
                    progressText
                });
                banExportModalFooterHTML = this.#uiManager.renderBanExportModalFooter({
                    currentStep,
                })
                contentDiv.innerHTML = banExportModalContentHTML + banExportModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered Parsing step of the export ban list modal.');

                this.#eventHandlers.exportBanList((progressText) => {
                    banExportModalConetntDiv = contentDiv.querySelector('.export-ban-list-modal-content')
                    banExportModalConetntDiv.innerHTML = this.#uiManager.renderBanExportModalContent({
                        currentStep: 'Parsing',
                        progressText: progressText,
                    });
                }).then(result => {
                    banList = result;
                    if (banList.length === 0) {
                        currentStep = 'UploadComplete';
                        resultMessage = '갱신할 차단 내역이 없습니다. 업로드를 건너뜁니다.';
                        this.#log('ModalManager', 'No new ban list found, skipping upload.');
                        updateContent();
                    }
                    else {
                        currentStep = 'ReadyToUpload';
                        this.#log('ModalManager', `Found ${banList.length} new ban list entries, ready to upload.`);
                        updateContent();
                    }
                }).catch(err => {
                    console.error('[DC-BanList] 수집 중 오류 발생:', err);
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
                        console.error('[DC-BanList] 차단 내역 수집 중 오류 발생:', resultMessage);
                        this.#eventHandlers.log(`[DC-BanList] 차단 내역 수집 중 오류 발생: ${resultMessage}`);
                        updateContent();
                    }
                });
            }
            else if (currentStep === 'ReadyToUpload') {
                banExportModalContentHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep,
                    sheetId: storedSheetId,
                    banListLength: banList.length,
                });
                banExportModalFooterHTML = this.#uiManager.renderBanExportModalFooter({
                    currentStep,
                })
                contentDiv.innerHTML = banExportModalContentHTML + banExportModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered ReadyToUpload step of the export ban list modal.');

                contentDiv.onclick = (event) => {
                    if (event.target && event.target.id === 'uploadConfirmBtn') {
                        currentStep = 'UploadInProgress';
                        updateContent();
                    }
                    else if (event.target && event.target.id === 'uploadCancelBtn') {
                        this.hideExportBanListModal()
                    }
                };
            }
            else if (currentStep === 'UploadInProgress') {
                banExportModalContentHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep,
                });
                banExportModalFooterHTML = this.#uiManager.renderBanExportModalFooter({
                    currentStep,
                })
                contentDiv.innerHTML = banExportModalContentHTML + banExportModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered UploadInProgress step of the export ban list modal.');

                (async () => {
                    try {
                        resultMessage = await this.#eventHandlers.sendToGoogleSheet(sheetId, banList);
                        currentStep = 'UploadComplete'
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
                banExportModalContentHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep,
                    resultMessage,
                });
                banExportModalFooterHTML = this.#uiManager.renderBanExportModalFooter({
                    currentStep,
                })
                contentDiv.innerHTML = banExportModalContentHTML + banExportModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered NotLoggedInError step of the export ban list modal.');

                contentDiv.onclick = (event) => {
                    if (event.target && event.target.id === 'backToSheetIdConfirmationBtn') {
                        currentStep = 'SheetIdConfirmation';
                        updateContent();
                    }
                    else if (event.target && event.target.id === 'uploadCancelBtn') {
                        this.hideExportBanListModal()
                    }
                };
            }
            else if (currentStep === 'OAuthUnauthorizedError') {
                banExportModalContentHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep,
                    resultMessage,
                });
                banExportModalFooterHTML = this.#uiManager.renderBanExportModalFooter({
                    currentStep,
                })
                contentDiv.innerHTML = banExportModalContentHTML + banExportModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered OAuthUnauthorizedError step of the export ban list modal.');

                contentDiv.onclick = (event) => {
                    if (event.target && event.target.id === 'backToSheetIdConfirmationBtn') {
                        currentStep = 'SheetIdConfirmation';
                        updateContent();
                    }
                    else if (event.target && event.target.id === 'uploadCancelBtn') {
                        this.hideExportBanListModal()
                    }
                };
            }
            else if (currentStep === 'SheetAccessDeniedError') {
                banExportModalContentHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep,
                    resultMessage,
                });
                banExportModalFooterHTML = this.#uiManager.renderBanExportModalFooter({
                    currentStep,
                })
                contentDiv.innerHTML = banExportModalContentHTML + banExportModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered SheetAccessDeniedError step of the export ban list modal.');

                contentDiv.onclick = (event) => {
                    if (event.target && event.target.id === 'backToSheetIdConfirmationBtn') {
                        currentStep = 'SheetIdConfirmation';
                        updateContent();
                    }
                    else if (event.target && event.target.id === 'uploadCancelBtn') {
                        this.hideExportBanListModal()
                    }
                };
            }
            else if (currentStep === 'UploadError') {
                banExportModalContentHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep,
                    resultMessage,
                });
                banExportModalFooterHTML = this.#uiManager.renderBanExportModalFooter({
                    currentStep,
                })
                contentDiv.innerHTML = banExportModalContentHTML + banExportModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered UploadError step of the export ban list modal.');

                contentDiv.onclick = (event) => {
                    if (event.target && event.target.id === 'backToUploadBtn') {
                        currentStep = 'ReadyToUpload';
                        updateContent();
                    }
                    else if (event.target && event.target.id === 'uploadCancelBtn') {
                        this.hideExportBanListModal()
                    }
                };
            }
            else if (currentStep === 'UploadComplete') {
                banExportModalContentHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep,
                    sheetId: storedSheetId,
                    resultMessage,
                });
                banExportModalFooterHTML = this.#uiManager.renderBanExportModalFooter({
                    currentStep,
                })
                contentDiv.innerHTML = banExportModalContentHTML + banExportModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered UploadComplete step of the export ban list modal.');
            }
            else {
                banExportModalContentHTML = this.#uiManager.renderBanExportModalContent({
                    currentStep,
                    resultMessage,
                });
                banExportModalFooterHTML = this.#uiManager.renderBanExportModalFooter({
                    currentStep,
                })
                contentDiv.innerHTML = banExportModalContentHTML + banExportModalFooterHTML
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered an unknown step of the export ban list modal: ' + currentStep);
            }

            const copyBtn = contentDiv.querySelector('#copyLogsBtn');
            if (copyBtn) {
                copyBtn.onclick = async () => {
                    if (!state.exportLogs.length) {
                        alert("복사할 로그가 없습니다.");
                        return;
                    }
                    const logs = state.exportLogs.join("\n");
                    try {
                        await navigator.clipboard.writeText(logs);
                        alert("로그가 클립보드에 복사되었습니다.");
                    } catch (err) {
                        alert("복사 실패: " + err);
                    }
                };
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
        document.body.classList.toggle('dcBanList-dark-theme', isDark);
        document.body.classList.toggle('dcBanList-light-theme', !isDark);
    }

    injectStyles() {
        if (document.getElementById('dc-banlist-styles')) return;
        else {
            this.#log(`UI`, 'dc-banlist-styles not found, injecting styles...');

            const cssRaw = GM_getResourceText('cssRaw');
            if (!cssRaw) throw new Error("CSS fetch failed")
            else this.#log(`UI`, 'DC-Banlist CSS loaded successfully');

            const css = cssRaw
                .replaceAll('___EXPORT_BAN_LIST_MODAL_ID___', this.#config.UI.EXPORT_BAN_LIST_MODAL_ID)
                .replaceAll('___COMMENT_SEARCH_MODAL_ID___', this.#config.UI.COMMENT_SEARCH_MODAL_ID)
                .replace(/\s+/g, ' ').trim();

            const styleEl = document.createElement('style');
            styleEl.id = 'dc-banlist-styles';
            styleEl.textContent = css;
            document.head.appendChild(styleEl);
        }
    }

    injectCommnentSearchButton() {
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
        if (document.getElementById('dcBanListCommentSearchContainer')) return;
        const container = document.createElement('div');
        container.id = 'dcBanListCommentSearchContainer';
        container.style.cssText = `
            display: inline-flex;
            align-items: center;
            margin-left: 10px;
        `;
        container.innerHTML = `
            <button id="dcBanListCommentSearchBtn"
                    class="modal-confirm-btn"
                    style="padding:4px 8px; font-size:13px;"
                    title="댓글 검색">
            댓글 검색
            </button>
        `;
        leftContainer.appendChild(container);
        document.getElementById('dcBanListCommentSearchBtn').addEventListener('click', () => this.#eventHandlers.onShowCommentSearchModal());
        this.#log(`UI`, '댓글 검색 버튼을 페이지에 삽입했습니다.');
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

        if (document.getElementById('dcBanListExportBanListContainer')) return;

        const container = document.createElement('div');
        container.id = 'dcBanListExportBanListContainer';
        container.style.cssText = `
            display: inline-flex;
            align-items: center;
            margin-left: 10px;
        `;
        container.innerHTML = `
            <button id="dcBanListExportBanListBtn"
                    class="modal-confirm-btn"
                    style="padding:4px 8px; font-size:13px;"
                    title="차단 목록을 콘솔에 출력">
            차단 내역 내보내기
            </button>
        `;
        leftContainer.appendChild(container);

        document.getElementById('dcBanListExportBanListBtn').addEventListener('click', () => this.#eventHandlers.onShowExportBanListModal());

        this.#log(`UI`, '차단 내역 내보내기 버튼을 페이지에 삽입했습니다.');
    }

    renderCommentSearchModalFooter(state = {}) {
        const {
            currentStep = 'SearchTargetInput',
        } = state;

        let innerHTML = '';
        if (currentStep === 'SearchTargetInput') {
            innerHTML = `
            <div class="comment-search-modal-footer">
                <div class="modal-buttons">
                    <button id="searchTargetConfirmBtn" class="modal-confirm-btn">확인</button>
                    <button id="searchTargetCancelBtn" class="modal-cancel-btn">취소</button>
                </div>
            </div>`;
        }
        else if (currentStep === 'GettingTargetNickName') {
            innerHTML = '';
        }
        else if (currentStep === 'Searching') {
            innerHTML = `
            <div class="comment-search-modal-footer">
                <div class="modal-buttons">
                    <button id="stopSearchBtn" class="modal-cancel-btn">검색 중지</button>
                </div>
            </div>`;
        }
        else if (currentStep === 'SearchPaused') {
            innerHTML = `
            <div class="comment-search-modal-footer">
                <div class="modal-buttons">
                    <button id="closeSearchBtn" class="modal-cancel-btn">닫기</button>
                    <button id="SearchResumeBtn" class="modal-confirm-btn">검색 재개</button>
                </div>
            </div>`;
        }
        else {
            innerHTML = '';
        }

        return innerHTML;
    }

    renderCommentSearchModalContent(state = {}) {
        const {
            currentStep = 'SearchTargetInput',
            searchTarget = '',
            commentList = [],
            progressText = '',
            page = 1,
        } = state;

        let innerHTML = '';
        if (currentStep === 'SearchTargetInput') {
            innerHTML = `
            <div class="comment-search-modal-content">
                <div style="font-weight:700; font-size:15px;">댓글 검색</div>
                <div>검색할 대상을 입력해주세요.</div>
                <div class="search-target-input-group">
                    <input type="text" id="searchTargetInput" class="search-target-input"
                        placeholder="식별코드 또는 아이피 입력" value="${searchTarget}"/>
                </div>
            </div>`;
        }
        else if (currentStep === 'GettingTargetNickName') {
            innerHTML = `
            <div class="comment-search-modal-content">
                <div>검색 대상의 닉네임을 확인 중입니다...</div>
                <div><br></div>
            </div>`;
        }
        else if (currentStep === 'Searching') {
            innerHTML = `
            <div class="comment-search-modal-content">
                <div>댓글을 검색 중입니다...</div>
                <div style="font-size: 13px; color: gray;">${progressText || '시작중...'}</div>
                <ul class="user-comment-list">
                    ${commentList.length > 0 ? commentList.join('') : '<li>검색된 댓글이 없습니다.</li>'}
                </ul>
            </div>`;
        }
        else if (currentStep === 'SearchPaused') {
            innerHTML = `
            <div class="comment-search-modal-content">
                <div>댓글 검색이 중지되었습니다.</div>
                <div style="font-size: 13px; color: gray;">${page}페이지까지 ${commentList.length}개의 댓글 검색됨.</div>
                <ul class="user-comment-list">
                    ${commentList.length > 0 ? commentList.join('') : '<li>검색된 댓글이 없습니다.</li>'}
                </ul>
            </div>`;
        }
        else {
            innerHTML = `
            <div class="comment-search-modal-content">
                <div>알 수 없는 단계에 도달했습니다.</div>
            </div>`;
        }

        return innerHTML;
    }

    renderBanExportModalFooter(state = {}) {
        const {
            currentStep = 'confirm',
        } = state;

        let innerHTML = '';
        if (currentStep === 'SheetIdConfirmation') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                    <button id="sheetIdConfirmBtn" class="modal-confirm-btn">확인</button>
                    <button id="sheetIdCancelBtn" class="modal-cancel-btn">취소</button>
                </div>
            </div>`;
        }
        else if (currentStep === 'GettingLastKnownRecord') {
            innerHTML = ``;
        }
        else if (currentStep === 'CreateSheetConfirmation') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                    <button id="createSheetConfirmBtn" class="modal-confirm-btn">확인</button>
                    <button id="createSheetCancelBtn" class="modal-cancel-btn">취소</button>
                </div>
            </div>`;
        }
        else if (currentStep === 'OAuthConfirmation') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                    <button id="oauthConfirmBtn" class="modal-confirm-btn">권한 인증 완료</button>
                    <button id="oauthCancelBtn" class="modal-cancel-btn">취소</button>
                </div>
            </div>`;
        }
        else if (currentStep === 'ExportConfirmation') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                    <button id="parseConfirmBtn" class="modal-confirm-btn">확인</button>
                    <button id="parseCancelBtn" class="modal-cancel-btn">취소</button>
                </div>
            </div>`;
        }
        else if (currentStep === 'Parsing') {
            innerHTML = ``;
        }
        else if (currentStep === 'ParseError') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                </div>
            </div>`;
        }
        else if (currentStep === 'ReadyToUpload') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                    <button id="uploadConfirmBtn" class="modal-confirm-btn">확인</button>
                    <button id="uploadCancelBtn" class="modal-cancel-btn">취소</button>
                </div>
            </div>`;
        }
        else if (currentStep === 'PermissionError') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                </div>
            </div>`;
        }
        else if (currentStep === 'UploadInProgress') {
            innerHTML = ``;
        }
        else if (currentStep === 'NotLoggedInError') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                    <button id="backToSheetIdConfirmationBtn" class="modal-confirm-btn">이전</button>
                    <button id="uploadCancelBtn" class="modal-cancel-btn">취소</button>
                </div>
            </div>`;
        }
        else if (currentStep === 'OAuthUnauthorizedError') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                    <button id="backToSheetIdConfirmationBtn" class="modal-confirm-btn">권한 인증 완료</button>
                    <button id="uploadCancelBtn" class="modal-cancel-btn">취소</button>
                </div>
            </div>`;
        }
        else if (currentStep === 'SheetAccessDeniedError') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                    <button id="backToSheetIdConfirmationBtn" class="modal-confirm-btn">이전</button>
                    <button id="uploadCancelBtn" class="modal-cancel-btn">취소</button>
                </div>
            </div>`;
        }
        else if (currentStep === 'UploadError') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                    <button id="backToUploadBtn" class="modal-confirm-btn">이전</button>
                    <button id="uploadCancelBtn" class="modal-cancel-btn">취소</button>
                </div>
            </div>`;
        }
        else if (currentStep === 'UploadComplete') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                </div>
            </div>`;
        }
        else {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                </div>
            </div>`;
        }

        return innerHTML;
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
            </div>`;
        }
        else if (currentStep === 'GettingLastKnownRecord') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div>기존 데이터 확인 중입니다...</div>
                <div><br></div>
            </div>`;
        }
        else if (currentStep === 'CreateSheetConfirmation') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">새로운 시트로 보이네요!</div>
                <div>입력하신 시트 ID의 시트에 기존 데이터가 없습니다.</div>
                <div>새로운 시트로 차단 내역을 업로드하시겠습니까?</div>
                <div><br></div>
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
            </div>`;
        }
        else if (currentStep === 'ExportConfirmation') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">차단 내역을 불러오시겠습니까?</div>
                <div>차단 내역을 수집하여 Google 시트에 업로드합니다.</div>
                <div>매니저의 권한으로 마스킹이 제거된 리스트를 수집합니다.</div>
                <div><br></div>
            </div>`;
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
            </div>`;
        }
        else if (currentStep === 'SheetAccessDeniedError') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">시트 접근 권한이 없습니다</div>
                <div>본인의 시트가 아닌 경우 수정 권한을 확인해주세요.</div>
                <div style="font-size: 13px; color: gray;">지속적으로 문제 발생시 다음 미니갤로 제보해주세요.</div>
                <a href="https://gall.dcinside.com/mini/mangonote" target="_blank" style="font-size: 13px; color: gray;">
                    https://gall.dcinside.com/mini/mangonote
                </a>
                <div><br></div>
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
            </div>`;
        }
        else if (currentStep === 'UploadComplete') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">업로드 성공</div>
                <div>${resultMessage}</div>
                <a href="https://docs.google.com/spreadsheets/d/${sheetId}" target="_blank" style="font-size: 13px; color: #007BFF;">
                    구글 시트로 이동
                </a>
                <div><br></div>
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

        return innerHTML;
    }

    isDarkMode() {
        if (!isMobile) {
            return !!document.getElementById('css-darkmode');
        }

        return !!document.documentElement.classList.contains('darkmode');
    }

    updateTheme() {
        const isDark = this.isDarkMode();
        document.body.classList.toggle('dcBanList-dark-theme', isDark);
        document.body.classList.toggle('dcBanList-light-theme', !isDark);
    }
}

class DCBanList {
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
        this.#modalManager = new ModalManager(config, state, eventHandlers, this.#utils.log, this.#uiManager);
    }

    init() {
        this.#uiManager.injectStyles();
        this.#uiManager.updateTheme();
        this.#uiManager.injectExportBanListButton();
        if (this.#config.COMMENT_SEARCH_ENABLED) {
            this.#uiManager.injectCommnentSearchButton();
        }
    }

    #createEventHandlers() {
        return {
            log: this.#utils.log,
            onShowExportBanListModal: () => this.#modalManager.showExportBanListModal(),
            onShowCommentSearchModal: () => this.#modalManager.showCommentSearchModal(),
            exportCommentList: async (progressCallback, searchTarget, stopController, commentList = [], page = 1, searchPos = '', prevRes = null) => this.exportCommentList(progressCallback, searchTarget, stopController, commentList, page, searchPos, prevRes),
            getTargetNickName: async (searchTarget) => this.getTargetNickName(searchTarget),
            exportBanList: async (progressCallback) => this.exportBanList(progressCallback),
            sendToGoogleSheet: async (sheetId, banList) => this.sendToGoogleSheet(sheetId, banList),
            getLastKnownRecord: async (sheetId) => this.getLastKnownRecord(sheetId),
        };
    }

    async exportCommentList(progressCallback, searchTarget, stopController, commentList = [], page = 0, searchPos = '', prevRes = null) {
        const galleryId = galleryParser.galleryId;
        const gallType = galleryParser.galleryType === 'mgallery' ? 'M' : (galleryParser.galleryType === 'mini' ? 'MI' : '');

        try {
            this.#utils.log('Core', '댓글 검색 시작', { galleryId, gallType, searchTarget });
            const reportProgress = (msg, commentList = []) => {
                this.#utils.log('Core', msg);
                if (typeof progressCallback === 'function') {
                    progressCallback(msg, commentList);
                }
            };

            while (stopController && !stopController.stop) {
                page++;
                reportProgress(`페이지 ${page} 요청 중...`, commentList);

                let result;
                try {
                    result = await this.fetchCommentsPage(galleryId, gallType, searchTarget, page, searchPos, prevRes);
                }
                catch (err) {
                    reportProgress(`페이지 ${page} 요청 중 오류 발생, 재시도합니다. ${err.message}`, commentList);
                    await this.#utils.sleep(this.#config.CONSTANTS.COMMENT_SEARCH_FETCH_DELAY_MS);
                    continue;
                }
                const fetchedComments = result.parsed;
                searchPos = result.searchPos ? result.searchPos : '';
                page = result.page;
                prevRes = result.response;

                if (result.status === 'end') {
                    reportProgress(`페이지 ${page}에 더 이상 댓글이 없습니다. 검색 종료.`, commentList);
                    break;
                }

                commentList.push(...fetchedComments);
                reportProgress(`페이지 ${page} 처리 완료 - 누적 ${commentList.length}건`, commentList);
                await this.#utils.sleep(this.#config.CONSTANTS.COMMENT_SEARCH_FETCH_DELAY_MS);
            }

            return {
                commentList,
                page,
                searchPos,
                prevRes,
            }
        }
        catch (err) {
            console.error('[DC-BanList] 댓글 검색 중 오류 발생:', err);
            throw err;
        }
    }

    async getTargetNickName(searchTarget) {
        const gallogUrl = 'https://gallog.dcinside.com/' + encodeURIComponent(searchTarget);

        try {
            this.#utils.log('Core', '검색 대상 확인 시작', { searchTarget, gallogUrl });
            const res = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: gallogUrl,
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    },
                    onload: resolve,
                    onerror: reject,
                });
            });

            const parser = new DOMParser();
            const doc = parser.parseFromString(res.responseText, 'text/html');
            const nickname = doc.querySelector('.nick_name')?.textContent?.trim();

            if (!nickname) {
                // IP 이거나 존재하지 않는 사용자
                this.#utils.log('Core', '검색 대상의 닉네임을 찾을 수 없음', { searchTarget });
                return null;
            }
            this.#utils.log('Core', '검색 대상의 닉네임 확인 완료', { searchTarget, nickname });
            return nickname;
        }
        catch (err) {
            console.error('[DC-BanList] 검색 대상 확인 중 오류 발생:', err);
            throw err;
        }
    }

    async exportBanList(progressCallback) {
        const galleryId = galleryParser.galleryId;
        const gallType = galleryParser.galleryType === 'mgallery' ? 'M' : (galleryParser.galleryType === 'mini' ? 'MI' : '');
        const allBanRecords = [];

        try {
            const sheetId = GM_getValue('spreadsheetId');
            this.#utils.log('Core', '차단 내역 수집 시작', { galleryId, gallType, sheetId });
            const result = await this.getLastKnownRecord(sheetId);
            const lastKnownRecord = result.lastKnownRecord;

            const reportProgress = (msg) => {
                this.#utils.log('Core', msg);
                if (typeof progressCallback === 'function') {
                    progressCallback(msg);
                }
            };

            const isSameEntry = (a, b) => {
                return (
                    a.nickname.toString() === b.nickname.toString() &&
                    a.identifier.toString() === b.identifier.toString() &&
                    a.content === b.content &&
                    a.reason.toString() === b.reason.toString() &&
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
                        // 마지막으로 알려진 기록과 동일한 항목이 나타나면 중단, 빈 배열일 경우 무시
                        if (lastKnownRecord.length != 0 && isSameEntry(record, lastKnownRecord)) {
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
                    throw new Error(`[DC-BanList] 비정상적인 빈 페이지 감지됨`);
                }

                await this.#utils.sleep(this.#config.CONSTANTS.BAN_LIST_FETCH_DELAY_MS);
            }

            if (typeof progressCallback === 'function') {
                progressCallback(`총 ${allBanRecords.length}건 수집 완료`);
                await this.#utils.sleep(2000);
            }

            this.#utils.log('Core', '차단 내역 수집 완료', { galleryId, gallType, totalRecords: allBanRecords.length });
            return allBanRecords;
        }
        catch (err) {
            console.error('[DC-BanList] 차단 내역 수집 중 오류 발생:', err);
            throw err;
        }
    }

    async fetchCommentsPage(galleryId, galleryType, target, page, searchPos = '', prevRes = null) {
        let baseCommentSearchUrl = '';
        if (galleryType === 'MI') {
            baseCommentSearchUrl = `https://gall.dcinside.com/mini/board/lists?id=${galleryId}&s_type=search_comment&s_keyword=%2520`;
        }
        else if (galleryType === 'M') {
            baseCommentSearchUrl = `https://gall.dcinside.com/mgallery/board/lists?id=${galleryId}&s_type=search_comment&s_keyword=%2520`;
        }
        else {
            baseCommentSearchUrl = `https://gall.dcinside.com/board/lists?id=${galleryId}&s_type=search_comment&s_keyword=%2520`;
        }

        let url = `${baseCommentSearchUrl}&page=${page}${(searchPos !== '') ? `&search_pos=${searchPos}` : ''}`;

        try {
            const res = await Promise.race([
                new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url,
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0 Safari/537.36'
                        },
                        withCredentials: true,
                        onload: resolve,
                        onerror: reject,
                    });
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), this.#config.CONSTANTS.COMMENT_SEARCH_FETCH_TIMEOUT_MS)
                )
            ]);

            if (new URLSearchParams(res.finalUrl).get('page') !== new URLSearchParams(url).get('page')) {
                console.warn(`[DC-BanList] 댓글 검색 페이지에서 리디렉션 감지됨`);

                const doc = new DOMParser().parseFromString(prevRes.responseText, 'text/html');

                if (doc.querySelector('div.bottom_paging_wrap a.search_next')) {
                    searchPos = new URLSearchParams(doc.querySelector('div.bottom_paging_wrap a.search_next').getAttribute('href')).get('search_pos');
                    page = 1;

                    return {
                        status: 'search_pos_update',
                        page,
                        searchPos,
                        parsed: [],
                    };
                }
                else {
                    return {
                        status: 'end',
                        page,
                        parsed: [],
                    };
                }
            }
            else {
                const parsed = this.parseCommentList(res.responseText, target);
                if (parsed.length === 0) {
                    return {
                        status: 'empty',
                        page,
                        searchPos,
                        parsed,
                        response: res,
                    };
                }
                else {
                    this.#utils.log('Core', `${galleryId} 갤러리의 ${target}유저 ${page}페이지 ${searchPos}위치 댓글 파싱 완료.`);
                    return {
                        status: 'success',
                        page,
                        searchPos,
                        parsed,
                        response: res,
                    };
                }
            }
        } catch (err) {
            throw err;
        }
    }

    async fetchBanPage(galleryId, galleryType, page) {
        let baseBanListUrl = '';
        if (galleryType === 'MI') {
            baseBanListUrl = 'https://gall.dcinside.com/mini/management/block';
        } else if (galleryType === 'M') {
            baseBanListUrl = 'https://gall.dcinside.com/mgallery/management/block';
        } else {
            throw new Error(`Invalid galleryType: ${galleryType}`);
        }

        const url = `${baseBanListUrl}?id=${encodeURIComponent(galleryId)}&p=${page}`;

        try {
            const res = await Promise.race([
                new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url,
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0 Safari/537.36'
                        },
                        withCredentials: true,
                        onload: resolve,
                        onerror: reject,
                    });
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), this.#config.CONSTANTS.BAN_LIST_FETCH_TIMEOUT_MS)
                )
            ]);

            if (!res.responseText.includes('minor_admin')) {
                console.warn(`[DC-BanList] 차단 페이지에서 리디렉션 감지됨`);
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
                    this.#utils.log('Core', `${galleryId} 갤러리의 ${page}페이지 차단 내역 파싱 완료.`);
                    return {
                        status: 'success',
                        page,
                        parsed,
                    };
                }
            }
        } catch (err) {
            throw err;
        }
    }

    async sendToGoogleSheet(sheetId, banList) {
        try {
            return new Promise((resolve, reject) => {
                this.#utils.log('Core', `${banList.length}건의 차단 내역을 Google 스프레드시트에 업로드합니다.`);
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
                                    const message = `Google 스프레드시트에 ${banList.length}건의 차단 내역 업로드 성공`;
                                    this.#utils.log(`Core`, message);
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

    parseCommentList(htmlText, target) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        const rows = Array.from(doc.querySelectorAll('.listwrap2 .search.search_comment'));

        if (rows.length === 0) {
            return []; // 빈 배열 반환
        }

        const parsedData = rows
            .filter(row => {
                const uid = row.querySelector('.gall_writer')?.getAttribute('data-uid')
                const ip = row.querySelector('.gall_writer')?.getAttribute('data-ip')
                return uid === target || ip === target;
            })
            .map(row => {
                const url = row.querySelector('div.sch_cmt a')?.getAttribute('href') || '';
                const content = row.querySelector('div.sch_cmt a')?.textContent.trim() || '';
                const nickname = row.querySelector('td.gall_writer')?.getAttribute('data-nick') || '';
                const identifier = row.querySelector('td.gall_writer')?.getAttribute('data-uid') || '';
                const date = row.querySelector('td.gall_date')?.textContent.trim() || '';

                // 디스플레이용 html
                const rowHtml = `
                <li style="margin-bottom:5px;">
                    <a href="${url}" target="_blank" style="font-weight:700; color:#00aaff;">${content}</a>
                    <span style="font-size:12px; color:gray;">작성자: ${nickname} (${identifier}) | 작성일: ${date}</span>
                </li>
                `

                return rowHtml;
            });

        return parsedData;
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
                            console.warn('[DC-BanList] HTML 응답을 받음:', html);
                            if (this.isNotLoggedIn(html)) {
                                const err = new Error('로그인되지 않은 상태로 감지됨');
                                err.name = 'NotLoggedInError';
                                console.warn('[DC-BanList] 로그인되지 않은 상태로 감지됨');
                                reject(err);
                            }
                            else if (this.isOAuthUnauthorized(html)) {
                                const err = new Error('OAuth 미승인 상태로 감지됨');
                                err.name = 'OAuthUnauthorizedError';
                                console.warn('[DC-BanList] OAuth 미승인 상태로 감지됨');
                                reject(err);
                            }
                            else if (this.isSheetAccessDenied(html)) {
                                const err = new Error('시트 접근 권한이 없음');
                                err.name = 'SheetAccessDeniedError';
                                console.warn('[DC-BanList] 시트 접근 권한이 없음');
                                reject(err);
                            }
                            else {
                                const err = new Error('알 수 없는 HTML 응답을 받음');
                                err.name = 'UnknownHtmlResponseError';
                                console.warn('[DC-BanList] HTML 응답을 받았지만 상태를 식별하지 못함');
                                reject(err);
                            }
                        }
                        else {
                            const response = JSON.parse(res.responseText);
                            if (response.status === 'success') {
                                this.#utils.log('Core', '마지막 차단 내역 추출 성공', response.lastKnownRecord);

                                const lastKnownRecord = response.lastKnownRecord;
                                resolve({
                                    lastKnownRecord,
                                });
                            } else {
                                console.error('데이터 추출 실패:', response.message);
                                reject(`데이터 추출 실패: ${response.message}`);
                            }
                        }
                    } catch (e) {
                        reject(`응답 파싱 실패: ${e}`);
                    }
                },
                onerror: (err) => {
                    console.warn('응답 원문:', err.responseText);
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
                this.baseUrl = 'https://gall.dcinside.com/mgallery/board/' + (this.postNo ? 'view/' : 'lists/');
                this.galleryType = 'mgallery';
            }
            else if (document.querySelector('span.mngall-tit')) {
                // 미니 갤러리
                this.baseUrl = 'https://gall.dcinside.com/mini/board/' + (this.postNo ? 'view/' : 'lists/');
                this.galleryType = 'mini';
            }
            else {
                // 정식 갤러리
                this.baseUrl = 'https://gall.dcinside.com/board/' + (this.postNo ? 'view/' : 'lists/');
                this.galleryType = 'gallery';
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
                    'X-Requested-With': 'XMLHttpRequest',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0 Safari/537.36'
                },
                withCredentials: true,
                onload: (res) => resolve(res),
                onerror: (err) => reject(err)
            });
        });
    }
}

const urlConfig = JSON.parse(GM_getResourceText('urlConfig'));

const config = {
    DEBUG_MODE: true,
    COMMENT_SEARCH_ENABLED: false,
    ICON_URL: urlConfig.iconUrl,
    APPS_SCRIPT_URL: urlConfig.appsScriptUrl,
    APPS_SCRIPT_AUTH_DEMONSTRATION_URL: urlConfig.appsScriptAuthDemonstrationUrl,

    UI: {
        EXPORT_BAN_LIST_MODAL_ID: 'dcBanListExportBanListModal',
        COMMENT_SEARCH_MODAL_ID: 'dcBanListCommentSearchModal',
    },

    CONSTANTS: {
        BAN_LIST_BATCH_SIZE: 5,
        BAN_LIST_FETCH_DELAY_MS: 200,
        BAN_LIST_FETCH_TIMEOUT_MS: 8000,
        MAX_BAN_LIST_PAGES_LIMIT: 200,
        COMMENT_SEARCH_FETCH_DELAY_MS: 500,
        COMMENT_SEARCH_FETCH_TIMEOUT_MS: 10000,
    },
};

const state = {
    exportLogs: [],
};

const utils = {
    log: (context, ...messages) => {
        const msg = `[DC-BanList]${context ? `[${context}]` : ''} ${messages.map(m =>
            typeof m === 'object' ? JSON.stringify(m) : m
        ).join(' ')}`;

        if (config.DEBUG_MODE) console.log(msg);

        state.exportLogs.push(msg);
    },
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
};

const isMobile = location.hostname === 'm.dcinside.com';
const galleryParser = new PostParser();

(async () => {
    // --- Script Entry Point ---

    'use strict';

    const dcBanList = new DCBanList(
        config,
        state,
        utils,
        UIManager,
        ModalManager
    );

    dcBanList.init();
    await galleryParser.init();
})();