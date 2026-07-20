# ── ECS Task Role ─────────────────────────────────────────────────────────────
# This role is assumed by the running container at runtime. It intentionally
# has no permissions — the vBrowser containers make no AWS API calls themselves.
# Add inline policies here if a browser image ever needs runtime AWS access.
resource "aws_iam_role" "ecs_task_role" {
  name = "${var.ecs_task_role_name}-task"

  assume_role_policy = jsonencode({
    Version = var.iam_policy_version
    Statement = [
      {
        Sid    = ""
        Effect = "Allow"
        Principal = {
          Service = var.ecs_service_principal
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = merge(var.common_tags, {
    Name = "${var.ecs_task_role_name}-task"
  })
}

# ── ECS Task Execution Role ────────────────────────────────────────────────────
# Used by the ECS agent (not the container) to pull images from ECR and write
# logs to CloudWatch. This is the role referenced in execution_role_arn.
resource "aws_iam_role" "ecs_task_execution_role" {
  name = var.ecs_task_role_name

  assume_role_policy = jsonencode({
    Version = var.iam_policy_version
    Statement = [
      {
        Sid    = ""
        Effect = "Allow"
        Principal = {
          Service = var.ecs_service_principal
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = merge(var.common_tags, {
    Name = var.ecs_task_role_name
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = var.aws_ecs_task_execution_role_policy_arn
}

resource "aws_iam_role_policy" "ecs_task_execution_logs" {
  name = var.ecs_task_execution_policy_name
  role = aws_iam_role.ecs_task_execution_role.id

  policy = jsonencode({
    Version = var.iam_policy_version
    Statement = [
      {
        Effect   = "Allow"
        Action   = "logs:CreateLogGroup"
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/*:log-stream:*"
      }
    ]
  })
}

resource "aws_iam_user" "ovb" {
  name = var.iam_user_name
  path = var.iam_user_path

  tags = merge(var.common_tags, {
    Name = var.iam_user_name
  })
}

resource "aws_iam_access_key" "ovb" {
  user = aws_iam_user.ovb.name
}

resource "aws_iam_user_policy_attachment" "ovb_read_only" {
  user       = aws_iam_user.ovb.name
  policy_arn = var.aws_readonly_access_policy_arn
}

resource "aws_iam_user_policy" "ovb_ecr_push" {
  name = "${var.iam_user_name}-${var.ecr_policy_suffix}"
  user = aws_iam_user.ovb.name

  policy = jsonencode({
    Version = var.iam_policy_version
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:DeleteRepository"
        ]
        Resource = aws_ecr_repository.browsers.arn
      }
    ]
  })
}

resource "aws_iam_user_policy" "ovb_ecs_task_defs" {
  name = "${var.iam_user_name}-${var.ecs_task_defs_policy_suffix}"
  user = aws_iam_user.ovb.name

  policy = jsonencode({
    Version = var.iam_policy_version
    Statement = [
      {
        Sid    = "AllowRegisterAndDescribe"
        Effect = "Allow"
        Action = [
          "ecs:RegisterTaskDefinition",
          "ecs:DescribeTaskDefinition",
          "ecs:DeregisterTaskDefinition"
        ]
        Resource = ["*"]
      },
      {
        Sid    = "AllowPassBothRoles"
        Effect = "Allow"
        Action = "iam:PassRole"
        Resource = [
          aws_iam_role.ecs_task_execution_role.arn,
          aws_iam_role.ecs_task_role.arn,
        ]
      },
      {
        Sid    = "AllowRunAndStopTasks"
        Effect = "Allow"
        Action = [
          "ecs:RunTask",
          "ecs:StopTask"
        ]
        Resource = [
          aws_ecs_cluster.browsers.arn,
          "arn:${data.aws_partition.current.partition}:ecs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:task-definition/*",
          "arn:${data.aws_partition.current.partition}:ecs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:task/${aws_ecs_cluster.browsers.name}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_user_policy" "ovb_logs" {
  name = "${var.iam_user_name}-${var.logs_policy_suffix}"
  user = aws_iam_user.ovb.name

  policy = jsonencode({
    Version = var.iam_policy_version
    Statement = [
      {
        Sid    = "AllowCreateAndTagLogGroups"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:TagResource",
          "logs:PutRetentionPolicy",
          "logs:DeleteLogGroup"
        ]
        Resource = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/*"
      },
      {
        Sid    = "AllowCreateStreamsAndPutEventsForECS"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/*:log-stream:*"
      }
    ]
  })
}
