// GoogleAppScript.js
// This script is designed to work with the DC_BanList extension to log blocked users.
// It handles requests to upload ban lists to a Google Sheet and retrieve the last known record.
// GitHub: https://github.com/tristan23612/DC-BanList

// Visit https://script.google.com/ to create an own new project and paste this code.

const headers = ['닉네임', '식별코드', '게시글 / 댓글', '사유', '기간', '처리날짜', '처리자', '비고'];

function doPost(e) {
    const action = JSON.parse(e.postData.contents).action;
    if (action === 'uploadToGoogleSheet') {
        return uploadToGoogleSheet(e);
    }
    else if (action === 'getLastKnownRecord') {
        return handleGetLastKnownRecord(e);
    }
    else {
        return ContentService.createTextOutput(
            JSON.stringify({
                status: 'error',
                message: 'Invalid action'
            })
        ).setMimeType(ContentService.MimeType.JSON);
    }
}

function doGet(e) {
    if (e.parameter.check === 'true') {
        return ContentService.createTextOutput("AUTH_OK");
    }
    return HtmlService.createHtmlOutput(`
        <div style="font-family:sans-serif; text-align:center; margin-top:100px;">
            <h2>✅ 인증이 완료되었습니다</h2>
            <p>이 창은 닫으셔도 됩니다.</p>
        </div>
    `);
}

function uploadToGoogleSheet(e) {
    try {
        const content = JSON.parse(e.postData.contents);
        const sheetId = content.sheetId
        const galleryId = content.galleryId;
        const banList = content.banList;

        if (!sheetId || !galleryId || !banList) {
            throw new Error('There is an empty data')
        }

        if (!Array.isArray(banList)) {
            throw new Error('Expected JSON array');
        }

        const spreadsheet = SpreadsheetApp.openById(sheetId);
        let sheet = spreadsheet.getSheetByName(galleryId);

        if (!sheet) {
            sheet = spreadsheet.insertSheet(galleryId);
        }

        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length).setBackground('#3b4890');
        sheet.getRange(1, 1, 1, headers.length).setFontColor('white')

        Logger.log("uploadToGoogleSheet called");
        Logger.log("갤ID: " + galleryId);
        Logger.log("데이터 길이: " + banList.length);

        sheet.insertRowsBefore(2, banList.length);

        const rows = banList.map(record => [
            record.nickname || '',
            record.identifier || '',
            record.content || '',
            record.reason || '',
            record.duration || '',
            record.dateTime || '',
            record.manager || ''
        ]);

        sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);

        protectAllData(sheet);

        return ContentService.createTextOutput(
            JSON.stringify({
                status: 'success'
            })
        ).setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({
            status: 'error',
            message: err.message
        })).setMimeType(ContentService.MimeType.JSON);
    }
}

function handleGetLastKnownRecord(e) {
    try {
        const content = JSON.parse(e.postData.contents);
        const sheetId = content.sheetId
        const galleryId = content.galleryId;

        Logger.log("handleGetLastKnownRecord called");
        Logger.log("갤ID: " + galleryId);

        let spreadsheet;
        try {
            spreadsheet = SpreadsheetApp.openById(sheetId);
        } catch (err) {
            throw new Error('유효하지 않은 스프레드시트 ID입니다.');
        }

        try {
            const tempSheet = spreadsheet.insertSheet('AUTH_TEST_' + new Date().getTime());
            spreadsheet.deleteSheet(tempSheet);
        } catch (err) {
            return ContentService.createTextOutput(
                JSON.stringify({
                    status: 'error',
                    message: '스프레드시트에 대한 "편집자" 권한이 없습니다. 공유 설정을 확인해주세요.'
                })
            ).setMimeType(ContentService.MimeType.JSON);
        }

        let sheet = spreadsheet.getSheetByName(galleryId);
        if (!sheet) {
            return ContentService.createTextOutput(
                JSON.stringify({
                    status: 'success',
                    lastKnownRecord: null
                })
            ).setMimeType(ContentService.MimeType.JSON);
        }
        else {
            const row = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues();
            if (row.length === 0 || row[0].length === 0) {
                return ContentService.createTextOutput(
                    JSON.stringify({
                        status: 'success',
                        lastKnownRecord: []
                    })
                ).setMimeType(ContentService.MimeType.JSON);
            }
            else {
                Logger.log("가져온 데이터: " + JSON.stringify(row));
                return ContentService.createTextOutput(
                    JSON.stringify({
                        status: 'success',
                        lastKnownRecord: {
                            nickname: row[0][0] || '',
                            identifier: row[0][1] || '',
                            content: row[0][2] || '',
                            reason: row[0][3] || '',
                            duration: row[0][4] || '',
                            dateTime: row[0][5] || '',
                            manager: row[0][6] || ''
                        }
                    })
                ).setMimeType(ContentService.MimeType.JSON);
            }
        }
    }
    catch (err) {
        return ContentService.createTextOutput(
            JSON.stringify({
                status: 'error',
                message: err.message
            })
        ).setMimeType(ContentService.MimeType.JSON);
    }
}

function protectAllData(sheet) {
    const sheetProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    for (let sheetProtection of sheetProtections) {
        sheetProtection.remove();
    }
    const rangeProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    for (let rangeProtection of rangeProtections) {
        rangeProtection.remove();
    }

    const sheetProtection = sheet.protect().setDescription('전체 보호 (관리자 전용)');
    const ownerEmail = sheet.getParent().getOwner().getEmail();
    sheetProtection.removeEditors(sheetProtection.getEditors());
    sheetProtection.addEditors([ownerEmail]);

    const freeRange = sheet.getRange(2, sheet.getLastColumn(), sheet.getMaxRows() - 1, 1);
    sheetProtection.setUnprotectedRanges([freeRange]);
}