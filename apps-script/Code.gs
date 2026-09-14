/** ============================================================
 *  연수 등록부 자동화 (탭 방식)
 *  1) 마스터 명단에서 활성(TRUE) 인원만 뽑아 등록부 생성
 *  2) 주제/일시 입력 → "등록부 양식" 탭을 복제해 새 탭으로 생성 (서식·셀높이 그대로)
 *  3) 새 탭 이름 = 연수 주제
 *  4) 서명 화면(GitHub Pages)에서 doPost 로 호출: 연수 선택 → 이름 선택 → 캔버스 서명 → 해당 셀에 이미지 삽입
 *     - 이전에 저장한 내 서명 불러오기 지원 (문서 내부 숨김시트에 보관)
 *  ※ 연수 이력 시트 / 드라이브 백업 기능 없음
 * ============================================================ */

// ▼ 필요시 실제 환경에 맞게 수정
const TEMPLATE_SHEET_NAME = '등록부 양식';   // 서식 틀이 들어있는 탭 이름
const TRAINING_LIST_CACHE_SECONDS = 60; // 연수 목록만 캐시 (명단/서명은 실시간 조회)
// 서명 완료 표시. 서명 칸에 값을 남기고 표시 형식을 ';;;' 로 지정해
// 화면과 인쇄물 어디에도 보이지 않게 합니다. 흰 글자와 달리 셀 배경색과 무관합니다.
const SIGNED_MARK = 1;
const HIDDEN_FORMAT = ';;;';

const SIGN_STORE_SHEET = '_서명저장';        // 개인 서명 보관용 숨김 시트(자동 생성)
// 연수 담당자는 탭의 개발자 메타데이터에 적어 둡니다. 셀을 차지하지 않고,
// 탭 이름을 바꿔도 따라다니며, 탭을 지우면 같이 사라집니다.
const MANAGER_META_KEY = 'trainingManager';

// 인쇄 시 한 페이지(한 열)에 들어갈 줄 수.
// 인쇄 미리보기를 보며 실제 한 페이지에 들어가는 줄 수에 맞춰 조정하세요.
const ROWS_PER_PAGE = 20;

// 연수 목록에서 제외할 탭 이름 (필요시 콤마로 더 추가 가능)
const EXCLUDED_TRAINING_SHEETS = ['도움말'];

// 등록부 양식의 열 배치 (양식 탭 구조에 맞춤)
const LEFT_DEPT_COL = 2;   // B: 왼쪽 소속
const LEFT_NAME_COL = 3;   // C: 왼쪽 이름
const LEFT_SIGN_COL = 4;   // D: 왼쪽 서명
const RIGHT_DEPT_COL = 6;  // F: 오른쪽 소속
const RIGHT_NAME_COL = 7;  // G: 오른쪽 이름
const RIGHT_SIGN_COL = 8;  // H: 오른쪽 서명

/* ---------------------------------------------------------
 *  메뉴
 * --------------------------------------------------------- */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('연수 관리')
    .addItem('새 연수 등록부 만들기', 'showCreateRegisterDialog')
    .addToUi();
}

function showCreateRegisterDialog() {
  const html = HtmlService.createHtmlOutputFromFile('CreateDialog')
    .setWidth(420).setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, '새 연수 등록부 만들기');
}

/* ---------------------------------------------------------
 *  마스터 명단 (활성 인원)
 * --------------------------------------------------------- */
function findMasterSheet(ss) {
  // 시트 이름이 바뀌거나 순서가 바뀌어도 유지되는 ID를 저장합니다.
  const props = PropertiesService.getScriptProperties();
  const key = 'register.master.v1.' + ss.getId();
  let saved = null;
  try { saved = JSON.parse(props.getProperty(key) || 'null'); } catch (err) { /* 다시 탐색 */ }
  if (saved && Number.isInteger(saved.sheetId) && Number.isInteger(saved.headerRow) && saved.headerRow > 0) {
    const sheet = ss.getSheetById(saved.sheetId);
    if (sheet && saved.headerRow <= sheet.getLastRow() && sheet.getLastColumn() > 0) {
      const header = sheet.getRange(saved.headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];
      if (header.indexOf('성명') !== -1 && header.indexOf('활성') !== -1) {
        return {sheet: sheet, headerRow: saved.headerRow, header: header};
      }
    }
  }
  // 저장한 시트가 없거나 헤더가 이동한 경우에만 전체 탐색합니다.
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    const rows = Math.min(3, sheet.getLastRow());
    const cols = sheet.getLastColumn();
    if (!rows || !cols) continue;
    const head = sheet.getRange(1, 1, rows, cols).getValues();
    for (let r = 0; r < head.length; r++) {
      if (head[r].indexOf('성명') !== -1 && head[r].indexOf('활성') !== -1) {
        props.setProperty(key, JSON.stringify({sheetId: sheet.getSheetId(), headerRow: r + 1}));
        return {sheet: sheet, headerRow: r + 1, header: head[r]};
      }
    }
  }
  props.deleteProperty(key);
  throw new Error('마스터 명단 시트를 찾을 수 없습니다. (헤더에 "성명"과 "활성"이 필요합니다)');
}

