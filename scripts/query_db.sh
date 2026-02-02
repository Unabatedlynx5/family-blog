#!/bin/bash

if [ -z "$1" ]; then
  echo "Usage: ./scripts/query_db.sh <sql_query> [--remote]"
  echo "Example: ./scripts/query_db.sh \"SELECT * FROM users WHERE email='admin@example.com'\""
  exit 1
fi

QUERY=$1
ENV="--local"

if [ "$2" == "--remote" ]; then
  ENV="--remote"
fi

if [ "$ENV" == "--remote" ]; then
    echo "Executing query in family_blog_db (REMOTE)..."
else
    echo "Executing query in family_blog_db (LOCAL)..."
fi

npx wrangler d1 execute family_blog_db $ENV --command "$QUERY"
