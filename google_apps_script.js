/**
 * Google Apps Script (GAS) 部署說明：
 * 
 * 1. 在 Google 雲端硬碟建立一個新的「Google 試算表」。
 * 2. 點選選單列的「擴充功能」 -> 「Apps Script」。
 * 3. 清空原本的代碼，將此檔案的所有程式碼貼上並存檔。
 * 4. 點選右上方「部署」 -> 「新增部署」。
 * 5. 選擇部署類型為「網頁應用程式」（Web App）。
 * 6. 設定如下：
 *    - 說明：社團收費與自助簽到系統
 *    - 委託人：您的帳戶（您自己）
 *    - 誰能存取：所有人（Anyone）
 * 7. 點選「部署」後進行授權。
 * 8. 將生成的「網頁應用程式 URL」複製到收費系統的設定欄位中。
 */

// 處理 GET 請求：用來獲取成員清單與簽到狀態
function doGet(e) {
  try {
    var action = e.parameter.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 初始化試算表分頁
    initSheets(ss);

    if (action === "getData") {
      // 一併讀取社員與出席資料
      var members = getMembersList(ss);
      var attendance = getAttendanceList(ss);
      
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        members: members,
        attendance: attendance
      }))
      .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "未知的 action 動作"
    }))
    .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
  }
}

// 處理 POST 請求：用來寫入簽到、修改會員與確認收款
function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    initSheets(ss);
    
    var requestData = JSON.parse(e.postData.contents);
    var action = requestData.action;

    if (action === "saveMember") {
      // 新增或更新社員
      saveMemberRow(ss, requestData.member);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    } 
    
    else if (action === "deleteMember") {
      // 刪除社員
      deleteMemberRow(ss, requestData.memberId);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    } 
    
    else if (action === "checkin") {
      // 自助簽到 (學號簽到或 ID 簽到)
      var date = requestData.date;
      var studentId = requestData.studentId.trim();
      var result = handleCheckin(ss, date, studentId);
      
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    } 
    
    else if (action === "confirmPayment") {
      // 確認收款 (寫入已付費並發送 Email)
      var date = requestData.date;
      var memberId = requestData.memberId;
      var receiptNo = requestData.receiptNo;
      var amount = requestData.amount;
      var itemDesc = requestData.itemDesc;
      
      var result = handleConfirmPayment(ss, date, memberId, receiptNo, amount, itemDesc);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    else if (action === "confirmUnlimitedPayment") {
      // 確認上到飽方案收款
      var memberId = requestData.memberId;
      var receiptNo = requestData.receiptNo;
      var amount = requestData.amount;
      var itemDesc = requestData.itemDesc;
      var date = requestData.date;

      var result = handleConfirmUnlimitedPayment(ss, memberId, receiptNo, amount, itemDesc, date);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 預設做整份資料同步
    else if (action === "syncAll") {
      syncDatabase(ss, requestData.members, requestData.attendance);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "無匹配動作" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ---------------- 內部邏輯與資料庫存取函數 ----------------

function initSheets(ss) {
  var mSheet = ss.getSheetByName("Members");
  if (!mSheet) {
    mSheet = ss.insertSheet("Members");
    mSheet.appendRow(["ID", "姓名", "學號", "方案類型", "上到飽是否已繳", "方案繳費日期", "方案收據編號"]);
  }
  
  var aSheet = ss.getSheetByName("Attendance");
  if (!aSheet) {
    aSheet = ss.insertSheet("Attendance");
    aSheet.appendRow(["日期", "成員ID", "姓名", "學號", "是否出席", "是否繳費", "收據編號", "登記時間"]);
  }
}

// 取得所有成員 (排除 Google 試算表底部的空行)
function getMembersList(ss) {
  var sheet = ss.getSheetByName("Members");
  var values = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < values.length; i++) {
    // 檢查 ID 或 姓名 是否為空，若是空行則跳過
    if (!values[i][0] || values[i][0].toString().trim() === "") {
      continue;
    }
    list.push({
      id: values[i][0].toString(),
      name: values[i][1] ? values[i][1].toString() : "",
      phone: values[i][2] ? values[i][2].toString() : "", // 前端習慣使用 phone 作為學號欄位名稱
      plan: values[i][3] ? values[i][3].toString() : "single",
      unlimitedPaid: values[i][4] === true || values[i][4] === "true",
      unlimitedPaidDate: values[i][5] ? values[i][5].toString() : "",
      unlimitedReceiptNo: values[i][6] ? values[i][6].toString() : ""
    });
  }
  return list;
}

// 取得出席紀錄 (排除空行)
function getAttendanceList(ss) {
  var sheet = ss.getSheetByName("Attendance");
  var values = sheet.getDataRange().getValues();
  var attendanceObj = {};
  
  for (var i = 1; i < values.length; i++) {
    // 檢查日期與成員 ID 是否為空，若是空行則跳過
    if (!values[i][0] || !values[i][1] || values[i][0].toString().trim() === "") {
      continue;
    }
    var date = values[i][0].toString();
    var memberId = values[i][1].toString();
    var present = values[i][4] === true || values[i][4] === "true";
    var paid = values[i][5] === true || values[i][5] === "true";
    var receiptNo = values[i][6] ? values[i][6].toString() : "";
    
    if (!attendanceObj[date]) {
      attendanceObj[date] = {};
    }
    attendanceObj[date][memberId] = {
      present: present,
      paid: paid,
      receiptNo: receiptNo
    };
  }
  return attendanceObj;
}

// 新增或修改社員
function saveMemberRow(ss, member) {
  var sheet = ss.getSheetByName("Members");
  var values = sheet.getDataRange().getValues();
  var rowIndex = -1;
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] && values[i][0].toString() === member.id.toString()) {
      rowIndex = i + 1;
      break;
    }
  }
  
  var rowData = [
    member.id,
    member.name,
    member.phone,
    member.plan,
    member.unlimitedPaid,
    member.unlimitedPaidDate || '',
    member.unlimitedReceiptNo || ''
  ];
  
  if (rowIndex > -1) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
}