function getMasterInfo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const m = findMasterSheet(ss);
  const sheet = m.sheet;
  const headerRow = m.headerRow;
  const header = m.header; // 마스터 확인 때 읽은 헤더 재사용
  const deptIdx = header.indexOf('소속');
  const nameIdx = header.indexOf('성명');
  const activeIdx = header.indexOf('활성');
  if (nameIdx === -1 || activeIdx === -1) {
    throw new Error('마스터 명단 헤더에서 "성명" 또는 "활성" 열을 찾을 수 없습니다.');
  }
  return { sheet: sheet, headerRow: headerRow, deptIdx: deptIdx, nameIdx: nameIdx, activeIdx: activeIdx };
}

function getActiveStaffList() {
  const info = getMasterInfo();
  const sheet = info.sheet;
  const last = sheet.getLastRow();
  if (last <= info.headerRow) return [];
  const data = sheet.getRange(info.headerRow + 1, 1, last - info.headerRow, sheet.getLastColumn()).getValues();
  const list = [];
  data.forEach(function (row) {
    const name = row[info.nameIdx];
    const active = row[info.activeIdx];
    if (!name) return;
    if (active === true || String(active).toUpperCase() === 'TRUE') {
      list.push({ dept: info.deptIdx === -1 ? '' : (row[info.deptIdx] || ''), name: name });
    }
  });
  return list;
}

// 관리자 화면: 전체 직원(활성/비활성 모두) 목록 + 각자의 실제 시트 행 번호
function getMasterStaffList() {
  const info = getMasterInfo();
  const sheet = info.sheet;
  const last = sheet.getLastRow();
  if (last <= info.headerRow) return [];
  const data = sheet.getRange(info.headerRow + 1, 1, last - info.headerRow, sheet.getLastColumn()).getValues();
  const list = [];
  data.forEach(function (row, i) {
    const name = row[info.nameIdx];
    if (!name) return;
    const active = row[info.activeIdx];
    list.push({
      row: info.headerRow + 1 + i,
      dept: info.deptIdx === -1 ? '' : (row[info.deptIdx] || ''),
      name: name,
      active: (active === true || String(active).toUpperCase() === 'TRUE')
    });
  });
  return list;
}

// 관리자 화면: 직원 한 명의 활성/비활성 전환
function setStaffActive(row, active) {
  const info = getMasterInfo();
  info.sheet.getRange(row, info.activeIdx + 1).setValue(!!active);
  return { success: true };
}

// 관리자 화면: 여러 명을 한 번에 활성/비활성 전환 (한 번의 범위 읽기/쓰기로 처리해 빠름)
function setStaffActiveBulk(rows, active) {
  const info = getMasterInfo();
  const sheet = info.sheet;
  const last = sheet.getLastRow();
  const col = info.activeIdx + 1;
  const range = sheet.getRange(info.headerRow + 1, col, last - info.headerRow, 1);
  const values = range.getValues();
  const rowSet = {};
  (rows || []).forEach(function (r) { rowSet[r] = true; });
  for (let i = 0; i < values.length; i++) {
    const actualRow = info.headerRow + 1 + i;
    if (rowSet[actualRow]) values[i][0] = !!active;
  }
  range.setValues(values);
  return { success: true, count: (rows || []).length };
}

// 관리자 화면: 등록부 탭 삭제 (마스터/양식/제외목록/숨김 탭은 삭제 금지)
function deleteRegisterSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterName = findMasterSheet(ss).sheet.getName();
  if (sheetName === masterName || sheetName === TEMPLATE_SHEET_NAME ||
      EXCLUDED_TRAINING_SHEETS.indexOf(sheetName) !== -1) {
    throw new Error('이 탭은 삭제할 수 없습니다: ' + sheetName);
  }
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('탭을 찾을 수 없습니다: ' + sheetName);
  if (sheet.isSheetHidden() || sheetName.charAt(0) === '_') throw new Error('보관용 탭은 삭제할 수 없습니다.');
  ss.deleteSheet(sheet);
  SpreadsheetApp.flush();
  invalidateTrainingListCache_(ss);
  return { success: true };
}

