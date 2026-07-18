# Pre-QA cleanup — 2026-07-10

Telegram order-notification code, configuration, scheduler registration, and its boot-validation case were removed. The untracked Telegram migration was already absent.

The development database no longer contains the `20260617_120000` migration record or its queue table, indexes, helper functions, or order triggers. A disposable restore of the cleaned development database verified **61 applied**, **0 pending**, and no recorded migration version absent from the 61 tracked migration files.

`npm test -- --runInBand` passed. The new backend baseline is **94 test suites / 394 tests** (Jest discovery plus expansion of its five parameterized test declarations). `npm run build` also passed.