// 刪除社員
function deleteMemberRow(ss, memberId) {
  var sheet = ss.getSheetByName("Members");
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] && values[i][0].toString() === memberId.toString()) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

// 自助簽到處理
function handleCheckin(ss, date, studentId) {
  var members = getMembersList(ss);
  
  // 透過學號(phone)或姓名尋找該社員
  var member = members.find(function(m) {
    return m.phone.toString() === studentId.toString() || m.name.toString() === studentId.toString();
  });
  
  if (!member) {
    return { status: "error", message: "找不到該社員，請確認學號是否正確或向幹部註冊！" };
  }
  
  var sheet = ss.getSheetByName("Attendance");
  var values = sheet.getDataRange().getValues();
  var rowIndex = -1;
  
  // 尋找今天該社員是否已經有記錄
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] && values[i][1] && values[i][0].toString() === date && values[i][1].toString() === member.id.toString()) {
      rowIndex = i + 1;
      break;
    }
  }
  
  // 上到飽方案的免單堂繳費
  var paidStatus = false;
  if (member.plan === "unlimited" && member.unlimitedPaid) {
    paidStatus = true;
  }
  
  var rowData = [
    date,
    member.id,
    member.name,
    member.phone,
    true, // 出席
    paidStatus, // 繳費狀態
    paidStatus ? member.unlimitedReceiptNo : "", // 方案免繳則帶入方案收據
    new Date()
  ];
  
  if (rowIndex > -1) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
  
  return {
    status: "success",
    message: member.name + " 簽到成功！",
    memberName: member.name,
    plan: member.plan,
    unlimitedPaid: member.unlimitedPaid
  };
}

// 單堂確認付款並寄信
function handleConfirmPayment(ss, date, memberId, receiptNo, amount, itemDesc) {
  var sheet = ss.getSheetByName("Attendance");
  var values = sheet.getDataRange().getValues();
  var rowIndex = -1;
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] && values[i][1] && values[i][0].toString() === date && values[i][1].toString() === memberId.toString()) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex > -1) {
    sheet.getRange(rowIndex, 6).setValue(true);
    sheet.getRange(rowIndex, 7).setValue(receiptNo);
    
    var studentId = values[rowIndex-1][3];
    var memberName = values[rowIndex-1][2];
    var email = studentId.toString().includes("@") ? studentId.toString() : studentId.toString() + "@gms.ndhu.edu.tw";
    
    try {
      sendReceiptEmail(email, memberName, studentId, receiptNo, date, amount, itemDesc);
    } catch (e) {
      console.log("寄信失敗但記帳已完成：" + e.toString());
    }
    
    return { status: "success", message: "單堂繳費成功同步雲端！" };
  }
  return { status: "error", message: "找不到對應出席點名紀錄" };
}