/* ---------------------------------------------------------
 *  등록부 생성 (양식 탭 복제)
 * --------------------------------------------------------- */
function createTrainingRegister(topic, dateTimeStr, manager) {
  topic = (topic || '').trim();
  dateTimeStr = (dateTimeStr || '').trim();
  manager = (manager || '').trim();
  if (!topic) throw new Error('연수 주제를 입력해주세요.');
  if (!dateTimeStr) throw new Error('일시를 입력해주세요.');
  if (!manager) throw new Error('연수 담당자를 입력해주세요.');

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const template = ss.getSheetByName(TEMPLATE_SHEET_NAME);
  if (!template) {
    const names = ss.getSheets().map(function (s) { return s.getName(); }).join(', ');
    throw new Error('"' + TEMPLATE_SHEET_NAME + '" 탭을 찾을 수 없습니다.\n현재 탭: ' + names +
      '\n\n상단 TEMPLATE_SHEET_NAME 값을 실제 양식 탭 이름으로 맞춰주세요.');
  }

  if (ss.getSheetByName(topic)) {
    throw new Error('이미 "' + topic + '" 이름의 탭이 있습니다. 다른 주제명을 사용해주세요.');
  }

  const staffList = getActiveStaffList();
  if (staffList.length === 0) throw new Error('마스터 명단에 활성(TRUE) 인원이 없습니다.');

  // 양식 복제 → 이름 변경 → 맨 앞으로 이동
  const newSheet = template.copyTo(ss).setName(topic);
  ss.setActiveSheet(newSheet);
  ss.moveActiveSheet(1);

  try {
    fillRegister(newSheet, topic, dateTimeStr, manager, staffList);
    setTrainingManager_(newSheet, manager);
    ss.setActiveSheet(newSheet);
  } finally {
    // 생성 중 오류가 나더라도 이미 복제된 탭이 있다면 목록을 갱신합니다.
    SpreadsheetApp.flush();
    invalidateTrainingListCache_(ss);
  }

  return { sheetName: topic };
}

