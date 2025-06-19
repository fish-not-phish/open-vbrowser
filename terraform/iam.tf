resource "aws_iam_user" "vbrowser" {
  name = "vbrowser-user"
  path = "/"
}

resource "aws_iam_access_key" "vbrowser" {
  user = aws_iam_user.vbrowser.name
}

resource "aws_iam_user_policy_attachment" "vbrowser_read_only" {
  user       = aws_iam_user.vbrowser.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

data "aws_partition" "current" {}

resource "aws_iam_user_policy" "vbrowser_ecr_push" {
  name = "vbrowser-ecr-push"
  user = aws_iam_user.vbrowser.name

  policy = jsonencode({
    Version = "2012-10-17"
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
  name = "vbrowser-ecs-task-definitions"
  user = aws_iam_user.vbrowser.name

  policy = jsonencode({
    Version = "2012-10-17"
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
  name = "vbrowser-logs"
  user = aws_iam_user.vbrowser.name

  policy = jsonencode({
    Version = "2012-10-17"
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



output "vbrowser_user_access_key_id" {
  description = "Access Key ID for the vbrowser-user"
  value       = aws_iam_access_key.vbrowser.id
}

output "vbrowser_user_secret_access_key" {
  description = "Secret Access Key for the vbrowser-user"
  value       = aws_iam_access_key.vbrowser.secret
  sensitive   = true
}