// 方案確認付款並寄信
function handleConfirmUnlimitedPayment(ss, memberId, receiptNo, amount, itemDesc, date) {
  var mSheet = ss.getSheetByName("Members");
  var values = mSheet.getAddressRange ? mSheet.getDataRange().getValues() : mSheet.getDataRange().getValues();
  var rowIndex = -1;
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] && values[i][0].toString() === memberId.toString()) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex > -1) {
    mSheet.getRange(rowIndex, 5).setValue(true);
    mSheet.getRange(rowIndex, 6).setValue(date);
    mSheet.getRange(rowIndex, 7).setValue(receiptNo);
    
    var memberName = values[rowIndex-1][1];
    var studentId = values[rowIndex-1][2];
    var email = studentId.toString().includes("@") ? studentId.toString() : studentId.toString() + "@gms.ndhu.edu.tw";
    
    var aSheet = ss.getSheetByName("Attendance");
    var aValues = aSheet.getDataRange().getValues();
    for (var j = 1; j < aValues.length; j++) {
      if (aValues[j][0] && aValues[j][1] && aValues[j][0].toString() === date && aValues[j][1].toString() === memberId.toString()) {
        aSheet.getRange(j + 1, 6).setValue(true);
        aSheet.getRange(j + 1, 7).setValue(receiptNo);
        break;
      }
    }
    
    try {
      sendReceiptEmail(email, memberName, studentId, receiptNo, date, amount, itemDesc);
    } catch (e) {
      console.log("寄信失敗但記帳已完成：" + e.toString());
    }
    
    return { status: "success", message: "方案年費成功同步雲端！" };
  }
  return { status: "error", message: "找不到該社員" };
}

// 全體強制雙向同步（同步所有 Local 離線異動）
function syncDatabase(ss, localMembers, localAttendance) {
  var mSheet = ss.getSheetByName("Members");
  mSheet.clearContents();
  mSheet.appendRow(["ID", "姓名", "學號", "方案類型", "上到飽是否已繳", "方案繳費日期", "方案收據編號"]);
  localMembers.forEach(function(m) {
    mSheet.appendRow([m.id, m.name, m.phone, m.plan, m.unlimitedPaid, m.unlimitedPaidDate, m.unlimitedReceiptNo]);
  });

  var aSheet = ss.getSheetByName("Attendance");
  aSheet.clearContents();
  aSheet.appendRow(["日期", "成員ID", "姓名", "學號", "是否出席", "是否繳費", "收據編號", "登記時間"]);
  Object.keys(localAttendance).forEach(function(date) {
    var dateData = localAttendance[date];
    Object.keys(dateData).forEach(function(mId) {
      var rec = dateData[mId];
      var member = localMembers.find(function(m) { return m.id === mId; });
      var name = member ? member.name : "未知";
      var sid = member ? member.phone : "";
      aSheet.appendRow([date, mId, name, sid, rec.present, rec.paid, rec.receiptNo, new Date()]);
    });
  });
}

// ---------------- Email 電子收據樣式渲染與寄信 ----------------