function fillRegister(sheet, topic, dateTimeStr, manager, staffList) {
  // 주제 / 일시 입력 (A열에서 라벨 찾아 오른쪽 셀에 기입)
  // 양식에 '담당자' 라벨이 있으면 담당자도 같은 방식으로 적습니다. 없으면 건너뜁니다.
  const colA = sheet.getRange(1, 1, Math.min(10, sheet.getLastRow()), 1).getValues();
  for (let i = 0; i < colA.length; i++) {
    const label = String(colA[i][0]).trim();
    if (label === '주제') sheet.getRange(i + 1, 2).setValue(topic);
    if (label === '일시') sheet.getRange(i + 1, 2).setValue(dateTimeStr || '');
    if (label === '담당자') sheet.getRange(i + 1, 2).setValue(manager || '');
  }

  // 헤더 행("순") 찾기 → 데이터 시작 행
  let headerRow = -1;
  for (let i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim() === '순') { headerRow = i + 1; break; }
  }
  if (headerRow === -1) throw new Error('양식에서 헤더 행(순)을 찾지 못했습니다.');
  const dataStart = headerRow + 1;

  // 왼쪽 칸 개수 = A열에서 연속된 숫자(순번) 개수
  const maxScan = sheet.getLastRow() - dataStart + 1;
  const aVals = sheet.getRange(dataStart, 1, maxScan, 1).getValues();
  let leftRows = 0;
  for (let i = 0; i < aVals.length; i++) {
    if (aVals[i][0] === '' || aVals[i][0] === null) break;
    leftRows++;
  }
  if (leftRows === 0) leftRows = maxScan;

  const N = staffList.length;
  const k = Math.max(1, ROWS_PER_PAGE);

  // 페이지 단위 배치: 꽉 채워지는 페이지는 왼쪽k+오른쪽k, 마지막 남는 인원은 좌우 균등 분배
  const pages = Math.ceil(N / (2 * k));
  const pageLeft = [];   // 페이지별 왼쪽 인원 수
  const pageRight = [];  // 페이지별 오른쪽 인원 수
  let neededRows = 0;
  for (let p = 0; p < pages; p++) {
    const remaining = N - p * 2 * k;
    let l, r;
    if (remaining >= 2 * k) {
      l = k; r = k;
    } else {
      l = Math.ceil(remaining / 2); r = remaining - l; // 마지막 페이지: 좌우 균등 분배
    }
    pageLeft.push(l);
    pageRight.push(r);
    neededRows += l; // 그 페이지가 차지하는 행 수 = 왼쪽 인원 수
  }
  if (neededRows < 1) neededRows = 1;

  // 템플릿 데이터 행 수(leftRows)에 맞추기: 부족하면 서식 복제해 삽입, 남으면 삭제
  if (neededRows > leftRows) {
    const insertCount = neededRows - leftRows;
    sheet.insertRowsAfter(dataStart + leftRows - 1, insertCount);
    const srcRange = sheet.getRange(dataStart, 1, 1, 8);
    const destRange = sheet.getRange(dataStart + leftRows, 1, insertCount, 8);
    srcRange.copyTo(destRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    const h = sheet.getRowHeight(dataStart);
    sheet.setRowHeights(dataStart + leftRows, insertCount, h);
  } else if (neededRows < leftRows) {
    sheet.deleteRows(dataStart + neededRows, leftRows - neededRows);
  }

  // 페이지 단위로 순번/인원 채우기.
  // 셀마다 setValue를 부르면 인원 수만큼 서버를 왕복합니다.
  // 값을 배열에 모아 왼쪽(A~C)과 오른쪽(E~G) 블록을 각각 한 번에 씁니다.
  if (LEFT_DEPT_COL < 2 || LEFT_DEPT_COL > 3 || LEFT_NAME_COL < 2 || LEFT_NAME_COL > 3 ||
      RIGHT_DEPT_COL < 6 || RIGHT_DEPT_COL > 7 || RIGHT_NAME_COL < 6 || RIGHT_NAME_COL > 7) {
    throw new Error('상단의 열 배치 설정이 왼쪽 A~C, 오른쪽 E~G 범위를 벗어났습니다.');
  }
  const leftBlock = [];   // A(순) B(소속) C(이름)
  const rightBlock = [];  // E(순) F(소속) G(이름)
  for (let i = 0; i < neededRows; i++) {
    leftBlock.push(['', '', '']);
    rightBlock.push(['', '', '']);
  }

  let cursor = dataStart; // 현재 페이지의 시작 시트 행
  for (let p = 0; p < pages; p++) {
    const leftOnPage = pageLeft[p];
    const rightOnPage = pageRight[p];
    const base = p * 2 * k; // 이 페이지 시작 순번 - 1

    for (let i = 0; i < leftOnPage; i++) {
      const idx = cursor - dataStart + i;
      const num = base + i + 1;
      leftBlock[idx][0] = num;
      leftBlock[idx][LEFT_DEPT_COL - 1] = staffList[num - 1].dept;
      leftBlock[idx][LEFT_NAME_COL - 1] = staffList[num - 1].name;
    }
    for (let i = 0; i < rightOnPage; i++) {
      const idx = cursor - dataStart + i;
      const num = base + leftOnPage + i + 1;
      rightBlock[idx][0] = num;
      rightBlock[idx][RIGHT_DEPT_COL - 5] = staffList[num - 1].dept;
      rightBlock[idx][RIGHT_NAME_COL - 5] = staffList[num - 1].name;
    }
    // 좌우 인원이 다를 때 오른쪽 남는 행은 배열 초기값인 빈 문자열로 정리됩니다.
    cursor += leftOnPage;
  }

  sheet.getRange(dataStart, 1, neededRows, 3).setValues(leftBlock);
  sheet.getRange(dataStart, 5, neededRows, 3).setValues(rightBlock);

  // 템플릿 상태와 무관하게, 채워진 표 전체(헤더~마지막 데이터 행)에 테두리를 강제로 재적용
  const tableRange = sheet.getRange(headerRow, 1, 1 + neededRows, 8);
  tableRange.setBorder(true, true, true, true, true, true);

  // 좌우 블록 경계(서명D열 | 순E열 사이)는 겹줄(이중선)로 표시
  const dividerRange = sheet.getRange(headerRow, 5, 1 + neededRows, 1);
  dividerRange.setBorder(null, true, null, null, null, null, null, SpreadsheetApp.BorderStyle.DOUBLE);
}

/* ---------------------------------------------------------
 *  서명 웹앱
 * --------------------------------------------------------- */
