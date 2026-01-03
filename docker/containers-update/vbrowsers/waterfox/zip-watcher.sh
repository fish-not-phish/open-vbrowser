#!/bin/bash

WATCH_DIR="/config/Downloads"

echo "[zip-watcher] Monitoring $WATCH_DIR for new files or folders..."

inotifywait -m -e close_write,moved_to,create "$WATCH_DIR" --format "%f" | while read FILENAME; do
  FILEPATH="$WATCH_DIR/$FILENAME"

  if [[ "$FILENAME" == .* || "$FILENAME" == *.tmp || "$FILENAME" == *.part || "$FILENAME" == *.crdownload ]]; then
    echo "[zip-watcher] Skipping temp or hidden file: $FILENAME"
    continue
  fi

  # Skip if already a .7z or marked as -DOWNLOADED
 if [[ "$FILENAME" =~ -DOWNLOADED(\.7z)?$ ]]; then
    echo "[zip-watcher] Skipping already-archived: $FILENAME"
    continue
  fi

  # Wait a bit to ensure file is fully written
  sleep 2

  # Remove extension and add suffix
  NAME_WITHOUT_EXT="${FILENAME%.*}"
  EXT="${FILENAME##*.}"

  if [[ "$FILENAME" == "$EXT" ]]; then
    NAME_WITHOUT_EXT="$FILENAME"  # No extension
    EXT=""
  fi

  # Final archive name
  ARCHIVE_NAME="${NAME_WITHOUT_EXT}-DOWNLOADED.7z"
  ARCHIVE_PATH="$WATCH_DIR/$ARCHIVE_NAME"

  echo "[zip-watcher] Archiving $FILENAME → $ARCHIVE_NAME"

  7z a -t7z -p"infected" -mhe=on "$ARCHIVE_PATH" "$FILEPATH"

  if [ $? -eq 0 ]; then
    echo "[zip-watcher] ✅ Successfully archived: $ARCHIVE_NAME"
    rm -rf "$FILEPATH"
  else
    echo "[zip-watcher] ❌ Failed to archive: $FILENAME"
  fi
done
