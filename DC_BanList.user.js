// ==UserScript==
// @name             DC_BanList
// @name:ko          디시인사이드 차단 내역 관리
// @namespace        https://github.com/tristan23612/DC-BanList
// @author           망고스틴
// @version          1.9.1-release
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
// @resource         urlConfig https://raw.githubusercontent.com/tristan23612/DC-BanList/refs/heads/main/resources/UrlConfig.json
// @license          MIT
// @icon             https://github.com/tristan23612/DC-BanList/blob/main/resources/DC_BanList_icon.png?raw=true
// @downloadURL https://github.com/tristan23612/DC-BanList/releases/latest/download/DC_BanList.user.js
// @updateURL https://github.com/tristan23612/DC-BanList/releases/latest/download/DC_BanList.meta.js
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
                        }
                        else {
                            this.#log('ModalManager', `댓글 검색 모달에서 검색 대상을 ${searchTarget}로 설정했습니다.`);
                            currentStep = 'GettingTargetNickName';
                            updateContent();
                        }
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

        let currentStep = 'OAuthConfirmation';
        let banList = [];
        let resultMessage = '';
        let sheetId = '';
        let lastKnownRecord = null;
        let autoProcess = false;

        let banExportModalContentHTML = '';
        let banExportModalFooterHTML = '';
        let banExportModalConetntDiv = '';

        this.#state.exportLogs = [];

        const updateContent = () => {
            if (currentStep === 'OAuthConfirmation') {
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

                contentDiv.onclick = async (event) => {
                    if (event.target && event.target.id === 'oauthConfirmBtn') {
                        const statusEl = contentDiv.querySelector('#oauthStatusMessage');
                        const currentState = event.target.dataset.state;

                        if (currentState === 'need-auth') {
                            window.open(this.#config.APPS_SCRIPT_URL, 'googleAuth', 'width=600,height=600');

                            event.target.dataset.state = 'init';
                            event.target.textContent = '재시도';
                            if (statusEl) {
                                statusEl.innerHTML = '<span style="color: #007BFF;">💡 팝업에서 인증을 진행하신 후, 버튼을 다시 눌러주세요.</span>';
                            }
                        }
                        else {
                            const container = event.target.closest('.process-buttons');
                            if (container) {
                                container.classList.add('is-loading');
                            }
                            event.target.textContent = '권한 확인 중...';
                            if (statusEl) statusEl.innerHTML = '⏳ 구글 계정 권한을 확인하고 있습니다...';

                            try {
                                console.log('[DC-BanList] Checking authentication status with Google Apps Script...');
                                const res = await Promise.race([
                                    new Promise((resolve, reject) => {
                                        GM_xmlhttpRequest({
                                            method: 'GET',
                                            url: `${this.#config.APPS_SCRIPT_URL}?check=true`,
                                            onload: (response) => resolve(response),
                                            onerror: (err) => reject(err),
                                            timeout: 10000,
                                            anonymous: false,
                                            fetch: true,
                                            ontimeout: () => reject(new Error('Request timed out')),
                                        });
                                    }),
                                    new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), 15000))
                                ])
                                const resultText = res.responseText.trim();
                                console.log('[DC-BanList] Authentication check response:', resultText);
                                if (resultText === "AUTH_OK") {
                                    if (statusEl) statusEl.innerHTML = '<span style="color: green;">✅ 인증 확인되었습니다!</span>';

                                    await new Promise(resolve => setTimeout(resolve, 1000));

                                    currentStep = 'SheetIdConfirmation';
                                    updateContent();
                                } else {
                                    event.target.dataset.state = 'need-auth';
                                    event.target.textContent = 'GAS 승인';
                                    if (statusEl) {
                                        statusEl.innerHTML = `
                                            <span style="color: #E67E22; font-weight: bold;">⚠️ 권한 승인이 필요합니다.</span><br>
                                            <span style="font-size: 12px; color: gray;">버튼을 클릭하여 나타나는 팝업창에서 [허용]을 눌러주세요.</span>
                                        `;
                                    }
                                }
                            } catch (err) {
                                this.#log('ModalManager', `Error during authentication check: ${err.message || err}`);
                                console.error('[DC-BanList] Auth Error:', err);
                                event.target.textContent = '다시 시도';
                                if (statusEl) statusEl.innerHTML = '<span style="color: #dc3545;">⚠️ 서버 연결 실패. 네트워크를 확인해주세요.</span>';
                            } finally {
                                container.classList.remove('is-loading');
                            }
                        }
                    }
                    else if (event.target && event.target.id === 'uploadCancelBtn') {
                        this.hideExportBanListModal();
                    }
                };
            }
            else if (currentStep === 'SheetIdConfirmation') {
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

                contentDiv.onclick = async (event) => {
                    if (event.target && event.target.id === 'manualProcessBtn' || (event.target && event.target.id === 'autoProcessBtn')) {
                        const container = event.target.closest('.process-buttons');
                        if (container) {
                            container.classList.add('is-loading');
                        }

                        const statusEl = contentDiv.querySelector('#sheetIDConfirmationStatusMessage');
                        statusEl.innerHTML = '<span style="color: #007BFF;">⏳ 시트 ID를 확인하고 있습니다...</span>';

                        sheetId = contentDiv.querySelector('#sheetIdInput').value.trim() || storedSheetId;
                        if (!sheetId || sheetId === '시트 ID를 입력해주세요.') {
                            alert('시트 ID를 입력해주세요.');
                            container.classList.remove('is-loading');
                            return;
                        }

                        GM_setValue('spreadsheetId', sheetId);
                        this.#log('ModalManager', `차단 내역 내보내기 모달에서 시트 ID를 ${sheetId}로 설정했습니다.`);
                        if (event.target.id === 'autoProcessBtn') {
                            autoProcess = true;
                            this.#log('ModalManager', '자동 처리 옵션이 활성화되었습니다. 가능한 경우 수동 확인 단계를 건너뜁니다.');
                        }

                        try {
                            const result = await this.#eventHandlers.getLastKnownRecord(sheetId);
                            lastKnownRecord = result.lastKnownRecord ?? [];
                            this.#log('ModalManager', `마지막으로 알려진 기록: ${lastKnownRecord?.length === 0 ? '없음' : lastKnownRecord}`);

                            if (lastKnownRecord.length === 0) {
                                if (statusEl) statusEl.innerHTML = '<span style="color: #28a745;">✅ 시트 ID 확인되었습니다! 새로운 시트를 생성합니다.</span>';
                                currentStep = 'CreateSheetConfirmation';
                            } else if (autoProcess) {
                                if (statusEl) statusEl.innerHTML = '<span style="color: #28a745;">✅ 시트 ID 확인되었습니다! 자동으로 처리합니다.</span>';
                                currentStep = 'Parsing';
                            } else {
                                if (statusEl) statusEl.innerHTML = '<span style="color: #28a745;">✅ 시트 ID 확인되었습니다!</span>';
                                currentStep = 'ExportConfirmation';
                            }

                            await new Promise(resolve => setTimeout(resolve, 1000));
                            updateContent();
                        } catch (err) {
                            this.#log('ModalManager', `시트 ID 확인 중 오류 발생: ${err.message || err}`);
                            if (statusEl) statusEl.innerHTML = `<span style="color: #dc3545;">⚠️ 시트 ID 확인 중 오류 발생: ${err.message || err}</span>`;
                        } finally {
                            container?.classList.remove('is-loading');
                        }
                    }
                    else if (event.target && event.target.id === 'sheetIdCancelBtn') {
                        currentStep = 'OAuthConfirmation';
                        updateContent();
                    }
                };
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
                        if (autoProcess) {
                            currentStep = 'Parsing';
                        }
                        else {
                            currentStep = 'ExportConfirmation';
                        }
                        updateContent();
                    }
                    else if (event.target && event.target.id === 'createSheetCancelBtn') {
                        currentStep = 'SheetIdConfirmation';
                        updateContent();
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
                        currentStep = 'SheetIdConfirmation';
                        updateContent();
                    }
                };
            }
            else if (currentStep === 'Parsing') {
                let progressText = '';
                banExportModalContentHTML = this.#uiManager.renderBanExportModalContent({ currentStep, progressText });
                banExportModalFooterHTML = this.#uiManager.renderBanExportModalFooter({ currentStep });

                contentDiv.innerHTML = banExportModalContentHTML + banExportModalFooterHTML;
                footer.style.display = 'none';
                this.#log('ModalManager', 'Entered Parsing step of the export ban list modal.');

                (async () => {
                    try {
                        const result = await this.#eventHandlers.exportBanList((progressText) => {
                            const banExportModalContentDiv = contentDiv.querySelector('.export-ban-list-modal-content');
                            if (banExportModalContentDiv) {
                                banExportModalContentDiv.innerHTML = this.#uiManager.renderBanExportModalContent({
                                    currentStep: 'Parsing',
                                    progressText
                                });
                            }
                        }, lastKnownRecord);

                        banList = result;

                        if (banList.length === 0) {
                            currentStep = 'UploadComplete';
                            resultMessage = '갱신할 차단 내역이 없습니다. 업로드를 건너뜁니다.';
                            this.#log('ModalManager', 'No new ban list found, skipping upload.');
                        } else if (autoProcess) {
                            currentStep = 'UploadInProgress';
                            this.#log('ModalManager', `Found ${banList.length} new ban list entries, automatically proceeding to upload.`);
                        } else {
                            currentStep = 'ReadyToUpload';
                            this.#log('ModalManager', `Found ${banList.length} new ban list entries, ready to upload.`);
                        }
                    } catch (err) {
                        console.error('[DC-BanList] 수집 중 오류 발생:', err);

                        const errorStepMap = {
                            PermissionError: 'PermissionError',
                            NotLoggedInError: 'NotLoggedInError',
                            OAuthUnauthorizedError: 'OAuthUnauthorizedError',
                            SheetAccessDeniedError: 'SheetAccessDeniedError'
                        };

                        currentStep = errorStepMap[err.name] || 'ParseError';

                        if (err.name === 'PermissionError') {
                            resultMessage = err.message;
                        } else if (!errorStepMap[err.name]) {
                            resultMessage = err.message || '알 수 없는 오류가 발생했습니다.';
                            console.error('[DC-BanList] 차단 내역 수집 중 오류 발생:', resultMessage);
                            this.#eventHandlers.log(`[DC-BanList] 차단 내역 수집 중 오류 발생: ${resultMessage}`);
                        }
                    } finally {
                        updateContent();
                    }
                })();
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
                        currentStep = 'UploadComplete';
                    } catch (e) {
                        const errorStepMap = {
                            NotLoggedInError: 'NotLoggedInError',
                            OAuthUnauthorizedError: 'OAuthUnauthorizedError',
                            SheetAccessDeniedError: 'SheetAccessDeniedError'
                        };
                        currentStep = errorStepMap[e.name] || 'UploadError';
                        if (!errorStepMap[e.name]) resultMessage = e.message || '오류 발생';
                    } finally {
                        updateContent();
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
        if (currentStep === 'OAuthConfirmation') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                    <div class="process-buttons">
                        <button id="oauthConfirmBtn"
                            data-state="init"
                            class="modal-confirm-btn">
                            승인 완료
                        </button>
                        <button id="uploadCancelBtn" class="modal-cancel-btn">취소</button>
                    </div>
                </div>
            </div>`;
        }
        else if (currentStep === 'SheetIdConfirmation') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                    <div class="process-buttons">
                        <div class="process-option-buttons">
                            <button id="manualProcessBtn" class="manual-process-btn">수동 진행</button>
                            <button id="autoProcessBtn" class="auto-process-btn">자동 진행</button>
                        </div>
                        <button id="sheetIdCancelBtn" class="modal-cancel-btn">이전</button>
                    </div>
                </div>
            </div>`;
        }
        else if (currentStep === 'CreateSheetConfirmation') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                    <div class="process-buttons">
                        <button id="createSheetConfirmBtn" class="modal-confirm-btn">확인</button>
                        <button id="createSheetCancelBtn" class="modal-cancel-btn">이전</button>
                    </div>
                </div>
            </div>`;
        }
        else if (currentStep === 'ExportConfirmation') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                    <div class="process-buttons">
                        <button id="parseConfirmBtn" class="modal-confirm-btn">확인</button>
                        <button id="parseCancelBtn" class="modal-cancel-btn">이전</button>
                    </div>
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
                    <div class="process-buttons">
                        <button id="uploadConfirmBtn" class="modal-confirm-btn">확인</button>
                        <button id="uploadCancelBtn" class="modal-cancel-btn">취소</button>
                    </div>
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
        else if (currentStep === 'SheetAccessDeniedError') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                    <div class="process-buttons">
                        <button id="backToSheetIdConfirmationBtn" class="modal-confirm-btn">이전</button>
                        <button id="uploadCancelBtn" class="modal-cancel-btn">취소</button>
                    </div>
                </div>
            </div>`;
        }
        else if (currentStep === 'UploadError') {
            innerHTML = `
            <div class="export-ban-list-modal-footer">
                <div class="modal-buttons">
                    <button id="copyLogsBtn" class="copy-logs-btn">로그 복사</button>
                    <div class="process-buttons">
                        <button id="backToUploadBtn" class="modal-confirm-btn">이전</button>
                        <button id="uploadCancelBtn" class="modal-cancel-btn">취소</button>
                    </div>
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
            currentStep = 'confirm',
            progressText = '',
            sheetId = '',
            resultMessage = '',
            banListLength = 0,
        } = state;

        let innerHTML = '';
        if (currentStep === 'OAuthConfirmation') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">Google Apps Script 권한 승인</div>
                <div>GAS를 사용하려면 OAuth 권한 승인이 필요합니다.</div>
                <a href="#" onclick="window.open(
                    '${this.#config.APPS_SCRIPT_AUTH_DEMONSTRATION_URL}',
                    'popupWindow',
                    'width=600,height=600,scrollbars=yes,resizable=yes'
                )" style="font-size: 13px; color: #007BFF;">
                    GAS 승인 가이드 영상
                </a>
                <div id="oauthStatusMessage" style="margin: 10px 0; min-height: 18px; font-size: 13px;">아래 버튼을 클릭하여 진행해주세요.</div>
                <div style="font-size: 13px; color: gray;">오랜 기간이 지나면 인증이 초기화되었을 가능성이 있습니다.</div>
                <a href="https://gall.dcinside.com/mini/mangonote" target="_blank" style="font-size: 13px; color: gray;">
                지속적으로 문제 발생시 이곳으로 제보해주세요.
                </a>
                <div><br></div>
            </div>`;
        }
        else if (currentStep === 'SheetIdConfirmation') {
            innerHTML = `
            <div class="export-ban-list-modal-content">
                <div style="font-weight:700; font-size:15px;">기존 데이터 확인을 위해 시트 ID가 먼저 필요합니다.</div>
                <div>구글 시트 ID를 입력해주세요.</div>
                <div style="font-size: 13px; color: gray;">https://docs.google.com/spreadsheets/d/*/~~</div>
                <div style="font-size: 13px; color: gray;">* 부분 문자열을 입력해주세요.</div>
                <div style="font-size: 13px; color: gray;">이전에 입력한 ID가 기본값으로 적용됩니다.</div>
                <div style="font-size: 13px; color: gray;">변경을 원치 않으시면 바로 확인을 눌러주세요.</div>
                <div id="sheetIDConfirmationStatusMessage" style="margin: 10px 0; min-height: 18px; font-size: 13px;">아래 버튼을 클릭하여 진행해주세요.</div>
                <div class="sheet-id-input-group">
                    <input type="text" id="sheetIdInput" class="sheet-id-input" 
                        placeholder="${sheetId}"/>
                </div>
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
                <div>아래 녹색 버튼을 클릭하여 권한을 확인해주세요.</div>
                <a href="#" onclick="window.open(
                    '${this.#config.APPS_SCRIPT_AUTH_DEMONSTRATION_URL}',
                    'popupWindow',
                    'width=600,height=600,scrollbars=yes,resizable=yes'
                )" style="font-size: 13px; color: #007BFF;">
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
            exportBanList: async (progressCallback, lastKnownRecord = null) => this.exportBanList(progressCallback, lastKnownRecord),
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
                reportProgress(`페이지 ${page} 요청 중...<br>누적 ${commentList.length}건`, commentList);

                let result;
                try {
                    result = await this.fetchCommentsPage(galleryId, gallType, searchTarget, page, searchPos, prevRes);
                }
                catch (err) {
                    reportProgress(`페이지 ${page} 요청 중 오류 발생, 재시도합니다.<br>${err.message}<br>누적 ${commentList.length}건`, commentList);
                    await this.#utils.sleep(this.#config.CONSTANTS.COMMENT_SEARCH_FETCH_DELAY_MS);
                    continue;
                }
                const fetchedComments = result.parsed;
                searchPos = result.searchPos ? result.searchPos : '';
                page = result.page;
                prevRes = result.response;

                if (result.status === 'end') {
                    reportProgress(`페이지 ${page}에 더 이상 댓글이 없습니다. 검색 종료.<br>누적 ${commentList.length}건`, commentList);
                    break;
                }

                commentList.push(...fetchedComments);
                reportProgress(`페이지 ${page} 처리 완료<br>누적 ${commentList.length}건`, commentList);
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
                    anonymous: false,
                    fetch: true,
                    onload: resolve,
                    onerror: reject,
                });
            });

            const parser = new DOMParser();
            const doc = parser.parseFromString(res.responseText, 'text/html');
            const nickname = doc.querySelector('.nick_name')?.textContent?.trim();

            if (!nickname) {
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

    async exportBanList(progressCallback, lastKnownRecord = null) {
        const galleryId = galleryParser.galleryId;
        const gallType = galleryParser.galleryType === 'mgallery' ? 'M' : (galleryParser.galleryType === 'mini' ? 'MI' : '');
        const banList = [];

        try {
            this.#utils.log('Core', `${isMobile ? '모바일' : 'PC'} 차단 내역 수집 시작`, { galleryId, gallType });

            const reportProgress = (msg) => {
                this.#utils.log('Core', msg);
                if (typeof progressCallback === 'function') progressCallback(msg);
            };

            const isSameEntry = (a, b) => (
                a.nickname.toString() === b.nickname.toString() &&
                a.identifier.toString() === b.identifier.toString() &&
                a.content === b.content &&
                a.reason.toString() === b.reason.toString() &&
                a.duration === b.duration &&
                a.dateTime === b.dateTime &&
                a.manager === b.manager
            );

            // 1. 1페이지 요청 및 공통 fetchBanList 사용
            const firstResult = await this.fetchBanList(galleryId, gallType, 1);
            const firstPageList = firstResult.parsedBanList;

            // 2. totalPages 동적 추출 (모바일 / PC DOM 분기)
            let totalPages = 1;
            if (firstResult.doc) {
                if (isMobile) {
                    const total = parseInt(firstResult.doc.querySelector('#total')?.value || '0', 10);
                    const slidePage = parseInt(firstResult.doc.querySelector('#slidePage')?.value || '100', 10);
                    totalPages = Math.ceil(total / slidePage) || 1;
                } else {
                    const endLink = firstResult.doc.querySelector('.bottom_paging_box a.page_end');
                    if (endLink) {
                        const match = endLink.getAttribute('href')?.match(/[?&]p=(\d+)/);
                        if (match?.[1]) totalPages = parseInt(match[1], 10);
                    } else {
                        const pageNumbers = Array.from(firstResult.doc.querySelectorAll('.bottom_paging_box a'))
                            .map(a => a.getAttribute('href')?.match(/[?&]p=(\d+)/)?.[1])
                            .filter(Boolean)
                            .map(Number);
                        if (pageNumbers.length > 0) totalPages = Math.max(...pageNumbers);
                    }
                }
            }

            // 3. 1페이지 레코드 데이터 적재 및 중복 검사
            let shouldStop = false;
            for (const record of firstPageList) {
                if (lastKnownRecord && lastKnownRecord.length !== 0 && isSameEntry(record, lastKnownRecord)) {
                    reportProgress(`중복 데이터 감지됨: 나머지는 건너뜁니다.<br>누적 ${banList.length}건`);
                    shouldStop = true;
                    break;
                }
                banList.push(record);
            }

            reportProgress(`페이지 1 처리 완료<br>누적 ${banList.length}건`);
            if (shouldStop || totalPages <= 1) return banList;

            // 4. 2페이지부터 반복 수집 (모바일: batchSize = 1, PC: 설정값 사용)
            const batchSize = isMobile ? 1 : this.#config.CONSTANTS.BAN_LIST_BATCH_SIZE;

            for (let i = 2; i <= totalPages; i += batchSize) {
                const currentBatchSize = Math.min(batchSize, totalPages - i + 1);
                const batchPages = Array.from({ length: currentBatchSize }, (_, j) => i + j);

                let results;
                try {
                    results = await Promise.all(
                        batchPages.map(page => this.fetchBanList(galleryId, gallType, page))
                    );
                } catch (err) {
                    if (err.name === 'PermissionError') throw err;

                    reportProgress(`페이지 ${i} 요청 중 오류 발생, 재시도합니다.<br>${err.message}<br>누적 ${banList.length}건`);
                    i -= batchSize;
                    await this.#utils.sleep(this.#config.CONSTANTS.BAN_LIST_FETCH_DELAY_MS);
                    continue;
                }

                for (const result of results) {
                    for (const record of result.parsedBanList) {
                        if (lastKnownRecord && lastKnownRecord.length !== 0 && isSameEntry(record, lastKnownRecord)) {
                            reportProgress(`중복 데이터 감지됨: 나머지는 건너뜁니다.<br>누적 ${banList.length}건`);
                            shouldStop = true;
                            break;
                        }
                        banList.push(record);
                    }

                    if (shouldStop) break;
                    reportProgress(`페이지 ${result.page} 처리 완료<br>누적 ${banList.length}건`);
                }

                if (shouldStop) break;
                await this.#utils.sleep(this.#config.CONSTANTS.BAN_LIST_FETCH_DELAY_MS);
            }

            if (typeof progressCallback === 'function') {
                progressCallback(`총 ${banList.length}건 수집 완료`);
                await this.#utils.sleep(2000);
            }

            this.#utils.log('Core', '차단 내역 수집 완료', { galleryId, totalRecords: banList.length });
            return banList;
        } catch (err) {
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
                        anonymous: false,
                        fetch: true,
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

    async fetchBanList(galleryId, galleryType, page) {
        let baseBanListUrl = '';
        if (galleryType === 'MI') {
            baseBanListUrl = isMobile
                ? 'https://m.dcinside.com/management/mini/avoid'
                : 'https://gall.dcinside.com/mini/management/block';
        } else if (galleryType === 'M') {
            baseBanListUrl = isMobile
                ? 'https://m.dcinside.com/management/minor/avoid'
                : 'https://gall.dcinside.com/mgallery/management/block';
        } else {
            throw new Error(`Invalid galleryType: ${galleryType}`);
        }

        const url = isMobile
            ? `${baseBanListUrl}/${encodeURIComponent(galleryId)}?state=&page=${page}&searchType=&searchValue=`
            : `${baseBanListUrl}?id=${encodeURIComponent(galleryId)}&p=${page}`;

        try {
            const res = await Promise.race([
                new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url,
                        anonymous: false,
                        fetch: true,
                        onload: resolve,
                        onerror: reject,
                    });
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), this.#config.CONSTANTS.BAN_LIST_FETCH_TIMEOUT_MS)
                )
            ]);

            const isInvalid = isMobile
                ? res.responseText.includes('로그인이 필요한 서비스')
                : (!res.responseText.includes('minor_admin'));

            if (isInvalid) {
                console.warn(`[DC-BanList] 차단 페이지에서 리디렉션 감지됨`);
                const err = new Error('차단 페이지 리디렉션 감지됨 - 매니저 권한이 없을 수 있습니다.');
                err.name = 'PermissionError';
                throw err;
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(res.responseText, 'text/html');

            const parsedBanList = this.parseBanList(res.responseText);

            if (parsedBanList.length === 0) {
                return {
                    status: 'empty',
                    page,
                    parsedBanList,
                    doc,
                };
            }
            else {
                this.#utils.log('Core', `${galleryId} 갤러리의 ${page}페이지 차단 내역 파싱 완료.`);
                return {
                    status: 'success',
                    page,
                    parsedBanList,
                    doc,
                };
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
                        anonymous: false,
                        fetch: true,
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
        const doc = isMobile
            ? parser.parseFromString(`<ul>${htmlText}</ul>`, 'text/html')
            : parser.parseFromString(htmlText, 'text/html');

        const rows = isMobile
            ? Array.from(doc.querySelectorAll('li .item'))
            : Array.from(doc.querySelectorAll('table.minor_block_list tbody tr'));

        if (rows.length === 0) {
            return []; // 빈 배열 반환
        }

        const parsePcRow = (row) => {
            const blockNik = row.querySelector('.blocknik');
            const blockContent = row.querySelector('.blockcontent');
            const blockDay = row.querySelector('.blockday');

            const pTexts = Array.from(blockNik?.querySelectorAll('p') || [])
                .map(p => p.textContent.trim())
                .filter(Boolean);
            const nickname = pTexts[0] || '';
            const identifier = (pTexts[1] || '').replace(/[()]/g, '');

            const type = blockContent?.querySelector('em')?.textContent.trim() || '';
            const title = blockContent?.querySelector('a')?.textContent.trim() || '';
            const content = type ? `[${type}] ${title}` : title;

            const date = blockDay?.querySelector('.block_date')?.textContent.trim() || '';
            const time = blockDay?.querySelector('.block_time')?.textContent.replace(/처리\s*시간\s*:\s*/, '').trim() || '';
            const managerRaw = blockDay?.querySelector('.block_conduct')?.textContent || '';
            const manager = managerRaw.match(/처리자\s*:\s*(.+)/)?.[1]?.trim() || '';

            return {
                nickname,
                identifier,
                content,
                reason: row.querySelector('.blockreason')?.textContent.trim() || '',
                duration: row.querySelector('.blocktime')?.textContent.trim() || '',
                dateTime: [date, time].filter(Boolean).join(' '),
                manager
            };
        };

        const parseMobileRow = (row) => {
            const captions = Array.from(row.querySelectorAll('.mg-block-caption'));

            const headerText = captions[0]?.querySelector('.tit')?.textContent.trim() || '';
            const ipText = captions[0]?.querySelector('.ip')?.textContent.trim() || '';

            const headerMatch = headerText.match(/^([\s\S]+?)\s*(?:\(([^)]+)\))?$/);
            const nickname = headerMatch?.[1]?.trim() || '';
            const identifier = `${headerMatch?.[2]?.trim() || ''} ${ipText}`.trim();

            // 동적 캡션 데이터를 Key-Value Map으로 변환하여 순서 의존성 제거
            const captionMap = new Map();
            captions.slice(1).forEach(cap => {
                const label = cap.querySelector('.tit')?.textContent.trim();
                const valueEl = cap.querySelector('.txt');
                if (label && valueEl) captionMap.set(label, valueEl);
            });

            // 게시글/댓글 라벨 탐색
            const contentType = captionMap.has('게시글') ? '게시글' : (captionMap.has('댓글') ? '댓글' : '');
            const contentEl = captionMap.get('게시글') || captionMap.get('댓글');
            const contentTitle = contentEl?.querySelector('.lnkgo')?.textContent.trim() || contentEl?.textContent.trim() || '';
            const content = contentType ? `[${contentType}] ${contentTitle}` : contentTitle;

            return {
                nickname,
                identifier,
                content,
                reason: captionMap.get('사유')?.textContent.trim() || '',
                duration: captionMap.get('기간')?.textContent.trim() || '',
                dateTime: captionMap.get('처리 일시')?.textContent.trim() || '',
                manager: captionMap.get('처리자')?.textContent.trim() || ''
            };
        };

        const parsedData = rows.map(isMobile ? parseMobileRow : parsePcRow);

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
                anonymous: false,
                fetch: true,
                onload: (res) => {
                    try {
                        const response = JSON.parse(res.responseText);
                        if (response.status === 'success') {
                            this.#utils.log('Core', '마지막 차단 내역 추출 성공', response.lastKnownRecord);

                            const lastKnownRecord = response.lastKnownRecord;
                            resolve({
                                lastKnownRecord,
                            });
                        }
                        else {
                            console.error('[DC-BanList] ', response.message);
                            reject(`${response.message}`);
                        }
                    } catch (e) {
                        reject(`응답 파싱 실패: ${e}`);
                    }
                },
                onerror: (err) => {
                    console.warn('응답 원문:', err.responseText);
                    console.error('[DC-BanList] 요청 실패:', err);
                    reject(`요청 실패: ${err}`);
                }
            });
        });
    };
}

class PostParser {
    async init() {
        if (isMobile) {
            this.galleryId = document.querySelector('div.gall-tit-box a').getAttribute('href').split('/')[2];
            this.postNo = this.#_extractPostId(window.location.href, this.galleryId);

            if (document.querySelector('span.mgall-tit')) {
                this.galleryType = 'mgallery';
            }
            else if (document.querySelector('span.mngall-tit')) {
                this.galleryType = 'mini';
            }
            else {
                this.galleryType = 'gallery';
            }
        }
        else {
            this.galleryId = new URLSearchParams(window.location.search).get('id');
            this.galleryType = window.location.href.includes('mgallery') ? 'mgallery' : (window.location.href.includes('mini') ? 'mini' : null);
        }
    }

    #_extractPostId(url, galleryId) {
        const pattern = new RegExp(`/board/${galleryId}/(\\d+)`);
        const match = url.match(pattern);
        return match ? match[1] : null;
    }
}

const urlConfig = JSON.parse(GM_getResourceText('urlConfig'));

const config = {
    DEBUG_MODE: true,
    COMMENT_SEARCH_ENABLED: true,
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