/* ---------------------------------------------------------
 *  웹 API
 *  화면(HTML)은 GitHub Pages에서 제공하고, 이 스크립트는 데이터만 주고받습니다.
 *  google.script.run 을 대신하는 단일 진입점이 doPost 입니다.
 * --------------------------------------------------------- */

// 정적 화면에서 호출할 수 있는 함수 목록. 여기 없는 이름은 실행되지 않습니다.
const PUBLIC_ACTIONS = ['getTrainingList', 'getRegisterNames', 'getPreviousSignature', 'submitSignature'];
const ADMIN_ACTIONS = ['getAdminData', 'getMasterStaffList', 'saveStaffChanges',
  'createTrainingRegister', 'deleteRegisterSheet'];

// 배포 상태 확인용. 브라우저에서 /exec 주소를 열면 이 응답이 보입니다.
function doGet(e) {
  return jsonOutput_({
    ok: true,
    service: '연수 등록부 API',
    adminTokenRequired: !!adminToken_(),
    time: new Date().toISOString()
  });
}

// 정적 화면의 모든 요청을 처리합니다. 본문 형식: {action, args, token}
function doPost(e) {
  const startedAt = Date.now();
  let payload;
  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonOutput_({ ok: false, error: '요청 형식이 올바르지 않습니다.' });
  }
  const action = String(payload.action || '');
  const args = Array.isArray(payload.args) ? payload.args : [];
  try {
    const isPublic = PUBLIC_ACTIONS.indexOf(action) !== -1;
    const isAdmin = ADMIN_ACTIONS.indexOf(action) !== -1;
    if (!isPublic && !isAdmin) throw new Error('허용되지 않은 요청입니다: ' + action);
    if (isAdmin) requireAdmin_(payload.token);
    // ms 는 서버에서 실제로 걸린 시간입니다. 화면의 전체 시간과 비교하면
    // 시트 작업이 느린 것인지 기동·연결이 느린 것인지 구분됩니다.
    return jsonOutput_({ ok: true, result: callAction_(action, args), ms: Date.now() - startedAt });
  } catch (err) {
    return jsonOutput_({ ok: false, error: (err && err.message) ? err.message : String(err), ms: Date.now() - startedAt });
  }
}

function callAction_(action, args) {
  switch (action) {
    case 'getTrainingList': return getTrainingList(args[0] === true);
    case 'getRegisterNames': return getRegisterNames(args[0]);
    case 'getPreviousSignature': return getPreviousSignature(args[0]);
    case 'submitSignature': return submitSignature(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7]);
    case 'getAdminData': return getAdminData();
    case 'getMasterStaffList': return getMasterStaffList();
    case 'saveStaffChanges': return saveStaffChanges(args[0]);
    case 'createTrainingRegister': return createTrainingRegister(args[0], args[1], args[2]);
    case 'deleteRegisterSheet': return deleteRegisterSheet(args[0]);
    default: throw new Error('허용되지 않은 요청입니다: ' + action);
  }
}

