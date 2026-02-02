#!/bin/bash

if [ -z "$1" ]; then
  echo "Usage: ./scripts/list_entries.sh <table_name> [limit] [--remote]"
  echo "Example: ./scripts/list_entries.sh users 5"
  exit 1
fi

TABLE=$1
LIMIT=20
ENV="--local"

# Start checking arguments from the second one
shift

for arg in "$@"; do
  if [ "$arg" == "--remote" ]; then
    ENV="--remote"
  elif [[ "$arg" =~ ^[0-9]+$ ]]; then
    LIMIT=$arg
  fi
done

if [ "$ENV" == "--remote" ]; then
    echo "Listing up to $LIMIT entries from '$TABLE' in family_blog_db (REMOTE)..."
else
    echo "Listing up to $LIMIT entries from '$TABLE' in family_blog_db (LOCAL)..."
fi

npx wrangler d1 execute family_blog_db $ENV --command "SELECT * FROM $TABLE LIMIT $LIMIT;"
