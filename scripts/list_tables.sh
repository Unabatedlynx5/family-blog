#!/bin/bash

# Default to local
ENV="--local"

# Check for --remote flag
if [ "$1" == "--remote" ]; then
  ENV="--remote"
  echo "Listing tables in family_blog_db (REMOTE)..."
else
  echo "Listing tables in family_blog_db (LOCAL)..."
fi

npx wrangler d1 execute family_blog_db $ENV --command "SELECT name FROM sqlite_schema WHERE type ='table' AND name NOT LIKE 'sqlite_%';"
