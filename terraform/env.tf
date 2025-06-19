locals {
  # path to your .env
  env_path = "${path.module}/.env"

  # if .env exists, read it; otherwise use empty
  existing_env = fileexists(local.env_path) ? file(local.env_path) : ""
}

resource "local_file" "env_append" {
  filename        = local.env_path
  file_permission = "0640"

  content = <<EOF
${local.existing_env != "" ? "${local.existing_env}\n" : ""}
ECR_REGISTRY=${aws_ecr_repository.vbrowsers.repository_url}
SECURITY_GROUP_ID=${aws_security_group.vbrowser_sg.id}
SUBNET_ID=${aws_subnet.public1.id}
AWS_ACCESS_KEY_ID=${aws_iam_access_key.vbrowser.id}
AWS_SECRET_ACCESS_KEY=${aws_iam_access_key.vbrowser.secret}
TF_VAR_ecs_execution_role_arn=${aws_iam_role.ecs_task_execution_role.arn}
TF_VAR_ecs_task_role_arn=${aws_iam_role.ecs_task_execution_role.arn}
EOF
}
