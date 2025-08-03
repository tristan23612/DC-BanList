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
    else if (action === 'getOldBanListData') {
        return handleGetOldBanListData(e);
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

        Logger.log("갤ID: " + galleryId);
        Logger.log("데이터 길이:", banList.length);

        // 시트 맨 위에 삽입
        sheet.insertRowsBefore(1, banList.length);

        // 배열 형태로 변환
        const rows = banList.map(record => [
            record.nickname || '',
            record.content || '',
            record.reason || '',
            record.duration || '',
            record.date || '',
            record.manager || ''
        ]);

        // 시트 (1,1) 위치부터 입력
        sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

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

function handleGetOldBanListData(e) {
    try {
        const content = JSON.parse(e.postData.contents);
        const sheetId = content.sheetId
        const galleryId = content.galleryId;
        
        if (!sheetId || !galleryId) {
            throw new Error('There is an empty data')
        }

        const spreadsheet = SpreadsheetApp.openById(sheetId);
        let sheet = spreadsheet.getSheetByName(galleryId);

        const MAX_ROWS_TO_SCAN = 250;
        const NUM_COLUMNS = 6;

        const rowCount = sheet.getLastRow();
        const readRows = Math.min(rowCount, MAX_ROWS_TO_SCAN);

        if (readRows === 0) {
            return {
                lastDate: null,
                lastDateData: []
            };
        }

        const data = sheet.getRange(1, 1, readRows, NUM_COLUMNS).getValues();

        let lastDate = data[0][4];
        let lastChangeRow = 1;

        for (let i = 1; i < data.length; i++) {
            const currDate = data[i][4];
            if (currDate !== lastDate) {
                break;
            }
            lastChangeRow++;
        }

        // 날짜 바뀌기 전까지의 데이터
        const lastDateData = data.slice(0, lastChangeRow);

        return ContentService.createTextOutput(
            JSON.stringify({
                status: 'success',
                lastDate,
                lastDateData: lastDateData.map(row => ({
                    nickname: row[0],
                    content: row[1],
                    reason: row[2],
                    duration: row[3],
                    date: row[4],
                    manager: row[5]
                }))
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