// 스크립트 속성에 ADMIN_TOKEN 을 넣으면 관리 기능에 암호가 걸립니다.
// 값을 넣지 않으면 기존과 동일하게 누구나 관리 화면을 사용할 수 있습니다.
function adminToken_() {
  return (PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN') || '').trim();
}
function requireAdmin_(token) {
  const expected = adminToken_();
  if (!expected) return;
  if (String(token || '') !== expected) throw new Error('관리자 암호가 올바르지 않습니다.');
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 담당자 저장/조회. 값이 없거나 메타데이터를 쓰지 못해도 등록부 생성 자체는 막지 않습니다.
function setTrainingManager_(sheet, manager) {
  if (!manager) return;
  try {
    sheet.getDeveloperMetadata().forEach(function (md) {
      if (md.getKey() === MANAGER_META_KEY) md.remove();
    });
    sheet.addDeveloperMetadata(MANAGER_META_KEY, manager);
  } catch (err) { /* 담당자 표시는 부가 정보입니다 */ }
}
function getTrainingManager_(sheet) {
  try {
    const found = sheet.getDeveloperMetadata().filter(function (md) {
      return md.getKey() === MANAGER_META_KEY;
    });
    return found.length ? String(found[found.length - 1].getValue() || '') : '';
  } catch (err) {
    return '';
  }
}

// 관리자 화면(?admin=1)에서 쓰는 데이터: 기존 등록부 목록 + 각 탭 바로가기/인쇄용 정보
function getAdminData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ssUrl = ss.getUrl();
  const ssId = ss.getId();
  const trainings = getTrainingList(true).map(function (name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return null;
    const gid = sheet.getSheetId();
    // manager 가 빈 값이면 화면에서 예전처럼 '연수 등록부' 로 보여줍니다.
    return { name: name, gid: gid, url: ssUrl + '#gid=' + gid, manager: getTrainingManager_(sheet) };
  }).filter(function (item) { return item !== null; });
  return { ssUrl: ssUrl, ssId: ssId, trainings: trainings };
}
// 조회 중 생성/삭제가 일어나면 이전 요청은 이전 세대에만 캐시를 저장합니다.
// 따라서 늦게 끝난 조회가 새 목록을 오래된 목록으로 덮어쓰지 않습니다.
function trainingListGenerationKey_(ss) {
  return 'register.trainingGeneration.v1.' + ss.getId();
}
function invalidateTrainingListCache_(ss) {
  PropertiesService.getScriptProperties().setProperty(trainingListGenerationKey_(ss), Utilities.getUuid());
}
function getTrainingList(forceRefresh) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (forceRefresh === true) invalidateTrainingListCache_(ss);
  const generation = PropertiesService.getScriptProperties().getProperty(trainingListGenerationKey_(ss)) || '0';
  const key = 'register.trainings.v1.' + ss.getId() + '.' + generation;
  const config = JSON.stringify([TEMPLATE_SHEET_NAME, EXCLUDED_TRAINING_SHEETS]);
  let cache = null;
  try {
    cache = CacheService.getScriptCache();
    const raw = cache.get(key);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && saved.config === config && Array.isArray(saved.names) &&
        saved.names.every(function (name) { return typeof name === 'string'; })) {
      return saved.names;
    }
  } catch (err) { /* 캐시가 없거나 사용할 수 없으면 실제 시트 조회 */ }
  const names = readTrainingList_(ss);
  if (cache) {
    try { cache.put(key, JSON.stringify({config: config, names: names}), TRAINING_LIST_CACHE_SECONDS); }
    catch (err) { /* 캐시 오류는 실제 목록 반환에 영향을 주지 않음 */ }
  }
  return names;
}
function readTrainingList_(ss) {
  const master = findMasterSheet(ss).sheet.getName();
  const result = [];
  ss.getSheets().forEach(function (sheet) {
    const name = sheet.getName();
    if (name === master) return;
    if (name === TEMPLATE_SHEET_NAME) return;
    if (EXCLUDED_TRAINING_SHEETS.indexOf(name) !== -1) return;
    if (name.charAt(0) === '_') return;
    if (sheet.isSheetHidden()) return;
    result.push(name);
  });
  return result;
}

// 특정 연수 탭의 이름 목록 + 서명 완료 여부 + 열너비/행높이(서명 저장 시 재조회 방지용)
function getRegisterNames(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('연수 탭을 찾을 수 없습니다: ' + sheetName);

  const positions = findNamePositions(sheet); // [{name,dept,row,signCol,marked}]

  // 완료 표시가 하나도 없으면 이 표시 방식을 쓰기 전에 만든 등록부일 수 있습니다.
  // 그때만 예전처럼 이미지를 훑고, 찾은 결과를 표시로 옮겨 적습니다.
  // 한 번 옮기고 나면 이후 조회에서는 이미지를 읽지 않습니다.
  // 서명이 아직 없는 새 등록부도 여기에 들어오지만, 이미지가 없어 훑을 것이 없습니다.
  if (!positions.some(function (p) { return p.marked; })) {
    backfillSignedMarks_(sheet, positions);
  }

  const people = positions.map(function (p) {
    return { name: p.name, dept: p.dept, done: !!p.marked, row: p.row, signCol: p.signCol };
  });

  const rowHeight = positions.length ? sheet.getRowHeight(positions[0].row) : 22;
  const colWidths = {};
  colWidths[LEFT_SIGN_COL] = sheet.getColumnWidth(LEFT_SIGN_COL);
  colWidths[RIGHT_SIGN_COL] = sheet.getColumnWidth(RIGHT_SIGN_COL);

  return { people: people, rowHeight: rowHeight, colWidths: colWidths };
}

