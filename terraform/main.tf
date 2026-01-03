module "infrastructure" {
  source = "./modules/infrastructure"

  aws_region   = var.aws_region
  project_name = var.project_name
  cluster_name = var.cluster_name

  vpc_cidr                    = var.vpc_cidr
  public_subnet_cidrs         = var.public_subnet_cidrs
  enable_dns_support          = var.enable_dns_support
  enable_dns_hostnames        = var.enable_dns_hostnames
  map_public_ip_on_launch     = var.map_public_ip_on_launch
  internet_gateway_route_cidr = var.internet_gateway_route_cidr

  security_group_description = var.security_group_description
  http_port                  = var.http_port
  https_port                 = var.https_port
  allowed_cidr_blocks        = var.allowed_cidr_blocks
  allowed_ipv6_cidr_blocks   = var.allowed_ipv6_cidr_blocks

  ecr_repository_name      = var.ecr_repository_name
  ecr_image_tag_mutability = var.ecr_image_tag_mutability
  ecr_scan_on_push         = var.ecr_scan_on_push
  ecr_force_delete         = var.ecr_force_delete

  iam_user_name                          = var.iam_user_name
  iam_user_path                          = var.iam_user_path
  ecs_task_role_name                     = var.ecs_task_role_name
  iam_policy_version                     = var.iam_policy_version
  ecs_service_principal                  = var.ecs_service_principal
  ecs_task_execution_policy_name         = var.ecs_task_execution_policy_name
  aws_ecs_task_execution_role_policy_arn = var.aws_ecs_task_execution_role_policy_arn
  aws_readonly_access_policy_arn         = var.aws_readonly_access_policy_arn
  ecr_policy_suffix                      = var.ecr_policy_suffix
  ecs_task_defs_policy_suffix            = var.ecs_task_defs_policy_suffix
  logs_policy_suffix                     = var.logs_policy_suffix

  container_insights_enabled = var.container_insights_enabled
  capacity_providers         = var.capacity_providers
  default_capacity_provider  = var.default_capacity_provider
  capacity_provider_weight   = var.capacity_provider_weight

  common_tags = var.common_tags
}

module "ecs_tasks" {
  source = "./modules/ecs_tasks"

  docker_images = var.docker_images
  aws_region    = var.aws_region
  project_name  = var.project_name

  ecr_registry           = module.infrastructure.ecr_repository_url
  ecs_task_role_arn      = module.infrastructure.ecs_task_execution_role_arn
  ecs_execution_role_arn = module.infrastructure.ecs_task_execution_role_arn

  task_cpu                 = var.task_cpu
  task_memory              = var.task_memory
  requires_compatibilities = var.requires_compatibilities
  network_mode             = var.network_mode
  cpu_architecture         = var.cpu_architecture
  operating_system_family  = var.operating_system_family

  container_port      = var.container_port
  container_essential = var.container_essential
  container_cpu       = var.container_cpu
  port_protocol       = var.port_protocol

  log_retention_days  = var.log_retention_days
  log_driver          = var.log_driver
  log_mode            = var.log_mode
  log_max_buffer_size = var.log_max_buffer_size
  log_stream_prefix   = var.log_stream_prefix

  environment_variables = var.environment_variables

  common_tags = var.common_tags
}

locals {
  env_path     = "${path.module}/.env"
  existing_env = fileexists(local.env_path) ? file(local.env_path) : ""
}

resource "local_file" "env_append" {
  filename        = local.env_path
  file_permission = "0640"

  content = <<EOF
${local.existing_env != "" ? "${local.existing_env}\n" : ""}
ECR_REGISTRY=${module.infrastructure.ecr_repository_url}
SECURITY_GROUP_ID=${module.infrastructure.security_group_id}
SUBNET_ID=${module.infrastructure.public_subnet_ids[0]}
AWS_ACCESS_KEY_ID=${module.infrastructure.vbrowser_user_access_key_id}
AWS_SECRET_ACCESS_KEY=${module.infrastructure.vbrowser_user_secret_access_key}
TF_VAR_ecs_execution_role_arn=${module.infrastructure.ecs_task_execution_role_arn}
TF_VAR_ecs_task_role_arn=${module.infrastructure.ecs_task_execution_role_arn}
EOF
}