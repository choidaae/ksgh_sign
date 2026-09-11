#!/usr/bin/env node
/**
 * public/ 를 dist/ 로 복사하고, .env 값을 dist/config.js 로 만들어 넣습니다.
 * 의존성 없이 Node 18 이상에서 바로 실행됩니다.
 *
 * 주의: 여기서 넣는 값은 정적 파일에 그대로 담기므로 브라우저에서 볼 수 있습니다.
 * .env 는 값을 저장소 기록에서 빼두기 위한 것이지, 값을 숨겨주지는 않습니다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = __dirname;
const srcDir = path.join(root, 'public');
const outDir = path.join(root, 'dist');

function readEnv() {
  const env = Object.assign({}, process.env);
  const envFile = path.join(root, '.env');
  if (!fs.existsSync(envFile)) return env;

  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach((line) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) return;
    let value = match[2];
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    // 환경변수(GitHub Actions)가 이미 있으면 그 값을 우선합니다.
    if (!env[match[1]]) env[match[1]] = value;
  });
  return env;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

const env = readEnv();
const appsScriptUrl = (env.APPS_SCRIPT_URL || '').trim();

if (!appsScriptUrl) {
  console.error('APPS_SCRIPT_URL 값이 없습니다.');
  console.error('.env 파일을 만들거나(.env.example 참고) GitHub 저장소 시크릿에 등록해 주세요.');
  process.exit(1);
}
if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(appsScriptUrl)) {
  console.warn('경고: APPS_SCRIPT_URL 이 /exec 로 끝나는 배포 주소가 아닙니다. 개발용 /dev 주소는 외부에서 열리지 않습니다.');
}

fs.rmSync(outDir, { recursive: true, force: true });
copyDir(srcDir, outDir);

// 카카오톡·메신저 미리보기(og:image)는 상대 경로를 읽지 못해 전체 주소가 필요합니다.
// GitHub Actions 에서는 Pages 주소가 자동으로 들어오고, 로컬에서는 .env 의 SITE_URL 을 씁니다.
let siteUrl = (env.SITE_URL || '').trim();
if (siteUrl && !siteUrl.endsWith('/')) siteUrl += '/';

if (!siteUrl) {
  console.warn('경고: SITE_URL 이 없어 링크 미리보기 이미지가 표시되지 않습니다.');
} else if (!fs.existsSync(path.join(srcDir, 'sign_logo.png'))) {
  console.warn('경고: public/sign_logo.png 가 없습니다. 링크 미리보기 이미지가 표시되지 않습니다.');
}

for (const name of fs.readdirSync(outDir)) {
  if (!name.endsWith('.html')) continue;
  const file = path.join(outDir, name);
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes('{{SITE_URL}}')) {
    fs.writeFileSync(file, html.split('{{SITE_URL}}').join(siteUrl), 'utf8');
  }
}

const config = {
  appsScriptUrl: appsScriptUrl,
  spreadsheetId: (env.SPREADSHEET_ID || '').trim(),
  requireAdminToken: String(env.REQUIRE_ADMIN_TOKEN || '').toLowerCase() === 'true'
};

fs.writeFileSync(
  path.join(outDir, 'config.js'),
  '// 빌드할 때 자동으로 만들어집니다. 직접 고치지 마세요.\n' +
  'window.APP_CONFIG = ' + JSON.stringify(config, null, 2) + ';\n',
  'utf8'
);

// GitHub Pages 가 Jekyll 로 파일을 거르지 않게 합니다.
fs.writeFileSync(path.join(outDir, '.nojekyll'), '', 'utf8');

console.log('dist/ 생성 완료');
console.log('  서버 주소   : ' + appsScriptUrl);
console.log('  관리자 암호 : ' + (config.requireAdminToken ? '사용' : '사용 안 함'));
console.log('  사이트 주소 : ' + (siteUrl || '(미설정)'));
