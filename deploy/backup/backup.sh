#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${RESTIC_ENV_FILE:-/opt/subslush/deploy/backup/restic.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

: "${RESTIC_REPOSITORY?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD?RESTIC_PASSWORD is required}"
: "${BACKUP_PATHS?BACKUP_PATHS is required}"

restic backup ${BACKUP_PATHS}
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
restic check --read-data-subset=5%
