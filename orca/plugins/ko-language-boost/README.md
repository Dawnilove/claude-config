# Korean Language Boost

> **주의 (2026-11-22):** 이 판(0.2.0, 차이 1,911개)은 그대로 쓰면 화면이 영어로 바뀐다. `setup.ps1`은 이 팩을 설치하지 않는다.
> - 언어 팩은 내장 `ko` 위에 합쳐지지 않는다. 별도 언어(`ko-x-orcapk-…`)로 등록되고, 팩에 없는 문구는 영어로 나온다.
> - Orca는 팩의 번역 비율이 80% 미만이면 고를 수 없게 한다 ("Incomplete").
> - 보호 문구(계정·보안·삭제 확인 등)는 팩이 바꿀 수 없다.
>
> 번역은 원본 Orca에 머지되었다 (stablyai/orca#46392, #46408, #46832, #46840). v1.4.269 다음 판부터 내장 "한국어"에 들어 있다. 그 판으로 업데이트하면 내장 "한국어"를 고르고 이 팩은 지운다 (`orca plugin uninstall local.ko-language-boost`).

그 전까지 팩이 필요하면 전체 목록판을 쓴다: 내장 한국어 + 빠진 문구를 모두 담고, 설치된 Orca 판의 키에 맞춘 판이다 (PR 작업 PC의 `C:\Users\KCCISTC\orca-ko-language-pack`, 0.2.3, 23,918개).

- 끄기: Settings > Appearance > Language를 내장 한국어로 되돌리거나, `orca plugin disable local.ko-language-boost`.
- Orca는 MIT 라이선스다. 번역 문구의 출처는 Orca의 `ko.json`이다.

```sh
orca plugin validate .
```
