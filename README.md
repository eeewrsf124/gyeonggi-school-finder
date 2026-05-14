# LFPY

`Let's Find the Place You want`의 약자로, 경기도 고등학교 공공데이터를 바탕으로 학생용 맞춤 추천을 보여주는 단일 페이지 프로젝트입니다.

## 구조
- `index.html` - 학생용 AI 학교 추천 화면
- `css/style.css` - 학생용 UI 스타일
- `js/dataParser.js` - CSV 파싱, 정제, 통학거리 계산
- `js/aiRecommend.js` - 가중치 기반 추천/설명 생성
- `js/tracker.js` - 선택적으로 사용할 수 있는 익명 세션 트래커
- `js/nationalHighSchools.js` - 전국 고등학교 `xls`에서 변환한 기본 데이터
- `data/high_schools.csv` - 공공데이터 샘플/기본 파일

## 핵심 아이디어
- 공공데이터는 학교명, 주소, 좌표, 설립구분, 학교급처럼 공개 가능한 항목만 사용합니다.
- 학생이 입력한 설립구분, 통학거리, 키워드를 점수화해서 상위 3개 학교를 추천합니다.
- 현재 위치는 브라우저 Geolocation으로 계산하고, 거리 평가는 Haversine 공식을 사용합니다.
- 질문은 버튼 선택과 텍스트 입력을 함께 지원해, 글자로 직접 답할 수 있습니다.

## 실행 흐름
1. `index.html`에서 공공데이터를 읽습니다.
2. 현재 위치가 허용되면 학교별 통학 거리를 계산합니다.
3. 설립구분, 최대 통학거리, 키워드로 점수를 계산해 추천 결과를 보여줍니다.
4. 필요한 경우 익명 세션만 기록하고, 학생 개인정보는 저장하지 않습니다.
5. GitHub 저장소에 푸시하면 Vercel이 정적 파일을 자동 배포합니다.

## 제출용 교육 공공데이터 활용 설명
대회 제출용 “교육 공공데이터 활용 설명”은 `SUBMISSION.md`에 정리되어 있습니다.

## 데이터 원칙
- 학생 개인정보는 저장하지 않습니다.
- 민감정보는 수집/게시하지 않습니다.
- 원본 공공데이터는 최소한의 공개 필드만 정제해 사용합니다.

## 참고
- 로컬 데모용 샘플 CSV는 `data/high_schools.csv`에 넣어두었습니다.
- 전국 고등학교 원본 `xls`는 `js/nationalHighSchools.js`로 변환해 `index.html`에서 바로 읽습니다.
- 실제 대회용 데이터는 같은 형식으로 더 많은 행을 추가해도 그대로 동작합니다.
- 원본 파일이 다른 열 이름을 써도 `scripts/prepare-high-schools.mjs`로 표준 형식 CSV를 만들 수 있습니다.
- 바로 열어볼 수 있는 단일 HTML 데모는 `index.html`입니다.

## CSV 정제 예시
```bash
node scripts/prepare-high-schools.mjs "data/high_schools_source.csv" "data/high_schools.csv"
```

## 자율형 오퍼레이터

로컬 자동화 브리지와 연결되는 프롬프트 기반 실행기는 `scripts/cursor-autonomy.mjs`에 있습니다.

```bash
node scripts/cursor-autonomy.mjs --prompt "browser: navigate https://example.com"
node scripts/cursor-autonomy.mjs --prompt "system: createFolder C:\\Temp\\CursorDemo" --dry-run
node scripts/cursor-autonomy.mjs --status
```

지원하는 기본 디렉티브는 다음과 같습니다.

- `browser: navigate <url>`
- `browser: click <selector>`
- `browser: fill <selector> = <value>`
- `system: createFolder <path>`
- `system: runCommand <command>`
- `ui: activateWindow <title>`
- `ui: keys <key combo>`
- Safe app launches such as `msedge` are allowlisted in `~/.cursor/automation/automation.json`.

## Persistent Memory

The operator reads and updates both global memory files under `~/.cursor/` and project-local memory files under `.cursor/`.

- `USER.md` stores durable user preferences and UI/UX style.
- `MEMORY.md` stores stable facts, decisions, workflows, and short run summaries.
- Repo-local memory overrides global memory when the two disagree.
