/**
 * Apps Script 웹앱 호출기.
 * Apps Script 안에서만 쓸 수 있는 google.script.run 을 대신합니다.
 *
 * Content-Type 을 text/plain 으로 보내는 이유:
 * 브라우저가 사전 요청(preflight)을 생략하는 조건이라, 응답 헤더를 직접 정할 수 없는
 * Apps Script 웹앱과도 다른 도메인에서 통신할 수 있습니다.
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'registerAdminToken';

  function endpoint() {
    var config = window.APP_CONFIG || {};
    return (config.appsScriptUrl || '').trim();
  }

  function storedToken() {
    try {
      return window.sessionStorage.getItem(TOKEN_KEY) || '';
    } catch (err) {
      return '';
    }
  }

  function callApi(action) {
    var args = Array.prototype.slice.call(arguments, 1);
    var url = endpoint();

    if (!url) {
      return Promise.reject(new Error('서버 주소가 설정되지 않았습니다. 배포 설정의 APPS_SCRIPT_URL을 확인해 주세요.'));
    }

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, args: args, token: storedToken() }),
      redirect: 'follow'
    }).catch(function () {
      throw new Error('서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.');
    }).then(function (response) {
      if (!response.ok) throw new Error('서버가 응답하지 않습니다. (' + response.status + ')');
      return response.text();
    }).then(function (text) {
      var data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        throw new Error('서버 응답을 읽지 못했습니다. Apps Script 배포의 액세스 권한이 "모든 사용자"인지 확인해 주세요.');
      }
      if (!data.ok) throw new Error(data.error || '알 수 없는 오류가 발생했습니다.');
      return data.result;
    });
  }

  function askAdminToken() {
    var config = window.APP_CONFIG || {};
    if (!config.requireAdminToken || storedToken()) return;
    var input = window.prompt('관리자 암호를 입력하세요.');
    if (!input) return;
    try {
      window.sessionStorage.setItem(TOKEN_KEY, input.trim());
    } catch (err) {
      window.alert('이 브라우저에서는 암호를 저장할 수 없습니다. 시크릿 모드를 끄고 다시 시도해 주세요.');
    }
  }

  window.callApi = callApi;
  window.askAdminToken = askAdminToken;
})();
