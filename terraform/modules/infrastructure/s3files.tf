# ─── S3 Files (persistent storage) ────────────────────────────────────────────
# Shared file system backed by S3. One file system + one mount target per AZ.
# Per-workspace access points are created at runtime by the backend (boto3).

resource "aws_s3_bucket" "s3files" {
  bucket_prefix = "${var.project_name}-s3files-"
  force_destroy = true

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-s3files"
  })
}

resource "aws_s3_bucket_ownership_controls" "s3files" {
  bucket = aws_s3_bucket.s3files.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_versioning" "s3files" {
  bucket = aws_s3_bucket.s3files.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "s3files" {
  bucket = aws_s3_bucket.s3files.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# ─── IAM Role for S3 Files (assumed by the file system to access S3) ──────────
# S3 Files is built on EFS — the service principal is elasticfilesystem.amazonaws.com
resource "aws_iam_role" "s3files_fs" {
  name = "${var.project_name}-s3files-fs-role"

  assume_role_policy = jsonencode({
    Version = var.iam_policy_version
    Statement = [
      {
        Sid    = "AllowS3FilesAssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "elasticfilesystem.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
          ArnLike = {
            "aws:SourceArn" = "arn:${data.aws_partition.current.partition}:s3files:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:file-system/*"
          }
        }
      }
    ]
  })

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-s3files-fs-role"
  })
}

resource "aws_iam_role_policy" "s3files_fs" {
  name = "${var.project_name}-s3files-fs-s3-access"
  role = aws_iam_role.s3files_fs.id

  policy = jsonencode({
    Version = var.iam_policy_version
    Statement = [
      {
        Sid    = "S3BucketPermissions"
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:ListBucketVersions"
        ]
        Resource = aws_s3_bucket.s3files.arn
        Condition = {
          StringEquals = {
            "aws:ResourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
      {
        Sid    = "S3ObjectPermissions"
        Effect = "Allow"
        Action = [
          "s3:AbortMultipartUpload",
          "s3:DeleteObject*",
          "s3:GetObject*",
          "s3:List*",
          "s3:PutObject*"
        ]
        Resource = "${aws_s3_bucket.s3files.arn}/*"
        Condition = {
          StringEquals = {
            "aws:ResourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
      {
        Sid    = "EventBridgeManage"
        Effect = "Allow"
        Action = [
          "events:DeleteRule",
          "events:DisableRule",
          "events:EnableRule",
          "events:PutRule",
          "events:PutTargets",
          "events:RemoveTargets"
        ]
        Condition = {
          StringEquals = {
            "events:ManagedBy" = "elasticfilesystem.amazonaws.com"
          }
        }
        Resource = [
          "arn:aws:events:*:*:rule/DO-NOT-DELETE-S3-Files*"
        ]
      },
      {
        Sid    = "EventBridgeRead"
        Effect = "Allow"
        Action = [
          "events:DescribeRule",
          "events:ListRuleNamesByTarget",
          "events:ListRules",
          "events:ListTargetsByRule"
        ]
        Resource = [
          "arn:aws:events:*:*:rule/*"
        ]
      }
    ]
  })
}

# ─── S3 Files File System ─────────────────────────────────────────────────────

resource "aws_s3files_file_system" "main" {
  bucket                = aws_s3_bucket.s3files.arn
  role_arn              = aws_iam_role.s3files_fs.arn
  accept_bucket_warning = true

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-s3files"
  })
}

# ─── Mount Target (network access in the first public subnet's AZ) ────────────
# S3 Files mount targets are per-AZ. The launch subnet (public_subnet_ids[0])
# is where ECS tasks run, so the mount target goes in the same AZ.

resource "aws_security_group" "s3files_mount_target" {
  name        = "${var.project_name}-s3files-mt-sg"
  description = "Allow NFS from VPC for S3 Files mount target"
  vpc_id      = aws_vpc.ovb.id

  ingress {
    description = "NFS from VPC"
    from_port   = 2049
    to_port     = 2049
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-s3files-mt-sg"
  })
}

resource "aws_s3files_mount_target" "main" {
  file_system_id  = aws_s3files_file_system.main.id
  subnet_id       = aws_subnet.public[0].id
  security_groups = [aws_security_group.s3files_mount_target.id]
}

# ─── ECS Task Role: s3files permissions (mandatory for s3files volumes) ───────
# Added to the existing ecs_task_role so ALL task definitions (including ad-hoc
# ones registered by the backend) can mount S3 Files volumes.

resource "aws_iam_role_policy" "ecs_task_s3files" {
  name = "${var.project_name}-ecs-task-s3files"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = var.iam_policy_version
    Statement = [
      {
        Sid    = "S3FilesClientAccess"
        Effect = "Allow"
        Action = [
          "s3files:ClientMount",
          "s3files:ClientWrite",
          "s3files:DescribeFileSystem",
          "s3files:DescribeMountTarget",
          "s3files:DescribeAccessPoint"
        ]
        Resource = [
          aws_s3files_file_system.main.arn,
          "arn:${data.aws_partition.current.partition}:s3files:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:file-system/${aws_s3files_file_system.main.id}",
          "arn:${data.aws_partition.current.partition}:s3files:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:mount-target/*",
          "arn:${data.aws_partition.current.partition}:s3files:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:access-point/*"
        ]
      },
      {
        Sid    = "S3ObjectReadAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ]
        Resource = "${aws_s3_bucket.s3files.arn}/*"
      },
      {
        Sid    = "S3BucketListAccess"
        Effect = "Allow"
        Action = "s3:ListBucket"
        Resource = aws_s3_bucket.s3files.arn
      }
    ]
  })
}

# Backend IAM permissions for S3 Files access point management are merged into
# the ovb_ecs_task_defs user policy in iam.tf to stay under the 2048-byte
# inline policy limit.

