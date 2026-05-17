# AI Native Note の context 境界

このリポジトリの DDD skill から参照する。

## 権威の順序

1. AGENTS.md は作業の入口を示す。
2. docs/contracts/** は policy、invariants、topology、scope を所有する。
3. contexts/*/src/contract/* は live product semantics を所有する。
4. docs/generated/**、Superset tasks、prompts、issues、PRs は projection または evidence である。
5. ai_native_note_requirements.md は input であり、implementation SoT ではない。

## プロダクト不変条件

- user-authored blocks が主要な source of truth である。
- AI-generated structure は projection である。
- app は内部 SoT として Markdown ではなく、app 固有の Note / Section / Block model を使う。
- H1/H2/H3 が section boundary を定義する。
- AI structuring は keystroke ごとに実行しない。
- AI は自由形式の構造出力ではなく operations を返す。
- Operation Router は unsafe operations を拒否する。
- Context Assembly は AI context を最小化し、full workspace dump を渡さない。
- Memory は source-backed projection であり、rejected/deleted memory は context に入らない。
- MVP は persistent AI chat、AI mode switcher、external integrations を除外する。

## Context 境界の対応表

| context | 所有 contract | live contract | 所有するもの | 所有してはいけないもの |
| --- | --- | --- | --- | --- |
| Note Model | docs/contracts/app-note-model.md | contexts/note-model/src/contract/noteContract.ts | Note、Section、Block、effective description、structural headings | AI policy、provider choice、UI styling |
| Scheduler | docs/contracts/ai-structuring-lifecycle.md | contexts/scheduler/src/contract/structureSchedulerContract.ts | dirty scope、allowed triggers、contextHash dedupe | BlockChanged での AI call、Operation schema |
| Context Assembly | docs/contracts/context-assembly.md | contexts/context-assembly/src/contract/contextEnvelopeContract.ts | bounded envelope、K limits、budget、untrusted content boundary | provider choice、operation routing、full workspace dump |
| Memory | docs/contracts/memory.md | contexts/memory/src/contract/memoryContract.ts | memory type、status、source provenance | hidden profiling、UI review design |
| AI Operations | docs/contracts/operation-return-contract.md | contexts/ai-operations/src/contract/operationContract.ts | operation taxonomy、source spans、confidence、policy classification | persistence mechanics、UI rendering |
| Operation Router | docs/contracts/operation-return-contract.md | contexts/ai-operations/src/contract/operationRouterContract.ts | schema/target/confidence check、audit record、安全な apply/propose/reject | 直接の DB/UI/provider call |
| Runtime | docs/contracts/cloudflare-agents-turso.md | 未実装部分あり | provider adapter、worker routing、Turso boundary | product policy |

## レビュー質問

- この rule はどの owner contract が所有するか。
- これは SoT、live contract、projection のどれか。
- 変更は許可された topology edge を越えているか。
- domain primitive は boundary 内で invalid になってよいか。
- aggregate/job/audit/envelope は identity と invariants が valid なときだけ存在するか。
- helper が sentinel ID や fake authority を黙って作っていないか。
- ある context が別 context の projection を SoT として読んでいないか。
- tests は domain/live-contract layer で invariants を直接証明しているか。
