$env:DB_NAME="recoverlab_crm"
$env:DB_USER="postgres"
$env:DB_PASSWORD="dhari@2006"
$env:JWT_SECRET="dev-secret-key-recoverlab-crm-2025"
$env:PORT=5001
$env:NODE_ENV="development"
npx nodemon src/index.js
