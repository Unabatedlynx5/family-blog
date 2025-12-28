#!/bin/bash

# Script to set up local development environment variables
# This generates secure secrets for local development

echo "=========================================="
echo "Family Blog - Local Development Setup"
echo "=========================================="
echo ""

# Check if .dev.vars already exists
if [ -f .dev.vars ]; then
    echo "⚠️  .dev.vars already exists!"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled. Existing .dev.vars preserved."
        exit 0
    fi
fi

# Generate secrets
echo "Generating secure secrets..."
JWT_SECRET=$(openssl rand -base64 32)
ADMIN_API_KEY=$(openssl rand -base64 32)

# Create .dev.vars file
cat > .dev.vars << EOF
# Development Environment Variables for Wrangler
# Auto-generated on $(date)
# DO NOT COMMIT THIS FILE

# JWT Secret for token signing
JWT_SECRET=$JWT_SECRET

# Admin API Key for creating users
ADMIN_API_KEY=$ADMIN_API_KEY

# Environment flag
ENVIRONMENT=development
EOF

echo "✅ Created .dev.vars"

# Create .env file
cat > .env << EOF
# Development Environment Variables for Astro
# Auto-generated on $(date)
# DO NOT COMMIT THIS FILE

# JWT Secret for token signing
JWT_SECRET=$JWT_SECRET

# Admin API Key for creating users
ADMIN_API_KEY=$ADMIN_API_KEY

# Environment flag
ENVIRONMENT=development
EOF

echo "✅ Created .env"
echo ""
echo "=========================================="
echo "✅ Local Development Setup Complete!"
echo "=========================================="
echo ""
echo "Your secrets:"
echo "  JWT_SECRET: ${JWT_SECRET:0:10}..."
echo "  ADMIN_API_KEY: ${ADMIN_API_KEY:0:10}..."
echo ""
echo "Files created:"
echo "  - .dev.vars (for wrangler dev)"
echo "  - .env (for astro dev)"
echo ""
echo "=========================================="
echo "NEXT STEPS:"
echo "=========================================="
echo ""
echo "1. Start the development server:"
echo "   npm run dev"
echo ""
echo "2. OR use Wrangler for full Cloudflare environment:"
echo "   npm run preview"
echo ""
echo "3. Create an admin user (after starting server):"
echo "   npm run seed:admin"
echo ""
echo "=========================================="
echo "PRODUCTION DEPLOYMENT:"
echo "=========================================="
echo ""
echo "For production, set these secrets in Cloudflare Dashboard:"
echo ""
echo "1. Go to: https://dash.cloudflare.com"
echo "2. Navigate to: Workers & Pages → family-blog → Settings → Variables"
echo "3. Add these as encrypted secrets:"
echo "   - JWT_SECRET (generate new with: openssl rand -base64 32)"
echo "   - ADMIN_API_KEY (generate new with: openssl rand -base64 32)"
echo "   - ENVIRONMENT=production"
echo ""
echo "⚠️  IMPORTANT: Use different secrets for production!"
echo ""
echo "    \"email\": \"admin@yourdomain.com\","
echo "    \"password\": \"your-secure-password\","
echo "    \"name\": \"Admin User\""
echo "  }'"
echo ""
echo "=========================================="
echo "IMPORTANT: Save these credentials securely!"
echo "=========================================="
echo ""
