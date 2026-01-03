# AWS Configuration
aws_region = "us-east-1"

project_name = "vbrowser"
cluster_name = "vbrowsers"
common_tags = {
  Project     = "vbrowser"
  Environment = "optional"
  ManagedBy   = "terraform"
}

# Network Configuration
vpc_cidr = "10.0.0.0/16"
public_subnet_cidrs = [
  "10.0.0.0/24",
  "10.0.1.0/24"
]

# ECR Configuration
ecr_repository_name      = "vbrowsers"
ecr_image_tag_mutability = "MUTABLE" 
ecr_scan_on_push         = false

# IAM Configuration
iam_user_name       = "vbrowser-user"
ecs_task_role_name  = "ecsTaskRole"

# ECS Configuration
container_insights_enabled = false
capacity_providers = [
  "FARGATE",
  "FARGATE_SPOT"
]
default_capacity_provider = "FARGATE"

# Task Configuration - Add/remove browser images as needed
docker_images = [
  "chrome",
  "firefox",
  "edge", 
  "terminal",
  "remnux",
  "mullvad"
]

# Resource allocation per container
task_cpu       = "512"
task_memory    = "2048"
container_port = 443

# Logging Configuration
log_retention_days      = 30
log_driver             = "awslogs"
log_mode               = "non-blocking"
log_max_buffer_size    = "25m"

# Runtime Configuration
cpu_architecture        = "X86_64"
operating_system_family = "LINUX"

environment_variables = [
  { name = "PUID", value = "1000" },
  { name = "PGID", value = "1000" },
  { name = "TZ", value = "Etc/UTC" }
]

# SOCI Configuration
enable_soci_indexing   = true
soci_image_tag_filters = "*:*"