// 예전 등록부를 위한 1회성 처리. 이미지 위치를 읽어 서명 칸에 완료 표시를 남깁니다.
// positions 의 marked 값도 함께 갱신해 이번 조회부터 바로 반영됩니다.
function backfillSignedMarks_(sheet, positions) {
  if (!positions.length) return;
  let signed;
  try {
    signed = {};
    sheet.getImages().forEach(function (img) {
      const a = img.getAnchorCell();
      signed[a.getRow() + '_' + a.getColumn()] = true;
    });
  } catch (err) {
    return; // 이미지를 읽지 못해도 명단 조회 자체는 진행합니다
  }

  const targets = positions.filter(function (p) { return signed[p.row + '_' + p.signCol]; });
  if (!targets.length) return;

  const first = positions[0].row;
  const last = positions[positions.length - 1].row;
  const rows = last - first + 1;
  const cols = [LEFT_SIGN_COL, RIGHT_SIGN_COL];

  for (let c = 0; c < cols.length; c++) {
    const column = cols[c];
    const block = [];
    for (let i = 0; i < rows; i++) block.push(['']);
    let hit = false;
    targets.forEach(function (p) {
      if (p.signCol !== column) return;
      block[p.row - first][0] = SIGNED_MARK;
      hit = true;
    });
    if (!hit) continue;
    const range = sheet.getRange(first, column, rows, 1);
    range.setNumberFormat(HIDDEN_FORMAT);
    range.setValues(block);
  }
  targets.forEach(function (p) { p.marked = true; });
}

// 표 머리행("순")의 행 번호. A열 위쪽 몇 줄만 읽습니다.
function findHeaderRow_(sheet) {
  const rows = Math.min(10, sheet.getLastRow());
  if (rows < 1) return -1;
  const colA = sheet.getRange(1, 1, rows, 1).getValues();
  for (let i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim() === '순') return i + 1;
  }
  return -1;
}

function findNamePositions(sheet) {
  const headerRow = findHeaderRow_(sheet);
  if (headerRow === -1) return [];
  const dataStart = headerRow + 1;
  const rows = sheet.getLastRow() - dataStart + 1;
  if (rows <= 0) return [];

  const values = sheet.getRange(dataStart, 1, rows, 8).getValues();
  const positions = [];
  for (let i = 0; i < values.length; i++) {
    const rowNum = dataStart + i;
    const leftName = values[i][LEFT_NAME_COL - 1];
    const rightName = values[i][RIGHT_NAME_COL - 1];
    const leftDept = values[i][LEFT_DEPT_COL - 1];
    const rightDept = values[i][RIGHT_DEPT_COL - 1];
    // 서명 칸(D/H)은 어차피 같은 범위로 읽고 있습니다. 완료 표시를 여기서 함께 확인합니다.
    if (leftName) positions.push({ name: String(leftName), dept: String(leftDept || ''), row: rowNum,
      signCol: LEFT_SIGN_COL, marked: values[i][LEFT_SIGN_COL - 1] !== '' });
    if (rightName) positions.push({ name: String(rightName), dept: String(rightDept || ''), row: rowNum,
      signCol: RIGHT_SIGN_COL, marked: values[i][RIGHT_SIGN_COL - 1] !== '' });
  }
  return positions;
}

function getPreviousSignature(name) {
  if (name === null || name === undefined || String(name) === '') return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const store = ss.getSheetByName(SIGN_STORE_SHEET);
  if (!store) return null;
  const last = store.getLastRow();
  if (last < 2) return null;
  // 큰 이미지 문자열이 있는 B열 전체를 읽지 않습니다.
  // A열에서 이름을 찾은 뒤 해당 인원의 B열 한 셀만 읽습니다.
  const names = store.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < names.length; i++) {
    if (String(names[i][0]) === String(name)) return store.getRange(i + 2, 2).getValue() || null;
  }
  return null;
}

