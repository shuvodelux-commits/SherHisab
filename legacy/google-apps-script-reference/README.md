# Google Apps Script ERP Legacy Reference

This directory stores read-only source snapshots of the legacy Google Apps Script ERP used as the behavioral reference while building SherHisab.

## Snapshots

### 2026-09-22

- Source repository: `shuvodelux-commits/sherERP_Mohim`
- Source branch: `main`
- Source commit: `a7fcd861235443460aaf6f629f444b42aa6d5868`
- Source commit date: `2026-09-22T06:02:06Z`
- Snapshot directory: `2026-09-22/`
- Source files copied: `231`
- Status: current reference snapshot

### 2026-09-21

- Source repository: `shuvodelux-commits/sherERP_Mohim`
- Source branch: `main`
- Source commit: `044ce2248aab62400a555e5ba4094744871b6598`
- Source commit date: `2026-09-20T14:15:59Z`
- Snapshot directory: `2026-09-21/`
- Source files copied: `219`
- Status: preserved historical snapshot

## Usage Rules

1. Treat every dated snapshot as read-only reference material.
2. Do not build the new SherHisab application inside these legacy directories.
3. Use the newest snapshot as the default behavioral reference unless a migration task specifically targets older behavior.
4. Compare migrated business behavior against the relevant snapshot and its tests.
5. Document intentional behavior changes in SherHisab decision/specification files.
6. When the legacy ERP changes again, create a new dated snapshot instead of modifying an existing snapshot.
