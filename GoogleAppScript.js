// GoogleAppScript.js
// Google Apps Script for handling POST requests and writing to Google Sheets
// This script is designed to work with the DC_BanList extension to log blocked users.
// Replace YOUR_SPREADSHEET_ID_HERE with your actual Google Spreadsheet ID.
// Ensure you have the necessary permissions to run this script and access the spreadsheet.
// Make sure to set up the Google Apps Script project with the necessary scopes and permissions.
// This script should be deployed as a web app to handle POST requests.

// Visit https://script.google.com/ to create a new project and paste this code.

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // 구글 스프레드시트 ID를 여기에 입력하세요

function doPost(e) {
    try {
        if (!e.postData || !e.postData.contents) {
            throw new Error('No POST data received');
        }

        const content = JSON.parse(e.postData.contents);
        const gallId = content.gallId;
        const data = content.data;
        if (!Array.isArray(data)) {
            throw new Error('Expected JSON array');
        }

        const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
        let sheet = spreadsheet.getSheetByName(gallId);

        if (!sheet) {
            sheet = spreadsheet.insertSheet(gallId);
        }

        Logger.log("갤ID: " + gallId);
        Logger.log("받은 데이터:", data);
        Logger.log("데이터 길이:", data.length);

        // 시트 맨 위에 삽입
        sheet.insertRowsBefore(1, data.length);

        // 배열 형태로 변환
        const rows = data.map(record => [
            record.nickname || '',
            record.content || '',
            record.reason || '',
            record.duration || '',
            record.date || '',
            record.manager || ''
        ]);

        // 시트 (1,1) 위치부터 입력
        sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

        return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({
            status: 'error',
            message: err.message
        })).setMimeType(ContentService.MimeType.JSON);
    }
}

function doGet(e) {
    // 간단한 테스트용 GET 응답
    return ContentService.createTextOutput('DC_BanList GAS is running.');
}
