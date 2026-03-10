# Google Cloud Run Deployment Script
# Run this from: underdogs-coach-finder/python-service/
# Requires: gcloud CLI installed and authenticated

$PROJECT_ID = "gen-lang-client-0293778787"
$REGION = "asia-northeast3"
$SERVICE_NAME = "underdogs-ai-backend"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$COACHES_DB = Join-Path $SCRIPT_DIR "../client/src/data/coaches_db.json"

Write-Host "Copying coaches_db.json into build context..."
Copy-Item -Path $COACHES_DB -Destination "$SCRIPT_DIR/coaches_db.json" -Force

Write-Host "Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

Write-Host "Enabling Cloud Run and Cloud Build APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

Write-Host "Deploying to Google Cloud Run..."
gcloud run deploy $SERVICE_NAME `
    --source $SCRIPT_DIR `
    --region $REGION `
    --platform managed `
    --allow-unauthenticated `
    --memory 512Mi `
    --set-env-vars="GOOGLE_API_KEY=$env:GOOGLE_API_KEY,PROJECT_ID=$PROJECT_ID"

Write-Host "Cleaning up temporary coaches_db.json..."
Remove-Item -Path "$SCRIPT_DIR/coaches_db.json" -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Deployment complete!"
Write-Host "Now set VITE_API_BASE_URL in Vercel dashboard to the Cloud Run service URL."