function submitSignature(sheetName, name, base64Png, row, signCol, hadPrevious, width, height) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return submitSignatureInternal_(sheetName, name, base64Png, row, signCol, hadPrevious, width, height); }
  finally { lock.releaseLock(); }
}
function submitSignatureInternal_(sheetName, name, base64Png, row, signCol, hadPrevious, width, height) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('연수 탭을 찾을 수 없습니다: ' + sheetName);

  // 클라이언트가 위치(row/signCol)를 넘겨주면 전체 재조회 없이 바로 사용 (속도 개선).
  let targetRow = row, targetCol = signCol;
  if (!targetRow || !targetCol) {
    const positions = findNamePositions(sheet);
    const target = positions.filter(function (p) { return p.name === name; })[0];
    if (!target) throw new Error('명단에서 이름을 찾을 수 없습니다: ' + name);
    targetRow = target.row; targetCol = target.signCol;
  }

  // 클라이언트가 보낸 좌표라도 현재 등록부를 기준으로 다시 확인합니다.
  // 표 전체를 읽는 대신 캐시된 목록을 쓰고, 서명 칸과 짝을 이루는 이름 셀 하나만 읽습니다.
  if (getTrainingList().indexOf(sheetName) === -1) throw new Error('서명 가능한 등록부가 아닙니다.');
  if (targetCol !== LEFT_SIGN_COL && targetCol !== RIGHT_SIGN_COL) throw new Error('서명할 수 없는 칸입니다.');
  const headerRow = findHeaderRow_(sheet);
  const mismatch = new Error('등록부 명단이 변경되었습니다. 연수를 다시 선택해 주세요.');
  if (headerRow === -1 || targetRow <= headerRow || targetRow > sheet.getLastRow()) throw mismatch;
  const nameCol = (targetCol === LEFT_SIGN_COL) ? LEFT_NAME_COL : RIGHT_NAME_COL;
  if (String(sheet.getRange(targetRow, nameCol).getValue()) !== String(name)) throw mismatch;
  if (typeof base64Png !== 'string' || !/^data:image\/png;base64,/.test(base64Png)) throw new Error('서명 이미지가 올바르지 않습니다.');
  // Keep old images until a replacement has been inserted successfully.
  const oldImages = sheet.getImages().filter(function(img) {
    const a = img.getAnchorCell();
    return a.getRow() === targetRow && a.getColumn() === targetCol;
  });

  const bytes = Utilities.base64Decode(base64Png.split(',').pop());
  const blob = Utilities.newBlob(bytes, 'image/png', name + '_서명.png');
  const image = sheet.insertImage(blob, targetCol, targetRow);

  // 클라이언트가 넘겨준 열너비/행높이를 그대로 사용 (없으면 안전하게 재조회)
  const w = width || sheet.getColumnWidth(targetCol);
  const h = height || sheet.getRowHeight(targetRow);
  image.setWidth(Math.max(20, w - 6)).setHeight(Math.max(14, h - 6));

  oldImages.forEach(function(img) { img.remove(); });
  // 완료 표시를 서명 칸에 남깁니다. 다음 명단 조회가 이미지를 읽지 않아도 되게 합니다.
  // 표시 형식을 함께 지정해, 이 방식을 쓰기 전에 만든 등록부에서도 값이 보이지 않게 합니다.
  const markCell = sheet.getRange(targetRow, targetCol);
  markCell.setNumberFormat(HIDDEN_FORMAT);
  markCell.setValue(SIGNED_MARK);

  savePersonalSignature(name, base64Png);
  return { success: true };
}

function savePersonalSignature(name, base64Png) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let store = ss.getSheetByName(SIGN_STORE_SHEET);
  if (!store) {
    store = ss.insertSheet(SIGN_STORE_SHEET);
    store.getRange(1, 1, 1, 2).setValues([['이름', '서명(base64)']]);
    store.hideSheet();
  }
  const last = store.getLastRow();
  const names = last > 1 ? store.getRange(2, 1, last - 1, 1).getValues() : [];
  for (let i = 0; i < names.length; i++) {
    if (String(names[i][0]) === String(name)) {
      store.getRange(i + 2, 2).setValue(base64Png);
      return;
    }
  }
  store.appendRow([name, base64Png]);
}
// Only changed cells are written. Validate every target before writing any cell.
function saveStaffChanges(changes) {
  if (!Array.isArray(changes) || !changes.length) throw new Error('변경사항이 없습니다.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const info = getMasterInfo();
    const current = getMasterStaffList();
    const seen = {};
    changes.forEach(function(c) {
      const person = current.find(function(s) { return s.row === c.row; });
      if (seen[c.row] || typeof c.active !== 'boolean' || typeof c.expected !== 'boolean' || !person ||
          String(person.name) !== c.name || String(person.dept || '') !== c.dept || person.active !== c.expected) {
        throw new Error('명단이 변경되었습니다. 새로고침한 뒤 다시 확인해 주세요.');
      }
      seen[c.row] = true;
    });
    [true, false].forEach(function(active) {
      const addresses = changes.filter(function(c) { return c.active === active; }).map(function(c) {
        return info.sheet.getRange(c.row, info.activeIdx + 1).getA1Notation();
      });
      if (addresses.length) info.sheet.getRangeList(addresses).setValue(active);
    });
    SpreadsheetApp.flush();
    return {success:true, count:changes.length};
  } finally { lock.releaseLock(); }
}