function sendReceiptEmail(toEmail, name, studentId, receiptNo, date, amount, itemDesc) {
  var cnDigits = getChineseCapital(amount);
  var subject = "【東華休閒運動社】電子收據 - " + name + " 同學 (" + receiptNo + ")";
  
  var htmlBody = `
  <div style="font-family: 'PingFang TC', 'Microsoft JhengHei', sans-serif; background-color: #f3f4f6; padding: 30px; color: #1f2937;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="background-color: #0f3b68; padding: 25px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 24px; letter-spacing: 2px;">免用統一發票收據</h1>
        <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.8;">東華休閒運動社 線上電子收據服務</p>
      </div>
      
      <div style="padding: 30px;">
        <p style="font-size: 16px; font-weight: bold; margin-top: 0;">${name} 同學 台照，</p>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
          感謝您的繳費，系統已自動登錄社團帳目，以下為您的電子收據明細：
        </p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <tr style="border-bottom: 2px solid #0f3b68; font-weight: bold; color: #0f3b68;">
            <th style="padding: 10px 5px; text-align: left;">品名商標摘要</th>
            <th style="padding: 10px 5px; text-align: center; width: 60px;">數量</th>
            <th style="padding: 10px 5px; text-align: right; width: 80px;">單價</th>
            <th style="padding: 10px 5px; text-align: right; width: 80px;">總價</th>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px 5px; text-align: left; font-weight: bold;">${itemDesc}</td>
            <td style="padding: 12px 5px; text-align: center;">1</td>
            <td style="padding: 12px 5px; text-align: right;">$${amount}</td>
            <td style="padding: 12px 5px; text-align: right; color: #10b981; font-weight: bold;">$${amount}</td>
          </tr>
        </table>
        
        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; font-size: 13px; color: #374151;">
          <div style="margin-bottom: 6px;"><b>收據編號：</b> <span style="font-family: monospace;">${receiptNo}</span></div>
          <div style="margin-bottom: 6px;"><b>開立日期：</b> ${date}</div>
          <div style="margin-bottom: 6px;"><b>繳費學號：</b> ${studentId}</div>
          <div style="margin-bottom: 6px;"><b>合計大寫：</b> 新台幣 ${cnDigits}元整</div>
          <div><b>社團地址：</b> 花蓮縣壽豐鄉志學村大學路二段1號C122</div>
        </div>

        <div style="margin-top: 25px; border-top: 1px dashed #e5e7eb; padding-top: 20px; text-align: center;">
          <p style="font-size: 12px; color: #9ca3af; margin: 0 0 5px 0;">※ 本收據加蓋社團線上收據專用章後生效。</p>
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">此郵件由系統自動發送，請勿直接回覆。</p>
        </div>
      </div>
      
      <div style="background-color: #fafbfd; border-top: 1px solid #e5e7eb; padding: 20px; text-align: center;">
        <div style="display: inline-block; border: 2px double #a30000; border-radius: 50%; padding: 5px; background-color: #fdf5f5; width: 80px; height: 80px; box-sizing: border-box;">
          <div style="border: 1px solid #a30000; border-radius: 50%; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; color: #a30000; font-size: 8px; font-weight: bold;">
            <div style="font-size: 7px; transform: scale(0.95); width: 60px; text-align: center;">東華休閒運動社</div>
            <div style="margin: 2px 0;">線上收據</div>
            <div style="transform: scale(0.95);">專用章</div>
          </div>
        </div>
        <p style="font-size: 13px; font-weight: bold; color: #0f3b68; margin: 8px 0 0 0;">國立東華大學 東華休閒運動社 敬啟</p>
      </div>
    </div>
  </div>
  `;

  MailApp.sendEmail({
    to: toEmail,
    subject: subject,
    htmlBody: htmlBody
  });
}

function getChineseCapital(amount) {
  var digits = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'];
  var wan = Math.floor(amount / 10000) % 10;
  var qian = Math.floor(amount / 100) % 10; // Fixed index
  var qian = Math.floor(amount / 1000) % 10;
  var bai = Math.floor(amount / 100) % 10;
  var shi = Math.floor(amount / 10) % 10;
  var yuan = amount % 10;

  var str = "";
  if (wan > 0) str += digits[wan] + "萬";
  if (qian > 0) str += digits[qian] + "仟";
  else if (wan > 0 && (bai > 0 || shi > 0 || yuan > 0)) str += "零";
  
  if (bai > 0) str += digits[bai] + "佰";
  else if (qian > 0 && (shi > 0 || yuan > 0)) str += "零";
  
  if (shi > 0) str += digits[shi] + "拾";
  else if (bai > 0 && yuan > 0) str += "零";
  
  if (yuan > 0) str += digits[yuan];
  
  if (amount === 50) return "伍拾";
  if (amount === 1000) return "壹仟";
  
  return str || "零";
}
