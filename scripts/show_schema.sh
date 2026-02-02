#!/bin/bash

if [ -z "$1" ]; then
  echo "Usage: ./scripts/show_schema.sh <table_name> [--remote]"
  exit 1
fi

TABLE=$1
ENV="--local"

if [ "$2" == "--remote" ]; then
  ENV="--remote"
fi

if [ "$ENV" == "--remote" ]; then
    echo "Showing schema for table '$TABLE' in family_blog_db (REMOTE)..."
else
    echo "Showing schema for table '$TABLE' in family_blog_db (LOCAL)..."
fi

npx wrangler d1 execute family_blog_db $ENV --command "PRAGMA table_info($TABLE);"
