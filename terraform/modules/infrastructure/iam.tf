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
      # allow creation of any log-group
      {
        Effect   = "Allow"
        Action   = "logs:CreateLogGroup"
        Resource = "*"
      },
      # allow creating streams & pushing events only under /ecs/*
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/*:log-stream:*"
      }
    ]
  })
}

resource "aws_iam_user" "vbrowser" {
  name = var.iam_user_name
  path = var.iam_user_path

  tags = merge(var.common_tags, {
    Name = var.iam_user_name
  })
}

resource "aws_iam_access_key" "vbrowser" {
  user = aws_iam_user.vbrowser.name
}

resource "aws_iam_user_policy_attachment" "vbrowser_read_only" {
  user       = aws_iam_user.vbrowser.name
  policy_arn = var.aws_readonly_access_policy_arn
}

resource "aws_iam_user_policy" "vbrowser_ecr_push" {
  name = "${var.iam_user_name}-${var.ecr_policy_suffix}"
  user = aws_iam_user.vbrowser.name

  policy = jsonencode({
    Version = var.iam_policy_version
    Statement = [
      # allow login to ECR
      {
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*" 
      },
      # allow just the steps needed to push to your vbrowsers repo
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
        Resource = aws_ecr_repository.vbrowsers.arn
      }
    ]
  })
}

resource "aws_iam_user_policy" "vbrowser_ecs_task_defs" {
  name = "${var.iam_user_name}-${var.ecs_task_defs_policy_suffix}"
  user = aws_iam_user.vbrowser.name

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
        Resource = [
          "*"
        ]
      },
      {
        Sid    = "AllowPassExecutionRole"
        Effect = "Allow"
        Action = "iam:PassRole"
        Resource = [
          aws_iam_role.ecs_task_execution_role.arn
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
          aws_ecs_cluster.vbrowsers.arn,
          "arn:${data.aws_partition.current.partition}:ecs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:task-definition/*",
          "arn:${data.aws_partition.current.partition}:ecs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:task/${aws_ecs_cluster.vbrowsers.name}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_user_policy" "vbrowser_logs" {
  name = "${var.iam_user_name}-${var.logs_policy_suffix}"
  user = aws_iam_user.vbrowser.name

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
        # TagResource acts on the Log Group itself
        Resource = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/*"
      },
      {
        Sid    = "AllowCreateStreamsAndPutEventsForECS"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/*:log-stream:*"
      }
    ]
  })
}