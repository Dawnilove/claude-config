# Korean Language Boost

Orca(v1.4.268)의 한국어 화면에서 빠진 문구(전체의 약 22%)를 채우는 언어 팩이다. `locales/ko.json`에는 **내장 한국어에 없거나 다른 문구만** 들어 있다 (1,911개, 139KB). Orca는 팩을 내장 `ko` 위에 합치고 같은 키는 팩이 덮어쓴다. 전체 목록을 넣으면 내장 번역이 새 판에서 좋아져도 옛 값으로 덮어쓰므로 차이만 둔다.

- 설치: 승인이 필요 없다 (`orca plugin install <이 폴더>`). 설치한 뒤 Orca의 Settings > Appearance > Language에서 한국어(보강)를 고른다.
- 끄기: Language를 내장 한국어로 되돌리거나, `orca plugin disable local.ko-language-boost`.
- 같은 번역을 원본 Orca에 PR로 냈다 (stablyai/orca#46392, #46408). 병합되어 내장 한국어가 채워지면 이 팩은 지운다 (`orca plugin uninstall local.ko-language-boost`).
- 차이 1개는 오역 수정이다 ("사이트"가 "대지"로 번역된 곳).
- Orca는 MIT 라이선스다. 번역 문구의 출처는 Orca의 `ko.json`이다.
- 번역을 더 고치면 PR 작업 폴더의 결과를 다시 복사한다. 새 Orca 판에서는 차이를 다시 뽑는다 (내장 `ko.json`과 비교).

```sh
orca plugin validate .
```
