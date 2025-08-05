// GoogleAppScript.js
// Google Apps Script for handling POST requests and writing to Google Sheets
// This script is designed to work with the DC_BanList extension to log blocked users.
// Replace YOUR_SPREADSHEET_ID_HERE with your actual Google Spreadsheet ID.
// Ensure you have the necessary permissions to run this script and access the spreadsheet.
// Make sure to set up the Google Apps Script project with the necessary scopes and permissions.
// This script should be deployed as a web app to handle POST requests.

// Visit https://script.google.com/ to create a new project and paste this code.

function doPost(e) {
    const action = JSON.parse(e.postData.contents).action;
    if (action === 'uploadToGoogleSheet') {
        return uploadToGoogleSheet(e);
    }
    else if (action === 'getLastDateData') {
        return handleGetLastDateData(e);
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

        const headers = ['닉네임', '식별코드', '게시글 / 댓글', '사유', '기간', '처리날짜', '처리자'];
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length).setBackground('#3b4890');
        sheet.getRange(1, 1, 1, headers.length).setFontColor('white')

        Logger.log("갤ID: " + galleryId);
        Logger.log("데이터 길이:", banList.length);

        // 헤더 아래에 삽입
        sheet.insertRowsBefore(2, banList.length);

        // 배열 형태로 변환
        const rows = banList.map(record => [
            record.nickname || '',
            record.identifier || '',
            record.content || '',
            record.reason || '',
            record.duration || '',
            record.dateTime || '',
            record.manager || ''
        ]);

        // 시트 (1,1) 위치부터 입력
        sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);

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

function handleGetLastDateData(e) {
    try {
        const content = JSON.parse(e.postData.contents);
        const sheetId = content.sheetId
        const galleryId = content.galleryId;

        if (!sheetId || !galleryId) {
            throw new Error('There is an empty data')
        }

        // 스프레드시트 열기 시도 및 유효성 검사
        let spreadsheet;
        try {
            spreadsheet = SpreadsheetApp.openById(sheetId);
        } catch (err) {
            throw new Error('유효하지 않은 스프레드시트 ID입니다.');
        }

        let sheet = spreadsheet.getSheetByName(galleryId);
        if (!sheet) {
            // 시트가 없으면 빈 데이터 반환 (에러 던지지 않음)
            return ContentService.createTextOutput(
                JSON.stringify({
                    status: 'success',
                    lastDate: null,
                    lastDateData: []
                })
            ).setMimeType(ContentService.MimeType.JSON);
        }

        // 시트의 가장 2행 데이터 가져오기
        const row = sheet.getRange(2, 1, 1, 7).getValues();
        if (row.length === 0 || row[0].length === 0) {
            // 데이터가 없으면 빈 데이터 반환
            return ContentService.createTextOutput(
                JSON.stringify({
                    status: 'success',
                    lastDate: null,
                    lastDateData: []
                })
            ).setMimeType(ContentService.MimeType.JSON);
        }

        //row 반환
        return ContentService.createTextOutput(
            JSON.stringify({
                status: 'success',
                lastDateData: {
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
    catch (err) {
        return ContentService.createTextOutput(
            JSON.stringify({
                status: 'error',
                message: err.message
            })
        ).setMimeType(ContentService.MimeType.JSON);
    }
}