---
name: cross-aggregate-constraints
description: >-
  ある rule が別の AI Native Note bounded context の確認を必要とするように見えるときに使う:
  note structure と memory、scheduler と context、context と operations、operation router と persistence、
  projection/read model に基づく command-side decision。
---

# Aggregate をまたぐ制約

最初に ../_shared/ai-native-note-bounded-contexts.md を読む。

## リポジトリ固有ルール

projection を command-side SoT にしない。AI-derived semantic units、generated docs、Superset tasks、read models は、owner contract が別途定めない限り evidence または projection である。

## 判断フロー

1. immediate consistency は本当に必要か。
2. どの context が invariant を所有するか。
3. command は自身の aggregate state だけで判断できるか。
4. 別 context が必要なら、それは precondition、snapshot、operation、eventual policy のどれか。
5. projection が stale だった場合に何が起きるか。

## 許可されるパターン

- Operation Router は bounded snapshot を使って target existence を確認する。
- Context Assembly は related semantic units を SoT ではなく context として使う。
- Scheduler は provider output を読むのではなく contextHash で dedupe する。
- Memory は active/pinned かつ source-backed の場合だけ context に入る。

## 拒否するもの

- full workspace dump を authoritative として扱う command logic。
- product behavior の判断に generated register/task status を使う。
- AI projection がそう示したという理由で user Blocks を直接書き換える。
- job/event/review state が適切な境界である場面で、多数の aggregate に synchronous check を行う。
