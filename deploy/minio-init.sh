#!/bin/sh
set -eu

: "${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY is required}"
: "${S3_BUCKET:?S3_BUCKET is required}"
BACKUP_STORAGE_BUCKET="${BACKUP_STORAGE_BUCKET:-$S3_BUCKET}"

mc alias set brisabase-minio http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb --ignore-existing "brisabase-minio/$S3_BUCKET"
mc mb --ignore-existing "brisabase-minio/$BACKUP_STORAGE_BUCKET"

POLICY_FILE="/tmp/brisabase-app-policy.json"
cat > "$POLICY_FILE" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:ListBucket", "s3:ListBucketMultipartUploads"],
      "Resource": ["arn:aws:s3:::$S3_BUCKET", "arn:aws:s3:::$BACKUP_STORAGE_BUCKET"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListMultipartUploadParts", "s3:AbortMultipartUpload"],
      "Resource": ["arn:aws:s3:::$S3_BUCKET/*", "arn:aws:s3:::$BACKUP_STORAGE_BUCKET/*"]
    }
  ]
}
JSON

mc admin policy create brisabase-minio brisabase-app "$POLICY_FILE" >/dev/null 2>&1 || true
mc admin user add brisabase-minio "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null 2>&1 || \
  mc admin user enable brisabase-minio "$S3_ACCESS_KEY" >/dev/null
mc admin policy attach brisabase-minio brisabase-app --user "$S3_ACCESS_KEY"
